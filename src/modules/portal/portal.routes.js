/**
 * Módulo PORTAL DE NOTÍCIAS (preview ISOLADO) — reconstrução do blog como
 * portal de notícias (ROBO-13 aprovado; base para ROBO-01+).
 *
 * Regras desta etapa:
 *  - SOMENTE LEITURA: expõe apenas GET sobre blog_posts já publicados.
 *  - NÃO escreve nada, NÃO cria tabela, NÃO toca no módulo blog nem na produção.
 *  - Serve de fundação para, nas próximas etapas, ligar curtidas/comentários
 *    moderados, newsletter e as fontes oficiais — sempre em local separado,
 *    até o Dr. Jorge aprovar a troca em produção.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireMaster } from '../../middleware/auth.js';
import { ensurePortalSchema, PORTAL_LIMITS } from './portal.schema.js';
import { coletar } from './portal.collector.js';

// Garante as tabelas da esteira (idempotente), sem tocar no blog/produção.
ensurePortalSchema(db);

// Agendador SEMANAL do robô (coleta automática). Só fora de teste; não trava o
// processo (unref). O robô nunca publica — só enche a Triagem para o Dr. Jorge.
if (process.env.NODE_ENV !== 'test') {
  const UMA_SEMANA = 7 * 24 * 3600 * 1000;
  const timer = setInterval(() => {
    coletar(db)
      .then(r => console.log(`🤖 [PORTAL ROBÔ] coleta semanal: ${r.inseridas} nova(s), ${r.substituidas} atualizada(s), ${r.puladas} repetida(s)${r.pausado ? ' — FILA CHEIA, pausado' : ''}`))
      .catch(e => console.warn('🤖 [PORTAL ROBÔ] coleta semanal falhou:', e.message));
  }, UMA_SEMANA);
  if (timer.unref) timer.unref();
}

export const portalRouter = express.Router();

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}
const nowISO = () => new Date().toISOString();

// Lista de notícias publicadas (público, só leitura) — reaproveita blog_posts.
portalRouter.get('/api/portal/posts', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const posts = db.prepare(
      `SELECT id, slug, title, summary, category, cover_image, tags,
              author_name, author_oab, views_count, likes_count,
              published_at, created_at
         FROM blog_posts
        WHERE is_published = 1
        ORDER BY published_at DESC
        LIMIT ?`
    ).all(limit);
    res.json({ success: true, posts });
  } catch (err) {
    console.error('Erro ao listar notícias do portal:', err);
    res.status(500).json({ error: 'Erro ao buscar notícias do portal.' });
  }
});

// Notícias oficiais PUBLICADAS pelo robô (transcrições), agrupadas por nível —
// alimenta as caixas de "Fontes Oficiais" da home. Público, só leitura.
portalRouter.get('/api/portal/official', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT i.slug, i.title, i.summary, i.source, i.source_url, i.source_date,
              i.fonte_autor, i.source_views, COALESCE(s.nivel, i.category) AS nivel, i.published_at
         FROM portal_items i
         LEFT JOIN portal_sources s ON s.name = i.source
        WHERE i.fase = '4_publicado'
        ORDER BY (i.source_views IS NULL), i.source_views DESC, i.published_at DESC`
    ).all();
    const grupos = { local: [], federal: [], estadual: [], municipal: [] };
    for (const r of rows) {
      const nv = (r.nivel || '').toLowerCase();
      const g = grupos[nv] ? nv : 'federal';
      if (grupos[g].length < PORTAL_LIMITS.MANCHETES_POR_BOX) grupos[g].push(r);
    }
    res.json({ success: true, grupos });
  } catch (err) {
    console.error('Erro ao listar oficiais do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar notícias oficiais.' });
  }
});

// Uma notícia por slug (público, só leitura). Procura no blog e, se não achar,
// nas transcrições oficiais publicadas pela esteira (portal_items).
portalRouter.get('/api/portal/posts/:slug', (req, res) => {
  try {
    const post = db.prepare(
      `SELECT id, slug, title, summary, category, content, cover_image, tags,
              author_name, author_oab, views_count, likes_count,
              published_at, created_at, updated_at
         FROM blog_posts
        WHERE slug = ? AND is_published = 1`
    ).get(req.params.slug);
    if (post) { post.tipo = 'blog'; return res.json({ success: true, post }); }

    const item = db.prepare(
      `SELECT id, slug, title, summary, category, content, raw_text, source,
              source_url, source_date, fonte_autor, source_views, views_count, likes_count,
              published_at, created_at, updated_at
         FROM portal_items
        WHERE slug = ? AND fase = '4_publicado'`
    ).get(req.params.slug);
    if (!item) return res.status(404).json({ error: 'Notícia não encontrada.' });

    res.json({ success: true, post: {
      id: 'portal-' + item.id,
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      category: item.category,
      content: item.content || item.raw_text || '',
      tipo: 'oficial',
      source: item.source,
      source_url: item.source_url,
      source_date: item.source_date,
      fonte_autor: item.fonte_autor,
      source_views: item.source_views,
      author_name: null,
      author_oab: null,
      views_count: item.views_count || 0,
      likes_count: item.likes_count || 0,
      published_at: item.published_at,
      created_at: item.created_at,
      updated_at: item.updated_at
    } });
  } catch (err) {
    console.error('Erro ao obter notícia do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar notícia.' });
  }
});

// ================== ADMIN DO PORTAL (ESTEIRA / ROBÔ) =======================
// Todas exigem sessão de mestre (requireMaster) + regra RBAC MASTER em
// /api/portal/admin. São as "caixas de controle" do Dr. Jorge.

// Painel de controle central: contagens por caixa.
portalRouter.get('/api/portal/admin/overview', requireMaster, (req, res) => {
  try {
    const fases = db.prepare('SELECT fase, COUNT(*) AS n FROM portal_items GROUP BY fase').all();
    const byFase = {};
    for (const f of fases) byFase[f.fase] = f.n;
    const comentarios = db.prepare("SELECT COUNT(*) AS n FROM portal_comments WHERE status='pendente'").get().n;
    const leads = db.prepare('SELECT COUNT(*) AS n FROM portal_leads').get().n;
    const fontesAtivas = db.prepare('SELECT COUNT(*) AS n FROM portal_sources WHERE ativo=1').get().n;
    const fila = (byFase['1_triagem'] || 0) + (byFase['2_pauta'] || 0) + (byFase['3_redacao'] || 0);
    res.json({ success: true, overview: {
      triagem: byFase['1_triagem'] || 0,
      pauta: byFase['2_pauta'] || 0,
      redacao: byFase['3_redacao'] || 0,
      publicado: byFase['4_publicado'] || 0,
      descartada: byFase['descartada'] || 0,
      comentarios_pendentes: comentarios,
      leads,
      fontes_ativas: fontesAtivas,
      fila_total: fila,
      fila_max: PORTAL_LIMITS.FILA_MAX,
      fila_cheia: fila >= PORTAL_LIMITS.FILA_MAX
    }, limites: PORTAL_LIMITS });
  } catch (err) {
    console.error('Erro no overview do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar o painel.' });
  }
});

// Coletar agora: o robô busca nas fontes ativas e enche a Triagem (só o mestre).
portalRouter.post('/api/portal/admin/collect', requireMaster, async (req, res) => {
  try {
    const onlySkey = req.body && req.body.skey ? String(req.body.skey) : undefined;
    const resumo = await coletar(db, { onlySkey });
    res.json({ success: true, resumo });
  } catch (err) {
    console.error('Erro na coleta do robô:', err);
    res.status(500).json({ error: 'Erro ao coletar notícias: ' + err.message });
  }
});

// Listar matérias da esteira por fase.
portalRouter.get('/api/portal/admin/items', requireMaster, (req, res) => {
  try {
    const { fase } = req.query;
    let q = 'SELECT * FROM portal_items';
    const params = [];
    if (fase) { q += ' WHERE fase = ?'; params.push(fase); }
    q += ' ORDER BY updated_at DESC LIMIT 200';
    res.json({ success: true, items: db.prepare(q).all(...params) });
  } catch (err) {
    console.error('Erro ao listar itens do portal:', err);
    res.status(500).json({ error: 'Erro ao listar matérias.' });
  }
});

// Editar/salvar uma matéria (título, resumo, categoria, conteúdo, fase).
portalRouter.put('/api/portal/admin/items/:id', requireMaster, (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM portal_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Matéria não encontrada.' });
    const { title, summary, category, content, fase } = req.body || {};
    db.prepare(
      `UPDATE portal_items SET title=?, summary=?, category=?, content=?, fase=?, updated_at=? WHERE id=?`
    ).run(
      title != null ? title : item.title,
      summary != null ? summary : item.summary,
      category != null ? category : item.category,
      content != null ? content : item.content,
      fase != null ? fase : item.fase,
      nowISO(), item.id
    );
    res.json({ success: true, item: db.prepare('SELECT * FROM portal_items WHERE id=?').get(item.id) });
  } catch (err) {
    console.error('Erro ao salvar matéria do portal:', err);
    res.status(500).json({ error: 'Erro ao salvar matéria.' });
  }
});

// Publicar: só o Dr. Jorge aperta este botão (o robô nunca publica sozinho).
portalRouter.post('/api/portal/admin/items/:id/publicar', requireMaster, (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM portal_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Matéria não encontrada.' });
    let slug = item.slug || slugify(item.title);
    const clash = db.prepare('SELECT id FROM portal_items WHERE slug = ? AND id != ?').get(slug, item.id);
    if (clash) slug = slug + '-' + item.id;
    db.prepare(
      `UPDATE portal_items SET fase='4_publicado', slug=?, published_at=?, updated_at=? WHERE id=?`
    ).run(slug, nowISO(), nowISO(), item.id);
    res.json({ success: true, slug });
  } catch (err) {
    console.error('Erro ao publicar matéria do portal:', err);
    res.status(500).json({ error: 'Erro ao publicar.' });
  }
});

// Descartar / mudar de fase (avançar ou voltar na esteira).
portalRouter.post('/api/portal/admin/items/:id/fase', requireMaster, (req, res) => {
  try {
    const FASES = ['1_triagem', '2_pauta', '3_redacao', '4_publicado', 'descartada'];
    const { fase } = req.body || {};
    if (!FASES.includes(fase)) return res.status(400).json({ error: 'Fase inválida.' });
    const item = db.prepare('SELECT id FROM portal_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Matéria não encontrada.' });
    db.prepare('UPDATE portal_items SET fase=?, updated_at=? WHERE id=?').run(fase, nowISO(), item.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao mudar fase do portal:', err);
    res.status(500).json({ error: 'Erro ao mudar de fase.' });
  }
});

// Fontes oficiais: listar e ligar/desligar.
portalRouter.get('/api/portal/admin/sources', requireMaster, (req, res) => {
  res.json({ success: true, sources: db.prepare('SELECT * FROM portal_sources ORDER BY nivel, name').all() });
});
portalRouter.put('/api/portal/admin/sources/:id', requireMaster, (req, res) => {
  const src = db.prepare('SELECT id FROM portal_sources WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Fonte não encontrada.' });
  const ativo = req.body && req.body.ativo ? 1 : 0;
  db.prepare('UPDATE portal_sources SET ativo=? WHERE id=?').run(ativo, src.id);
  res.json({ success: true, ativo });
});

// Termos de busca: listar, adicionar, ligar/desligar.
portalRouter.get('/api/portal/admin/terms', requireMaster, (req, res) => {
  res.json({ success: true, terms: db.prepare('SELECT * FROM portal_terms ORDER BY termo').all() });
});
portalRouter.post('/api/portal/admin/terms', requireMaster, (req, res) => {
  const termo = (req.body && req.body.termo || '').trim();
  if (!termo) return res.status(400).json({ error: 'Informe o termo.' });
  try {
    db.prepare('INSERT INTO portal_terms (termo, ativo, created_at) VALUES (?,1,?)').run(termo, nowISO());
  } catch (e) { /* termo duplicado: ignora */ }
  res.json({ success: true });
});
portalRouter.put('/api/portal/admin/terms/:id', requireMaster, (req, res) => {
  const t = db.prepare('SELECT id FROM portal_terms WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Termo não encontrado.' });
  const ativo = req.body && req.body.ativo ? 1 : 0;
  db.prepare('UPDATE portal_terms SET ativo=? WHERE id=?').run(ativo, t.id);
  res.json({ success: true, ativo });
});

// Moderação de comentários (entram ocultos; só aparecem após aprovar).
portalRouter.get('/api/portal/admin/comments', requireMaster, (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM portal_comments';
  const params = [];
  if (status) { q += ' WHERE status = ?'; params.push(status); }
  q += ' ORDER BY created_at DESC LIMIT 200';
  res.json({ success: true, comments: db.prepare(q).all(...params) });
});
portalRouter.put('/api/portal/admin/comments/:id', requireMaster, (req, res) => {
  const STATUS = ['pendente', 'aprovado', 'removido'];
  const { status } = req.body || {};
  if (!STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const c = db.prepare('SELECT id FROM portal_comments WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado.' });
  const hidden = status === 'aprovado' ? 0 : 1;
  db.prepare('UPDATE portal_comments SET status=?, is_hidden=? WHERE id=?').run(status, hidden, c.id);
  res.json({ success: true });
});

// Captação de leads (curtida / comentário / newsletter).
portalRouter.get('/api/portal/admin/leads', requireMaster, (req, res) => {
  res.json({ success: true, leads: db.prepare('SELECT * FROM portal_leads ORDER BY created_at DESC LIMIT 300').all() });
});
