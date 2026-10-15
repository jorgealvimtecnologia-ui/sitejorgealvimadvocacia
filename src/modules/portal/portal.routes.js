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

export const portalRouter = express.Router();

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

// Uma notícia por slug (público, só leitura; não incrementa contadores).
portalRouter.get('/api/portal/posts/:slug', (req, res) => {
  try {
    const post = db.prepare(
      `SELECT id, slug, title, summary, category, content, cover_image, tags,
              author_name, author_oab, views_count, likes_count,
              published_at, created_at, updated_at
         FROM blog_posts
        WHERE slug = ? AND is_published = 1`
    ).get(req.params.slug);
    if (!post) return res.status(404).json({ error: 'Notícia não encontrada.' });
    res.json({ success: true, post });
  } catch (err) {
    console.error('Erro ao obter notícia do portal:', err);
    res.status(500).json({ error: 'Erro ao carregar notícia.' });
  }
});
