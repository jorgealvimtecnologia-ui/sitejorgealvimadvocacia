/**
 * ==============================================================================
 * BARRA DE PESQUISA INTERNA DO SITE (PÁGINAS DO SITE, BLOG & PORTAL DE NOTÍCIAS)
 * ==============================================================================
 * Posicionada abaixo do título do escritório no topo do Hero (index.html).
 * Pesquisa exclusivamente:
 *   1. Matérias publicadas no Blog Jurídico (/blog/:slug)
 *   2. Matérias publicadas no Portal de Notícias (/portal/:slug)
 *   3. Páginas e seções do site (Áreas de Atuação, Dúvidas Frequentes, etc.)
 * Não envia o visitante para o Google externo.
 * ==============================================================================
 */
(function () {
  'use strict';

  var cachedFeedItems = null;
  var staticPagesIndex = null;

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildSitePagesIndex() {
    if (staticPagesIndex) return staticPagesIndex;
    var items = [
      {
        type: 'pagina',
        badge: '📰 Página do Site',
        title: 'Blog Jurídico — Artigos e Orientações do Escritório',
        summary: 'Acesse todos os artigos jurídicos publicados pelo Dr. Jorge Alvim sobre Direito Militar, Trabalhista, Previdenciário, Família e Trânsito.',
        keywords: 'blog juridico artigos materias textos orientacoes',
        href: '/blog'
      },
      {
        type: 'pagina',
        badge: '🗞️ Portal de Notícias',
        title: 'Portal de Notícias Jurídicas — Jornal Alvim',
        summary: 'Acompanhe as notícias oficiais dos tribunais (STF, STJ, STM, TST, TJMG), legislação e matérias comentadas pelo escritório.',
        keywords: 'portal de noticias jornal alvim manchetes tribunais stf stj stm tjmg',
        href: '/portal'
      },
      {
        type: 'pagina',
        badge: '⚖️ Página do Site',
        title: 'Direito Militar das Forças Armadas (Exército, Marinha e Aeronáutica)',
        summary: 'Reforma militar por incapacidade ou invalidez, promoção por ressarcimento de preterição, pensão militar, adicional de habilitação, PAD, Sindicância e IPM.',
        keywords: 'militar exercito marinha aeronautica reforma invalidez pensao sindicancia ipm pad subtenente sargento temporario reserva',
        href: '#areas'
      },
      {
        type: 'pagina',
        badge: '⚖️ Página do Site',
        title: 'Direito do Trabalho & Reclamação Trabalhista (CLT)',
        summary: 'Rescisão indireta, horas extras, adicional de insalubridade e periculosidade, reconhecimento de vínculo, FGTS e multa de 40%.',
        keywords: 'trabalhista trabalho clt demissao justa causa rescisao indireta horas extras fgts insalubridade periculosidade carteira assinada',
        href: '#areas'
      },
      {
        type: 'pagina',
        badge: '⚖️ Página do Site',
        title: 'Direito Previdenciário (INSS — Aposentadorias, Auxílios e BPC/LOAS)',
        summary: 'Aposentadoria por idade, tempo de contribuição ou especial, auxílio-doença, aposentadoria por invalidez, BPC/LOAS e revisão de benefício negado.',
        keywords: 'inss previdenciario aposentadoria auxilio doenca incapacidade bpc loas pericia beneficio negado indeferido',
        href: '#areas'
      },
      {
        type: 'pagina',
        badge: '⚖️ Página do Site',
        title: 'Direito de Família & Sucessões (Divórcio, Pensão, Guarda e Inventário)',
        summary: 'Divórcio consensual ou litigioso, pensão alimentícia, guarda compartilhada, regulamentação de visitas, inventário e partilha de bens.',
        keywords: 'familia divorcio separacao pensao alimenticia alimentos guarda filhos inventario heranca partilha bens uniao estavel',
        href: '#areas'
      },
      {
        type: 'pagina',
        badge: '⚖️ Página do Site',
        title: 'Direito de Trânsito (DETRAN, Suspensão/Cassação de CNH e Lei Seca)',
        summary: 'Recursos contra multas, defesa em processo de suspensão ou cassação da CNH, recusa ao bafômetro (Lei Seca) e pontuação na carteira.',
        keywords: 'transito detran multa cnh suspensa cassada bafometro lei seca recurso jari cetran pontos carteira motorista',
        href: '#areas'
      },
      {
        type: 'pagina',
        badge: '⚖️ Página do Site',
        title: 'Direito Civil, Consumidor & Bancário (Contratos, Indenizações e Golpes)',
        summary: 'Ações de indenização por danos morais e materiais, negativação indevida (SPC/Serasa), golpes bancários e PIX, revisão de contratos.',
        keywords: 'civil civel consumidor bancario golpe pix fraude emprestimo consignado spc serasa nome sujo dano moral indenizacao contrato',
        href: '#areas'
      }
    ];

    try {
      var faqSection = document.getElementById('faq');
      if (faqSection) {
        var headings = faqSection.querySelectorAll('h3, summary, [data-faq-question]');
        headings.forEach(function (el) {
          var q = (el.textContent || '').trim();
          if (q.length < 12) return;
          var parent = el.closest('div, details, article');
          var ans = parent ? (parent.textContent || '').replace(q, '').trim().slice(0, 220) : '';
          items.push({
            type: 'faq',
            badge: '❓ Dúvida Frequente do Site',
            title: q,
            summary: ans || 'Confira a resposta na seção de Dúvidas Frequentes do site.',
            keywords: normalizeText(q + ' ' + ans),
            href: '#faq'
          });
        });
      }
    } catch (_) {}

    staticPagesIndex = items;
    return items;
  }

  async function loadBlogAndPortalFeed() {
    if (cachedFeedItems !== null) return cachedFeedItems;
    try {
      var res = await fetch('/api/portal/feed?limit=50');
      if (res.ok) {
        var data = await res.json();
        var list = Array.isArray(data.items) ? data.items : [];
        cachedFeedItems = list.map(function (p) {
          var isOficial = p.tipo === 'oficial';
          return {
            type: isOficial ? 'portal' : 'blog',
            badge: isOficial ? ('🗞️ Portal de Notícias' + (p.source ? ' • ' + p.source : '')) : ('📰 Matéria do Blog' + (p.category ? ' • ' + p.category : '')),
            title: p.title || 'Matéria Jurídica',
            summary: (p.summary || p.excerpt || '').slice(0, 220),
            keywords: normalizeText((p.title || '') + ' ' + (p.category || '') + ' ' + (p.summary || '') + ' ' + (p.source || '')),
            href: isOficial
              ? ('/portal/' + encodeURIComponent(p.slug || ''))
              : ('/blog/' + encodeURIComponent(p.slug || ''))
          };
        });
        return cachedFeedItems;
      }
    } catch (_) {}

    // Fallback para /api/blog/posts caso /api/portal/feed falhe
    try {
      var resBlog = await fetch('/api/blog/posts');
      if (!resBlog.ok) {
        cachedFeedItems = [];
        return [];
      }
      var dataBlog = await resBlog.json();
      var posts = Array.isArray(dataBlog) ? dataBlog : (dataBlog.posts || []);
      cachedFeedItems = posts.map(function (p) {
        return {
          type: 'blog',
          badge: '📰 Matéria do Blog' + (p.category ? ' • ' + p.category : ''),
          title: p.title || 'Artigo Jurídico',
          summary: (p.summary || p.excerpt || '').slice(0, 220),
          keywords: normalizeText((p.title || '') + ' ' + (p.category || '') + ' ' + (p.summary || '')),
          href: '/blog/' + encodeURIComponent(p.slug || '')
        };
      });
      return cachedFeedItems;
    } catch (_) {
      cachedFeedItems = [];
      return [];
    }
  }

  window.closeHeroSearchDropdown = function () {
    var box = document.getElementById('ja-hero-search-dropdown');
    if (box) box.style.display = 'none';
  };

  window.runHeroSiteSearch = function (ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    var input = document.getElementById('ja-hero-search-input');
    var dropdown = document.getElementById('ja-hero-search-dropdown');
    var listEl = document.getElementById('ja-hero-search-results');
    if (!input || !dropdown || !listEl) return false;

    var rawQuery = (input.value || '').trim();
    if (!rawQuery) {
      dropdown.style.display = 'none';
      return false;
    }

    if (cachedFeedItems === null) {
      loadBlogAndPortalFeed().then(function () {
        if ((input.value || '').trim()) window.runHeroSiteSearch();
      });
    }

    var qNorm = normalizeText(rawQuery);
    var terms = qNorm.split(/\s+/).filter(Boolean);
    var feed = cachedFeedItems || [];
    var pages = buildSitePagesIndex();
    // Prioriza matérias do Blog e do Portal de Notícias antes das seções estáticas
    var allItems = feed.concat(pages);
    var scored = [];

    for (var i = 0; i < allItems.length; i++) {
      var item = allItems[i];
      var hayTitle = normalizeText(item.title);
      var hayFull = normalizeText(item.title + ' ' + item.summary + ' ' + (item.keywords || ''));
      var score = 0;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        if (hayTitle.indexOf(term) !== -1) score += 6;
        else if (hayFull.indexOf(term) !== -1) score += 2;
      }
      if (score > 0) {
        if (item.type === 'blog' || item.type === 'portal') score += 2;
        scored.push({ item: item, score: score });
      }
    }

    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, 6);

    if (!top.length) {
      listEl.innerHTML = [
        '<div class="ja-hs-empty">',
        '  <p class="ja-hs-empty-title">Nenhuma matéria encontrada para <strong>"' + escapeHtml(rawQuery) + '"</strong>.</p>',
        '  <div class="ja-hs-actions" style="justify-content:center">',
        '    <a href="/blog" class="ja-hs-link">📰 Ver Blog Jurídico</a>',
        '    <a href="/portal" class="ja-hs-link">🗞️ Ver Portal de Notícias</a>',
        '  </div>',
        '</div>'
      ].join('');
    } else {
      var rowsHtml = top.map(function (entry) {
        var it = entry.item;
        return [
          '<div class="ja-hs-item">',
          '  <div class="ja-hs-item-main">',
          '    <span class="ja-hs-badge">' + escapeHtml(it.badge) + '</span>',
          '    <a href="' + escapeHtml(it.href) + '" onclick="window.closeHeroSearchDropdown()" class="ja-hs-title">' + escapeHtml(it.title) + '</a>',
          '    <p class="ja-hs-desc">' + escapeHtml(it.summary) + '</p>',
          '  </div>',
          '  <div class="ja-hs-item-btns">',
          '    <a href="' + escapeHtml(it.href) + '" onclick="window.closeHeroSearchDropdown()" class="ja-hs-link">Ler matéria →</a>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');

      listEl.innerHTML = rowsHtml + [
        '<div class="ja-hs-footer">',
        '  <a href="/blog" class="ja-hs-link">📰 Todas as matérias do Blog</a>',
        '  <a href="/portal" class="ja-hs-link">🗞️ Abrir Portal de Notícias</a>',
        '</div>'
      ].join('');
    }

    dropdown.style.display = 'block';
    return false;
  };

  document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('ja-hero-search-input');
    var wrapper = document.getElementById('ja-hero-search-wrap');
    if (!input || !wrapper) return;

    // Pré-carrega em segundo plano as matérias do Blog e Portal de Notícias
    loadBlogAndPortalFeed();

    input.addEventListener('input', function () {
      if ((input.value || '').trim().length >= 2) {
        window.runHeroSiteSearch();
      } else {
        window.closeHeroSearchDropdown();
      }
    });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        window.closeHeroSearchDropdown();
      }
    });

    document.addEventListener('click', function (ev) {
      if (wrapper && !wrapper.contains(ev.target)) {
        window.closeHeroSearchDropdown();
      }
    });

    try {
      var params = new URLSearchParams(window.location.search);
      var q = params.get('q') || params.get('busca');
      if (q) {
        input.value = q;
        window.runHeroSiteSearch();
      }
    } catch (_) {}
  });
})();
