/**
 * ==============================================================================
 * MÓDULO RADAR / PROSPECÇÃO B2B (GOOGLE EMPRESAS, CRM KANBAN & EXPORTAÇÕES)
 * ==============================================================================
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Funcionalidades:
 * 1. Base isolada de Prospecção B2B (tabela radar_b2b_prospects) com índices;
 * 2. Importação e sincronização com bases locais (Google Meu Negócio / Places);
 * 3. Busca ao vivo via Google Places API (New v1);
 * 4. CRM estilo Kanban (Novo -> Contatado -> Sem Resposta -> Em Negociação -> Convertido / Descartado);
 * 5. Conversão em 1 clique para Cliente formal (PJ) na tabela clients do escritório;
 * 6. Exportação para Meta Ads (Público Personalizado) e Brevo (E-mail/WhatsApp Marketing).
 * ==============================================================================
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { generateNextClientFullId } from '../../shared/ids.js';

export const radarB2bRouter = express.Router();

// ------------------------------------------------------------------------------
// 1. INICIALIZAÇÃO DA TABELA DE PROSPECÇÃO B2B
// ------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS radar_b2b_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    international_phone TEXT,
    whatsapp TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    neighborhood TEXT,
    city TEXT DEFAULT 'Juiz de Fora',
    state TEXT DEFAULT 'MG',
    postal_code TEXT,
    rating REAL,
    user_ratings_total INTEGER DEFAULT 0,
    business_status TEXT DEFAULT 'OPERATIONAL',
    primary_type TEXT,
    primary_type_display TEXT,
    types TEXT,
    google_maps_url TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT DEFAULT 'novo', -- 'novo', 'contatado', 'sem_resposta', 'negociando', 'convertido', 'descartado'
    notes TEXT,
    priority TEXT DEFAULT 'media', -- 'baixa', 'media', 'alta'
    assigned_to TEXT,
    tags TEXT,
    is_office_client INTEGER DEFAULT 0,
    office_client_id TEXT,
    opt_out INTEGER DEFAULT 0,
    disposition TEXT,
    cep TEXT,
    converted_client_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Migração retroativa segura para instâncias existentes
const colsToAdd = [
  ['whatsapp', 'TEXT'],
  ['email', 'TEXT'],
  ['assigned_to', 'TEXT'],
  ['tags', 'TEXT'],
  ['is_office_client', 'INTEGER DEFAULT 0'],
  ['office_client_id', 'TEXT'],
  ['opt_out', 'INTEGER DEFAULT 0'],
  ['disposition', 'TEXT'],
  ['cep', 'TEXT']
];
for (const [col, def] of colsToAdd) {
  try {
    db.exec(`ALTER TABLE radar_b2b_prospects ADD COLUMN ${col} ${def};`);
  } catch (_) {}
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_status ON radar_b2b_prospects(status);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_primary_type ON radar_b2b_prospects(primary_type);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_neighborhood ON radar_b2b_prospects(neighborhood);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_phone ON radar_b2b_prospects(phone);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_opt_out ON radar_b2b_prospects(opt_out);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_assigned ON radar_b2b_prospects(assigned_to);

  -- Tabela de Histórico & Linha do Tempo das Interações com o Lead
  CREATE TABLE IF NOT EXISTS radar_b2b_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id INTEGER NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    disposition TEXT,
    operator_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (prospect_id) REFERENCES radar_b2b_prospects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_hist_prospect ON radar_b2b_history(prospect_id);

  -- Tabela de Campanhas & Disparos WhatsApp
  CREATE TABLE IF NOT EXISTS radar_b2b_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message_template TEXT NOT NULL,
    target_status TEXT,
    target_category TEXT,
    target_neighborhood TEXT,
    total_targets INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'rascunho',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ------------------------------------------------------------------------------
// HELPERS & UTILITÁRIOS
// ------------------------------------------------------------------------------
function cleanDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function formatPhoneBR(raw) {
  const digits = cleanDigits(raw);
  if (!digits) return raw || '';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.startsWith('55') && digits.length >= 12) {
    return formatPhoneBR(digits.slice(2));
  }
  return raw.trim();
}

function extractNeighborhood(address) {
  if (!address) return 'Centro';
  // Exemplo: "Av. Barão do Rio Branco, 3896 - Bom Pastor, Juiz de Fora - MG, 36025-020"
  const m = address.match(/-\s*([^,]+),\s*Juiz de Fora/i);
  if (m && m[1]) return m[1].trim();
  const m2 = address.match(/,\s*([^,-]+)\s*-\s*Juiz de Fora/i);
  if (m2 && m2[1]) return m2[1].trim();
  return 'Juiz de Fora';
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// Verificação de vínculo com clientes ou leads formais do escritório
export function checkOfficeClientMatch(phone, email, name) {
  const clean = cleanDigits(phone);
  if (clean && clean.length >= 8) {
    const last8 = clean.slice(-8);
    try {
      const client = db.prepare(`SELECT id, client_id, name, phone FROM clients WHERE phone LIKE ? LIMIT 1`).get(`%${last8}%`);
      if (client) return { isClient: true, clientId: client.client_id || `JA-CLI-${client.id}`, clientName: client.name };
    } catch (_) {}
    try {
      const lead = db.prepare(`SELECT id, name, phone FROM leads WHERE phone LIKE ? LIMIT 1`).get(`%${last8}%`);
      if (lead) return { isClient: false, isLead: true, leadId: lead.id, leadName: lead.name };
    } catch (_) {}
  }
  if (email && email.includes('@')) {
    try {
      const client = db.prepare(`SELECT id, client_id, name, email FROM clients WHERE LOWER(email) = LOWER(?) LIMIT 1`).get(email.trim());
      if (client) return { isClient: true, clientId: client.client_id || `JA-CLI-${client.id}`, clientName: client.name };
    } catch (_) {}
  }
  return { isClient: false, isLead: false };
}

// ------------------------------------------------------------------------------
// 2. ENDPOINTS DA API
// ------------------------------------------------------------------------------

/**
 * GET /api/radar-b2b/stats
 * Resumo estatístico do funil Kanban e base de prospecção
 */
radarB2bRouter.get('/api/radar-b2b/stats', requireAuth, (req, res) => {
  try {
    const total = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects`).get().c;
    const statsByStatus = db.prepare(`
      SELECT status, count(*) as count 
      FROM radar_b2b_prospects 
      GROUP BY status
    `).all();

    const statusCounts = {
      novo: 0,
      contatado: 0,
      sem_resposta: 0,
      negociando: 0,
      convertido: 0,
      descartado: 0
    };
    for (const r of statsByStatus) {
      if (r.status in statusCounts) statusCounts[r.status] = r.count;
    }

    const withPhone = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE phone IS NOT NULL AND phone != ''`).get().c;
    const withWhatsapp = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE (whatsapp IS NOT NULL AND whatsapp != '') OR (phone IS NOT NULL AND phone != '')`).get().c;
    const withEmail = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE email IS NOT NULL AND email != ''`).get().c;
    const withWebsite = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE website IS NOT NULL AND website != ''`).get().c;
    const optOutCount = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE opt_out = 1`).get().c;
    const officeClientCount = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE is_office_client = 1`).get().c;

    const topCategories = db.prepare(`
      SELECT primary_type_display, count(*) as count 
      FROM radar_b2b_prospects 
      WHERE primary_type_display IS NOT NULL AND primary_type_display != ''
      GROUP BY primary_type_display 
      ORDER BY count DESC 
      LIMIT 8
    `).all();

    const topNeighborhoods = db.prepare(`
      SELECT neighborhood, count(*) as count 
      FROM radar_b2b_prospects 
      WHERE neighborhood IS NOT NULL AND neighborhood != ''
      GROUP BY neighborhood 
      ORDER BY count DESC 
      LIMIT 8
    `).all();

    return res.json({
      success: true,
      total,
      withPhone,
      withWhatsapp,
      withEmail,
      withWebsite,
      optOutCount,
      officeClientCount,
      statusCounts,
      topCategories,
      topNeighborhoods
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b/stats:', error);
    return res.status(500).json({ error: 'Erro ao carregar métricas B2B.' });
  }
});

/**
 * GET /api/radar-b2b/prospects
 * Lista prospects para Kanban ou Tabela com filtros avançados
 */
radarB2bRouter.get('/api/radar-b2b/prospects', requireAuth, (req, res) => {
  try {
    const { 
      status, category, neighborhood, city, state, assigned_to, 
      disposition, opt_out, is_office_client, search, limit = 100, offset = 0, view = 'all' 
    } = req.query;

    let sql = `SELECT * FROM radar_b2b_prospects WHERE 1=1`;
    const params = [];

    if (status && status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    if (category && category !== 'todos') {
      sql += ` AND (primary_type = ? OR primary_type_display = ?)`;
      params.push(category, category);
    }
    if (neighborhood && neighborhood !== 'todos') {
      sql += ` AND neighborhood = ?`;
      params.push(neighborhood);
    }
    if (city && city !== 'todos') {
      sql += ` AND city = ?`;
      params.push(city);
    }
    if (state && state !== 'todos') {
      sql += ` AND state = ?`;
      params.push(state);
    }
    if (assigned_to && assigned_to !== 'todos') {
      sql += ` AND assigned_to = ?`;
      params.push(assigned_to);
    }
    if (disposition && disposition !== 'todos') {
      sql += ` AND disposition = ?`;
      params.push(disposition);
    }
    if (opt_out === '1' || opt_out === 'true') {
      sql += ` AND opt_out = 1`;
    } else if (opt_out === '0' || opt_out === 'false') {
      sql += ` AND (opt_out = 0 OR opt_out IS NULL)`;
    }
    if (is_office_client === '1' || is_office_client === 'true') {
      sql += ` AND is_office_client = 1`;
    } else if (is_office_client === '0' || is_office_client === 'false') {
      sql += ` AND (is_office_client = 0 OR is_office_client IS NULL)`;
    }
    if (search && search.trim()) {
      const s = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(email) LIKE ? OR LOWER(address) LIKE ? OR LOWER(neighborhood) LIKE ?)`;
      params.push(s, s, s, s, s);
    }

    if (view === 'kanban') {
      sql += ` ORDER BY user_ratings_total DESC, rating DESC, id DESC LIMIT 300`;
    } else {
      sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
      params.push(Math.min(parseInt(limit, 10) || 50, 500), parseInt(offset, 10) || 0);
    }

    const rows = db.prepare(sql).all(...params);

    return res.json({
      success: true,
      totalCount: rows.length,
      prospects: rows
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b/prospects:', error);
    return res.status(500).json({ error: 'Erro ao listar prospects B2B.' });
  }
});

/**
 * PUT /api/radar-b2b/prospects/:id/status
 * Atualiza status no Kanban, anotações, atendente, tags, disposição e grava histórico
 */
radarB2bRouter.put('/api/radar-b2b/prospects/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, priority, assigned_to, tags, disposition, opt_out, email, whatsapp } = req.body;

    const validStatuses = ['novo', 'contatado', 'sem_resposta', 'negociando', 'convertido', 'descartado'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status Kanban inválido.' });
    }

    const current = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(id);
    if (!current) {
      return res.status(404).json({ error: 'Prospect não encontrado.' });
    }

    const newStatus = status || current.status;
    const newNotes = notes !== undefined ? notes : current.notes;
    const newPriority = priority || current.priority || 'media';
    const newAssignedTo = assigned_to !== undefined ? assigned_to : current.assigned_to;
    const newTags = tags !== undefined ? tags : current.tags;
    const newDisposition = disposition !== undefined ? disposition : current.disposition;
    let newOptOut = opt_out !== undefined ? (opt_out ? 1 : 0) : current.opt_out;
    if (newDisposition === 'nao_incomodar') {
      newOptOut = 1;
    }
    const newEmail = email !== undefined ? email : current.email;
    const newWhatsapp = whatsapp !== undefined ? whatsapp : current.whatsapp;
    const now = new Date().toISOString();
    const operatorName = req.user?.name || req.user?.username || req.user?.email || 'Operador';

    db.prepare(`
      UPDATE radar_b2b_prospects 
      SET status = ?, notes = ?, priority = ?, assigned_to = ?, tags = ?,
          disposition = ?, opt_out = ?, email = ?, whatsapp = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, newNotes, newPriority, newAssignedTo, newTags, newDisposition, newOptOut, newEmail, newWhatsapp, now, id);

    // Grava histórico se houver alteração relevante
    if (newStatus !== current.status || newDisposition !== current.disposition || (notes && notes !== current.notes)) {
      db.prepare(`
        INSERT INTO radar_b2b_history (
          prospect_id, previous_status, new_status, disposition, operator_name, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, current.status, newStatus, newDisposition || '', operatorName, newNotes || '', now);
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'B2B_STATUS_UPDATE',
      module: 'radar-b2b',
      description: `Atualizou prospect #${id} (${current.name}) para ${newStatus} [${newDisposition || 'sem_disposicao'}] por ${operatorName}`
    });

    return res.json({ 
      success: true, 
      id, 
      status: newStatus,
      disposition: newDisposition,
      opt_out: newOptOut,
      assigned_to: newAssignedTo
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b update status:', error);
    return res.status(500).json({ error: 'Erro ao atualizar prospect.' });
  }
});

/**
 * POST /api/radar-b2b/prospects/:id/convert
 * Converte um prospect em Cliente PJ formal do escritório
 */
radarB2bRouter.post('/api/radar-b2b/prospects/:id/convert', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const prospect = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(id);

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect não encontrado.' });
    }

    if (prospect.converted_client_id) {
      return res.json({
        success: true,
        alreadyConverted: true,
        clientId: prospect.converted_client_id,
        message: 'Prospect já foi convertido em cliente anteriormente.'
      });
    }

    const newClientId = generateNextClientFullId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO clients (
        id, client_type, full_name, phone, website, street,
        neighborhood, city, state, google_business, created_at, updated_at
      ) VALUES (?, 'PJ', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newClientId,
      prospect.name,
      prospect.phone || '',
      prospect.website || '',
      prospect.address || '',
      prospect.neighborhood || 'Centro',
      prospect.city || 'Juiz de Fora',
      prospect.state || 'MG',
      prospect.google_maps_url || '',
      now,
      now
    );

    // Marca como convertido no radar
    db.prepare(`
      UPDATE radar_b2b_prospects 
      SET status = 'convertido', converted_client_id = ?, updated_at = ?
      WHERE id = ?
    `).run(newClientId, now, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'B2B_CONVERT_CLIENT',
      module: 'radar-b2b',
      description: `Prospect #${id} (${prospect.name}) convertido em Cliente ${newClientId}`
    });

    return res.json({
      success: true,
      clientId: newClientId,
      message: `Empresa "${prospect.name}" convertida com sucesso em Cliente PJ (${newClientId})!`
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b convert:', error);
    return res.status(500).json({ error: 'Erro ao converter prospect em cliente.' });
  }
});

/**
 * GET /api/radar-b2b/prospects/:id/history
 * Linha do tempo de interações e movimentações do lead
 */
radarB2bRouter.get('/api/radar-b2b/prospects/:id/history', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const history = db.prepare(`
      SELECT * FROM radar_b2b_history 
      WHERE prospect_id = ? 
      ORDER BY id DESC
    `).all(id);

    return res.json({
      success: true,
      prospectId: id,
      history
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b/prospects/:id/history:', error);
    return res.status(500).json({ error: 'Erro ao listar histórico do prospect.' });
  }
});

/**
 * POST /api/radar-b2b/prospects/:id/history
 * Registra novo touchpoint / ocorrência no histórico do lead
 */
radarB2bRouter.post('/api/radar-b2b/prospects/:id/history', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { disposition, notes, operator_name, status } = req.body;
    const prospect = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(id);
    if (!prospect) {
      return res.status(404).json({ error: 'Prospect não encontrado.' });
    }

    const now = new Date().toISOString();
    const operator = operator_name || req.user?.name || req.user?.username || 'Operador';
    const newStatus = status || prospect.status;
    let optOut = prospect.opt_out;
    if (disposition === 'nao_incomodar') {
      optOut = 1;
    }

    db.prepare(`
      UPDATE radar_b2b_prospects 
      SET status = ?, disposition = ?, opt_out = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, disposition || prospect.disposition, optOut, notes !== undefined ? notes : prospect.notes, now, id);

    db.prepare(`
      INSERT INTO radar_b2b_history (
        prospect_id, previous_status, new_status, disposition, operator_name, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, prospect.status, newStatus, disposition || '', operator, notes || '', now);

    return res.json({
      success: true,
      message: 'Ocorrência registrada com sucesso no histórico do prospect!'
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b add history:', error);
    return res.status(500).json({ error: 'Erro ao registrar histórico.' });
  }
});

/**
 * POST /api/radar-b2b/sync-clients
 * Cruza a base do radar com a base de clientes formais do escritório
 */
radarB2bRouter.post('/api/radar-b2b/sync-clients', requireAuth, (req, res) => {
  try {
    const prospects = db.prepare(`
      SELECT id, name, phone, email, is_office_client, office_client_id 
      FROM radar_b2b_prospects
    `).all();

    let matched = 0;
    const updateStmt = db.prepare(`
      UPDATE radar_b2b_prospects 
      SET is_office_client = 1, office_client_id = ?
      WHERE id = ?
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const p of prospects) {
        const check = checkOfficeClientMatch(p.phone, p.email, p.name);
        if (check.isClient) {
          updateStmt.run(check.clientId, p.id);
          matched++;
        }
      }
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }

    return res.json({
      success: true,
      totalChecked: prospects.length,
      matched,
      message: `Sincronização concluída: ${matched} empresas identificadas como clientes do escritório!`
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b sync clients:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar clientes.' });
  }
});

/**
 * GET /api/radar-b2b/locations/states
 * Lista oficial de Estados (UFs)
 */
radarB2bRouter.get('/api/radar-b2b/locations/states', requireAuth, (req, res) => {
  const states = [
    { sigla: 'MG', nome: 'Minas Gerais' },
    { sigla: 'SP', nome: 'São Paulo' },
    { sigla: 'RJ', nome: 'Rio de Janeiro' },
    { sigla: 'ES', nome: 'Espírito Santo' },
    { sigla: 'PR', nome: 'Paraná' },
    { sigla: 'SC', nome: 'Santa Catarina' },
    { sigla: 'RS', nome: 'Rio Grande do Sul' },
    { sigla: 'BA', nome: 'Bahia' },
    { sigla: 'GO', nome: 'Goiás' },
    { sigla: 'DF', nome: 'Distrito Federal' },
    { sigla: 'PE', nome: 'Pernambuco' },
    { sigla: 'CE', nome: 'Ceará' },
    { sigla: 'PA', nome: 'Pará' },
    { sigla: 'MT', nome: 'Mato Grosso' },
    { sigla: 'MS', nome: 'Mato Grosso do Sul' },
    { sigla: 'MA', nome: 'Maranhão' },
    { sigla: 'PB', nome: 'Paraíba' },
    { sigla: 'RN', nome: 'Rio Grande do Norte' },
    { sigla: 'AL', nome: 'Alagoas' },
    { sigla: 'PI', nome: 'Piauí' },
    { sigla: 'SE', nome: 'Sergipe' },
    { sigla: 'RO', nome: 'Rondônia' },
    { sigla: 'TO', nome: 'Tocantins' },
    { sigla: 'AC', nome: 'Acre' },
    { sigla: 'AM', nome: 'Amazonas' },
    { sigla: 'AP', nome: 'Amapá' },
    { sigla: 'RR', nome: 'Roraima' }
  ];
  return res.json({ success: true, states });
});

/**
 * GET /api/radar-b2b/locations/cities
 * Cidades do estado informado (com cache)
 */
const citiesCache = new Map();
radarB2bRouter.get('/api/radar-b2b/locations/cities', requireAuth, async (req, res) => {
  try {
    const uf = (req.query.uf || 'MG').toUpperCase();
    if (citiesCache.has(uf)) {
      return res.json({ success: true, uf, cities: citiesCache.get(uf) });
    }

    let cities = [];
    if (uf === 'MG') {
      cities = ['Juiz de Fora', 'Belo Horizonte', 'Uberlândia', 'Contagem', 'Betim', 'Montes Claros', 'Uberaba', 'Governador Valadares', 'Ipatinga', 'Sete Lagoas', 'Divinópolis', 'Poços de Caldas', 'São João del-Rei', 'Barbacena', 'Muriaé', 'Ubá', 'Cataguases', 'Santos Dumont'];
    }

    try {
      const resp = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`, { signal: AbortSignal.timeout(3500) });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          cities = data.map(c => c.nome);
          if (uf === 'MG') {
            cities = ['Juiz de Fora', ...cities.filter(c => c !== 'Juiz de Fora')];
          }
        }
      }
    } catch (_) {}

    citiesCache.set(uf, cities);
    return res.json({ success: true, uf, cities });
  } catch (error) {
    return res.json({ success: true, uf: req.query.uf || 'MG', cities: ['Juiz de Fora', 'Belo Horizonte'] });
  }
});

/**
 * GET /api/radar-b2b/locations/cep/:cep
 * Consulta endereço por CEP
 */
radarB2bRouter.get('/api/radar-b2b/locations/cep/:cep', requireAuth, async (req, res) => {
  try {
    const cleanCep = (req.params.cep || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      return res.status(400).json({ error: 'CEP deve conter 8 dígitos.' });
    }
    const resp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) {
      return res.status(404).json({ error: 'CEP não encontrado.' });
    }
    const data = await resp.json();
    if (data.erro) {
      return res.status(404).json({ error: 'CEP inválido ou inexistente.' });
    }
    return res.json({
      success: true,
      cep: data.cep,
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao consultar CEP: ' + error.message });
  }
});

/**
 * GET /api/radar-b2b/campaigns
 * Lista campanhas criadas
 */
radarB2bRouter.get('/api/radar-b2b/campaigns', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM radar_b2b_campaigns ORDER BY id DESC`).all();
    return res.json({ success: true, campaigns: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar campanhas.' });
  }
});

/**
 * POST /api/radar-b2b/campaigns
 * Cria uma nova campanha de abordagem B2B
 */
radarB2bRouter.post('/api/radar-b2b/campaigns', requireAuth, (req, res) => {
  try {
    const { name, message_template, target_status, target_category, target_neighborhood } = req.body;
    if (!name || !message_template) {
      return res.status(400).json({ error: 'Nome e texto da mensagem são obrigatórios.' });
    }

    let countSql = `SELECT count(*) as c FROM radar_b2b_prospects WHERE phone IS NOT NULL AND phone != '' AND (opt_out = 0 OR opt_out IS NULL) AND (is_office_client = 0 OR is_office_client IS NULL)`;
    const params = [];
    if (target_status && target_status !== 'todos') {
      countSql += ` AND status = ?`;
      params.push(target_status);
    }
    if (target_category && target_category !== 'todos') {
      countSql += ` AND (primary_type = ? OR primary_type_display = ?)`;
      params.push(target_category, target_category);
    }
    if (target_neighborhood && target_neighborhood !== 'todos') {
      countSql += ` AND neighborhood = ?`;
      params.push(target_neighborhood);
    }
    const totalTargets = db.prepare(countSql).get(...params).c;

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO radar_b2b_campaigns (
        name, message_template, target_status, target_category, target_neighborhood,
        total_targets, sent_count, failed_count, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'pronta', ?, ?)
    `).run(name, message_template, target_status || 'todos', target_category || 'todos', target_neighborhood || 'todos', totalTargets, now, now);

    return res.json({
      success: true,
      campaignId: result.lastInsertRowid,
      totalTargets,
      message: `Campanha "${name}" criada com sucesso! ${totalTargets} empresas aptas para disparo.`
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b create campaign:', error);
    return res.status(500).json({ error: 'Erro ao criar campanha.' });
  }
});

/**
 * POST /api/radar-b2b/campaigns/send-batch
 * Dispara ou gera fila para WhatsApp Evolution API
 */
radarB2bRouter.post('/api/radar-b2b/campaigns/send-batch', requireAuth, async (req, res) => {
  try {
    const { campaignId, mode = 'api', limit = 20 } = req.body;
    const campaign = db.prepare(`SELECT * FROM radar_b2b_campaigns WHERE id = ?`).get(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    let sql = `SELECT * FROM radar_b2b_prospects WHERE phone IS NOT NULL AND phone != '' AND (opt_out = 0 OR opt_out IS NULL) AND (is_office_client = 0 OR is_office_client IS NULL)`;
    const params = [];
    if (campaign.target_status && campaign.target_status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(campaign.target_status);
    }
    if (campaign.target_category && campaign.target_category !== 'todos') {
      sql += ` AND (primary_type = ? OR primary_type_display = ?)`;
      params.push(campaign.target_category, campaign.target_category);
    }
    if (campaign.target_neighborhood && campaign.target_neighborhood !== 'todos') {
      sql += ` AND neighborhood = ?`;
      params.push(campaign.target_neighborhood);
    }
    sql += ` ORDER BY id ASC LIMIT ?`;
    params.push(Math.min(parseInt(limit, 10) || 20, 100));

    const targets = db.prepare(sql).all(...params);

    let apiUrl = '';
    let apiKey = '';
    let instance = 'jorgealvim_advocacia';
    try {
      const u = db.prepare(`SELECT value FROM whatsapp_settings WHERE key = 'evolution_api_url'`).get();
      if (u) apiUrl = u.value;
      const k = db.prepare(`SELECT value FROM whatsapp_settings WHERE key = 'evolution_api_key'`).get();
      if (k) apiKey = k.value;
      const i = db.prepare(`SELECT value FROM whatsapp_settings WHERE key = 'instance_name'`).get();
      if (i) instance = i.value;
    } catch (_) {}

    const results = [];
    let sentSuccess = 0;
    let sentFailed = 0;
    const now = new Date().toISOString();
    const operator = req.user?.name || req.user?.username || 'Campanha B2B';

    for (const t of targets) {
      const clean = cleanDigits(t.phone);
      const intl = clean.startsWith('55') ? clean : `55${clean}`;
      let text = campaign.message_template
        .replace(/{empresa}/g, t.name || 'Empresa')
        .replace(/{nome}/g, t.name || 'Empresa')
        .replace(/{bairro}/g, t.neighborhood || 'Juiz de Fora')
        .replace(/{categoria}/g, t.primary_type_display || t.primary_type || 'Empresarial')
        .replace(/{cidade}/g, t.city || 'Juiz de Fora');

      const waLink = `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;

      if (mode === 'api' && apiUrl) {
        try {
          const apiRes = await fetch(`${apiUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: intl, text }),
            signal: AbortSignal.timeout(6000)
          });
          if (apiRes.ok) {
            sentSuccess++;
            results.push({ id: t.id, name: t.name, phone: intl, status: 'enviado_api', waLink });
            if (t.status === 'novo') {
              db.prepare(`UPDATE radar_b2b_prospects SET status = 'contatado', updated_at = ? WHERE id = ?`).run(now, t.id);
            }
            db.prepare(`
              INSERT INTO radar_b2b_history (prospect_id, previous_status, new_status, disposition, operator_name, notes, created_at)
              VALUES (?, ?, 'contatado', 'disparo_campanha_whatsapp', ?, ?, ?)
            `).run(t.id, t.status, operator, `Mensagem de campanha enviada via WhatsApp API: "${campaign.name}"`, now);
          } else {
            sentFailed++;
            results.push({ id: t.id, name: t.name, phone: intl, status: 'erro_api', waLink });
          }
        } catch (e) {
          sentFailed++;
          results.push({ id: t.id, name: t.name, phone: intl, status: 'offline_api', waLink });
        }
      } else {
        results.push({ id: t.id, name: t.name, phone: intl, status: 'link_gerado', waLink });
      }
    }

    db.prepare(`
      UPDATE radar_b2b_campaigns 
      SET sent_count = sent_count + ?, failed_count = failed_count + ?, updated_at = ?
      WHERE id = ?
    `).run(sentSuccess, sentFailed, now, campaignId);

    return res.json({
      success: true,
      mode,
      processed: targets.length,
      sentSuccess,
      sentFailed,
      results
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b send batch campaign:', error);
    return res.status(500).json({ error: 'Erro ao disparar campanha.' });
  }
});

/**
 * POST /api/radar-b2b/importar-local
 * Importa o CSV local de empresas deduplicadas ou ampliado já gerado pelo extrator
 */
radarB2bRouter.post('/api/radar-b2b/importar-local', requireAuth, (req, res) => {
  try {
    const defaultPaths = [
      '/home/jorgealvim/Documents/programação/crm-leads/empresas_deduplicadas.csv',
      '/home/jorgealvim/Documents/programação/crm-leads/empresas_juiz_de_fora_ampliado_20260315_114940.csv'
    ];

    let targetPath = null;
    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        targetPath = p;
        break;
      }
    }

    if (!targetPath) {
      return res.status(404).json({ error: 'Nenhum arquivo CSV de empresas encontrado na pasta crm-leads.' });
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lines.length <= 1) {
      return res.status(400).json({ error: 'Arquivo CSV sem registros.' });
    }

    const header = parseCSVLine(lines[0]).map(h => h.replace(/^["'\uFEFF]+|["']+$/g, '').trim().toLowerCase());
    const idxPlaceId = header.indexOf('place_id');
    const idxNome = header.indexOf('nome');
    const idxEndereco = header.indexOf('endereco');
    const idxTelefone = header.indexOf('telefone');
    const idxTelInt = header.indexOf('telefone_internacional');
    const idxWebsite = header.indexOf('website');
    const idxRating = header.indexOf('rating');
    const idxAvaliacoes = header.indexOf('total_avaliacoes');
    const idxStatusNegocio = header.indexOf('status_negocio');
    const idxTipo = header.indexOf('tipo_principal');
    const idxTipoDesc = header.indexOf('tipo_principal_descricao');
    const idxTipos = header.indexOf('tipos');
    const idxMaps = header.indexOf('google_maps_url');
    const idxLat = header.indexOf('latitude');
    const idxLng = header.indexOf('longitude');

    let inserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO radar_b2b_prospects (
        place_id, name, phone, international_phone, website,
        address, neighborhood, city, state, rating, user_ratings_total,
        business_status, primary_type, primary_type_display, types,
        google_maps_url, latitude, longitude, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 'Juiz de Fora', 'MG', ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, 'novo', ?, ?
      )
    `);

    // Inserção em transação para alta performance (milhares de linhas em fração de segundo)
    db.exec('BEGIN TRANSACTION;');
    try {
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]).map(c => c.replace(/^["']+|["']+$/g, '').trim());
        const placeId = idxPlaceId >= 0 ? cols[idxPlaceId] : null;
        const name = idxNome >= 0 ? cols[idxNome] : null;

        if (!name) {
          skipped++;
          continue;
        }

        const address = idxEndereco >= 0 ? cols[idxEndereco] : '';
        const neighborhood = extractNeighborhood(address);
        const phone = idxTelefone >= 0 ? formatPhoneBR(cols[idxTelefone]) : '';
        const intPhone = idxTelInt >= 0 ? cols[idxTelInt] : '';
        const website = idxWebsite >= 0 ? cols[idxWebsite] : '';
        const ratingRaw = idxRating >= 0 ? parseFloat(cols[idxRating].replace(',', '.')) : null;
        const rating = !isNaN(ratingRaw) ? ratingRaw : null;
        const reviewsRaw = idxAvaliacoes >= 0 ? parseInt(cols[idxAvaliacoes], 10) : 0;
        const reviews = !isNaN(reviewsRaw) ? reviewsRaw : 0;
        const bStatus = idxStatusNegocio >= 0 ? cols[idxStatusNegocio] : 'OPERATIONAL';
        const pType = idxTipo >= 0 ? cols[idxTipo] : '';
        const pTypeDesc = idxTipoDesc >= 0 ? cols[idxTipoDesc] : '';
        const types = idxTipos >= 0 ? cols[idxTipos] : '';
        const mapsUrl = idxMaps >= 0 ? cols[idxMaps] : '';
        const latRaw = idxLat >= 0 ? parseFloat(cols[idxLat].replace(',', '.')) : null;
        const lngRaw = idxLng >= 0 ? parseFloat(cols[idxLng].replace(',', '.')) : null;

        const resRun = insertStmt.run(
          placeId || `loc_${Date.now()}_${i}`,
          name,
          phone,
          intPhone,
          website,
          address,
          neighborhood,
          rating,
          reviews,
          bStatus,
          pType,
          pTypeDesc || pType,
          types,
          mapsUrl,
          !isNaN(latRaw) ? latRaw : null,
          !isNaN(lngRaw) ? lngRaw : null,
          now,
          now
        );

        if (resRun.changes > 0) inserted++;
        else skipped++;
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    const totalNow = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects`).get().c;
    logAudit(req, {
      event_type: 'IMPORTACAO',
      event_name: 'B2B_IMPORT_CSV',
      module: 'radar-b2b',
      description: `Importou ${inserted} empresas locais da base ${path.basename(targetPath)}`
    });

    return res.json({
      success: true,
      file: path.basename(targetPath),
      inserted,
      skipped,
      totalNow
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b importar local:', error);
    return res.status(500).json({ error: 'Erro ao importar empresas do arquivo local.' });
  }
});

/**
 * POST /api/radar-b2b/buscar-google
 * Busca empresas no Google Places API (com chave) ou via Base Local Ampliada enriquecida (sem chave)
 * Permite buscar sem qualificação obrigatória e verifica se já é cliente do escritório
 */
radarB2bRouter.post('/api/radar-b2b/buscar-google', requireAuth, async (req, res) => {
  try {
    const { query, neighborhood, city = 'Juiz de Fora', state = 'MG', includedType, apiKey: userKey } = req.body;
    const apiKey = userKey || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

    const searchTerm = (query || '').trim();
    const nbTerm = (neighborhood || '').trim();
    const now = new Date().toISOString();

    // -------------------------------------------------------------
    // CENÁRIO A: Chave de API Google Places disponível
    // -------------------------------------------------------------
    if (apiKey) {
      const qContext = [searchTerm, nbTerm ? `em ${nbTerm}` : '', city, state].filter(Boolean).join(' ');
      const jfBounds = {
        low: { latitude: -21.96, longitude: -43.65 },
        high: { latitude: -21.48, longitude: -43.03 }
      };

      const bodyPayload = {
        textQuery: qContext || `empresas e comercios em ${city} ${state}`,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        pageSize: 20,
        locationRestriction: { rectangle: jfBounds }
      };
      if (includedType) bodyPayload.includedType = includedType;

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.types,places.primaryType,places.primaryTypeDisplayName,places.googleMapsUri,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Google Places API retornou erro: ${errText}` });
      }

      const data = await response.json();
      const places = data.places || [];
      let inserted = 0;

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO radar_b2b_prospects (
          place_id, name, phone, website, address, neighborhood,
          city, state, rating, user_ratings_total, business_status,
          primary_type, primary_type_display, types, google_maps_url,
          latitude, longitude, status, is_office_client, office_client_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 'novo', ?, ?, ?, ?
        )
      `);

      db.exec('BEGIN TRANSACTION;');
      try {
        for (const p of places) {
          const name = p.displayName?.text || 'Sem nome';
          const address = p.formattedAddress || '';
          const nb = extractNeighborhood(address) || nbTerm || 'Centro';
          const phone = formatPhoneBR(p.nationalPhoneNumber || '');
          const website = p.websiteUri || '';
          const rating = p.rating || null;
          const reviews = p.userRatingCount || 0;
          const pType = p.primaryType || '';
          const pTypeDesc = p.primaryTypeDisplayName?.text || pType;
          const types = (p.types || []).join(', ');
          const mapsUrl = p.googleMapsUri || '';
          const lat = p.location?.latitude || null;
          const lng = p.location?.longitude || null;

          // Verifica se já é cliente do escritório
          const clientCheck = checkOfficeClientMatch(phone, '', name);

          const resRun = insertStmt.run(
            p.id, name, phone, website, address, nb,
            city, state, rating, reviews, p.businessStatus || 'OPERATIONAL',
            pType, pTypeDesc, types, mapsUrl,
            lat, lng, clientCheck.isClient ? 1 : 0, clientCheck.clientId || null, now, now
          );
          if (resRun.changes > 0) inserted++;
        }
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      logAudit(req, {
        event_type: 'CONSULTA',
        event_name: 'B2B_GOOGLE_SEARCH',
        module: 'radar-b2b',
        description: `Varredura Google Places (${qContext}): ${inserted} novos inseridos`
      });

      return res.json({
        success: true,
        mode: 'google_api_live',
        found: places.length,
        inserted,
        message: `Varredura Google Places concluída! ${inserted} novas empresas adicionadas ao funil.`
      });
    }

    // -------------------------------------------------------------
    // CENÁRIO B: Sem Chave Google (Busca inteligente na Base Local Ampliada)
    // -------------------------------------------------------------
    const localFile = '/home/jorgealvim/Documents/programação/crm-leads/empresas_juiz_de_fora_ampliado_20260315_114940.csv';
    if (!fs.existsSync(localFile)) {
      return res.status(400).json({
        error: 'Chave de API do Google não configurada e base local não encontrada.'
      });
    }

    const content = fs.readFileSync(localFile, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    const header = parseCSVLine(lines[0]).map(h => h.replace(/^["'\uFEFF]+|["']+$/g, '').trim().toLowerCase());
    const idxPlaceId = header.indexOf('place_id');
    const idxNome = header.indexOf('nome');
    const idxEndereco = header.indexOf('endereco');
    const idxTelefone = header.indexOf('telefone');
    const idxWebsite = header.indexOf('website');
    const idxRating = header.indexOf('rating');
    const idxAvaliacoes = header.indexOf('total_avaliacoes');
    const idxTipo = header.indexOf('tipo_principal');
    const idxTipoDesc = header.indexOf('tipo_principal_descricao');
    const idxTipos = header.indexOf('tipos');
    const idxMaps = header.indexOf('google_maps_url');

    let inserted = 0;
    let matched = 0;
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO radar_b2b_prospects (
        place_id, name, phone, website, address, neighborhood,
        city, state, rating, user_ratings_total, business_status,
        primary_type, primary_type_display, types, google_maps_url,
        status, is_office_client, office_client_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'Juiz de Fora', 'MG', ?, ?, 'OPERATIONAL',
        ?, ?, ?, ?,
        'novo', ?, ?, ?, ?
      )
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]).map(c => c.replace(/^["']+|["']+$/g, '').trim());
        const name = idxNome >= 0 ? cols[idxNome] : '';
        const address = idxEndereco >= 0 ? cols[idxEndereco] : '';
        const nb = extractNeighborhood(address);
        const pType = idxTipo >= 0 ? cols[idxTipo] : '';
        const pTypeDesc = idxTipoDesc >= 0 ? cols[idxTipoDesc] : '';

        // Filtro por termo/ramo se informado (se vazio, busca todas as empresas)
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const fullText = `${name} ${pType} ${pTypeDesc} ${cols[idxTipos] || ''}`.toLowerCase();
          if (!fullText.includes(q)) continue;
        }

        // Filtro por bairro se informado
        if (nbTerm) {
          const targetNb = nbTerm.toLowerCase();
          if (!nb.toLowerCase().includes(targetNb) && !address.toLowerCase().includes(targetNb)) continue;
        }

        matched++;
        const placeId = idxPlaceId >= 0 && cols[idxPlaceId] ? cols[idxPlaceId] : `LOCAL-${i}`;
        const phone = idxTelefone >= 0 ? formatPhoneBR(cols[idxTelefone]) : '';
        const website = idxWebsite >= 0 ? cols[idxWebsite] : '';
        const rating = idxRating >= 0 ? parseFloat((cols[idxRating] || '').replace(',', '.')) || null : null;
        const rev = idxAvaliacoes >= 0 ? parseInt(cols[idxAvaliacoes], 10) || 0 : 0;
        const maps = idxMaps >= 0 ? cols[idxMaps] : '';
        const types = idxTipos >= 0 ? cols[idxTipos] : '';

        // Verifica se já é cliente do escritório
        const clientCheck = checkOfficeClientMatch(phone, '', name);

        const resRun = insertStmt.run(
          placeId, name, phone, website, address, nb, rating, rev,
          pType, pTypeDesc, types, maps,
          clientCheck.isClient ? 1 : 0, clientCheck.clientId || null, now, now
        );
        if (resRun.changes > 0) inserted++;
        if (inserted >= 60) break; // Lote de até 60 novas empresas por busca
      }
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }

    logAudit(req, {
      event_type: 'CONSULTA',
      event_name: 'B2B_LOCAL_SEARCH',
      module: 'radar-b2b',
      description: `Busca na base local (${searchTerm || 'todas'} / ${nbTerm || 'geral'}): ${inserted} novos inseridos`
    });

    return res.json({
      success: true,
      mode: 'base_local_ampliada',
      matched,
      inserted,
      message: `Busca concluída com sucesso! ${inserted} novas empresas foram adicionadas ao funil (base local de Juiz de Fora sem consumir créditos de API).`
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b buscar-google:', error);
    return res.status(500).json({ error: 'Erro ao executar busca: ' + error.message });
  }
});

/**
 * GET /api/radar-b2b/export/meta-ads
 * Gera CSV formatado para Público Personalizado no Meta Ads (Facebook/Instagram)
 * Formato padrão aceito pela Meta: phone,fn,ct,st,country
 */
radarB2bRouter.get('/api/radar-b2b/export/meta-ads', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM radar_b2b_prospects WHERE phone IS NOT NULL AND phone != ''`;
    const params = [];
    if (status && status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY id ASC`;

    const prospects = db.prepare(sql).all(...params);

    const headers = ['phone', 'fn', 'ct', 'st', 'country'];
    const rows = [headers.join(',')];

    for (const p of prospects) {
      let digits = cleanDigits(p.phone);
      if (!digits) continue;
      // Garante DDI 55
      if (!digits.startsWith('55')) {
        digits = '55' + digits;
      }
      const safeName = (p.name || '').replace(/[",\n\r]/g, ' ').trim();
      const city = 'juiz de fora';
      const state = 'mg';
      const country = 'br';

      rows.push(`${digits},"${safeName}",${city},${state},${country}`);
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="meta_ads_publico_b2b_juiz_de_fora.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('[ERRO] radar-b2b export meta ads:', error);
    return res.status(500).json({ error: 'Erro ao gerar exportação para Meta Ads.' });
  }
});

/**
 * GET /api/radar-b2b/export/brevo
 * Gera CSV formatado para Brevo (Sendinblue)
 * Formato: COMPANY,FIRSTNAME,SMS,PHONE,CITY,WEBSITE,CATEGORY,STATUS
 */
radarB2bRouter.get('/api/radar-b2b/export/brevo', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM radar_b2b_prospects WHERE 1=1`;
    const params = [];
    if (status && status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY id ASC`;

    const prospects = db.prepare(sql).all(...params);

    const headers = ['COMPANY', 'FIRSTNAME', 'SMS', 'PHONE', 'CITY', 'WEBSITE', 'CATEGORY', 'STATUS'];
    const rows = [headers.join(',')];

    for (const p of prospects) {
      let digits = cleanDigits(p.phone);
      let e164 = '';
      if (digits) {
        if (!digits.startsWith('55')) digits = '55' + digits;
        e164 = '+' + digits;
      }

      const safeCompany = (p.name || '').replace(/[",\n\r]/g, ' ').trim();
      const safeCity = (p.city || 'Juiz de Fora').replace(/[",\n\r]/g, ' ').trim();
      const safeWebsite = (p.website || '').replace(/[",\n\r]/g, ' ').trim();
      const safeCategory = (p.primary_type_display || p.primary_type || 'Comércio').replace(/[",\n\r]/g, ' ').trim();

      rows.push(`"${safeCompany}","${safeCompany}","${e164}","${e164}","${safeCity}","${safeWebsite}","${safeCategory}","${p.status}"`);
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="brevo_prospeccao_b2b_juiz_de_fora.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('[ERRO] radar-b2b export brevo:', error);
    return res.status(500).json({ error: 'Erro ao gerar exportação para Brevo.' });
  }
});

/**
 * GET /api/radar-b2b/export/csv
 * Exportação completa em CSV com todos os dados e notas
 */
radarB2bRouter.get('/api/radar-b2b/export/csv', requireAuth, (req, res) => {
  try {
    const prospects = db.prepare(`SELECT * FROM radar_b2b_prospects ORDER BY id ASC`).all();

    const headers = [
      'ID', 'Place_ID', 'Nome_Empresa', 'Telefone', 'Website',
      'Endereco', 'Bairro', 'Cidade', 'UF', 'Avaliacao_Google',
      'Total_Avaliacoes', 'Categoria', 'Status_Kanban', 'Anotacoes',
      'Cliente_ID_Convertido', 'Criado_Em'
    ];
    const rows = [headers.join(',')];

    for (const p of prospects) {
      rows.push([
        p.id,
        `"${(p.place_id || '').replace(/"/g, '""')}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.phone || '').replace(/"/g, '""')}"`,
        `"${(p.website || '').replace(/"/g, '""')}"`,
        `"${(p.address || '').replace(/"/g, '""')}"`,
        `"${(p.neighborhood || '').replace(/"/g, '""')}"`,
        `"${(p.city || 'Juiz de Fora').replace(/"/g, '""')}"`,
        `"${(p.state || 'MG').replace(/"/g, '""')}"`,
        p.rating || '',
        p.user_ratings_total || 0,
        `"${(p.primary_type_display || p.primary_type || '').replace(/"/g, '""')}"`,
        `"${p.status}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`,
        `"${p.converted_client_id || ''}"`,
        `"${p.created_at}"`
      ].join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="radar_b2b_empresas_completo.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('[ERRO] radar-b2b export full csv:', error);
    return res.status(500).json({ error: 'Erro ao gerar CSV completo.' });
  }
});
