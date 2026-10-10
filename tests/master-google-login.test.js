/** As 3 contas Google mestras entram como mestre (painel e unificado); qualquer outra não. */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-master-google-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
process.env.GOOGLE_ADMIN_EMAILS = 'intruso@gmail.com';

const { app, db } = await import('../server.js');

after(() => {
  try {
    db?.close?.();
  } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
});

const MASTERS = ['jorgealvimtecnologia@gmail.com', 'jorgealvim10@gmail.com', 'jorgealvimadvocacia@gmail.com'];

describe('contas Google mestras', () => {
  for (const email of MASTERS) {
    it(`${email} entra como mestre no painel`, async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: `mock-google-token:sub-${email}:${email}:Mestre` });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const perms = await request(app).get('/api/access-control/my-permissions').set('Authorization', `Bearer ${res.body.token}`);
      assert.equal(perms.status, 200);
      assert.equal(perms.body.is_master, true);
    });
    it(`${email} entra como mestre no login unificado`, async () => {
      const res = await request(app)
        .post('/api/auth/unified-google')
        .send({ credential: `mock-google-token:sub-u-${email}:${email}:Mestre` });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    });
  }
  it('e-mail em GOOGLE_ADMIN_EMAILS NÃO vira mestre', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'mock-google-token:sub-x:intruso@gmail.com:Intruso' });
    assert.equal(res.status, 403);
  });
});
