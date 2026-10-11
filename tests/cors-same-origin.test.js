/** CORS: o próprio site (inclusive o domínio de homologação) nunca é bloqueado; outro site só se listado. */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-cors-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.ALLOWED_ORIGINS = 'https://jorgealvimadvocacia.com.br';

const { app, db, isSameOrigin } = await import('../server.js');

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

describe('CORS', () => {
  it('isSameOrigin compara só o host', () => {
    assert.equal(isSameOrigin('https://homolog.x.com.br', 'homolog.x.com.br'), true);
    assert.equal(isSameOrigin('https://outro.com', 'homolog.x.com.br'), false);
    assert.equal(isSameOrigin('lixo', 'homolog.x.com.br'), false);
    assert.equal(isSameOrigin('https://a.com', undefined), false);
  });
  it('homologação (mesma origem, fora de ALLOWED_ORIGINS) NÃO é bloqueada', async () => {
    const r = await request(app)
      .get('/health')
      .set('Host', 'homolog.jorgealvimadvocacia.com.br')
      .set('Origin', 'https://homolog.jorgealvimadvocacia.com.br');
    assert.equal(r.status, 200);
  });
  it('origem listada passa; origem de outro site é bloqueada', async () => {
    const ok = await request(app).get('/health').set('Origin', 'https://jorgealvimadvocacia.com.br');
    assert.equal(ok.status, 200);
    const mau = await request(app).get('/health').set('Origin', 'https://site-malicioso.com');
    assert.notEqual(mau.status, 200);
  });
});
