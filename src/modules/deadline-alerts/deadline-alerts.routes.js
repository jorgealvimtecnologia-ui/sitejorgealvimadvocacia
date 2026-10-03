/**
 * Alertas de prazo por WhatsApp/e-mail — SÓ PARA ADVOGADOS (AUD-04).
 * A lógica (quem é advogado, escalonamento, ciência, reenvio) está em
 * deadline-alerts.service.js; aqui ficam as rotas, o agendador e a ligação com o painel.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { isMasterSession } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { createNotification } from '../notifications/notifications.routes.js';
import { sendWhatsAppMessage } from '../../shared/notify.js';
import { sendEmail, isEmailConfigured } from '../../shared/email.js';
import {
  ensureDeadlineAlertTables,
  loadLawyers,
  loadExcluded,
  loadDeadlines,
  runDeadlineAlerts,
  recordAck,
  getAckSecret,
  verifyAckToken,
  normalizeBrPhone,
  isValidEmail,
  sameName,
  whyNotLawyer,
  inSendWindow,
  SEND_START_HOUR,
  SEND_END_HOUR,
  MAX_ATTEMPTS,
} from './deadline-alerts.service.js';

export const deadlineAlertsRouter = express.Router();
ensureDeadlineAlertTables(db);

const RESOURCE_TYPES = new Set(['calendar_event', 'court_publication', 'admin_request']);
const siteUrl = () => process.env.SITE_URL || 'https://jorgealvimadvocacia.com.br';
const publicLawyer = ({ verifiedLawyer, ...l }) => l;
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const clientIp = (req) => (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || null;

/** Avisos do painel gerados pelo motor (falha de envio e ausência de titular). */
function notifyPanel(n) {
  if (n.kind === 'desistiu') {
    createNotification({
      category: 'prazo',
      level: 'critical',
      title: `⚠️ Não consegui avisar ${n.recipient.name} (${n.channel}) sobre um prazo`,
      message: `${n.deadline.title}${n.deadline.process ? ` • Proc. ${n.deadline.process}` : ''} • vence ${n.deadline.due.split('-').reverse().join('/')} • motivo: ${n.reason || 'falha no envio'}`,
      link: '#tab:calendar',
      resource_type: n.deadline.type,
      resource_id: n.deadline.id,
      dedupe_key: `prazo-alerta-falha:${n.deadline.type}:${n.deadline.id}:${n.stage}:${n.recipient.id}:${n.channel}`,
    });
  } else if (n.kind === 'sem-titular') {
    createNotification({
      category: 'prazo',
      level: 'critical',
      title: '⚠️ Nenhum advogado titular configurado para receber alertas de prazo',
      message:
        'Há prazo sem advogado responsável identificado e ninguém para receber o aviso externo. Defina o titular em Alertas de prazo (somente advogados).',
      link: '#tab:users',
      dedupe_key: `prazo-sem-titular:${new Date().toISOString().slice(0, 10)}`,
    });
  }
}

const realSenders = {
  whatsapp: (phone, text) => sendWhatsAppMessage(phone, text),
  email: ({ to, subject, text }) => sendEmail({ to, subject, text }),
};

/** `now` é só para testes/uso interno (não é exposto por HTTP). */
export function runAlertsNow({ dryRun = false, now = new Date() } = {}) {
  return runDeadlineAlerts({ db, now, senders: realSenders, siteUrl: siteUrl(), dryRun, notify: notifyPanel });
}

let _started = false;
/** Varre os prazos ~90 s após o boot e depois de hora em hora. Idempotente. */
export function startDeadlineAlerts({ intervalMs = 60 * 60 * 1000, env = process.env } = {}) {
  if (_started || env.NODE_ENV === 'test' || env.DEADLINE_ALERTS_DISABLED === '1') return false;
  _started = true;
  const run = () =>
    runAlertsNow()
      .then((r) => {
        if (r.sent || r.failed)
          console.log(
            `📲 [PRAZOS] Alertas externos: ${r.sent} enviado(s), ${r.failed} falha(s), ${r.gaveUp} desistência(s).`
          );
      })
      .catch((e) => console.error('[PRAZOS] Erro no envio de alertas:', e.message));
  setTimeout(run, 90 * 1000).unref?.();
  setInterval(run, intervalMs).unref?.();
  return true;
}

// ============================================================================
//  Administração (somente o mestre — regra no RBAC)
// ============================================================================
deadlineAlertsRouter.get('/api/deadline-alerts/config', (req, res) => {
  const lawyers = loadLawyers(db).map(publicLawyer);
  res.json({
    lawyers,
    excluded: loadExcluded(db),
    hasTitular: lawyers.some((l) => l.isTitular),
    channels: { whatsapp: !!String(process.env.WHATSAPP_GATEWAY_URL || '').trim(), email: isEmailConfigured() },
    window: { startHour: SEND_START_HOUR, endHour: SEND_END_HOUR, openNow: inSendWindow() },
    maxAttempts: MAX_ATTEMPTS,
    rule: 'Alertas externos (WhatsApp/e-mail) só para integrante ativo com função de Advogado e OAB cadastrada.',
  });
});

deadlineAlertsRouter.put('/api/deadline-alerts/prefs/:memberId', (req, res) => {
  const member = db.prepare(`SELECT * FROM office_members WHERE id = ?`).get(req.params.memberId);
  if (!member) return res.status(404).json({ error: 'Integrante não encontrado.' });
  const why = whyNotLawyer(member);
  if (why)
    return res.status(400).json({
      error: `Este integrante não pode receber alertas de prazo: ${why}. Só advogados ativos, com OAB cadastrada.`,
    });

  const b = req.body || {};
  const lawyers = loadLawyers(db);
  const whatsapp = b.whatsapp ? normalizeBrPhone(b.whatsapp) : null;
  if (b.whatsapp && !whatsapp)
    return res.status(400).json({ error: 'WhatsApp inválido. Use DDD + número (ex.: (32) 99999-9999).' });
  if (b.alert_email && !isValidEmail(b.alert_email))
    return res.status(400).json({ error: 'E-mail de alerta inválido.' });
  const substitute = b.substitute_member_id || null;
  if (substitute) {
    if (substitute === member.id)
      return res.status(400).json({ error: 'O substituto não pode ser o próprio advogado.' });
    if (!lawyers.some((l) => l.id === substitute))
      return res.status(400).json({ error: 'O substituto precisa ser um advogado ativo com OAB.' });
  }
  const flag = (v, def) => (v === undefined || v === null ? def : v ? 1 : 0);
  const old = db.prepare(`SELECT * FROM deadline_alert_prefs WHERE member_id = ?`).get(member.id) || {};
  db.prepare(
    `INSERT OR REPLACE INTO deadline_alert_prefs (member_id, notify_whatsapp, notify_email, whatsapp, alert_email, is_titular, substitute_member_id, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    member.id,
    flag(b.notify_whatsapp, old.notify_whatsapp ?? 1),
    flag(b.notify_email, old.notify_email ?? 1),
    whatsapp,
    b.alert_email ? b.alert_email.trim() : null,
    flag(b.is_titular, old.is_titular ?? 0),
    substitute,
    req.user?.name || req.user?.username || 'mestre',
    new Date().toISOString()
  );
  logAudit(req, {
    event_type: 'ALTERACAO',
    event_name: 'ALERTA_PRAZO_PREFS',
    module: 'PRAZOS',
    resource_id: member.id,
    description: `Preferências de alerta de prazo de ${member.name} atualizadas.`,
  });
  res.json({ success: true, lawyer: publicLawyer(loadLawyers(db).find((l) => l.id === member.id)) });
});

deadlineAlertsRouter.get('/api/deadline-alerts/log', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const status = ['enviado', 'falha', 'desistiu'].includes(req.query.status) ? req.query.status : null;
  const rows = db
    .prepare(`SELECT * FROM deadline_alert_log ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...(status ? [status, limit] : [limit]));
  const counts = Object.fromEntries(
    db
      .prepare(`SELECT status, COUNT(*) c FROM deadline_alert_log GROUP BY status`)
      .all()
      .map((r) => [r.status, r.c])
  );
  res.json({ counts, log: rows, acks: db.prepare(`SELECT * FROM deadline_acks ORDER BY id DESC LIMIT ?`).all(limit) });
});

deadlineAlertsRouter.post('/api/deadline-alerts/run', async (req, res) => {
  try {
    const dryRun = !!(req.body && req.body.dry_run);
    const r = await runAlertsNow({ dryRun });
    logAudit(req, {
      event_type: 'EXECUCAO',
      event_name: dryRun ? 'ALERTA_PRAZO_SIMULACAO' : 'ALERTA_PRAZO_EXECUCAO',
      module: 'PRAZOS',
      description: `Alertas de prazo: ${r.planned} previsto(s), ${r.sent} enviado(s), ${r.failed} falha(s).`,
    });
    res.json({ success: true, dryRun, ...r });
  } catch (e) {
    console.error('[PRAZOS] run:', e.message);
    res.status(500).json({ error: 'Falha ao executar os alertas de prazo.' });
  }
});

// ============================================================================
//  Ciência pelo painel (advogado logado)
// ============================================================================
deadlineAlertsRouter.post('/api/deadline-alerts/ack', requireAuth, (req, res) => {
  const { resource_type: type, resource_id: id } = req.body || {};
  if (!RESOURCE_TYPES.has(type) || !id)
    return res.status(400).json({ error: 'Informe resource_type e resource_id do prazo.' });
  if (!loadDeadlines(db).some((d) => d.type === type && d.id === String(id)))
    return res.status(404).json({ error: 'Prazo não encontrado ou já encerrado.' });

  const lawyers = loadLawyers(db);
  const u = req.user || {};
  let lawyer = lawyers.find((l) => sameName(l.name, u.name));
  if (!lawyer && isMasterSession(u)) lawyer = lawyers.find((l) => l.isTitular); // o mestre confirma como titular
  if (!lawyer)
    return res
      .status(403)
      .json({ error: 'Somente advogados cadastrados (ativos, com OAB) podem confirmar ciência de prazo.' });

  const r = recordAck(db, { type, id, member: lawyer, via: 'painel', actor: u.name || u.username, ip: clientIp(req) });
  logAudit(req, {
    event_type: 'CIENCIA',
    event_name: 'CIENCIA_PRAZO',
    module: 'PRAZOS',
    resource_id: String(id),
    description: `${lawyer.name} confirmou ciência do prazo ${type}:${id} pelo painel.`,
  });
  res.json({ success: true, alreadyAcknowledged: !r.created, lawyer: lawyer.name });
});

// ============================================================================
//  Ciência pelo link do WhatsApp/e-mail (pública; o link é a credencial)
//  GET só MOSTRA a página; quem confirma é o POST — assim o pré-visualizador de
//  links do WhatsApp/e-mail nunca confirma a ciência sozinho.
// ============================================================================
const page = (title, body, status = 200) => ({
  status,
  html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 4px 18px #0f172a14}
h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.5;margin:8px 0}.k{color:#64748b;font-size:12px}
button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#1e3e62;color:#fff;font-size:16px;font-weight:700;cursor:pointer}.ok{color:#047857;font-weight:700}</style></head>
<body><div class="card"><h1>${esc(title)}</h1>${body}<p class="k">Jorge Alvim Advocacia</p></div></body></html>`,
});

function describeToken(token) {
  const data = verifyAckToken(getAckSecret(db), token);
  if (!data) return null;
  const lawyer = loadLawyers(db).find((l) => l.id === data.memberId);
  const deadline = loadDeadlines(db).find((d) => d.type === data.type && d.id === data.id);
  return { data, lawyer, deadline };
}

const send = (res, p) => res.status(p.status).set('Cache-Control', 'no-store').type('html').send(p.html);
const INVALID = page(
  'Link inválido ou expirado',
  '<p>Este link de confirmação não é válido ou já expirou. Se o prazo ainda estiver aberto, confirme a ciência pelo painel.</p>',
  410
);

deadlineAlertsRouter.get('/ciencia/:token', (req, res) => {
  const t = describeToken(req.params.token);
  if (!t || !t.lawyer) return send(res, INVALID);
  if (!t.deadline)
    return send(res, page('Prazo encerrado', '<p>Este prazo não está mais em aberto. Nada a confirmar.</p>'));
  const d = t.deadline;
  send(
    res,
    page(
      'Confirmar ciência do prazo',
      `
    <p><b>${esc(d.title)}</b></p>
    ${d.process ? `<p>Processo: ${esc(d.process)}</p>` : ''}
    <p>Data fatal: <b>${esc(d.due.split('-').reverse().join('/'))}</b></p>
    <p class="k">Confirmação em nome de Dr(a). ${esc(t.lawyer.name)}.</p>
    <form method="POST" action="/ciencia/${esc(req.params.token)}"><button type="submit">Confirmo que estou ciente deste prazo</button></form>`
    )
  );
});

deadlineAlertsRouter.post('/ciencia/:token', (req, res) => {
  const t = describeToken(req.params.token);
  if (!t || !t.lawyer) return send(res, INVALID);
  if (!t.deadline)
    return send(res, page('Prazo encerrado', '<p>Este prazo não está mais em aberto. Nada a confirmar.</p>'));
  const r = recordAck(db, { type: t.data.type, id: t.data.id, member: t.lawyer, via: 'link', ip: clientIp(req) });
  logAudit(req, {
    event_type: 'CIENCIA',
    event_name: 'CIENCIA_PRAZO_LINK',
    module: 'PRAZOS',
    resource_id: t.data.id,
    user_name: t.lawyer.name,
    description: `${t.lawyer.name} confirmou ciência do prazo ${t.data.type}:${t.data.id} pelo link.`,
  });
  send(
    res,
    page(
      'Ciência registrada',
      `<p class="ok">✔ ${r.created ? 'Ciência registrada.' : 'A ciência já estava registrada.'}</p><p>Prazo: <b>${esc(t.deadline.title)}</b> (${esc(t.deadline.due.split('-').reverse().join('/'))})</p><p class="k">Quem confirmou: Dr(a). ${esc(t.lawyer.name)}.</p>`
    )
  );
});
