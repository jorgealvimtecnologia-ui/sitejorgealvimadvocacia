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
 * `attachments` segue o formato do nodemailer: [{ filename, content }].
 * @returns {Promise<{sent:boolean, reason?:string, messageId?:string, error?:string}>}
 */
export async function sendEmail({ to, subject, text, html, attachments } = {}) {
  if (!to) return { sent: false, reason: 'no_recipient' };

  // 1. Tenta envio via Brevo REST API se configurado
  try {
    let brevoKey = process.env.BREVO_API_KEY || '';
    let senderName = 'Dr. Jorge Alvim - Advocacia';
    let senderEmail = 'contato@jorgealvimadvocacia.com.br';
    let replyToEmail = 'jorgealvimadv@gmail.com';
    let replyToName = 'Dr. Jorge Alvim';

    if (!brevoKey) {
      const { db } = await import('../config/db.js');
      const row = db.prepare(`SELECT value FROM brevo_settings WHERE key = 'brevo_api_key'`).get();
      if (row && row.value && row.value.trim().length > 0) {
        brevoKey = row.value.trim();
        const sn = db.prepare(`SELECT value FROM brevo_settings WHERE key = 'sender_name'`).get();
        const se = db.prepare(`SELECT value FROM brevo_settings WHERE key = 'sender_email'`).get();
        const re = db.prepare(`SELECT value FROM brevo_settings WHERE key = 'reply_to_email'`).get();
        if (sn?.value) senderName = sn.value;
        if (se?.value) senderEmail = se.value;
        if (re?.value) replyToEmail = re.value;
      }
    }

    if (brevoKey) {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': brevoKey
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          replyTo: { email: replyToEmail, name: replyToName },
          subject,
          htmlContent: html || (text ? `<p>${text}</p>` : undefined),
          textContent: text || undefined
        })
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        console.log(`[✉️  BREVO API] Enviado para ${to} (id: ${data.messageId || 'ok'})`);
        return { sent: true, messageId: data.messageId || 'brevo-ok' };
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn(`[✉️  BREVO API] Falha HTTP ${response.status}:`, errJson.message || 'Erro');
      }
    }
  } catch (brevoErr) {
    console.warn('[✉️  BREVO API] Erro na tentativa:', brevoErr.message);
  }

  // 2. Fallback para SMTP padrão (Nodemailer)
  if (!isEmailConfigured()) {
    console.warn('[✉️  EMAIL] Nem Brevo nem SMTP configurados — e-mail não enviado. Defina BREVO_API_KEY ou SMTP_HOST/USER/PASS.');
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
      html: html || undefined,
      attachments: attachments && attachments.length ? attachments : undefined
    });
    console.log(`[✉️  EMAIL] Enviado para ${to} (id: ${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[✉️  EMAIL] Falha ao enviar:', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}
