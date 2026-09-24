#!/usr/bin/env node
/**
 * ==============================================================================
 * PONTE DE INTEGRAÇÃO DO ROADMAP VIVO COM AGENTES (CLAUDE & ANTIGRAVITY)
 * ==============================================================================
 * Permite que agentes autônomos (Claude Code, Antigravity) e desenvolvedores
 * consultem e gerenciem ordens e o ciclo de vida do Roadmap Vivo diretamente via CLI.
 *
 * Uso:
 *   node scripts/roadmap-agent.js pending          # Lista ordens P0/P1 na fila
 *   node scripts/roadmap-agent.js list             # Lista todas as ordens
 *   node scripts/roadmap-agent.js status <ID> <STATUS> [NOTA] # Atualiza status
 *   node scripts/roadmap-agent.js add --title="..." --wave="..." --priority=P1
 *   node scripts/roadmap-agent.js history          # Histórico com data e hora
 *   node scripts/roadmap-agent.js functions        # Catálogo de funções do sistema
 * ==============================================================================
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'leads.db');

// Cores ANSI para saída no terminal
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function getDb() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[ROADMAP-AGENT] Banco de dados não encontrado em: ${DB_PATH}`);
    process.exit(1);
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_builder_orders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      layer TEXT DEFAULT 'Core Jurídico',
      wave TEXT DEFAULT 'Onda 1 — Core Jurídico & Experiência',
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

  const histCount = db.prepare("SELECT count(*) as c FROM roadmap_order_history").get()?.c || 0;
  if (histCount === 0) {
    const existingOrders = db.prepare("SELECT * FROM roadmap_builder_orders").all();
    for (const ord of existingOrders) {
      db.prepare(`
        INSERT INTO roadmap_order_history (order_id, action, title, previous_status, new_status, details, performed_by, created_at)
        VALUES (?, 'CRIADA', ?, NULL, ?, ?, ?, ?)
      `).run(ord.id, ord.title, ord.status || 'planejado', ord.acceptance_criteria || '', ord.created_by || 'construtor', ord.created_at);
    }
  }

  return db;
}

function formatDate(isoStr) {
  if (!isoStr) return 'N/A';
  const d = new Date(isoStr);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const seg = String(d.getSeconds()).padStart(2, '0');
  return {
    date: `${dia}/${mes}/${ano}`,
    time: `${hora}:${min}:${seg}`,
    full: `${dia}/${mes}/${ano} às ${hora}:${min}:${seg}`
  };
}

const command = process.argv[2] || 'pending';

const db = getDb();

if (command === 'pending') {
  console.log(`\n${BOLD}${CYAN}📋 [ROADMAP VIVO] ORDENS PENDENTES DO CONSTRUTOR (FILA DE PRIORIDADES)${RESET}\n`);
  const orders = db.prepare(`
    SELECT * FROM roadmap_builder_orders 
    WHERE status IN ('planejado', 'em_curso', 'bloqueado')
    ORDER BY 
      CASE priority WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 ELSE 4 END,
      created_at ASC
  `).all();

  if (orders.length === 0) {
    console.log(`  ${GREEN}✓ Nenhuma ordem pendente na fila. Todas as diretrizes estão conformes!${RESET}\n`);
    process.exit(0);
  }

  orders.forEach((ord, idx) => {
    const pColor = ord.priority === 'P0' ? RED : ord.priority === 'P1' ? YELLOW : CYAN;
    const sBadge = ord.status === 'em_curso' ? '🟡 EM CURSO' : ord.status === 'bloqueado' ? '🔴 BLOQUEADO' : '⚪ PLANEJADO';
    const dt = formatDate(ord.created_at);

    console.log(`${BOLD}${idx + 1}. [${ord.id}] ${pColor}[${ord.priority}]${RESET} ${BOLD}${ord.title}${RESET}`);
    console.log(`   Status: ${sBadge} | Onda: ${ord.wave} | Camada: ${ord.layer}`);
    console.log(`   Criado em: ${dt.full} por: ${ord.created_by || 'construtor'}`);
    if (ord.acceptance_criteria) {
      console.log(`   ${BOLD}Critérios de Aceite:${RESET} ${ord.acceptance_criteria}`);
    }
    console.log('');
  });
} else if (command === 'list') {
  console.log(`\n${BOLD}${CYAN}📋 [ROADMAP VIVO] TODAS AS ORDENS DO CONSTRUTOR${RESET}\n`);
  const orders = db.prepare(`
    SELECT * FROM roadmap_builder_orders 
    ORDER BY created_at DESC
  `).all();

  orders.forEach((ord) => {
    const sBadge = ord.status === 'conforme' ? '🟢 CONFORME' : ord.status === 'em_curso' ? '🟡 EM CURSO' : ord.status === 'bloqueado' ? '🔴 BLOQUEADO' : '⚪ PLANEJADO';
    const dt = formatDate(ord.created_at);
    console.log(`[${ord.id}] ${ord.priority} | ${sBadge} | ${ord.title} (${dt.full})`);
  });
  console.log('');
} else if (command === 'status') {
  const orderId = process.argv[3];
  const newStatus = process.argv[4];
  const note = process.argv.slice(5).join(' ') || '';

  if (!orderId || !newStatus) {
    console.error(`Uso: node scripts/roadmap-agent.js status <ORD-ID> <planejado|em_curso|conforme|bloqueado> [nota]`);
    process.exit(1);
  }

  const validStatuses = ['planejado', 'em_curso', 'conforme', 'bloqueado'];
  if (!validStatuses.includes(newStatus)) {
    console.error(`Status inválido: ${newStatus}. Opções: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  const existing = db.prepare("SELECT * FROM roadmap_builder_orders WHERE id = ?").get(orderId);
  if (!existing) {
    console.error(`Ordem não encontrada: ${orderId}`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE roadmap_builder_orders SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, now, orderId);

  // Registrar histórico
  const actor = process.env.USER || 'agent-ai';
  const detail = note || `Transição de [${existing.status}] para [${newStatus}] via agente`;
  db.prepare(`
    INSERT INTO roadmap_order_history (order_id, action, title, previous_status, new_status, details, performed_by, created_at)
    VALUES (?, 'STATUS_ALTERADO', ?, ?, ?, ?, ?, ?)
  `).run(orderId, existing.title, existing.status, newStatus, detail, actor, now);

  console.log(`\n${GREEN}✓ Ordem ${orderId} atualizada com sucesso para '${newStatus}'.${RESET}`);
  console.log(`  Registrado no Histórico de Auditoria: ${formatDate(now).full}\n`);
} else if (command === 'history') {
  console.log(`\n${BOLD}${CYAN}📜 [ROADMAP VIVO] HISTÓRICO COMPLETO DE ORDENS E TRANSIÇÕES${RESET}\n`);
  const history = db.prepare(`SELECT * FROM roadmap_order_history ORDER BY id DESC LIMIT 50`).all();

  if (history.length === 0) {
    console.log(`  Nenhum registro no histórico.\n`);
    process.exit(0);
  }

  history.forEach(h => {
    const dt = formatDate(h.created_at);
    const badge = h.action === 'CRIADA' ? '🆕 CRIADA' : h.action === 'STATUS_ALTERADO' ? '🔄 STATUS' : '⚠️ AÇÃO';
    console.log(`${BOLD}[${dt.date} ${dt.time}]${RESET} ${MAGENTA}${badge}${RESET} [${h.order_id}] ${BOLD}${h.title}${RESET}`);
    console.log(`   De: ${h.previous_status || 'Início'} ➔ Para: ${BOLD}${h.new_status}${RESET} | Por: ${h.performed_by || 'sistema'}`);
    if (h.details) console.log(`   Detalhes: ${h.details}`);
    console.log('');
  });
} else if (command === 'functions') {
  console.log(`\n${BOLD}${CYAN}⚡ [ROADMAP VIVO] CATÁLOGO DINÂMICO DE FUNÇÕES DO SISTEMA${RESET}\n`);
  import('../src/modules/roadmap/roadmap.catalog.js').then(({ getSystemFunctionsWithMetadata }) => {
    const fns = getSystemFunctionsWithMetadata();
    fns.forEach(f => {
      const markerColor = f.marker.includes('⚡') ? GREEN : f.marker.includes('🆕') ? CYAN : f.marker.includes('🔄') ? YELLOW : RED;
      const dt = formatDate(f.lastModified);
      console.log(`${markerColor}${BOLD}${f.marker}${RESET} ${BOLD}${f.name}${RESET} (${f.category} - ${f.layer})`);
      console.log(`   ID: ${f.id} | Arquivo: ${f.file} (${f.fileExists ? 'Presente' : 'Ausente'})`);
      console.log(`   Última modificação: ${dt.full}`);
      console.log(`   Descrição: ${f.description}\n`);
    });
  });
} else {
  console.log(`Comando desconhecido: ${command}. Comandos disponíveis: pending, list, status, history, functions.`);
}
