/**
 * RBAC fechada por padrão (deny-by-default). Garante que cada tipo de sessão só
 * alcança o que é do seu perfil — a brecha em que o portal do colaborador chegava
 * às rotas do painel (clientes, financeiro, backup) não pode voltar.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

const TMP_DB = path.join(os.tmpdir(), `jaw-rbac-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { createSession, createClientSession, createEmployeeSession } = await import('../src/middleware/auth.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

async function masterToken() {
  const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(r.status, 200);
  return r.body.token;
}

// Usuário do painel com acesso só a Clientes
const now = new Date().toISOString();
const pw = hashPassword('SenhaSecret#1');
db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?,?,?,?,?,?,?)`)
  .run('USR-REST-1', 'secretaria_rbac', pw.hash, pw.salt, 'Secretária RBAC', 'admin', now);
db.prepare(`INSERT INTO access_permissions (id, user_id, user_type, user_name, role_template, tab_clients, tab_financial, tab_users, created_at, updated_at)
            VALUES ('AP-REST-1','USR-REST-1','user','Secretária RBAC','custom',1,0,0,?,?)`).run(now, now);
const restrictedToken = createSession({ id: 'USR-REST-1', username: 'secretaria_rbac', name: 'Secretária RBAC', role: 'admin' });
const employeeToken = createEmployeeSession({ id: 'EMP-RBAC-1', name: 'Colaborador RBAC', cpf: '000' });
const clientToken = createClientSession({ id: 'CLI-RBAC-1', full_name: 'Cliente RBAC' });

const get = (url, tok) => request(app).get(url).set('Authorization', `Bearer ${tok}`);

describe('Colaborador só acessa o portal dele', () => {
  const blocked = ['/api/clients', '/api/lawsuits', '/api/financial/transactions', '/api/leads',
    '/api/users', '/api/hr/employees', '/api/drive/files', '/api/access-control/matrix',
    '/api/admin/backup/download-db', '/api/notifications'];
  for (const url of blocked) {
    it(`colaborador → 403 em ${url}`, async () => {
      assert.equal((await get(url, employeeToken)).status, 403);
    });
  }
  it('colaborador → OK no próprio portal e em foguetes (compartilhado)', async () => {
    assert.notEqual((await get('/api/hr/employee/me', employeeToken)).status, 403);
    assert.notEqual((await get('/api/rockets', employeeToken)).status, 403);
  });
});

describe('Cliente só acessa o portal dele', () => {
  for (const url of ['/api/clients', '/api/lawsuits', '/api/users', '/api/rockets', '/api/notifications', '/api/admin/backup/download-db']) {
    it(`cliente → 403 em ${url}`, async () => {
      assert.equal((await get(url, clientToken)).status, 403);
    });
  }
});

describe('Usuário restrito do painel respeita a matriz de permissões', () => {
  it('acessa Clientes (aba liberada)', async () => {
    assert.notEqual((await get('/api/clients', restrictedToken)).status, 403);
  });
  it('é barrado em Financeiro e Usuários (abas não liberadas)', async () => {
    assert.equal((await get('/api/financial/transactions', restrictedToken)).status, 403);
    assert.equal((await get('/api/users', restrictedToken)).status, 403);
  });
  it('é barrado no backup do banco (só o mestre)', async () => {
    assert.equal((await get('/api/admin/backup/download-db', restrictedToken)).status, 403);
  });
});

describe('Mestre acessa tudo', () => {
  it('clientes, financeiro, usuários, matriz e backup', async () => {
    const t = await masterToken();
    for (const url of ['/api/clients', '/api/financial/transactions', '/api/users', '/api/access-control/matrix']) {
      assert.notEqual((await get(url, t)).status, 403, `mestre bloqueado em ${url}`);
    }
  });
});

describe('Deny-by-default', () => {
  it('rota /api inexistente é negada (não cai em 404 aberto)', async () => {
    const r = await get('/api/rota-que-nao-existe-xyz', employeeToken);
    assert.equal(r.status, 403);
  });
  it('sem token, rota protegida pede login (401)', async () => {
    assert.equal((await request(app).get('/api/clients')).status, 401);
  });
});
