/**
 * Portal de notícias (preview isolado) — rota pública somente-leitura.
 * Garante que /portal serve a página e que /api/portal/posts responde
 * sem login, e que NÃO há rota de escrita no portal.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-portal-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

after(() => {
  try { db?.close?.(); } catch {}
  try { fs.unlinkSync(TMP_DB); } catch {}
});

describe('Portal de notícias (preview isolado)', () => {
  it('GET /portal serve a página do portal', async () => {
    const res = await request(app).get('/portal');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /html/);
    assert.ok(res.text.includes('Jornal Alvim'), 'deve conter o título do portal');
  });

  it('GET /api/portal/posts responde lista pública (sem login)', async () => {
    const res = await request(app).get('/api/portal/posts');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.posts), 'posts deve ser um array');
  });

  it('GET /api/portal/posts respeita o limite máximo', async () => {
    const res = await request(app).get('/api/portal/posts?limit=999');
    assert.equal(res.status, 200);
    assert.ok(res.body.posts.length <= 50, 'não pode passar de 50');
  });

  it('GET /api/portal/posts/:slug inexistente devolve 404', async () => {
    const res = await request(app).get('/api/portal/posts/slug-que-nao-existe-xyz');
    assert.equal(res.status, 404);
  });

  it('POST /api/portal/posts é negado (portal é somente leitura)', async () => {
    const res = await request(app).post('/api/portal/posts').send({ title: 'x' });
    assert.ok(res.status === 403 || res.status === 404, `esperado 403/404, veio ${res.status}`);
  });

  it('GET /portal/:slug serve a página de leitura da matéria', async () => {
    const res = await request(app).get('/portal/qualquer-slug');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /html/);
    assert.ok(res.text.includes('Jornal Alvim'), 'deve conter o cabeçalho do portal');
    assert.ok(res.text.includes('/public/portal.css'), 'deve usar o CSS compartilhado');
  });

  it('GET /public/portal.css é servido', async () => {
    const res = await request(app).get('/public/portal.css');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /css/);
  });
});
