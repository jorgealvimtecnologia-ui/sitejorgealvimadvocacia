/**
 * Rotas e Status do Módulo Google reCAPTCHA v3.
 *
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */

import express from 'express';

export const recaptchaRouter = express.Router();

recaptchaRouter.get('/api/recaptcha/config', (req, res) => {
  const siteKey = (process.env.RECAPTCHA_SITE_KEY || '').trim();
  const secretKey = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
  res.json({
    enabled: Boolean(siteKey && secretKey),
    siteKey: siteKey || null
  });
});
