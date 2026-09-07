/**
 * Módulo BLOG JURÍDICO — artigos, categorias, comentários, likes/share e
 * moderação (admin). Extraído do server.js para reduzir o monólito.
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { getClientIp } from '../../shared/net.js';
import { generateNextClientId } from '../../shared/ids.js';


export const blogRouter = express.Router();

// ================= ROTAS DO BLOG JURÍDICO (INFORMATIVO & EDUCATIVO) =================

// Helper para gerar slugs limpos para URLs amigáveis
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// 1. Listar Artigos do Blog (Público com Filtros de Categoria, Busca e Paginação)
blogRouter.get('/api/blog/posts', (req, res) => {
  try {
    const { category, search, limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT id, slug, title, summary, category, cover_image, tags, author_name, author_oab, views_count, published_at, created_at FROM blog_posts WHERE is_published = 1`;
    const params = [];

    if (category && category !== 'ALL') {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (search && search.trim()) {
      query += ` AND (title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const posts = db.prepare(query).all(...params);

    // Contagem total para paginação
    let countQuery = `SELECT COUNT(*) as total FROM blog_posts WHERE is_published = 1`;
    const countParams = [];
    if (category && category !== 'ALL') {
      countQuery += ` AND category = ?`;
      countParams.push(category);
    }
    if (search && search.trim()) {
      countQuery += ` AND (title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)`;
      const s = `%${search.trim()}%`;
      countParams.push(s, s, s, s);
    }
    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      posts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Erro ao listar posts do blog:', err);
    res.status(500).json({ error: 'Erro ao buscar artigos do blog.' });
  }
});

// 2. Obter Artigo Completo por Slug (Público + Contador de Visualizações)
blogRouter.get('/api/blog/posts/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const post = db.prepare(`SELECT * FROM blog_posts WHERE slug = ? AND is_published = 1`).get(slug);
    if (!post) {
      return res.status(404).json({ error: 'Artigo não encontrado.' });
    }

    // Incrementa contagem de visualizações
    db.prepare(`UPDATE blog_posts SET views_count = views_count + 1 WHERE id = ?`).run(post.id);

    // Busca 3 artigos relacionados na mesma categoria
    const related = db.prepare(`
      SELECT id, slug, title, summary, category, cover_image, published_at 
      FROM blog_posts 
      WHERE is_published = 1 AND id != ? 
      ORDER BY CASE WHEN category = ? THEN 0 ELSE 1 END, published_at DESC 
      LIMIT 3
    `).all(post.id, post.category);

    res.json({
      success: true,
      post: { ...post, views_count: post.views_count + 1 },
      related
    });
  } catch (err) {
    console.error('Erro ao obter artigo do blog:', err);
    res.status(500).json({ error: 'Erro ao carregar artigo.' });
  }
});

// 3. Listar Categorias do Blog com Contagem de Artigos
blogRouter.get('/api/blog/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM blog_posts 
      WHERE is_published = 1 
      GROUP BY category 
      ORDER BY count DESC
    `).all();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias.' });
  }
});

// 4. Listar Todos os Artigos para o Painel Administrativo (Incluindo Rascunhos)
blogRouter.get('/api/admin/blog/posts', requireAuth, (req, res) => {
  try {
    const posts = db.prepare(`SELECT * FROM blog_posts ORDER BY created_at DESC`).all();
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar artigos no painel.' });
  }
});

// 5. Criar Novo Artigo no Blog (Admin)
blogRouter.post('/api/admin/blog/posts', requireAuth, (req, res) => {
  try {
    const { title, summary, category, content, cover_image, tags, is_published, author_name, author_oab } = req.body;
    if (!title || !category || !content) {
      return res.status(400).json({ error: 'Título, Categoria e Conteúdo são obrigatórios.' });
    }

    let slug = slugify(title);
    // Garantir unicidade do slug
    const existing = db.prepare(`SELECT id FROM blog_posts WHERE slug = ?`).get(slug);
    if (existing) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO blog_posts (
        slug, title, summary, category, content, cover_image, tags,
        author_name, author_oab, is_published, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      title.trim(),
      (summary || title).trim(),
      category.trim(),
      content.trim(),
      cover_image || null,
      tags || null,
      author_name || 'Dr. Jorge Eduardo da Silva Alvim',
      author_oab || 'OAB/MG 222.943',
      is_published !== undefined ? (is_published ? 1 : 0) : 1,
      now,
      now,
      now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_ARTIGO_BLOG',
      module: 'BLOG',
      resource_id: result.lastInsertRowid,
      description: `Publicação do artigo jurídico: '${title.trim()}' (Categoria: ${category.trim()}).`,
      details: { id: result.lastInsertRowid, slug, title: title.trim(), category: category.trim(), is_published }
    });

    res.status(201).json({
      success: true,
      message: 'Artigo publicado com sucesso no blog!',
      id: result.lastInsertRowid,
      slug
    });
  } catch (err) {
    console.error('Erro ao criar artigo do blog:', err);
    res.status(500).json({ error: 'Erro ao salvar artigo: ' + err.message });
  }
});

// 6. Atualizar Artigo do Blog (Admin)
blogRouter.put('/api/admin/blog/posts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, summary, category, content, cover_image, tags, is_published } = req.body;

    if (!title || !category || !content) {
      return res.status(400).json({ error: 'Título, Categoria e Conteúdo são obrigatórios.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE blog_posts SET
        title = ?,
        summary = ?,
        category = ?,
        content = ?,
        cover_image = COALESCE(?, cover_image),
        tags = ?,
        is_published = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title.trim(),
      (summary || title).trim(),
      category.trim(),
      content.trim(),
      cover_image || null,
      tags || null,
      is_published ? 1 : 0,
      now,
      id
    );

    const currentPost = db.prepare(`SELECT slug FROM blog_posts WHERE id = ?`).get(id);
    res.json({ 
      success: true, 
      message: 'Artigo atualizado com sucesso!', 
      id, 
      slug: currentPost ? currentPost.slug : null 
    });
  } catch (err) {
    console.error('Erro ao atualizar artigo:', err);
    res.status(500).json({ error: 'Erro ao atualizar artigo.' });
  }
});

// 7. Excluir Artigo do Blog (Admin)
blogRouter.delete('/api/admin/blog/posts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`DELETE FROM blog_posts WHERE id = ?`).run(id);
    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_ARTIGO_BLOG',
      module: 'BLOG',
      resource_id: id,
      description: `Exclusão do artigo do blog ID '${id}'.`
    });

    res.json({ success: true, message: 'Artigo excluído com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir artigo.' });
  }
});

// Configuração de Armazenamento para Upload de Mídias do Blog (Imagens e Infográficos)
const blogUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const blogImgDir = path.join(process.cwd(), 'public', 'img', 'blog');
    if (!fs.existsSync(blogImgDir)) {
      fs.mkdirSync(blogImgDir, { recursive: true });
    }
    cb(null, blogImgDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'blog-media';
    const timestamp = Date.now();
    cb(null, `${timestamp}_${baseName}${ext}`);
  }
});
const uploadBlogMedia = multer({
  storage: blogUploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// 8. Upload de Mídia para Artigos do Blog (Admin)
blogRouter.post('/api/admin/blog/upload', requireAuth, uploadBlogMedia.single('media'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado. Selecione uma foto ou mídia.' });
    }
    const fileUrl = `/img/blog/${req.file.filename}`;
    logAudit(req, {
      event_type: 'UPLOAD',
      event_name: 'UPLOAD_MIDIA_BLOG',
      module: 'BLOG',
      resource_id: req.file.filename,
      description: `Upload de imagem para o blog: ${req.file.originalname}`
    });
    return res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    console.error('Erro no upload de mídia do blog:', err);
    res.status(500).json({ error: 'Erro ao fazer upload da mídia: ' + err.message });
  }
});


// ================= ROTAS DE INTERAÇÕES E MODERAÇÃO DO BLOG =================

// 1. Obter Comentários Visíveis de um Artigo (Público)
blogRouter.get('/api/blog/posts/:slug/comments', (req, res) => {
  try {
    const { slug } = req.params;
    const comments = db.prepare(`
      SELECT id, author_name, comment_text, created_at
      FROM blog_comments
      WHERE post_slug = ? AND is_hidden = 0
      ORDER BY created_at DESC
    `).all(slug);

    res.json({ success: true, comments, total: comments.length });
  } catch (err) {
    console.error('Erro ao buscar comentários do blog:', err);
    res.status(500).json({ error: 'Erro ao carregar comentários.' });
  }
});

// 2. Enviar Novo Comentário no Artigo + Captação para Pré-Clientes
blogRouter.post('/api/blog/posts/:slug/comments', (req, res) => {
  try {
    const { slug } = req.params;
    const { author_name, author_email, author_phone, comment_text } = req.body;

    if (!author_name || !comment_text || !comment_text.trim()) {
      return res.status(400).json({ error: 'Nome e Comentário são obrigatórios.' });
    }

    const post = db.prepare(`SELECT id, title, category FROM blog_posts WHERE slug = ?`).get(slug);
    if (!post) {
      return res.status(404).json({ error: 'Artigo não encontrado.' });
    }

    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const clientIp = getClientIp(req);

    // Salvar comentário
    const result = db.prepare(`
      INSERT INTO blog_comments (
        post_id, post_slug, author_name, author_email, author_phone,
        comment_text, is_hidden, ip_address, user_agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      post.id,
      slug,
      author_name.trim(),
      author_email ? author_email.trim() : '',
      author_phone ? author_phone.trim() : '',
      comment_text.trim(),
      clientIp,
      req.headers['user-agent'] || '',
      now,
      now
    );

    // Auto-registro como Pré-Cliente na tabela site_visits
    try {
      db.prepare(`
        INSERT INTO site_visits (
          ip_address, user_agent, referer, page_url, path,
          visit_date, visit_year, visit_month,
          visitor_name, visitor_phone, visitor_email, interest_area,
          is_pre_client, lead_source, pre_client_notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'BLOG_COMENTARIO', ?, ?, ?)
      `).run(
        clientIp,
        req.headers['user-agent'] || '',
        req.headers['referer'] || '',
        `/blog/${slug}`,
        `/blog/${slug}`,
        todayStr,
        currentYear,
        currentMonth,
        author_name.trim(),
        author_phone ? author_phone.trim() : '',
        author_email ? author_email.trim() : '',
        post.category || 'Blog Jurídico',
        `Comentou no artigo '${post.title}': "${comment_text.trim().substring(0, 140)}"`,
        now,
        now
      );
    } catch (visitErr) {
      console.warn('Aviso ao registrar pré-cliente por comentário:', visitErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Comentário publicado com sucesso! Obrigado por participar.',
      comment: {
        id: result.lastInsertRowid,
        author_name: author_name.trim(),
        comment_text: comment_text.trim(),
        created_at: now
      }
    });
  } catch (err) {
    console.error('Erro ao postar comentário no blog:', err);
    res.status(500).json({ error: 'Erro ao enviar comentário.' });
  }
});

// 3. Registrar Curtida (Like) no Artigo + Captação de Interação
blogRouter.post('/api/blog/posts/:slug/like', (req, res) => {
  try {
    const { slug } = req.params;
    const { user_identifier, visitor_name, visitor_phone, visitor_email } = req.body || {};

    const post = db.prepare(`SELECT id, title, category, likes_count FROM blog_posts WHERE slug = ?`).get(slug);
    if (!post) {
      return res.status(404).json({ error: 'Artigo não encontrado.' });
    }

    const clientIp = getClientIp(req);
    const now = new Date().toISOString();

    // Incrementa curtida no artigo
    db.prepare(`UPDATE blog_posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?`).run(post.id);

    // Registra log da curtida
    db.prepare(`
      INSERT INTO blog_likes (post_id, post_slug, user_identifier, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(post.id, slug, user_identifier || clientIp, clientIp, now);

    // Se houver dados do visitante, envia para Pré-Clientes
    if (visitor_name || visitor_phone || visitor_email) {
      const todayStr = now.split('T')[0];
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      try {
        db.prepare(`
          INSERT INTO site_visits (
            ip_address, user_agent, referer, page_url, path,
            visit_date, visit_year, visit_month,
            visitor_name, visitor_phone, visitor_email, interest_area,
            is_pre_client, lead_source, pre_client_notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'BLOG_CURTIDA', ?, ?, ?)
        `).run(
          clientIp,
          req.headers['user-agent'] || '',
          req.headers['referer'] || '',
          `/blog/${slug}`,
          `/blog/${slug}`,
          todayStr,
          currentYear,
          currentMonth,
          (visitor_name || 'Leitor do Blog').trim(),
          visitor_phone ? visitor_phone.trim() : '',
          visitor_email ? visitor_email.trim() : '',
          post.category || 'Blog Jurídico',
          `Curtiu o artigo '${post.title}'`,
          now,
          now
        );
      } catch (visitErr) {
        console.warn('Aviso ao registrar pré-cliente por like:', visitErr.message);
      }
    }

    const updatedPost = db.prepare(`SELECT likes_count FROM blog_posts WHERE id = ?`).get(post.id);

    res.json({
      success: true,
      message: 'Curtida registrada com sucesso!',
      likes_count: updatedPost.likes_count || 1
    });
  } catch (err) {
    console.error('Erro ao registrar curtida no blog:', err);
    res.status(500).json({ error: 'Erro ao registrar curtida.' });
  }
});

// 4. Registrar Compartilhamento (Share) no Artigo
blogRouter.post('/api/blog/posts/:slug/share', (req, res) => {
  try {
    const { slug } = req.params;
    const { platform = 'whatsapp' } = req.body || {};

    const post = db.prepare(`SELECT id, title, shares_count FROM blog_posts WHERE slug = ?`).get(slug);
    if (!post) {
      return res.status(404).json({ error: 'Artigo não encontrado.' });
    }

    const clientIp = getClientIp(req);
    const now = new Date().toISOString();

    db.prepare(`UPDATE blog_posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = ?`).run(post.id);

    db.prepare(`
      INSERT INTO blog_shares (post_id, post_slug, platform, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(post.id, slug, platform, clientIp, now);

    res.json({
      success: true,
      message: 'Compartilhamento registrado!',
      shares_count: (post.shares_count || 0) + 1
    });
  } catch (err) {
    console.error('Erro ao registrar compartilhamento:', err);
    res.status(500).json({ error: 'Erro ao registrar compartilhamento.' });
  }
});

// 5. Rastreamento de Cliques e Conversões do Blog para Pré-Clientes
blogRouter.post('/api/blog/track-click', (req, res) => {
  try {
    const { visitor_name, visitor_phone, visitor_email, action_type, post_slug, interest_area, notes } = req.body;
    const clientIp = getClientIp(req);
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    db.prepare(`
      INSERT INTO site_visits (
        ip_address, user_agent, referer, page_url, path,
        visit_date, visit_year, visit_month,
        visitor_name, visitor_phone, visitor_email, interest_area,
        is_pre_client, lead_source, pre_client_notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      clientIp,
      req.headers['user-agent'] || '',
      req.headers['referer'] || '',
      post_slug ? `/blog/${post_slug}` : '/blog',
      post_slug ? `/blog/${post_slug}` : '/blog',
      todayStr,
      currentYear,
      currentMonth,
      (visitor_name || 'Visitante do Blog').trim(),
      visitor_phone ? visitor_phone.trim() : '',
      visitor_email ? visitor_email.trim() : '',
      interest_area || 'Consultoria Jurídica',
      action_type || 'BLOG_CLICK_CTA',
      notes || `Clicou em ação no blog (${action_type || 'Geral'})`,
      now,
      now
    );

    res.json({ success: true, message: 'Interação registrada em pré-clientes!' });
  } catch (err) {
    console.error('Erro ao rastrear clique do blog:', err);
    res.status(500).json({ error: 'Erro ao registrar clique.' });
  }
});

// 6. Listar Todos os Comentários para o Moderador (Painel Admin)
blogRouter.get('/api/admin/blog/comments', requireAuth, (req, res) => {
  try {
    const { status, post_slug, search, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT c.*, p.title as post_title, p.category as post_category
      FROM blog_comments c
      LEFT JOIN blog_posts p ON c.post_slug = p.slug
      WHERE 1=1
    `;
    const params = [];

    if (status === 'hidden') {
      query += ` AND c.is_hidden = 1`;
    } else if (status === 'visible') {
      query += ` AND c.is_hidden = 0`;
    }

    if (post_slug) {
      query += ` AND c.post_slug = ?`;
      params.push(post_slug);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query += ` AND (c.author_name LIKE ? OR c.author_email LIKE ? OR c.author_phone LIKE ? OR c.comment_text LIKE ? OR p.title LIKE ?)`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const comments = db.prepare(query).all(...params);

    const countQuery = `SELECT COUNT(*) as total, SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END) as hidden_count, SUM(CASE WHEN is_hidden = 0 THEN 1 ELSE 0 END) as visible_count FROM blog_comments`;
    const stats = db.prepare(countQuery).get();

    res.json({
      success: true,
      comments,
      stats: {
        total: stats.total || 0,
        hidden_count: stats.hidden_count || 0,
        visible_count: stats.visible_count || 0
      }
    });
  } catch (err) {
    console.error('Erro ao listar comentários para moderação:', err);
    res.status(500).json({ error: 'Erro ao buscar comentários para moderação.' });
  }
});

// 7. Alternar Visibilidade do Comentário (Esconder / Exibir) (Admin)
blogRouter.put('/api/admin/blog/comments/:id/toggle-visibility', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const comment = db.prepare(`SELECT * FROM blog_comments WHERE id = ?`).get(id);

    if (!comment) {
      return res.status(404).json({ error: 'Comentário não encontrado.' });
    }

    const newHiddenState = comment.is_hidden === 1 ? 0 : 1;
    const now = new Date().toISOString();

    db.prepare(`UPDATE blog_comments SET is_hidden = ?, updated_at = ? WHERE id = ?`).run(newHiddenState, now, id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'MODERAR_COMENTARIO_BLOG',
      module: 'BLOG',
      resource_id: id,
      description: `${newHiddenState === 1 ? 'Ocultou' : 'Exibiu'} o comentário de '${comment.author_name}' no artigo '${comment.post_slug}'.`
    });

    res.json({
      success: true,
      message: newHiddenState === 1 ? 'Comentário ocultado com sucesso!' : 'Comentário tornado visível no blog!',
      is_hidden: newHiddenState
    });
  } catch (err) {
    console.error('Erro ao moderar comentário:', err);
    res.status(500).json({ error: 'Erro ao alterar visibilidade do comentário.' });
  }
});

// 8. Excluir Comentário do Blog Definitivamente (Admin)
blogRouter.delete('/api/admin/blog/comments/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const comment = db.prepare(`SELECT * FROM blog_comments WHERE id = ?`).get(id);

    if (!comment) {
      return res.status(404).json({ error: 'Comentário não encontrado.' });
    }

    db.prepare(`DELETE FROM blog_comments WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_COMENTARIO_BLOG',
      module: 'BLOG',
      resource_id: id,
      description: `Exclusão definitiva do comentário de '${comment.author_name}' (ID #${id}) no artigo '${comment.post_slug}'.`
    });

    res.json({ success: true, message: 'Comentário excluído com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir comentário:', err);
    res.status(500).json({ error: 'Erro ao excluir comentário.' });
  }
});

// 9. Converter Autor de Comentário em Lead (Admin)
blogRouter.post('/api/admin/blog/comments/:id/convert-to-lead', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const comment = db.prepare(`
      SELECT c.*, p.title as post_title, p.category as post_category
      FROM blog_comments c
      LEFT JOIN blog_posts p ON c.post_slug = p.slug
      WHERE c.id = ?
    `).get(id);

    if (!comment) {
      return res.status(404).json({ error: 'Comentário não encontrado.' });
    }

    const newLeadId = generateNextClientId();
    const now = new Date().toISOString();
    const leadName = (comment.author_name || 'Comentarista do Blog').trim();
    const leadPhone = (comment.author_phone || '(32) 99815-3429').trim();
    const leadArea = comment.post_category || 'Blog & Consultoria';
    const messageNotes = `Lead originado do comentário no artigo '${comment.post_title || comment.post_slug}': "${comment.comment_text}". E-mail: ${comment.author_email || '—'}`;

    db.prepare(`
      INSERT INTO leads (id, created_at, name, phone, area, message, files, status, social_media, website, google_business)
      VALUES (?, ?, ?, ?, ?, ?, '[]', 'Novo', '', '', '')
    `).run(newLeadId, now, leadName, leadPhone, leadArea, messageNotes);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CONVERTER_COMENTARIO_LEAD',
      module: 'LEADS',
      resource_id: newLeadId,
      description: `Conversão do comentarista '${leadName}' em Lead #${newLeadId}.`
    });

    res.json({
      success: true,
      message: `Comentarista ${leadName} convertido em Lead #${newLeadId} com sucesso!`,
      lead_id: newLeadId
    });
  } catch (err) {
    console.error('Erro ao converter comentário em lead:', err);
    res.status(500).json({ error: 'Erro ao converter comentarista em lead.' });
  }
});
