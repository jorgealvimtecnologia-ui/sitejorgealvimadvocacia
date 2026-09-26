/**
 * Módulo LEADS / Atendimentos do site — extraído do server.js.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../../config/db.js';
import { requireAuth, requireMaster } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { uploadClientDoc } from '../../middleware/upload.js';
import { STORAGE_DIR } from '../../config/constants.js';
import { generateNextClientId } from '../../shared/ids.js';
import { sendLawyerWhatsAppNotification } from '../../shared/notify.js';

export const leadsRouter = express.Router();

// ================= ROTAS DE LEADS / ATENDIMENTOS DO SITE =================

// ANTI-ABUSO do formulário público (o único write não autenticado exposto à
// internet): limite por IP + honeypot. Sem isto, um bot podia inundar as tabelas
// leads/clients e encher o disco com uploads. Em memória, sem dependências.
const __leadHits = new Map();
function leadRateLimit(req, res, next) {
  try {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // janela de 10 minutos
    const maxPerWindow = 8;          // no máx. 8 envios por IP na janela
    let rec = __leadHits.get(ip);
    if (!rec || now > rec.reset) rec = { count: 0, reset: now + windowMs };
    rec.count++;
    __leadHits.set(ip, rec);
    if (__leadHits.size > 5000) { for (const [k, v] of __leadHits) if (now > v.reset) __leadHits.delete(k); }
    if (rec.count > maxPerWindow) {
      res.setHeader('Retry-After', String(Math.ceil((rec.reset - now) / 1000)));
      return res.status(429).json({ error: 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente.' });
    }
  } catch (_) { /* nunca bloquear por erro do limitador */ }
  next();
}
// Honeypot: campos ocultos que humanos deixam vazios e bots preenchem. Se vierem
// preenchidos, respondemos "ok" silenciosamente e NÃO gravamos nada (não alerta o bot).
function leadHoneypot(req, res, next) {
  const b = req.body || {};
  if (b.website_hp || b._gotcha || b.company_hp) {
    return res.status(200).json({ success: true, id: 'IGNORED' });
  }
  next();
}

// ================= GESTÃO DE LEADS v2 (distribuição, estágio, trilha) =========

// Vocabulário único de estágios do cadastro (lead → cliente).
const LEAD_STAGES = [
  'recebido', 'distribuido', 'em_cadastro', 'falta_documento', 'falta_dados',
  'aguardando_assinatura', 'concluido', 'desistiu', 'outros'
];

// Mapeia o estágio do lead para o status de cadastro exibido na ficha do cliente.
function registrationStatusFromStage(stage) {
  if (stage === 'concluido') return 'concluido';
  if (stage === 'desistiu') return 'desistiu';
  return 'pendente';
}

// Registra um evento na linha do tempo do lead (nunca lança: telemetria).
function logLeadEvent(leadId, eventType, detail, performedBy) {
  try {
    db.prepare(`INSERT INTO lead_events (lead_id, event_type, detail, performed_by, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(leadId, eventType, detail || null, performedBy || 'sistema', new Date().toISOString());
  } catch (e) {
    console.warn('[LEADS] Falha ao registrar evento do lead:', e.message);
  }
}

leadsRouter.post('/api/leads', leadRateLimit, (req, res, next) => {
  req.clientId = generateNextClientId();
  next();
}, uploadClientDoc.array('documents', 10), leadHoneypot, (req, res) => {
  try {
    const { name, phone, area, message, email, cpf, city, social_media, website, google_business } = req.body;
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

    // 1. Grava no Ficheiro de Atendimentos / Leads
    const insertLeadStmt = db.prepare(`
      INSERT INTO leads (id, created_at, name, phone, area, message, files, status, social_media, website, google_business)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Novo', ?, ?, ?)
    `);

    insertLeadStmt.run(
      clientId,
      createdAt,
      name.trim(),
      phone.trim(),
      area || 'Não especificado',
      message ? message.trim() : '',
      filesJson,
      social_media ? social_media.trim() : '',
      website ? website.trim() : '',
      google_business ? google_business.trim() : ''
    );

    // 2. Grava AUTOMATICAMENTE no Banco de Dados de Clientes & Contratos (Box de Clientes)
    const insertClientStmt = db.prepare(`
      INSERT OR REPLACE INTO clients (
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

    insertClientStmt.run(
      clientId,
      'PF',
      name.trim(),
      cpf ? cpf.trim() : '',
      '',
      '',
      '',
      '',
      '',
      city ? city.trim() : 'Juiz de Fora',
      'MG',
      '',
      '',
      '',
      '',
      email ? email.trim() : '',
      phone.trim(),
      social_media ? social_media.trim() : (area ? `Área: ${area}` : ''),
      website ? website.trim() : '',
      google_business ? google_business.trim() : '',
      'brasileiro(a)',
      'solteiro(a)',
      '',
      '', '', '', '', '', '', '', '', '', '',
      0, 1, 0, '', 0, 0, '', 'Novo',
      filesJson,
      createdAt,
      createdAt
    );

    // Trilha (linha do tempo): lead recebido pelo site. Estágio inicial 'recebido'.
    logLeadEvent(clientId, 'recebido', `Lead recebido pelo site — área: ${area || 'Geral'}${filesInfo.length ? ` (${filesInfo.length} anexo(s))` : ''}.`, 'site');

    console.log(`[CLIENTS/LEADS] Novo cliente registrado e sincronizado automaticamente no Box: #${clientId} - ${name}`);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'NOVO_LEAD_SITE',
      module: 'LEADS',
      resource_id: clientId,
      user_name: name.trim(),
      user_cpf: cpf || null,
      user_role: 'lead',
      description: `Novo atendimento/lead recebido pelo site: ${name.trim()} (${phone.trim()}) - Área: ${area || 'Geral'}.`,
      details: { clientId, name: name.trim(), phone: phone.trim(), email, area, city, social_media, website, google_business, filesCount: filesInfo.length }
    });

    // 📲 Dispara notificação por WhatsApp ao Advogado (Dr. Jorge Alvim)
    const cleanClientPhone = phone.trim().replace(/\D/g, '');
    const dateStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const leadNotifyMsg = 
      `🚨 *NOVO ATENDIMENTO SOLICITADO NO SITE!*\n\n` +
      `👤 *Nome:* ${name.trim()}\n` +
      `🆔 *Código:* #${clientId}\n` +
      `📱 *WhatsApp:* ${phone.trim()}\n` +
      `⚖️ *Área:* ${area || 'Geral'}\n` +
      `💬 *Mensagem:* ${message ? message.trim() : 'Sem mensagem'}\n` +
      `📍 *Cidade:* ${city ? city.trim() : 'Juiz de Fora'}\n` +
      `📅 *Data:* ${dateStr}\n\n` +
      `📲 *Falar com o Cliente:* https://wa.me/55${cleanClientPhone}`;

    sendLawyerWhatsAppNotification(leadNotifyMsg, { clientId, type: 'PUBLIC_LEAD' });

    return res.status(201).json({
      success: true,
      clientId,
      message: 'Dados e documentação salvos com sucesso no banco de dados do escritório.',
      filesCount: filesInfo.length,
      createdAt
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar lead/cliente:', error);
    return res.status(500).json({ error: 'Erro interno ao salvar no banco de dados.' });
  }
});

leadsRouter.get('/api/leads', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, created_at, name, phone, area, message, files, status,
             stage, stage_note, responsible_lawyer_id, responsible_lawyer_name,
             assigned_secretary_id, assigned_secretary_name, assigned_at, client_id
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

leadsRouter.patch('/api/leads/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Novo', 'Em Atendimento', 'Concluído', 'Arquivado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const lead = db.prepare(`SELECT name FROM leads WHERE id = ?`).get(id);
    const stmt = db.prepare(`UPDATE leads SET status = ? WHERE id = ?`);
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'STATUS_LEAD',
      module: 'LEADS',
      resource_id: id,
      description: `Alteração do status do atendimento #${id} (${lead ? lead.name : 'Lead'}) para '${status}'.`
    });

    return res.json({ success: true, message: 'Status atualizado com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar status:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

leadsRouter.delete('/api/leads/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const lead = db.prepare(`SELECT name FROM leads WHERE id = ?`).get(id);
    const stmt = db.prepare(`DELETE FROM leads WHERE id = ?`);
    const result = stmt.run(id);

    const clientFolder = path.join(STORAGE_DIR, id);
    if (fs.existsSync(clientFolder)) {
      fs.rmSync(clientFolder, { recursive: true, force: true });
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_LEAD',
      module: 'LEADS',
      resource_id: id,
      description: `Exclusão do atendimento/lead #${id} (${lead ? lead.name : 'Lead'}).`
    });

    return res.json({ success: true, message: 'Registro e ficheiro excluídos com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir lead:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// ---- Resumo para a Visão Geral: caixa de Novos Leads + contadores de Contratos.
// Definido ANTES das rotas com :id para não colidir com elas.
leadsRouter.get('/api/leads/dashboard-summary', requireAuth, (req, res) => {
  try {
    const newLeads = db.prepare(`
      SELECT id, name, phone, area, created_at, stage
      FROM leads WHERE stage = 'recebido' OR stage IS NULL
      ORDER BY created_at DESC LIMIT 20
    `).all();
    const newLeadsCount = db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE stage = 'recebido' OR stage IS NULL`).get().c;

    // Contratos = solicitações de assinatura de contrato de honorários (esign).
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startYear = new Date(now.getFullYear(), 0, 1).toISOString();
    let contracts = { day: 0, month: 0, year: 0 };
    try {
      const countSince = (iso) => db.prepare(
        `SELECT COUNT(*) AS c FROM signature_requests WHERE doc_type = 'contrato_honorarios' AND created_at >= ?`
      ).get(iso).c;
      contracts = { day: countSince(startDay), month: countSince(startMonth), year: countSince(startYear) };
    } catch (_) { /* tabela de assinaturas ainda não criada */ }

    return res.json({ success: true, newLeads: { count: newLeadsCount, items: newLeads }, contracts });
  } catch (e) {
    console.error('[ERRO] dashboard-summary leads:', e);
    return res.status(500).json({ error: 'Erro ao montar o resumo.' });
  }
});

// ---- Lista de contratos para a tabela (drill-down do contador). Inclui link e andamento.
leadsRouter.get('/api/leads/contracts-list', requireAuth, (req, res) => {
  try {
    let rows = [];
    try {
      rows = db.prepare(`
        SELECT sr.id, sr.token, sr.doc_title, sr.status AS signature_status,
               sr.signer_name, sr.client_id, sr.created_at,
               c.full_name AS client_name, c.registration_status
        FROM signature_requests sr
        LEFT JOIN clients c ON c.id = sr.client_id
        WHERE sr.doc_type = 'contrato_honorarios'
        ORDER BY sr.created_at DESC LIMIT 200
      `).all();
    } catch (_) { rows = []; }
    const contracts = rows.map(r => ({
      ...r,
      // Andamento consolidado do contrato para exibição.
      andamento: r.signature_status === 'assinado'
        ? 'assinado'
        : (r.registration_status === 'falta_documento' ? 'falta_documento'
          : r.registration_status === 'falta_dados' ? 'falta_dados'
          : 'falta_assinatura'),
      link: `/assinar?token=${r.token}`
    }));
    return res.json({ success: true, contracts });
  } catch (e) {
    console.error('[ERRO] contracts-list:', e);
    return res.status(500).json({ error: 'Erro ao listar contratos.' });
  }
});

// ---- Distribuição do lead (SOMENTE MESTRE): define advogado responsável e/ou secretária.
leadsRouter.post('/api/leads/:id/distribute', requireMaster, (req, res) => {
  try {
    const { id } = req.params;
    const { responsible_lawyer_id, responsible_lawyer_name, assigned_secretary_id, assigned_secretary_name } = req.body || {};
    if (!responsible_lawyer_id || !responsible_lawyer_name) {
      return res.status(400).json({ error: 'Informe o advogado responsável pela distribuição.' });
    }
    const lead = db.prepare(`SELECT id, name, client_id, stage, status FROM leads WHERE id = ?`).get(id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const now = new Date().toISOString();
    const performer = req.user.name || req.user.username;
    db.prepare(`
      UPDATE leads SET responsible_lawyer_id = ?, responsible_lawyer_name = ?,
        assigned_secretary_id = ?, assigned_secretary_name = ?,
        stage = CASE WHEN stage IS NULL OR stage = 'recebido' THEN 'distribuido' ELSE stage END,
        status = CASE WHEN status = 'Novo' THEN 'Em Atendimento' ELSE status END,
        assigned_at = ?, assigned_by = ?
      WHERE id = ?
    `).run(responsible_lawyer_id, responsible_lawyer_name, assigned_secretary_id || null, assigned_secretary_name || null, now, performer, id);

    // Propaga o responsável para a ficha do cliente (mesmo id, quando existir).
    const clientId = lead.client_id || lead.id;
    try {
      db.prepare(`UPDATE clients SET responsible_lawyer_id = ?, responsible_lawyer_name = ?, updated_at = ? WHERE id = ?`)
        .run(responsible_lawyer_id, responsible_lawyer_name, now, clientId);
    } catch (_) {}

    const detail = `Distribuído para ${responsible_lawyer_name} (responsável)${assigned_secretary_name ? ` + ${assigned_secretary_name} (secretária)` : ''}.`;
    logLeadEvent(id, 'distribuido', detail, performer);
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'DISTRIBUIR_LEAD', module: 'LEADS', resource_id: id, description: `Lead #${id} (${lead.name}) — ${detail}` });

    return res.json({ success: true, message: 'Lead distribuído com sucesso.' });
  } catch (e) {
    console.error('[ERRO] distribuir lead:', e);
    return res.status(500).json({ error: 'Erro ao distribuir o lead.' });
  }
});

// ---- Atualiza o estágio do cadastro (advogado, secretária ou mestre).
leadsRouter.patch('/api/leads/:id/stage', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { stage, note } = req.body || {};
    if (!LEAD_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'Estágio inválido.' });
    }
    const lead = db.prepare(`SELECT id, name, client_id FROM leads WHERE id = ?`).get(id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const now = new Date().toISOString();
    const performer = req.user.name || req.user.username;
    db.prepare(`UPDATE leads SET stage = ?, stage_note = ? WHERE id = ?`).run(stage, note || null, id);

    const clientId = lead.client_id || lead.id;
    try {
      db.prepare(`UPDATE clients SET registration_status = ?, updated_at = ? WHERE id = ?`)
        .run(registrationStatusFromStage(stage), now, clientId);
    } catch (_) {}

    logLeadEvent(id, 'estagio', `Estágio: ${stage}${note ? ` — ${note}` : ''}.`, performer);
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'ESTAGIO_LEAD', module: 'LEADS', resource_id: id, description: `Lead #${id} (${lead.name}) → estágio '${stage}'${note ? `: ${note}` : ''}.` });

    return res.json({ success: true, message: 'Estágio atualizado.' });
  } catch (e) {
    console.error('[ERRO] estágio lead:', e);
    return res.status(500).json({ error: 'Erro ao atualizar o estágio.' });
  }
});

// ---- Linha do tempo (histórico) do lead até virar cliente.
leadsRouter.get('/api/leads/:id/events', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const events = db.prepare(`SELECT id, event_type, detail, performed_by, created_at FROM lead_events WHERE lead_id = ? ORDER BY id ASC`).all(id);
    return res.json({ success: true, events });
  } catch (e) {
    console.error('[ERRO] eventos lead:', e);
    return res.status(500).json({ error: 'Erro ao carregar a linha do tempo.' });
  }
});
