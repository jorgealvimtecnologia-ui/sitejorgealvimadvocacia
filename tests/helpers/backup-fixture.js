/**
 * Cenário compartilhado dos testes de backup: um "projeto" de mentira com segredos
 * plantados, no qual o backup.sh REAL é executado.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SEG = {
  asaas: 'ASAAS-CHAVE-SECRETA-123456',
  meta: 'META-TOKEN-SECRETO-654321',
  sessao: 'SESSAO-TOKEN-ATIVO-777777',
  magic: 'MAGIC-LINK-TOKEN-888888',
  env: 'VALOR-SECRETO-DO-ENV-999999',
  chaveTls: 'CHAVE-PRIVADA-TLS-000000',
};

export function makeFakeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-backup-test-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'backup.sh'), path.join(dir, 'backup.sh'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'backup-scrub-db.js'), path.join(dir, 'scripts', 'backup-scrub-db.js'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'backup-cifrar.js'), path.join(dir, 'scripts', 'backup-cifrar.js'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(dir, '.env'), `PORT=3000\nASAAS_API_KEY=${SEG.env}\n# comentário\nSMTP_PASS=${SEG.env}\n`);
  fs.mkdirSync(path.join(dir, 'storage', 'clients'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'storage', 'clients', 'contrato.txt'), 'documento do cliente (não é segredo)');
  fs.mkdirSync(path.join(dir, 'nginx', 'ssl'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'nginx', 'ssl', 'fullchain.crt'), 'CERTIFICADO PUBLICO');
  fs.writeFileSync(path.join(dir, 'nginx', 'ssl', 'privkey.pem'), SEG.chaveTls);
  fs.writeFileSync(path.join(dir, 'nginx', 'ssl', 'servidor.key'), SEG.chaveTls);

  const db = new DatabaseSync(path.join(dir, 'leads.db'));
  db.exec(`
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE meta_api_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE auth_sessions (token TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE magic_upload_tokens (token TEXT PRIMARY KEY, client_id TEXT, expires_at TEXT, created_at TEXT);
    CREATE TABLE clients (id TEXT PRIMARY KEY, full_name TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE lawsuits (id TEXT PRIMARY KEY, number TEXT);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, event_name TEXT);
  `);
  db.prepare('INSERT INTO users VALUES (?,?)').run('U1', 'jorgealvimtecnologia');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO system_settings VALUES (?,?,?)').run('asaas_api_key', SEG.asaas, now);
  db.prepare('INSERT INTO system_settings VALUES (?,?,?)').run('asaas_environment', 'producao', now);
  db.prepare('INSERT INTO system_settings VALUES (?,?,?)').run('office_pix_key', 'escritorio@exemplo.com.br', now);
  db.prepare('INSERT INTO meta_api_settings VALUES (?,?,?)').run('meta_system_user_token', SEG.meta, now);
  db.prepare('INSERT INTO meta_api_settings VALUES (?,?,?)').run('meta_page_id', '12345', now);
  db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(SEG.sessao, 'admin', '{}', Date.now() + 1e6);
  db.prepare('INSERT INTO magic_upload_tokens VALUES (?,?,?,?)').run(SEG.magic, 'C1', now, now);
  db.prepare('INSERT INTO clients VALUES (?,?)').run('C1', 'Cliente Preservado');
  db.close();
  return dir;
}

/** Lê todos os bytes de uma árvore de arquivos como texto latin1 (para procurar segredos). */
export function readAllBytes(dir) {
  let out = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out += e.isDirectory() ? readAllBytes(p) : `\n[[${e.name}]]\n` + fs.readFileSync(p).toString('latin1');
  }
  return out;
}
