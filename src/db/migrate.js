/**
 * Runner de migrations versionadas (SQLite).
 * Aplica, em ordem, os arquivos .sql ainda não aplicados de src/db/migrations/,
 * registrando cada um em schema_migrations. Idempotente e transacional.
 * Chamado no boot do server.js. Substitui os ALTER TABLE espalhados pelo código.
 */
import fs from 'node:fs';
import path from 'node:path';

export function runMigrations(db, dir) {
  try { db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT)`); } catch (e) { return { applied: 0 }; }
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort(); } catch (e) { return { applied: 0 }; }
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      db.exec('BEGIN');
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
      db.exec('COMMIT');
      applied++;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.warn(`[MIGRATION] Falha em ${f}: ${e.message}`);
    }
  }
  if (applied) console.log(`🗄️  [MIGRATIONS] ${applied} migration(s) aplicada(s).`);
  return { applied };
}
