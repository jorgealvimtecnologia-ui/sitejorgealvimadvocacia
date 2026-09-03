import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';

export const analyticsRouter = express.Router();

// ============================================================================
//  ANALYTICS DE EVENTOS — TRANSPARENTE E ANÔNIMO (conforme LGPD)
//  - Registra cliques/eventos-chave do site de forma AGREGADA e ANÔNIMA:
//    NÃO grava IP, nome, CPF ou qualquer dado que identifique a pessoa.
//    A única chave é um "session_key" pseudônimo, gerado no navegador,
//    sem vínculo com a identidade do visitante.
//  - Só recebe eventos DEPOIS do consentimento (o front só envia se o
//    visitante aceitou no banner de cookies/analytics).
//  - O consentimento é registrado no módulo LGPD (lgpd_consents) para
//    trilha auditável.
//  - Fornece um FUNIL de conversão para o painel.
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS site_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT,          -- id pseudônimo do navegador (não identifica a pessoa)
    event_name TEXT NOT NULL,  -- 'page_view', 'click_whatsapp', 'click_client_area', 'click_area', 'form_submit', ...
    category TEXT,             -- 'navegacao' | 'engajamento' | 'intencao' | 'conversao'
    label TEXT,               -- rótulo não-identificável do elemento clicado
    path TEXT,
    referer TEXT,
    utm_source TEXT,
    utm_campaign TEXT,
    created_at TEXT NOT NULL
  );
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_site_events_name ON site_events(event_name, created_at);`); } catch (e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_site_events_session ON site_events(session_key);`); } catch (e) {}

// Eventos aceitos (allowlist) — evita poluição/abuso do endpoint público.
const ALLOWED_EVENTS = new Set([
  'page_view', 'click_whatsapp', 'click_client_area', 'click_panel',
  'click_area', 'click_blog', 'form_start', 'form_submit', 'scroll_deep', 'click_phone'
]);
const CATEGORY_BY_EVENT = {
  page_view: 'navegacao', click_blog: 'engajamento', click_area: 'engajamento',
  scroll_deep: 'engajamento', form_start: 'engajamento',
  click_whatsapp: 'intencao', click_client_area: 'intencao', click_phone: 'intencao', click_panel: 'intencao',
  form_submit: 'conversao'
};

function clean(s, max = 160) { return s == null ? null : String(s).slice(0, max); }

/** POST /api/analytics/event — recebe um evento anônimo (público, sem auth). */
analyticsRouter.post('/api/analytics/event', (req, res) => {
  try {
    const b = req.body || {};
    const event_name = String(b.event_name || '').trim();
    if (!ALLOWED_EVENTS.has(event_name)) {
      return res.status(400).json({ error: 'Evento inválido.' });
    }
    db.prepare(`
      INSERT INTO site_events (session_key, event_name, category, label, path, referer, utm_source, utm_campaign, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clean(b.session_key, 64), event_name, CATEGORY_BY_EVENT[event_name] || 'navegacao',
      clean(b.label), clean(b.path), clean(b.referer, 300),
      clean(b.utm_source, 80), clean(b.utm_campaign, 80), new Date().toISOString()
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao registrar evento.' });
  }
});

/** POST /api/analytics/consent — registra a decisão do banner de cookies no módulo LGPD. */
analyticsRouter.post('/api/analytics/consent', (req, res) => {
  try {
    const b = req.body || {};
    const granted = b.granted ? 1 : 0;
    const now = new Date().toISOString();
    // Grava no módulo LGPD (trilha auditável). Sujeito anônimo — sem PII.
    try {
      db.prepare(`
        INSERT INTO lgpd_consents (subject_type, subject_id, subject_name, subject_doc, purpose, channel, consent_text, granted, ip, user_agent, created_at)
        VALUES ('visitante', ?, 'Visitante anônimo do site', NULL, ?, 'site', ?, ?, NULL, ?, ?)
      `).run(
        clean(b.session_key, 64),
        'Cookies e analytics de navegação (eventos anônimos)',
        granted ? 'Aceitou cookies/analytics no banner do site.' : 'Optou por apenas essenciais no banner do site.',
        granted, clean(req.headers['user-agent'], 255), now
      );
    } catch (e) { /* tabela lgpd_consents é criada pelo módulo LGPD */ }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao registrar consentimento.' });
  }
});

/** GET /api/analytics/summary — funil + top eventos (painel, autenticado). ?days=30 */
analyticsRouter.get('/api/analytics/summary', requireAuth, (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const distinctByEvents = (names) => {
      const placeholders = names.map(() => '?').join(',');
      return db.prepare(
        `SELECT COUNT(DISTINCT session_key) c FROM site_events WHERE created_at >= ? AND event_name IN (${placeholders})`
      ).get(since, ...names).c;
    };

    const visitas = db.prepare(`SELECT COUNT(DISTINCT session_key) c FROM site_events WHERE created_at >= ?`).get(since).c;
    const engajamento = distinctByEvents(['click_area', 'click_blog', 'scroll_deep', 'form_start']);
    const intencao = distinctByEvents(['click_whatsapp', 'click_client_area', 'click_phone', 'click_panel']);
    const conversao = distinctByEvents(['form_submit']);

    const totalEvents = db.prepare(`SELECT COUNT(*) c FROM site_events WHERE created_at >= ?`).get(since).c;
    const byEvent = db.prepare(
      `SELECT event_name, COUNT(*) total FROM site_events WHERE created_at >= ? GROUP BY event_name ORDER BY total DESC`
    ).all(since);

    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

    return res.json({
      success: true,
      window_days: days,
      total_events: totalEvents,
      funnel: [
        { stage: 'Visitas', key: 'visitas', sessions: visitas, pct: 100 },
        { stage: 'Engajamento', key: 'engajamento', sessions: engajamento, pct: pct(engajamento, visitas) },
        { stage: 'Intenção de contato', key: 'intencao', sessions: intencao, pct: pct(intencao, visitas) },
        { stage: 'Conversão (formulário)', key: 'conversao', sessions: conversao, pct: pct(conversao, visitas) }
      ],
      by_event: byEvent
    });
  } catch (err) {
    console.error('[ANALYTICS] Falha no resumo:', err);
    return res.status(500).json({ error: 'Erro ao gerar resumo de analytics.' });
  }
});
