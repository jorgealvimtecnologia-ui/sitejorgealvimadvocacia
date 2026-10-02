/**
 * Testes automatizados do módulo Google reCAPTCHA v3.
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecaptcha } from '../src/modules/recaptcha/recaptcha.service.js';

describe('Google reCAPTCHA v3 (Anti-Abuso Invisível)', () => {
  it('1. Em ambiente de desenvolvimento/teste sem RECAPTCHA_SECRET_KEY, opera em bypass seguro', async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    const res = await verifyRecaptcha('qualquer-token', { action: 'lead_submit' });
    assert.equal(res.success, true);
    assert.equal(res.bypassed, true);
  });

  it('2. Com RECAPTCHA_SECRET_KEY configurada, rejeita quando token está ausente', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test_secret_key_123';
    try {
      const res = await verifyRecaptcha('', { action: 'lead_submit' });
      assert.equal(res.success, false);
      assert.equal(res.reason, 'missing_token');

      const resNull = await verifyRecaptcha(null, { action: 'lead_submit' });
      assert.equal(resNull.success, false);
      assert.equal(resNull.reason, 'missing_token');
    } finally {
      delete process.env.RECAPTCHA_SECRET_KEY;
    }
  });

  it('3. Valida resposta simulada positiva do Google (score >= 0.5)', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test_secret_key_123';
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.9,
          action: 'lead_submit',
          hostname: 'jorgealvimadvocacia.com.br'
        })
      });

      const res = await verifyRecaptcha('token-humano-valido', { action: 'lead_submit' });
      assert.equal(res.success, true);
      assert.equal(res.score, 0.9);
      assert.equal(res.action, 'lead_submit');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.RECAPTCHA_SECRET_KEY;
    }
  });

  it('4. Rejeita bots com pontuação baixa (score < 0.5)', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test_secret_key_123';
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.2,
          action: 'lead_submit'
        })
      });

      const res = await verifyRecaptcha('token-bot-suspeito', { action: 'lead_submit' });
      assert.equal(res.success, false);
      assert.equal(res.reason, 'score_too_low');
      assert.equal(res.score, 0.2);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.RECAPTCHA_SECRET_KEY;
    }
  });

  it('5. Aplica fail-open resiliente caso a API do Google caia ou dê erro de rede', async () => {
    process.env.RECAPTCHA_SECRET_KEY = 'test_secret_key_123';
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        throw new Error('Falha temporária de DNS/Conexão Google');
      };

      const res = await verifyRecaptcha('token-qualquer', { action: 'lead_submit' });
      assert.equal(res.success, true);
      assert.equal(res.bypassed, true);
      assert.equal(res.reason, 'network_exception');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.RECAPTCHA_SECRET_KEY;
    }
  });
});
