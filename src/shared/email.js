/**
 * Envio de e-mail transacional (compartilhado).
 *
 * Usado, por exemplo, para entregar códigos de acesso / recuperação de senha por
 * e-mail como ALTERNATIVA ao WhatsApp (Central Segura de Acesso).
 *
 * Configuração por variáveis de ambiente (.env — nunca versionado):
 *   SMTP_HOST    servidor SMTP (ex.: smtp.gmail.com)
 *   SMTP_PORT    porta (587 STARTTLS padrão, ou 465 SSL)
 *   SMTP_USER    usuário/e-mail de autenticação
 *   SMTP_PASS    senha ou app password
 *   SMTP_FROM    remetente exibido (opcional; padrão = SMTP_USER)
 *   SMTP_SECURE  "true" para conexão SSL direta (implícito quando a porta é 465)
 *
 * Se o SMTP não estiver configurado, sendEmail apenas registra no log e retorna
 * { sent:false, reason:'not_configured' } — SEM lançar erro. O código de acesso
 * também é sempre registrado como notificação no painel do mestre, então a entrega
 * nunca depende exclusivamente deste canal.
 */

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@jorgealvimadvocacia.com.br';
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || SMTP_PORT === 465;

/** Indica se há credenciais SMTP suficientes para envio real. */
export function isEmailConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/**
 * Envia um e-mail. Nunca lança: retorna sempre um objeto de status.
 * @returns {Promise<{sent:boolean, reason?:string, messageId?:string, error?:string}>}
 */
export async function sendEmail({ to, subject, text, html } = {}) {
  if (!to) return { sent: false, reason: 'no_recipient' };

  if (!isEmailConfigured()) {
    console.warn('[✉️  EMAIL] SMTP não configurado — e-mail não enviado. Defina SMTP_HOST/SMTP_USER/SMTP_PASS no .env.');
    return { sent: false, reason: 'not_configured' };
  }

  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch (e) {
    console.error('[✉️  EMAIL] Pacote "nodemailer" indisponível. Rode: npm install nodemailer');
    return { sent: false, reason: 'missing_dependency' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html: html || undefined
    });
    console.log(`[✉️  EMAIL] Enviado para ${to} (id: ${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[✉️  EMAIL] Falha ao enviar:', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}
