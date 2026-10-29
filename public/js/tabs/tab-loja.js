/**
 * Aba "Loja (Marketplace)" (painel) — MASTER_ONLY.
 *
 * A loja (venda de monografias/artigos em PDF com split do Mercado Pago) é um
 * sub-app montado em /loja. Esta aba é a visão do titular:
 *   - Enquanto a loja NÃO está pronta (pagamentos desligados), mostra o cartão de
 *     pendências — o que falta ligar (conta Mercado Pago, segredos, pasta privada).
 *   - Quando estiver pronta, EMBUTE a moderação (/loja/painel/admin/moderacao) por
 *     um iframe same-origin, igual à aba Portal de Notícias.
 *
 * Carregamento SOB DEMANDA: só busca o status na primeira abertura da aba.
 */
(function () {
  'use strict';

  var montado = false;

  function headers() {
    try { return typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}; }
    catch (e) { return {}; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function cabecalho() {
    return ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
      + '<div>'
      + '<h2 style="margin:0;font-size:1.05rem;font-weight:800;color:#0A192F">🛒 Loja — Marketplace Jurídico</h2>'
      + '<p style="margin:2px 0 0;font-size:.82rem;color:#64748b">Venda de monografias e artigos em PDF com split de pagamento. Área exclusiva do titular.</p>'
      + '</div>'
      + '<a href="/loja" target="_blank" rel="noopener" '
      + 'style="font-size:.8rem;font-weight:700;color:#047857;border:1px solid #6ee7b7;background:#ecfdf5;padding:6px 12px;border-radius:999px;text-decoration:none;white-space:nowrap">Abrir vitrine ↗</a>'
      + '</div>';
  }

  function cartaoPendencias(data) {
    var itens = (data.pendencias || []).map(function (p) {
      return '<li style="margin:6px 0;padding-left:4px">' + esc(p) + '</li>';
    }).join('');
    return cabecalho()
      + '<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:14px;padding:18px 20px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '<span style="font-size:1.1rem">⏳</span>'
      + '<strong style="color:#92400e;font-size:.95rem">Loja em modo preparo — pagamentos desligados</strong>'
      + '</div>'
      + '<p style="margin:0 0 10px;font-size:.84rem;color:#78350f;line-height:1.5">'
      + 'A estrutura já está no ar e o site continua normal. Para ligar as vendas, falta:'
      + '</p>'
      + '<ul style="margin:0;padding-left:22px;font-size:.84rem;color:#78350f;list-style:disc">' + itens + '</ul>'
      + '<p style="margin:12px 0 0;font-size:.78rem;color:#a16207">Comissão padrão da plataforma: <strong>' + esc(data.comissaoPadrao) + '%</strong>. Quando tudo estiver pronto, esta aba passa a exibir a moderação dos autores e produtos.</p>'
      + '</div>';
  }

  function iframeModeracao(data) {
    var url = data.moderacaoUrl || '/loja/painel/admin/moderacao';
    return cabecalho()
      + '<iframe id="loja-tab-frame" title="Moderação da Loja (Marketplace)" '
      + 'src="' + esc(url) + '" '
      + 'style="width:100%;height:82vh;min-height:560px;border:1px solid #e2e8f0;border-radius:14px;background:#fff" '
      + 'loading="lazy"></iframe>';
  }

  // Bloco de PRÉVIA: embute o front-end nativo da loja (/loja/preview) para o
  // titular aprovar layout e rotinas — dados de exemplo, pagamento simulado.
  function blocoPreview(data) {
    var url = data.previewUrl || '/loja/preview';
    return '<div style="margin-top:18px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:16px 18px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
      + '<strong style="color:#075985;font-size:.95rem">🧪 Prévia do front-end da loja (para aprovação)</strong>'
      + '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="font-size:.8rem;font-weight:700;color:#047857;border:1px solid #6ee7b7;background:#ecfdf5;padding:6px 12px;border-radius:999px;text-decoration:none">Abrir em nova aba ↗</a>'
      + '</div>'
      + '<p style="margin:0 0 10px;font-size:.82rem;color:#075985">Dados de exemplo e pagamento simulado. Navegue por vitrine, produto, checkout, painel do autor, moderação e financeiro.</p>'
      + '<iframe title="Prévia da Loja" src="' + esc(url) + '" style="width:100%;height:78vh;min-height:560px;border:1px solid #bae6fd;border-radius:12px;background:#fff" loading="lazy"></iframe>'
      + '</div>';
  }

  function loadLojaTab() {
    var box = document.getElementById('loja-tab-container');
    if (!box || montado) return;
    montado = true;
    box.innerHTML = '<p style="font-size:.85rem;color:#64748b;padding:8px">Carregando estado da loja…</p>';

    fetch('/api/loja/status', { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.success) {
          box.innerHTML = cabecalho()
            + '<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:14px;padding:18px 20px;color:#991b1b;font-size:.85rem">Não foi possível consultar o estado da loja.</div>';
          return;
        }
        if (data.ready) { box.innerHTML = iframeModeracao(data); return; }
        box.innerHTML = cartaoPendencias(data) + (data.previewOn ? blocoPreview(data) : '');
      })
      .catch(function () {
        montado = false; // permite nova tentativa ao reabrir a aba
        box.innerHTML = cabecalho()
          + '<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:14px;padding:18px 20px;color:#991b1b;font-size:.85rem">Falha de rede ao consultar a loja. Reabra a aba para tentar de novo.</div>';
      });
  }

  // Exposto para painel-1-app.js (switchTab) e painel-3.js (LOADERS).
  window.loadLojaTab = loadLojaTab;
})();
