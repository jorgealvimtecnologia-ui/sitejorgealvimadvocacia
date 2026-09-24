/**
 * Entrega de códigos de acesso (1º acesso / recuperação de senha) ao escritório.
 *
 * O código NUNCA volta na resposta HTTP. Ele é:
 *  1) enviado ao WhatsApp do escritório, quando há gateway configurado (WHATSAPP_GATEWAY_URL); e
 *  2) SEMPRE registrado como notificação visível só para o mestre no painel — assim o
 *     código chega mesmo sem gateway, e o Dr. Jorge repassa ao titular após conferir a identidade.
 */
import { sendLawyerWhatsAppNotification } from './notify.js';
import { createNotification } from '../modules/notifications/notifications.routes.js';

const MASTER_USER_ID = 'USR-MASTER-01';

export async function deliverAccessCode({ audience, name, identifier, code, expiresAt, resourceId }) {
  const validity = new Date(expiresAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const who = audience === 'cliente' ? 'Portal do Cliente' : 'Painel';

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

  if (process.env.WHATSAPP_GATEWAY_URL) {
    await sendLawyerWhatsAppNotification(
      `🔐 *CÓDIGO DE ACESSO - ${who.toUpperCase()}*\n\n` +
      `Titular: *${name}* (${identifier})\n` +
      `Código (válido até ${validity}): *${code}*\n\n` +
      `Repasse o código somente após confirmar a identidade do titular.`,
      { action: `${audience}_access_code`, resourceId }
    ).catch(() => {});
  }
  return { deliveredToPanel: true, deliveredToWhatsApp: !!process.env.WHATSAPP_GATEWAY_URL };
}
