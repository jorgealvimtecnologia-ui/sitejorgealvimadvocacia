/**
 * Agendamento online de consulta (AUD-15). Só e-mail (sem WhatsApp).
 *
 *  Público:  GET  /api/booking/config            ligado? duração, áreas
 *            GET  /api/booking/slots?from=&days=  horários livres
 *            POST /api/booking                    marca (cria lead + evento na agenda + e-mail de confirmação)
 *            GET  /api/booking/manage/:token      consulta a própria marcação (link do e-mail)
 *            POST /api/booking/manage/:token/cancel | /reschedule
 *  Painel (aba Agenda): GET/PUT /api/booking/settings · GET /api/booking/appointments · POST /api/booking/appointments/:id/cancel
 *  Páginas:  /agendar  (o mesmo arquivo serve a marcação e o gerenciamento por ?t=TOKEN)
 *
 * O visitante só vê horários livres da agenda do advogado: cada marcação vira um evento "consulta" na agenda
 * (que passa a bloquear o horário) e um lead no funil. O link de gerenciamento fica só como HASH no banco.
 */
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { db } from '../../config/db.js';
import { ROOT_DIR } from '../../config/constants.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { requireRecaptcha } from '../recaptcha/recaptcha.middleware.js';
import { createNotification } from '../notifications/notifications.routes.js';
import { sendEmail, isEmailConfigured } from '../../shared/email.js';
import { generateNextClientId } from '../../shared/ids.js';
import { classifyOrigin } from '../../shared/lead-origin.js';
import { registerJob, markJobRun } from '../../shared/observability.js';
import {
  DEFAULT_CONFIG, normalizeConfig, nowSaoPaulo, busyIntervals, slotsForRange, isSlotFree, addMinutes, minutesOf, buildIcs,
} from '../../shared/booking-slots.js';

export const bookingRouter = express.Router();

const MAX_RESCHEDULES = 3;
const publicBase = () => (process.env.PUBLIC_BASE_URL || 'https://jorgealvimadvocacia.com.br').replace(/\/+$/, '');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brDate = (dt) => `${dt.slice(8, 10)}/${dt.slice(5, 7)}/${dt.slice(0, 4)}`;
const brWhen = (dt) => `${brDate(dt)} às ${dt.slice(11, 16)}`;

// ---------------------------------------------------------------- configuração
export function loadConfig() {
  const row = db.prepare(`SELECT value FROM booking_settings WHERE key = 'config'`).get();
  let stored = {};
  try { stored = row ? JSON.parse(row.value) : {}; } catch { stored = {}; }
  return normalizeConfig(stored).config;
}

function holidaySet() {
  try { return new Set(db.prepare('SELECT holiday_date FROM court_holidays').all().map((r) => r.holiday_date)); } catch { return new Set(); }
}

function busyFor(config, fromDate, toDate, excludeEventId = null) {
  const rows = db.prepare(
    `SELECT id, start_datetime, end_datetime, all_day, status, lawyer_id FROM calendar_events
      WHERE substr(start_datetime, 1, 10) BETWEEN ? AND ?`
  ).all(fromDate, toDate).filter((e) => e.id !== excludeEventId);
  return busyIntervals(rows, config);
}

// ---------------------------------------------------------------- limitador simples (por IP)
const hits = new Map();
/** Só para testes: zera os contadores do limitador. */
export function _resetLimits() { hits.clear(); }
function limit(name, max, windowMs = 10 * 60 * 1000) {
  return (req, res, next) => {
    const key = `${name}:${req.ip || req.socket?.remoteAddress || '?'}`;
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || now > rec.reset) rec = { count: 0, reset: now + windowMs };
    rec.count++;
    hits.set(key, rec);
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    if (rec.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((rec.reset - now) / 1000)));
      return res.status(429).json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' });
    }
    next();
  };
}

// ---------------------------------------------------------------- e-mails
function appointmentEmail(kind, a, config) {
  const manage = a._token ? `${publicBase()}/agendar?t=${a._token}` : '';
  const when = brWhen(a.start_datetime);
  const titulos = {
    confirmado: 'Sua consulta está confirmada',
    remarcado: 'Sua consulta foi remarcada',
    cancelado: 'Sua consulta foi cancelada',
    lembrete: 'Lembrete: sua consulta é amanhã',
  };
  const linhas = kind === 'cancelado'
    ? [`Olá, ${a.name}.`, `A consulta que estava marcada para ${when} foi cancelada.`, `Se quiser marcar outro horário: ${publicBase()}/agendar`]
    : [
      `Olá, ${a.name}.`,
      kind === 'lembrete' ? `Lembramos que sua consulta é em ${when}.` : `Sua consulta está agendada para ${when}.`,
      `Com: ${config.lawyer_name}`,
      `Onde: ${config.meeting_url ? `online — ${config.meeting_url}` : config.location}`,
      '',
      manage ? `Precisa remarcar ou cancelar? Use este link pessoal: ${manage}` : 'Precisa remarcar ou cancelar? Use o link pessoal que está no e-mail de confirmação da consulta.',
      'Se puder, tenha em mãos os documentos do seu caso (RG, CPF, comprovante de residência e o que tiver sobre o assunto).',
    ];
  const text = `${linhas.join('\n')}\n\nJorge Alvim Advocacia — OAB/MG 222.943`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0A192F">
    <h2 style="color:#0A192F">${esc(titulos[kind])}</h2>${linhas.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}
    <p style="color:#94a3b8;font-size:12px">Jorge Alvim Advocacia — OAB/MG 222.943</p></div>`;
  const attachments = kind === 'cancelado' ? undefined : [{
    filename: 'consulta.ics',
    content: buildIcs({ uid: `${a.id}@jorgealvimadvocacia.com.br`, start: a.start_datetime, end: a.end_datetime, title: `Consulta — Jorge Alvim Advocacia`, description: `Consulta com ${config.lawyer_name}`, location: config.meeting_url || config.location }),
  }];
  return { to: a.email, subject: `${titulos[kind]} — ${brDate(a.start_datetime)} ${a.start_datetime.slice(11, 16)}`, text, html, attachments };
}

async function mail(kind, appointment, token, config) {
  try {
    const r = await sendEmail(appointmentEmail(kind, { ...appointment, _token: token }, config));
    return r;
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

// ---------------------------------------------------------------- criação / alteração (síncronas e atômicas)
function newId() {
  const year = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    const id = `AGD-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!db.prepare('SELECT 1 FROM booking_appointments WHERE id = ?').get(id)) return id;
  }
  return `AGD-${year}-${Date.now()}`;
}

function slotContext(config, slotDate, excludeEventId = null) {
  return { busy: busyFor(config, slotDate, slotDate, excludeEventId), holidays: holidaySet(), now: nowSaoPaulo() };
}

/** Cria lead + evento + marcação, tudo ou nada. Devolve { ok, appointment, token } ou { ok:false, status, error }. */
export function createBooking(config, { name, email, phone, area, message, slot, attribution = {} }) {
  const token = crypto.randomBytes(24).toString('hex');
  const id = newId();
  const now = new Date().toISOString();
  const end = addMinutes(slot, config.slot_minutes);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!isSlotFree(slot, config, slotContext(config, slot.slice(0, 10)))) {
      db.exec('ROLLBACK');
      return { ok: false, status: 409, error: 'Este horário acabou de ser ocupado. Escolha outro, por favor.' };
    }
    const leadId = generateNextClientId();
    const o = classifyOrigin(attribution);
    db.prepare(`INSERT INTO leads (id, created_at, name, phone, area, message, files, status, stage, email, city, origin, origin_detail)
                VALUES (?, ?, ?, ?, ?, ?, '[]', 'Novo', 'recebido', ?, 'Juiz de Fora', ?, ?)`)
      .run(leadId, now, name, phone, area || 'Consulta agendada', `Agendamento online para ${brWhen(slot)}.${message ? ` ${message}` : ''}`, email, o.origin, o.detail ? `${o.detail}; via agendamento online` : 'via agendamento online');
    try {
      db.prepare(`INSERT INTO lead_events (lead_id, event_type, detail, performed_by, created_at) VALUES (?, 'recebido', ?, 'agendamento online', ?)`)
        .run(leadId, `Lead criado pelo agendamento online: consulta em ${brWhen(slot)}.`, now);
    } catch { /* trilha opcional */ }

    const eventId = `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`INSERT INTO calendar_events (id, title, description, event_type, start_datetime, end_datetime, all_day, location, meeting_url,
                  lawyer_id, lawyer_name, client_id, client_name, priority, status, ical_uid, notes, created_at, updated_at)
                VALUES (?, ?, ?, 'consulta', ?, ?, 0, ?, ?, ?, ?, ?, ?, 'normal', 'agendado', ?, ?, ?, ?)`)
      .run(eventId, `Consulta (agendamento online): ${name}`, `${area || ''}${message ? ` — ${message}` : ''}`.trim(), slot, end, config.location, config.meeting_url,
        config.lawyer_id || 'dr-jorge-alvim', config.lawyer_name, leadId, name, `${eventId}@jorgealvimadvocacia.com.br`, `Telefone: ${phone} • E-mail: ${email}`, now, now);

    db.prepare(`INSERT INTO booking_appointments (id, token_hash, start_datetime, end_datetime, name, email, phone, area, message, lead_id, event_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, sha(token), slot, end, name, email, phone, area || null, message || null, leadId, eventId, now, now);
    db.exec('COMMIT');
    return { ok: true, token, appointment: db.prepare('SELECT * FROM booking_appointments WHERE id = ?').get(id) };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* já encerrada */ }
    throw e;
  }
}

function byToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  return db.prepare('SELECT * FROM booking_appointments WHERE token_hash = ?').get(sha(token)) || null;
}

function cancelAppointment(a, by) {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE booking_appointments SET status = 'cancelado', cancelled_at = ?, updated_at = ? WHERE id = ?`).run(now, now, a.id);
    if (a.event_id) db.prepare(`UPDATE calendar_events SET status = 'cancelado', updated_at = ? WHERE id = ?`).run(now, a.event_id);
    if (a.lead_id) {
      try { db.prepare(`INSERT INTO lead_events (lead_id, event_type, detail, performed_by, created_at) VALUES (?, 'estagio', ?, ?, ?)`).run(a.lead_id, `Consulta de ${brWhen(a.start_datetime)} cancelada (${by}).`, by, now); } catch { /* opcional */ }
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* já encerrada */ }
    throw e;
  }
}

function modifiable(a, config, now = nowSaoPaulo()) {
  if (a.status !== 'confirmado') return { cancel: false, reschedule: false, why: a.status === 'cancelado' ? 'Esta consulta já foi cancelada.' : 'Esta consulta não pode mais ser alterada.' };
  const minutesLeft = minutesOf(a.start_datetime) - minutesOf(now);
  if (minutesLeft <= 0) return { cancel: false, reschedule: false, why: 'Esta consulta já passou.' };
  const canReschedule = minutesLeft >= config.min_notice_hours * 60 && a.reschedule_count < MAX_RESCHEDULES;
  return { cancel: true, reschedule: canReschedule, why: canReschedule ? '' : 'Para remarcar fora do prazo, entre em contato com o escritório.' };
}

const view = (a, config) => ({
  id: a.id, status: a.status, start: a.start_datetime, end: a.end_datetime, name: a.name, area: a.area,
  lawyer: config.lawyer_name, where: config.meeting_url ? 'Online' : config.location, can: modifiable(a, config),
});

// ---------------------------------------------------------------- rotas públicas
bookingRouter.get('/api/booking/config', limit('cfg', 120), (req, res) => {
  const c = loadConfig();
  res.json({ success: true, enabled: c.enabled, slot_minutes: c.slot_minutes, max_days_ahead: c.max_days_ahead, areas: c.areas, lawyer: c.lawyer_name, where: c.meeting_url ? 'Online' : c.location, min_notice_hours: c.min_notice_hours });
});

bookingRouter.get('/api/booking/slots', limit('slots', 120), (req, res) => {
  const c = loadConfig();
  if (!c.enabled) return res.json({ success: true, enabled: false, days: [] });
  const today = nowSaoPaulo().slice(0, 10);
  const fromRaw = String(req.query.from || today);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) && fromRaw >= today ? fromRaw : today;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 31);
  const to = addMinutes(`${from}T00:00`, days * 1440).slice(0, 10);
  const ctx = { busy: busyFor(c, from, to), holidays: holidaySet(), now: nowSaoPaulo() };
  res.json({ success: true, enabled: true, slot_minutes: c.slot_minutes, days: slotsForRange(from, days, c, ctx) });
});

function cleanBooking(b = {}) {
  const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
  const phone = String(b.phone || '').trim().slice(0, 30);
  const phoneDigits = phone.replace(/\D/g, '');
  const area = String(b.area || '').trim().slice(0, 60);
  const message = String(b.message || '').trim().slice(0, 600);
  const errors = [];
  if (name.length < 3) errors.push('Informe seu nome completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('Informe um e-mail válido (a confirmação vai para ele).');
  if (phoneDigits.length < 10 || phoneDigits.length > 13) errors.push('Informe um telefone com DDD.');
  if (b.consent !== true && b.consent !== 'true' && b.consent !== 1) errors.push('É preciso concordar com o uso dos seus dados para o atendimento (LGPD).');
  const attribution = { utm_source: b.utm_source, utm_medium: b.utm_medium, utm_campaign: b.utm_campaign, referrer: b.referrer };
  return { name, email, phone, area, message, slot: String(b.slot || ''), attribution, errors };
}

bookingRouter.post('/api/booking', limit('book', 10), (req, res, next) => {
  const b = req.body || {};
  if (b.website_hp || b._gotcha || b.company_hp) return res.status(200).json({ success: true, id: 'IGNORED' }); // robô: não grava
  next();
}, requireRecaptcha('booking_submit'), async (req, res) => {
  try {
    const config = loadConfig();
    if (!config.enabled) return res.status(503).json({ error: 'O agendamento online não está disponível no momento.' });
    const data = cleanBooking(req.body);
    if (data.errors.length) return res.status(400).json({ error: data.errors[0], errors: data.errors });
    if (!isSlotFree(data.slot, config, slotContext(config, data.slot.slice(0, 10)))) {
      return res.status(409).json({ error: 'Este horário não está mais disponível. Escolha outro, por favor.' });
    }
    const r = createBooking(config, data);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    const a = r.appointment;
    createNotification({
      category: 'agenda', level: 'info', title: `📅 Nova consulta agendada: ${a.name} — ${brWhen(a.start_datetime)}`,
      message: `${a.area || 'Assunto não informado'} • ${a.phone} • ${a.email}`, link: '#tab:calendar', resource_type: 'booking', resource_id: a.id, dedupe_key: `booking:${a.id}:novo`,
    });
    logAudit(req, { event_type: 'CRIACAO', event_name: 'AGENDAMENTO_ONLINE', module: 'AGENDA', resource_id: a.id, user_name: a.name, user_role: 'lead', description: `Consulta agendada pelo site para ${brWhen(a.start_datetime)}.` });
    const sent = await mail('confirmado', a, r.token, config);
    return res.status(201).json({
      success: true, id: a.id, start: a.start_datetime, end: a.end_datetime,
      manage_url: `${publicBase()}/agendar?t=${r.token}`, email_sent: !!sent.sent, email_configured: isEmailConfigured(),
    });
  } catch (e) {
    console.error('[AGENDAMENTO] Falha ao agendar:', e);
    return res.status(500).json({ error: 'Não foi possível concluir o agendamento. Tente novamente.' });
  }
});

bookingRouter.get('/api/booking/manage/:token', limit('manage', 40), (req, res) => {
  const a = byToken(req.params.token);
  if (!a) return res.status(404).json({ error: 'Link inválido ou expirado.' });
  res.json({ success: true, appointment: view(a, loadConfig()) });
});

bookingRouter.post('/api/booking/manage/:token/cancel', limit('manage', 40), async (req, res) => {
  try {
    const a = byToken(req.params.token);
    if (!a) return res.status(404).json({ error: 'Link inválido ou expirado.' });
    const config = loadConfig();
    const can = modifiable(a, config);
    if (!can.cancel) return res.status(409).json({ error: can.why });
    cancelAppointment(a, 'cliente');
    createNotification({ category: 'agenda', level: 'warning', title: `❌ Consulta cancelada pelo cliente: ${a.name} — ${brWhen(a.start_datetime)}`, link: '#tab:calendar', resource_type: 'booking', resource_id: a.id, dedupe_key: `booking:${a.id}:cancelado` });
    await mail('cancelado', a, req.params.token, config);
    res.json({ success: true });
  } catch (e) {
    console.error('[AGENDAMENTO] Falha ao cancelar:', e);
    res.status(500).json({ error: 'Não foi possível cancelar agora. Tente novamente.' });
  }
});

bookingRouter.post('/api/booking/manage/:token/reschedule', limit('manage', 40), async (req, res) => {
  try {
    const a = byToken(req.params.token);
    if (!a) return res.status(404).json({ error: 'Link inválido ou expirado.' });
    const config = loadConfig();
    const can = modifiable(a, config);
    if (!can.reschedule) return res.status(409).json({ error: can.why || 'Não é possível remarcar.' });
    const slot = String(req.body?.slot || '');
    const now = new Date().toISOString();
    const end = addMinutes(slot, config.slot_minutes);
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!isSlotFree(slot, config, slotContext(config, slot.slice(0, 10), a.event_id))) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'Este horário não está disponível. Escolha outro, por favor.' });
      }
      db.prepare(`UPDATE booking_appointments SET start_datetime = ?, end_datetime = ?, reminder_sent = 0, reschedule_count = reschedule_count + 1, updated_at = ? WHERE id = ?`).run(slot, end, now, a.id);
      if (a.event_id) db.prepare(`UPDATE calendar_events SET start_datetime = ?, end_datetime = ?, status = 'agendado', updated_at = ? WHERE id = ?`).run(slot, end, now, a.event_id);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* já encerrada */ }
      throw e;
    }
    const updated = db.prepare('SELECT * FROM booking_appointments WHERE id = ?').get(a.id);
    createNotification({ category: 'agenda', level: 'info', title: `🔁 Consulta remarcada: ${a.name} — ${brWhen(slot)}`, message: `Antes: ${brWhen(a.start_datetime)}`, link: '#tab:calendar', resource_type: 'booking', resource_id: a.id, dedupe_key: `booking:${a.id}:remarcado:${updated.reschedule_count}` });
    await mail('remarcado', updated, req.params.token, config);
    res.json({ success: true, appointment: view(updated, config) });
  } catch (e) {
    console.error('[AGENDAMENTO] Falha ao remarcar:', e);
    res.status(500).json({ error: 'Não foi possível remarcar agora. Tente novamente.' });
  }
});

// ---------------------------------------------------------------- painel
bookingRouter.get('/api/booking/settings', requireAuth, (req, res) => res.json({ success: true, config: loadConfig(), email_configured: isEmailConfigured() }));

bookingRouter.put('/api/booking/settings', requireAuth, (req, res) => {
  const { config, errors } = normalizeConfig({ ...loadConfig(), ...(req.body || {}) });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  db.prepare(`INSERT INTO booking_settings (key, value, updated_at) VALUES ('config', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(JSON.stringify(config), new Date().toISOString());
  logAudit(req, { event_type: 'ALTERACAO', event_name: 'AGENDAMENTO_CONFIG', module: 'AGENDA', description: `Agendamento online ${config.enabled ? 'LIGADO' : 'desligado'}; consultas de ${config.slot_minutes} min, ${config.start}–${config.end}.` });
  res.json({ success: true, config });
});

bookingRouter.get('/api/booking/appointments', requireAuth, (req, res) => {
  const status = String(req.query.status || '');
  const rows = db.prepare(`SELECT id, start_datetime, end_datetime, name, email, phone, area, message, status, lead_id, event_id, reschedule_count, created_at
                           FROM booking_appointments ${status ? 'WHERE status = ?' : ''} ORDER BY start_datetime DESC LIMIT 200`).all(...(status ? [status] : []));
  res.json({ success: true, appointments: rows });
});

bookingRouter.post('/api/booking/appointments/:id/cancel', requireAuth, async (req, res) => {
  const a = db.prepare('SELECT * FROM booking_appointments WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Marcação não encontrada.' });
  if (a.status !== 'confirmado') return res.status(409).json({ error: 'Esta marcação já não está confirmada.' });
  cancelAppointment(a, 'escritório');
  logAudit(req, { event_type: 'ALTERACAO', event_name: 'AGENDAMENTO_CANCELADO', module: 'AGENDA', resource_id: a.id, description: `Consulta de ${a.name} em ${brWhen(a.start_datetime)} cancelada pelo escritório.` });
  await mail('cancelado', a, '', loadConfig());
  res.json({ success: true });
});

// ---------------------------------------------------------------- páginas
bookingRouter.get('/agendar', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT_DIR, 'agendar.html'));
});

// ---------------------------------------------------------------- lembrete 24 h antes (e-mail)
/** Envia o lembrete das consultas que começam nas próximas ~24 h. Devolve quantos foram enviados. */
export async function sendDueReminders({ now = nowSaoPaulo(), send = sendEmail } = {}) {
  const config = loadConfig();
  const limitAt = addMinutes(now, 24 * 60);
  const due = db.prepare(`SELECT * FROM booking_appointments WHERE status = 'confirmado' AND reminder_sent = 0 AND start_datetime > ? AND start_datetime <= ?`).all(now, limitAt);
  let sent = 0;
  for (const a of due) {
    // o token real só existe no e-mail de confirmação (guardamos hash): o lembrete leva ao link de marcação geral
    const r = await send(appointmentEmail('lembrete', { ...a, _token: '' }, config)).catch(() => ({ sent: false }));
    if (r.sent) { db.prepare('UPDATE booking_appointments SET reminder_sent = 1 WHERE id = ?').run(a.id); sent++; }
  }
  return sent;
}

let _started = false;
export function startBookingReminders({ intervalMs = 30 * 60 * 1000 } = {}) {
  if (_started || process.env.NODE_ENV === 'test') return false;
  _started = true;
  registerJob('lembretes_agendamento', intervalMs);
  const run = () => sendDueReminders().then(() => markJobRun('lembretes_agendamento', true)).catch((e) => { markJobRun('lembretes_agendamento', false, e.message); console.error('[AGENDAMENTO] Erro nos lembretes:', e.message); });
  setTimeout(run, 2 * 60 * 1000).unref?.();
  setInterval(run, intervalMs).unref?.();
  return true;
}

export { DEFAULT_CONFIG };
