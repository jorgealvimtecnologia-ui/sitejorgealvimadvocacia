'use strict';

/**
 * Conexão única (singleton) com o SQLite usando better-sqlite3.
 *
 * Por que better-sqlite3 e não sqlite3?
 *  - API síncrona: em SQLite as queries são locais e muito rápidas; o modelo
 *    síncrono elimina o "callback hell" e é, na prática, mais rápido para VPS.
 *  - Suporta transações e PRAGMAs de forma trivial.
 *
 * PRAGMAs de CONEXÃO (foreign_keys, busy_timeout) NÃO persistem no arquivo,
 * por isso são reaplicados aqui a cada processo que abre o banco.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

const dbPath = config.db.path;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath, {
  // verbose: console.log, // descomente para depurar SQL em dev
});

// PRAGMAs de conexão (reaplicados sempre)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');

/**
 * Aplica o schema.sql de forma idempotente (CREATE TABLE IF NOT EXISTS).
 * Rode uma vez na subida do app (ver app.js) ou via `npm run migrate`.
 */
function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

process.on('exit', () => db.close());

module.exports = { db, migrate };
