/**
 * ==============================================================================
 * BARRA DE PESQUISA INTELIGENTE DO SITE PÚBLICO & PESQUISA GOOGLE DO PAINEL
 * ==============================================================================
 * 1. No site público (index.html):
 *    - Busca instantânea 100% interna nas Áreas de Atuação, FAQ (Dúvidas),
 *      Guia da Justiça e Artigos do Blog (/api/blog/posts), mantendo o visitante
 *      dentro do domínio jorgealvimadvocacia.com.br e convertendo para o WhatsApp.
 *    - Suporta parâmetro ?q=termo (Schema.org SearchAction) e opção de busca
 *      Google restrita a site:jorgealvimadvocacia.com.br.
 *
 * 2. No Painel Administrativo (painel.html):
 *    - Barra de Pesquisa Google Web & Jurídica (Google, Planalto, STJ/STF/TJMG,
 *      Legislação Militar, Google Acadêmico e site próprio) para uso diário.
 * ==============================================================================
 */
(function () {
  'use strict';

  var WA_PHONE = '5532998153429';
  var SITE_DOMAIN = 'jorgealvimadvocacia.com.br';
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

  // Base curada das principais áreas e temas do escritório + indexação dinâmica do DOM
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
        badge: '🏛️ Guia & Serviços',
        title: 'Guia da Justiça de Juiz de Fora (Endereços e Telefones Úteis)',
        summary: 'Consulta rápida aos endereços e contatos do Fórum Benjamin Colucci, Justiça Federal, Justiça do Trabalho, INSS, Auditoria Militar (4ª CJM) e Defensoria em Juiz de Fora.',
        keywords: 'forum juiz de fora endereco telefone vara justica federal trabalho auditoria militar cjm inss benfica',
        href: '#guia-justica',
        waTopic: 'Atendimento em Juiz de Fora'
      },
      {
        type: 'service',
        badge: '📅 Atendimento',
        title: 'Contato, Envio Digital de Documentos e Agendamento de Consulta',
        summary: 'Atendimento presencial em Benfica (Juiz de Fora - MG) e 100% digital em todo o Brasil com assinatura eletrônica pelo celular.',
        keywords: 'contato telefone whatsapp endereco agendar consulta enviar documentos online benfica juiz de fora',
        href: '#contato',
        waTopic: 'Agendamento de Consulta Jurídica'
      }
    ];

    // Indexa perguntas frequentes presentes no DOM (#faq)
    try {
      var faqSection = document.getElementById('faq');
      if (faqSection) {
        var headings = faqSection.querySelectorAll('h3, summary, [data-faq-question]');
        headings.forEach(function (el) {
          var q = (el.textContent || '').trim();
          if (q.length < 12) return;
          var parent = el.closest('div, details, article');
          var ans = parent ? (parent.textContent || '').replace(q, '').trim().slice(0, 240) : '';
          items.push({
            type: 'faq',
            badge: '❓ Dúvida Frequente',
            title: q,
            summary: ans || 'Confira a resposta detalhada na seção de Dúvidas Frequentes do site.',
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
          summary: (p.excerpt || p.summary || '').slice(0, 220),
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

  function ensurePublicSearchModal() {
    var existing = document.getElementById('site-search-modal');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'site-search-modal';
    modal.className = 'hidden fixed inset-0 z-[999998] bg-navy-950/75 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20 overflow-y-auto';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'site-search-modal-title');

    modal.innerHTML = [
      '<div class="bg-white rounded-3xl shadow-2xl border border-gold-300/80 w-full max-w-2xl overflow-hidden animate-fade-in" onclick="event.stopPropagation()">',
      '  <div class="p-4 sm:p-5 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/90 border-b border-slate-200">',
      '    <div class="flex items-center justify-between mb-3">',
      '      <div class="flex items-center space-x-2">',
      '        <span class="w-8 h-8 rounded-xl bg-gold-100 border border-gold-400 flex items-center justify-center text-gold-800 font-bold text-sm">🔍</span>',
      '        <div>',
      '          <h2 id="site-search-modal-title" class="font-serif text-base sm:text-lg font-bold text-navy-950 leading-tight">Pesquisa Inteligente — Jorge Alvim Advocacia</h2>',
      '          <p class="text-[11px] text-slate-600">Encontre áreas de atuação, artigos jurídicos e tire dúvidas sem sair do site</p>',
      '        </div>',
      '      </div>',
      '      <button type="button" onclick="window.closeSiteSearchModal()" aria-label="Fechar pesquisa" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center font-bold text-base cursor-pointer">&times;</button>',
      '    </div>',
      '    <div class="relative flex items-center">',
      '      <svg class="w-5 h-5 text-gold-700 absolute left-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/></svg>',
      '      <input id="site-search-input" type="search" autocomplete="off" placeholder="Digite sua dúvida (ex: reforma militar, INSS negado, divórcio, rescisão, CNH...)" aria-label="Digite sua pesquisa jurídica" class="w-full pl-11 pr-24 py-3 rounded-2xl bg-white border-2 border-gold-400/80 focus:border-gold-600 focus:outline-none text-sm sm:text-base text-navy-950 font-medium shadow-inner" />',
      '      <button type="button" onclick="window.runSiteSearch()" class="absolute right-2 px-3.5 py-1.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-gold-300 font-bold text-xs cursor-pointer transition-colors">Buscar</button>',
      '    </div>',
      '    <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">',
      '      <span class="text-slate-500 font-semibold">Temas rápidos:</span>',
      '      <button type="button" onclick="window.quickSiteSearch(\'Reforma Militar\')" class="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-gold-100 text-navy-950 border border-gold-300/70 font-semibold cursor-pointer transition-colors">🎖️ Reforma Militar</button>',
      '      <button type="button" onclick="window.quickSiteSearch(\'INSS Negado\')" class="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-gold-100 text-navy-950 border border-gold-300/70 font-semibold cursor-pointer transition-colors">🏛️ INSS / Auxílio</button>',
      '      <button type="button" onclick="window.quickSiteSearch(\'Rescisão Trabalhista\')" class="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-gold-100 text-navy-950 border border-gold-300/70 font-semibold cursor-pointer transition-colors">👷 Rescisão CLT</button>',
      '      <button type="button" onclick="window.quickSiteSearch(\'Divórcio e Pensão\')" class="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-gold-100 text-navy-950 border border-gold-300/70 font-semibold cursor-pointer transition-colors">👨‍👩‍👧 Divórcio & Pensão</button>',
      '      <button type="button" onclick="window.quickSiteSearch(\'CNH Bafômetro\')" class="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-gold-100 text-navy-950 border border-gold-300/70 font-semibold cursor-pointer transition-colors">🚗 Multa / CNH</button>',
      '    </div>',
      '  </div>',
      '  <div id="site-search-results" class="p-4 sm:p-5 max-h-[60vh] overflow-y-auto space-y-3 bg-slate-50/60"></div>',
      '  <div class="px-4 sm:px-5 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">',
      '    <button type="button" onclick="window.searchSiteOnGoogle()" class="text-slate-600 hover:text-navy-950 font-semibold flex items-center space-x-1.5 cursor-pointer">',
      '      <span>🔎</span>',
      '      <span>Pesquisar no índice Google exclusivo deste site (<code class="text-[10px] bg-slate-100 px-1 py-0.5 rounded">site:jorgealvimadvocacia.com.br</code>)</span>',
      '    </button>',
      '    <a id="site-search-wa-direct" href="https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent('Olá, Dr. Jorge Alvim! Estava pesquisando no site e gostaria de uma orientação jurídica.') + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-colors">',
      '      <span>📲 Falar com Dr. Jorge no WhatsApp</span>',
      '    </a>',
      '  </div>',
      '</div>'
    ].join('\n');

    modal.addEventListener('click', function () {
      window.closeSiteSearchModal();
    });

    document.body.appendChild(modal);

    var input = document.getElementById('site-search-input');
    if (input) {
      input.addEventListener('input', function () {
        window.runSiteSearch();
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          window.closeSiteSearchModal();
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          window.runSiteSearch();
        }
      });
    }

    return modal;
  }

  window.openSiteSearchModal = async function (initialQuery) {
    var modal = ensurePublicSearchModal();
    modal.classList.remove('hidden');
    var input = document.getElementById('site-search-input');
    if (input) {
      if (typeof initialQuery === 'string' && initialQuery.trim()) {
        input.value = initialQuery.trim();
      }
      setTimeout(function () {
        input.focus();
      }, 40);
    }
    loadBlogPostsForSearch().then(function () {
      window.runSiteSearch();
    });
    window.runSiteSearch();
  };

  window.closeSiteSearchModal = function () {
    var modal = document.getElementById('site-search-modal');
    if (modal) modal.classList.add('hidden');
  };

  window.quickSiteSearch = function (term) {
    var input = document.getElementById('site-search-input');
    if (input) input.value = term;
    window.runSiteSearch();
  };

  window.searchSiteOnGoogle = function () {
    var input = document.getElementById('site-search-input');
    var q = (input && input.value ? input.value : '').trim();
    var query = 'site:' + SITE_DOMAIN + (q ? ' ' + q : '');
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
  };

  window.runSiteSearch = function () {
    var container = document.getElementById('site-search-results');
    var input = document.getElementById('site-search-input');
    var waDirect = document.getElementById('site-search-wa-direct');
    if (!container) return;

    var rawQuery = (input && input.value ? input.value : '').trim();
    var qNorm = normalizeText(rawQuery);
    var terms = qNorm.split(/\s+/).filter(Boolean);

    if (waDirect) {
      var msg = rawQuery
        ? 'Olá, Dr. Jorge Alvim! Pesquisei sobre "' + rawQuery + '" no site e gostaria de uma orientação jurídica.'
        : 'Olá, Dr. Jorge Alvim! Estava pesquisando no site e gostaria de uma orientação jurídica.';
      waDirect.href = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(msg);
    }

    var allItems = buildStaticIndex().concat(cachedBlogPosts || []);
    var scored = [];

    for (var i = 0; i < allItems.length; i++) {
      var item = allItems[i];
      if (!terms.length) {
        if (item.type === 'area' || item.type === 'blog') {
          scored.push({ item: item, score: 1 });
        }
        continue;
      }
      var hayTitle = normalizeText(item.title);
      var hayFull = normalizeText(item.title + ' ' + item.summary + ' ' + (item.keywords || ''));
      var score = 0;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        if (hayTitle.indexOf(term) !== -1) score += 5;
        else if (hayFull.indexOf(term) !== -1) score += 2;
      }
      if (score > 0) {
        scored.push({ item: item, score: score });
      }
    }

    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    var top = scored.slice(0, 8);
    if (!top.length) {
      var waCustom = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent('Olá, Dr. Jorge Alvim! Tenho uma dúvida sobre "' + rawQuery + '" e gostaria de orientação jurídica.');
      container.innerHTML = [
        '<div class="p-5 rounded-2xl bg-white border border-slate-200 text-center space-y-3">',
        '  <div class="text-2xl">⚖️</div>',
        '  <div class="font-bold text-navy-950 text-sm">Não encontramos um artigo exato para "' + escapeHtml(rawQuery) + '", mas o Dr. Jorge Alvim pode analisar seu caso diretamente!</div>',
        '  <p class="text-xs text-slate-600 max-w-md mx-auto">Envie sua dúvida no WhatsApp do escritório ou pesquise no índice completo do site.</p>',
        '  <div class="flex flex-wrap items-center justify-center gap-2 pt-1">',
        '    <a href="' + waCustom + '" target="_blank" rel="noopener noreferrer" class="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm">📲 Perguntar ao Dr. Jorge sobre "' + escapeHtml(rawQuery.slice(0, 35)) + '"</a>',
        '    <button type="button" onclick="window.searchSiteOnGoogle()" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs cursor-pointer">🔎 Buscar no Google do Site</button>',
        '  </div>',
        '</div>'
      ].join('\n');
      return;
    }

    container.innerHTML = top.map(function (entry) {
      var it = entry.item;
      var waLink = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent('Olá, Dr. Jorge Alvim! Vi no site sobre "' + it.waTopic + '" e gostaria de uma orientação jurídica.');
      var isHash = it.href.charAt(0) === '#';
      var clickAttr = isHash ? 'onclick="window.closeSiteSearchModal()"' : '';
      return [
        '<div class="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-gold-400 shadow-2xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">',
        '  <div class="space-y-1 min-w-0 flex-1">',
        '    <div class="flex items-center space-x-2">',
        '      <span class="px-2 py-0.5 rounded-md bg-amber-50 border border-gold-300/60 text-[10px] font-extrabold text-gold-800 uppercase tracking-wider">' + escapeHtml(it.badge) + '</span>',
        '    </div>',
        '    <a href="' + escapeHtml(it.href) + '" ' + clickAttr + ' class="block font-bold text-navy-950 hover:text-gold-700 text-sm sm:text-[15px] leading-snug">' + escapeHtml(it.title) + '</a>',
        '    <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed">' + escapeHtml(it.summary) + '</p>',
        '  </div>',
        '  <div class="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0">',
        '    <a href="' + escapeHtml(it.href) + '" ' + clickAttr + ' class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-gold-50 text-navy-950 font-bold text-xs border border-slate-300/80 whitespace-nowrap transition-colors">Ver no site →</a>',
        '    <a href="' + waLink + '" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-[11px] border border-emerald-300/80 whitespace-nowrap transition-colors">📲 Tirar dúvida</a>',
        '  </div>',
        '</div>'
      ].join('\n');
    }).join('\n');
  };

  // ---------------------------------------------------------------------------
  //  2. BARRA DE PESQUISA GOOGLE & JURÍDICA DO PAINEL (painel.html)
  // ---------------------------------------------------------------------------
  window.handlePanelGoogleSearch = function (ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    var input = document.getElementById('panel-google-search-input');
    var engineSel = document.getElementById('panel-google-search-engine');
    if (!input) return false;

    var q = (input.value || '').trim();
    if (!q) {
      input.focus();
      return false;
    }

    var engine = engineSel ? engineSel.value : 'google';
    var url = 'https://www.google.com/search?q=' + encodeURIComponent(q);

    if (engine === 'juridico') {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(q + ' (site:stj.jus.br OR site:stf.jus.br OR site:tjmg.jus.br OR site:tst.jus.br OR site:jusbrasil.com.br)');
    } else if (engine === 'planalto') {
      url = 'https://www.google.com/search?q=' + encodeURIComponent('site:planalto.gov.br ' + q);
    } else if (engine === 'tjmg') {
      url = 'https://www.google.com/search?q=' + encodeURIComponent('site:tjmg.jus.br ' + q);
    } else if (engine === 'militar') {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(q + ' (site:planalto.gov.br OR site:stm.jus.br OR "Lei 6.880" OR "Forças Armadas")');
    } else if (engine === 'scholar') {
      url = 'https://scholar.google.com.br/scholar?hl=pt-BR&q=' + encodeURIComponent(q);
    } else if (engine === 'meu_site') {
      url = 'https://www.google.com/search?q=' + encodeURIComponent('site:' + SITE_DOMAIN + ' ' + q);
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  };

  // Auto-abertura se a página pública for chamada com ?q=termo (Schema.org SearchAction)
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var params = new URLSearchParams(window.location.search);
      var q = params.get('q') || params.get('busca');
      if (q && document.getElementById('main-header')) {
        window.openSiteSearchModal(q);
      }
    } catch (_) {}
  });
})();
