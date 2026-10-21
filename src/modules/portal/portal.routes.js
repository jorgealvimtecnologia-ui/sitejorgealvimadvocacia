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
import { randomUUID } from 'node:crypto';
import { db } from '../../config/db.js';
import { requireMaster } from '../../middleware/auth.js';
import { ensurePortalSchema, PORTAL_LIMITS, extractYouTubeId } from './portal.schema.js';
import { coletar } from './portal.collector.js';
import { coletarVideos, channelIdFromInput } from './portal.video-collector.js';
import { sendEmail, isEmailConfigured } from '../../shared/email.js';
import { generateNextClientId } from '../../shared/ids.js';

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

  // Captação automática de VÍDEOS (RSS dos canais oficiais) — também semanal; igual ao robô
  // de notícias, só enche a esteira como "pendente": nada vai ao ar sem o Dr. Jorge aprovar.
  const vtimer = setInterval(() => {
    coletarVideos(db)
      .then(r => console.log(`🎬 [PORTAL VÍDEOS] coleta: ${r.novos} novo(s), ${r.ignorados} repetido(s), ${r.canais} canal(is)${r.erros.length ? ', ' + r.erros.length + ' erro(s)' : ''}`))
      .catch(e => console.warn('🎬 [PORTAL VÍDEOS] coleta falhou:', e.message));
  }, UMA_SEMANA);
  if (vtimer.unref) vtimer.unref();
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

// Feed COMPLETO (público): todos os artigos do blog publicados + todas as
// transcrições oficiais já publicadas, do mais novo ao mais antigo, paginado.
// Aproveita 100% do que já existe no blog — nada é recadastrado ou duplicado.
portalRouter.get('/api/portal/feed', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const q = (req.query.q || '').trim().toLowerCase();

    const blog = db.prepare(
      `SELECT slug, title, summary, category, author_name, author_oab, likes_count,
              published_at, created_at, 'blog' AS tipo, NULL AS source, NULL AS source_date
         FROM blog_posts WHERE is_published = 1`
    ).all();
    const oficial = db.prepare(
      `SELECT slug, title, summary, category, NULL AS author_name, NULL AS author_oab, likes_count,
              published_at, created_at, 'oficial' AS tipo, source, source_date
         FROM portal_items WHERE fase = '4_publicado'`
    ).all();

    let todos = blog.concat(oficial);
    if (q) {
      todos = todos.filter(p => ((p.title || '') + ' ' + (p.summary || '') + ' ' + (p.category || '')).toLowerCase().includes(q));
    }
    const dt = (p) => new Date(p.published_at || p.created_at || 0).getTime() || 0;
    todos.sort((a, b) => dt(b) - dt(a));

    const total = todos.length;
    const items = todos.slice(offset, offset + limit);
    res.json({ success: true, items, total, offset, limit, hasMore: offset + items.length < total });
  } catch (err) {
    console.error('Erro no feed do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar as notícias.' });
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
      `SELECT id, slug, title, summary, category, content, raw_text, comentario, cover_image, tags, source,
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
      comentario: item.comentario || '',
      cover_image: item.cover_image || '',
      tags: item.tags || '',
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

// Resolve um post PUBLICADO por slug (no blog ou nas transcrições oficiais).
// Devolve a base de curtidas e, para item do portal, o id — ou null se não existe.
function publishedBySlug(slug) {
  const b = db.prepare('SELECT id, likes_count FROM blog_posts WHERE slug = ? AND is_published = 1').get(slug);
  if (b) return { kind: 'blog', id: b.id, likesBase: b.likes_count || 0 };
  const i = db.prepare("SELECT id, likes_count FROM portal_items WHERE slug = ? AND fase = '4_publicado'").get(slug);
  if (i) return { kind: 'portal', id: i.id, likesBase: i.likes_count || 0 };
  return null;
}

// -------- INTERAÇÃO PÚBLICA (curtir / comentar) do portal --------
// Comentar: entra OCULTO (pendente) e só aparece depois que o Dr. Jorge aprova
// na Central (Moderação). Nunca publica nada automaticamente.
portalRouter.post('/api/portal/posts/:slug/comment', (req, res) => {
  try {
    const slug = req.params.slug;
    const found = publishedBySlug(slug);
    if (!found) return res.status(404).json({ error: 'Notícia não encontrada.' });
    const b = req.body || {};
    const texto = String(b.texto || b.comment_text || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva um comentário.' });
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').slice(0, 60);
    db.prepare(
      `INSERT INTO portal_comments (item_id, slug, author_name, author_email, author_phone, comment_text, status, is_hidden, ip_address, created_at)
       VALUES (?,?,?,?,?,?, 'pendente', 1, ?, ?)`
    ).run(
      found.kind === 'portal' ? found.id : null, slug,
      String(b.nome || b.author_name || '').slice(0, 120),
      String(b.email || b.author_email || '').slice(0, 160),
      String(b.telefone || b.author_phone || '').slice(0, 40),
      texto.slice(0, 2000), ip, nowISO()
    );
    res.json({ success: true, message: 'Comentário enviado! Ele passará por moderação antes de aparecer.' });
  } catch (err) {
    console.error('Erro ao comentar no portal:', err);
    res.status(500).json({ error: 'Erro ao enviar comentário.' });
  }
});

// Lista só os comentários APROVADOS e visíveis (público).
portalRouter.get('/api/portal/posts/:slug/comments', (req, res) => {
  try {
    const comments = db.prepare(
      "SELECT author_name, comment_text, created_at FROM portal_comments WHERE slug = ? AND status = 'aprovado' AND is_hidden = 0 ORDER BY created_at DESC LIMIT 100"
    ).all(req.params.slug);
    res.json({ success: true, comments });
  } catch (err) {
    console.error('Erro ao listar comentários do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar comentários.' });
  }
});

// Curtidas: contagem (GET) e curtir/descurtir (POST). Base do post + curtidas do portal.
portalRouter.get('/api/portal/posts/:slug/likes', (req, res) => {
  const found = publishedBySlug(req.params.slug);
  if (!found) return res.status(404).json({ error: 'Notícia não encontrada.' });
  const row = db.prepare('SELECT count FROM portal_likes WHERE slug = ?').get(req.params.slug);
  res.json({ success: true, likes: found.likesBase + (row ? row.count : 0) });
});
portalRouter.post('/api/portal/posts/:slug/like', (req, res) => {
  try {
    const found = publishedBySlug(req.params.slug);
    if (!found) return res.status(404).json({ error: 'Notícia não encontrada.' });
    const dir = (req.body && req.body.unlike) ? -1 : 1;
    const row = db.prepare('SELECT count FROM portal_likes WHERE slug = ?').get(req.params.slug);
    let c = (row ? row.count : 0) + dir;
    if (c < 0) c = 0;
    if (row) db.prepare('UPDATE portal_likes SET count = ?, updated_at = ? WHERE slug = ?').run(c, nowISO(), req.params.slug);
    else db.prepare('INSERT INTO portal_likes (slug, count, updated_at) VALUES (?,?,?)').run(req.params.slug, c, nowISO());
    res.json({ success: true, likes: found.likesBase + c });
  } catch (err) {
    console.error('Erro ao curtir no portal:', err);
    res.status(500).json({ error: 'Erro ao registrar curtida.' });
  }
});

// -------- NEWSLETTER (cadastro público real) --------
// Guarda o assinante numa lista deduplicada (portal_newsletter) e registra um
// lead de origem 'newsletter' na captação. O ENVIO do boletim é passo à parte.
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
portalRouter.post('/api/portal/newsletter', (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const nome = String(b.nome || '').trim().slice(0, 120);
    if (!emailOk(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
    const existente = db.prepare('SELECT id, ativo FROM portal_newsletter WHERE email = ?').get(email);
    let novo = false;
    if (!existente) {
      db.prepare('INSERT INTO portal_newsletter (email, nome, ativo, token, origem, created_at) VALUES (?,?,1,?,?,?)')
        .run(email, nome, randomUUID(), String(b.origem || 'portal').slice(0, 40), nowISO());
      novo = true;
    } else if (!existente.ativo) {
      db.prepare('UPDATE portal_newsletter SET ativo=1, unsubscribed_at=NULL WHERE id=?').run(existente.id);
      novo = true;
    }
    // Só vira lead quando é inscrição nova/reativada (não duplica a cada reenvio).
    if (novo) {
      db.prepare("INSERT INTO portal_leads (origem, nome, email, telefone, slug, created_at) VALUES ('newsletter',?,?, '', '', ?)")
        .run(nome, email, nowISO());
    }
    res.json({ success: true, message: 'Pronto! Você receberá nosso boletim. (Pode cancelar quando quiser.)' });
  } catch (err) {
    console.error('Erro ao cadastrar newsletter:', err);
    res.status(500).json({ error: 'Erro ao cadastrar e-mail.' });
  }
});
// Cancelar inscrição (por token do e-mail ou pelo próprio e-mail).
portalRouter.post('/api/portal/newsletter/unsubscribe', (req, res) => {
  try {
    const b = req.body || {};
    const token = String(b.token || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const sub = token
      ? db.prepare('SELECT id FROM portal_newsletter WHERE token = ?').get(token)
      : (email ? db.prepare('SELECT id FROM portal_newsletter WHERE email = ?').get(email) : null);
    if (!sub) return res.status(404).json({ error: 'Inscrição não encontrada.' });
    db.prepare('UPDATE portal_newsletter SET ativo=0, unsubscribed_at=? WHERE id=?').run(nowISO(), sub.id);
    res.json({ success: true, message: 'Inscrição cancelada.' });
  } catch (err) {
    console.error('Erro ao cancelar newsletter:', err);
    res.status(500).json({ error: 'Erro ao cancelar inscrição.' });
  }
});

// Descadastro por LINK (GET) — é o link que vai no rodapé de cada boletim.
// Responde uma página simples de confirmação (sem login).
portalRouter.get('/api/portal/newsletter/unsubscribe', (req, res) => {
  const token = String(req.query.token || '').trim();
  const sub = token ? db.prepare('SELECT id FROM portal_newsletter WHERE token = ?').get(token) : null;
  if (sub) db.prepare('UPDATE portal_newsletter SET ativo=0, unsubscribed_at=? WHERE id=?').run(nowISO(), sub.id);
  res.set('Content-Type', 'text/html; charset=utf-8').send(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Boletim — Jornal Alvim</title>'
    + '<div style="font-family:system-ui,Arial;max-width:520px;margin:12vh auto;padding:0 20px;text-align:center;color:#0A192F">'
    + '<h1 style="color:#B8860B">Jornal Alvim</h1><p style="font-size:1.1rem">'
    + (sub ? 'Pronto! Você foi <b>descadastrado</b> do nosso boletim. Não enviaremos mais e-mails.' : 'Link inválido ou inscrição não encontrada.')
    + '</p><p><a href="/portal" style="color:#B8860B;font-weight:700">Voltar ao portal</a></p></div>'
  );
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
    const newsletter = db.prepare('SELECT COUNT(*) AS n FROM portal_newsletter WHERE ativo=1').get().n;
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
      newsletter,
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
    const { title, summary, category, content, comentario, cover_image, tags, fase } = req.body || {};
    db.prepare(
      `UPDATE portal_items SET title=?, summary=?, category=?, content=?, comentario=?, cover_image=?, tags=?, fase=?, updated_at=? WHERE id=?`
    ).run(
      title != null ? title : item.title,
      summary != null ? summary : item.summary,
      category != null ? category : item.category,
      content != null ? content : item.content,
      comentario != null ? comentario : item.comentario,
      cover_image != null ? cover_image : item.cover_image,
      tags != null ? tags : item.tags,
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
  const src = db.prepare('SELECT * FROM portal_sources WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Fonte não encontrada.' });
  const body = req.body || {};
  // ativo/url/modo mudam só quando enviados.
  const ativo = ('ativo' in body) ? (body.ativo ? 1 : 0) : src.ativo;
  const url = (body.url !== undefined) ? String(body.url).trim() : src.url;
  const modo = (body.modo === 'capa' || body.modo === 'rss') ? body.modo : (src.modo || 'rss');
  db.prepare('UPDATE portal_sources SET ativo=?, url=?, modo=? WHERE id=?').run(ativo, url, modo, src.id);
  res.json({ success: true, ativo, url, modo });
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
// Excluir um comentário definitivamente.
portalRouter.delete('/api/portal/admin/comments/:id', requireMaster, (req, res) => {
  const c = db.prepare('SELECT id FROM portal_comments WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado.' });
  db.prepare('DELETE FROM portal_comments WHERE id = ?').run(c.id);
  res.json({ success: true });
});
// Transformar um comentário em lead — vai para a CAIXA PRINCIPAL de leads do
// painel (tabela `leads`, Atendimentos), igual ao blog. Também registra na
// captação do portal (portal_leads) para o histórico local.
portalRouter.post('/api/portal/admin/comments/:id/to-lead', requireMaster, (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM portal_comments WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Comentário não encontrado.' });

    const newLeadId = generateNextClientId();
    const now = nowISO();
    const nome = (c.author_name || 'Comentarista do Portal').trim();
    const telefone = (c.author_phone || '').trim();
    const area = 'Portal de Notícias';
    const mensagem = `Lead originado de comentário no portal (matéria '${c.slug || '—'}'): "${c.comment_text}". E-mail: ${c.author_email || '—'}`;

    db.prepare(
      `INSERT INTO leads (id, created_at, name, phone, area, message, files, status, social_media, website, google_business)
       VALUES (?, ?, ?, ?, ?, ?, '[]', 'Novo', '', '', '')`
    ).run(newLeadId, now, nome, telefone, area, mensagem);

    // Histórico local do portal (não duplica contato no CRM — é só registro da origem).
    db.prepare(
      `INSERT INTO portal_leads (origem, nome, email, telefone, slug, created_at) VALUES ('comentario',?,?,?,?,?)`
    ).run(nome, c.author_email || '', telefone, c.slug || '', now);

    res.json({ success: true, lead_id: newLeadId, message: 'Comentário enviado para a caixa de Leads (Atendimentos) do painel: Lead #' + newLeadId });
  } catch (err) {
    console.error('Erro ao converter comentário do portal em lead:', err);
    res.status(500).json({ error: 'Erro ao transformar em lead.' });
  }
});

// Captação de leads (curtida / comentário / newsletter).
portalRouter.get('/api/portal/admin/leads', requireMaster, (req, res) => {
  res.json({ success: true, leads: db.prepare('SELECT * FROM portal_leads ORDER BY created_at DESC LIMIT 300').all() });
});

// Assinantes da newsletter (lista real, deduplicada; só os ativos por padrão).
portalRouter.get('/api/portal/admin/newsletter', requireMaster, (req, res) => {
  const todos = req.query.todos === '1';
  const q = 'SELECT id, email, nome, ativo, origem, created_at, unsubscribed_at FROM portal_newsletter'
    + (todos ? '' : ' WHERE ativo=1') + ' ORDER BY created_at DESC LIMIT 500';
  const subs = db.prepare(q).all();
  const ativos = db.prepare('SELECT COUNT(*) AS n FROM portal_newsletter WHERE ativo=1').get().n;
  res.json({ success: true, subscribers: subs, ativos });
});

// ---- BOLETIM (campanhas de newsletter) — compor e disparar, só o mestre. ----
function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function baseUrl(req) { return `${req.protocol}://${req.get('host')}`; }
// Domínio público usado nos LINKS dos e-mails (o leitor abre no site, não no localhost).
const PUBLIC_ORIGIN = (process.env.PUBLIC_SITE_URL || 'https://jorgealvimadvocacia.com.br').replace(/\/+$/, '');
// Monta o HTML do e-mail: cabeçalho do escritório + corpo + rodapé com descadastro.
function montarEmail(bodyHtml, unsubUrl) {
  return '<div style="font-family:system-ui,Arial,sans-serif;max-width:620px;margin:0 auto;color:#0A192F">'
    + '<div style="background:#0A192F;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">'
    + '<span style="color:#D4AF37;font-weight:800;font-size:1.2rem">Jornal Alvim</span>'
    + '<div style="font-size:.8rem;opacity:.85">Boletim do portal de notícias · Jorge Alvim Advocacia</div></div>'
    + '<div style="border:1px solid #e5e5e5;border-top:0;padding:22px;font-size:1rem;line-height:1.6">' + bodyHtml + '</div>'
    + '<div style="padding:14px 22px;color:#777;font-size:.78rem;text-align:center">'
    + 'Você recebe este boletim porque se inscreveu no portal. '
    + '<a href="' + unsubUrl + '" style="color:#B8860B">Descadastrar</a>.</div></div>';
}

// Monta a "Edição da Semana": junta as matérias PUBLICADAS nos últimos 7 dias
// (blog + transcrições oficiais) e devolve um rascunho (assunto + corpo HTML
// com título, resumo e link de cada uma) para o Dr. Jorge revisar e disparar.
portalRouter.get('/api/portal/admin/newsletter/compose-week', requireMaster, (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 7, 1), 60);
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
    const blog = db.prepare(
      `SELECT slug, title, summary, COALESCE(published_at, created_at) AS quando, 'Blog' AS origem
         FROM blog_posts WHERE is_published = 1 AND COALESCE(published_at, created_at) >= ?`
    ).all(desde);
    const ofi = db.prepare(
      `SELECT slug, title, summary, COALESCE(published_at, created_at) AS quando, source AS origem
         FROM portal_items WHERE fase = '4_publicado' AND COALESCE(published_at, created_at) >= ?`
    ).all(desde);
    const itens = blog.concat(ofi).sort((a, b) => new Date(b.quando) - new Date(a.quando)).slice(0, 8);

    const d = new Date();
    const ddata = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    const subject = 'Jornal Alvim · Boletim da semana (' + ddata + ')';

    let body = '<p>Olá! Veja as notícias jurídicas desta semana, em linguagem simples:</p>';
    if (!itens.length) {
      body += '<p><b>(Nenhuma matéria publicada nos últimos ' + dias + ' dias.)</b> Publique matérias no portal antes de disparar o boletim.</p>';
    } else {
      for (const it of itens) {
        const url = PUBLIC_ORIGIN + '/portal/' + encodeURIComponent(it.slug || '');
        body += '<h3 style="margin:16px 0 4px">' + escHtml(it.title) + '</h3>';
        if (it.summary) body += '<p style="margin:0 0 6px">' + escHtml(it.summary) + '</p>';
        body += '<p style="margin:0 0 12px"><a href="' + url + '">Ler no portal &rarr;</a>'
          + (it.origem ? ' <span style="color:#888">· ' + escHtml(it.origem) + '</span>' : '') + '</p>';
      }
    }
    body += '<p>Boa leitura!<br>Dr. Jorge Alvim · OAB/MG 222.943</p>';
    res.json({ success: true, subject, body, count: itens.length, dias });
  } catch (err) {
    console.error('Erro ao montar edição da semana:', err);
    res.status(500).json({ error: 'Erro ao montar a edição da semana.' });
  }
});

portalRouter.get('/api/portal/admin/newsletter/campaigns', requireMaster, (req, res) => {
  const campaigns = db.prepare('SELECT * FROM portal_newsletter_campaigns ORDER BY created_at DESC LIMIT 100').all();
  res.json({ success: true, campaigns, emailConfigurado: isEmailConfigured() });
});

portalRouter.post('/api/portal/admin/newsletter/campaigns', requireMaster, (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject || '').trim();
  const body = String(b.body || '').trim();
  if (!subject || !body) return res.status(400).json({ error: 'Preencha o assunto e o texto do boletim.' });
  const info = db.prepare('INSERT INTO portal_newsletter_campaigns (subject, body, status, created_at) VALUES (?,?,?,?)')
    .run(subject.slice(0, 200), body, 'rascunho', nowISO());
  res.json({ success: true, id: info.lastInsertRowid });
});

// Enviar TESTE para um e-mail (normalmente o do próprio Dr. Jorge).
portalRouter.post('/api/portal/admin/newsletter/test', requireMaster, async (req, res) => {
  const b = req.body || {};
  const to = String(b.email || '').trim();
  if (!emailOk(to)) return res.status(400).json({ error: 'Informe um e-mail válido para o teste.' });
  if (!b.subject || !b.body) return res.status(400).json({ error: 'Preencha o assunto e o texto.' });
  const html = montarEmail(String(b.body), baseUrl(req) + '/api/portal/newsletter/unsubscribe?token=TESTE');
  const r = await sendEmail({ to, subject: '[TESTE] ' + String(b.subject), html, text: stripTags(b.body) });
  res.json({ success: true, enviado: r.sent, motivo: r.reason || null, emailConfigurado: isEmailConfigured() });
});

// DISPARAR o boletim para todos os assinantes ativos (ação do mestre).
portalRouter.post('/api/portal/admin/newsletter/campaigns/:id/send', requireMaster, async (req, res) => {
  try {
    const camp = db.prepare('SELECT * FROM portal_newsletter_campaigns WHERE id = ?').get(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Boletim não encontrado.' });
    if (camp.status === 'enviado') return res.status(400).json({ error: 'Este boletim já foi enviado.' });
    if (!isEmailConfigured()) {
      return res.json({ success: false, emailConfigurado: false,
        error: 'E-mail (SMTP) não está configurado neste servidor. Configure SMTP_HOST/SMTP_USER/SMTP_PASS no cofre (.env.enc) para disparar o boletim.' });
    }
    const subs = db.prepare('SELECT email, token FROM portal_newsletter WHERE ativo=1').all();
    const base = baseUrl(req);
    let enviados = 0;
    for (const s of subs) {
      const html = montarEmail(camp.body, base + '/api/portal/newsletter/unsubscribe?token=' + encodeURIComponent(s.token || ''));
      const r = await sendEmail({ to: s.email, subject: camp.subject, html, text: stripTags(camp.body) });
      if (r.sent) enviados++;
    }
    db.prepare('UPDATE portal_newsletter_campaigns SET status=?, total=?, sent_count=?, sent_at=? WHERE id=?')
      .run('enviado', subs.length, enviados, nowISO(), camp.id);
    res.json({ success: true, enviados, total: subs.length, emailConfigurado: true });
  } catch (err) {
    console.error('Erro ao disparar boletim:', err);
    res.status(500).json({ error: 'Erro ao disparar o boletim.' });
  }
});

// ============================================================================
// VÍDEOS INSTITUCIONAIS (PORTAL & PAINEL DE CONTROLE)
// ============================================================================

// Público: lista apenas vídeos marcados como publicados
portalRouter.get('/api/portal/videos', (req, res) => {
  try {
    const videos = db.prepare(
      `SELECT id, title, source_name, badge_category, youtube_url, youtube_id, description, video_date, ordem
         FROM portal_videos
        WHERE is_published = 1 AND (status IS NULL OR status = 'aprovado')
        ORDER BY ordem ASC, id ASC`
    ).all();
    res.json({ success: true, videos });
  } catch (err) {
    console.error('Erro ao listar vídeos do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar vídeos do portal.' });
  }
});

// Mestre: lista todos os vídeos (publicados e rascunhos)
portalRouter.get('/api/portal/admin/videos', requireMaster, (req, res) => {
  try {
    const videos = db.prepare(
      `SELECT * FROM portal_videos ORDER BY ordem ASC, id ASC`
    ).all();
    res.json({ success: true, videos });
  } catch (err) {
    console.error('Erro ao listar vídeos administrativos:', err);
    res.status(500).json({ error: 'Erro ao buscar vídeos.' });
  }
});

// Mestre: cadastrar novo vídeo
portalRouter.post('/api/portal/admin/videos', requireMaster, (req, res) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    const source_name = String(b.source_name || '').trim();
    const badge_category = String(b.badge_category || 'INSTITUCIONAL').trim().toUpperCase();
    const youtube_url = String(b.youtube_url || '').trim();
    const description = String(b.description || '').trim();
    const ordem = Number.isInteger(Number(b.ordem)) ? Number(b.ordem) : 10;
    const is_published = b.is_published ? 1 : 0;

    if (!title || !youtube_url) {
      return res.status(400).json({ error: 'Título e URL do YouTube são obrigatórios.' });
    }

    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) {
      return res.status(400).json({ error: 'Não foi possível extrair o ID do vídeo do YouTube. Verifique a URL informada.' });
    }

    const video_date = String(b.video_date || '').trim() || null;
    const now = nowISO();
    const info = db.prepare(`
      INSERT INTO portal_videos (title, source_name, badge_category, youtube_url, youtube_id, description, video_date, ordem, is_published, status, origem, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aprovado', 'manual', ?, ?)
    `).run(title, source_name || 'Órgão Oficial', badge_category, youtube_url, youtube_id, description, video_date, ordem, is_published, now, now);

    res.json({ success: true, id: info.lastInsertRowid, youtube_id });
  } catch (err) {
    console.error('Erro ao criar vídeo:', err);
    res.status(500).json({ error: 'Erro ao salvar novo vídeo.' });
  }
});

// Mestre: atualizar dados do vídeo
portalRouter.put('/api/portal/admin/videos/:id', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM portal_videos WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Vídeo não encontrado.' });

    const b = req.body || {};
    const title = String(b.title || '').trim();
    const source_name = String(b.source_name || '').trim();
    const badge_category = String(b.badge_category || 'INSTITUCIONAL').trim().toUpperCase();
    const youtube_url = String(b.youtube_url || '').trim();
    const description = String(b.description || '').trim();
    const ordem = Number.isInteger(Number(b.ordem)) ? Number(b.ordem) : 10;
    const is_published = b.is_published ? 1 : 0;

    if (!title || !youtube_url) {
      return res.status(400).json({ error: 'Título e URL do YouTube são obrigatórios.' });
    }

    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) {
      return res.status(400).json({ error: 'ID do YouTube inválido.' });
    }

    const video_date = String(b.video_date || '').trim() || null;
    const now = nowISO();
    db.prepare(`
      UPDATE portal_videos
         SET title = ?, source_name = ?, badge_category = ?, youtube_url = ?,
             youtube_id = ?, description = ?, video_date = ?, ordem = ?, is_published = ?, updated_at = ?
       WHERE id = ?
    `).run(title, source_name || 'Órgão Oficial', badge_category, youtube_url, youtube_id, description, video_date, ordem, is_published, now, id);

    res.json({ success: true, id, youtube_id });
  } catch (err) {
    console.error('Erro ao atualizar vídeo:', err);
    res.status(500).json({ error: 'Erro ao atualizar vídeo.' });
  }
});

// Mestre: alternar publicação (publicar / rascunho)
portalRouter.patch('/api/portal/admin/videos/:id/toggle', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const v = db.prepare('SELECT id, is_published FROM portal_videos WHERE id = ?').get(id);
    if (!v) return res.status(404).json({ error: 'Vídeo não encontrado.' });

    const nextStatus = v.is_published === 1 ? 0 : 1;
    db.prepare('UPDATE portal_videos SET is_published = ?, updated_at = ? WHERE id = ?')
      .run(nextStatus, nowISO(), id);

    res.json({ success: true, is_published: nextStatus });
  } catch (err) {
    console.error('Erro ao alternar publicação de vídeo:', err);
    res.status(500).json({ error: 'Erro ao alterar status do vídeo.' });
  }
});

// Mestre: excluir vídeo
portalRouter.delete('/api/portal/admin/videos/:id', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM portal_videos WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    res.json({ success: true, deleted: id });
  } catch (err) {
    console.error('Erro ao excluir vídeo:', err);
    res.status(500).json({ error: 'Erro ao excluir vídeo.' });
  }
});

// Mestre: aprovar um vídeo pendente (captado pelo robô) → publica no portal.
portalRouter.post('/api/portal/admin/videos/:id/approve', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const v = db.prepare('SELECT id FROM portal_videos WHERE id = ?').get(id);
    if (!v) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    db.prepare("UPDATE portal_videos SET status = 'aprovado', is_published = 1, updated_at = ? WHERE id = ?")
      .run(nowISO(), id);
    res.json({ success: true, id, status: 'aprovado' });
  } catch (err) {
    console.error('Erro ao aprovar vídeo:', err);
    res.status(500).json({ error: 'Erro ao aprovar vídeo.' });
  }
});

// Mestre: descartar um vídeo pendente (não entra no portal).
portalRouter.post('/api/portal/admin/videos/:id/discard', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const v = db.prepare('SELECT id FROM portal_videos WHERE id = ?').get(id);
    if (!v) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    db.prepare("UPDATE portal_videos SET status = 'descartado', is_published = 0, updated_at = ? WHERE id = ?")
      .run(nowISO(), id);
    res.json({ success: true, id, status: 'descartado' });
  } catch (err) {
    console.error('Erro ao descartar vídeo:', err);
    res.status(500).json({ error: 'Erro ao descartar vídeo.' });
  }
});

// Mestre: captar vídeos agora (RSS dos canais oficiais) → entram como "pendente".
portalRouter.post('/api/portal/admin/videos/collect', requireMaster, async (req, res) => {
  try {
    const resumo = await coletarVideos(db);
    res.json({ success: true, ...resumo });
  } catch (err) {
    console.error('Erro na captação de vídeos:', err);
    res.status(500).json({ error: 'Erro ao captar vídeos: ' + err.message });
  }
});

// ----- Canais oficiais para a captação automática de vídeos (CRUD, só mestre) -----
portalRouter.get('/api/portal/admin/video-channels', requireMaster, (req, res) => {
  try {
    const channels = db.prepare('SELECT * FROM portal_video_channels ORDER BY id ASC').all();
    res.json({ success: true, channels });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar canais de vídeo.' });
  }
});

portalRouter.post('/api/portal/admin/video-channels', requireMaster, (req, res) => {
  try {
    const b = req.body || {};
    const org_name = String(b.org_name || '').trim();
    const badge_category = String(b.badge_category || '').trim().toUpperCase();
    const channel_input = String(b.channel_input || '').trim();
    if (!org_name || !channel_input) {
      return res.status(400).json({ error: 'Informe o nome do órgão e a URL/@handle do canal do YouTube.' });
    }
    const now = nowISO();
    const info = db.prepare(`
      INSERT INTO portal_video_channels (org_name, badge_category, channel_input, channel_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(org_name, badge_category || 'INSTITUCIONAL', channel_input, channelIdFromInput(channel_input), now, now);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Erro ao cadastrar canal de vídeo:', err);
    res.status(500).json({ error: 'Erro ao cadastrar canal.' });
  }
});

portalRouter.put('/api/portal/admin/video-channels/:id', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT channel_input FROM portal_video_channels WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Canal não encontrado.' });
    const b = req.body || {};
    const org_name = String(b.org_name || '').trim();
    const badge_category = String(b.badge_category || '').trim().toUpperCase();
    const channel_input = String(b.channel_input || '').trim();
    const active = b.active ? 1 : 0;
    if (!org_name || !channel_input) {
      return res.status(400).json({ error: 'Informe o nome do órgão e a URL/@handle do canal do YouTube.' });
    }
    const now = nowISO();
    if (row.channel_input === channel_input) {
      db.prepare('UPDATE portal_video_channels SET org_name=?, badge_category=?, channel_input=?, active=?, updated_at=? WHERE id=?')
        .run(org_name, badge_category || 'INSTITUCIONAL', channel_input, active, now, id);
    } else {
      // Entrada mudou: re-resolve o channel_id na próxima captação.
      db.prepare('UPDATE portal_video_channels SET org_name=?, badge_category=?, channel_input=?, channel_id=?, active=?, updated_at=? WHERE id=?')
        .run(org_name, badge_category || 'INSTITUCIONAL', channel_input, channelIdFromInput(channel_input), active, now, id);
    }
    res.json({ success: true, id });
  } catch (err) {
    console.error('Erro ao atualizar canal de vídeo:', err);
    res.status(500).json({ error: 'Erro ao atualizar canal.' });
  }
});

portalRouter.delete('/api/portal/admin/video-channels/:id', requireMaster, (req, res) => {
  try {
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM portal_video_channels WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Canal não encontrado.' });
    res.json({ success: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir canal.' });
  }
});
