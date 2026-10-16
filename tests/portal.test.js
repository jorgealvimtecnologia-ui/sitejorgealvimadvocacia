/**
 * Portal de notícias (preview isolado) — rota pública somente-leitura.
 * Garante que /portal serve a página e que /api/portal/posts responde
 * sem login, e que NÃO há rota de escrita no portal.
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { parseRss } from '../src/modules/portal/portal.collector.js';
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

  it('GET /portal/revisar serve a central de comando', async () => {
    const res = await request(app).get('/portal/revisar');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Central de Comando'), 'deve conter a central de comando');
  });
});

describe('Portal — caixas de controle (admin, só mestre)', () => {
  const MASTER = { username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' };
  let token = '';
  before(async () => {
    const r = await request(app).post('/api/auth/login').send(MASTER);
    token = r.body.token;
  });

  it('bloqueia o admin sem login (401)', async () => {
    const res = await request(app).get('/api/portal/admin/overview');
    assert.equal(res.status, 401);
  });

  it('overview responde para o mestre com fila/limites', async () => {
    const res = await request(app).get('/api/portal/admin/overview').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.overview.fila_total === 'number');
    assert.equal(res.body.limites.FILA_MAX, 40);
    assert.equal(res.body.limites.MANCHETES_POR_BOX, 5);
  });

  it('lista itens da esteira (seed de exemplo)', async () => {
    const res = await request(app).get('/api/portal/admin/items').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
  });

  it('itens oficiais não levam assinatura do Dr. Jorge (transcrição)', async () => {
    const res = await request(app).get('/api/portal/admin/items?fase=1_triagem').set('Authorization', `Bearer ${token}`);
    const oficial = (res.body.items || []).find((i) => i.tipo === 'oficial');
    assert.ok(oficial, 'deve haver item oficial no seed');
    assert.ok(!oficial.author_name, 'transcrição oficial não tem author_name');
    assert.ok(oficial.source, 'transcrição deve creditar a fonte');
  });

  it('lista fontes e termos', async () => {
    const s = await request(app).get('/api/portal/admin/sources').set('Authorization', `Bearer ${token}`);
    const t = await request(app).get('/api/portal/admin/terms').set('Authorization', `Bearer ${token}`);
    assert.ok(s.body.sources.length > 0 && t.body.terms.length > 0);
  });

  it('POST /api/portal/admin/collect exige mestre (401 sem token)', async () => {
    const res = await request(app).post('/api/portal/admin/collect');
    assert.equal(res.status, 401);
  });
});

describe('Robô — leitor de RSS', () => {
  it('parseRss extrai título, link, data e autor (limpa HTML/CDATA)', () => {
    const xml = '<rss><channel><item><title>INSS amplia prazo do BPC</title>'
      + '<link>https://exemplo/noticia-1</link><pubDate>Thu, 16 Oct 2026 09:00:00 -0300</pubDate>'
      + '<dc:creator>Agência Brasil</dc:creator><description><![CDATA[O <b>INSS</b> anunciou]]></description>'
      + '</item></channel></rss>';
    const items = parseRss(xml);
    assert.equal(items.length, 1);
    assert.match(items[0].title, /INSS amplia/);
    assert.equal(items[0].link, 'https://exemplo/noticia-1');
    assert.equal(items[0].author, 'Agência Brasil');
    assert.ok(!/</.test(items[0].description), 'descrição deve vir sem HTML');
  });
});
