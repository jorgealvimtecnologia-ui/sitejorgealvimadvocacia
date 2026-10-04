/**
 * Agendamento online (AUD-15): regras PURAS de horários livres (sem banco), para teste.
 * Todos os horários são "relógio de parede" de Brasília, no formato YYYY-MM-DDTHH:mm (como a agenda do sistema).
 */

export const DEFAULT_CONFIG = Object.freeze({
  enabled: false, // só liga quando o Dr. Jorge decidir (painel → Agenda → Agendamento online)
  weekdays: [1, 2, 3, 4, 5], // 0 = domingo … 6 = sábado
  start: '09:00',
  end: '18:00',
  break_start: '12:00',
  break_end: '14:00',
  slot_minutes: 60,
  buffer_minutes: 0,
  min_notice_hours: 12,
  max_days_ahead: 30,
  lawyer_id: 'dr-jorge-alvim',
  lawyer_name: 'Dr. Jorge Alvim',
  location: 'Atendimento em Juiz de Fora/MG (o endereço será confirmado por e-mail)',
  meeting_url: '',
  areas: ['Trabalhista', 'Previdenciário / INSS', 'Cível & Família', 'Consumidor / Contratos', 'Outro assunto'],
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const pad = (n) => String(n).padStart(2, '0');

/** Valida e completa a configuração; devolve { config, errors }. Nunca lança. */
export function normalizeConfig(input = {}) {
  const errors = [];
  const c = { ...DEFAULT_CONFIG, ...(input || {}) };
  c.enabled = c.enabled === true || c.enabled === 1 || c.enabled === '1';
  c.weekdays = [...new Set((Array.isArray(c.weekdays) ? c.weekdays : DEFAULT_CONFIG.weekdays).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  for (const k of ['start', 'end', 'break_start', 'break_end']) {
    if (!HHMM.test(String(c[k]))) { errors.push(`Horário inválido em "${k}" (use HH:MM).`); c[k] = DEFAULT_CONFIG[k]; }
  }
  const clamp = (v, min, max, def, nome) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(`"${nome}" deve estar entre ${min} e ${max}.`); return def; }
    return Math.round(n);
  };
  c.slot_minutes = clamp(c.slot_minutes, 15, 240, DEFAULT_CONFIG.slot_minutes, 'duração da consulta (min)');
  c.buffer_minutes = clamp(c.buffer_minutes, 0, 120, 0, 'intervalo entre consultas (min)');
  c.min_notice_hours = clamp(c.min_notice_hours, 0, 168, DEFAULT_CONFIG.min_notice_hours, 'antecedência mínima (h)');
  c.max_days_ahead = clamp(c.max_days_ahead, 1, 90, DEFAULT_CONFIG.max_days_ahead, 'dias à frente');
  if (toMin(c.end) <= toMin(c.start)) { errors.push('O fim do expediente precisa ser depois do início.'); c.start = DEFAULT_CONFIG.start; c.end = DEFAULT_CONFIG.end; }
  if (toMin(c.break_end) < toMin(c.break_start)) { errors.push('O fim do intervalo precisa ser depois do início.'); c.break_start = c.break_end = '12:00'; }
  c.areas = (Array.isArray(c.areas) ? c.areas : DEFAULT_CONFIG.areas).map((a) => String(a).trim().slice(0, 60)).filter(Boolean).slice(0, 12);
  if (!c.areas.length) c.areas = [...DEFAULT_CONFIG.areas];
  for (const k of ['lawyer_id', 'lawyer_name', 'location', 'meeting_url']) c[k] = String(c[k] ?? '').trim().slice(0, 200);
  return { config: c, errors };
}

/** Agora, em Brasília, como 'YYYY-MM-DDTHH:mm'. */
export function nowSaoPaulo(date = new Date()) {
  const s = date.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }); // 2026-10-04 15:30:12
  return `${s.slice(0, 10)}T${s.slice(11, 16)}`;
}

/** 'YYYY-MM-DDTHH:mm' -> minutos desde 1970 (relógio de parede, sem fuso). */
export function minutesOf(dt) {
  const [d, t = '00:00'] = String(dt).slice(0, 16).split('T');
  const [y, m, day] = d.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 60000) + toMin(t);
}

export function addMinutes(dt, n) {
  const total = minutesOf(dt) + n;
  const date = new Date(total * 60000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysStr(dateStr, n) {
  return addMinutes(`${dateStr}T00:00`, n * 1440).slice(0, 10);
}

/** Compromissos com horário que ocupam a agenda (ignora dia inteiro e cancelados). Devolve [{s, e}] em minutos. */
export function busyIntervals(events = [], config = DEFAULT_CONFIG) {
  const out = [];
  for (const ev of events) {
    if (!ev || ev.all_day || /cancel/i.test(String(ev.status || ''))) continue;
    if (!String(ev.start_datetime || '').includes('T')) continue;
    if (config.lawyer_id && ev.lawyer_id && ev.lawyer_id !== config.lawyer_id) continue; // agenda de outro advogado
    const s = minutesOf(ev.start_datetime);
    const e = ev.end_datetime && String(ev.end_datetime).includes('T') && minutesOf(ev.end_datetime) > s ? minutesOf(ev.end_datetime) : s + 60;
    out.push({ s, e });
  }
  return out;
}

const overlaps = (aS, aE, b) => aS < b.e && b.s < aE;

/** Horários livres ('HH:MM') de UM dia. */
export function slotsForDate(dateStr, config, { busy = [], holidays = new Set(), now = nowSaoPaulo() } = {}) {
  if (!config.weekdays.includes(weekdayOf(dateStr)) || holidays.has(dateStr)) return [];
  const earliest = minutesOf(now) + config.min_notice_hours * 60;
  const dayStart = toMin(config.start);
  const dayEnd = toMin(config.end);
  const brkS = toMin(config.break_start);
  const brkE = toMin(config.break_end);
  const base = minutesOf(`${dateStr}T00:00`);
  const step = config.slot_minutes + config.buffer_minutes;
  const out = [];
  for (let t = dayStart; t + config.slot_minutes <= dayEnd; t += step) {
    const s = base + t;
    const e = s + config.slot_minutes;
    if (s < earliest) continue;
    if (brkE > brkS && t < brkE && t + config.slot_minutes > brkS) continue; // cai no intervalo
    if (busy.some((b) => overlaps(s, e + config.buffer_minutes, b))) continue;
    out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return out;
}

/** Vários dias: [{ date, slots: [...] }] (só dias com horário livre). */
export function slotsForRange(fromDate, days, config, ctx = {}) {
  const now = ctx.now || nowSaoPaulo();
  const today = now.slice(0, 10);
  const last = addDaysStr(today, config.max_days_ahead);
  const out = [];
  for (let i = 0; i < Math.min(days, 31); i++) {
    const date = addDaysStr(fromDate, i);
    if (date < today || date > last) continue;
    const slots = slotsForDate(date, config, { ...ctx, now });
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

/** O horário pedido ('YYYY-MM-DDTHH:mm') é um dos livres? */
export function isSlotFree(slot, config, ctx = {}) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(slot))) return false;
  const [date, hhmm] = slot.split('T');
  return slotsForDate(date, config, ctx).includes(hhmm);
}

const icsDate = (dt) => dt.replace(/[-:]/g, '') + '00'; // 20261004T150000 (horário local)
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Arquivo .ics (convite de calendário) do compromisso. */
export function buildIcs({ uid, start, end, title, description = '', location = '' }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jorge Alvim Advocacia//Agendamento//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=America/Sao_Paulo:${icsDate(start)}`, `DTEND;TZID=America/Sao_Paulo:${icsDate(end)}`,
    `SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc(description)}`, `LOCATION:${icsEsc(location)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Consulta em 1 hora', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
