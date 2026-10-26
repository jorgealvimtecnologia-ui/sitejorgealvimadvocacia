'use strict';

/**
 * Download protegido: /download/:token
 *  - valida o UUID (existência, expiração, limite de uso, pedido pago)
 *  - abre o PDF privado (fora do public), injeta marca d'água com dados do
 *    comprador e entrega o buffer — a URL real do arquivo nunca é exposta.
 */

const express = require('express');
const router = express.Router();

const { db } = require('../db');
const tokens = require('../services/downloadTokens');
const { watermarkPdf } = require('../services/pdf');

router.get('/:token', async (req, res) => {
  try {
    const ctx = tokens.validateToken(req.params.token); // lança em caso de erro

    // Gera o PDF individualizado em memória
    const buffer = await watermarkPdf({
      sourcePath: ctx.file_path,
      email: ctx.customer_email,
      cpf: ctx.customer_cpf,
      orderUuid: ctx.order_uuid,
    });

    // Contabiliza uso + incrementa downloads do produto
    db.transaction(() => {
      tokens.registerUse(req.params.token, req.ip);
      db.prepare('UPDATE products SET downloads_count = downloads_count + 1 WHERE id = ?')
        .run(ctx.product_id);
    })();

    const safeName = ctx.title.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'monografia';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (err) {
    const codes = {
      NOT_FOUND: 404, EXPIRED: 410, EXHAUSTED: 410, REVOKED: 403, UNPAID: 402,
    };
    const status = codes[err.code] || 500;
    if (status === 500) console.error('[download]', err);
    return res.status(status).render('error', { message: err.message });
  }
});

module.exports = router;
