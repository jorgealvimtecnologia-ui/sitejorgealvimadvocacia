/**
 * Módulo ADMIN — utilitários administrativos: teste de WhatsApp, auditoria,
 * estatísticas de visitas, conversão de pré-clientes e backup/exportação. Extraído do server.js.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { DB_PATH } from '../../config/constants.js';
import { sendLawyerWhatsAppNotification } from '../../shared/notify.js';
import { generateNextClientId, generateNextClientFullId } from '../../shared/ids.js';

export const adminRouter = express.Router();

// Endpoint de Teste do Envio de Notificação de WhatsApp ao Advogado
adminRouter.post('/api/admin/whatsapp/test', requireAuth, async (req, res) => {
  try {
    const { custom_message } = req.body || {};
    const testMsg = custom_message || 
      `🧪 *TESTE DE SISTEMA DE NOTIFICAÇÃO VIA WHATSAPP*\n\n` +
      `📌 *Status:* Servidor Operacional\n` +
      `📍 *Escritório:* Jorge Alvim Advocacia & Tecnologia\n` +
      `📅 *Data/Hora:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `✅ O sistema de envio de alertas de novos clientes e atendimentos está ativo!`;

    const result = await sendLawyerWhatsAppNotification(testMsg, { type: 'ADMIN_TEST' });

    res.json({
      success: true,
      message: 'Notificação de teste gerada com sucesso!',
      lawyerPhone: result.lawyerPhone,
      waDirectUrl: result.waDirectUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao testar envio de WhatsApp: ' + err.message });
  }
});

adminRouter.get('/api/admin/audit-logs', requireAuth, (req, res) => {
  try {
    const { module, event_type, search, start_date, end_date, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const params = [];

    if (module && module !== 'ALL') {
      query += ` AND module = ?`;
      params.push(module);
    }

    if (event_type && event_type !== 'ALL') {
      query += ` AND event_type = ?`;
      params.push(event_type);
    }

    if (start_date) {
      query += ` AND created_at >= ?`;
      params.push(`${start_date}T00:00:00.000Z`);
    }

    if (end_date) {
      query += ` AND created_at <= ?`;
      params.push(`${end_date}T23:59:59.999Z`);
    }

    if (search && search.trim()) {
      query += ` AND (user_name LIKE ? OR user_cpf LIKE ? OR description LIKE ? OR resource_id LIKE ? OR details LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const logs = db.prepare(query).all(...params);

    // Contagem total
    let countQuery = `SELECT COUNT(*) as total FROM audit_logs WHERE 1=1`;
    const countParams = [];
    if (module && module !== 'ALL') {
      countQuery += ` AND module = ?`;
      countParams.push(module);
    }
    if (event_type && event_type !== 'ALL') {
      countQuery += ` AND event_type = ?`;
      countParams.push(event_type);
    }
    if (start_date) {
      countQuery += ` AND created_at >= ?`;
      countParams.push(`${start_date}T00:00:00.000Z`);
    }
    if (end_date) {
      countQuery += ` AND created_at <= ?`;
      countParams.push(`${end_date}T23:59:59.999Z`);
    }
    if (search && search.trim()) {
      countQuery += ` AND (user_name LIKE ? OR user_cpf LIKE ? OR description LIKE ? OR resource_id LIKE ? OR details LIKE ?)`;
      const s = `%${search.trim()}%`;
      countParams.push(s, s, s, s, s);
    }

    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('[AUDITORIA] Erro ao listar logs de auditoria:', err);
    res.status(500).json({ error: 'Erro ao buscar trilha de auditoria.' });
  }
});

// 2. Estatísticas e Métricas da Trilha de Auditoria (Admin)
adminRouter.get('/api/admin/audit-logs/stats', requireAuth, (req, res) => {
  try {
    const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c;
    const creations = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'CRIACAO'`).get().c;
    const updates = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'ALTERACAO'`).get().c;
    const deletions = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'EXCLUSAO'`).get().c;
    const documents = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'GERACAO_DOC'`).get().c;
    const authEvents = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'AUTENTICACAO'`).get().c;

    const byModule = db.prepare(`
      SELECT module, COUNT(*) as count 
      FROM audit_logs 
      GROUP BY module 
      ORDER BY count DESC
    `).all();

    res.json({
      success: true,
      stats: {
        total,
        creations,
        updates,
        deletions,
        documents,
        authEvents,
        byModule
      }
    });
  } catch (err) {
    console.error('[AUDITORIA] Erro ao obter estatísticas:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas de auditoria.' });
  }
});

// 3. Registrar Evento de Auditoria via Painel (ex: Geração / Impressão de Documentos)
adminRouter.post('/api/audit/log-event', requireAuth, (req, res) => {
  try {
    const { event_type = 'GERACAO_DOC', event_name, module = 'DOCUMENTOS', resource_id, description, details } = req.body;
    if (!description || !event_name) {
      return res.status(400).json({ error: 'Descrição e nome do evento são obrigatórios.' });
    }

    logAudit(req, {
      event_type,
      event_name,
      module,
      resource_id,
      description,
      details
    });

    res.json({ success: true, message: 'Evento de auditoria registrado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar evento de auditoria.' });
  }
});

// ================= ROTAS DE RASTREAMENTO DE VISITAS, GEOLOCALIZAÇÃO & PRÉ-CLIENTES =================
// ===== VISITAS: extraído para src/modules/visits/visits.routes.js =====

// 4. Obter Estatísticas Consolidadas de Visitas (Por Dia, Mês, Ano, Cidades e Origens) (Admin)
adminRouter.get('/api/admin/visits/stats', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const total = db.prepare(`SELECT COUNT(*) as c FROM site_visits`).get().c;
    const today = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE visit_date = ?`).get(todayStr).c;
    const month = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE visit_year = ? AND visit_month = ?`).get(currentYear, currentMonth).c;
    const year = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE visit_year = ?`).get(currentYear).c;
    const locations = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE shared_location = 1`).get().c;
    const preClients = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE is_pre_client = 1`).get().c;

    // Últimos 30 dias com contagem total e IPs únicos
    const dailyStats = db.prepare(`
      SELECT visit_date, COUNT(*) as count, COUNT(DISTINCT ip_address) as unique_ips
      FROM site_visits
      GROUP BY visit_date
      ORDER BY visit_date DESC
      LIMIT 30
    `).all();

    // Histórico por Mês do Ano Atual
    const monthlyStats = db.prepare(`
      SELECT visit_month, visit_year, COUNT(*) as count, COUNT(DISTINCT ip_address) as unique_ips
      FROM site_visits
      WHERE visit_year = ?
      GROUP BY visit_month
      ORDER BY visit_month ASC
    `).all(currentYear);

    // Histórico por Ano
    const yearlyStats = db.prepare(`
      SELECT visit_year, COUNT(*) as count, COUNT(DISTINCT ip_address) as unique_ips
      FROM site_visits
      GROUP BY visit_year
      ORDER BY visit_year DESC
    `).all();

    // Top Cidades e Regiões
    const topCities = db.prepare(`
      SELECT COALESCE(NULLIF(geo_city, ''), NULLIF(ip_city, ''), 'Juiz de Fora') as city, COUNT(*) as count
      FROM site_visits
      GROUP BY city
      ORDER BY count DESC
      LIMIT 10
    `).all();

    // Origens / Redes Sociais
    const topSources = db.prepare(`
      SELECT COALESCE(NULLIF(social_media, ''), NULLIF(utm_source, ''), 'Acesso Direto') as source, COUNT(*) as count
      FROM site_visits
      GROUP BY source
      ORDER BY count DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      stats: {
        total,
        today,
        month,
        year,
        locations,
        preClients,
        dailyStats,
        monthlyStats,
        yearlyStats,
        topCities,
        topSources
      }
    });
  } catch (err) {
    console.error('Erro ao obter métricas de visitas:', err);
    res.status(500).json({ error: 'Erro ao carregar estatísticas de visitas.' });
  }
});

// 5. Listar Visitas e IPs Detalhados (Admin)
adminRouter.get('/api/admin/visits', requireAuth, (req, res) => {
  try {
    const { page = 1, limit = 30, search, only_pre_clients, date_start, date_end, shared_location } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT * FROM site_visits WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM site_visits WHERE 1=1`;
    const params = [];
    const countParams = [];

    if (only_pre_clients === 'true' || only_pre_clients === '1') {
      query += ` AND is_pre_client = 1`;
      countQuery += ` AND is_pre_client = 1`;
    }

    if (shared_location === 'true' || shared_location === '1') {
      query += ` AND shared_location = 1`;
      countQuery += ` AND shared_location = 1`;
    }

    if (date_start) {
      query += ` AND visit_date >= ?`;
      countQuery += ` AND visit_date >= ?`;
      params.push(date_start);
      countParams.push(date_start);
    }

    if (date_end) {
      query += ` AND visit_date <= ?`;
      countQuery += ` AND visit_date <= ?`;
      params.push(date_end);
      countParams.push(date_end);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      const searchClause = ` AND (ip_address LIKE ? OR visitor_name LIKE ? OR visitor_phone LIKE ? OR visitor_email LIKE ? OR social_media LIKE ? OR website LIKE ? OR google_business LIKE ? OR geo_city LIKE ? OR ip_city LIKE ?)`;
      query += searchClause;
      countQuery += searchClause;
      for (let i = 0; i < 9; i++) {
        params.push(s);
        countParams.push(s);
      }
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const visits = db.prepare(query).all(...params);
    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      visits,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Erro ao listar visitas:', err);
    res.status(500).json({ error: 'Erro ao buscar visitas.' });
  }
});

// 6. Converter Pré-Cliente em Lead (Admin)
adminRouter.post('/api/admin/pre-clients/:id/convert-to-lead', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const visit = db.prepare(`SELECT * FROM site_visits WHERE id = ?`).get(id);

    if (!visit) {
      return res.status(404).json({ error: 'Registro de visita/pré-cliente não encontrado.' });
    }

    const newLeadId = generateNextClientId();
    const now = new Date().toISOString();
    const leadName = (visit.visitor_name || 'Pré-Cliente Convertido').trim();
    const leadPhone = (visit.visitor_phone || '(32) 99815-3429').trim();
    const leadArea = visit.interest_area || 'Consultoria Jurídica Geral';
    const messageNotes = `Convertido a partir de Pré-Cliente (Visita #${id}). Redes: ${visit.social_media || '—'} | Site: ${visit.website || '—'} | Google: ${visit.google_business || '—'}. Local: ${visit.geo_city || visit.ip_city || 'Juiz de Fora - MG'}.`;

    // 1. Inserir em leads
    db.prepare(`
      INSERT INTO leads (id, created_at, name, phone, area, message, files, status, social_media, website, google_business)
      VALUES (?, ?, ?, ?, ?, ?, '[]', 'Novo', ?, ?, ?)
    `).run(
      newLeadId, now, leadName, leadPhone, leadArea, messageNotes,
      visit.social_media || '', visit.website || '', visit.google_business || ''
    );

    // 2. Inserir em clients
    db.prepare(`
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
    `).run(
      newLeadId, 'PF', leadName, '', '', '', '', '', '',
      visit.geo_city || visit.ip_city || 'Juiz de Fora', visit.geo_state || visit.ip_region || 'MG',
      '', '', '', '', visit.visitor_email || '', leadPhone,
      visit.social_media || `Área: ${leadArea}`, visit.website || '', visit.google_business || '',
      'brasileiro(a)', 'solteiro(a)', '',
      '', '', '', '', '', '', '', '', '', '',
      0, 1, 0, '', 0, 0, '', 'Novo',
      '[]', now, now
    );

    // 3. Atualizar status na tabela site_visits
    db.prepare(`
      UPDATE site_visits SET
        status = 'Convertido em Lead',
        converted_lead_id = ?
      WHERE id = ?
    `).run(newLeadId, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CONVERTER_PRE_CLIENTE_LEAD',
      module: 'VISITANTES',
      resource_id: newLeadId,
      user_name: req.user ? req.user.name : 'Administrador',
      description: `Pré-Cliente #${id} (${leadName}) convertido com sucesso em Atendimento/Lead #${newLeadId}.`,
      details: { visitId: id, leadId: newLeadId, name: leadName, phone: leadPhone, area: leadArea }
    });

    res.json({
      success: true,
      message: `Pré-cliente convertido em Atendimento/Lead com sucesso! (ID: #${newLeadId})`,
      leadId: newLeadId
    });
  } catch (err) {
    console.error('Erro ao converter pré-cliente em lead:', err);
    res.status(500).json({ error: 'Erro ao converter pré-cliente: ' + err.message });
  }
});

// 7. Converter Pré-Cliente em Cliente & Contrato (Admin)
adminRouter.post('/api/admin/pre-clients/:id/convert-to-client', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const visit = db.prepare(`SELECT * FROM site_visits WHERE id = ?`).get(id);

    if (!visit) {
      return res.status(404).json({ error: 'Registro de visita/pré-cliente não encontrado.' });
    }

    const newClientId = generateNextClientFullId();
    const now = new Date().toISOString();
    const clientName = (visit.visitor_name || 'Novo Cliente').trim();
    const clientPhone = (visit.visitor_phone || '(32) 99815-3429').trim();

    db.prepare(`
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
    `).run(
      newClientId, 'PF', clientName, '', '', '', '', '', '',
      visit.geo_city || visit.ip_city || 'Juiz de Fora', visit.geo_state || visit.ip_region || 'MG',
      '', '', '', '', visit.visitor_email || '', clientPhone,
      visit.social_media || '', visit.website || '', visit.google_business || '',
      'brasileiro(a)', 'solteiro(a)', '',
      '', '', '', '', '', '', '', '', '', '',
      0, 1, 0, '', 0, 0, '', 'Ativo',
      '[]', now, now
    );

    db.prepare(`
      UPDATE site_visits SET
        status = 'Convertido em Cliente',
        converted_client_id = ?
      WHERE id = ?
    `).run(newClientId, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CONVERTER_PRE_CLIENTE_CLIENTE',
      module: 'CLIENTES',
      resource_id: newClientId,
      user_name: req.user ? req.user.name : 'Administrador',
      description: `Pré-Cliente #${id} (${clientName}) convertido com sucesso em Cliente & Contrato #${newClientId}.`,
      details: { visitId: id, clientId: newClientId, name: clientName, phone: clientPhone }
    });

    res.json({
      success: true,
      message: `Pré-cliente convertido em Cliente & Contrato com sucesso! (ID: #${newClientId})`,
      clientId: newClientId
    });
  } catch (err) {
    console.error('Erro ao converter pré-cliente em cliente:', err);
    res.status(500).json({ error: 'Erro ao converter pré-cliente em cliente: ' + err.message });
  }
});

adminRouter.get('/api/admin/backup/download-db', requireAuth, (req, res) => {
  try {
    const dbPath = DB_PATH;
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Arquivo do banco de dados não encontrado.' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-jorgealvim-db-${timestamp}.sqlite`;

    logAudit(req, {
      event_type: 'EXPORTACAO',
      event_name: 'BACKUP_SQLITE',
      module: 'SISTEMA',
      description: `Backup completo do banco de dados SQLite baixado pelo operador ${req.user.name}.`
    });

    res.download(dbPath, filename);
  } catch (err) {
    console.error('Erro ao gerar download de backup:', err);
    res.status(500).json({ error: 'Erro ao gerar backup.' });
  }
});

// 2. Exportação Completa de Todas as Tabelas em JSON
adminRouter.get('/api/admin/backup/export-full-json', requireAuth, (req, res) => {
  try {
    const tables = [
      'leads', 'users', 'clients', 'offices', 'contract_installments',
      'lawsuits', 'lawsuit_timeline', 'court_calendar', 'court_publications',
      'office_files', 'audit_logs', 'system_settings', 'hr_employees',
      'hr_time_clock', 'hr_payroll', 'hr_vacations', 'access_permissions', 'nfse_invoices'
    ];

    const backupData = {
      system: 'Jorge Alvim Advocacia & Tecnologia',
      version: '2.5.0-Enterprise',
      exported_at: new Date().toISOString(),
      exported_by: req.user.name,
      tables: {}
    };

    for (const table of tables) {
      try {
        backupData.tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
      } catch (e) {
        backupData.tables[table] = [];
      }
    }

    logAudit(req, {
      event_type: 'EXPORTACAO',
      event_name: 'BACKUP_JSON_TOTAL',
      module: 'SISTEMA',
      description: `Dump JSON completo de todas as 18 tabelas exportado pelo operador ${req.user.name}.`
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dump-jorgealvim-${timestamp}.json"`);
    return res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error('Erro ao exportar JSON completo:', err);
    res.status(500).json({ error: 'Erro ao exportar dump JSON.' });
  }
});
