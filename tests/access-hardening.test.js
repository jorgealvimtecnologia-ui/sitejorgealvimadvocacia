/**
 * Testes das correções de acesso de 2026-09-23:
 * 1. Senha universal do mestre removida (login, portal do cliente, portal do colaborador)
 * 2. /storage/clients e /storage/office_drive exigem sessão (cliente só vê a própria pasta)
 * 3. Relatórios internos só com login de operador
 * 4. Portal do cliente: 1º acesso por código, cadastro não assume cliente existente,
 *    código de recuperação nunca volta na resposta e expira após 5 erros
 * 5. Tela de bloqueio do painel confere a senha real no servidor
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

describe('Portal do cliente: primeiro acesso, cadastro e recuperação', () => {
  const CPF = '529.982.247-25';
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, created_at, updated_at)
              VALUES ('CLI-TEST-NOPASS', 'PF', 'Cliente Sem Senha', ?, 'semsenha@teste.com', '(32) 90000-0000', ?, ?)`)
    .run(CPF, now, now);

  it('login de cliente sem senha NÃO adota a senha digitada (403 FIRST_ACCESS_REQUIRED)', async () => {
    const r = await request(app).post('/api/client-portal/login').send({ login: CPF, password: 'SenhaDoAtacante1' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'FIRST_ACCESS_REQUIRED');
    const row = db.prepare(`SELECT password_hash FROM clients WHERE id = 'CLI-TEST-NOPASS'`).get();
    assert.ok(!row.password_hash);
  });

  it('login unificado também exige o 1º acesso pelo código', async () => {
    const r = await request(app).post('/api/auth/login').send({ identifier: CPF, password: 'SenhaDoAtacante1' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'FIRST_ACCESS_REQUIRED');
  });

  it('cadastro com CPF já existente é recusado (não sobrescreve o cliente)', async () => {
    const r = await request(app).post('/api/client-portal/register').send({
      client_type: 'PF', full_name: 'Atacante', cpf: CPF, email: 'atacante@teste.com',
      phone: '(32) 91111-1111', password: 'SenhaDoAtacante1'
    });
    assert.equal(r.status, 409);
    const row = db.prepare(`SELECT email, password_hash FROM clients WHERE id = 'CLI-TEST-NOPASS'`).get();
    assert.equal(row.email, 'semsenha@teste.com');
    assert.ok(!row.password_hash);
  });

  it('esqueci a senha NÃO devolve o código e responde igual para cadastro inexistente', async () => {
    const r = await request(app).post('/api/client-portal/forgot-password').send({ login: CPF });
    assert.equal(r.status, 200);
    assert.ok(!('reset_code_demo' in r.body));
    const code = db.prepare(`SELECT reset_token FROM clients WHERE id = 'CLI-TEST-NOPASS'`).get().reset_token;
    assert.ok(code);
    assert.ok(!JSON.stringify(r.body).includes(code));
    const ghost = await request(app).post('/api/client-portal/forgot-password').send({ login: '111.111.111-11' });
    assert.deepEqual(ghost.body, r.body);
  });

  it('código errado 5 vezes invalida o código', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/client-portal/reset-password').send({ login: CPF, reset_code: '000000', new_password: 'NovaSenha#123' });
    }
    const row = db.prepare(`SELECT reset_token FROM clients WHERE id = 'CLI-TEST-NOPASS'`).get();
    assert.ok(!row.reset_token);
  });

  it('com o código correto, o cliente ativa o acesso e entra', async () => {
    await request(app).post('/api/client-portal/forgot-password').send({ login: CPF });
    const code = db.prepare(`SELECT reset_token FROM clients WHERE id = 'CLI-TEST-NOPASS'`).get().reset_token;
    const r = await request(app).post('/api/client-portal/reset-password').send({ login: CPF, reset_code: code, new_password: 'NovaSenha#123' });
    assert.equal(r.status, 200);
    const login = await request(app).post('/api/client-portal/login').send({ login: CPF, password: 'NovaSenha#123' });
    assert.equal(login.status, 200);
  });
});

describe('Tela de bloqueio do painel', () => {
  it('não desbloqueia com PIN 1234 nem com senha errada', async () => {
    const token = await masterToken();
    for (const password of ['1234', 'qualquercoisa']) {
      const r = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${token}`).send({ password });
      assert.equal(r.status, 401);
    }
  });

  it('desbloqueia com a senha real', async () => {
    const token = await masterToken();
    const r = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${token}`).send({ password: 'SenhaRealDoMestre#2026' });
    assert.equal(r.status, 200);
  });
});
