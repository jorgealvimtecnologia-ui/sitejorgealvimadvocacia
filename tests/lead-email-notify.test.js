/**
 * Aviso de novo lead por e-mail (sendLeadEmailNotification).
 *
 * Canal confiável: o servidor envia sozinho (não depende de gateway de WhatsApp
 * nem de o visitante apertar "enviar"). A função é HONESTA — devolve o status real
 * do envio — e NUNCA lança. Usa injeção de dependência (sendEmailImpl/env) para testar
 * sem SMTP real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendLeadEmailNotification } from '../src/shared/notify.js';

const LEAD = {
  clientId: 'JA-2026-0099',
  name: 'Fulano de Tal',
  phone: '32984688808',
  area: 'Consulta Express Geral',
  message: 'Preciso de orientação.',
  city: 'Juiz de Fora'
};

describe('sendLeadEmailNotification — destinatário', () => {
  it('usa jorgealvimadvocacia@gmail.com por padrão (sem LEAD_NOTIFY_EMAIL)', async () => {
    let captured = null;
    const fake = async (args) => { captured = args; return { sent: true, messageId: 'x1' }; };
    const r = await sendLeadEmailNotification(LEAD, { sendEmailImpl: fake, env: {} });
    assert.equal(r.sent, true);
    assert.equal(r.to, 'jorgealvimadvocacia@gmail.com');
    assert.equal(captured.to, 'jorgealvimadvocacia@gmail.com');
  });

  it('respeita LEAD_NOTIFY_EMAIL quando definido', async () => {
    let captured = null;
    const fake = async (args) => { captured = args; return { sent: true }; };
    const r = await sendLeadEmailNotification(LEAD, {
      sendEmailImpl: fake,
      env: { LEAD_NOTIFY_EMAIL: 'outro@escritorio.com' }
    });
    assert.equal(r.to, 'outro@escritorio.com');
    assert.equal(captured.to, 'outro@escritorio.com');
  });
});

describe('sendLeadEmailNotification — conteúdo', () => {
  it('monta assunto com nome e área, e corpo com protocolo/telefone/mensagem', async () => {
    let captured = null;
    const fake = async (args) => { captured = args; return { sent: true }; };
    await sendLeadEmailNotification(LEAD, { sendEmailImpl: fake, env: {} });

    assert.match(captured.subject, /Fulano de Tal/);
    assert.match(captured.subject, /Consulta Express Geral/);
    // Texto puro
    assert.match(captured.text, /JA-2026-0099/);
    assert.match(captured.text, /32984688808/);
    assert.match(captured.text, /Preciso de orientação\./);
    assert.match(captured.text, /wa\.me\/5532984688808/);
    // HTML presente e com o nome
    assert.ok(captured.html && captured.html.includes('Fulano de Tal'));
  });

  it('lead sem telefone: não gera link wa.me quebrado', async () => {
    let captured = null;
    const fake = async (args) => { captured = args; return { sent: true }; };
    await sendLeadEmailNotification({ clientId: 'JA-2026-0100', name: 'Sem Fone' }, { sendEmailImpl: fake, env: {} });
    assert.doesNotMatch(captured.text, /wa\.me\/55\n/);
    assert.match(captured.text, /não informado/);
  });

  it('escapa HTML do conteúdo do lead (anti-injeção no e-mail)', async () => {
    let captured = null;
    const fake = async (args) => { captured = args; return { sent: true }; };
    await sendLeadEmailNotification(
      { clientId: 'JA-2026-0101', name: '<script>x</script>', phone: '32999999999', area: 'Civil' },
      { sendEmailImpl: fake, env: {} }
    );
    assert.ok(!captured.html.includes('<script>x</script>'));
    assert.match(captured.html, /&lt;script&gt;/);
  });
});

describe('sendLeadEmailNotification — robustez', () => {
  it('propaga status honesto do envio (sent:false) sem lançar', async () => {
    const fake = async () => ({ sent: false, reason: 'not_configured' });
    const r = await sendLeadEmailNotification(LEAD, { sendEmailImpl: fake, env: {} });
    assert.equal(r.sent, false);
    assert.equal(r.reason, 'not_configured');
    assert.equal(r.to, 'jorgealvimadvocacia@gmail.com');
  });

  it('NUNCA lança, mesmo com lead vazio', async () => {
    const fake = async () => ({ sent: true });
    const r = await sendLeadEmailNotification(undefined, { sendEmailImpl: fake, env: {} });
    assert.equal(r.sent, true);
  });
});
