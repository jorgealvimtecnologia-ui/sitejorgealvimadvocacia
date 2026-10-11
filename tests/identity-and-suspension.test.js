/** Logins: vínculo operador<->colaborador é EXATO (sem "Ana" virar "Mariana") e operador suspenso não entra. */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-ident-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');
const { normalizeName, findEmployeeForUser, findUserForEmployee, findEmployeeByTypedName } = await import('../src/shared/identity-link.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const senha = 'SenhaDeTeste#2026';
const novoUsuario = (id, username, name, role = 'secretaria', ativo = 1) => {
  const p = hashPassword(senha);
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, username, p.hash, p.salt, name, role);
  db.prepare(`INSERT INTO access_permissions (id, user_id, user_type, user_name, user_identifier, role_template, tab_clients, tab_leads, is_active, data_scope, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?, 'secretaria', 1, 1, ?, 'office', datetime('now'), datetime('now'))`).run(`P-${id}`, id, name, username, ativo);
};
const novoColab = (id, name, cpf) =>
  db.prepare(`INSERT INTO hr_employees (id, name, cpf, position, department, contract_type, admission_date, created_at, updated_at) VALUES (?, ?, ?, 'Analista', 'Fin', 'CLT', '2024-01-01', datetime('now'), datetime('now'))`).run(id, name, cpf);

describe('normalizeName', () => {
  it('ignora acento, caixa, espaços e título', () => {
    assert.equal(normalizeName('  Dra.  Mariana  FONSECA Álvim '), 'mariana fonseca alvim');
    assert.equal(normalizeName('Dr. Dra. João'), 'joao');
  });
});

describe('vínculo exato', () => {
  it('"Ana" NÃO vira a "Mariana Souza Lima" (pedaço de nome não vincula)', () => {
    novoColab('E-MARIANA', 'Mariana Souza Lima', '11122233344');
    novoUsuario('U-ANA', 'ana.x', 'Ana');
    assert.equal(findEmployeeForUser(db, { id: 'U-ANA', name: 'Ana' }), null);
    assert.equal(findEmployeeByTypedName(db, 'ana'), null);
  });
  it('nome completo igual vincula (com título e sem acento)', () => {
    novoColab('E-CAMILA', 'Camila Vasconcelos', '22233344455');
    assert.equal(findEmployeeForUser(db, { id: 'U-X', name: 'Dra. Camila Vasconcêlos' })?.id, 'E-CAMILA');
    assert.equal(findUserForEmployee(db, { id: 'E-Z', name: 'Ana' })?.id, 'U-ANA');
  });
  it('homônimos NÃO vinculam (o mestre resolve)', () => {
    novoColab('E-J1', 'Joana Prado', '33344455566');
    novoColab('E-J2', 'Joana Prado', '44455566677');
    assert.equal(findEmployeeForUser(db, { id: 'U-J', name: 'Joana Prado' }), null);
  });
  it('login por senha da "Ana" NÃO entrega sessão de colaborador de outra pessoa', async () => {
    const a = await request(app).post('/api/auth/login').send({ identifier: 'ana.x', password: senha });
    assert.equal(a.status, 200);
    assert.ok(!a.body.employeeToken, 'Ana recebeu sessão de colaborador de outra pessoa');
  });
});

describe('operador suspenso', () => {
  it('não entra com a senha (403) e a API também nega para sessão já aberta', async () => {
    novoUsuario('U-SUSP', 'suspenso.x', 'Suspenso X');
    const ok = await request(app).post('/api/auth/login').send({ identifier: 'suspenso.x', password: senha });
    assert.equal(ok.status, 200);
    db.prepare(`UPDATE access_permissions SET is_active = 0 WHERE user_id = 'U-SUSP'`).run();
    assert.equal((await request(app).get('/api/clients').set('Authorization', `Bearer ${ok.body.token}`)).status, 403);
    const de_novo = await request(app).post('/api/auth/login').send({ identifier: 'suspenso.x', password: senha });
    assert.equal(de_novo.status, 403);
    assert.ok(!de_novo.body.token);
  });
  it('reativado volta a funcionar', async () => {
    db.prepare(`UPDATE access_permissions SET is_active = 1 WHERE user_id = 'U-SUSP'`).run();
    const l = await request(app).post('/api/auth/login').send({ identifier: 'suspenso.x', password: senha });
    assert.equal(l.status, 200);
    assert.notEqual((await request(app).get('/api/clients').set('Authorization', `Bearer ${l.body.token}`)).status, 403);
  });
});
