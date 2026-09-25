/**
 * Módulo de Renderização SEO do Blog Jurídico
 *
 * Injeta dinamicamente:
 * 1. Meta tags canônicas (<link rel="canonical">) por artigo.
 * 2. Títulos e descrições Open Graph no HTML inicial.
 * 3. Dados Estruturados Schema.org JSON-LD (BreadcrumbList, Blog, BlogPosting)
 *    com dados do autor (Dr. Jorge Alvim OAB/MG 222.943) e publicador.
 *
 * Isso resolve o aviso do Google Search Console e ativa Rich Snippets nos buscadores.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../../config/db.js';
import { versionAssets } from '../../shared/asset-version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');
const BLOG_HTML_PATH = path.join(ROOT_DIR, 'blog.html');

let cachedBlog = { mtimeMs: 0, html: '' };

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderBlogHtml(slug) {
  const stat = fs.statSync(BLOG_HTML_PATH);
  if (!cachedBlog.html || cachedBlog.mtimeMs !== stat.mtimeMs) {
    cachedBlog = {
      mtimeMs: stat.mtimeMs,
      html: fs.readFileSync(BLOG_HTML_PATH, 'utf8')
    };
  }

  let html = cachedBlog.html;
  const baseUrl = 'https://jorgealvimadvocacia.com.br';

  if (!slug) {
    const canonical = `${baseUrl}/blog`;
    const blogSchema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': baseUrl },
            { '@type': 'ListItem', 'position': 2, 'name': 'Blog Jurídico', 'item': canonical }
          ]
        },
        {
          '@type': 'Blog',
          '@id': `${canonical}#blog`,
          'name': 'Blog Jurídico • Jorge Alvim Advocacia',
          'description': 'Artigos jurídicos práticos e orientações sobre Direito Militar, Defesa de CNH, Direito Trabalhista, INSS e Direito de Família em Juiz de Fora e região.',
          'url': canonical,
          'publisher': {
            '@type': 'Organization',
            'name': 'Jorge Alvim Advocacia & Consultoria Jurídica',
            'url': baseUrl,
            'logo': `${baseUrl}/public/favicon.svg`
          }
        }
      ]
    };
    const schemaTag = `  <script type="application/ld+json">\n${JSON.stringify(blogSchema, null, 2)}\n  </script>\n`;

    html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');
    html = html.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n  <meta property="og:url" content="${canonical}" />\n${schemaTag}</head>`);
    return versionAssets(html);
  }

  const cleanSlug = String(slug).trim().replace(/[^a-zA-Z0-9\-_]/g, '');
  const canonical = `${baseUrl}/blog/${cleanSlug}`;

  let post = null;
  try {
    post = db.prepare('SELECT title, summary, cover_image, published_at, created_at, updated_at, author_name, author_oab FROM blog_posts WHERE slug = ? AND is_published = 1').get(cleanSlug);
  } catch (err) {
    console.warn('[SEO BLOG] Erro ao consultar artigo para canônica:', err.message);
  }

  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');

  if (post && post.title) {
    const title = `${post.title} • Jorge Alvim Advocacia`;
    const desc = post.summary || 'Artigos práticos, orientações de direitos e defesa jurídica especializada em Juiz de Fora e MG.';
    const image = post.cover_image || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&q=80';

    const articleSchema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': baseUrl },
            { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': `${baseUrl}/blog` },
            { '@type': 'ListItem', 'position': 3, 'name': post.title, 'item': canonical }
          ]
        },
        {
          '@type': 'BlogPosting',
          '@id': `${canonical}#article`,
          'isPartOf': {
            '@type': 'Blog',
            '@id': `${baseUrl}/blog#blog`,
            'name': 'Blog Jurídico • Jorge Alvim Advocacia'
          },
          'headline': post.title,
          'description': desc,
          'image': image,
          'datePublished': post.published_at || post.created_at,
          'dateModified': post.updated_at || post.published_at || post.created_at,
          'mainEntityOfPage': {
            '@type': 'WebPage',
            '@id': canonical
          },
          'inLanguage': 'pt-BR',
          'author': {
            '@type': 'Person',
            'name': post.author_name || 'Dr. Jorge Eduardo da Silva Alvim',
            'jobTitle': `Advogado Titular (${post.author_oab || 'OAB/MG 222.943'})`,
            'url': `${baseUrl}/#legalservice`
          },
          'publisher': {
            '@type': 'Organization',
            'name': 'Jorge Alvim Advocacia & Consultoria Jurídica',
            'url': baseUrl,
            'logo': {
              '@type': 'ImageObject',
              'url': `${baseUrl}/public/favicon.svg`
            }
          }
        }
      ]
    };
    const schemaTag = `  <script type="application/ld+json">\n${JSON.stringify(articleSchema, null, 2)}\n  </script>\n`;

    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
    html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeAttr(desc)}">`);
    html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttr(title)}">`);
    html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttr(desc)}">`);
    html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeAttr(image)}">`);
    html = html.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n  <meta property="og:url" content="${canonical}" />\n${schemaTag}</head>`);
  } else {
    html = html.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n  <meta property="og:url" content="${canonical}" />\n</head>`);
  }

  return versionAssets(html);
}
