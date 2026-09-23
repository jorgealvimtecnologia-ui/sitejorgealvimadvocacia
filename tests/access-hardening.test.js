/**
 * Testes das correções de acesso de 2026-09-23:
 * 1. Senha universal do mestre removida (login, portal do cliente, portal do colaborador)
 * 2. /storage/clients e /storage/office_drive exigem sessão (cliente só vê a própria pasta)
 * 3. Relatórios internos só com login de operador
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TMP_DB = path.join(os.tmpdir(), `jaw-access-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { createClientSession } = await import('../src/middleware/auth.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'storage', 'clients', 'CLI-TEST-ACCESS');
const OTHER_DIR = path.join(ROOT, 'storage', 'clients', 'CLI-TEST-OTHER');

fs.mkdirSync(CLIENT_DIR, { recursive: true });
fs.mkdirSync(OTHER_DIR, { recursive: true });
fs.writeFileSync(path.join(CLIENT_DIR, 'doc.txt'), 'documento do cliente');
fs.writeFileSync(path.join(OTHER_DIR, 'doc.txt'), 'documento de outro cliente');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch {}
  }
  fs.rmSync(CLIENT_DIR, { recursive: true, force: true });
  fs.rmSync(OTHER_DIR, { recursive: true, force: true });
});

async function masterToken() {
  const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(r.status, 200);
  return r.body.token;
}

describe('Senha universal do mestre removida', () => {
  it('login do painel recusa a antiga senha fixa', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'jorgealvim' });
    assert.notEqual(r.status, 200);
  });

  it('login do painel aceita a senha real', async () => {
    assert.ok(await masterToken());
  });

  it('apelidos genéricos (admin/mestre) não levam à conta do mestre', async () => {
    for (const username of ['admin', 'mestre']) {
      const r = await request(app).post('/api/auth/login').send({ username, password: 'SenhaRealDoMestre#2026' });
      assert.notEqual(r.body?.user?.id, 'USR-MASTER-01');
    }
  });

  it('portal do colaborador recusa a antiga senha fixa', async () => {
    const r = await request(app).post('/api/hr/portal/login').send({ identifier: 'jorgealvimtecnologia', password: 'jorgealvim' });
    assert.notEqual(r.status, 200);
  });
});

describe('/storage protegido', () => {
  it('sem sessão → 401', async () => {
    const r = await request(app).get('/storage/clients/CLI-TEST-ACCESS/doc.txt');
    assert.equal(r.status, 401);
  });

  it('operador mestre (via ?token=) → 200', async () => {
    const token = await masterToken();
    const r = await request(app).get(`/storage/clients/CLI-TEST-ACCESS/doc.txt?token=${token}`);
    assert.equal(r.status, 200);
  });

  it('cliente acessa a própria pasta e é barrado na de outro cliente', async () => {
    const token = createClientSession({ id: 'CLI-TEST-ACCESS', full_name: 'Cliente Teste' });
    const own = await request(app).get('/storage/clients/CLI-TEST-ACCESS/doc.txt').set('Authorization', `Bearer ${token}`);
    assert.equal(own.status, 200);
    const other = await request(app).get('/storage/clients/CLI-TEST-OTHER/doc.txt').set('Authorization', `Bearer ${token}`);
    assert.equal(other.status, 403);
  });

  it('cliente não acessa o Drive do escritório', async () => {
    const token = createClientSession({ id: 'CLI-TEST-ACCESS', full_name: 'Cliente Teste' });
    const r = await request(app).get('/storage/office_drive/qualquer.pdf').set('Authorization', `Bearer ${token}`);
    assert.equal(r.status, 401);
  });
});

describe('Relatórios internos', () => {
  it('/public não serve mais os relatórios', async () => {
    const r = await request(app).get('/public/relatorio_roadmap_modificacoes.pdf');
    assert.notEqual(r.status, 200);
  });

  it('rota protegida exige login e entrega com sessão', async () => {
    const anon = await request(app).get('/api/admin/relatorios/relatorio_roadmap_modificacoes.pdf');
    assert.equal(anon.status, 401);
    const token = await masterToken();
    const ok = await request(app).get(`/api/admin/relatorios/relatorio_roadmap_modificacoes.pdf?token=${token}`);
    assert.equal(ok.status, 200);
  });

  it('bloqueia path traversal', async () => {
    const token = await masterToken();
    const r = await request(app).get(`/api/admin/relatorios/..%2F..%2Fserver.js?token=${token}`);
    assert.notEqual(r.status, 200);
  });
});
