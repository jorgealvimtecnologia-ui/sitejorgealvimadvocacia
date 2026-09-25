#!/usr/bin/env node
/**
 * PURGA DE USUÁRIOS/DADOS FICTÍCIOS (demonstração)
 * ------------------------------------------------------------------
 * Remove com segurança os registros de demonstração do sistema, PRESERVANDO
 * SEMPRE o Usuário Mestre (jorgealvimtecnologia). Faz BACKUP do banco antes
 * de apagar e roda dentro de uma transação (tudo-ou-nada).
 *
 * Uso:
 *   node scripts/purge-ficticios.js                 # DRY-RUN: só mostra o que apagaria
 *   node scripts/purge-ficticios.js --apply         # apaga (modo CONSERVADOR: seguro p/ produção)
 *   node scripts/purge-ficticios.js --all-except-master --apply
 *                                                   # apaga TODOS os usuários exceto o Mestre
 *                                                   # (use só onde você confirmou que o resto é fictício)
 *
 * Detecção CONSERVADORA (segura em produção): apaga apenas o que tem marca de
 * demonstração — id contendo "-DEMO-", ids de seed conhecidos, CPFs fictícios do
 * seed e usernames de seed. Dados reais nunca são tocados.
 * ------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'leads.db');

const APPLY = process.argv.includes('--apply');
const ALL_EXCEPT_MASTER = process.argv.includes('--all-except-master');

// --- Quem é o Mestre (NUNCA apagar) ---
const isMaster = (u) =>
  u.id === 'USR-MASTER-01' || u.username === 'jorgealvimtecnologia' || u.role === 'master';

// --- CPFs/usernames/ids fictícios conhecidos (do seed-demo.js / seed-bulk.js) ---
const DEMO_CPFS = new Set(
  ['123.456.789-09', '987.654.321-00', '456.789.123-11', '111.444.777-35',
   '222.555.888-46', '12345678900'].map(s => s.replace(/\D/g, ''))
);
const SEED_USERNAMES = new Set([
  'jorge.alvim', 'mariana.alvim', 'lucas.estagiario', 'patricia.secretaria',
  'carlos.motorista', 'roberto.medeiros', 'camila.adv', 'fernanda.adm',
  'juliana.recepcao', 'gabriel.estagio', 'mariana.adv', 'carlos.adv',
  'secretaria', 'financeiro', 'rh', 'estagiario',
  // confirmados como fictícios pelo Dr. Jorge (2026-09-25):
  'dra mariana alvim', 'dra gabriela alvim'
]);
const SEED_ID_RE = /(-DEMO-|^USR-(ADV|SEC|FIN|RH|EST)-)/i;

function ehFicticioUser(u) {
  if (isMaster(u)) return false;            // trava de segurança
  if (ALL_EXCEPT_MASTER) return true;       // modo agressivo (só onde confirmado)
  const cpf = String(u.username || '').replace(/\D/g, '');
  return SEED_ID_RE.test(u.id || '') ||
         SEED_USERNAMES.has(String(u.username || '').toLowerCase().trim()) ||
         (cpf.length === 11 && DEMO_CPFS.has(cpf));
}

function main() {
  const db = new DatabaseSync(dbPath);

  // 1) Usuários-alvo
  const users = db.prepare('SELECT id, username, role FROM users').all();
  const apagarUsers = users.filter(ehFicticioUser);
  const manterUsers = users.filter(u => !ehFicticioUser(u));
  const idsApagar = new Set(apagarUsers.map(u => u.id));

  // 2) Colaboradores e clientes de DEMONSTRAÇÃO (sempre só os marcados -DEMO-)
  const demoEmployees = safeAll(db, "SELECT id, name, cpf FROM hr_employees WHERE id LIKE '%DEMO%'");
  const demoClients = safeAll(db, "SELECT id, full_name FROM clients WHERE id LIKE '%DEMO%'");

  // 3) Permissões órfãs / de demo
  const demoPerms = safeAll(db,
    "SELECT id, user_id, user_name FROM access_permissions WHERE CAST(id AS TEXT) LIKE '%DEMO%'");

  // ---- Relatório ----
  console.log('==================================================');
  console.log(`  PURGA DE FICTÍCIOS — ${APPLY ? 'APLICAR' : 'DRY-RUN (nada será apagado)'}`);
  console.log(`  Banco: ${dbPath}`);
  console.log(`  Modo:  ${ALL_EXCEPT_MASTER ? 'TODOS exceto o Mestre' : 'CONSERVADOR (só marcados como demo)'}`);
  console.log('==================================================\n');

  console.log(`👤 Usuários a APAGAR (${apagarUsers.length}):`);
  apagarUsers.forEach(u => console.log(`   ✗ ${u.id} | ${u.username} | ${u.role}`));
  console.log(`\n🔒 Usuários a MANTER (${manterUsers.length}):`);
  manterUsers.forEach(u => console.log(`   ✓ ${u.id} | ${u.username} | ${u.role}${isMaster(u) ? '  (MESTRE)' : ''}`));

  console.log(`\n👷 Colaboradores demo a apagar (${demoEmployees.length}): ` +
    demoEmployees.map(e => e.id).join(', ') || '(nenhum)');
  console.log(`🧑 Clientes demo a apagar (${demoClients.length}): ` +
    (demoClients.map(c => c.id).join(', ') || '(nenhum)'));
  console.log(`🔑 Permissões demo a apagar (${demoPerms.length})`);

  // Segurança: garante que o Mestre está entre os mantidos
  if (!manterUsers.some(isMaster)) {
    console.error('\n✗ ABORTADO: o Usuário Mestre não foi encontrado entre os mantidos. Nada foi apagado.');
    db.close();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nℹ️  DRY-RUN. Reveja a lista acima e rode com --apply para efetivar.');
    db.close();
    return;
  }

  // ---- Backup antes de apagar ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${dbPath}.bak-${stamp}`;
  fs.copyFileSync(dbPath, backup);
  console.log(`\n💾 Backup criado: ${backup}`);

  // ---- Exclusão transacional ----
  db.exec('BEGIN');
  try {
    let n = 0;
    const delUser = db.prepare('DELETE FROM users WHERE id = ?');
    const delPermByUser = db.prepare('DELETE FROM access_permissions WHERE user_id = ?');
    for (const u of apagarUsers) { delUser.run(u.id); delPermByUser.run(u.id); n++; }

    safeRun(db, "DELETE FROM hr_employees WHERE id LIKE '%DEMO%'");
    safeRun(db, "DELETE FROM clients WHERE id LIKE '%DEMO%'");
    safeRun(db, "DELETE FROM access_permissions WHERE CAST(id AS TEXT) LIKE '%DEMO%'");

    db.exec('COMMIT');
    console.log(`\n✅ Concluído. ${n} usuário(s) fictício(s) removido(s) + colaboradores/clientes/permissões de demo.`);
    console.log('   O Usuário Mestre foi preservado.');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('\n✗ Erro durante a exclusão — ROLLBACK feito, nada foi apagado. Detalhe:', e.message);
    console.error(`   O banco original está intacto; backup também em: ${backup}`);
    process.exit(1);
  }
  db.close();
}

function safeAll(db, sql) { try { return db.prepare(sql).all(); } catch (e) { return []; } }
function safeRun(db, sql) { try { db.prepare(sql).run(); } catch (e) {} }

main();
