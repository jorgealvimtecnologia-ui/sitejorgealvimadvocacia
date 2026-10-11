#!/usr/bin/env node
/**
 * LIMPEZA CIRÚRGICA — tira SÓ a equipe fictícia de demonstração e os dados inventados do Radar,
 * PRESERVANDO todos os clientes e logins (inclusive os de teste do Dr. Jorge).
 * ============================================================================
 * Diferente do `limpar-demo.js` (que apaga também clientes de demonstração, agenda, leads, etc.),
 * este script é conservador: mexe só no que o Dr. Jorge pediu para limpar.
 *
 * REMOVE:
 *   - a EQUIPE fictícia: office_members (quadro de integrantes) e as tabelas de RH (hr_*);
 *   - as linhas da matriz de permissões dos OPERADORES de equipe (role_template fora de
 *     'master' e 'cliente') — some da tela "Usuários & Senhas", mas NUNCA o mestre nem clientes;
 *   - os ANDAMENTOS inventados pelo Radar antigo (mesma regra de radar-limpar-fabricados.js);
 *   - as INTIMAÇÕES de OAB de terceiros (court_publications cuja advogado_oab não é a sua).
 *
 * PRESERVA (não toca):
 *   - o Usuário Mestre (Dr. Jorge) e TODOS os clientes/logins de cliente (PF/PJ, Google, testes);
 *   - os processos e andamentos REAIS, os importados do Radar, e as intimações da SUA OAB.
 *
 * SEGURANÇA: por padrão só SIMULA. Para apagar de verdade, rode com --aplicar (em transação).
 * Faça um BACKUP antes:  cp leads.db leads.db.bak
 *
 *   node scripts/limpar-equipe-ficticia.js            # simulação (não apaga nada)
 *   node scripts/limpar-equipe-ficticia.js --aplicar  # apaga de verdade
 * ============================================================================
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FABRICATED_MOVEMENTS_SQL } from './radar-limpar-fabricados.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'leads.db');
const APLICAR = process.argv.includes('--aplicar');
const KEEP_OAB = (process.env.KEEP_OAB || '222943').replace(/\D/g, ''); // OAB a preservar nas intimações

if (!fs.existsSync(DB_PATH)) { console.error(`✖ Banco não encontrado: ${DB_PATH}`); process.exit(1); }
const db = new DatabaseSync(DB_PATH);
const existe = (t) => { try { return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t); } catch { return false; } };
const conta = (t, where) => { try { return db.prepare(`SELECT COUNT(*) n FROM ${t}${where ? ' WHERE ' + where : ''}`).get().n; } catch { return 0; } };

// Operações: [tabela, WHERE do que APAGAR (vazio = tudo), rótulo].
const OPS = [
  ['office_members', '', 'Equipe fictícia (quadro de integrantes do escritório)'],
  // Permissões de operadores de EQUIPE (nunca o mestre, nunca clientes).
  ['access_permissions', `role_template NOT IN ('master','cliente') AND user_id != 'USR-MASTER-01'`, 'Permissões de operadores de equipe fictícios (mantém o mestre e todos os clientes)'],
  // Andamentos inventados pelo Radar antigo (em processos reais).
  ['lawsuit_movements', FABRICATED_MOVEMENTS_SQL, 'Andamentos inventados pelo Radar antigo'],
  // Intimações de OAB de terceiros (mantém as da sua OAB).
  ['court_publications', `COALESCE(advogado_oab,'') NOT LIKE '%${KEEP_OAB}%'`, 'Intimações de OABs que NÃO são a sua'],
];
// Tabelas de RH (hr_*): apaga todas as linhas (dados da equipe fictícia).
for (const r of (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'hr\\_%' ESCAPE '\\'`).all())) {
  OPS.push([r.name, '', `RH: ${r.name} (dados da equipe fictícia)`]);
}

console.log(`\n${APLICAR ? '🧹 APLICANDO limpeza cirúrgica' : '🔎 SIMULAÇÃO (nada será apagado)'} — banco: ${DB_PATH}`);
console.log('   PRESERVA: o mestre, TODOS os clientes/logins, processos e intimações da sua OAB.\n');

// Relatório do que será MANTIDO (conferência).
if (existe('users')) console.log(`   • Usuários (operadores com login) mantidos: ${conta('users')}`);
if (existe('clients')) console.log(`   • Clientes mantidos (TODOS, inclusive os de teste): ${conta('clients')}`);
if (existe('lawsuits')) console.log(`   • Processos mantidos (TODOS): ${conta('lawsuits')}`);
if (existe('court_publications')) console.log(`   • Intimações mantidas (sua OAB ${KEEP_OAB}): ${conta('court_publications', `COALESCE(advogado_oab,'') LIKE '%${KEEP_OAB}%'`)}`);
console.log('');

let totalApagar = 0;
const plano = [];
for (const [tabela, where, rotulo] of OPS) {
  if (!existe(tabela)) continue;
  const n = conta(tabela, where);
  if (n > 0) { plano.push([tabela, where, n]); totalApagar += n; }
  console.log(`   ${n > 0 ? '✖' : '·'} ${rotulo}: ${n}`);
}

if (!APLICAR) {
  console.log(`\nResumo: ${totalApagar} registro(s) seriam apagados. Nada foi alterado.`);
  console.log('Para apagar de verdade (depois do backup): node scripts/limpar-equipe-ficticia.js --aplicar\n');
  process.exit(0);
}

try { db.exec('PRAGMA foreign_keys = OFF'); } catch { /* ok */ }
db.exec('BEGIN');
let apagados = 0;
try {
  for (const [tabela, where, n] of plano) {
    const info = db.prepare(`DELETE FROM ${tabela}${where ? ' WHERE ' + where : ''}`).run();
    apagados += Number(info.changes || n);
    console.log(`   ✓ ${tabela}: ${info.changes} apagado(s)`);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error(`\n✖ Erro — NADA foi apagado (revertido): ${e.message}`);
  process.exit(1);
}
try { db.exec('VACUUM'); } catch { /* ok */ }
console.log(`\n✅ Limpeza cirúrgica concluída: ${apagados} registro(s) removido(s). Reinicie o serviço (systemctl restart advocacia).\n`);
