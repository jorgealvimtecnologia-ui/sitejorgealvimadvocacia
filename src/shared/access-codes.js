/**
 * Entrega de códigos de acesso (1º acesso / recuperação de senha) ao escritório.
 *
 * O código NUNCA volta na resposta HTTP. Ele é:
 *  1) SEMPRE registrado como notificação visível só para o mestre no painel — assim o
 *     código chega mesmo sem nenhum gateway, e o Dr. Jorge repassa ao titular após
 *     conferir a identidade;
 *  2) enviado ao WhatsApp do escritório, quando o canal solicitado é WhatsApp e há
 *     gateway configurado (WHATSAPP_GATEWAY_URL); e/ou
 *  3) enviado por e-mail ao titular, quando o canal solicitado é e-mail, há um
 *     destinatário e o SMTP está configurado (ver src/shared/email.js).
 */
import { sendLawyerWhatsAppNotification } from './notify.js';
import { sendEmail, isEmailConfigured } from './email.js';
import { createNotification } from '../modules/notifications/notifications.routes.js';

const MASTER_USER_ID = 'USR-MASTER-01';

export async function deliverAccessCode({
  audience,
  name,
  identifier,
  code,
  expiresAt,
  resourceId,
  channel = 'whatsapp',
  recipientEmail = ''
}) {
  const validity = new Date(expiresAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const who = audience === 'cliente' ? 'Portal do Cliente' : 'Painel';
  const wantsEmail = channel === 'email' || channel === 'both';
  const wantsWhatsApp = channel === 'whatsapp' || channel === 'both';

  // 1) Canal garantido: notificação visível apenas para o mestre no painel.
  createNotification({
    category: 'seguranca',
    level: 'warning',
    title: `🔐 Código de acesso (${who}): ${name}`,
    message: `Código ${code} — válido até ${validity}. Identificação: ${identifier}. Repasse ao titular somente após confirmar a identidade dele.`,
    link: audience === 'cliente' ? '#tab:clients' : '#tab:users',
    resource_type: audience === 'cliente' ? 'client_access_code' : 'user_access_code',
    resource_id: resourceId,
    target_user_id: MASTER_USER_ID
  });

  // 2) WhatsApp do escritório (quando solicitado e com gateway configurado).
  let deliveredToWhatsApp = false;
  if (wantsWhatsApp && process.env.WHATSAPP_GATEWAY_URL) {
    await sendLawyerWhatsAppNotification(
      `🔐 *CÓDIGO DE ACESSO - ${who.toUpperCase()}*\n\n` +
      `Titular: *${name}* (${identifier})\n` +
      `Código (válido até ${validity}): *${code}*\n\n` +
      `Repasse o código somente após confirmar a identidade do titular.`,
      { action: `${audience}_access_code`, resourceId }
    ).catch(() => {});
    deliveredToWhatsApp = true;
  }

  // 3) E-mail ao titular (quando solicitado, com destinatário e SMTP configurado).
  let deliveredToEmail = false;
  if (wantsEmail && recipientEmail) {
    const subject = `🔐 Código de acesso — ${who} | Jorge Alvim Advocacia`;
    const text =
      `Olá, ${name}.\n\n` +
      `Seu código de acesso (${who}) é: ${code}\n` +
      `Válido até ${validity} (horário de Brasília).\n\n` +
      `Se você não solicitou este código, ignore este e-mail.\n\n` +
      `Jorge Alvim Advocacia — OAB/MG 222.943`;
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0A192F">` +
      `<h2 style="color:#0A192F">🔐 Código de acesso — ${who}</h2>` +
      `<p>Olá, <strong>${name}</strong>.</p>` +
      `<p>Seu código de acesso é:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 0;text-align:center;color:#0A192F">${code}</p>` +
      `<p style="color:#475569;font-size:13px">Válido até <strong>${validity}</strong> (horário de Brasília).</p>` +
      `<p style="color:#94a3b8;font-size:12px">Se você não solicitou este código, ignore este e-mail.</p>` +
      `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>` +
      `<p style="color:#94a3b8;font-size:12px">Jorge Alvim Advocacia — OAB/MG 222.943</p>` +
      `</div>`;
    const r = await sendEmail({ to: recipientEmail, subject, text, html }).catch(() => ({ sent: false }));
    deliveredToEmail = !!(r && r.sent);
  }

  return {
    deliveredToPanel: true,
    deliveredToWhatsApp,
    deliveredToEmail,
    emailConfigured: isEmailConfigured()
  };
}
