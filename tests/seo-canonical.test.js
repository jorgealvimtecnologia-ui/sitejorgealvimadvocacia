/**
 * Testes automatizados para validação de SEO, Tags Canônicas e Schema.org JSON-LD
 * Garante que o Google Search Console e o Googlebot recebam a tag canônica única
 * e os dados estruturados Schema.org (LegalService, Attorney, FAQPage, Blog, BlogPosting, BreadcrumbList).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-seo-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

after(() => {
  try { db?.close?.(); } catch {}
  try { fs.unlinkSync(TMP_DB); } catch {}
});

describe('SEO & Tags Canônicas para Google Search Console', () => {
  it('GET / retorna página inicial com link canônico e Schema.org LegalService', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('rel="canonical"'));
    assert.ok(res.text.includes('href="https://jorgealvimadvocacia.com.br"'));
    assert.ok(res.text.includes('schema.org'));
    assert.ok(res.text.includes('LegalService'));
    assert.ok(res.text.includes('OAB/MG 222.943'));
  });

  it('GET /blog retorna listagem com link canônico e Schema.org Blog', async () => {
    const res = await request(app).get('/blog');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<link rel="canonical" href="https://jorgealvimadvocacia.com.br/blog" />'));
    assert.ok(res.text.includes('<meta property="og:url" content="https://jorgealvimadvocacia.com.br/blog" />'));
    assert.ok(res.text.includes('schema.org'));
    assert.ok(res.text.includes('BreadcrumbList'));
    assert.ok(res.text.includes('"@type": "Blog"'));
  });

  it('GET /blog/:slug injeta título, descrição, link canônico e Schema.org BlogPosting', async () => {
    const slug = 'rde-e-o-fatd-apuracao-transgressoes-justificacao-recurso';
    const res = await request(app).get(`/blog/${slug}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes(`<link rel="canonical" href="https://jorgealvimadvocacia.com.br/blog/${slug}" />`));
    assert.ok(res.text.includes(`<meta property="og:url" content="https://jorgealvimadvocacia.com.br/blog/${slug}" />`));
    assert.ok(res.text.includes('FATD'));
    assert.ok(res.text.includes('schema.org'));
    assert.ok(res.text.includes('"@type": "BlogPosting"'));
    assert.ok(res.text.includes('Dr. Jorge Eduardo da Silva Alvim'));
    assert.ok(res.text.includes('OAB/MG 222.943'));
  });

  it('GET /cliente retorna portal com link canônico', async () => {
    const res = await request(app).get('/cliente');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<link rel="canonical" href="https://jorgealvimadvocacia.com.br/cliente" />'));
  });

  it('GET /colaborador retorna portal com link canônico', async () => {
    const res = await request(app).get('/colaborador');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<link rel="canonical" href="https://jorgealvimadvocacia.com.br/colaborador" />'));
  });

  it('GET /artigos redireciona permanentemente (301) para /blog', async () => {
    const res = await request(app).get('/artigos');
    assert.equal(res.status, 301);
    assert.equal(res.header.location, '/blog');
  });
});
