'use strict';

/**
 * Checkout com Split de Pagamentos (Pix e Cartão no mesmo endpoint).
 *
 * REGRA DO SPLIT 1:1: um pagamento = um vendedor (autor). Como o /payments é
 * criado com o access_token de UM autor, um carrinho com produtos de autores
 * diferentes deve virar UM PEDIDO (e um pagamento) POR AUTOR. Aqui tratamos um
 * checkout de itens do MESMO autor. O front agrupa o carrinho por autor e chama
 * este endpoint uma vez por grupo.
 *
 * Cartão: o front usa o Brick do Mercado Pago e envia apenas o `token`
 * (+ installments, payment_method_id, issuer_id). O número do cartão NUNCA
 * passa pelo nosso servidor (conformidade PCI).
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { db } = require('../db');
const cfg = require('../config');
const mp = require('../services/mercadopago');

function feePercentFor(/* product, author */) {
  // Ponto de extensão: comissão por autor/produto. Por ora, padrão global.
  return cfg.platform.defaultFeePercent;
}

router.post('/', express.json(), async (req, res) => {
  try {
    const { productIds, customer, method, card } = req.body;
    // customer = { name, email, cpf }
    // method   = 'pix' | 'credit_card'
    // card     = { token, installments, payment_method_id, issuer_id }  (se cartão)

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum produto informado.' });
    }
    if (!customer?.email || !customer?.cpf || !customer?.name) {
      return res.status(400).json({ error: 'Dados do comprador incompletos.' });
    }
    if (!['pix', 'credit_card'].includes(method)) {
      return res.status(400).json({ error: 'Método de pagamento inválido.' });
    }

    // Carrega produtos aprovados/publicados
    const placeholders = productIds.map(() => '?').join(',');
    const products = db.prepare(
      `SELECT * FROM products WHERE id IN (${placeholders})
         AND status='approved' AND published=1`
    ).all(...productIds);

    if (products.length !== productIds.length) {
      return res.status(400).json({ error: 'Produto indisponível no catálogo.' });
    }

    // Garante autor único (split 1:1)
    const authorIds = [...new Set(products.map((p) => p.author_id))];
    if (authorIds.length > 1) {
      return res.status(400).json({
        error: 'Itens de autores diferentes: finalize um pedido por autor.',
      });
    }
    const authorId = authorIds[0];

    // Token válido do autor (renova se preciso)
    const { accessToken } = await mp.getValidAccessTokenForAuthor(authorId);

    // Monta os valores do split
    const items = products.map((p) => {
      const pct = feePercentFor(p, authorId);
      const feeCents = Math.round(p.price_cents * (pct / 100));
      return {
        product: p,
        price_cents: p.price_cents,
        platform_fee_percent: pct,
        platform_fee_cents: feeCents,
        author_net_cents: p.price_cents - feeCents,
      };
    });
    const totalCents = items.reduce((s, i) => s + i.price_cents, 0);
    const totalFeeCents = items.reduce((s, i) => s + i.platform_fee_cents, 0);
    const uuid = crypto.randomUUID();

    // Cria pedido + itens (pending) numa transação
    const orderId = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO orders (uuid, customer_name, customer_email, customer_cpf,
                            total_cents, payment_method, status)
        VALUES (@uuid, @name, @email, @cpf, @total, @method, 'pending')
      `).run({
        uuid, name: customer.name, email: customer.email,
        cpf: String(customer.cpf).replace(/\D/g, ''),
        total: totalCents, method,
      });
      const oid = info.lastInsertRowid;
      const ins = db.prepare(`
        INSERT INTO order_items
          (order_id, product_id, author_id, price_cents,
           platform_fee_percent, platform_fee_cents, author_net_cents)
        VALUES (@order_id,@product_id,@author_id,@price,@pct,@fee,@net)
      `);
      for (const i of items) {
        ins.run({
          order_id: oid, product_id: i.product.id, author_id: authorId,
          price: i.price_cents, pct: i.platform_fee_percent,
          fee: i.platform_fee_cents, net: i.author_net_cents,
        });
      }
      return oid;
    })();

    // Cria o pagamento no MP com split
    const payment = await mp.createSplitPayment({
      sellerAccessToken: accessToken,
      transactionAmount: totalCents / 100,
      applicationFee: totalFeeCents / 100,
      description: items.map((i) => i.product.title).join(' + ').slice(0, 250),
      externalReference: uuid,
      payer: {
        email: customer.email,
        identification: { type: 'CPF', number: String(customer.cpf).replace(/\D/g, '') },
      },
      method,
      cardToken: card?.token,
      installments: card?.installments,
      paymentMethodId: card?.payment_method_id,
      issuerId: card?.issuer_id,
    });

    // Persiste ids do MP no pedido e nos itens
    db.transaction(() => {
      db.prepare(`UPDATE orders SET mp_payment_id=?, mp_status=?, mp_status_detail=?,
                  updated_at=datetime('now') WHERE id=?`)
        .run(String(payment.id), payment.status, payment.status_detail || null, orderId);
      db.prepare(`UPDATE order_items SET mp_payment_id=? WHERE order_id=?`)
        .run(String(payment.id), orderId);
    })();

    // Resposta para o front renderizar
    if (method === 'pix') {
      const tx = payment.point_of_interaction?.transaction_data || {};
      return res.json({
        orderUuid: uuid,
        status: payment.status, // normalmente 'pending'
        pix: {
          qr_code: tx.qr_code,               // copia e cola
          qr_code_base64: tx.qr_code_base64, // imagem base64
          ticket_url: tx.ticket_url,
        },
      });
    }
    // Cartão: pode vir 'approved' na hora; a confirmação oficial é via webhook.
    return res.json({
      orderUuid: uuid,
      status: payment.status,            // approved | in_process | rejected
      status_detail: payment.status_detail,
    });
  } catch (err) {
    console.error('[checkout]', err);
    res.status(500).json({ error: 'Falha ao processar o checkout.' });
  }
});

// Polling simples do status do pedido (o front consulta até ficar 'paid')
router.get('/status/:uuid', (req, res) => {
  const o = db.prepare('SELECT status, mp_status FROM orders WHERE uuid=?').get(req.params.uuid);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json(o);
});

module.exports = router;
