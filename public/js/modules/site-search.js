/**
 * ==============================================================================
 * BARRA DE PESQUISA HÍBRIDA (HERO — ABAIXO DO TÍTULO DO ESCRITÓRIO)
 * ==============================================================================
 * Posicionada no topo do Hero (no lugar do selo abaixo de JORGE ALVIM ADVOCACIA).
 * - Permite buscar instantaneamente nos conteúdos do site (Áreas de Atuação,
 *   Dúvidas Frequentes e Artigos do Blog) em um painel suspenso limpo;
 * - Permite pesquisar diretamente no Google com 1 clique.
 * ==============================================================================
 */
(function () {
  'use strict';

  var WA_PHONE = '5532998153429';
  var cachedBlogPosts = null;
  var staticIndex = null;

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

  function buildStaticIndex() {
    if (staticIndex) return staticIndex;
    var items = [
      {
        type: 'area',
        badge: '⚖️ Área de Atuação',
        title: 'Direito Militar das Forças Armadas (Exército, Marinha e Aeronáutica)',
        summary: 'Reforma militar por incapacidade ou invalidez, promoção por ressarcimento de preterição, pensão militar, adicional de habilitação, defesa em PAD, Sindicância e IPM.',
        keywords: 'militar exercito marinha aeronautica reforma invalidez pensao sindicancia ipm pad subtenente sargento temporario transferencia reserva',
        href: '#areas',
        waTopic: 'Direito Militar das Forças Armadas'
      },
      {
        type: 'area',
        badge: '⚖️ Área de Atuação',
        title: 'Direito do Trabalho & Reclamação Trabalhista (CLT)',
        summary: 'Rescisão indireta, horas extras, adicional de insalubridade e periculosidade, reconhecimento de vínculo sem carteira assinada, FGTS, multa de 40% e assédio moral.',
        keywords: 'trabalhista trabalho clt demissao justa causa rescisao indireta horas extras fgts insalubridade periculosidade carteira assinada',
        href: '#areas',
        waTopic: 'Direito Trabalhista'
      },
      {
        type: 'area',
        badge: '⚖️ Área de Atuação',
        title: 'Direito Previdenciário (INSS — Aposentadorias, Auxílios e BPC/LOAS)',
        summary: 'Aposentadoria por idade, tempo de contribuição ou especial, auxílio-doença (incapacidade temporária), aposentadoria por invalidez, BPC/LOAS e revisão de benefício negado pelo INSS.',
        keywords: 'inss previdenciario aposentadoria auxilio doenca incapacidade bpc loas pericia beneficio negado indeferido',
        href: '#areas',
        waTopic: 'Direito Previdenciário (INSS)'
      },
      {
        type: 'area',
        badge: '⚖️ Área de Atuação',
        title: 'Direito de Família & Sucessões (Divórcio, Pensão, Guarda e Inventário)',
        summary: 'Divórcio consensual em cartório ou litigioso, fixação, revisão e execução de pensão alimentícia, guarda compartilhada, regulamentação de visitas, inventário e partilha de bens.',
        keywords: 'familia divorcio separacao pensao alimenticia alimentos guarda filhos inventario heranca partilha bens uniao estavel',
        href: '#areas',
        waTopic: 'Direito de Família e Sucessões'
      },
      {
        type: 'area',
        badge: '⚖️ Área de Atuação',
        title: 'Direito de Trânsito (DETRAN, Suspensão/Cassação de CNH e Lei Seca)',
        summary: 'Recursos administrativos e judiciais contra multas, defesa em processo de suspensão ou cassação da CNH, recusa ao teste do bafômetro (Lei Seca) e pontuação na carteira.',
        keywords: 'transito detran multa cnh suspensa cassada bafometro lei seca recurso jari cetran pontos carteira motorista',
        href: '#areas',
        waTopic: 'Direito de Trânsito e CNH'
      },
      {
        type: 'area',
        badge: '⚖️ Área de Atuação',
        title: 'Direito Civil, Consumidor & Bancário (Contratos, Indenizações e Golpes)',
        summary: 'Ações de indenização por danos morais e materiais, negativação indevida (SPC/Serasa), golpes bancários e PIX, revisão de juros abusivos, contratos e cobranças.',
        keywords: 'civil civel consumidor bancario golpe pix fraude emprestimo consignado spc serasa nome sujo dano moral indenizacao contrato',
        href: '#areas',
        waTopic: 'Direito Cível, Consumidor e Bancário'
      },
      {
        type: 'service',
        badge: '🏛️ Guia da Justiça',
        title: 'Guia da Justiça (STF, STJ, STM, TJMG, TRT3, TRF6, INSS e Órgãos)',
        summary: 'Acesso rápido aos portais dos tribunais e órgãos públicos diretamente na barra do Guia da Justiça.',
        keywords: 'forum juiz de fora stf stj stm tjmg trt3 trf6 inss detran oab',
        href: '#guia-justica',
        waTopic: 'Consulta Jurídica'
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
            badge: '❓ Dúvida Frequente',
            title: q,
            summary: ans || 'Confira a resposta na seção de Dúvidas Frequentes do site.',
            keywords: normalizeText(q + ' ' + ans),
            href: '#faq',
            waTopic: q.slice(0, 80)
          });
        });
      }
    } catch (_) {}

    staticIndex = items;
    return items;
  }

  async function loadBlogPostsForSearch() {
    if (cachedBlogPosts !== null) return cachedBlogPosts;
    try {
      var res = await fetch('/api/blog/posts');
      if (!res.ok) {
        cachedBlogPosts = [];
        return [];
      }
      var data = await res.json();
      var list = Array.isArray(data) ? data : (data.posts || []);
      cachedBlogPosts = list.map(function (p) {
        return {
          type: 'blog',
          badge: '📰 Artigo do Blog',
          title: p.title || 'Artigo Jurídico',
          summary: (p.excerpt || p.summary || '').slice(0, 200),
          keywords: normalizeText((p.title || '') + ' ' + (p.category || '') + ' ' + (p.excerpt || '')),
          href: p.slug ? ('/blog?slug=' + encodeURIComponent(p.slug)) : '/blog',
          waTopic: p.title || 'Artigo do Blog'
        };
      });
      return cachedBlogPosts;
    } catch (_) {
      cachedBlogPosts = [];
      return [];
    }
  }

  window.closeHeroSearchDropdown = function () {
    var box = document.getElementById('ja-hero-search-dropdown');
    if (box) box.style.display = 'none';
  };

  window.runHeroGoogleSearch = function () {
    var input = document.getElementById('ja-hero-search-input');
    var q = (input && input.value ? input.value : '').trim();
    if (!q) {
      if (input) input.focus();
      return;
    }
    window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener,noreferrer');
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

    if (cachedBlogPosts === null) {
      loadBlogPostsForSearch().then(function () {
        if ((input.value || '').trim()) window.runHeroSiteSearch();
      });
    }

    var qNorm = normalizeText(rawQuery);
    var terms = qNorm.split(/\s+/).filter(Boolean);
    var allItems = buildStaticIndex().concat(cachedBlogPosts || []);
    var scored = [];

    for (var i = 0; i < allItems.length; i++) {
      var item = allItems[i];
      var hayTitle = normalizeText(item.title);
      var hayFull = normalizeText(item.title + ' ' + item.summary + ' ' + (item.keywords || ''));
      var score = 0;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        if (hayTitle.indexOf(term) !== -1) score += 5;
        else if (hayFull.indexOf(term) !== -1) score += 2;
      }
      if (score > 0) scored.push({ item: item, score: score });
    }

    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, 5);

    var waCustom = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent('Olá, Dr. Jorge Alvim! Pesquisei sobre "' + rawQuery + '" no site e gostaria de uma orientação jurídica.');

    if (!top.length) {
      listEl.innerHTML = [
        '<div class="ja-hs-empty">',
        '  <p class="ja-hs-empty-title">Nenhum artigo interno exato para <strong>"' + escapeHtml(rawQuery) + '"</strong>.</p>',
        '  <div class="ja-hs-actions">',
        '    <button type="button" onclick="window.runHeroGoogleSearch()" class="ja-hs-btn-google">🌐 Pesquisar "' + escapeHtml(rawQuery.slice(0, 30)) + '" no Google</button>',
        '    <a href="' + waCustom + '" target="_blank" rel="noopener noreferrer" class="ja-hs-btn-wa">📲 Perguntar ao Dr. Jorge no WhatsApp</a>',
        '  </div>',
        '</div>'
      ].join('');
    } else {
      var rowsHtml = top.map(function (entry) {
        var it = entry.item;
        var waLink = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent('Olá, Dr. Jorge Alvim! Vi no site sobre "' + it.waTopic + '" e gostaria de uma orientação jurídica.');
        return [
          '<div class="ja-hs-item">',
          '  <div class="ja-hs-item-main">',
          '    <span class="ja-hs-badge">' + escapeHtml(it.badge) + '</span>',
          '    <a href="' + escapeHtml(it.href) + '" onclick="window.closeHeroSearchDropdown()" class="ja-hs-title">' + escapeHtml(it.title) + '</a>',
          '    <p class="ja-hs-desc">' + escapeHtml(it.summary) + '</p>',
          '  </div>',
          '  <div class="ja-hs-item-btns">',
          '    <a href="' + escapeHtml(it.href) + '" onclick="window.closeHeroSearchDropdown()" class="ja-hs-link">Ver no site →</a>',
          '    <a href="' + waLink + '" target="_blank" rel="noopener noreferrer" class="ja-hs-wa">📲 Tirar dúvida</a>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');

      listEl.innerHTML = rowsHtml + [
        '<div class="ja-hs-footer">',
        '  <button type="button" onclick="window.runHeroGoogleSearch()" class="ja-hs-btn-google">🌐 Pesquisar "' + escapeHtml(rawQuery.slice(0, 28)) + '" no Google</button>',
        '  <a href="' + waCustom + '" target="_blank" rel="noopener noreferrer" class="ja-hs-btn-wa">📲 Falar com Dr. Jorge</a>',
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
