/**
 * Cadastro de cliente — controle de duplicidade (ORD-MUHN47SR-I3Y, item 4).
 *
 * Evita cadastrar o mesmo cliente duas vezes. Bloqueia (409) quando já existe
 * cliente com o mesmo CPF/CNPJ, RG ou nome completo (ignorando pontuação,
 * espaços e maiúsculas/minúsculas), retornando { duplicate: true }.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-clients-dup-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'jorgealvim';

const { app, db } = await import('../server.js');

let masterToken = '';

before(async () => {
  const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'jorgealvim' });
  assert.equal(r.status, 200);
  masterToken = r.body.token;
});

after(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
});

const post = (fields) => {
  const req = request(app).post('/api/clients').set('Authorization', `Bearer ${masterToken}`);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req;
};

describe('Cadastro de cliente — controle de duplicidade', () => {
  it('cria o primeiro cliente normalmente (201)', async () => {
    const r = await post({ full_name: 'Maria Aparecida Testa', phone: '32999990000', cpf: '123.456.789-09', rg: 'MG-12.345.678' });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
  });

  it('bloqueia CPF repetido mesmo sem pontuação (409)', async () => {
    const r = await post({ full_name: 'Outro Nome Qualquer', phone: '32988887777', cpf: '12345678909' });
    assert.equal(r.status, 409);
    assert.equal(r.body.duplicate, true);
  });

  it('bloqueia RG repetido (409)', async () => {
    const r = await post({ full_name: 'Nome Bem Diferente', phone: '32977776666', rg: 'mg 12345678' });
    assert.equal(r.status, 409);
    assert.equal(r.body.duplicate, true);
  });

  it('bloqueia nome repetido ignorando maiúsculas e espaços (409)', async () => {
    const r = await post({ full_name: '  MARIA aparecida TESTA ', phone: '32966665555' });
    assert.equal(r.status, 409);
    assert.equal(r.body.duplicate, true);
  });

  it('permite um cliente realmente novo (201)', async () => {
    const r = await post({ full_name: 'João Pereira Silva Único', phone: '32955554444', cpf: '987.654.321-00', rg: 'SP-99.888.777' });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
  });
});
