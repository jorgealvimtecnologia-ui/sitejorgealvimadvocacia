#!/usr/bin/env node
/**
 * ==============================================================================
 * PONTE DO ROADMAP VIVO COM OS AGENTES (CLAUDE & ANTIGRAVITY)
 * ==============================================================================
 * Lê e atualiza as Ordens do Construtor DIRETO NO SITE (fonte única), para que
 * Claude, Antigravity e o painel do Dr. Jorge vejam sempre a mesma lista.
 *
 * Configuração (arquivo .env na raiz do projeto — nunca versionado):
 *   ROADMAP_AGENT_KEY=<chave do agente>        (obrigatória)
 *   ROADMAP_AGENT_NAME=claude | antigravity    (quem está executando)
 *   ROADMAP_URL=https://jorgealvimadvocacia.com.br   (opcional)
 *
 * Uso:
 *   npm run roadmap:pending                       # fila de ordens abertas + resumo
 *   npm run roadmap:list                          # todas as ordens (inclui concluídas)
 *   npm run roadmap:status -- <ID> <status> "nota" # planejado|em_curso|bloqueado|conforme
 *   npm run roadmap:note -- <ID> "nota"           # registra andamento sem mudar status
 *   npm run roadmap:register -- "Título" [--prioridade=P1] [--criterios="..."]
 *   npm run roadmap:history                       # histórico com data e hora
 *   npm run roadmap:functions                     # catálogo de funções (local)
 *   npm run roadmap:import-local                  # envia ao site ordens de um leads.db local
 *   Acrescente --json para saída em JSON.
 * ==============================================================================
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Cores ANSI
const BOLD = '\x1b[1m', RESET = '\x1b[0m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m';
const RED = '\x1b[31m', CYAN = '\x1b[36m', MAGENTA = '\x1b[35m', DIM = '\x1b[2m';

function loadDotEnv() {
  const file = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const positional = args.filter(a => !a.startsWith('--'));
const command = positional[0] || 'pending';
const JSON_OUT = !!flags.json;

const BASE_URL = (process.env.ROADMAP_URL || 'https://jorgealvimadvocacia.com.br').replace(/\/+$/, '');
const AGENT_KEY = process.env.ROADMAP_AGENT_KEY || '';
const AGENT_NAME = String(flags.agente || process.env.ROADMAP_AGENT_NAME || 'agente-ia');

function fail(msg) {
  console.error(`${RED}✖ ${msg}${RESET}`);
  process.exit(1);
}

async function api(method, route, body) {
  if (!AGENT_KEY) {
    fail('ROADMAP_AGENT_KEY não configurada no .env da raiz do projeto. Peça a chave ao Dr. Jorge.');
  }
  const res = await fetch(BASE_URL + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Roadmap-Agent-Key': AGENT_KEY,
      'X-Roadmap-Agent': AGENT_NAME
    },
    body: body ? JSON.stringify(body) : undefined
  }).catch(e => fail(`Sem conexão com ${BASE_URL}: ${e.message}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.error || `HTTP ${res.status}`);
  return data;
}

function fmt(iso) {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const STATUS_LABEL = {
  planejado: '⚪ PLANEJADO', em_curso: '🟡 EM CURSO', bloqueado: '🔴 BLOQUEADO',
  conforme: '🟢 CONCLUÍDO', cancelada: '⚫ ARQUIVADA'
};

function printSummary(s) {
  const c = s.counts;
  console.log(`${BOLD}Resumo:${RESET} ${c.planejado} planejada(s) • ${c.em_curso} em curso • ${c.bloqueado} bloqueada(s) • ${c.conforme} concluída(s) — ${s.progress_percentage}% do programado`);
  if (s.all_done) console.log(`${GREEN}${BOLD}✅ Todas as ordens programadas foram concluídas.${RESET}`);
  if (s.last_activity) console.log(`${DIM}Última atividade: ${s.last_activity.action} em ${s.last_activity.order_id} por ${s.last_activity.performed_by} (${fmt(s.last_activity.created_at)})${RESET}`);
  console.log('');
}

function printOrder(o, idx) {
  const pColor = o.priority === 'P0' ? RED : o.priority === 'P1' ? YELLOW : CYAN;
  const n = idx !== undefined ? `${idx + 1}. ` : '';
  console.log(`${BOLD}${n}[${o.id}] ${pColor}[${o.priority}]${RESET} ${BOLD}${o.title}${RESET}`);
  console.log(`   ${STATUS_LABEL[o.status] || o.status} | ${o.wave} | ${o.layer}${o.assigned_to ? ` | com: ${o.assigned_to}` : ''}`);
  console.log(`   Lançada em ${fmt(o.created_at)} por ${o.created_by || 'construtor'}`);
  if (o.description) console.log(`   ${BOLD}Descrição:${RESET} ${o.description}`);
  if (o.acceptance_criteria) console.log(`   ${BOLD}Critérios de aceite:${RESET} ${o.acceptance_criteria}`);
  console.log('');
}

async function main() {
  if (command === 'pending' || command === 'list') {
    const data = await api('GET', '/api/agent/roadmap' + (command === 'list' ? '?all=true' : ''));
    const items = command === 'list' ? data.orders : data.pending;
    if (JSON_OUT) return console.log(JSON.stringify({ summary: data.summary, orders: items }, null, 2));
    console.log(`\n${BOLD}${CYAN}📋 ROADMAP VIVO — ${command === 'list' ? 'TODAS AS ORDENS' : 'ORDENS PENDENTES'} (${BASE_URL})${RESET}\n`);
    printSummary(data.summary);
    if (!items.length) {
      console.log(`  ${GREEN}✓ Nenhuma ordem ${command === 'list' ? 'registrada' : 'pendente'}.${RESET}\n`);
      return;
    }
    items.forEach(printOrder);
    if (command === 'pending') {
      console.log(`${MAGENTA}${BOLD}➜ Agente: apresente esta lista ao Dr. Jorge e PERGUNTE qual ordem executar antes de começar.${RESET}\n`);
    }
    return;
  }

  if (command === 'status' || command === 'note') {
    const id = positional[1];
    const status = command === 'status' ? positional[2] : undefined;
    const note = positional.slice(command === 'status' ? 3 : 2).join(' ');
    if (!id || (command === 'status' && !status) || (command === 'note' && !note)) {
      fail(command === 'status'
        ? 'Uso: npm run roadmap:status -- <ORD-ID> <planejado|em_curso|bloqueado|conforme> "nota"'
        : 'Uso: npm run roadmap:note -- <ORD-ID> "nota"');
    }
    const data = await api('PATCH', `/api/agent/roadmap/orders/${encodeURIComponent(id)}`, { status, note });
    if (JSON_OUT) return console.log(JSON.stringify(data.order, null, 2));
    console.log(`\n${GREEN}✓ Ordem ${id}: ${STATUS_LABEL[data.order.status] || data.order.status}${note ? ` — "${note}"` : ''}${RESET}`);
    console.log(`  Registrado no histórico do site por ${AGENT_NAME}.\n`);
    return;
  }

  if (command === 'register') {
    const title = positional.slice(1).join(' ');
    if (!title) fail('Uso: npm run roadmap:register -- "Título" [--prioridade=P1] [--criterios="..."] [--descricao="..."]');
    const data = await api('POST', '/api/agent/roadmap/orders', {
      title,
      priority: flags.prioridade || 'P1',
      acceptance_criteria: flags.criterios || '',
      description: flags.descricao || ''
    });
    if (JSON_OUT) return console.log(JSON.stringify(data.order, null, 2));
    console.log(`\n${GREEN}✓ Pendência registrada no Roadmap Vivo: [${data.order.id}] ${data.order.title}${RESET}\n`);
    return;
  }

  if (command === 'history') {
    const data = await api('GET', '/api/agent/roadmap?history=100');
    if (JSON_OUT) return console.log(JSON.stringify(data.history, null, 2));
    console.log(`\n${BOLD}${CYAN}📜 ROADMAP VIVO — HISTÓRICO${RESET}\n`);
    if (!data.history.length) return console.log('  Nenhum registro no histórico.\n');
    for (const h of data.history) {
      console.log(`${BOLD}[${fmt(h.created_at)}]${RESET} ${MAGENTA}${h.action}${RESET} [${h.order_id}] ${BOLD}${h.title}${RESET}`);
      console.log(`   ${h.previous_status || 'início'} ➔ ${BOLD}${h.new_status || '-'}${RESET} | por ${h.performed_by || 'sistema'}`);
      if (h.details) console.log(`   ${h.details}`);
      console.log('');
    }
    return;
  }

  if (command === 'import-local') {
    const dbPath = path.join(ROOT_DIR, 'leads.db');
    if (!fs.existsSync(dbPath)) fail(`Banco local não encontrado: ${dbPath}`);
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    let orders = [], history = [];
    try { orders = db.prepare('SELECT * FROM roadmap_builder_orders').all(); } catch (e) { /* tabela ausente */ }
    try { history = db.prepare('SELECT * FROM roadmap_order_history ORDER BY id ASC').all(); } catch (e) { /* tabela ausente */ }
    if (!orders.length) return console.log(`\n${GREEN}✓ Nenhuma ordem local para enviar.${RESET}\n`);
    const data = await api('POST', '/api/agent/roadmap/import', { orders, history });
    console.log(`\n${GREEN}✓ ${data.imported} ordem(ns) enviada(s) ao site; ${data.skipped} já existia(m).${RESET}`);
    if (data.errors?.length) console.log(`${YELLOW}Avisos:\n  - ${data.errors.join('\n  - ')}${RESET}`);
    console.log('');
    return;
  }

  if (command === 'functions') {
    const { getSystemFunctionsWithMetadata } = await import('../src/modules/roadmap/roadmap.catalog.js');
    const fns = getSystemFunctionsWithMetadata();
    if (JSON_OUT) return console.log(JSON.stringify(fns, null, 2));
    console.log(`\n${BOLD}${CYAN}⚡ CATÁLOGO DE FUNÇÕES DO SISTEMA (código local)${RESET}\n`);
    for (const f of fns) {
      console.log(`${BOLD}${f.marker} ${f.name}${RESET} (${f.category} - ${f.layer})`);
      console.log(`   ${f.file} (${f.fileExists ? 'presente' : 'ausente'}) — modificado em ${fmt(f.lastModified)}`);
      console.log(`   ${f.description}\n`);
    }
    return;
  }

  fail(`Comando desconhecido: ${command}. Use: pending, list, status, note, register, history, functions, import-local.`);
}

main();
