import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de Pastas
const STORAGE_DIR = path.join(__dirname, 'storage', 'clients');
const DB_PATH = path.join(__dirname, 'leads.db');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Inicialização do Banco de Dados SQLite Local
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    area TEXT NOT NULL,
    message TEXT,
    files TEXT,
    status TEXT DEFAULT 'Novo'
  );
`);

// Função para gerar o próximo ID do cliente: JA-2026-0001
function generateNextClientId() {
  const currentYear = new Date().getFullYear();
  const prefix = `JA-${currentYear}-`;
  
  const stmt = db.prepare(`
    SELECT id FROM leads 
    WHERE id LIKE ? 
    ORDER BY id DESC 
    LIMIT 1
  `);
  
  const lastRecord = stmt.get(`${prefix}%`);
  
  if (!lastRecord || !lastRecord.id) {
    return `${prefix}0001`;
  }
  
  const lastNumberStr = lastRecord.id.replace(prefix, '');
  const nextNum = parseInt(lastNumberStr, 10) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

// Configuração do Multer para armazenamento em ficheiro individual do cliente
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.clientId) {
      req.clientId = generateNextClientId();
    }
    const clientFolder = path.join(STORAGE_DIR, req.clientId);
    if (!fs.existsSync(clientFolder)) {
      fs.mkdirSync(clientFolder, { recursive: true });
    }
    cb(null, clientFolder);
  },
  filename: (req, file, cb) => {
    // Sanitiza o nome do arquivo
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    cb(null, `${timestamp}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB por arquivo
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota para Download/Acesso Seguro aos Ficheiros dos Clientes
app.use('/storage/clients', express.static(STORAGE_DIR));

// Rota da Página Principal e Painel de Controle
app.use(express.static(__dirname));

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'painel.html'));
});

app.get('/admin', (req, res) => {
  res.redirect('/painel');
});

// ================= ROTAS DE API =================

/**
 * 1. POST /api/leads - Cadastro de Cliente, Salvamento no Banco e Ficheiro de Arquivos
 */
app.post('/api/leads', (req, res, next) => {
  // Gera o ID do cliente antes do multer processar os arquivos
  req.clientId = generateNextClientId();
  next();
}, upload.array('documents', 10), (req, res) => {
  try {
    const { name, phone, area, message } = req.body;
    const clientId = req.clientId;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
    }

    const filesInfo = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      url: `/storage/clients/${clientId}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const createdAt = new Date().toISOString();
    const filesJson = JSON.stringify(filesInfo);

    const insertStmt = db.prepare(`
      INSERT INTO leads (id, created_at, name, phone, area, message, files, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Novo')
    `);

    insertStmt.run(
      clientId,
      createdAt,
      name.trim(),
      phone.trim(),
      area || 'Não especificado',
      message ? message.trim() : '',
      filesJson
    );

    console.log(`[SUCESSO] Novo lead registrado: Protocolo #${clientId} - ${name} (${filesInfo.length} arquivo(s))`);

    return res.status(201).json({
      success: true,
      clientId,
      message: 'Dados e documentação salvos com sucesso no servidor.',
      filesCount: filesInfo.length,
      createdAt
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar lead:', error);
    return res.status(500).json({ error: 'Erro interno ao salvar no banco de dados.' });
  }
});

/**
 * 2. GET /api/leads - Listagem de Leads para o Painel do Dr. Jorge Alvim
 */
app.get('/api/leads', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, created_at, name, phone, area, message, files, status
      FROM leads
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all();
    const leads = rows.map(row => ({
      ...row,
      files: row.files ? JSON.parse(row.files) : []
    }));

    return res.json({ success: true, leads });
  } catch (error) {
    console.error('[ERRO] Falha ao listar leads:', error);
    return res.status(500).json({ error: 'Erro ao consultar banco de dados.' });
  }
});

/**
 * 3. PATCH /api/leads/:id/status - Atualização de Status
 */
app.patch('/api/leads/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Novo', 'Em Atendimento', 'Concluído', 'Arquivado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const stmt = db.prepare(`UPDATE leads SET status = ? WHERE id = ?`);
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    return res.json({ success: true, message: 'Status atualizado com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar status:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/**
 * 4. DELETE /api/leads/:id - Exclusão de Lead e Ficheiro
 */
app.delete('/api/leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove do banco
    const stmt = db.prepare(`DELETE FROM leads WHERE id = ?`);
    const result = stmt.run(id);

    // Remove a pasta física do ficheiro se existir
    const clientFolder = path.join(STORAGE_DIR, id);
    if (fs.existsSync(clientFolder)) {
      fs.rmSync(clientFolder, { recursive: true, force: true });
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    return res.json({ success: true, message: 'Registro e ficheiro excluídos com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir lead:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Inicialização do Servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🏛️  Servidor Jorge Alvim Advocacia Ativo!`);
  console.log(`🌐  Site Oficial:    http://localhost:${PORT}`);
  console.log(`📊  Painel Clientes: http://localhost:${PORT}/painel`);
  console.log(`🗄️  Banco SQLite:    leads.db`);
  console.log(`📁  Ficheiros:       storage/clients/`);
  console.log(`====================================================`);
});
