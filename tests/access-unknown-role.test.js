/** Papel desconhecido NUNCA vira "Advogado" por omissão: "atendente" = secretária; o resto = sem acesso. */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-role-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');
const { syncAllAccessPermissions } = await import('../src/modules/access/access.routes.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const senha = 'SenhaDeTeste#2026';
function criar(username, role) {
  const id = `USR-ROLE-${username}`;
  const p = hashPassword(senha);
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, username, p.hash, p.salt, `Pessoa ${username}`, role);
  return id;
}
async function permissoes(username) {
  const l = await request(app).post('/api/auth/login').send({ identifier: username, password: senha });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const r = await request(app).get('/api/access-control/my-permissions').set('Authorization', `Bearer ${l.body.token}`);
  return r.body.permissions;
}

describe('papel do operador -> perfil', () => {
  it('"atendente" (Atendimento / Recepção) vira Secretária, e não Advogado', async () => {
    const id = criar('keila.teste', 'atendente');
    const p = await permissoes('keila.teste');
    assert.equal(p.tab_leads, 1);
    assert.equal(p.tab_clients, 1);
    assert.equal(p.tab_calendar, 1);
    for (const k of ['tab_lawsuits', 'tab_radar', 'tab_drive', 'tab_publications', 'tab_offices', 'tab_financial', 'tab_users', 'tab_settings', 'tab_audit', 'tab_blog'])
      assert.equal(p[k], 0, `${k} deveria estar bloqueada para a recepção`);
    syncAllAccessPermissions();
    assert.equal(db.prepare('SELECT role_template FROM access_permissions WHERE user_id = ?').get(id).role_template, 'secretaria');
  });
  it('papel desconhecido fica SEM acesso (menor privilégio) até o mestre escolher o perfil', async () => {
    criar('papel.estranho', 'xyz-desconhecido');
    const p = await permissoes('papel.estranho');
    assert.ok(Object.values(p).every((v) => v === 0), JSON.stringify(p));
  });
  it('quem estava no perfil Advogado por engano é corrigido na sincronização', () => {
    const id = criar('quem.errou', 'atendente');
    db.prepare(`INSERT OR REPLACE INTO access_permissions (id, user_id, user_type, user_name, user_identifier, role_template, tab_clients, tab_lawsuits, is_active, data_scope, created_at, updated_at) VALUES (?, ?, 'admin', 'Pessoa', 'quem.errou', 'advogado', 1, 1, 1, 'assigned', datetime('now'), datetime('now'))`).run(`PERM-${id}`, id);
    syncAllAccessPermissions();
    const r = db.prepare('SELECT role_template, tab_lawsuits FROM access_permissions WHERE user_id = ?').get(id);
    assert.equal(r.role_template, 'secretaria');
    assert.equal(r.tab_lawsuits, 0);
  });
  it('o mestre que escolheu "custom" manualmente NÃO é sobrescrito', () => {
    const id = criar('escolha.manual', 'atendente');
    db.prepare(`INSERT OR REPLACE INTO access_permissions (id, user_id, user_type, user_name, user_identifier, role_template, tab_drive, is_active, data_scope, created_at, updated_at) VALUES (?, ?, 'admin', 'Pessoa', 'escolha.manual', 'custom', 1, 1, 'assigned', datetime('now'), datetime('now'))`).run(`PERM-${id}`, id);
    syncAllAccessPermissions();
    const r = db.prepare('SELECT role_template, tab_drive FROM access_permissions WHERE user_id = ?').get(id);
    assert.equal(r.role_template, 'custom');
    assert.equal(r.tab_drive, 1);
  });
});
