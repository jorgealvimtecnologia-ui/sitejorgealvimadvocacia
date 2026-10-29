'use strict';

/**
 * Onboarding financeiro do autor via OAuth 2.0 do Mercado Pago.
 *
 * Fluxo:
 *   GET /oauth/connect   -> gera `state` anti-CSRF e redireciona ao MP
 *   GET /oauth/callback  -> recebe ?code & ?state, troca por tokens e grava
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const mp = require('../services/mercadopago');
const { requireRole } = require('../middleware/auth');

// Inicia a conexão (somente autor logado)
router.get('/connect', requireRole('author', 'admin'), (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.mpOauthState = state;
  req.session.mpOauthUserId = req.session.user.id;
  res.redirect(mp.getAuthorizationUrl(state));
});

// Callback do Mercado Pago
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    // Confere o state (anti-CSRF) e recupera o usuário que iniciou o fluxo
    if (!state || state !== req.session.mpOauthState) {
      return res.status(400).render('error', { message: 'State inválido no OAuth.' });
    }
    const userId = req.session.mpOauthUserId;
    if (!code || !userId) {
      return res.status(400).render('error', { message: 'Callback OAuth incompleto.' });
    }

    const tokenData = await mp.exchangeCodeForToken(code);
    mp.saveAuthorTokens(userId, tokenData); // grava cifrado

    delete req.session.mpOauthState;
    delete req.session.mpOauthUserId;

    res.redirect('/painel/autor?mp=conectado');
  } catch (err) {
    console.error('[oauth/callback]', err);
    res.status(500).render('error', { message: 'Falha ao conectar o Mercado Pago.' });
  }
});

module.exports = router;
