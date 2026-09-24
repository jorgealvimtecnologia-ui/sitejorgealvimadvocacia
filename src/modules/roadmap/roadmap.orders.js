/**
 * Ordens do Construtor (Roadmap Vivo) — regras e persistência.
 *
 * O banco de PRODUÇÃO é a fonte única: o Dr. Jorge lança as ordens no painel do site
 * e os agentes (Claude, Antigravity) as leem/atualizam pela API de agentes
 * (ver roadmap.agent.js e scripts/roadmap-agent.js). Nada é apagado: "remover" uma
 * ordem a arquiva (status 'cancelada') e toda mudança entra no histórico.
 */
import { db } from '../../config/db.js';

export const ORDER_STATUSES = ['planejado', 'em_curso', 'bloqueado', 'conforme', 'cancelada'];
export const OPEN_STATUSES = ['planejado', 'em_curso', 'bloqueado'];
export const ORDER_PRIORITIES = ['P0', 'P1', 'P2'];
export const ORDER_LAYERS = ['Core Jurídico', 'Inteligência Artificial', 'Conectividade & Integrações', 'Segurança, Compliance & SaaS'];
export const ORDER_WAVES = [
  'Onda 0 — Blindagem Imediata',
  'Onda 1 — Confiabilidade & SRE',
  'Onda 2 — Governança & CI/CD',
  'Onda 3 — Produto & Captação',
  'Onda 4 — Escala SaaS B2B'
];
const DEFAULT_WAVE = 'Onda 1 — Confiabilidade & SRE';
const ORDER_ID_RE = /^ORD-[A-Z0-9-]{3,40}$/;
const LIMITS = { title: 200, description: 4000, acceptance_criteria: 4000, note: 2000, actor: 60 };

export function ensureOrderTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_builder_orders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      layer TEXT DEFAULT 'Core Jurídico',
      wave TEXT DEFAULT '${DEFAULT_WAVE}',
      priority TEXT DEFAULT 'P1',
      status TEXT DEFAULT 'planejado',
      acceptance_criteria TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roadmap_order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      action TEXT NOT NULL,
      title TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      details TEXT,
      performed_by TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const cols = db.prepare(`PRAGMA table_info(roadmap_builder_orders)`).all().map(c => c.name);
  if (!cols.includes('assigned_to')) db.exec(`ALTER TABLE roadmap_builder_orders ADD COLUMN assigned_to TEXT`);
  if (!cols.includes('completed_at')) db.exec(`ALTER TABLE roadmap_builder_orders ADD COLUMN completed_at TEXT`);
}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

export function cleanActor(value, fallback) {
  const s = cleanText(value, LIMITS.actor).replace(/[^\p{L}\p{N} ._@-]/gu, '');
  return s || fallback;
}

export function isValidOrderId(id) {
  return ORDER_ID_RE.test(String(id || ''));
}

/** Valida e normaliza os campos de uma ordem. partial=true para atualizações. */
export function validateOrderInput(body, { partial = false } = {}) {
  const b = body || {};
  const out = {};

  if (!partial || b.title !== undefined) {
    const title = cleanText(b.title, LIMITS.title);
    if (!title) return { error: 'O título da ordem é obrigatório.' };
    out.title = title;
  }
  if (!partial || b.description !== undefined) out.description = cleanText(b.description, LIMITS.description);
  if (!partial || b.acceptance_criteria !== undefined) out.acceptance_criteria = cleanText(b.acceptance_criteria, LIMITS.acceptance_criteria);

  if (b.priority !== undefined || !partial) {
    const p = b.priority === undefined ? 'P1' : String(b.priority);
    if (!ORDER_PRIORITIES.includes(p)) return { error: `Prioridade inválida. Use: ${ORDER_PRIORITIES.join(', ')}.` };
    out.priority = p;
  }
  if (b.layer !== undefined || !partial) {
    const l = b.layer === undefined ? ORDER_LAYERS[0] : String(b.layer);
    if (!ORDER_LAYERS.includes(l)) return { error: 'Camada inválida.' };
    out.layer = l;
  }
  if (b.wave !== undefined || !partial) {
    const w = b.wave === undefined ? DEFAULT_WAVE : String(b.wave);
    if (!ORDER_WAVES.includes(w)) return { error: 'Onda inválida.' };
    out.wave = w;
  }
  if (b.status !== undefined) {
    const s = String(b.status);
    if (!ORDER_STATUSES.includes(s)) return { error: `Status inválido. Use: ${ORDER_STATUSES.join(', ')}.` };
    out.status = s;
  }
  return { value: out };
}

function addHistory({ orderId, action, title, previous, next, details, actor, at }) {
  db.prepare(`
    INSERT INTO roadmap_order_history (order_id, action, title, previous_status, new_status, details, performed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, action, title, previous ?? null, next ?? null, cleanText(details, LIMITS.note), actor, toIsoOr(at, new Date().toISOString()));
}

function toIsoOr(value, fallback) {
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

function newOrderId() {
  return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
}

export function getOrder(id) {
  return db.prepare(`SELECT * FROM roadmap_builder_orders WHERE id = ?`).get(id);
}

export function listOrders({ includeCancelled = false } = {}) {
  const where = includeCancelled ? '' : `WHERE status != 'cancelada'`;
  return db.prepare(`
    SELECT * FROM roadmap_builder_orders ${where}
    ORDER BY CASE status WHEN 'em_curso' THEN 1 WHEN 'bloqueado' THEN 2 WHEN 'planejado' THEN 3 WHEN 'conforme' THEN 4 ELSE 5 END,
             CASE priority WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 ELSE 3 END,
             created_at ASC
  `).all();
}

export function listHistory(limit = 200) {
  return db.prepare(`SELECT * FROM roadmap_order_history ORDER BY id DESC LIMIT ?`).all(Math.min(Math.max(1, limit), 1000));
}

/** Resumo do painel de controle: quanto falta e se tudo o que foi programado terminou. */
export function getOrdersSummary() {
  const counts = { planejado: 0, em_curso: 0, bloqueado: 0, conforme: 0, cancelada: 0 };
  for (const r of db.prepare(`SELECT status, COUNT(*) AS n FROM roadmap_builder_orders GROUP BY status`).all()) {
    if (r.status in counts) counts[r.status] = r.n;
  }
  const open = counts.planejado + counts.em_curso + counts.bloqueado;
  const total = open + counts.conforme;
  const last = db.prepare(`SELECT performed_by, action, created_at, order_id, title FROM roadmap_order_history ORDER BY id DESC LIMIT 1`).get() || null;
  return {
    counts,
    open,
    total,
    progress_percentage: total ? Math.round((counts.conforme / total) * 100) : 0,
    all_done: total > 0 && open === 0,
    last_activity: last
  };
}

export function createOrder(input, actor, { id, createdAt, status } = {}) {
  const now = new Date().toISOString();
  const orderId = id && isValidOrderId(id) ? id : newOrderId();
  const at = toIsoOr(createdAt, now);
  const st = status && ORDER_STATUSES.includes(status) ? status : 'planejado';
  db.prepare(`
    INSERT INTO roadmap_builder_orders (id, title, description, layer, wave, priority, status, acceptance_criteria, created_by, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, input.title, input.description || '', input.layer, input.wave, input.priority, st,
    input.acceptance_criteria || '', actor, at, now, st === 'conforme' ? now : null);
  addHistory({ orderId, action: 'CRIADA', title: input.title, previous: null, next: st, details: input.acceptance_criteria, actor, at });
  return getOrder(orderId);
}

/** Atualiza campos/status; registra no histórico. note = observação do autor (ex.: agente). */
export function updateOrder(id, changes, actor, note = '') {
  const existing = getOrder(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = { ...existing, ...changes };
  const statusChanged = changes.status !== undefined && changes.status !== existing.status;
  let assigned = existing.assigned_to;
  if (statusChanged && changes.status === 'em_curso') assigned = actor;
  const completedAt = statusChanged ? (changes.status === 'conforme' ? now : null) : existing.completed_at;

  db.prepare(`
    UPDATE roadmap_builder_orders
    SET title = ?, description = ?, layer = ?, wave = ?, priority = ?, status = ?, acceptance_criteria = ?,
        assigned_to = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(next.title, next.description, next.layer, next.wave, next.priority, next.status, next.acceptance_criteria,
    assigned, completedAt, now, id);

  const onlyNote = !statusChanged && Object.keys(changes).length === 0;
  addHistory({
    orderId: id,
    action: statusChanged ? 'STATUS_ALTERADO' : (onlyNote ? 'NOTA' : 'DIRETRIZ_MODIFICADA'),
    title: next.title,
    previous: existing.status,
    next: next.status,
    details: note || (statusChanged ? `Status alterado de [${existing.status}] para [${next.status}]` : 'Diretriz atualizada'),
    actor,
    at: now
  });
  return getOrder(id);
}

/** "Remover" arquiva a ordem (status cancelada) — o registro e o histórico ficam preservados. */
export function archiveOrder(id, actor, reason = '') {
  return updateOrder(id, { status: 'cancelada' }, actor, reason || 'Ordem arquivada pelo construtor');
}

/** Importa ordens de outro banco (ex.: notebook) preservando id, data e histórico; ignora ids já existentes. */
export function importOrders(orders, history, actor) {
  const result = { imported: 0, skipped: 0, errors: [] };
  for (const raw of Array.isArray(orders) ? orders.slice(0, 500) : []) {
    if (!isValidOrderId(raw?.id)) { result.errors.push(`id inválido: ${String(raw?.id).slice(0, 40)}`); continue; }
    if (getOrder(raw.id)) { result.skipped++; continue; }
    // Leniente: valores fora da lista atual (ex.: onda antiga) viram o padrão, sem perder a ordem
    const adjusted = [];
    const pick = (val, list, def, label) => {
      if (list.includes(val)) return val;
      if (val) adjusted.push(`${label} "${cleanText(val, 80)}" → "${def}"`);
      return def;
    };
    const v = validateOrderInput({
      title: raw.title,
      description: raw.description,
      acceptance_criteria: raw.acceptance_criteria,
      priority: pick(raw.priority, ORDER_PRIORITIES, 'P1', 'prioridade'),
      layer: pick(raw.layer, ORDER_LAYERS, ORDER_LAYERS[0], 'camada'),
      wave: pick(raw.wave, ORDER_WAVES, DEFAULT_WAVE, 'onda')
    }, { partial: false });
    if (v.error) { result.errors.push(`${raw.id}: ${v.error}`); continue; }
    const importedBy = cleanActor(raw.created_by, actor);
    createOrder(v.value, importedBy, { id: raw.id, createdAt: raw.created_at, status: raw.status });
    // Substitui o "CRIADA" automático pelo histórico original, quando enviado
    const own = (Array.isArray(history) ? history : []).filter(h => h?.order_id === raw.id).slice(0, 500);
    if (own.length) {
      db.prepare(`DELETE FROM roadmap_order_history WHERE order_id = ?`).run(raw.id);
      for (const h of own) {
        addHistory({
          orderId: raw.id,
          action: cleanText(h.action, 40) || 'EVENTO',
          title: cleanText(h.title, LIMITS.title) || v.value.title,
          previous: ORDER_STATUSES.includes(h.previous_status) ? h.previous_status : null,
          next: ORDER_STATUSES.includes(h.new_status) ? h.new_status : null,
          details: h.details,
          actor: cleanActor(h.performed_by, importedBy),
          at: h.created_at
        });
      }
    }
    addHistory({
      orderId: raw.id, action: 'IMPORTADA', title: v.value.title, previous: null,
      next: ORDER_STATUSES.includes(raw.status) ? raw.status : 'planejado',
      details: 'Importada de banco local para o site' + (adjusted.length ? `; ajustes: ${adjusted.join('; ')}` : ''),
      actor
    });
    result.imported++;
  }
  return result;
}
