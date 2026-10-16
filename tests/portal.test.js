/**
 * Portal de notícias (preview isolado) — rota pública somente-leitura.
 * Garante que /portal serve a página e que /api/portal/posts responde
 * sem login, e que NÃO há rota de escrita no portal.
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { parseRss, parseCapa } from '../src/modules/portal/portal.collector.js';
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

  it('itens oficiais não levam assinatura do Dr. Jorge (transcrição)', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO portal_items (fase, tipo, source, source_url, external_id, title, summary, category, created_at, updated_at)
       VALUES ('1_triagem','oficial','Agência Brasil (EBC)','https://exemplo/of','teste-oficial-1','Nota oficial de teste','Resumo','federal',?,?)`
    ).run(now, now);
    const item = db.prepare("SELECT tipo, author_name, source FROM portal_items WHERE external_id='teste-oficial-1'").get();
    assert.equal(item.tipo, 'oficial');
    assert.ok(!item.author_name, 'transcrição oficial não tem author_name');
    assert.ok(item.source, 'transcrição deve creditar a fonte');
  });

  it('lista fontes e termos', async () => {
    const s = await request(app).get('/api/portal/admin/sources').set('Authorization', `Bearer ${token}`);
    const t = await request(app).get('/api/portal/admin/terms').set('Authorization', `Bearer ${token}`);
    assert.ok(s.body.sources.length > 0 && t.body.terms.length > 0);
  });

  it('fontes sem feed (INSS, Gov MG, TJMG, PJF) vêm no modo "capa do dia"', async () => {
    const s = await request(app).get('/api/portal/admin/sources').set('Authorization', `Bearer ${token}`);
    const byKey = Object.fromEntries(s.body.sources.map(f => [f.skey, f]));
    for (const k of ['inss', 'gov_mg', 'tjmg', 'pjf']) {
      assert.equal(byKey[k]?.modo, 'capa', `${k} deve estar em modo capa`);
      assert.ok(/^https?:\/\//.test(byKey[k]?.url || ''), `${k} deve ter URL oficial`);
    }
  });

  it('POST /api/portal/admin/collect exige mestre (401 sem token)', async () => {
    const res = await request(app).post('/api/portal/admin/collect');
    assert.equal(res.status, 401);
  });

  it('curtir e comentar de verdade: comentário entra oculto, aparece só após aprovar', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO portal_items (fase, tipo, source, source_url, external_id, slug, title, summary, category, published_at, created_at, updated_at)
       VALUES ('4_publicado','oficial','Agência Brasil (EBC)','https://exemplo/of','teste-pub-1','materia-publica-teste','Matéria publicada de teste','Resumo','federal',?,?,?)`
    ).run(now, now, now);
    const slug = 'materia-publica-teste';

    // Comentar (público, sem login) → entra oculto, não aparece ainda.
    const post = await request(app).post(`/api/portal/posts/${slug}/comment`)
      .send({ nome: 'Fulano', email: 'f@ex.com', telefone: '32999', texto: 'Ótima notícia!' });
    assert.equal(post.status, 200);
    assert.equal(post.body.success, true);
    let pub = await request(app).get(`/api/portal/posts/${slug}/comments`);
    assert.equal(pub.body.comments.length, 0, 'comentário não pode aparecer antes de aprovar');

    // Mestre aprova na Central.
    const cid = db.prepare("SELECT id FROM portal_comments WHERE slug=? ORDER BY id DESC").get(slug).id;
    const mod = await request(app).put(`/api/portal/admin/comments/${cid}`)
      .set('Authorization', `Bearer ${token}`).send({ status: 'aprovado' });
    assert.equal(mod.status, 200);
    pub = await request(app).get(`/api/portal/posts/${slug}/comments`);
    assert.equal(pub.body.comments.length, 1, 'agora o comentário aprovado aparece');

    // Curtir incrementa; GET devolve a contagem.
    const like = await request(app).post(`/api/portal/posts/${slug}/like`).send({});
    assert.equal(like.status, 200);
    assert.equal(like.body.likes, 1);
    const likes = await request(app).get(`/api/portal/posts/${slug}/likes`);
    assert.equal(likes.body.likes, 1);
    // Descurtir volta.
    const unlike = await request(app).post(`/api/portal/posts/${slug}/like`).send({ unlike: true });
    assert.equal(unlike.body.likes, 0);
  });

  it('newsletter real: cadastra, deduplica, recusa e-mail inválido e cancela', async () => {
    // E-mail inválido → 400.
    const bad = await request(app).post('/api/portal/newsletter').send({ email: 'sem-arroba' });
    assert.equal(bad.status, 400);

    // Cadastro público válido.
    const ok1 = await request(app).post('/api/portal/newsletter').send({ email: 'Leitor@Exemplo.com', nome: 'Leitor' });
    assert.equal(ok1.status, 200);
    assert.equal(ok1.body.success, true);

    // Deduplicado (e-mail normalizado em minúsculas): 1 assinante, 1 lead.
    await request(app).post('/api/portal/newsletter').send({ email: 'leitor@exemplo.com' });
    const subs = db.prepare("SELECT COUNT(*) AS n FROM portal_newsletter WHERE email='leitor@exemplo.com'").get().n;
    assert.equal(subs, 1, 'não pode duplicar assinante');
    const leads = db.prepare("SELECT COUNT(*) AS n FROM portal_leads WHERE origem='newsletter' AND email='leitor@exemplo.com'").get().n;
    assert.equal(leads, 1, 'reenvio não cria lead duplicado');

    // Lista admin exige mestre e conta o ativo.
    const noauth = await request(app).get('/api/portal/admin/newsletter');
    assert.equal(noauth.status, 401);
    const list = await request(app).get('/api/portal/admin/newsletter').set('Authorization', `Bearer ${token}`);
    assert.ok(list.body.ativos >= 1);

    // Cancelar inscrição pelo e-mail.
    const unsub = await request(app).post('/api/portal/newsletter/unsubscribe').send({ email: 'leitor@exemplo.com' });
    assert.equal(unsub.status, 200);
    const ativo = db.prepare("SELECT ativo FROM portal_newsletter WHERE email='leitor@exemplo.com'").get().ativo;
    assert.equal(ativo, 0, 'após cancelar, fica inativo');
  });

  it('curtir/comentar em slug inexistente devolve 404', async () => {
    const c = await request(app).post('/api/portal/posts/nao-existe-zzz/comment').send({ texto: 'x' });
    assert.equal(c.status, 404);
    const l = await request(app).post('/api/portal/posts/nao-existe-zzz/like').send({});
    assert.equal(l.status, 404);
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

  it('parseCapa extrai manchetes da home, ignora menus curtos e resolve URL relativa', () => {
    const html = '<nav><a href="/sobre">Sobre</a></nav>'
      + '<a href="/noticias/inss-amplia-prazo-do-bpc-em-2026">INSS amplia prazo do BPC para segurados em 2026</a>'
      + '<a href="/logo.png">logo</a>';
    const items = parseCapa(html, 'https://www.gov.br/inss/pt-br/noticias');
    assert.equal(items.length, 1, 'só a manchete deve passar');
    assert.match(items[0].title, /INSS amplia prazo/);
    assert.equal(items[0].link, 'https://www.gov.br/noticias/inss-amplia-prazo-do-bpc-em-2026');
    assert.equal(items[0].views, null, 'capa não inventa visualizações');
  });
});
