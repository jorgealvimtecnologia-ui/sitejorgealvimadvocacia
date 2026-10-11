/**
 * Origem do visitante (AUD-17): guarda, só durante a visita (sessionStorage), de onde ele veio —
 * parâmetros UTM e o DOMÍNIO de quem indicou — para o formulário de contato e o agendamento enviarem junto.
 * Nada é gravado em cookie e a URL completa de referência nunca é guardada.
 */
(function () {
  'use strict';
  var KEY = 'ja_origem';

  function host(u) {
    try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch (e) { return ''; }
  }

  function capture() {
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { stored = null; }
    if (stored) return stored;                       // primeiro toque da visita vale
    var q = new URLSearchParams(location.search);
    var data = {
      utm_source: (q.get('utm_source') || '').slice(0, 80),
      utm_medium: (q.get('utm_medium') || '').slice(0, 80),
      utm_campaign: (q.get('utm_campaign') || '').slice(0, 80),
      referrer: host(document.referrer)
    };
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* navegação privada: segue sem guardar */ }
    return data;
  }

  var current = capture();
  window.JAAttribution = {
    get: function () { return current; },
    /** Acrescenta os campos a um FormData (formulário de contato). */
    appendTo: function (formData) {
      Object.keys(current).forEach(function (k) { if (current[k]) formData.append(k, current[k]); });
      return formData;
    },
    /** Acrescenta os campos a um objeto (JSON do agendamento). */
    into: function (obj) {
      Object.keys(current).forEach(function (k) { if (current[k]) obj[k] = current[k]; });
      return obj;
    }
  };
})();
