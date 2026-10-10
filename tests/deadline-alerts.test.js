/**
 * Alertas de prazo por WhatsApp/e-mail (AUD-04): SÓ para advogados, com escalonamento,
 * ciência, registro de falhas e reenvio. Usa um banco em memória e remetentes falsos.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  MAX_ATTEMPTS,
  normalizeName,
  sameName,
  normalizeBrPhone,
  isValidEmail,
  inSendWindow,
  nowInSaoPaulo,
  daysBetween,
  stageFor,
  isLawyerRow,
  whyNotLawyer,
  loadLawyers,
  loadExcluded,
  loadDeadlines,
  resolveResponsible,
  planRecipients,
  assertVerifiedLawyer,
  buildMessages,
  recordAck,
  ackedMembers,
  getAckSecret,
  makeAckToken,
  verifyAckToken,
  runDeadlineAlerts,
  ensureDeadlineAlertTables,
} from '../src/modules/deadline-alerts/deadline-alerts.service.js';

// 05/10/2026 10:00 em Brasília (UTC-3). Prazos de teste usam datas relativas a esse "hoje".
const NOW = new Date('2026-10-05T13:00:00Z');
const day = (offset) => new Date(Date.UTC(2026, 9, 5 + offset)).toISOString().slice(0, 10);

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE office_members (id TEXT PRIMARY KEY, office_id TEXT, role_type TEXT, name TEXT, oab_number TEXT, oab_uf TEXT DEFAULT 'MG', email TEXT, phone TEXT, status TEXT DEFAULT 'Ativo');
    CREATE TABLE calendar_events (id TEXT PRIMARY KEY, title TEXT, event_type TEXT, start_datetime TEXT, lawyer_id TEXT, lawyer_name TEXT, client_name TEXT, lawsuit_number TEXT, priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'agendado');
    CREATE TABLE court_publications (id TEXT PRIMARY KEY, numeroprocessocommascara TEXT, tipo_comunicacao TEXT, advogado_nome TEXT, deadline_date TEXT, status TEXT DEFAULT 'novo');
    CREATE TABLE admin_requests (id TEXT PRIMARY KEY, title TEXT, agency_name TEXT, deadline_date TEXT, responsible TEXT, status TEXT DEFAULT 'aberto');
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE access_permissions (user_id TEXT PRIMARY KEY, user_name TEXT, role_template TEXT NOT NULL DEFAULT 'advogado');
  `);
  ensureDeadlineAlertTables(db);
  return db;
}

const member = (db, m) =>
  db
    .prepare(
      `INSERT INTO office_members (id, office_id, role_type, name, oab_number, oab_uf, email, phone, status) VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(m.id, 'OFF1', m.role_type, m.name, m.oab ?? null, 'MG', m.email ?? null, m.phone ?? null, m.status ?? 'Ativo');
const prefs = (db, memberId, p) =>
  db
    .prepare(
      `INSERT OR REPLACE INTO deadline_alert_prefs (member_id, notify_whatsapp, notify_email, whatsapp, alert_email, is_titular, substitute_member_id, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      memberId,
      p.notify_whatsapp ?? 1,
      p.notify_email ?? 1,
      p.whatsapp ?? null,
      p.alert_email ?? null,
      p.is_titular ?? 0,
      p.substitute_member_id ?? null,
      NOW.toISOString()
    );
const event = (db, e) =>
  db
    .prepare(
      `INSERT INTO calendar_events (id, title, event_type, start_datetime, lawyer_id, lawyer_name, client_name, lawsuit_number, priority, status) VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      e.id,
      e.title ?? 'Contestação',
      'prazo_fatal',
      e.due,
      e.lawyer_id ?? null,
      e.lawyer_name ?? null,
      e.client_name ?? 'CLIENTE SIGILOSO',
      e.process ?? '0001234-56.2026.8.13.0145',
      'fatal',
      'agendado'
    );

/** Remetentes falsos que registram o que foi enviado, e podem falhar. */
function senders({ failWhatsapp = false, failEmail = false } = {}) {
  const calls = { whatsapp: [], email: [] };
  return {
    calls,
    whatsapp: async (phone, text) => {
      calls.whatsapp.push({ phone, text });
      return failWhatsapp ? { sent: false, reason: 'gateway_http_500' } : { sent: true };
    },
    email: async (msg) => {
      calls.email.push(msg);
      return failEmail ? { sent: false, reason: 'send_failed' } : { sent: true };
    },
  };
}
const run = (db, s, extra = {}) =>
  runDeadlineAlerts({ db, now: NOW, senders: s, notify: () => {}, log: { warn() {} }, ...extra });

describe('utilidades', () => {
  it('normalizeName / sameName', () => {
    assert.equal(normalizeName('Dra. Mariana  Álvim'), 'mariana alvim');
    assert.equal(sameName('Dr. Jorge Eduardo da Silva Alvim', 'Jorge Alvim'), true);
    assert.equal(sameName('Jorge Alvim', 'Mariana Alvim'), false);
    assert.equal(sameName('Jorge', 'Jorge Alvim'), false); // nome curto demais para casar
    assert.equal(sameName('', 'Jorge Alvim'), false);
  });

  it('normalizeBrPhone', () => {
    assert.equal(normalizeBrPhone('(32) 99815-3429'), '5532998153429');
    assert.equal(normalizeBrPhone('+55 32 99815-3429'), '5532998153429');
    assert.equal(normalizeBrPhone('32 3215-4000'), '553232154000');
    assert.equal(normalizeBrPhone('12345'), null);
    assert.equal(normalizeBrPhone(''), null);
  });

  it('isValidEmail', () => {
    assert.equal(isValidEmail('a@b.com'), true);
    assert.equal(isValidEmail('sem-arroba'), false);
  });

  it('janela de envio: 07h às 21h de Brasília', () => {
    assert.equal(inSendWindow(new Date('2026-10-05T09:59:00Z')), false); // 06:59
    assert.equal(inSendWindow(new Date('2026-10-05T10:00:00Z')), true); // 07:00
    assert.equal(inSendWindow(new Date('2026-10-05T23:59:00Z')), true); // 20:59
    assert.equal(inSendWindow(new Date('2026-10-06T00:00:00Z')), false); // 21:00
    assert.equal(nowInSaoPaulo(new Date('2026-10-06T01:30:00Z')).date, '2026-10-05'); // 22:30 ainda é dia 05
  });

  it('daysBetween e stageFor', () => {
    assert.equal(daysBetween('2026-10-05', '2026-10-08'), 3);
    assert.equal(daysBetween('2026-10-05', '2026-10-05T14:00'), 0);
    const casos = [
      [8, null],
      [7, 'D7'],
      [4, 'D7'],
      [3, 'D3'],
      [2, 'D3'],
      [1, 'D1'],
      [0, 'D0'],
      [-1, 'V1'],
      [-3, 'V3'],
      [-4, null],
      [null, null],
    ];
    for (const [dias, etapa] of casos) assert.equal(stageFor(dias), etapa, `dias=${dias}`);
  });
});

describe('quem é advogado (a regra central)', () => {
  const base = { oab_number: '222943', role_type: 'Advogado Sócio', status: 'Ativo' };

  it('só integrante ATIVO, de função "Advogado" e COM OAB', () => {
    assert.equal(isLawyerRow({ ...base }), true);
    assert.equal(isLawyerRow({ ...base, role_type: 'Advogado Associado' }), true);
    assert.equal(isLawyerRow({ ...base, oab_number: '' }), false, 'sem OAB');
    assert.equal(isLawyerRow({ ...base, oab_number: null }), false);
    assert.equal(isLawyerRow({ ...base, oab_number: '12' }), false, 'OAB curta demais');
    assert.equal(isLawyerRow({ ...base, status: 'Inativo' }), false);
    assert.equal(isLawyerRow({ ...base, role_type: 'Estagiário' }), false, 'estagiário com inscrição de estagiário');
    assert.equal(isLawyerRow({ ...base, role_type: 'Secretária Executiva' }), false);
    assert.equal(isLawyerRow({ ...base, role_type: 'Recepcionista' }), false);
    assert.equal(isLawyerRow({ ...base, role_type: 'Pessoal da Administração' }), false);
    assert.equal(
      isLawyerRow({ ...base, role_type: 'Empresário / Sócio' }),
      false,
      'sócio empresário não é, por si, advogado'
    );
    assert.equal(isLawyerRow({ ...base, role_type: 'Motorista / Logística' }), false);
    assert.equal(isLawyerRow(null), false);
  });

  it('whyNotLawyer explica o motivo', () => {
    assert.match(whyNotLawyer({ ...base, role_type: 'Estagiário' }), /estagiário/);
    assert.match(whyNotLawyer({ ...base, oab_number: '' }), /sem número da OAB/);
    assert.match(whyNotLawyer({ ...base, role_type: 'Recepcionista' }), /não é de advogado/);
    assert.match(whyNotLawyer({ ...base, status: 'Inativo' }), /inativo/);
    assert.equal(whyNotLawyer(base), null);
  });

  it('loadLawyers devolve só advogados; loadExcluded lista os demais com o motivo', () => {
    const db = makeDb();
    member(db, {
      id: 'M1',
      role_type: 'Advogado Sócio',
      name: 'Jorge Alvim',
      oab: '222943',
      phone: '(32) 99815-3429',
      email: 'jorge@x.com',
    });
    member(db, { id: 'M2', role_type: 'Advogado Associado', name: 'Ana Lima', oab: '100200', phone: '32 98888-7777' });
    member(db, { id: 'M3', role_type: 'Estagiário', name: 'Pedro Estagio', oab: '55555', phone: '32 97777-6666' });
    member(db, { id: 'M4', role_type: 'Secretária Executiva', name: 'Maria Secretaria', phone: '32 96666-5555' });
    member(db, { id: 'M5', role_type: 'Advogado Associado', name: 'Sem Oab', oab: '' });
    const ls = loadLawyers(db);
    assert.deepEqual(ls.map((l) => l.id).sort(), ['M1', 'M2']);
    assert.equal(ls[0].whatsapp ?? ls.find((l) => l.id === 'M1').whatsapp, '5532998153429');
    assert.ok(Object.isFrozen(ls[0]));
    const ex = Object.fromEntries(loadExcluded(db).map((e) => [e.id, e.reason]));
    assert.match(ex.M3, /estagiário/);
    assert.match(ex.M4, /não é de advogado/);
    assert.match(ex.M5, /sem número da OAB/);
    assert.equal(ex.M1, undefined);
  });

  it('o rótulo "advogado" do controle de acesso (padrão da coluna) NÃO torna ninguém advogado', () => {
    const db = makeDb();
    member(db, { id: 'M4', role_type: 'Secretária Executiva', name: 'Maria Secretaria', phone: '32 96666-5555' });
    db.prepare(`INSERT INTO access_permissions (user_id, user_name) VALUES ('M4','Maria Secretaria')`).run(); // role_template cai no DEFAULT 'advogado'
    assert.equal(db.prepare(`SELECT role_template FROM access_permissions`).get().role_template, 'advogado');
    assert.deepEqual(loadLawyers(db), []);
  });

  it('assertVerifiedLawyer recusa quem não veio de loadLawyers', () => {
    const db = makeDb();
    member(db, { id: 'M1', role_type: 'Advogado Sócio', name: 'Jorge Alvim', oab: '222943', phone: '32998153429' });
    assertVerifiedLawyer(loadLawyers(db)[0]); // não lança
    for (const falso of [
      { id: 'M9', name: 'Maria', whatsapp: '5532966665555' },
      null,
      undefined,
      { verifiedLawyer: Symbol('forjado') },
    ]) {
      assert.throws(() => assertVerifiedLawyer(falso), /só pode ir a advogado verificado/);
    }
  });

  it('resolveResponsible por id e por nome (com título e acento)', () => {
    const db = makeDb();
    member(db, {
      id: 'M1',
      role_type: 'Advogado Sócio',
      name: 'Jorge Eduardo da Silva Alvim',
      oab: '222943',
      phone: '32998153429',
    });
    member(db, { id: 'M4', role_type: 'Secretária Executiva', name: 'Maria Secretaria' });
    const ls = loadLawyers(db);
    assert.equal(resolveResponsible({ responsibleMemberId: 'M1' }, ls).id, 'M1');
    assert.equal(resolveResponsible({ responsibleName: 'Dr. Jorge Alvim' }, ls).id, 'M1');
    assert.equal(
      resolveResponsible({ responsibleName: 'Maria Secretaria' }, ls),
      null,
      'secretária nunca é resolvida como responsável'
    );
    assert.equal(resolveResponsible({ responsibleName: null }, ls), null);
  });
});

describe('envio dos alertas', () => {
  let db;
  beforeEach(() => {
    db = makeDb();
    member(db, {
      id: 'M1',
      role_type: 'Advogado Sócio',
      name: 'Jorge Alvim',
      oab: '222943',
      phone: '(32) 99815-3429',
      email: 'jorge@exemplo.com',
    });
    member(db, {
      id: 'M2',
      role_type: 'Advogado Associado',
      name: 'Ana Lima',
      oab: '100200',
      phone: '(32) 98888-7777',
      email: 'ana@exemplo.com',
    });
    member(db, {
      id: 'M3',
      role_type: 'Advogado Associado',
      name: 'Carlos Substituto',
      oab: '300400',
      phone: '(32) 97777-6666',
      email: 'carlos@exemplo.com',
    });
    member(db, {
      id: 'M4',
      role_type: 'Secretária Executiva',
      name: 'Maria Secretaria',
      phone: '(32) 96666-5555',
      email: 'maria@exemplo.com',
    });
    member(db, {
      id: 'M5',
      role_type: 'Estagiário',
      name: 'Pedro Estagio',
      oab: '55555',
      phone: '(32) 95555-4444',
      email: 'pedro@exemplo.com',
    });
    prefs(db, 'M1', { is_titular: 1 });
    prefs(db, 'M2', { substitute_member_id: 'M3' });
  });

  const phones = (s) => s.calls.whatsapp.map((c) => c.phone).sort();
  const NAO_ADVOGADOS = ['5532966665555', '5532955554444'];

  it('responsável recebe WhatsApp e e-mail com data, processo e link de ciência — sem nome de cliente', async () => {
    event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
    const s = senders();
    const r = await run(db, s);
    assert.equal(r.sent, 2);
    assert.deepEqual(phones(s), ['5532988887777']);
    const w = s.calls.whatsapp[0].text;
    assert.match(w, /PRAZO vence em até 3 dias/);
    assert.match(w, /Contestação/);
    assert.match(w, /0001234-56\.2026\.8\.13\.0145/);
    assert.match(w, /08\/10\/2026/);
    assert.match(w, /https:\/\/jorgealvimadvocacia\.com\.br\/ciencia\/v1\./);
    assert.ok(!/SIGILOSO/.test(w + JSON.stringify(s.calls.email)), 'nome de cliente vazou no aviso');
    assert.equal(s.calls.email[0].to, 'ana@exemplo.com');
    assert.match(s.calls.email[0].subject, /^\[PRAZO D3\] Contestação — Proc\. 0001234/);
  });

  it('NUNCA envia a quem não é advogado, mesmo se for o "responsável" digitado no prazo', async () => {
    event(db, { id: 'E1', due: day(1), lawyer_name: 'Maria Secretaria' });
    event(db, { id: 'E2', due: day(1), lawyer_name: 'Pedro Estagio' });
    db.prepare(
      `INSERT INTO court_publications (id, numeroprocessocommascara, tipo_comunicacao, advogado_nome, deadline_date) VALUES ('P1','1','Intimação','Maria Secretaria',?)`
    ).run(day(1));
    const s = senders();
    await run(db, s);
    for (const p of NAO_ADVOGADOS) assert.ok(!phones(s).includes(p), `WhatsApp enviado a quem não é advogado: ${p}`);
    for (const e of s.calls.email) assert.ok(!/maria@|pedro@/.test(e.to), `e-mail enviado a não advogado: ${e.to}`);
    assert.ok(phones(s).includes('5532998153429'), 'o titular (advogado) deveria ser avisado');
  });

  it('prazo sem responsável vai ao titular, e só a ele', async () => {
    event(db, { id: 'E1', due: day(3), lawyer_name: null });
    const s = senders();
    await run(db, s);
    assert.deepEqual(phones(s), ['5532998153429']);
    assert.match(s.calls.whatsapp[0].text, /sem advogado responsável identificado/);
  });

  it('sem responsável e sem titular: ninguém recebe, e avisa que falta titular', async () => {
    prefs(db, 'M1', { is_titular: 0 });
    event(db, { id: 'E1', due: day(3), lawyer_name: null });
    const s = senders();
    const avisos = [];
    const r = await run(db, s, { notify: (n) => avisos.push(n.kind) });
    assert.equal(r.noTitular, true);
    assert.equal(s.calls.whatsapp.length + s.calls.email.length, 0);
    assert.deepEqual(avisos, ['sem-titular']);
  });

  it('é idempotente: rodar de novo não repete o aviso', async () => {
    event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
    const s = senders();
    await run(db, s);
    const r2 = await run(db, s);
    assert.equal(r2.sent, 0);
    assert.equal(r2.skipped, 2);
    assert.equal(s.calls.whatsapp.length, 1);
  });

  it('cada etapa avisa uma vez: D3 e depois D1', async () => {
    event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
    const s = senders();
    await run(db, s);
    await runDeadlineAlerts({
      db,
      now: new Date(NOW.getTime() + 2 * 86400000),
      senders: s,
      notify: () => {},
      log: { warn() {} },
    });
    // D3: só o responsável (1). D1 sem ciência: responsável + substituto + titular (3).
    const porEtapa = Object.fromEntries(
      db
        .prepare(`SELECT stage, COUNT(*) c FROM deadline_alert_log WHERE channel='whatsapp' GROUP BY stage`)
        .all()
        .map((r) => [r.stage, r.c])
    );
    assert.deepEqual(porEtapa, { D3: 1, D1: 3 });
    assert.equal(s.calls.whatsapp.length, 4);
  });

  it('fora da janela 07h–21h: não envia nem registra nada', async () => {
    event(db, { id: 'E1', due: day(1), lawyer_name: 'Ana Lima' });
    const s = senders();
    const r = await run(db, s, { now: new Date('2026-10-05T03:00:00Z') }); // 00:00 em Brasília
    assert.equal(r.window, false);
    assert.equal(s.calls.whatsapp.length + s.calls.email.length, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM deadline_alert_log`).get().c, 0);
  });

  it('prazo longe (> 7 dias) e vencido há mais de 3 dias não geram aviso externo', async () => {
    event(db, { id: 'E1', due: day(8), lawyer_name: 'Ana Lima' });
    event(db, { id: 'E2', due: day(-4), lawyer_name: 'Ana Lima' });
    const s = senders();
    const r = await run(db, s);
    assert.equal(r.planned, 0);
  });

  describe('escalonamento sem ciência', () => {
    it('D1 sem ciência: responsável + substituto + titular (só advogados)', async () => {
      event(db, { id: 'E1', due: day(1), lawyer_name: 'Ana Lima' });
      const s = senders();
      await run(db, s);
      assert.deepEqual(phones(s), ['5532977776666', '5532988887777', '5532998153429']); // substituto, responsável, titular
      const papeis = Object.fromEntries(
        db
          .prepare(`SELECT member_id, role FROM deadline_alert_log WHERE channel='whatsapp'`)
          .all()
          .map((r) => [r.member_id, r.role])
      );
      assert.deepEqual(papeis, { M2: 'responsavel', M3: 'substituto', M1: 'titular' });
      const msgSubstituto = s.calls.whatsapp.find((c) => c.phone === '5532977776666').text;
      assert.match(msgSubstituto, /SUBSTITUTO\(A\) de Ana Lima/);
      const msgTitular = s.calls.whatsapp.find((c) => c.phone === '5532998153429').text;
      assert.match(msgTitular, /ESCALONAMENTO ao titular: Ana Lima ainda não confirmou ciência/);
    });

    it('D3 e D7 NÃO escalam (só o responsável)', async () => {
      event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
      const s = senders();
      await run(db, s);
      assert.deepEqual(phones(s), ['5532988887777']);
    });

    it('com ciência do responsável, D1 não escala nem repete ao responsável', async () => {
      event(db, { id: 'E1', due: day(1), lawyer_name: 'Ana Lima' });
      recordAck(db, {
        type: 'calendar_event',
        id: 'E1',
        member: { id: 'M2', name: 'Ana Lima' },
        via: 'link',
        now: NOW,
      });
      const s = senders();
      const r = await run(db, s);
      assert.equal(r.planned, 0);
      assert.equal(s.calls.whatsapp.length, 0);
    });

    it('no dia (D0) o responsável é avisado MESMO após a ciência, mas sem escalar', async () => {
      event(db, { id: 'E1', due: day(0), lawyer_name: 'Ana Lima' });
      recordAck(db, {
        type: 'calendar_event',
        id: 'E1',
        member: { id: 'M2', name: 'Ana Lima' },
        via: 'painel',
        now: NOW,
      });
      const s = senders();
      await run(db, s);
      assert.deepEqual(phones(s), ['5532988887777']);
      assert.match(s.calls.whatsapp[0].text, /VENCE HOJE/);
    });

    it('ciência do titular também interrompe o escalonamento ao substituto', async () => {
      event(db, { id: 'E1', due: day(1), lawyer_name: 'Ana Lima' });
      recordAck(db, {
        type: 'calendar_event',
        id: 'E1',
        member: { id: 'M1', name: 'Jorge Alvim' },
        via: 'painel',
        now: NOW,
      });
      const s = senders();
      await run(db, s);
      assert.deepEqual(phones(s), ['5532988887777'], 'só o responsável, que ainda não deu ciência');
    });

    it('vencido (V1) com responsável sem ciência escala também', async () => {
      event(db, { id: 'E1', due: day(-1), lawyer_name: 'Ana Lima' });
      const s = senders();
      await run(db, s);
      assert.equal(s.calls.whatsapp.length, 3);
      assert.match(s.calls.whatsapp[0].text, /VENCIDO há 1 dia/);
    });
  });

  describe('preferências por advogado', () => {
    it('notify_whatsapp = 0: só e-mail; notify_email = 0: só WhatsApp', async () => {
      prefs(db, 'M2', { notify_whatsapp: 0, substitute_member_id: 'M3' });
      prefs(db, 'M1', { is_titular: 1, notify_email: 0 });
      event(db, { id: 'E1', due: day(1), lawyer_name: 'Ana Lima' });
      const s = senders();
      await run(db, s);
      assert.ok(!phones(s).includes('5532988887777'), 'Ana desligou o WhatsApp');
      assert.ok(s.calls.email.some((e) => e.to === 'ana@exemplo.com'));
      assert.ok(phones(s).includes('5532998153429'));
      assert.ok(!s.calls.email.some((e) => e.to === 'jorge@exemplo.com'), 'Jorge desligou o e-mail');
    });

    it('número de WhatsApp específico nas preferências prevalece sobre o telefone do cadastro', async () => {
      prefs(db, 'M2', { whatsapp: '(32) 91234-5678', substitute_member_id: 'M3' });
      event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
      const s = senders();
      await run(db, s);
      assert.deepEqual(phones(s), ['5532912345678']);
    });
  });

  describe('falhas', () => {
    it('falha é registrada, reenviada na varredura seguinte e, esgotadas as tentativas, vira alerta no painel', async () => {
      event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
      const s = senders({ failWhatsapp: true });
      const avisos = [];
      const opts = { notify: (n) => avisos.push(n) };
      const r1 = await run(db, s, opts);
      assert.equal(r1.failed, 1);
      assert.equal(r1.sent, 1, 'o e-mail não depende do WhatsApp');
      const lin = () =>
        db.prepare(`SELECT status, attempts, last_error FROM deadline_alert_log WHERE channel='whatsapp'`).get();
      assert.deepEqual({ ...lin() }, { status: 'falha', attempts: 1, last_error: 'gateway_http_500' });
      await run(db, s, opts);
      assert.equal(lin().attempts, 2);
      assert.equal(avisos.length, 0);
      await run(db, s, opts);
      assert.deepEqual({ ...lin() }, { status: 'desistiu', attempts: MAX_ATTEMPTS, last_error: 'gateway_http_500' });
      assert.equal(avisos.length, 1);
      assert.equal(avisos[0].kind, 'desistiu');
      assert.equal(avisos[0].channel, 'whatsapp');
      await run(db, s, opts);
      assert.equal(lin().attempts, MAX_ATTEMPTS, 'não tenta de novo depois de desistir');
      assert.equal(s.calls.whatsapp.length, MAX_ATTEMPTS);
    });

    it('falha numa tentativa e sucesso na seguinte: fica "enviado"', async () => {
      event(db, { id: 'E1', due: day(3), lawyer_name: 'Ana Lima' });
      await run(db, senders({ failWhatsapp: true }));
      const s = senders();
      await run(db, s);
      assert.deepEqual(
        { ...db.prepare(`SELECT status, attempts FROM deadline_alert_log WHERE channel='whatsapp'`).get() },
        { status: 'enviado', attempts: 2 }
      );
    });

    it('advogado sem WhatsApp nem e-mail válidos: registra, desiste e avisa o painel (não fica em silêncio)', async () => {
      member(db, { id: 'M6', role_type: 'Advogado Associado', name: 'Sem Contato', oab: '777888' });
      event(db, { id: 'E1', due: day(3), lawyer_name: 'Sem Contato' });
      const avisos = [];
      const s = senders();
      await run(db, s, { notify: (n) => avisos.push(n) });
      assert.equal(s.calls.whatsapp.length + s.calls.email.length, 0);
      const l = db.prepare(`SELECT channel, status, last_error FROM deadline_alert_log`).get();
      assert.deepEqual(
        { ...l },
        { channel: 'nenhum', status: 'desistiu', last_error: 'sem WhatsApp nem e-mail válido cadastrado' }
      );
      assert.equal(avisos[0].kind, 'desistiu');
    });
  });

  it('modo simulação (dryRun) lista o que enviaria sem enviar nem registrar', async () => {
    event(db, { id: 'E1', due: day(1), lawyer_name: 'Ana Lima' });
    const s = senders();
    const r = await run(db, s, { dryRun: true });
    assert.ok(r.planned >= 3);
    assert.equal(s.calls.whatsapp.length + s.calls.email.length, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM deadline_alert_log`).get().c, 0);
    assert.ok(r.items.every((i) => i.stage === 'D1'));
  });

  it('as três fontes de prazo são consideradas e concluídos/cancelados são ignorados', () => {
    event(db, { id: 'E1', due: day(2), lawyer_name: 'Ana Lima' });
    db.prepare(`UPDATE calendar_events SET status='concluido' WHERE id='E1'`).run();
    event(db, { id: 'E2', due: day(2), lawyer_name: 'Ana Lima' });
    db.prepare(
      `INSERT INTO court_publications (id, numeroprocessocommascara, tipo_comunicacao, advogado_nome, deadline_date) VALUES ('P1','999','Sentença','Ana Lima',?)`
    ).run(day(5));
    db.prepare(
      `INSERT INTO court_publications (id, numeroprocessocommascara, tipo_comunicacao, advogado_nome, deadline_date, status) VALUES ('P2','998','Sentença','Ana Lima',?, 'arquivado')`
    ).run(day(5));
    db.prepare(
      `INSERT INTO admin_requests (id, title, agency_name, deadline_date, responsible) VALUES ('R1','Exigência','INSS',?,'Ana Lima')`
    ).run(day(6));
    const d = loadDeadlines(db);
    assert.deepEqual(d.map((x) => `${x.type}:${x.id}`).sort(), [
      'admin_request:R1',
      'calendar_event:E2',
      'court_publication:P1',
    ]);
  });

  it('planRecipients: sem substituto cadastrado, escala só ao titular', () => {
    const ls = loadLawyers(db);
    const deadline = { type: 'calendar_event', id: 'X', due: day(1), responsibleName: 'Carlos Substituto' };
    const { items } = planRecipients({ deadline, stage: 'D1', lawyers: ls, acked: new Set() });
    assert.deepEqual(
      items.map((i) => `${i.recipient.id}:${i.role}`),
      ['M3:responsavel', 'M1:titular']
    );
  });
});

describe('ciência e link', () => {
  it('recordAck é idempotente e ackedMembers lista quem confirmou', () => {
    const db = makeDb();
    const m = { id: 'M2', name: 'Ana Lima' };
    assert.equal(
      recordAck(db, { type: 'calendar_event', id: 'E1', member: m, via: 'link', ip: '1.2.3.4', now: NOW }).created,
      true
    );
    assert.equal(
      recordAck(db, { type: 'calendar_event', id: 'E1', member: m, via: 'painel', now: NOW }).created,
      false
    );
    assert.deepEqual([...ackedMembers(db, 'calendar_event', 'E1')], ['M2']);
    const a = db.prepare(`SELECT via, ip, acked_at FROM deadline_acks`).get();
    assert.equal(a.via, 'link');
    assert.equal(a.ip, '1.2.3.4');
    assert.equal(a.acked_at, NOW.toISOString());
  });

  it('token: ida e volta, adulteração, expiração e segredo errado', () => {
    const secret = 'segredo-de-teste-com-mais-de-32-caracteres!!';
    const tk = makeAckToken(secret, { type: 'calendar_event', id: 'E1', memberId: 'M2', dueDate: day(3) });
    assert.deepEqual(verifyAckToken(secret, tk, NOW), { type: 'calendar_event', id: 'E1', memberId: 'M2' });
    const [v, payload, sig] = tk.split('.');
    const forjado = Buffer.from(JSON.stringify({ t: 'calendar_event', i: 'E1', m: 'M1', e: 9999999999 })).toString(
      'base64url'
    );
    assert.equal(verifyAckToken(secret, `${v}.${forjado}.${sig}`, NOW), null, 'payload trocado com a mesma assinatura');
    assert.equal(verifyAckToken(secret, `${v}.${payload}.${sig.slice(0, -2)}xx`, NOW), null);
    assert.equal(verifyAckToken('outro-segredo-com-mais-de-32-caracteres!!!!', tk, NOW), null);
    assert.equal(verifyAckToken(secret, tk, new Date('2027-01-01T00:00:00Z')), null, 'expirado');
    for (const lixo of ['', 'abc', 'v1..', 'v2.a.b', null, undefined])
      assert.equal(verifyAckToken(secret, lixo, NOW), null);
  });

  it('segredo do link: gerado uma vez e guardado; variável de ambiente prevalece', () => {
    const db = makeDb();
    const a = getAckSecret(db, {});
    assert.ok(a.length >= 32);
    assert.equal(getAckSecret(db, {}), a);
    assert.equal(getAckSecret(db, { DEADLINE_ACK_SECRET: 'x'.repeat(40) }), 'x'.repeat(40));
    assert.notEqual(getAckSecret(db, { DEADLINE_ACK_SECRET: 'curto' }), 'curto');
  });

  it('mensagem do substituto/titular indica o papel e a origem do escalonamento', () => {
    const rec = { name: 'Carlos' };
    const d = { title: 'Contestação', process: '123', due: '2026-10-08' };
    const sub = buildMessages({
      deadline: d,
      stage: 'D1',
      recipient: rec,
      role: 'substituto',
      onBehalfOf: 'Ana',
      link: 'https://x/ciencia/t',
    });
    assert.match(sub.whatsapp, /SUBSTITUTO\(A\) de Ana/);
    assert.match(sub.email.subject, /^\[PRAZO D1\] Contestação — Proc\. 123 — 08\/10\/2026$/);
  });
});
