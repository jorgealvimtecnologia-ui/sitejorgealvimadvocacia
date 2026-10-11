#!/usr/bin/env node
/**
 * ==============================================================================
 * VERIFICA SE O LOGIN GOOGLE FORJADO FOI EXPLORADO (somente leitura)
 * ==============================================================================
 * Até a correção, o login Google aceitava um "token de teste" (mock-google-token:…) em
 * qualquer ambiente, permitindo entrar como mestre sem conta Google. Este script procura os
 * rastros que isso deixaria. NÃO altera nada.
 *
 *   node scripts/check-google-forgery.js [--dias=90] [--db=caminho/leads.db]
 *
 * 1) google_id SUSPEITO: o identificador real de uma conta Google é numérico (cerca de 21
 *    dígitos). Um login forjado grava o texto que o atacante escolheu (ex.: "qualquer-id").
 *    Verifica as tabelas users, clients e hr_employees.
 * 2) Logins Google no registro de auditoria, agrupados por IP: reconheça os SEUS; IPs e
 *    navegadores desconhecidos pedem investigação.
 *
 * Código de saída: 1 se achar google_id suspeito; 0 caso contrário (o item 2 é informativo).
 * ==============================================================================
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL_GOOGLE_ID = /^\d{15,25}$/;
const TABLES = [
  ['users', 'id, username AS nome, google_id, google_email'],
  ['clients', 'id, full_name AS nome, google_id, email AS google_email'],
  ['hr_employees', 'id, name AS nome, google_id, email AS google_email'],
];

/** @returns {{ suspicious: object[], logins: object[] }} */
export function inspectGoogleForgery(db, { days = 90, now = new Date() } = {}) {
  const suspicious = [];
  for (const [table, cols] of TABLES) {
    let rows = [];
    try {
      rows = db.prepare(`SELECT ${cols} FROM ${table} WHERE google_id IS NOT NULL AND TRIM(google_id) != ''`).all();
    } catch (e) {
      if (!/no such (table|column)/i.test(e.message)) throw e;
    }
    for (const r of rows) {
      if (!REAL_GOOGLE_ID.test(String(r.google_id).trim()))
        suspicious.push({ tabela: table, id: r.id, nome: r.nome, google_id: r.google_id, email: r.google_email });
    }
  }
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  let logins = [];
  try {
    logins = db
      .prepare(
        `
      SELECT COALESCE(ip_address, '(sem IP)') AS ip, user_name, event_name, COUNT(*) AS total, MIN(created_at) AS primeiro, MAX(created_at) AS ultimo,
             MAX(COALESCE(user_agent, '')) AS navegador
      FROM audit_logs WHERE UPPER(event_name) LIKE '%GOOGLE%' AND created_at >= ?
      GROUP BY ip, user_name, event_name ORDER BY ultimo DESC`
      )
      .all(since);
  } catch (e) {
    if (!/no such table/i.test(e.message)) throw e;
  }
  return { suspicious, logins };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, ...v] = a.slice(2).split('=');
        return [k, v.join('=')];
      })
  );
  const dbFile = path.resolve(args.db || process.env.DB_PATH || path.join(ROOT_DIR, 'leads.db'));
  const days = Number(args.dias) || 90;
  const db = new DatabaseSync(dbFile);
  const { suspicious, logins } = inspectGoogleForgery(db, { days });
  db.close();

  console.log(`\nVerificação de login Google forjado — banco: ${dbFile}\n`);
  if (suspicious.length) {
    console.log(`🚨 ${suspicious.length} google_id SUSPEITO(S) (não é um identificador numérico do Google):`);
    suspicious.forEach((s) =>
      console.log(`   - ${s.tabela}: ${s.nome} (${s.id}) google_id="${s.google_id}" e-mail=${s.email || '-'}`)
    );
    console.log(
      '   Isso indica login forjado nessa conta. Recomendações: trocar a senha dela, apagar o google_id suspeito,'
    );
    console.log('   encerrar as sessões e revisar o que essa conta acessou no registro de auditoria.\n');
  } else {
    console.log('✅ Nenhum google_id suspeito em users, clients e hr_employees.\n');
  }
  console.log(`Logins Google nos últimos ${days} dias (reconheça os seus; IP desconhecido merece investigação):`);
  if (!logins.length) console.log('   (nenhum registrado)');
  logins.forEach((l) =>
    console.log(
      `   ${String(l.ip).padEnd(18)} ${String(l.user_name).padEnd(28)} ${String(l.event_name).padEnd(24)} x${l.total}  ${String(l.primeiro).slice(0, 16)} → ${String(l.ultimo).slice(0, 16)}  ${String(l.navegador).slice(0, 40)}`
    )
  );
  console.log('');
  process.exit(suspicious.length ? 1 : 0);
}
