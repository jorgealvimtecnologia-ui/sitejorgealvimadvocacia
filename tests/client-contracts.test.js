/**
 * Contratos adicionais por cliente (ORD-MUHN47SR-I3Y, item 3 — solução simples).
 *
 * Permite mais de um contrato por cliente, além do contrato principal da ficha:
 * listar, criar, atualizar e excluir contratos adicionais.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-client-contracts-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'jorgealvim';

const { app, db } = await import('../server.js');

let token = '';
let clientId = '';

before(async () => {
  const login = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'jorgealvim' });
  assert.equal(login.status, 200);
  token = login.body.token;
  const create = await request(app).post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .field('full_name', 'Cliente Multi Contrato')
    .field('phone', '32900001111');
  assert.equal(create.status, 201);
  clientId = create.body.clientId;
});

after(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('Contratos adicionais por cliente', () => {
  let contractId = '';

  it('lista vazia no início', async () => {
    const r = await auth(request(app).get(`/api/clients/${clientId}/contracts`));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.contracts, []);
  });

  it('exige título ao criar (400)', async () => {
    const r = await auth(request(app).post(`/api/clients/${clientId}/contracts`)).send({ contract_value: 1000 });
    assert.equal(r.status, 400);
  });

  it('cria um contrato adicional e calcula o saldo (201)', async () => {
    const r = await auth(request(app).post(`/api/clients/${clientId}/contracts`))
      .send({ title: 'Ação Trabalhista', contract_value: 3000, installments_count: 3, amount_paid: 1000 });
    assert.equal(r.status, 201);
    assert.equal(r.body.contract.title, 'Ação Trabalhista');
    assert.equal(r.body.contract.balance_due, 2000);
    assert.equal(r.body.contract.installment_value, 1000);
    contractId = r.body.contract.id;
  });

  it('lista passa a ter 1 contrato', async () => {
    const r = await auth(request(app).get(`/api/clients/${clientId}/contracts`));
    assert.equal(r.status, 200);
    assert.equal(r.body.contracts.length, 1);
  });

  it('atualiza e recalcula o saldo', async () => {
    const r = await auth(request(app).put(`/api/clients/${clientId}/contracts/${contractId}`))
      .send({ amount_paid: 3000 });
    assert.equal(r.status, 200);
    assert.equal(r.body.contract.balance_due, 0);
  });

  it('404 para cliente inexistente', async () => {
    const r = await auth(request(app).post('/api/clients/CLI-INEXISTENTE/contracts')).send({ title: 'X' });
    assert.equal(r.status, 404);
  });

  it('exclui o contrato adicional', async () => {
    const del = await auth(request(app).delete(`/api/clients/${clientId}/contracts/${contractId}`));
    assert.equal(del.status, 200);
    const r = await auth(request(app).get(`/api/clients/${clientId}/contracts`));
    assert.deepEqual(r.body.contracts, []);
  });
});
