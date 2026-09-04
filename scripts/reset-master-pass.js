#!/usr/bin/env node
/**
 * RECUPERAÇÃO DE SENHA DO USUÁRIO MESTRE
 * ------------------------------------------------------------------
 * Redefine a senha do usuário mestre (jorgealvimtecnologia) gravando
 * um novo hash PBKDF2-SHA512 (210k iterações) direto no banco.
 * Uso (no servidor):  NEWPASS='nova-senha' node scripts/reset-master-pass.js
 * Normalmente chamado pelo redefinir-senha-mestre.bat (dois cliques).
 * ------------------------------------------------------------------
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newPass = (process.env.NEWPASS || process.argv[2] || '').trim();

if (!newPass || newPass.length < 4) {
  console.error('✗ Senha inválida. Informe ao menos 4 caracteres (variável NEWPASS).');
  process.exit(1);
}

const dbPath = path.join(__dirname, '..', 'leads.db');
try {
  const db = new DatabaseSync(dbPath);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(newPass, salt, 210000, 64, 'sha512').toString('hex');
  const r = db.prepare(
    `UPDATE users SET password_hash = ?, salt = ? WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`
  ).run(hash, salt);
  db.close();
  if (r.changes > 0) {
    console.log('✅ Senha do usuário mestre redefinida com sucesso (PBKDF2-SHA512, 210k).');
  } else {
    console.error('⚠️ Usuário mestre não encontrado no banco.');
    process.exit(2);
  }
} catch (e) {
  console.error('✗ Erro ao redefinir a senha do mestre:', e.message);
  process.exit(1);
}
