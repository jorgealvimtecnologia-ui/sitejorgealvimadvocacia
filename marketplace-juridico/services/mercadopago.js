'use strict';

/**
 * Integração com o Mercado Pago — modelo Marketplace / Split de Pagamentos 1:1.
 *
 * Como o split funciona (confirmado na doc oficial):
 *  1) O AUTOR autoriza a plataforma via OAuth -> recebemos o access_token DELE.
 *  2) No checkout (Checkout API / Transparente), o pagamento é criado no
 *     endpoint /v1/payments usando o ACCESS_TOKEN DO AUTOR no header.
 *     O dinheiro cai DIRETO na conta do autor.
 *  3) A comissão da plataforma é informada no campo `application_fee`
 *     (em REAIS, não centavos) e é retida automaticamente para o marketplace.
 *
 *  Observação sobre `sponsor_id`: no modelo atual 1:1 a divisão é definida por
 *  (token do vendedor + application_fee). O `sponsor_id` existe no payload de
 *  /payments como atributo informativo do integrador, mas NÃO é o mecanismo de
 *  split. Mantido abaixo como opcional por compatibilidade.
 *
 * Usamos fetch nativo (Node >= 18) para OAuth e pagamentos: evita acoplamento a
 * versões específicas do SDK e deixa o fluxo auditável. O Brick do cartão é
 * carregado no FRONTEND via SDK JS (ver views/checkout).
 */

const crypto = require('crypto');
const { db } = require('../db');
const cfg = require('../config');
const vault = require('../lib/crypto');

const MP = cfg.mercadopago;

// --------------------------------------------------------------------------
// 1) OAuth — URL de autorização
// --------------------------------------------------------------------------
/**
 * Monta a URL para a qual o autor é redirecionado para autorizar a plataforma.
 * `state` é um token anti-CSRF que você deve guardar na sessão e conferir no callback.
 */
function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: MP.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: MP.redirectUri,
  });
  return `${MP.authorizeUrl}?${params.toString()}`;
}

// --------------------------------------------------------------------------
// 2) OAuth — troca do authorization code pelos tokens do autor
// --------------------------------------------------------------------------
async function exchangeCodeForToken(code) {
  const res = await fetch(MP.oauthTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: MP.clientId,
      client_secret: MP.clientSecret,
      code,
      redirect_uri: MP.redirectUri,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OAuth token exchange falhou: ${res.status} ${JSON.stringify(data)}`);
  }
  // data: { access_token, refresh_token, user_id, public_key, expires_in, ... }
  return data;
}

// --------------------------------------------------------------------------
// 3) OAuth — refresh. ATENÇÃO: o MP rotaciona o refresh_token a cada refresh,
//    então o novo refresh_token DEVE ser regravado.
// --------------------------------------------------------------------------
async function refreshToken(refresh_token) {
  const res = await fetch(MP.oauthTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: MP.clientId,
      client_secret: MP.clientSecret,
      refresh_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OAuth refresh falhou: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

// --------------------------------------------------------------------------
// Persistência dos tokens do autor (sempre cifrados)
// --------------------------------------------------------------------------
function saveAuthorTokens(userId, tokenData) {
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 15552000) * 1000)
    .toISOString();
  db.prepare(`
    UPDATE users SET
      mp_user_id = @mp_user_id,
      mp_access_token = @access,
      mp_refresh_token = @refresh,
      mp_public_key = @public_key,
      mp_token_expires_at = @expires,
      mp_connected_at = COALESCE(mp_connected_at, datetime('now')),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: userId,
    mp_user_id: String(tokenData.user_id ?? ''),
    access: vault.encrypt(tokenData.access_token),
    refresh: vault.encrypt(tokenData.refresh_token),
    public_key: tokenData.public_key || null,
    expires: expiresAt,
  });
}

/**
 * Retorna um access_token VÁLIDO do autor, renovando automaticamente se estiver
 * perto de expirar (margem de 24h). Regrava os tokens rotacionados.
 */
async function getValidAccessTokenForAuthor(authorId) {
  const row = db.prepare(`
    SELECT mp_access_token, mp_refresh_token, mp_token_expires_at, mp_public_key
    FROM users WHERE id = ?
  `).get(authorId);

  if (!row || !row.mp_access_token) {
    throw new Error('Autor não conectou a conta do Mercado Pago.');
  }

  const expiresAt = new Date(row.mp_token_expires_at).getTime();
  const marginMs = 24 * 60 * 60 * 1000;
  if (Date.now() < expiresAt - marginMs) {
    return { accessToken: vault.decrypt(row.mp_access_token), publicKey: row.mp_public_key };
  }

  // Renova
  const refresh = vault.decrypt(row.mp_refresh_token);
  const refreshed = await refreshToken(refresh);
  saveAuthorTokens(authorId, refreshed);
  return { accessToken: refreshed.access_token, publicKey: refreshed.public_key };
}

// --------------------------------------------------------------------------
// 4) Criação do pagamento com SPLIT (Pix ou Cartão)
// --------------------------------------------------------------------------
/**
 * @param {object} p
 * @param {string} p.sellerAccessToken  access_token do AUTOR (quem recebe)
 * @param {number} p.transactionAmount  valor total EM REAIS (float)
 * @param {number} p.applicationFee      comissão da plataforma EM REAIS (float)
 * @param {string} p.description
 * @param {string} p.externalReference   orders.uuid (liga webhook -> pedido)
 * @param {object} p.payer               { email, identification:{type:'CPF', number} }
 * @param {'pix'|'credit_card'} p.method
 * @param {string} [p.cardToken]         token gerado pelo Brick (cartão)
 * @param {number} [p.installments]
 * @param {string} [p.paymentMethodId]   ex.: 'visa','master' (cartão) — vem do Brick
 * @param {string} [p.issuerId]
 * @param {string} [p.sponsorId]         opcional (mp_user_id do autor)
 */
async function createSplitPayment(p) {
  const body = {
    transaction_amount: round2(p.transactionAmount),
    description: p.description,
    external_reference: p.externalReference,
    application_fee: round2(p.applicationFee), // <<< comissão do marketplace
    notification_url: `${cfg.baseUrl}/webhooks/mercadopago`,
    payer: p.payer,
    metadata: { order_uuid: p.externalReference },
  };
  if (p.sponsorId) body.sponsor_id = Number(p.sponsorId);

  if (p.method === 'pix') {
    body.payment_method_id = 'pix';
    // Expiração do Pix (ex.: 30 min)
    body.date_of_expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  } else {
    // Cartão de crédito — dados vêm do Brick (PCI: cartão nunca toca o backend)
    body.token = p.cardToken;
    body.installments = p.installments || 1;
    if (p.paymentMethodId) body.payment_method_id = p.paymentMethodId;
    if (p.issuerId) body.issuer_id = p.issuerId;
    body.capture = true;
  }

  const res = await fetch(MP.paymentsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.sellerAccessToken}`, // token DO AUTOR
      // Idempotência: reenvio da mesma requisição não duplica a cobrança
      'X-Idempotency-Key': p.externalReference + ':' + (p.cardToken || 'pix'),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao criar pagamento MP: ${res.status} ${JSON.stringify(data)}`);
  }
  return data; // contém id, status, point_of_interaction (Pix), etc.
}

// --------------------------------------------------------------------------
// 5) Consulta de pagamento (usada no webhook para confirmar o status real)
//    Consultamos com o token do AUTOR dono do pagamento.
// --------------------------------------------------------------------------
async function getPayment(paymentId, sellerAccessToken) {
  const res = await fetch(`${MP.paymentsUrl}/${paymentId}`, {
    headers: { Authorization: `Bearer ${sellerAccessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao consultar pagamento ${paymentId}: ${res.status}`);
  }
  return data;
}

// --------------------------------------------------------------------------
// 6) Validação de assinatura do Webhook (header x-signature)
//    Template do manifest (doc oficial):
//      id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//    HMAC-SHA256(manifest, MP_WEBHOOK_SECRET) == v1 (hex)
// --------------------------------------------------------------------------
function verifyWebhookSignature({ xSignature, xRequestId, dataId }) {
  if (!xSignature) return false;
  const parts = Object.fromEntries(
    xSignature.split(',').map((kv) => kv.split('=').map((s) => s.trim()))
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // data.id, se alfanumérico, deve ir em minúsculas no manifest
  const id = /[a-zA-Z]/.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifest = `id:${id};request-id:${xRequestId};ts:${ts};`;

  const hmac = crypto
    .createHmac('sha256', MP.webhookSecret)
    .update(manifest)
    .digest('hex');

  // Comparação em tempo constante
  const a = Buffer.from(hmac);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshToken,
  saveAuthorTokens,
  getValidAccessTokenForAuthor,
  createSplitPayment,
  getPayment,
  verifyWebhookSignature,
};
