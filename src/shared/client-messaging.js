/**
 * MENSAGENS CLIENTE ↔ ESCRITÓRIO ("o cliente no foguete", na sua aba do portal).
 *
 * Duas direções, com avisos:
 *  - CLIENTE escreve pelo portal  → avisamos o ESCRITÓRIO (sino + e-mail), mas SÓ as pessoas
 *    envolvidas: o advogado RESPONSÁVEL pelo cliente, o(s) DONO(S)/mestre(s) e a(s) SECRETÁRIA(S).
 *    Nunca "todos os operadores" — por isso o aviso é direcionado (target_user_id), não global.
 *  - ESCRITÓRIO responde          → avisamos o CLIENTE por e-mail (se ele permitiu em preferências).
 *
 * IMPORTANTE (decisão do Dr. Jorge): isto é mensagem DIGITADA por pessoas. NÃO envia andamentos
 * processuais automáticos ao cliente — essa decisão é sempre do advogado.
 *
 * Módulo com poucos efeitos: lê o banco para descobrir os destinatários, cria notificações (sino)
 * de forma síncrona e dispara os e-mails em segundo plano (sendEmail nunca lança).
 */
import { db } from '../config/db.js';
import { createNotification } from '../modules/notifications/notifications.routes.js';
import { sendEmail } from './email.js';
import { MASTER_EMAILS } from '../config/master-emails.js';

/** Corta um texto para um resumo curto e seguro (sem vazar documento inteiro no e-mail/sino). */
function resumo(texto, max = 160) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * Pessoas do escritório que PODEM e DEVEM acompanhar a conversa de um cliente:
 * advogado responsável + donos/mestres + secretárias ativas. Deduplicado por user_id
 * (e por e-mail quando não há user_id vinculado, como os e-mails mestres oficiais).
 * @returns {Array<{user_id: string|null, name: string|null, email: string|null}>}
 */
export function destinatariosEscritorio(client) {
  const out = new Map();
  const add = (user_id, name, email) => {
    const mail = String(email || '').trim().toLowerCase() || null;
    if (!user_id && !mail) return;
    const key = user_id || `email:${mail}`;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, { user_id: user_id || null, name: name || null, email: mail });
    } else {
      if (!prev.email && mail) prev.email = mail;
      if (!prev.name && name) prev.name = name;
    }
  };

  // 1) Advogado responsável pelo cliente (se houver). Sem responsável = fica a cargo do pool
  //    (donos e secretárias abaixo), que é o comportamento desejado até alguém assumir o cliente.
  const respId = client && client.responsible_lawyer_id;
  if (respId) {
    let name = client.responsible_lawyer_name || null;
    let email = null;
    try {
      const ap = db.prepare(`SELECT user_name, user_email FROM access_permissions WHERE user_id = ?`).get(respId);
      if (ap) { email = ap.user_email || null; name = name || ap.user_name || null; }
    } catch { /* ignora */ }
    if (!email) {
      try {
        const u = db.prepare(`SELECT name, google_email FROM users WHERE id = ?`).get(respId);
        if (u) { email = u.google_email || null; name = name || u.name || null; }
      } catch { /* ignora */ }
    }
    add(respId, name, email);
  }

  // 2) Secretária(s) ativa(s).
  try {
    const secs = db.prepare(
      `SELECT user_id, user_name, user_email FROM access_permissions WHERE is_active = 1 AND role_template = 'secretaria'`
    ).all();
    for (const s of secs) add(s.user_id, s.user_name, s.user_email);
  } catch { /* ignora */ }

  // 3) Dono(s) / mestre(s): pela matriz de permissões e pela tabela de usuários.
  try {
    const masters = db.prepare(
      `SELECT user_id, user_name, user_email FROM access_permissions WHERE is_active = 1 AND role_template IN ('master','dono_escritorio')`
    ).all();
    for (const m of masters) add(m.user_id, m.user_name, m.user_email);
  } catch { /* ignora */ }
  try {
    const mu = db.prepare(
      `SELECT id, name, google_email FROM users WHERE role = 'master' OR username = 'jorgealvimtecnologia'`
    ).all();
    for (const u of mu) add(u.id, u.name, u.google_email);
  } catch { /* ignora */ }

  // 4) Garante que os e-mails mestres oficiais (o titular) recebam o aviso por e-mail,
  //    mesmo que ainda não haja um usuário vinculado a eles.
  for (const em of MASTER_EMAILS) add(null, 'Dr. Jorge Alvim', em);

  return [...out.values()];
}

/**
 * Avisa o escritório (sino + e-mail) que o CLIENTE enviou uma mensagem pelo portal.
 * Cria uma notificação direcionada a cada pessoa envolvida (não global) e dispara os e-mails
 * em segundo plano. Retorna quantos sinos foram criados (útil para testes).
 */
export function notificarEscritorioNovaMensagem({ client, messageId, subject, mensagem }) {
  if (!client) return { bells: 0, destinatarios: [] };
  const destinatarios = destinatariosEscritorio(client);
  const nomeCliente = client.full_name || client.fullName || 'Cliente';
  const assunto = resumo(subject || 'Mensagem do cliente', 80);
  const preview = resumo(mensagem, 160);

  let bells = 0;
  for (const d of destinatarios) {
    if (!d.user_id) continue; // sino precisa de um operador logado; e-mails cuidam dos demais
    const n = createNotification({
      category: 'geral',
      level: 'info',
      title: `💬 Nova mensagem de ${nomeCliente}`,
      message: `${assunto}${preview ? ' — ' + preview : ''}`,
      link: '#tab:clients',
      resource_type: 'client_message',
      resource_id: String(client.id),
      target_user_id: d.user_id,
      dedupe_key: `climsg-${messageId}-${d.user_id}`
    });
    if (n) bells++;
  }

  // E-mails em segundo plano (não travam a resposta ao cliente).
  const emails = [...new Set(destinatarios.map(d => d.email).filter(Boolean))];
  if (emails.length) {
    const corpo =
      `O cliente ${nomeCliente} enviou uma mensagem pelo Portal do Cliente.\n\n` +
      `Assunto: ${assunto}\n` +
      (preview ? `Prévia: ${preview}\n\n` : '\n') +
      `Acesse o painel (aba Clientes) para ler e responder.`;
    for (const to of emails) {
      Promise.resolve(sendEmail({
        to,
        subject: `💬 Nova mensagem de ${nomeCliente} (Portal do Cliente)`,
        text: corpo
      })).catch(() => { /* sendEmail já trata, aqui só evitamos unhandled rejection */ });
    }
  }

  return { bells, destinatarios };
}

/**
 * Avisa o CLIENTE por e-mail que o escritório respondeu — se ele permitiu notificações por e-mail
 * e tem e-mail cadastrado. Devolve o resultado do sendEmail (ou {sent:false,reason} quando pulado).
 */
export async function notificarClienteResposta({ client, senderName, mensagem }) {
  if (!client) return { sent: false, reason: 'no_client' };
  if (!client.email) return { sent: false, reason: 'no_email' };
  if (!client.email_notifications) return { sent: false, reason: 'opted_out' };

  const nome = client.full_name || client.fullName || 'cliente';
  const autor = senderName || 'Escritório Jorge Alvim Advocacia';
  const corpo =
    `Olá, ${nome}!\n\n` +
    `Você recebeu uma nova mensagem de ${autor} no seu Portal do Cliente:\n\n` +
    `"${resumo(mensagem, 500)}"\n\n` +
    `Acesse o Portal do Cliente no nosso site para ler e responder com segurança.\n\n` +
    `Jorge Alvim Advocacia — OAB/MG 222.943`;

  return sendEmail({
    to: client.email,
    subject: 'Nova mensagem do seu advogado — Jorge Alvim Advocacia',
    text: corpo
  });
}
