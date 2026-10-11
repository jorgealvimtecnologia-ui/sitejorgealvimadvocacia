/**
 * ALERTAS DE PRAZO POR WHATSAPP E E-MAIL — SÓ PARA ADVOGADOS (AUD-04)
 *
 * Regras:
 *  - Quem recebe alerta EXTERNO (WhatsApp/e-mail) é APENAS advogado: integrante ATIVO do
 *    cadastro do escritório (office_members) com função "Advogado…" e número da OAB
 *    preenchido. Estagiário, secretária, administrativo ou "Empresário/Sócio" sem função
 *    de advogado nunca recebem — mesmo que o controle de acesso os rotule 'advogado'
 *    (esse rótulo é o PADRÃO da coluna e não prova nada). Há uma trava final no envio.
 *  - Escalonamento: responsável em D-7, D-3, D-1, no dia (D-0) e nos 3 dias seguintes ao
 *    vencimento. Sem ciência em D-1/D-0/vencido: avisa também o substituto e o titular.
 *  - Ciência: link no próprio aviso (página com botão — GET nunca confirma, para o
 *    pré-visualizador do WhatsApp/e-mail não confirmar sozinho) ou botão no painel.
 *    Fica registrado quem, quando e por qual meio.
 *  - Nada falha em silêncio: cada envio é registrado, falha é reenviada (até 3x) e depois
 *    vira alerta crítico no painel.
 *  - Só entre 07h e 21h (Brasília). O aviso não leva nome de cliente (sigilo).
 */
import crypto from 'node:crypto';

export const SEND_START_HOUR = 7;
export const SEND_END_HOUR = 21;
export const MAX_ATTEMPTS = 3;
export const OVERDUE_DAYS = 3;
const TZ = 'America/Sao_Paulo';
const LAWYER_BRAND = Symbol('advogado-verificado');

// ---------------------------------------------------------------------------
// Tabelas (mesmo esquema para o módulo e para os testes)
// ---------------------------------------------------------------------------
export function ensureDeadlineAlertTables(db) {
  db.exec(`
    -- Preferências de alerta de cada ADVOGADO (a identidade vem de office_members).
    CREATE TABLE IF NOT EXISTS deadline_alert_prefs (
      member_id TEXT PRIMARY KEY,
      notify_whatsapp INTEGER NOT NULL DEFAULT 1,
      notify_email INTEGER NOT NULL DEFAULT 1,
      whatsapp TEXT,
      alert_email TEXT,
      is_titular INTEGER NOT NULL DEFAULT 0,
      substitute_member_id TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );
    -- Registro de cada aviso: quem, por qual canal, em qual etapa, se chegou ou falhou.
    CREATE TABLE IF NOT EXISTS deadline_alert_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      member_id TEXT NOT NULL,
      member_name TEXT,
      channel TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      updated_at TEXT,
      UNIQUE (resource_type, resource_id, stage, member_id, channel)
    );
    -- Ciência: quem confirmou que viu o prazo, quando e por qual meio.
    CREATE TABLE IF NOT EXISTS deadline_acks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      member_name TEXT,
      acked_by TEXT,
      via TEXT NOT NULL,
      ip TEXT,
      acked_at TEXT NOT NULL,
      UNIQUE (resource_type, resource_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deadline_log_status ON deadline_alert_log(status, updated_at);
  `);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
/** Nome sem acentos, títulos (Dr./Dra.) e pontuação, para comparar pessoas. */
export function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(dr|dra|doutor|doutora|adv|advogado|advogada|sr|sra)\b\.?/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mesma pessoa? Igualdade, ou o nome mais curto (≥ 2 palavras) contido no mais longo. */
export function sameName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.length >= 2 && short.every((t) => long.includes(t));
}

/** Telefone brasileiro em dígitos com DDI 55 (ex.: 5532998153429), ou null se inválido. */
export function normalizeBrPhone(raw) {
  let d = String(raw || '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

/** Data de hoje em Brasília (YYYY-MM-DD) e hora local de Brasília. */
export function nowInSaoPaulo(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function inSendWindow(now = new Date()) {
  const { hour } = nowInSaoPaulo(now);
  return hour >= SEND_START_HOUR && hour < SEND_END_HOUR;
}

/** Dias entre duas datas YYYY-MM-DD (due - today). */
export function daysBetween(todayStr, dueStr) {
  const t = Date.parse(`${todayStr}T00:00:00Z`);
  const d = Date.parse(`${String(dueStr).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) || Number.isNaN(d) ? null : Math.round((d - t) / 86400000);
}

/** Etapa do escalonamento para os dias que faltam (null = ainda longe ou vencido há muito). */
export function stageFor(daysLeft) {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return -daysLeft <= OVERDUE_DAYS ? `V${-daysLeft}` : null;
  if (daysLeft === 0) return 'D0';
  if (daysLeft <= 1) return 'D1';
  if (daysLeft <= 3) return 'D3';
  if (daysLeft <= 7) return 'D7';
  return null;
}
const ESCALATING = new Set(['D1', 'D0', 'V1', 'V2', 'V3']); // etapas em que a falta de ciência escala
const FINAL = new Set(['D0', 'V1', 'V2', 'V3']); // etapas em que o responsável é avisado mesmo após dar ciência

export function stageLabel(stage) {
  if (stage === 'D0') return 'VENCE HOJE';
  if (stage === 'D1') return 'vence AMANHÃ';
  if (stage === 'D3') return 'vence em até 3 dias';
  if (stage === 'D7') return 'vence em até 7 dias';
  if (stage?.startsWith('V')) return `VENCIDO há ${stage.slice(1)} dia(s)`;
  return stage || '';
}

// ---------------------------------------------------------------------------
// Quem é advogado
// ---------------------------------------------------------------------------
const hasOab = (row) => String(row.oab_number || '').replace(/\D/g, '').length >= 3;

/**
 * Advogado = integrante ATIVO, função contendo "Advogado" e OAB preenchida.
 * Estagiário NÃO é advogado (a inscrição de estagiário não é de advogado).
 */
export function isLawyerRow(row) {
  if (!row) return false;
  if (String(row.status || 'Ativo').toLowerCase() !== 'ativo') return false;
  if (!/advogad/i.test(String(row.role_type || ''))) return false;
  if (/estagi/i.test(String(row.role_type || ''))) return false;
  return hasOab(row);
}

/** Motivo pelo qual um integrante NÃO recebe alerta externo (para mostrar ao titular). */
export function whyNotLawyer(row) {
  if (String(row.status || 'Ativo').toLowerCase() !== 'ativo') return 'inativo';
  if (/estagi/i.test(String(row.role_type || ''))) return 'estagiário (não é advogado)';
  if (!/advogad/i.test(String(row.role_type || '')))
    return `função "${row.role_type || 'não informada'}" não é de advogado`;
  if (!hasOab(row)) return 'sem número da OAB cadastrado';
  return null;
}

/** Trava final: alerta externo só vai a quem passou por loadLawyers (advogado ativo com OAB). */
export function assertVerifiedLawyer(recipient) {
  if (!recipient || recipient.verifiedLawyer !== LAWYER_BRAND) {
    throw new Error('Recusado: alerta externo (WhatsApp/e-mail) só pode ir a advogado verificado (ativo, com OAB).');
  }
}

function toLawyer(row, prefs) {
  const p = prefs || {};
  const whatsapp = normalizeBrPhone(p.whatsapp || row.phone);
  const email = isValidEmail(p.alert_email) ? p.alert_email.trim() : isValidEmail(row.email) ? row.email.trim() : null;
  return Object.freeze({
    verifiedLawyer: LAWYER_BRAND,
    id: row.id,
    name: row.name,
    oab: `${String(row.oab_number).trim()}/${row.oab_uf || 'MG'}`,
    whatsapp,
    email,
    notifyWhatsapp: p.notify_whatsapp === undefined || p.notify_whatsapp === null ? true : !!p.notify_whatsapp,
    notifyEmail: p.notify_email === undefined || p.notify_email === null ? true : !!p.notify_email,
    isTitular: !!p.is_titular,
    substituteId: p.substitute_member_id || null,
  });
}

/** Advogados habilitados a receber alerta externo, com suas preferências. */
export function loadLawyers(db) {
  const members = db.prepare(`SELECT * FROM office_members`).all();
  const prefs = new Map(
    db
      .prepare(`SELECT * FROM deadline_alert_prefs`)
      .all()
      .map((p) => [p.member_id, p])
  );
  return members.filter(isLawyerRow).map((m) => toLawyer(m, prefs.get(m.id)));
}

/** Integrantes que NÃO recebem alerta externo, e por quê. */
export function loadExcluded(db) {
  return db
    .prepare(`SELECT id, name, role_type, status, oab_number FROM office_members`)
    .all()
    .map((m) => ({ id: m.id, name: m.name, role_type: m.role_type, reason: whyNotLawyer(m) }))
    .filter((m) => m.reason);
}

/** Identifica o advogado responsável pelo prazo; null se não for advogado cadastrado. */
export function resolveResponsible(deadline, lawyers) {
  if (deadline.responsibleMemberId) {
    const byId = lawyers.find((l) => l.id === deadline.responsibleMemberId);
    if (byId) return byId;
  }
  if (deadline.responsibleName) return lawyers.find((l) => sameName(l.name, deadline.responsibleName)) || null;
  return null;
}

// ---------------------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------------------
const safe = (fn) => {
  try {
    return fn();
  } catch {
    return [];
  }
};

/** Prazos abertos das três fontes que a central de notificações já varre. */
export function loadDeadlines(db) {
  const out = [];
  for (const e of safe(() =>
    db
      .prepare(
        `
      SELECT id, title, start_datetime, lawyer_id, lawyer_name, lawsuit_number FROM calendar_events
      WHERE status NOT IN ('concluido','cancelado')
        AND (event_type IN ('prazo_fatal','audiencia','diligencia') OR priority IN ('fatal','alta'))`
      )
      .all()
  )) {
    out.push({
      type: 'calendar_event',
      id: String(e.id),
      title: e.title,
      due: String(e.start_datetime || '').slice(0, 10),
      process: e.lawsuit_number || null,
      responsibleName: e.lawyer_name || null,
      responsibleMemberId: e.lawyer_id || null,
    });
  }
  for (const p of safe(() =>
    db
      .prepare(
        `
      SELECT id, numeroprocessocommascara, tipo_comunicacao, advogado_nome, deadline_date FROM court_publications
      WHERE status NOT IN ('arquivado') AND deadline_date IS NOT NULL AND deadline_date != ''`
      )
      .all()
  )) {
    out.push({
      type: 'court_publication',
      id: String(p.id),
      title: `Prazo de ${p.tipo_comunicacao || 'publicação'}`,
      due: String(p.deadline_date).slice(0, 10),
      process: p.numeroprocessocommascara || null,
      responsibleName: p.advogado_nome || null,
      responsibleMemberId: null,
    });
  }
  for (const r of safe(() =>
    db
      .prepare(
        `
      SELECT id, title, agency_name, deadline_date, responsible FROM admin_requests
      WHERE deadline_date IS NOT NULL AND deadline_date != '' AND status NOT IN ('concluido','indeferido','arquivado')`
      )
      .all()
  )) {
    out.push({
      type: 'admin_request',
      id: String(r.id),
      title: `Requerimento: ${r.title}${r.agency_name ? ` (${r.agency_name})` : ''}`,
      due: String(r.deadline_date).slice(0, 10),
      process: null,
      responsibleName: r.responsible || null,
      responsibleMemberId: null,
    });
  }
  return out.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.due));
}

// ---------------------------------------------------------------------------
// Ciência (confirmação de que o advogado viu o prazo)
// ---------------------------------------------------------------------------
export function recordAck(db, { type, id, member, via, actor = null, ip = null, now = new Date() }) {
  const r = db
    .prepare(
      `INSERT OR IGNORE INTO deadline_acks (resource_type, resource_id, member_id, member_name, acked_by, via, ip, acked_at) VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(type, String(id), member.id, member.name, actor || member.name, via, ip, now.toISOString());
  return { created: Number(r.changes) > 0 };
}

export function ackedMembers(db, type, id) {
  return new Set(
    db
      .prepare(`SELECT member_id FROM deadline_acks WHERE resource_type = ? AND resource_id = ?`)
      .all(type, String(id))
      .map((a) => a.member_id)
  );
}

/** Segredo do link de ciência: variável DEADLINE_ACK_SECRET ou um valor gerado e guardado no banco. */
export function getAckSecret(db, env = process.env) {
  if (env.DEADLINE_ACK_SECRET && env.DEADLINE_ACK_SECRET.length >= 32) return env.DEADLINE_ACK_SECRET;
  const row = db.prepare(`SELECT value FROM system_settings WHERE key = 'deadline_ack_secret'`).get();
  if (row?.value && row.value.length >= 32) return row.value;
  const secret = crypto.randomBytes(48).toString('base64');
  db.prepare(
    `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('deadline_ack_secret', ?, ?)`
  ).run(secret, new Date().toISOString());
  return secret;
}

const b64u = (b) => Buffer.from(b).toString('base64url');

export function makeAckToken(secret, { type, id, memberId, dueDate }) {
  const exp = Math.floor(Date.parse(`${dueDate}T00:00:00Z`) / 1000) + (OVERDUE_DAYS + 11) * 86400; // vale até ~14 dias após a data fatal
  const payload = b64u(JSON.stringify({ t: type, i: String(id), m: memberId, e: exp }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `v1.${payload}.${sig}`;
}

export function verifyAckToken(secret, token, now = new Date()) {
  const [v, payload, sig] = String(token || '').split('.');
  if (v !== 'v1' || !payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!d.t || !d.i || !d.m || !d.e || d.e < Math.floor(now.getTime() / 1000)) return null;
    return { type: d.t, id: d.i, memberId: d.m };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mensagens (sem nome de cliente: sigilo)
// ---------------------------------------------------------------------------
const fmtDate = (s) => String(s).split('-').reverse().join('/');

export function buildMessages({
  deadline,
  stage,
  recipient,
  role,
  onBehalfOf,
  link,
  siteName = 'Jorge Alvim Advocacia',
}) {
  const urgency = stageLabel(stage);
  const linhas = [
    `*PRAZO ${urgency}* — ${siteName}`,
    `Dr(a). ${recipient.name},`,
    '',
    `• ${deadline.title}`,
    deadline.process ? `• Processo: ${deadline.process}` : null,
    `• Data fatal: ${fmtDate(deadline.due)}`,
  ];
  if (role === 'substituto')
    linhas.push(
      '',
      `Aviso como SUBSTITUTO(A)${onBehalfOf ? ` de ${onBehalfOf}` : ''}: o responsável ainda não confirmou ciência.`
    );
  if (role === 'titular')
    linhas.push(
      '',
      onBehalfOf
        ? `Aviso de ESCALONAMENTO ao titular: ${onBehalfOf} ainda não confirmou ciência.`
        : 'Aviso ao titular: prazo sem advogado responsável identificado no cadastro.'
    );
  linhas.push('', `Confirmar ciência: ${link}`);
  const text = linhas.filter((l) => l !== null).join('\n');
  const subject = `[PRAZO ${stage}] ${deadline.title}${deadline.process ? ` — Proc. ${deadline.process}` : ''} — ${fmtDate(deadline.due)}`;
  return { whatsapp: text, email: { subject, text } };
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------
/** Destinatários de uma etapa: responsável, e (se escalar) substituto e titular. */
export function planRecipients({ deadline, stage, lawyers, acked }) {
  const responsible = resolveResponsible(deadline, lawyers);
  const titulars = lawyers.filter((l) => l.isTitular);
  const out = [];
  const add = (lawyer, role, onBehalfOf = null) => {
    if (lawyer && !out.some((o) => o.recipient.id === lawyer.id)) out.push({ recipient: lawyer, role, onBehalfOf });
  };

  if (responsible) {
    const ownAck = acked.has(responsible.id);
    if (!ownAck || FINAL.has(stage)) add(responsible, 'responsavel');
    const anyAck =
      acked.has(responsible.id) ||
      titulars.some((t) => acked.has(t.id)) ||
      (responsible.substituteId && acked.has(responsible.substituteId));
    if (ESCALATING.has(stage) && !anyAck) {
      add(
        lawyers.find((l) => l.id === responsible.substituteId),
        'substituto',
        responsible.name
      );
      titulars.forEach((t) => add(t, 'titular', responsible.name));
    }
  } else {
    // Sem advogado responsável identificado (vazio, ou nome que não é de advogado): o titular responde.
    titulars.filter((t) => !acked.has(t.id) || FINAL.has(stage)).forEach((t) => add(t, 'titular', null));
  }
  return { responsible, items: out };
}

/**
 * Varre os prazos e envia os avisos devidos. Idempotente (log com chave única) e com
 * reenvio das falhas. `senders` são injetáveis (testes).
 * @returns {Promise<{ window:boolean, planned:number, sent:number, failed:number, skipped:number, gaveUp:number, noTitular:boolean, items:object[] }>}
 */
export async function runDeadlineAlerts({
  db,
  now = new Date(),
  senders,
  siteUrl = 'https://jorgealvimadvocacia.com.br',
  dryRun = false,
  notify = () => {},
  log = console,
} = {}) {
  const summary = {
    window: inSendWindow(now),
    planned: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    gaveUp: 0,
    noTitular: false,
    items: [],
  };
  if (!summary.window && !dryRun) return summary;

  const lawyers = loadLawyers(db);
  summary.noTitular = !lawyers.some((l) => l.isTitular);
  const today = nowInSaoPaulo(now).date;
  const secret = getAckSecret(db);
  const nowIso = now.toISOString();

  for (const deadline of loadDeadlines(db)) {
    const stage = stageFor(daysBetween(today, deadline.due));
    if (!stage) continue;
    const acked = ackedMembers(db, deadline.type, deadline.id);
    const { items } = planRecipients({ deadline, stage, lawyers, acked });
    if (!items.length) {
      if (summary.noTitular) notify({ kind: 'sem-titular', deadline, stage });
      continue;
    }

    for (const { recipient, role, onBehalfOf } of items) {
      assertVerifiedLawyer(recipient);
      const link = `${siteUrl.replace(/\/+$/, '')}/ciencia/${makeAckToken(secret, { type: deadline.type, id: deadline.id, memberId: recipient.id, dueDate: deadline.due })}`;
      const msgs = buildMessages({ deadline, stage, recipient, role, onBehalfOf, link });
      const channels = [];
      if (recipient.notifyWhatsapp && recipient.whatsapp) channels.push('whatsapp');
      if (recipient.notifyEmail && recipient.email) channels.push('email');
      if (!channels.length) channels.push('nenhum');

      for (const channel of channels) {
        const key = [deadline.type, deadline.id, stage, recipient.id, channel];
        const row = db
          .prepare(
            `SELECT * FROM deadline_alert_log WHERE resource_type=? AND resource_id=? AND stage=? AND member_id=? AND channel=?`
          )
          .get(...key);
        if (row && (row.status === 'enviado' || row.status === 'desistiu')) {
          summary.skipped++;
          continue;
        }
        summary.planned++;
        summary.items.push({
          deadline: `${deadline.type}:${deadline.id}`,
          stage,
          recipient: recipient.name,
          role,
          channel,
          retry: !!row,
        });
        if (dryRun) continue;

        if (!row) {
          db.prepare(
            `INSERT INTO deadline_alert_log (resource_type, resource_id, stage, member_id, member_name, channel, role, status, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'falha',0,?,?)`
          ).run(...key.slice(0, 3), recipient.id, recipient.name, channel, role, nowIso, nowIso);
        }
        let result;
        if (channel === 'nenhum') result = { sent: false, reason: 'sem WhatsApp nem e-mail válido cadastrado' };
        else if (channel === 'whatsapp') result = await senders.whatsapp(recipient.whatsapp, msgs.whatsapp);
        else result = await senders.email({ to: recipient.email, subject: msgs.email.subject, text: msgs.email.text });

        const attempts = (row?.attempts || 0) + 1;
        if (result?.sent) {
          db.prepare(
            `UPDATE deadline_alert_log SET status='enviado', attempts=?, last_error=NULL, sent_at=?, updated_at=? WHERE resource_type=? AND resource_id=? AND stage=? AND member_id=? AND channel=?`
          ).run(attempts, nowIso, nowIso, ...key);
          summary.sent++;
        } else {
          const gaveUp = attempts >= MAX_ATTEMPTS || channel === 'nenhum';
          db.prepare(
            `UPDATE deadline_alert_log SET status=?, attempts=?, last_error=?, updated_at=? WHERE resource_type=? AND resource_id=? AND stage=? AND member_id=? AND channel=?`
          ).run(
            gaveUp ? 'desistiu' : 'falha',
            attempts,
            String(result?.reason || result?.error || 'falha no envio').slice(0, 300),
            nowIso,
            ...key
          );
          summary.failed++;
          log.warn?.(
            `[PRAZOS] Falha ao avisar ${recipient.name} (${channel}) sobre ${deadline.title}: ${result?.reason || result?.error || 'erro'}`
          );
          if (gaveUp) {
            summary.gaveUp++;
            notify({ kind: 'desistiu', deadline, stage, recipient, channel, reason: result?.reason || result?.error });
          }
        }
      }
    }
  }
  return summary;
}
