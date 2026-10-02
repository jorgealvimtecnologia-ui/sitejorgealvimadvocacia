/**
 * Middleware Express para verificação transparente de Google reCAPTCHA v3.
 *
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */

import { verifyRecaptcha } from './recaptcha.service.js';

export function requireRecaptcha(expectedAction = 'lead_submit') {
  return async function recaptchaMiddleware(req, res, next) {
    // Se não há secret configurado no .env, passa direto sem bloquear o fluxo
    if (!process.env.RECAPTCHA_SECRET_KEY) {
      return next();
    }

    const token =
      req.headers['x-recaptcha-token'] ||
      (req.body && (req.body.recaptcha_token || req.body.recaptchaToken));

    const remoteip = req.ip || (req.socket && req.socket.remoteAddress);

    const result = await verifyRecaptcha(token, { action: expectedAction, remoteip });

    if (!result.success) {
      return res.status(403).json({
        error: 'Validação de segurança anti-robô falhou. Por favor, tente novamente.',
        code: 'RECAPTCHA_FAILED',
        reason: result.reason
      });
    }

    req.recaptcha = result;
    next();
  };
}
