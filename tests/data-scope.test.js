/**
 * AUD-27 Parte 2 — ESCOPO DE DADOS: "cada advogado só vê os processos dele".
 * O RBAC já decide as ABAS; aqui provamos o filtro DENTRO da aba de Processos:
 *  - advogado (data_scope 'assigned') vê os seus + os SEM dono (pool), nunca os de outro;
 *  - não pode abrir/editar/excluir/lançar andamento em processo de outro advogado (403);
 *  - o mestre vê tudo e pode ATRIBUIR o responsável; aí o dono passa a ver.
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-scope-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const SENHA = 'SenhaDeTeste#2026';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let masterToken, tokenA, tokenB, idA, idB;

async function criarAdvogado(id, username) {
  const p = hashPassword(SENHA);
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?, ?, ?, ?, ?, 'advogado', datetime('now'))`)
    .run(id, username, p.hash, p.salt, `Adv ${username}`);
  db.prepare(`INSERT INTO access_permissions (id, user_id, user_type, user_name, user_identifier, role_template, is_active, data_scope, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?, 'custom', 1, 'office', datetime('now'), datetime('now'))`)
    .run(`P-${id}`, id, `Adv ${username}`, username);
  const ap = await request(app).post('/api/access-control/apply-template').set(auth(masterToken)).send({ user_id: id, template_key: 'advogado' });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  const l = await request(app).post('/api/auth/login').send({ identifier: username, password: SENHA });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  return l.body.token;
}

async function criarProcesso(token, cnj) {
  const r = await request(app).post('/api/lawsuits').set(auth(token)).send({ client_id: 'CLI-SCOPE-1', cnj_number: cnj, tribunal: 'TJMG' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.lawsuitId;
}
const idsNaLista = async (token) => {
  const r = await request(app).get('/api/lawsuits').set(auth(token));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body.lawsuits || []).map((l) => l.id);
};

before(async () => {
  masterToken = (await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD })).body.token;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at) VALUES ('CLI-SCOPE-1','PF','Cliente Escopo','529.982.247-25','cli.escopo@teste.com','(32) 90000-0000','Ativo',?,?)`).run(now, now);
  idA = 'U-ADV-A'; idB = 'U-ADV-B';
  tokenA = await criarAdvogado(idA, 'adv.a');
  tokenB = await criarAdvogado(idB, 'adv.b');
});

describe('escopo de dados — processos', () => {
  let A1, B1, POOL;
  before(async () => {
    A1 = await criarProcesso(tokenA, '5000001-11.2026.8.13.0145');   // dono: A
    B1 = await criarProcesso(tokenB, '5000002-22.2026.8.13.0145');   // dono: B
    POOL = await criarProcesso(masterToken, '5000003-33.2026.8.13.0145'); // mestre cria: sem dono (pool)
  });

  it('o processo nasce no nome de quem cria (advogado)', () => {
    const row = db.prepare(`SELECT responsible_user_id FROM lawsuits WHERE id = ?`).get(A1);
    assert.equal(row.responsible_user_id, idA);
    const pool = db.prepare(`SELECT responsible_user_id FROM lawsuits WHERE id = ?`).get(POOL);
    assert.equal(pool.responsible_user_id, null, 'mestre cria sem dono = pool do escritório');
  });

  it('advogado A vê os seus + o pool, nunca o de B', async () => {
    const ids = await idsNaLista(tokenA);
    assert.ok(ids.includes(A1), 'A deveria ver o próprio');
    assert.ok(ids.includes(POOL), 'A deveria ver o pool (sem dono)');
    assert.ok(!ids.includes(B1), 'A NÃO pode ver o processo de B');
  });

  it('o mestre vê todos', async () => {
    const ids = await idsNaLista(masterToken);
    assert.ok([A1, B1, POOL].every((x) => ids.includes(x)));
  });

  it('A não edita, não exclui, nem lança andamento no processo de B (403)', async () => {
    const put = await request(app).put(`/api/lawsuits/${B1}`).set(auth(tokenA)).send({ status: 'Suspenso' });
    assert.equal(put.status, 403);
    const mov = await request(app).post(`/api/lawsuits/${B1}/movements`).set(auth(tokenA)).send({ movement_date: '2026-10-06', title: 'x' });
    assert.equal(mov.status, 403);
    const del = await request(app).delete(`/api/lawsuits/${B1}`).set(auth(tokenA));
    assert.equal(del.status, 403);
  });

  it('A edita o próprio normalmente', async () => {
    const put = await request(app).put(`/api/lawsuits/${A1}`).set(auth(tokenA)).send({ status: 'Suspenso' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
  });

  it('A não consegue se auto-atribuir o processo de outro (nem muda o dono)', async () => {
    await request(app).put(`/api/lawsuits/${A1}`).set(auth(tokenA)).send({ responsible_user_id: idB });
    const row = db.prepare(`SELECT responsible_user_id FROM lawsuits WHERE id = ?`).get(A1);
    assert.equal(row.responsible_user_id, idA, 'advogado comum não pode reatribuir o responsável');
  });

  it('o mestre atribui B1 para A, e aí A passa a ver', async () => {
    const put = await request(app).put(`/api/lawsuits/${B1}`).set(auth(masterToken)).send({ responsible_user_id: idA });
    assert.equal(put.status, 200);
    const ids = await idsNaLista(tokenA);
    assert.ok(ids.includes(B1), 'depois de atribuído, A deve ver B1');
    const idsB = await idsNaLista(tokenB);
    assert.ok(!idsB.includes(B1), 'B não vê mais o que passou para A');
  });
});

describe('lista de responsáveis (para o seletor do card)', () => {
  it('mestre pode atribuir e recebe a lista de operadores', async () => {
    const r = await request(app).get('/api/lawsuits/responsaveis').set(auth(masterToken));
    assert.equal(r.status, 200);
    assert.equal(r.body.canAssign, true);
    assert.ok(r.body.operators.some((o) => o.id === idA) && r.body.operators.some((o) => o.id === idB));
  });
  it('advogado comum NÃO pode atribuir (canAssign false, lista vazia)', async () => {
    const r = await request(app).get('/api/lawsuits/responsaveis').set(auth(tokenA));
    assert.equal(r.status, 200);
    assert.equal(r.body.canAssign, false);
    assert.deepEqual(r.body.operators, []);
  });
});
