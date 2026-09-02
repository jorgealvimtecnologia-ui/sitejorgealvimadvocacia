/* ============================================================
   Enhance UI — micro-interações compartilhadas
   ------------------------------------------------------------
   - Scroll reveal opt-in via classe .ja-reveal (IntersectionObserver)
   - Fallback seguro: se algo falhar, o conteúdo NUNCA fica oculto.
   Zero dependências.
   ============================================================ */
(function () {
  'use strict';

  function revealAll() {
    document.querySelectorAll('.ja-reveal').forEach(function (el) {
      el.classList.add('ja-reveal--in');
    });
  }

  function initReveal() {
    var els = document.querySelectorAll('.ja-reveal');
    if (!els.length) return;

    // Fallback: sem suporte a IntersectionObserver, revela tudo.
    if (!('IntersectionObserver' in window)) {
      revealAll();
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('ja-reveal--in');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach(function (el) {
      observer.observe(el);
    });

    // Rede de segurança: garante revelação após 3s, aconteça o que acontecer.
    setTimeout(revealAll, 3000);
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initReveal);
    } else {
      initReveal();
    }
  } catch (e) {
    // Em qualquer erro, nunca deixar conteúdo escondido.
    revealAll();
  }
})();
