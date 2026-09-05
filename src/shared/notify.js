/**
 * Notificação por WhatsApp ao advogado (compartilhado). Extraído do server.js.
 */

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
          'apikey': WHATSAPP_API_KEY
        },
        body: JSON.stringify({
          phone: LAWYER_WHATSAPP_NUMBER,
          number: LAWYER_WHATSAPP_NUMBER,
          message: messageText
        })
      });
      console.log(` [📲 WHATSAPP] Notificação enviada via Gateway API (Status: ${response.status})`);
    } catch (err) {
      console.error(` [❌ WHATSAPP API ERRO] Falha no Gateway:`, err.message);
    }
  }

  return { success: true, waDirectUrl, lawyerPhone: LAWYER_WHATSAPP_NUMBER };
}
