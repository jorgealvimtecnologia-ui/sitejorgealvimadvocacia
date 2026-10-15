/**
 * Notificação por WhatsApp ao advogado (compartilhado). Extraído do server.js.
 */

import { sendEmail } from './email.js';

const LAWYER_WHATSAPP_NUMBER = process.env.LAWYER_WHATSAPP_NUMBER || '5532998153429';
const WHATSAPP_GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || '';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || '';

export async function sendLawyerWhatsAppNotification(messageText, metadata = {}) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n[📲 MOTOR WHATSAPP ADVOGADO] ${timestamp}`);
  console.log(` Destinatário: ${LAWYER_WHATSAPP_NUMBER}`);
  console.log(` Mensagem:\n${messageText}\n`);

  const encodedMsg = encodeURIComponent(messageText);
  const waDirectUrl = `https://wa.me/${LAWYER_WHATSAPP_NUMBER}?text=${encodedMsg}`;

  if (WHATSAPP_GATEWAY_URL && WHATSAPP_GATEWAY_URL.trim().length > 0) {
    try {
      const response = await fetch(WHATSAPP_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': WHATSAPP_API_KEY,
          apikey: WHATSAPP_API_KEY,
        },
        body: JSON.stringify({
          phone: LAWYER_WHATSAPP_NUMBER,
          number: LAWYER_WHATSAPP_NUMBER,
          message: messageText,
        }),
      });
      console.log(` [📲 WHATSAPP] Notificação enviada via Gateway API (Status: ${response.status})`);
    } catch (err) {
      console.error(` [❌ WHATSAPP API ERRO] Falha no Gateway:`, err.message);
    }
  }

  return { success: true, waDirectUrl, lawyerPhone: LAWYER_WHATSAPP_NUMBER };
}

/**
 * Envia WhatsApp a UM número pelo gateway e informa, DE VERDADE, se foi enviado.
 * (A função acima sempre devolve success:true, mesmo sem gateway ou com erro: não serve
 * para alertas de prazo, que precisam saber se chegou.) Nunca lança.
 * @param {string} phone número em dígitos com DDI (ex.: 5532998153429)
 * @param {string} messageText
 * @param {{ fetchImpl?: typeof fetch, env?: object }} [opts] injeção para testes
 * @returns {Promise<{sent:boolean, reason?:string, status?:number}>}
 */
export async function sendWhatsAppMessage(phone, messageText, { fetchImpl = fetch, env = process.env } = {}) {
  const gateway = String(env.WHATSAPP_GATEWAY_URL || '').trim();
  if (!gateway) return { sent: false, reason: 'not_configured' };
  if (!/^\d{12,13}$/.test(String(phone || ''))) return { sent: false, reason: 'invalid_phone' };
  try {
    const key = env.WHATSAPP_API_KEY || '';
    const res = await fetchImpl(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': key, apikey: key },
      body: JSON.stringify({ phone, number: phone, message: messageText }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok
      ? { sent: true, status: res.status }
      : { sent: false, reason: `gateway_http_${res.status}`, status: res.status };
  } catch (err) {
    return { sent: false, reason: `send_failed: ${err.message}` };
  }
}

/**
 * Aviso de NOVO LEAD por e-mail ao escritório. Canal confiável (não depende de
 * gateway de WhatsApp nem de o visitante apertar "enviar"): o servidor envia sozinho.
 *
 * Destinatário: variável LEAD_NOTIFY_EMAIL, ou jorgealvimadvocacia@gmail.com por padrão.
 * Só envia de verdade se o SMTP estiver configurado (SMTP_HOST/USER/PASS). Honesta:
 * devolve o status real do envio ({sent:false, reason:'not_configured'} quando não há SMTP).
 * Nunca lança.
 *
 * @param {{clientId?:string, id?:string, name?:string, phone?:string, area?:string, message?:string, city?:string}} lead
 * @param {{ sendEmailImpl?: typeof sendEmail, env?: object }} [opts] injeção para testes
 * @returns {Promise<{sent:boolean, reason?:string, messageId?:string, to?:string}>}
 */
export async function sendLeadEmailNotification(lead = {}, { sendEmailImpl = sendEmail, env = process.env } = {}) {
  const to = String(env.LEAD_NOTIFY_EMAIL || 'jorgealvimadvocacia@gmail.com').trim();
  if (!to) return { sent: false, reason: 'no_recipient' };

  const name = String(lead.name || 'Sem nome').trim();
  const phone = String(lead.phone || '').trim();
  const area = String(lead.area || 'Geral').trim();
  const message = String(lead.message || '').trim();
  const city = String(lead.city || '').trim();
  const clientId = String(lead.clientId || lead.id || '').trim();
  const dateStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const cleanPhone = phone.replace(/\D/g, '');
  const waClientLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : '';

  const subject = `🚨 Novo lead no site — ${name}${area ? ` (${area})` : ''}`;

  const text =
    `NOVO ATENDIMENTO SOLICITADO NO SITE\n\n` +
    `Protocolo: #${clientId || '(sem id)'}\n` +
    `Nome: ${name}\n` +
    `WhatsApp: ${phone || 'não informado'}\n` +
    `Área: ${area}\n` +
    `Mensagem: ${message || 'Sem mensagem'}\n` +
    `Cidade: ${city || 'Não informada'}\n` +
    `Data: ${dateStr}\n\n` +
    (waClientLink ? `Falar com o cliente: ${waClientLink}\n` : '') +
    `Ver no painel: https://jorgealvimadvocacia.com.br/painel`;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">` +
    `<div style="background:#0f172a;color:#fff;padding:16px 20px"><h2 style="margin:0;font-size:18px">🚨 Novo atendimento solicitado no site</h2></div>` +
    `<div style="padding:20px;color:#111827;font-size:14px;line-height:1.6">` +
    `<p style="margin:0 0 12px"><strong>Protocolo:</strong> #${esc(clientId || '(sem id)')}</p>` +
    `<table style="width:100%;border-collapse:collapse">` +
    `<tr><td style="padding:4px 0;color:#6b7280;width:120px">Nome</td><td style="padding:4px 0"><strong>${esc(name)}</strong></td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280">WhatsApp</td><td style="padding:4px 0">${esc(phone || 'não informado')}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280">Área</td><td style="padding:4px 0">${esc(area)}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280">Mensagem</td><td style="padding:4px 0">${esc(message || 'Sem mensagem')}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280">Cidade</td><td style="padding:4px 0">${esc(city || 'Não informada')}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280">Data</td><td style="padding:4px 0">${esc(dateStr)}</td></tr>` +
    `</table>` +
    `<div style="margin-top:18px">` +
    (waClientLink ? `<a href="${waClientLink}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;margin-right:8px">💬 Falar com o cliente</a>` : '') +
    `<a href="https://jorgealvimadvocacia.com.br/painel" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">📋 Ver no painel</a>` +
    `</div></div></div>`;

  const result = await sendEmailImpl({ to, subject, text, html });
  return { ...result, to };
}
