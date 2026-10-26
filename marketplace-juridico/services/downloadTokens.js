'use strict';

/**
 * Geração e validação dos tokens de download (UUID temporários, limite de uso).
 */

const crypto = require('crypto');
const { db } = require('../db');
const cfg = require('../config');

/**
 * Cria um token por item do pedido (gerado quando o pagamento é aprovado).
 * Idempotente por item: não duplica se já existir token ativo.
 */
function createTokensForOrder(orderId) {
  const items = db.prepare(
    `SELECT id, product_id FROM order_items WHERE order_id = ?`
  ).all(orderId);

  const hours = cfg.platform.downloadTokenHours;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const insert = db.prepare(`
    INSERT INTO download_tokens (token, order_id, order_item_id, product_id, expires_at, max_uses)
    VALUES (@token, @order_id, @order_item_id, @product_id, @expires_at, @max_uses)
  `);
  const exists = db.prepare(
    `SELECT 1 FROM download_tokens WHERE order_item_id = ? AND revoked = 0`
  );

  const created = [];
  const tx = db.transaction(() => {
    for (const it of items) {
      if (exists.get(it.id)) continue;
      const token = crypto.randomUUID();
      insert.run({
        token,
        order_id: orderId,
        order_item_id: it.id,
        product_id: it.product_id,
        expires_at: expiresAt,
        max_uses: cfg.platform.downloadMaxUses,
      });
      created.push(token);
    }
  });
  tx();
  return created;
}

/**
 * Valida o token e retorna o contexto necessário para servir o arquivo.
 * Lança Error com .code em caso de problema (para a rota responder 403/410).
 */
function validateToken(token) {
  const row = db.prepare(`
    SELECT dt.*,
           o.customer_email, o.customer_cpf, o.uuid AS order_uuid, o.status AS order_status,
           p.file_path, p.title
    FROM download_tokens dt
    JOIN orders o   ON o.id = dt.order_id
    JOIN products p ON p.id = dt.product_id
    WHERE dt.token = ?
  `).get(token);

  if (!row) throwCode('Token inválido.', 'NOT_FOUND');
  if (row.revoked) throwCode('Token revogado.', 'REVOKED');
  if (row.order_status !== 'paid') throwCode('Pedido não pago.', 'UNPAID');
  if (new Date(row.expires_at).getTime() < Date.now()) throwCode('Token expirado.', 'EXPIRED');
  if (row.used_count >= row.max_uses) throwCode('Limite de downloads atingido.', 'EXHAUSTED');

  return row;
}

/** Contabiliza um uso do token (chamar após entregar o arquivo). */
function registerUse(token, ip) {
  db.prepare(`
    UPDATE download_tokens
    SET used_count = used_count + 1, last_used_at = datetime('now'), last_ip = ?
    WHERE token = ?
  `).run(ip || null, token);
}

function throwCode(msg, code) {
  const e = new Error(msg);
  e.code = code;
  throw e;
}

module.exports = { createTokensForOrder, validateToken, registerUse };
