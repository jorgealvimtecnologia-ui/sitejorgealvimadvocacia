/**
 * Testes físicos do site (ordens ORD-MUFSK5A6-V21 e ORD-MUFSMMFL-IJ4).
 *
 * - Checklist: src/modules/qa/qa-checklist.json (gerado por scripts/generate-qa-checklist.js)
 * - Cronograma: os itens são distribuídos em blocos por DIA ÚTIL a partir da data de início,
 *   sem quebrar uma seção quando possível (até ITEMS_PER_DAY por dia).
 * - Resultados: qa_test_results guarda cada registro (ok/falhou/refazer) com autor e data;
 *   o status atual de um item é o registro mais recente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../../config/db.js';

const CATALOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'qa-checklist.json');
const DEFAULT_PER_DAY = 30;
const TZ = 'America/Sao_Paulo';
export const QA_RESULTS = ['ok', 'falhou', 'refazer'];

export function ensureQaTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS qa_test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      result TEXT NOT NULL,
      note TEXT,
      tested_by TEXT,
      tested_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qa_results_item ON qa_test_results(item_id, id);
    CREATE TABLE IF NOT EXISTS qa_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

let catalogCache = { mtimeMs: 0, data: null };
export function loadCatalog() {
  const stat = fs.statSync(CATALOG_FILE);
  if (catalogCache.data && catalogCache.mtimeMs === stat.mtimeMs) return catalogCache.data;
  const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  catalogCache = { mtimeMs: stat.mtimeMs, data };
  return data;
}

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília. */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function getSetting(key) {
  return db.prepare(`SELECT value FROM qa_settings WHERE key = ?`).get(key)?.value ?? null;
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO qa_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

export function getSettings() {
  let start = getSetting('start_date');
  if (!start) { start = todayBR(); setSetting('start_date', start); }
  const perDay = Number(getSetting('per_day')) || DEFAULT_PER_DAY;
  return { start_date: start, per_day: perDay };
}

export function updateSettings({ start_date, per_day }) {
  if (start_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start_date)) || Number.isNaN(Date.parse(start_date))) return { error: 'Data de início inválida (use AAAA-MM-DD).' };
    setSetting('start_date', start_date);
  }
  if (per_day !== undefined) {
    const n = Number(per_day);
    if (!Number.isInteger(n) || n < 5 || n > 200) return { error: 'Quantidade por dia deve ser entre 5 e 200.' };
    setSetting('per_day', n);
  }
  return { value: getSettings() };
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWeekend(isoDate) {
  const wd = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
}
function nextWorkday(isoDate) {
  let d = isoDate;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** Distribui os itens em dias úteis; retorna [{ number, date, items: [...] }]. */
export function buildSchedule(items, { start_date, per_day }) {
  const groups = [];
  for (const it of items) {
    const key = `${it.page}|${it.section}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, items: [it] });
  }
  const days = [];
  let current = [];
  const flush = () => { if (current.length) { days.push(current); current = []; } };
  for (const g of groups) {
    for (let i = 0; i < g.items.length; i += per_day) {
      const chunk = g.items.slice(i, i + per_day);
      if (current.length + chunk.length > per_day && current.length >= Math.ceil(per_day / 2)) flush();
      if (current.length + chunk.length > per_day) {
        const room = per_day - current.length;
        current.push(...chunk.slice(0, room));
        flush();
        current.push(...chunk.slice(room));
      } else {
        current.push(...chunk);
      }
    }
  }
  flush();
  let date = nextWorkday(start_date);
  return days.map((dayItems, idx) => {
    const day = { number: idx + 1, date, items: dayItems };
    date = nextWorkday(addDays(date, 1));
    return day;
  });
}

function latestResults() {
  const rows = db.prepare(`
    SELECT r.* FROM qa_test_results r
    JOIN (SELECT item_id, MAX(id) AS max_id FROM qa_test_results GROUP BY item_id) x ON x.max_id = r.id
  `).all();
  return new Map(rows.map(r => [r.item_id, r]));
}

function withResult(it, results, day) {
  const r = results.get(it.id);
  const status = r && r.result !== 'refazer' ? r.result : 'pendente';
  return { ...it, day: day.number, date: day.date, status, note: r?.note || '', tested_by: r?.tested_by || '', tested_at: r?.tested_at || '' };
}

/** Painel do dia: hoje, atrasados, falhas, feitos e o cronograma resumido. */
export function getQaOverview(now = new Date(), { includeAll = false } = {}) {
  const catalog = loadCatalog();
  const settings = getSettings();
  const schedule = buildSchedule(catalog.items, settings);
  const results = latestResults();
  const today = todayBR(now);

  const summary = { total: catalog.items.length, done: 0, ok: 0, failed: 0, overdue: 0, today_total: 0, today_done: 0 };
  const todayItems = [];
  const overdueItems = [];
  const failedItems = [];
  const allItems = [];
  const days = schedule.map(day => {
    let done = 0, failed = 0;
    for (const raw of day.items) {
      const it = withResult(raw, results, day);
      if (includeAll) allItems.push(it);
      if (it.status !== 'pendente') { done++; summary.done++; }
      if (it.status === 'ok') summary.ok++;
      if (it.status === 'falhou') { failed++; summary.failed++; failedItems.push(it); }
      if (day.date === today) { summary.today_total++; if (it.status !== 'pendente') summary.today_done++; todayItems.push(it); }
      else if (day.date < today && it.status === 'pendente') { summary.overdue++; overdueItems.push(it); }
    }
    const pages = [...new Set(day.items.map(i => `${i.page} › ${i.section}`))];
    const status = done === day.items.length ? 'concluido' : day.date < today ? 'atrasado' : day.date === today ? 'hoje' : 'futuro';
    return { number: day.number, date: day.date, total: day.items.length, done, failed, status, pages };
  });

  summary.progress_percentage = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const nextDay = days.find(d => d.date >= today && d.status !== 'concluido') || null;
  return {
    settings,
    today: { date: today, is_workday: !isWeekend(today), scheduled: todayItems.length > 0 },
    summary,
    // Pergunta do dia: há teste de hoje por fazer ou algum atrasado
    ask_today: (summary.today_total > summary.today_done) || summary.overdue > 0,
    next_day: nextDay,
    days,
    today_items: todayItems,
    overdue_items: overdueItems,
    failed_items: failedItems,
    all_items: includeAll ? allItems : undefined,
    catalog_generated_at: catalog.generated_at
  };
}

export function getDayItems(number) {
  const catalog = loadCatalog();
  const schedule = buildSchedule(catalog.items, getSettings());
  const day = schedule.find(d => d.number === Number(number));
  if (!day) return null;
  const results = latestResults();
  return { number: day.number, date: day.date, items: day.items.map(it => withResult(it, results, day)) };
}

export function recordResult({ item_id, result, note }, actor) {
  const catalog = loadCatalog();
  if (!catalog.items.some(i => i.id === item_id)) return { error: 'Item do checklist não encontrado.' };
  if (!QA_RESULTS.includes(result)) return { error: `Resultado inválido. Use: ${QA_RESULTS.join(', ')}.` };
  const cleanNote = String(note || '').trim().slice(0, 2000);
  if (result === 'falhou' && !cleanNote) return { error: 'Descreva o que falhou (a observação é obrigatória).' };
  db.prepare(`INSERT INTO qa_test_results (item_id, result, note, tested_by, tested_at) VALUES (?, ?, ?, ?, ?)`)
    .run(item_id, result, cleanNote, String(actor || 'construtor').slice(0, 60), new Date().toISOString());
  return { value: true };
}

/** Resumo curto para os agentes (Claude/Antigravity): andamento e falhas a corrigir. */
export function getQaSummaryForAgents() {
  const o = getQaOverview();
  return {
    summary: o.summary,
    next_day: o.next_day,
    failed_items: o.failed_items.map(i => ({ id: i.id, page: i.page, section: i.section, kind: i.kind, label: i.label, url: i.url, note: i.note, tested_at: i.tested_at }))
  };
}
