'use strict';

/**
 * Queries agregadas para os dashboards financeiros.
 *
 * Importante sobre "faturamento": no split 1:1 o valor líquido do autor cai
 * DIRETO na conta Mercado Pago dele; a plataforma NÃO custodia esse dinheiro.
 * Portanto estes números são o nosso REGISTRO/EXTRATO (fonte: order_items),
 * não o saldo do MP (a API de saldo é bloqueada para marketplace). Servem para
 * conciliação e relatórios; o saque é feito pelo autor no app do MP.
 *
 * Exporta funções que retornam objetos prontos para a view.
 */

const { db } = require('../db');

const BRL = (cents) => (cents / 100);

// ---- Visão do AUTOR ----
function authorSummary(authorId) {
  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT oi.order_id)                 AS pedidos,
      COUNT(oi.id)                                AS itens_vendidos,
      COALESCE(SUM(oi.price_cents), 0)            AS bruto_cents,
      COALESCE(SUM(oi.platform_fee_cents), 0)     AS comissao_cents,
      COALESCE(SUM(oi.author_net_cents), 0)       AS liquido_cents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.author_id = ? AND o.status = 'paid'
  `).get(authorId);

  const porProduto = db.prepare(`
    SELECT p.title,
           COUNT(oi.id)                         AS vendas,
           COALESCE(SUM(oi.author_net_cents),0) AS liquido_cents,
           p.downloads_count
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'paid'
    WHERE p.author_id = ?
    GROUP BY p.id
    ORDER BY vendas DESC
  `).all(authorId);

  // Série mensal (últimos 12 meses) para o gráfico
  const mensal = db.prepare(`
    SELECT strftime('%Y-%m', o.paid_at)            AS mes,
           COALESCE(SUM(oi.author_net_cents),0)    AS liquido_cents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.author_id = ? AND o.status = 'paid'
    GROUP BY mes ORDER BY mes DESC LIMIT 12
  `).all(authorId);

  return { totals: fmt(totals), porProduto: porProduto.map(fmtRow), mensal };
}

// ---- Visão da PLATAFORMA (admin) ----
function platformSummary() {
  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT o.id)                        AS pedidos_pagos,
      COALESCE(SUM(oi.price_cents),0)             AS gmv_cents,          -- volume total transacionado
      COALESCE(SUM(oi.platform_fee_cents),0)      AS lucro_comissao_cents,
      COALESCE(SUM(oi.author_net_cents),0)        AS repassado_autores_cents
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status = 'paid'
  `).get();

  const porAutor = db.prepare(`
    SELECT u.name AS autor,
           COUNT(oi.id)                           AS vendas,
           COALESCE(SUM(oi.platform_fee_cents),0) AS comissao_cents,
           COALESCE(SUM(oi.author_net_cents),0)   AS repasse_cents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.status='paid'
    JOIN users u ON u.id = oi.author_id
    GROUP BY u.id ORDER BY comissao_cents DESC
  `).all();

  const mensal = db.prepare(`
    SELECT strftime('%Y-%m', o.paid_at)           AS mes,
           COALESCE(SUM(oi.platform_fee_cents),0) AS lucro_cents,
           COALESCE(SUM(oi.price_cents),0)        AS gmv_cents
    FROM orders o JOIN order_items oi ON oi.order_id=o.id
    WHERE o.status='paid'
    GROUP BY mes ORDER BY mes DESC LIMIT 12
  `).all();

  return { totals: fmt(totals), porAutor: porAutor.map(fmtRow), mensal };
}

function fmt(row) {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (k.endsWith('_cents')) out[k.replace('_cents', '_brl')] = BRL(out[k]);
  }
  return out;
}
function fmtRow(row) { return fmt(row); }

module.exports = { authorSummary, platformSummary };
