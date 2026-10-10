#!/usr/bin/env node
/**
 * LIMPEZA DOS DADOS FICTÍCIOS DE DEMONSTRAÇÃO (produção).
 * ============================================================================
 * Remove o que foi semeado pelos scripts de demo (equipe, clientes, processos,
 * financeiro, agenda, intimações de OABs de terceiros…) e PRESERVA o que é real:
 *   - o Usuário Mestre (USR-MASTER-01 / jorgealvimtecnologia);
 *   - os processos IMPORTADOS do Radar (observações contêm "Importado do Radar")
 *     e os clientes ligados a eles;
 *   - as intimações da SUA OAB (advogado_oab contém a OAB em KEEP_OAB).
 *
 * SEGURANÇA: por padrão só SIMULA (mostra o que apagaria). Para apagar de verdade,
 * rode com --aplicar. Faça um BACKUP do banco antes (cp leads.db leads.db.bak).
 *
 *   node scripts/limpar-demo.js            # simulação (não apaga nada)
 *   node scripts/limpar-demo.js --aplicar  # apaga de verdade (em transação)
 * ============================================================================
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'leads.db');
const APLICAR = process.argv.includes('--aplicar');
const KEEP_OAB = (process.env.KEEP_OAB || '222943').replace(/\D/g, ''); // OAB a preservar nas intimações

if (!fs.existsSync(DB_PATH)) { console.error(`✖ Banco não encontrado: ${DB_PATH}`); process.exit(1); }
const db = new DatabaseSync(DB_PATH);
const existe = (t) => { try { return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t); } catch { return false; } };
const conta = (t, where) => { try { return db.prepare(`SELECT COUNT(*) n FROM ${t}${where ? ' WHERE ' + where : ''}`).get().n; } catch { return 0; } };

// O que PRESERVAR (processos do Radar + seus clientes).
const KEEP_LAW = `COALESCE(notes,'') LIKE '%Importado do Radar%'`;
const KEEP_CLIENTS_SQL = `SELECT DISTINCT client_id FROM lawsuits WHERE ${KEEP_LAW} AND client_id IS NOT NULL`;

// Operações: [tabela, WHERE do que APAGAR, rótulo]. WHERE vazio = apaga tudo da tabela.
const OPS = [
  ['court_publications', `COALESCE(advogado_oab,'') NOT LIKE '%${KEEP_OAB}%'`, 'Intimações de OABs que NÃO são suas'],
  ['lawsuit_movements', `lawsuit_id IN (SELECT id FROM lawsuits WHERE NOT (${KEEP_LAW}))`, 'Andamentos de processos de demonstração'],
  ['lawsuit_history', `lawsuit_id IN (SELECT id FROM lawsuits WHERE NOT (${KEEP_LAW}))`, 'Histórico de processos de demonstração'],
  ['lawsuits', `NOT (${KEEP_LAW})`, 'Processos de demonstração (mantém os importados do Radar)'],
  ['contract_installments', `client_id NOT IN (${KEEP_CLIENTS_SQL})`, 'Parcelas de contrato (clientes de demonstração)'],
  ['nfse_records', `client_id NOT IN (${KEEP_CLIENTS_SQL})`, 'NFS-e de demonstração'],
  ['financial_transactions', `client_id IS NULL OR client_id NOT IN (${KEEP_CLIENTS_SQL})`, 'Lançamentos financeiros de demonstração'],
  ['clients', `id NOT IN (${KEEP_CLIENTS_SQL})`, 'Clientes de demonstração (mantém os do Radar)'],
  ['calendar_events', '', 'Agenda de demonstração (toda — você ainda não lançou prazos reais)'],
  ['rocket_replies', '', 'Respostas de "foguetes" de demonstração'],
  ['rockets', '', 'Foguetes (tarefas/avisos) de demonstração'],
  ['leads', '', 'Leads de demonstração'],
  ['office_members', '', 'Equipe fictícia (integrantes do escritório)'],
  ['access_permissions', `user_id != 'USR-MASTER-01'`, 'Permissões de usuários fictícios (mantém o mestre)'],
  ['users', `id != 'USR-MASTER-01' AND LOWER(COALESCE(username,'')) != 'jorgealvimtecnologia'`, 'Usuários fictícios (mantém o mestre)'],
];
// Tabelas de RH (hr_*): apaga todas as linhas (equipe fictícia e seus dados).
for (const r of (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'hr\\_%' ESCAPE '\\'`).all())) {
  OPS.push([r.name, '', `RH: ${r.name} (dados da equipe fictícia)`]);
}

console.log(`\n${APLICAR ? '🧹 APLICANDO limpeza' : '🔎 SIMULAÇÃO (nada será apagado)'} — banco: ${DB_PATH}`);
console.log(`   Preservando: Usuário Mestre, processos importados do Radar + seus clientes, intimações da OAB ${KEEP_OAB}.\n`);

// Relatório do que será mantido (para conferência).
if (existe('users')) console.log(`   • Usuários mantidos (mestre): ${conta('users', `id = 'USR-MASTER-01' OR LOWER(COALESCE(username,'')) = 'jorgealvimtecnologia'`)}`);
if (existe('lawsuits')) console.log(`   • Processos mantidos (Radar): ${conta('lawsuits', KEEP_LAW)}`);
if (existe('clients')) console.log(`   • Clientes mantidos (Radar):  ${conta('clients', `id IN (${KEEP_CLIENTS_SQL})`)}`);
if (existe('court_publications')) console.log(`   • Intimações mantidas (sua OAB): ${conta('court_publications', `COALESCE(advogado_oab,'') LIKE '%${KEEP_OAB}%'`)}`);
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
  console.log('Para apagar de verdade (depois do backup): node scripts/limpar-demo.js --aplicar\n');
  process.exit(0);
}

// Aplicação: transação, com FKs desligadas para não travar em dependências.
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
console.log(`\n✅ Limpeza concluída: ${apagados} registro(s) fictício(s) removido(s). Reinicie o serviço (systemctl restart advocacia).\n`);
