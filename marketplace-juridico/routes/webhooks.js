'use strict';

/**
 * Webhook do Mercado Pago (/webhooks/mercadopago).
 *
 * Boas práticas aplicadas:
 *  - Valida a assinatura x-signature (HMAC) antes de confiar no evento.
 *  - Idempotência: registra o evento; se já processado, ignora (não gera token 2x).
 *  - NÃO confia no corpo para o status; RECONSULTA o pagamento na API do MP
 *    (com o token do autor) para obter o status real.
 *  - Responde 200 rápido; o MP reenvia em caso de erro.
 *
 * ATENÇÃO: este router precisa do corpo BRUTO para a assinatura. Em app.js,
 * monte-o ANTES de express.json() global, usando express.raw aqui.
 */

const express = require('express');
const router = express.Router();

const { db } = require('../db');
const mp = require('../services/mercadopago');
const vault = require('../lib/crypto');
const tokens = require('../services/downloadTokens');

router.post('/mercadopago',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    try {
      const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '{}';
      const payload = safeJson(raw);

      // data.id vem no corpo e/ou querystring (?data.id=&type=)
      const dataId = payload?.data?.id || req.query['data.id'] || req.query.id;
      const type = payload?.type || req.query.type;

      // 1) Assinatura
      const ok = mp.verifyWebhookSignature({
        xSignature: req.get('x-signature'),
        xRequestId: req.get('x-request-id'),
        dataId,
      });
      if (!ok) {
        console.warn('[webhook] assinatura inválida');
        return res.sendStatus(401);
      }

      // Só nos interessam notificações de pagamento
      if (type !== 'payment' || !dataId) return res.sendStatus(200);

      // 2) Idempotência: registra; se já existe, encerra
      const eventId = req.get('x-request-id') || `${dataId}:${Date.now()}`;
      try {
        db.prepare(`INSERT INTO webhook_events (mp_event_id, mp_payment_id, type, raw)
                    VALUES (?,?,?,?)`).run(eventId, String(dataId), type, raw);
      } catch (_) {
        return res.sendStatus(200); // UNIQUE violado = evento repetido
      }

      // 3) Localiza o pedido pelo mp_payment_id (gravado no checkout)
      const order = db.prepare(
        'SELECT * FROM orders WHERE mp_payment_id = ?'
      ).get(String(dataId));
      if (!order) {
        // Pagamento ainda não vinculado; responde 200 e deixa o MP reenviar.
        return res.sendStatus(200);
      }

      // 4) Reconsulta status real usando o token do autor do pedido
      const item = db.prepare(
        'SELECT author_id FROM order_items WHERE order_id = ? LIMIT 1'
      ).get(order.id);
      const { accessToken } = await mp.getValidAccessTokenForAuthor(item.author_id);
      const payment = await mp.getPayment(dataId, accessToken);

      const newStatus = mapStatus(payment.status);
      processPayment(order, payment, newStatus);

      db.prepare('UPDATE webhook_events SET processed=1 WHERE mp_event_id=?').run(eventId);
      return res.sendStatus(200);
    } catch (err) {
      console.error('[webhook] erro', err);
      // 500 faz o MP reenviar — desejável em erro transitório
      return res.sendStatus(500);
    }
  });

function processPayment(order, payment, newStatus) {
  db.transaction(() => {
    db.prepare(`
      UPDATE orders SET status=@status, mp_status=@mp, mp_status_detail=@detail,
        paid_at=CASE WHEN @status='paid' AND paid_at IS NULL THEN datetime('now') ELSE paid_at END,
        updated_at=datetime('now')
      WHERE id=@id
    `).run({
      id: order.id, status: newStatus,
      mp: payment.status, detail: payment.status_detail || null,
    });

    // Ao aprovar: gera tokens de download (idempotente) e conta downloads
    if (newStatus === 'paid') {
      tokens.createTokensForOrder(order.id);
    }
  })();
}

function mapStatus(mpStatus) {
  switch (mpStatus) {
    case 'approved': return 'paid';
    case 'refunded':
    case 'charged_back': return 'refunded';
    case 'cancelled': return 'cancelled';
    case 'rejected': return 'rejected';
    default: return 'pending'; // in_process, pending, authorized...
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

module.exports = router;
