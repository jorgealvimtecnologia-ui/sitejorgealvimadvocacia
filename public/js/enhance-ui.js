/* ============================================================
   Enhance UI — micro-interações compartilhadas
   ------------------------------------------------------------
   - Scroll reveal automático (sem tocar no HTML): marca seções e
     cards com .ja-reveal e revela ao entrar na viewport.
   - À PROVA DE FALHA: o conteúdo só é escondido depois que o JS
     confirma suporte (html.ja-anim-ready). Se algo falhar OU se o
     usuário prefere menos movimento, NADA fica oculto.
   Zero dependências.
   ============================================================ */
(function () {
  'use strict';

  var HTML = document.documentElement;

  function revealAll() {
    document.querySelectorAll('.ja-reveal').forEach(function (el) {
      el.classList.add('ja-reveal--in');
    });
  }

  // Elementos que NÃO devem ser animados (quebrariam layout/posição).
  function isSafeTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (/^(SCRIPT|STYLE|LINK|BR|TEMPLATE|NOSCRIPT)$/.test(tag)) return false;
    var pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky') return false;
    if (el.classList.contains('ja-reveal')) return false;
    return true;
  }

  // Marca automaticamente blocos de conteúdo para revelar.
  function tagTargets() {
    var count = 0;
    // 1) Filhos diretos de cada <section>
    document.querySelectorAll('section').forEach(function (section) {
      var kids = section.children, idx = 0;
      for (var i = 0; i < kids.length; i++) {
        if (!isSafeTarget(kids[i])) continue;
        kids[i].classList.add('ja-reveal');
        kids[i].style.transitionDelay = Math.min(idx * 80, 400) + 'ms';
        idx++; count++;
      }
    });
    // 2) Cards soltos (com sombra da marca) ainda não marcados
    document.querySelectorAll('.shadow-card-light, .shadow-card-hover').forEach(function (card) {
      if (isSafeTarget(card)) {
        card.classList.add('ja-reveal');
        count++;
      }
    });
    return count;
  }

  function initReveal() {
    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Sem IntersectionObserver ou com movimento reduzido: não esconde nada.
    if (reduce || !('IntersectionObserver' in window)) {
      return;
    }

    var n = tagTargets();
    if (!n) return;

    // A partir daqui o CSS pode esconder (.ja-reveal) — só agora, com JS OK.
    HTML.classList.add('ja-anim-ready');

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('ja-reveal--in');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.ja-reveal').forEach(function (el) {
      observer.observe(el);
    });

    // Rede de segurança: revela tudo após 2,5s, aconteça o que acontecer.
    setTimeout(revealAll, 2500);
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initReveal);
    } else {
      initReveal();
    }
  } catch (e) {
    // Em qualquer erro, nunca deixar conteúdo escondido.
    try { HTML.classList.remove('ja-anim-ready'); } catch (_) {}
    revealAll();
  }
})();
