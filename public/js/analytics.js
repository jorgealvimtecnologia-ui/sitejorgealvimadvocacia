/* ============================================================================
 * ANALYTICS ANÔNIMO & CONSENTIDO (LGPD) — Jorge Alvim Advocacia
 * - Só rastreia DEPOIS que o visitante aceita no banner de cookies.
 * - Não coleta nome, CPF, e-mail nem IP. Usa um id pseudônimo de navegador.
 * - Rastreia eventos-chave por seletor (sem editar cada botão do site).
 * Exposto como window.jaAnalytics: .init(), .grant(), .deny().
 * ==========================================================================*/
(function () {
  'use strict';
  var CONSENT_KEY = 'ja_lgpd_consent';      // 'accepted' | 'essential' (compat. com o banner existente)
  var SID_KEY = 'ja_anon_sid';              // id pseudônimo, não vinculado à identidade
  var started = false;

  function consent() { try { return sessionStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }
  function granted() { return consent() === 'accepted'; }

  function sid() {
    try {
      var s = localStorage.getItem(SID_KEY);
      if (!s) {
        s = (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
             : 'sid-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(SID_KEY, s);
      }
      return s;
    } catch (e) { return 'anon'; }
  }

  function utm(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }

  function send(eventName, label) {
    if (!granted()) return;
    try {
      var payload = {
        session_key: sid(),
        event_name: eventName,
        label: label ? String(label).slice(0, 120) : null,
        path: location.pathname,
        referer: document.referrer || '',
        utm_source: utm('utm_source'),
        utm_campaign: utm('utm_campaign')
      };
      // sendBeacon é mais confiável (não bloqueia navegação em cliques que abrem nova aba)
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/event', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/analytics/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
      }
    } catch (e) { /* silencioso */ }
  }

  // Classifica o clique com base no elemento/destino — rótulos NÃO identificáveis.
  function classifyClick(el) {
    var a = el.closest ? el.closest('a,button') : null;
    if (!a) return null;
    var href = (a.getAttribute && (a.getAttribute('href') || '')) || '';
    var text = (a.textContent || '').trim().slice(0, 60);

    if (/wa\.me|whatsapp|api\.whatsapp/i.test(href)) return { ev: 'click_whatsapp', label: 'WhatsApp' };
    if (/^tel:/i.test(href)) return { ev: 'click_phone', label: 'Telefone' };
    if (/\/cliente|area-do-cliente|portal-cliente/i.test(href)) return { ev: 'click_client_area', label: 'Área do Cliente' };
    if (a.getAttribute && /openAdminLoginModal/.test(a.getAttribute('onclick') || '')) return { ev: 'click_panel', label: 'Painel' };
    if (/\/blog|\/artigos/i.test(href)) return { ev: 'click_blog', label: 'Blog' };
    // Cards de área de atuação e CTAs internos "#contato/#areas"
    if (/#contato|#areas/i.test(href) || (a.closest && a.closest('#areas'))) return { ev: 'click_area', label: text || 'Área de atuação' };
    return null;
  }

  var deepFired = false;
  function onScroll() {
    if (deepFired) return;
    var h = document.documentElement;
    var scrolled = (h.scrollTop + window.innerHeight) / (h.scrollHeight || 1);
    if (scrolled >= 0.7) { deepFired = true; send('scroll_deep', '70%'); window.removeEventListener('scroll', onScroll); }
  }

  function attach() {
    if (started) return;
    started = true;

    send('page_view', location.pathname);

    document.addEventListener('click', function (e) {
      try {
        var info = classifyClick(e.target);
        if (info) send(info.ev, info.label);
      } catch (err) { /* silencioso */ }
    }, true);

    // Formulário de contato: início (primeiro foco) e envio.
    var form = document.getElementById('contact-form');
    if (form) {
      var startFired = false;
      form.addEventListener('focusin', function () { if (!startFired) { startFired = true; send('form_start', 'contato'); } });
      form.addEventListener('submit', function () { send('form_submit', 'contato'); });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  window.jaAnalytics = {
    // Chamada no load: se já houve consentimento, começa; se não, aguarda o banner.
    init: function () { if (granted()) attach(); },
    // Chamada pelo botão "Aceitar" do banner.
    grant: function () {
      try { sessionStorage.setItem(CONSENT_KEY, 'accepted'); } catch (e) {}
      recordConsent(true);
      attach();
    },
    // Chamada pelo botão "Apenas Essenciais".
    deny: function () {
      try { sessionStorage.setItem(CONSENT_KEY, 'essential'); } catch (e) {}
      recordConsent(false);
    }
  };

  function recordConsent(isGranted) {
    try {
      var body = JSON.stringify({ granted: isGranted, session_key: sid() });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/analytics/consent', new Blob([body], { type: 'application/json' }));
      else fetch('/api/analytics/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    } catch (e) { /* silencioso */ }
  }

  if (document.readyState !== 'loading') window.jaAnalytics.init();
  else document.addEventListener('DOMContentLoaded', window.jaAnalytics.init);
})();
