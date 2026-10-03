/** API: permissões granulares aplicadas no servidor (migration, toggle, my-permissions, bloqueio por aba). */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-granular-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

let masterToken, opToken;
const ID = `USR-GRAN-${Date.now()}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  const m = await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD });
  masterToken = m.body.token;
  const pwd = hashPassword('SenhaDeTeste#2026');
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?, 'operador.granular', ?, ?, 'Operador Granular', 'secretaria', datetime('now'))`).run(ID, pwd.hash, pwd.salt);
  // Só Financeiro e Config ligados (colunas granulares NULL = herdam)
  db.prepare(`INSERT INTO access_permissions (id, user_id, user_type, user_name, user_identifier, user_email, user_phone, role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices, tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador, tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at)
    VALUES (?, ?, 'admin', 'Operador Granular', 'operador.granular', '', '', 'custom', 0,0,0,0,0,0,0,0,0, 1, 0,0,0, 1, 1, 'office', datetime('now'), datetime('now'))`).run(`PERM-${ID}`, ID);
  const l = await request(app).post('/api/auth/login').send({ identifier: 'operador.granular', password: 'SenhaDeTeste#2026' });
  opToken = l.body.token;
});

const toggle = (key, enabled) => request(app).post('/api/access-control/toggle').set(auth(masterToken)).send({ user_id: ID, tab_key: key, enabled });
const perms = async () => (await request(app).get('/api/access-control/my-permissions').set(auth(opToken))).body.permissions;

describe('permissões granulares no servidor', () => {
  it('a migration criou as 5 colunas novas', () => {
    const cols = db.prepare('PRAGMA table_info(access_permissions)').all().map((c) => c.name);
    for (const c of ['tab_nfse', 'tab_esign', 'tab_blog', 'tab_audit', 'tab_alerts']) assert.ok(cols.includes(c), c);
  });
  it('herança: financeiro liga NFS-e e Assinaturas; Config liga Blog e Auditoria', async () => {
    const p = await perms();
    assert.equal(p.tab_nfse, 1);
    assert.equal(p.tab_esign, 1);
    assert.equal(p.tab_blog, 1);
    assert.equal(p.tab_audit, 1);
    assert.equal(p.tab_alerts, 0);
  });
  it('o mestre desliga SÓ a auditoria: o servidor passa a negar (403) e o blog segue liberado', async () => {
    assert.equal((await toggle('tab_audit', false)).status, 200);
    const p = await perms();
    assert.equal(p.tab_audit, 0);
    assert.equal(p.tab_blog, 1);
    assert.equal((await request(app).get('/api/admin/audit-logs').set(auth(opToken))).status, 403);
    assert.notEqual((await request(app).get('/api/admin/blog/posts').set(auth(opToken))).status, 403);
  });
  it('o mestre desliga SÓ a NFS-e: financeiro continua, NFS-e é negada', async () => {
    assert.equal((await toggle('tab_nfse', false)).status, 200);
    assert.equal((await request(app).get('/api/nfse/x').set(auth(opToken))).status, 403);
    assert.notEqual((await request(app).get('/api/financial/summary').set(auth(opToken))).status, 403);
  });
  it('alertas: sem a aba, /api/notifications é 403; ligando, libera', async () => {
    assert.equal((await request(app).get('/api/notifications').set(auth(opToken))).status, 403);
    assert.equal((await toggle('tab_alerts', true)).status, 200);
    assert.notEqual((await request(app).get('/api/notifications').set(auth(opToken))).status, 403);
  });
  it('manutenção/backups: operador comum (mesmo com Config) leva 403', async () => {
    assert.equal((await request(app).get('/api/admin/maintenance/backups').set(auth(opToken))).status, 403);
  });
  it('a matriz do mestre expõe as colunas novas', async () => {
    const r = await request(app).get('/api/access-control/matrix').set(auth(masterToken));
    const row = r.body.matrix.find((x) => x.user_id === ID);
    assert.equal(row.tab_audit, 0);
    assert.equal(row.tab_alerts, 1);
    assert.equal(row.tab_nfse, 0);
  });
  it('chave de aba inválida continua rejeitada', async () => {
    assert.equal((await toggle('tab_inexistente', true)).status, 400);
  });
});
