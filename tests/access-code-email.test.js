/**
 * Central Segura de Acesso — opção de envio do código por E-mail (ordem ORD-MUHP6IRS-MHE).
 *
 * 1. Módulo de e-mail: sem SMTP configurado, não envia e não lança (no-op gracioso).
 * 2. deliverAccessCode: sempre entrega ao painel; respeita o canal solicitado
 *    (WhatsApp sem gateway = não envia; e-mail sem destinatário = não envia) e nunca lança.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-access-code-email-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
// Garante ambiente sem gateway/SMTP para este teste.
delete process.env.WHATSAPP_GATEWAY_URL;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

// server.js inicializa o banco (tabela de notificações usada por deliverAccessCode).
const { db } = await import('../server.js');
const { isEmailConfigured, sendEmail } = await import('../src/shared/email.js');
const { deliverAccessCode } = await import('../src/shared/access-codes.js');

after(() => {
  try { db?.close?.(); } catch {}
  try { fs.existsSync(TMP_DB) && fs.unlinkSync(TMP_DB); } catch {}
});

describe('Módulo de e-mail (SMTP não configurado)', () => {
  it('isEmailConfigured() = false sem credenciais SMTP', () => {
    assert.equal(isEmailConfigured(), false);
  });

  it('sendEmail sem destinatário → { sent:false, reason:"no_recipient" }', async () => {
    const r = await sendEmail({ subject: 'x', text: 'y' });
    assert.equal(r.sent, false);
    assert.equal(r.reason, 'no_recipient');
  });

  it('sendEmail sem SMTP configurado → { sent:false, reason:"not_configured" } (não lança)', async () => {
    const r = await sendEmail({ to: 'titular@exemplo.com', subject: 'x', text: 'y' });
    assert.equal(r.sent, false);
    assert.equal(r.reason, 'not_configured');
  });
});

describe('deliverAccessCode — canais de entrega', () => {
  const base = {
    audience: 'painel',
    name: 'Dr. Jorge Alvim',
    identifier: 'jorgealvimtecnologia',
    code: '123456',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    resourceId: 'USR-MASTER-01'
  };

  it('sempre entrega ao painel, independente do canal', async () => {
    const r = await deliverAccessCode({ ...base, channel: 'whatsapp' });
    assert.equal(r.deliveredToPanel, true);
  });

  it('canal WhatsApp sem gateway → não envia por WhatsApp', async () => {
    const r = await deliverAccessCode({ ...base, channel: 'whatsapp' });
    assert.equal(r.deliveredToWhatsApp, false);
  });

  it('canal e-mail sem destinatário → não envia por e-mail', async () => {
    const r = await deliverAccessCode({ ...base, channel: 'email', recipientEmail: '' });
    assert.equal(r.deliveredToEmail, false);
    assert.equal(r.deliveredToPanel, true);
  });

  it('canal e-mail com destinatário mas SMTP não configurado → não envia (não lança)', async () => {
    const r = await deliverAccessCode({ ...base, channel: 'email', recipientEmail: 'titular@exemplo.com' });
    assert.equal(r.deliveredToEmail, false);
    assert.equal(r.emailConfigured, false);
  });
});
