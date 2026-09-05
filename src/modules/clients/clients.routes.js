/**
 * Módulo CLIENTES (clients) — cadastro, contratos, importação, documentos. Extraído do server.js.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { uploadClientDoc } from '../../middleware/upload.js';
import { STORAGE_DIR } from '../../config/constants.js';
import { generateNextClientFullId, generateNextClientId } from '../../shared/ids.js';
import { hashPassword } from '../../shared/password-crypto.js';

export const clientsRouter = express.Router();

/**
 * 1. GET /api/clients - Listar todos os clientes cadastrados com contratos
 */
clientsRouter.get('/api/clients', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM clients 
      ORDER BY created_at DESC
    `).all();

    const clients = rows.map(c => ({
      ...c,
      files: c.files ? JSON.parse(c.files) : []
    }));

    return res.json({ success: true, clients });
  } catch (error) {
    console.error('[ERRO] Falha ao listar clientes:', error);
    return res.status(500).json({ error: 'Erro ao consultar clientes.' });
  }
});

/**
 * 1.1 GET /api/clients/:id - Buscar cliente individual por ID
 */
clientsRouter.get('/api/clients/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    client.files = client.files ? JSON.parse(client.files) : [];
    return res.json({ success: true, client });
  } catch (error) {
    console.error('[ERRO] Falha ao consultar cliente por ID:', error);
    return res.status(500).json({ error: 'Erro ao consultar cliente.' });
  }
});

/**
 * 2. POST /api/clients - Cadastrar novo cliente completo + contrato com upload de documentos
 */
// Importação em massa de clientes (CSV → linhas normalizadas no frontend).
clientsRouter.post('/api/clients/import', requireAuth, (req, res) => {
  try {
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha para importar.' });
    if (rows.length > 2000) return res.status(400).json({ error: 'Limite de 2000 clientes por importação.' });
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO clients (
        id, client_type, full_name, cpf, rg, cnpj, street, number, neighborhood, city, state, cep,
        email, phone, nationality, marital_status, profession,
        contract_value, installments_count, installment_value, amount_paid, balance_due, contract_status,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?)
    `);
    let imported = 0; const errors = [];
    db.exec('BEGIN');
    try {
      rows.forEach((r, i) => {
        const name = (r.full_name || '').toString().trim();
        const phone = (r.phone || '').toString().trim();
        if (!name || !phone) { errors.push({ linha: i + 1, motivo: 'Nome e telefone são obrigatórios' }); return; }
        const cnpj = (r.cnpj || '').toString().trim();
        const cValue = parseFloat(String(r.contract_value || '').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
        const aPaid = parseFloat(String(r.amount_paid || '').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
        const instCount = parseInt(r.installments_count, 10) || 1;
        stmt.run(
          generateNextClientFullId(),
          (r.client_type || (cnpj ? 'PJ' : 'PF')),
          name,
          (r.cpf || '').toString().trim(),
          (r.rg || '').toString().trim(),
          cnpj,
          (r.street || '').toString().trim(),
          (r.number || '').toString().trim(),
          (r.neighborhood || '').toString().trim(),
          (r.city || '').toString().trim(),
          (r.state || 'MG').toString().trim(),
          (r.cep || '').toString().trim(),
          (r.email || '').toString().trim(),
          phone,
          (r.nationality || 'brasileiro(a)').toString().trim(),
          (r.marital_status || 'solteiro(a)').toString().trim(),
          (r.profession || '').toString().trim(),
          cValue, instCount, (cValue > 0 && instCount > 0 ? cValue / instCount : 0), aPaid, Math.max(0, cValue - aPaid),
          (r.contract_status || 'Ativo').toString().trim(),
          now, now
        );
        imported++;
      });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    logAudit(req, { event_type: 'CRIACAO', event_name: 'IMPORTAR_CLIENTES', module: 'CLIENTES',
      description: `Importação em massa: ${imported} cliente(s) inserido(s), ${errors.length} ignorado(s).` });
    return res.json({ success: true, imported, errors });
  } catch (error) {
    console.error('[ERRO] Falha na importação de clientes:', error);
    return res.status(500).json({ error: 'Erro na importação: ' + error.message });
  }
});

clientsRouter.post('/api/clients', requireAuth, (req, res, next) => {
  req.clientId = generateNextClientFullId();
  next();
}, uploadClientDoc.array('documents', 20), (req, res) => {
  try {
    const clientId = req.clientId;
    const {
      client_type,
      full_name,
      cpf,
      rg,
      cnpj,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      email,
      phone,
      social_media,
      website,
      google_business,
      
      // Qualificação Civil (para Procuração e Contratos)
      nationality,
      marital_status,
      profession,
      
      // Representante Legal
      rep_name,
      rep_cpf,
      rep_rg,
      rep_street,
      rep_number,
      rep_neighborhood,
      rep_city,
      rep_state,
      rep_cep,
      rep_complement,
      
      // Contrato
      contract_value,
      installments_count,
      installment_value,
      due_date,
      amount_paid,
      invoice_number,
      contract_status
    } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({ error: 'Nome completo e telefone são obrigatórios.' });
    }

    const cValue = parseFloat(contract_value) || 0;
    const aPaid = parseFloat(amount_paid) || 0;
    const instCount = parseInt(installments_count, 10) || 1;
    const instValue = parseFloat(installment_value) || (instCount > 0 ? (cValue / instCount) : 0);
    const balDue = Math.max(0, cValue - aPaid);

    const filesInfo = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      url: `/storage/clients/${clientId}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO clients (
        id, client_type, full_name, cpf, rg, cnpj,
        street, number, neighborhood, city, state, cep, complement,
        filiation_father, filiation_mother, email, phone, social_media, website, google_business,
        nationality, marital_status, profession,
        rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
        contract_value, installments_count, installment_value, due_date, amount_paid, balance_due, invoice_number, contract_status,
        files, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    insertStmt.run(
      clientId,
      client_type || 'PF',
      full_name.trim(),
      cpf ? cpf.trim() : '',
      rg ? rg.trim() : '',
      cnpj ? cnpj.trim() : '',
      street ? street.trim() : '',
      number ? number.trim() : '',
      neighborhood ? neighborhood.trim() : '',
      city ? city.trim() : '',
      state ? state.trim() : 'MG',
      cep ? cep.trim() : '',
      complement ? complement.trim() : '',
      filiation_father ? filiation_father.trim() : '',
      filiation_mother ? filiation_mother.trim() : '',
      email ? email.trim() : '',
      phone.trim(),
      social_media ? social_media.trim() : '',
      website ? website.trim() : '',
      google_business ? google_business.trim() : '',
      
      nationality ? nationality.trim() : 'brasileiro(a)',
      marital_status ? marital_status.trim() : 'solteiro(a)',
      profession ? profession.trim() : '',
      
      rep_name ? rep_name.trim() : '',
      rep_cpf ? rep_cpf.trim() : '',
      rep_rg ? rep_rg.trim() : '',
      rep_street ? rep_street.trim() : '',
      rep_number ? rep_number.trim() : '',
      rep_neighborhood ? rep_neighborhood.trim() : '',
      rep_city ? rep_city.trim() : '',
      rep_state ? rep_state.trim() : '',
      rep_cep ? rep_cep.trim() : '',
      rep_complement ? rep_complement.trim() : '',
      
      cValue,
      instCount,
      instValue,
      due_date || '',
      aPaid,
      balDue,
      invoice_number ? invoice_number.trim() : '',
      contract_status || 'Ativo',
      
      JSON.stringify(filesInfo),
      now,
      now
    );

    console.log(`[CLIENTS] Novo cliente cadastrado com sucesso: #${clientId} - ${full_name}`);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_CLIENTE',
      module: 'CLIENTES',
      resource_id: clientId,
      user_cpf: cpf || cnpj,
      description: `Cadastro do cliente ${client_type === 'PJ' ? 'Pessoa Jurídica (Empresa): ' + full_name.trim() + ' (CNPJ: ' + cnpj + ')' : 'Pessoa Física: ' + full_name.trim() + ' (CPF: ' + cpf + ')'} com contrato de R$ ${cValue.toFixed(2)} (${instCount}x).`,
      details: { clientId, client_type, full_name: full_name.trim(), cpf, cnpj, email, phone, social_media, website, google_business, contract_value: cValue, installments_count: instCount, filesCount: filesInfo.length }
    });

    // =====================================================================
    // CRIAÇÃO AUTOMÁTICA DE USUÁRIO NO PAINEL (aba Usuários e Senhas)
    // Login  = dígitos do CPF (PF) ou CNPJ (PJ)
    // Senha  = 8 primeiros dígitos do telefone
    // Role   = 'cliente'
    // =====================================================================
    let autoUserCreated = false;
    let autoUsername = '';
    let autoPassword = '';

    try {
      const docSource = client_type === 'PJ' ? (cnpj || cpf) : (cpf || cnpj);
      const phoneSource = phone ? phone.replace(/\D/g, '') : '';

      // Login: apenas dígitos do CPF/CNPJ
      autoUsername = docSource ? docSource.replace(/\D/g, '') : '';
      // Senha: primeiros 8 dígitos do telefone (fallback: primeiros 8 dígitos do CPF/CNPJ)
      autoPassword = phoneSource.length >= 8
        ? phoneSource.slice(0, 8)
        : (autoUsername.length >= 8 ? autoUsername.slice(0, 8) : autoUsername);

      if (autoUsername && autoPassword && autoPassword.length >= 4) {
        const { hash, salt } = hashPassword(autoPassword);
        const userId = 'USR-CLI-' + Date.now();

        // INSERT OR IGNORE: ignora silenciosamente se o username já existir (evita unique constraint)
        const result = db.prepare(`
          INSERT OR IGNORE INTO users (id, username, password_hash, salt, name, role, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          autoUsername,
          hash,
          salt,
          full_name.trim(),
          'cliente',
          now
        );

        // result.changes === 1 significa que foi inserido (0 = ignorado por conflito)
        if (result.changes === 1) {
          logAudit(req, {
            event_type: 'CRIACAO',
            event_name: 'CRIAR_USUARIO',
            module: 'USUARIOS',
            resource_id: userId,
            description: `Usuário criado automaticamente para o cliente '${full_name.trim()}' (login: ${autoUsername}) ao cadastrá-lo no sistema.`,
            details: { userId, username: autoUsername, name: full_name.trim(), role: 'cliente', clientId, origem: 'auto-cadastro-cliente' }
          });
          autoUserCreated = true;
          console.log(`[USERS] Usuário criado automaticamente para cliente #${clientId}: login=${autoUsername}`);
        } else {
          console.log(`[USERS] Login '${autoUsername}' já existe — usuário não duplicado para cliente #${clientId}`);
        }
      }
    } catch (userErr) {
      // Nunca interrompe o cadastro do cliente por falha na criação do usuário
      console.warn(`[USERS] Falha ao criar usuário automático para cliente #${clientId}:`, userErr.message);
    }

    return res.status(201).json({
      success: true,
      clientId,
      message: 'Cliente e contrato cadastrados com sucesso!',
      filesCount: filesInfo.length,
      autoUser: autoUserCreated
        ? { created: true, username: autoUsername, password: autoPassword, message: `Acesso criado: login=${autoUsername} / senha=${autoPassword}` }
        : { created: false }
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar cliente:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao salvar dados do cliente.' });
  }
});

/**
 * 3. PUT /api/clients/:id - Atualizar cliente e contrato + anexo de novos arquivos
 */
clientsRouter.put('/api/clients/:id', requireAuth, uploadClientDoc.array('documents', 20), (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const {
      client_type,
      full_name,
      cpf,
      rg,
      cnpj,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      email,
      phone,
      social_media,
      website,
      google_business,
      
      nationality,
      marital_status,
      profession,
      
      rep_name,
      rep_cpf,
      rep_rg,
      rep_street,
      rep_number,
      rep_neighborhood,
      rep_city,
      rep_state,
      rep_cep,
      rep_complement,
      
      contract_value,
      installments_count,
      installment_value,
      due_date,
      amount_paid,
      invoice_number,
      contract_status
    } = req.body;

    const cValue = contract_value !== undefined ? parseFloat(contract_value) : client.contract_value;
    const aPaid = amount_paid !== undefined ? parseFloat(amount_paid) : client.amount_paid;
    const instCount = installments_count !== undefined ? parseInt(installments_count, 10) : client.installments_count;
    const instValue = installment_value !== undefined ? parseFloat(installment_value) : client.installment_value;
    const balDue = Math.max(0, cValue - aPaid);

    let existingFiles = [];
    try {
      existingFiles = client.files ? JSON.parse(client.files) : [];
    } catch (e) {
      existingFiles = [];
    }

    const newFiles = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      url: `/storage/clients/${id}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const allFiles = [...existingFiles, ...newFiles];
    const now = new Date().toISOString();

    const updateStmt = db.prepare(`
      UPDATE clients SET
        client_type = ?, full_name = ?, cpf = ?, rg = ?, cnpj = ?,
        street = ?, number = ?, neighborhood = ?, city = ?, state = ?, cep = ?, complement = ?,
        filiation_father = ?, filiation_mother = ?, email = ?, phone = ?, social_media = ?, website = ?, google_business = ?,
        nationality = ?, marital_status = ?, profession = ?,
        rep_name = ?, rep_cpf = ?, rep_rg = ?, rep_street = ?, rep_number = ?, rep_neighborhood = ?, rep_city = ?, rep_state = ?, rep_cep = ?, rep_complement = ?,
        contract_value = ?, installments_count = ?, installment_value = ?, due_date = ?, amount_paid = ?, balance_due = ?, invoice_number = ?, contract_status = ?,
        files = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      client_type || client.client_type,
      full_name !== undefined ? full_name.trim() : client.full_name,
      cpf !== undefined ? cpf.trim() : client.cpf,
      rg !== undefined ? rg.trim() : client.rg,
      cnpj !== undefined ? cnpj.trim() : client.cnpj,
      street !== undefined ? street.trim() : client.street,
      number !== undefined ? number.trim() : client.number,
      neighborhood !== undefined ? neighborhood.trim() : client.neighborhood,
      city !== undefined ? city.trim() : client.city,
      state !== undefined ? state.trim() : client.state,
      cep !== undefined ? cep.trim() : client.cep,
      complement !== undefined ? complement.trim() : client.complement,
      filiation_father !== undefined ? filiation_father.trim() : client.filiation_father,
      filiation_mother !== undefined ? filiation_mother.trim() : client.filiation_mother,
      email !== undefined ? email.trim() : client.email,
      phone !== undefined ? phone.trim() : client.phone,
      social_media !== undefined ? social_media.trim() : client.social_media,
      website !== undefined ? website.trim() : (client.website || ''),
      google_business !== undefined ? google_business.trim() : (client.google_business || ''),
      
      nationality !== undefined ? nationality.trim() : (client.nationality || 'brasileiro(a)'),
      marital_status !== undefined ? marital_status.trim() : (client.marital_status || 'solteiro(a)'),
      profession !== undefined ? profession.trim() : (client.profession || ''),
      
      rep_name !== undefined ? rep_name.trim() : client.rep_name,
      rep_cpf !== undefined ? rep_cpf.trim() : client.rep_cpf,
      rep_rg !== undefined ? rep_rg.trim() : client.rep_rg,
      rep_street !== undefined ? rep_street.trim() : client.rep_street,
      rep_number !== undefined ? rep_number.trim() : client.rep_number,
      rep_neighborhood !== undefined ? rep_neighborhood.trim() : client.rep_neighborhood,
      rep_city !== undefined ? rep_city.trim() : client.rep_city,
      rep_state !== undefined ? rep_state.trim() : client.rep_state,
      rep_cep !== undefined ? rep_cep.trim() : client.rep_cep,
      rep_complement !== undefined ? rep_complement.trim() : client.rep_complement,
      
      cValue,
      instCount,
      instValue,
      due_date !== undefined ? due_date : client.due_date,
      aPaid,
      balDue,
      invoice_number !== undefined ? invoice_number.trim() : client.invoice_number,
      contract_status || client.contract_status,
      
      JSON.stringify(allFiles),
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_CLIENTE',
      module: 'CLIENTES',
      resource_id: id,
      description: `Atualização de cadastro e contrato do cliente #${id} (${full_name || client.full_name}).`,
      details: { id, full_name: full_name || client.full_name, contract_value: cValue, amount_paid: aPaid, balance_due: balDue, newFilesUploaded: newFiles.length }
    });

    return res.json({ success: true, message: 'Dados do cliente e contrato atualizados com sucesso!' });

  } catch (error) {
    console.error('[ERRO] Falha ao atualizar cliente:', error);
    return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
  }
});

/**
 * 3.1 POST /api/clients/:id/upload-document - Anexar documento assinado (Procuração, Contrato ou Declaração)
 */
clientsRouter.post('/api/clients/:id/upload-document', requireAuth, uploadClientDoc.array('documents', 10), (req, res) => {
  try {
    const { id } = req.params;
    const { doc_type } = req.body;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    let existingFiles = [];
    try {
      existingFiles = client.files ? JSON.parse(client.files) : [];
    } catch (e) {
      existingFiles = [];
    }

    const docTypeLabel = doc_type === 'procuracao' ? 'procuracao_assinada' : 
                         doc_type === 'contrato' ? 'contrato_assinado' : 
                         doc_type === 'declaracao' ? 'declaracao_assinada' : 'outro_documento';

    const newFiles = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      docType: docTypeLabel,
      url: `/storage/clients/${id}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const allFiles = [...existingFiles, ...newFiles];
    const now = new Date().toISOString();

    db.prepare(`UPDATE clients SET files = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(allFiles), now, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'ANEXAR_DOCUMENTO_CLIENTE',
      module: 'CLIENTES',
      resource_id: id,
      description: `Anexado documento assinado (${docTypeLabel}) para o cliente ${client.full_name}.`
    });

    return res.json({ success: true, message: 'Documento assinado anexado com sucesso!', files: allFiles });
  } catch (err) {
    console.error('Erro ao anexar documento do cliente:', err);
    res.status(500).json({ error: 'Erro ao anexar documento do cliente.' });
  }
});

/**
 * 4. DELETE /api/clients/:id - Excluir cliente, contrato e arquivos físicos
 */
clientsRouter.delete('/api/clients/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);

    // Remove arquivos do disco
    const clientFolder = path.join(STORAGE_DIR, id);
    if (fs.existsSync(clientFolder)) {
      fs.rmSync(clientFolder, { recursive: true, force: true });
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_CLIENTE',
      module: 'CLIENTES',
      resource_id: id,
      user_cpf: client.cpf || client.cnpj,
      description: `Exclusão definitiva do cliente #${id} (${client.full_name}) e remoção de todos os seus arquivos, processos e contratos vinculados.`
    });

    return res.json({ success: true, message: 'Cliente, contrato e ficheiros excluídos com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir cliente:', error);
    return res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});
