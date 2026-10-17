/**
 * Aba "Portal de Notícias" (painel) — MASTER_ONLY.
 *
 * Em vez de duplicar a Central de Comando do Portal (~800 linhas de
 * portal-revisar.html), esta aba EMBUTE a página existente por um iframe
 * same-origin (/portal/revisar). Como o iframe é da mesma origem, ele
 * compartilha o localStorage do painel (token 'ja_admin_token') e autentica
 * sozinho; o servidor permite o enquadramento (X-Frame-Options: SAMEORIGIN,
 * CSP frame-ancestors 'self').
 *
 * O carregamento é SOB DEMANDA: o iframe só ganha src na primeira vez que a
 * aba é aberta, para não chamar as rotas do portal a cada abertura do painel.
 * Enquanto a aba Blog & Moderação não for desativada, as duas convivem.
 */
(function () {
  'use strict';

  var PORTAL_URL = '/portal/revisar';
  var montado = false;

  function loadPortalTab() {
    var box = document.getElementById('portal-tab-container');
    if (!box || montado) return;
    montado = true;

    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
      + '<div>'
      + '<h2 style="margin:0;font-size:1.05rem;font-weight:800;color:#0A192F">📰 Central de Comando do Portal de Notícias</h2>'
      + '<p style="margin:2px 0 0;font-size:.82rem;color:#64748b">Esteira do robô, revisão e publicação. Área exclusiva do titular.</p>'
      + '</div>'
      + '<a href="' + PORTAL_URL + '" target="_blank" rel="noopener" '
      + 'style="font-size:.8rem;font-weight:700;color:#047857;border:1px solid #6ee7b7;background:#ecfdf5;padding:6px 12px;border-radius:999px;text-decoration:none;white-space:nowrap">Abrir em nova aba ↗</a>'
      + '</div>'
      + '<iframe id="portal-tab-frame" title="Central de Comando do Portal de Notícias" '
      + 'src="' + PORTAL_URL + '" '
      + 'style="width:100%;height:82vh;min-height:560px;border:1px solid #e2e8f0;border-radius:14px;background:#fff" '
      + 'loading="lazy"></iframe>';
  }

  // Exposto para painel-1-app.js (switchTab) e painel-3.js (LOADERS).
  window.loadPortalTab = loadPortalTab;
})();
