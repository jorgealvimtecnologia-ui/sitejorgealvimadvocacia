/**
 * Lógica compartilhada do design system (AUD-18): a COR de um prazo sai da urgência, em um só lugar.
 * Usado pelo catálogo e disponível para qualquer tela (window.DS). Testado em tests/design-system.test.js.
 */
(function (root) {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Dias de hoje até a data (YYYY-MM-DD). Negativo = já venceu. null se a data for inválida. */
  function daysUntil(dateStr, today) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    var t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today || todayStr());
    if (!m || !t) return null;
    var a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var b = Date.UTC(+t[1], +t[2] - 1, +t[3]);
    return Math.round((a - b) / 86400000);
  }

  /** ok (mais de 7 dias) · soon (4 a 7) · urgent (1 a 3) · fatal (hoje ou vencido). */
  function deadlineTone(days) {
    if (days == null) return 'ok';
    if (days <= 0) return 'fatal';
    if (days <= 3) return 'urgent';
    if (days <= 7) return 'soon';
    return 'ok';
  }

  function deadlineLabel(days) {
    if (days == null) return 'Sem prazo';
    if (days < 0) return 'Vencido há ' + Math.abs(days) + (Math.abs(days) === 1 ? ' dia' : ' dias');
    if (days === 0) return 'Vence hoje';
    if (days === 1) return 'Vence amanhã';
    return 'Vence em ' + days + ' dias';
  }

  /** HTML do selo (texto escapado). */
  function deadlineBadge(dateStr, today) {
    var days = daysUntil(dateStr, today);
    var label = deadlineLabel(days).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    return '<span class="ds-deadline ds-deadline--' + deadlineTone(days) + '">' + label + '</span>';
  }

  root.DS = { daysUntil: daysUntil, deadlineTone: deadlineTone, deadlineLabel: deadlineLabel, deadlineBadge: deadlineBadge, todayStr: todayStr };
})(typeof window !== 'undefined' ? window : globalThis);
