'use strict';

/**
 * Cria (ou promove) um usuário admin.
 * Uso:  node scripts/create-admin.js "Jorge Alvim" email@dominio.com SenhaForte123
 */

const bcrypt = require('bcrypt');
const { db, migrate } = require('../db');

migrate();

const [, , name, email, password] = process.argv;
if (!name || !email || !password) {
  console.error('Uso: node scripts/create-admin.js "Nome" email senha');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);

if (existing) {
  db.prepare(`UPDATE users SET role='admin', status='active', password_hash=? WHERE id=?`)
    .run(hash, existing.id);
  console.log('Usuário promovido a admin:', email);
} else {
  db.prepare(`INSERT INTO users (name,email,password_hash,role,status)
              VALUES (?,?,?,'admin','active')`).run(name, email, hash);
  console.log('Admin criado:', email);
}
process.exit(0);
