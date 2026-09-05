/**
 * Módulo DRIVE do escritório (arquivos digitais) — extraído do server.js.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { uploadDrive } from '../../middleware/upload.js';
import { STORAGE_DRIVE_DIR } from '../../config/constants.js';

export const driveRouter = express.Router();

// Gerador de ID para Documentos do Drive: DOC-2026-0001
function generateNextDriveDocId() {
  const currentYear = new Date().getFullYear();
  const prefix = `DOC-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM office_drive_files`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM office_drive_files WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// ================= ROTAS DO DRIVE DO ESCRITÓRIO (ARQUIVO DIGITAL & DOCUMENTOS) =================

// 1. GET /api/drive/files - Listar documentos com filtro por pasta ou busca por título
driveRouter.get('/api/drive/files', requireAuth, (req, res) => {
  try {
    const { folder, search } = req.query;
    let query = `SELECT * FROM office_drive_files WHERE 1=1`;
    const params = [];

    if (folder && folder.trim() && folder.trim() !== 'Todas') {
      query += ` AND folder = ?`;
      params.push(folder.trim());
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (title LIKE ? OR filename LIKE ? OR notes LIKE ? OR uploaded_by LIKE ?)`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY created_at DESC`;
    const files = db.prepare(query).all(...params);

    const foldersCount = db.prepare(`
      SELECT folder, COUNT(*) as count FROM office_drive_files GROUP BY folder
    `).all();

    const totalSizeRes = db.prepare(`SELECT SUM(file_size) as total_size FROM office_drive_files`).get();
    const totalSize = totalSizeRes ? (totalSizeRes.total_size || 0) : 0;

    return res.json({
      success: true,
      files,
      foldersCount,
      totalSize
    });
  } catch (error) {
    console.error('[DRIVE] Erro ao listar arquivos do drive:', error);
    return res.status(500).json({ error: 'Erro ao listar documentos do drive.' });
  }
});

// 2. POST /api/drive/upload - Upload de novo documento para o drive
driveRouter.post('/api/drive/upload', requireAuth, uploadDrive.array('drive_files', 20), (req, res) => {
  try {
    const { folder = 'Geral', title, notes } = req.body;
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um arquivo para fazer upload.' });
    }

    const now = new Date().toISOString();
    const uploader = req.user ? req.user.name : 'Administrador';
    const insertedDocs = [];

    const insertStmt = db.prepare(`
      INSERT INTO office_drive_files (
        id, folder, title, filename, file_path, file_size, file_type, uploaded_by, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    uploadedFiles.forEach((file) => {
      const docId = generateNextDriveDocId();
      const docTitle = (uploadedFiles.length === 1 && title && title.trim())
        ? title.trim()
        : file.originalname;
      const fileUrl = `/storage/office_drive/${file.filename}`;
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

      insertStmt.run(
        docId,
        folder.trim(),
        docTitle,
        file.filename,
        fileUrl,
        file.size,
        ext || file.mimetype,
        uploader,
        notes ? notes.trim() : '',
        now,
        now
      );

      insertedDocs.push({ id: docId, title: docTitle, fileUrl });
    });

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'UPLOAD_DOCUMENTO_DRIVE',
      module: 'DRIVE',
      description: `${uploadedFiles.length} documento(s) enviado(s) para a pasta '${folder}'.`
    });

    return res.json({
      success: true,
      message: `${uploadedFiles.length} documento(s) adicionado(s) ao Drive com sucesso!`,
      insertedDocs
    });
  } catch (error) {
    console.error('[DRIVE] Erro ao salvar arquivo no drive:', error);
    return res.status(500).json({ error: 'Erro ao realizar upload do documento.' });
  }
});

// 3. PUT /api/drive/files/:id - Editar informações do documento
driveRouter.put('/api/drive/files/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, folder, notes } = req.body;

    const existing = db.prepare(`SELECT * FROM office_drive_files WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE office_drive_files
      SET title = ?, folder = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title ? title.trim() : existing.title,
      folder ? folder.trim() : existing.folder,
      notes !== undefined ? notes.trim() : existing.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_DOCUMENTO_DRIVE',
      module: 'DRIVE',
      resource_id: id,
      description: `Alteração dos dados do documento '${title || existing.title}' (#${id}).`
    });

    return res.json({ success: true, message: 'Documento atualizado com sucesso!' });
  } catch (error) {
    console.error('[DRIVE] Erro ao atualizar documento:', error);
    return res.status(500).json({ error: 'Erro ao atualizar documento.' });
  }
});

// 4. DELETE /api/drive/files/:id - Excluir documento do drive e do disco
driveRouter.delete('/api/drive/files/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM office_drive_files WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    db.prepare(`DELETE FROM office_drive_files WHERE id = ?`).run(id);

    const diskPath = path.join(STORAGE_DRIVE_DIR, existing.filename);
    if (fs.existsSync(diskPath)) {
      try { fs.unlinkSync(diskPath); } catch (e) {}
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_DOCUMENTO_DRIVE',
      module: 'DRIVE',
      resource_id: id,
      description: `Exclusão do documento '${existing.title}' (#${id}) do Drive do Escritório.`
    });

    return res.json({ success: true, message: 'Documento excluído com sucesso!' });
  } catch (error) {
    console.error('[DRIVE] Erro ao excluir documento:', error);
    return res.status(500).json({ error: 'Erro ao excluir documento.' });
  }
});
