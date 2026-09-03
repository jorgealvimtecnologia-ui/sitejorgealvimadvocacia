import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';

export const notificationsRouter = express.Router();

// ============================================================================
//  CENTRAL DE NOTIFICAÇÕES & ALERTAS DE PRAZO FATAL
//  - Tabela própria deste módulo (auto-criada na importação).
//  - createNotification() é exportada para os demais módulos emitirem avisos
//    (assinaturas concluídas, novas solicitações LGPD, etc.).
//  - scanDeadlines() varre a agenda (calendar_events) e as publicações
//    (court_publications) procurando prazos que entraram na janela de alerta,
//    escalando o aviso conforme a data fatal se aproxima (15 → 7 → 3 → 1 → 0 dias).
//    A deduplicação por `dedupe_key` impede alertas repetidos.
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'geral',   -- 'prazo', 'assinatura', 'lgpd', 'financeiro', 'geral'
    level TEXT NOT NULL DEFAULT 'info',        -- 'info', 'warning', 'critical'
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,                                 -- rota/aba destino no painel (ex: '#tab:calendar')
    resource_type TEXT,                        -- 'calendar_event', 'court_publication', etc.
    resource_id TEXT,
    target_user_id TEXT,                       -- NULL = visível para todos os operadores
    dedupe_key TEXT UNIQUE,                    -- evita duplicidade do mesmo alerta
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);`); } catch (e) {}

/**
 * Cria uma notificação. Retorna a linha criada (ou a existente, se dedupe_key colidir).
 * Uso por outros módulos:
 *   import { createNotification } from '../notifications/notifications.routes.js';
 *   createNotification({ category:'assinatura', title:'...', message:'...', link:'#tab:esign' });
 */
export function createNotification({
  category = 'geral',
  level = 'info',
  title,
  message = null,
  link = null,
  resource_type = null,
  resource_id = null,
  target_user_id = null,
  dedupe_key = null
}) {
  if (!title) return null;
  try {
    const now = new Date().toISOString();
    if (dedupe_key) {
      const existing = db.prepare(`SELECT * FROM notifications WHERE dedupe_key = ?`).get(dedupe_key);
      if (existing) return existing;
    }
    const info = db.prepare(`
      INSERT INTO notifications
        (category, level, title, message, link, resource_type, resource_id, target_user_id, dedupe_key, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(category, level, title, message, link, resource_type, resource_id, target_user_id, dedupe_key, now);
    return db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(info.lastInsertRowid);
  } catch (err) {
    // Se colidiu no índice UNIQUE por corrida, apenas ignora.
    if (!String(err.message || '').includes('UNIQUE')) {
      console.error('[NOTIFICAÇÕES] Falha ao criar notificação:', err.message);
    }
    return dedupe_key ? db.prepare(`SELECT * FROM notifications WHERE dedupe_key = ?`).get(dedupe_key) : null;
  }
}

// Janelas de escalonamento (em dias) do maior para o menor.
const ALERT_THRESHOLDS = [15, 7, 3, 1, 0];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  // Aceita 'YYYY-MM-DD' ou ISO completo.
  const target = new Date(dateStr.length <= 10 ? `${dateStr}T23:59:59` : dateStr);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((startOfTarget - startOfToday) / (1000 * 60 * 60 * 24));
}

function bucketFor(daysLeft) {
  // Retorna o menor threshold >= daysLeft (a "faixa" atual de urgência); null se fora da janela.
  if (daysLeft === null || daysLeft < 0) return daysLeft !== null && daysLeft < 0 ? 0 : null;
  for (let i = ALERT_THRESHOLDS.length - 1; i >= 0; i--) {
    if (daysLeft <= ALERT_THRESHOLDS[i]) return ALERT_THRESHOLDS[i];
  }
  return null; // além de 15 dias: ainda não alerta
}

function urgencyLabel(daysLeft) {
  if (daysLeft < 0) return `VENCIDO há ${Math.abs(daysLeft)} dia(s)`;
  if (daysLeft === 0) return 'VENCE HOJE';
  if (daysLeft === 1) return 'vence AMANHÃ';
  return `faltam ${daysLeft} dias`;
}

/**
 * Varre agenda e publicações, gerando alertas de prazo. Retorna o nº de alertas criados.
 */
export function scanDeadlines() {
  let created = 0;
  const now = new Date().toISOString();

  // 1) Eventos de agenda: prazos fatais, audiências e diligências não concluídos.
  try {
    const events = db.prepare(`
      SELECT id, title, event_type, start_datetime, priority, status, lawyer_name, client_name, lawsuit_number
      FROM calendar_events
      WHERE status NOT IN ('concluido', 'cancelado')
        AND (event_type IN ('prazo_fatal', 'audiencia', 'diligencia') OR priority IN ('fatal', 'alta'))
    `).all();

    for (const ev of events) {
      const daysLeft = daysUntil(ev.start_datetime);
      const bucket = bucketFor(daysLeft);
      if (bucket === null) continue;
      const level = daysLeft <= 1 ? 'critical' : (daysLeft <= 3 ? 'warning' : 'info');
      const refs = [ev.lawsuit_number ? `Proc. ${ev.lawsuit_number}` : null, ev.client_name].filter(Boolean).join(' • ');
      const res = createNotification({
        category: 'prazo',
        level,
        title: `⏰ ${ev.title} — ${urgencyLabel(daysLeft)}`,
        message: [refs, ev.lawyer_name ? `Resp.: ${ev.lawyer_name}` : null].filter(Boolean).join(' | ') || null,
        link: '#tab:calendar',
        resource_type: 'calendar_event',
        resource_id: String(ev.id),
        dedupe_key: `prazo:calendar:${ev.id}:<=${bucket}d`
      });
      if (res && res.created_at === now) created++;
    }
  } catch (e) {
    console.warn('[NOTIFICAÇÕES] Varredura de agenda falhou:', e.message);
  }

  // 2) Publicações com data fatal calculada e ainda não arquivadas.
  try {
    const pubs = db.prepare(`
      SELECT id, numeroprocessocommascara, tipo_comunicacao, advogado_nome, deadline_date, status
      FROM court_publications
      WHERE status NOT IN ('arquivado') AND deadline_date IS NOT NULL AND deadline_date != ''
    `).all();

    for (const p of pubs) {
      const daysLeft = daysUntil(p.deadline_date);
      const bucket = bucketFor(daysLeft);
      if (bucket === null) continue;
      const level = daysLeft <= 1 ? 'critical' : (daysLeft <= 3 ? 'warning' : 'info');
      const res = createNotification({
        category: 'prazo',
        level,
        title: `📢 Prazo de ${p.tipo_comunicacao || 'publicação'} — ${urgencyLabel(daysLeft)}`,
        message: [p.numeroprocessocommascara ? `Proc. ${p.numeroprocessocommascara}` : null, p.advogado_nome].filter(Boolean).join(' • ') || null,
        link: '#tab:publications',
        resource_type: 'court_publication',
        resource_id: String(p.id),
        dedupe_key: `prazo:publicacao:${p.id}:<=${bucket}d`
      });
      if (res && res.created_at === now) created++;
    }
  } catch (e) {
    console.warn('[NOTIFICAÇÕES] Varredura de publicações falhou:', e.message);
  }

  return created;
}

let _scannerStarted = false;
/** Inicia a varredura periódica (idempotente). Chamada no boot do server.js. */
export function startDeadlineScanner(intervalMs = 60 * 60 * 1000) {
  if (_scannerStarted) return;
  _scannerStarted = true;
  const run = () => {
    try {
      const n = scanDeadlines();
      if (n > 0) console.log(`🔔 [NOTIFICAÇÕES] ${n} novo(s) alerta(s) de prazo gerado(s).`);
    } catch (e) {
      console.error('[NOTIFICAÇÕES] Erro na varredura periódica:', e.message);
    }
  };
  // Primeira varredura logo após o boot, depois no intervalo.
  setTimeout(run, 8000).unref?.();
  setInterval(run, intervalMs).unref?.();
}

// ----------------------------------------------------------------------------
//  ROTAS
// ----------------------------------------------------------------------------

/** GET /api/notifications — lista + contadores. ?box=unread|all&limit=50 */
notificationsRouter.get('/api/notifications', requireAuth, (req, res) => {
  try {
    const { box = 'all', limit = 50 } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    let where = `1=1`;
    if (box === 'unread') where += ` AND is_read = 0`;
    const rows = db.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT ?`).all(lim);
    const unread = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0`).get().c;
    const critical = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0 AND level = 'critical'`).get().c;
    return res.json({ success: true, unread, critical, count: rows.length, notifications: rows });
  } catch (err) {
    console.error('[NOTIFICAÇÕES] Falha ao listar:', err);
    return res.status(500).json({ error: 'Erro ao carregar notificações.' });
  }
});

/** POST /api/notifications/scan — dispara a varredura manualmente (botão "Verificar prazos agora"). */
notificationsRouter.post('/api/notifications/scan', requireAuth, (req, res) => {
  try {
    const created = scanDeadlines();
    const unread = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0`).get().c;
    return res.json({ success: true, created, unread, message: created > 0 ? `${created} novo(s) alerta(s).` : 'Nenhum prazo novo na janela de alerta.' });
  } catch (err) {
    console.error('[NOTIFICAÇÕES] Falha na varredura manual:', err);
    return res.status(500).json({ error: 'Erro ao varrer prazos.' });
  }
});

/** PATCH /api/notifications/:id/read — marca como lida/não lida. */
notificationsRouter.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const isRead = req.body?.is_read === false ? 0 : 1;
    const row = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'Notificação não encontrada.' });
    db.prepare(`UPDATE notifications SET is_read = ?, read_at = ? WHERE id = ?`)
      .run(isRead, isRead ? new Date().toISOString() : null, id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar notificação.' });
  }
});

/** POST /api/notifications/read-all — marca todas como lidas. */
notificationsRouter.post('/api/notifications/read-all', requireAuth, (req, res) => {
  try {
    const now = new Date().toISOString();
    const info = db.prepare(`UPDATE notifications SET is_read = 1, read_at = ? WHERE is_read = 0`).run(now);
    return res.json({ success: true, updated: info.changes });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao marcar notificações.' });
  }
});

/** DELETE /api/notifications/:id — remove uma notificação. */
notificationsRouter.delete('/api/notifications/:id', requireAuth, (req, res) => {
  try {
    db.prepare(`DELETE FROM notifications WHERE id = ?`).run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao remover notificação.' });
  }
});
