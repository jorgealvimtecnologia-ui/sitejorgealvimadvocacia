import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const adminRequestsRouter = express.Router();

// ============================================================================
//  REQUERIMENTOS ADMINISTRATIVOS EXTERNOS
//  Controle de requerimentos/pedidos administrativos que os clientes protocolam
//  em órgãos públicos (federais, estaduais ou municipais) — ex.: INSS, DETRAN,
//  prefeituras, juntas, receitas — que NÃO são processos judiciais.
//  Acompanha órgão, esfera, protocolo, status, prazos (ex.: exigência) e um
//  histórico de andamentos. Os prazos entram na central de alertas.
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_requests (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    client_name TEXT,
    title TEXT NOT NULL,                 -- objeto do requerimento
    agency_name TEXT NOT NULL,           -- órgão (INSS, Prefeitura de JF, DETRAN-MG...)
    agency_sphere TEXT NOT NULL DEFAULT 'federal', -- 'federal' | 'estadual' | 'municipal'
    request_type TEXT,                   -- tipo (aposentadoria, licença, alvará, certidão, recurso...)
    protocol_number TEXT,                -- número do protocolo administrativo
    status TEXT NOT NULL DEFAULT 'protocolado', -- ver STATUSES
    filed_date TEXT,                     -- data do protocolo
    deadline_date TEXT,                  -- prazo (exigência/resposta)
    responsible TEXT,                    -- advogado/responsável
    description TEXT,                    -- observações
    outcome TEXT,                        -- resultado (deferido/indeferido/valor...)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON admin_requests(status, deadline_date);`); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_request_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    update_date TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES admin_requests(id) ON DELETE CASCADE
  );
`);

const STATUSES = {
  protocolado: 'Protocolado', em_analise: 'Em análise', exigencia: 'Em exigência',
  deferido: 'Deferido', indeferido: 'Indeferido', recurso: 'Em recurso',
  concluido: 'Concluído', arquivado: 'Arquivado'
};
const SPHERES = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal' };

function genId() {
  const y = new Date().getFullYear();
  const last = db.prepare(`SELECT id FROM admin_requests WHERE id LIKE ? ORDER BY id DESC LIMIT 1`).get(`REQ-${y}-%`);
  let n = 1;
  if (last?.id) { const m = last.id.match(/(\d+)$/); if (m) n = parseInt(m[1], 10) + 1; }
  return `REQ-${y}-${String(n).padStart(4, '0')}`;
}

/** GET /api/admin-requests — lista + filtros + estatísticas. */
adminRequestsRouter.get('/api/admin-requests', requireAuth, (req, res) => {
  try {
    const { status, sphere, client_id, q } = req.query;
    let sql = `SELECT * FROM admin_requests WHERE 1=1`;
    const p = [];
    if (status && status !== 'all') { sql += ` AND status = ?`; p.push(status); }
    if (sphere && sphere !== 'all') { sql += ` AND agency_sphere = ?`; p.push(sphere); }
    if (client_id) { sql += ` AND client_id = ?`; p.push(client_id); }
    if (q) { sql += ` AND (id LIKE ? OR title LIKE ? OR agency_name LIKE ? OR protocol_number LIKE ? OR client_name LIKE ?)`; const t = `%${q.trim()}%`; p.push(t, t, t, t, t); }
    sql += ` ORDER BY created_at DESC LIMIT 500`;
    const rows = db.prepare(sql).all(...p);

    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const stats = {
      total: db.prepare(`SELECT COUNT(*) c FROM admin_requests`).get().c,
      em_aberto: db.prepare(`SELECT COUNT(*) c FROM admin_requests WHERE status NOT IN ('concluido','indeferido','arquivado')`).get().c,
      exigencia: db.prepare(`SELECT COUNT(*) c FROM admin_requests WHERE status = 'exigencia'`).get().c,
      prazo_proximo: db.prepare(`SELECT COUNT(*) c FROM admin_requests WHERE deadline_date IS NOT NULL AND deadline_date != '' AND deadline_date <= ? AND status NOT IN ('concluido','indeferido','arquivado')`).get(soon).c,
      vencidos: db.prepare(`SELECT COUNT(*) c FROM admin_requests WHERE deadline_date IS NOT NULL AND deadline_date != '' AND deadline_date < ? AND status NOT IN ('concluido','indeferido','arquivado')`).get(today).c
    };
    return res.json({ success: true, count: rows.length, stats, statuses: STATUSES, spheres: SPHERES, requests: rows });
  } catch (err) {
    console.error('[REQ-ADM] Falha ao listar:', err);
    return res.status(500).json({ error: 'Erro ao listar requerimentos.' });
  }
});

/** GET /api/admin-requests/:id — detalhe + histórico. */
adminRequestsRouter.get('/api/admin-requests/:id', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Requerimento não encontrado.' });
    const updates = db.prepare(`SELECT * FROM admin_request_updates WHERE request_id = ? ORDER BY update_date DESC, id DESC`).all(r.id);
    return res.json({ success: true, request: r, updates });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar requerimento.' });
  }
});

/** POST /api/admin-requests — cria um requerimento. */
adminRequestsRouter.post('/api/admin-requests', requireAuth, (req, res) => {
  try {
    const b = req.body || {};
    const { client_id = null, client_name = null, title, agency_name, agency_sphere = 'federal',
            request_type = null, protocol_number = null, status = 'protocolado',
            filed_date = null, deadline_date = null, responsible = null, description = null } = b;
    if (!title || !agency_name) return res.status(400).json({ error: 'Objeto e órgão são obrigatórios.' });
    if (!SPHERES[agency_sphere]) return res.status(400).json({ error: 'Esfera inválida.' });
    if (!STATUSES[status]) return res.status(400).json({ error: 'Status inválido.' });

    const id = genId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO admin_requests (id, client_id, client_name, title, agency_name, agency_sphere,
        request_type, protocol_number, status, filed_date, deadline_date, responsible, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, client_id, client_name, title.trim(), agency_name.trim(), agency_sphere,
           request_type, protocol_number, status, filed_date, deadline_date, responsible, description, now, now);

    logAudit(req, { event_type: 'CRIACAO', event_name: 'CRIAR_REQUERIMENTO_ADM', module: 'REQUERIMENTOS',
      resource_id: id, description: `Requerimento ${id} ("${title}") criado no órgão ${agency_name} (${SPHERES[agency_sphere]}).` });
    return res.status(201).json({ success: true, id, request: db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(id) });
  } catch (err) {
    console.error('[REQ-ADM] Falha ao criar:', err);
    return res.status(500).json({ error: 'Erro ao criar requerimento.' });
  }
});

/** PUT /api/admin-requests/:id — atualiza campos. */
adminRequestsRouter.put('/api/admin-requests/:id', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Requerimento não encontrado.' });
    const b = req.body || {};
    const fields = ['client_id', 'client_name', 'title', 'agency_name', 'agency_sphere', 'request_type',
                    'protocol_number', 'status', 'filed_date', 'deadline_date', 'responsible', 'description', 'outcome'];
    const sets = [], vals = [];
    for (const f of fields) { if (b[f] !== undefined) { sets.push(`${f} = ?`); vals.push(b[f]); } }
    if (!sets.length) return res.json({ success: true, request: r });
    sets.push(`updated_at = ?`); vals.push(new Date().toISOString());
    vals.push(r.id);
    db.prepare(`UPDATE admin_requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'ATUALIZAR_REQUERIMENTO_ADM', module: 'REQUERIMENTOS',
      resource_id: r.id, description: `Requerimento ${r.id} atualizado.` });
    return res.json({ success: true, request: db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(r.id) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar requerimento.' });
  }
});

/** PATCH /api/admin-requests/:id/status — muda status rapidamente. */
adminRequestsRouter.patch('/api/admin-requests/:id/status', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Requerimento não encontrado.' });
    const { status } = req.body || {};
    if (!STATUSES[status]) return res.status(400).json({ error: 'Status inválido.' });
    const now = new Date().toISOString();
    db.prepare(`UPDATE admin_requests SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, r.id);
    db.prepare(`INSERT INTO admin_request_updates (request_id, update_date, description, author, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(r.id, now.slice(0, 10), `Status alterado para "${STATUSES[status]}".`, req.user.name || req.user.username, now);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao mudar status.' });
  }
});

/** POST /api/admin-requests/:id/updates — adiciona um andamento. */
adminRequestsRouter.post('/api/admin-requests/:id/updates', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Requerimento não encontrado.' });
    const { description, update_date } = req.body || {};
    if (!description) return res.status(400).json({ error: 'Descrição do andamento é obrigatória.' });
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO admin_request_updates (request_id, update_date, description, author, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(r.id, update_date || now.slice(0, 10), description.trim(), req.user.name || req.user.username, now);
    db.prepare(`UPDATE admin_requests SET updated_at = ? WHERE id = ?`).run(now, r.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao adicionar andamento.' });
  }
});

/** DELETE /api/admin-requests/:id — remove. */
adminRequestsRouter.delete('/api/admin-requests/:id', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Requerimento não encontrado.' });
    db.prepare(`DELETE FROM admin_requests WHERE id = ?`).run(r.id);
    logAudit(req, { event_type: 'EXCLUSAO', event_name: 'EXCLUIR_REQUERIMENTO_ADM', module: 'REQUERIMENTOS',
      resource_id: r.id, description: `Requerimento ${r.id} ("${r.title}") excluído.` });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao excluir requerimento.' });
  }
});
