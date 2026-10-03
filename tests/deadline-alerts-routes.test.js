/**
 * Alertas de prazo (AUD-04), camada HTTP: RBAC, cadastro de preferências, ciência pelo
 * painel e pelo link, registro e envio de ponta a ponta com um gateway de WhatsApp falso
 * (que registra cada mensagem) — para provar que NINGUÉM que não seja advogado recebe.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-deadline-routes-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.WHATSAPP_GATEWAY_URL;

const { app, db } = await import('../server.js');
const { createSession } = await import('../src/middleware/auth.js');
const svc = await import('../src/modules/deadline-alerts/deadline-alerts.service.js');
const { runAlertsNow, startDeadlineAlerts } = await import('../src/modules/deadline-alerts/deadline-alerts.routes.js');

const NOW = new Date('2026-10-05T13:00:00Z'); // 10:00 em Brasília
const day = (o) => new Date(Date.UTC(2026, 9, 5 + o)).toISOString().slice(0, 10);
const ts = new Date().toISOString();
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

let masterToken;
const sessions = {};
const gateway = { server: null, messages: [], failing: false };

function addMember(m) {
  db.prepare(
    `INSERT INTO office_members (id, office_id, role_type, name, oab_number, oab_uf, email, phone, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    m.id,
    'OFF-T',
    m.role_type,
    m.name,
    m.oab ?? null,
    'MG',
    m.email ?? null,
    m.phone ?? null,
    m.status ?? 'Ativo',
    ts,
    ts
  );
}
function addEvent(id, offset, lawyer_name, extra = {}) {
  db.prepare(
    `INSERT INTO calendar_events (id, title, event_type, start_datetime, lawyer_name, client_name, lawsuit_number, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    extra.title ?? 'Contestação',
    'prazo_fatal',
    day(offset),
    lawyer_name,
    'CLIENTE SIGILOSO',
    '0001234-56.2026.8.13.0145',
    'fatal',
    extra.status ?? 'agendado',
    ts,
    ts
  );
}

before(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  masterToken = login.body.token;
  db.prepare(
    `INSERT INTO offices (id, corporate_name, created_at, updated_at) VALUES ('OFF-T','Escritório Teste',?,?)`
  ).run(ts, ts);
  addMember({
    id: 'ML1',
    role_type: 'Advogado Sócio',
    name: 'Jorge Alvim',
    oab: '222943',
    phone: '(32) 99815-3429',
    email: 'jorge@exemplo.com',
  });
  addMember({
    id: 'ML2',
    role_type: 'Advogado Associado',
    name: 'Ana Lima',
    oab: '100200',
    phone: '(32) 98888-7777',
    email: 'ana@exemplo.com',
  });
  addMember({
    id: 'ML3',
    role_type: 'Advogado Associado',
    name: 'Carlos Substituto',
    oab: '300400',
    phone: '(32) 97777-6666',
    email: 'carlos@exemplo.com',
  });
  addMember({
    id: 'MS1',
    role_type: 'Secretária Executiva',
    name: 'Maria Secretaria',
    phone: '(32) 96666-5555',
    email: 'maria@exemplo.com',
  });
  addMember({
    id: 'ME1',
    role_type: 'Estagiário',
    name: 'Pedro Estagio',
    oab: '55555',
    phone: '(32) 95555-4444',
    email: 'pedro@exemplo.com',
  });
  // A secretária está rotulada 'advogado' no controle de acesso (o padrão da coluna): isso NÃO pode valer.
  db.prepare(
    `INSERT INTO access_permissions (id, user_id, user_type, user_name, role_template, created_at, updated_at) VALUES ('PERM-S','USR-SEC','admin','Maria Secretaria','advogado',?,?)`
  ).run(ts, ts);
  sessions.ana = createSession({ id: 'USR-ANA', username: 'ana.lima', name: 'Ana Lima', role: 'admin' });
  sessions.maria = createSession({ id: 'USR-SEC', username: 'secretaria_t', name: 'Maria Secretaria', role: 'admin' });

  gateway.server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        gateway.messages.push(JSON.parse(body));
      } catch {
        gateway.messages.push({ raw: body });
      }
      res.statusCode = gateway.failing ? 500 : 200;
      res.end('{}');
    });
  });
  await new Promise((r) => gateway.server.listen(0, '127.0.0.1', r));
  gateway.url = `http://127.0.0.1:${gateway.server.address().port}/send`;
});

after(() => {
  gateway.server?.close();
  delete process.env.WHATSAPP_GATEWAY_URL;
  try {
    db?.close?.();
  } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
});

describe('permissões (RBAC)', () => {
  for (const [metodo, rota] of [
    ['get', '/api/deadline-alerts/config'],
    ['get', '/api/deadline-alerts/log'],
    ['post', '/api/deadline-alerts/run'],
    ['put', '/api/deadline-alerts/prefs/ML1'],
  ]) {
    it(`${metodo.toUpperCase()} ${rota}: sem login 401; advogado e secretária (não-mestre) 403; mestre passa`, async () => {
      assert.equal((await request(app)[metodo](rota)).status, 401);
      assert.equal(
        (await request(app)[metodo](rota).set(bearer(sessions.ana))).status,
        403,
        'advogado não-mestre não administra alertas'
      );
      assert.equal((await request(app)[metodo](rota).set(bearer(sessions.maria))).status, 403);
      // simulação no /run: o teste de permissões não pode disparar envio real
      assert.notEqual((await request(app)[metodo](rota).set(bearer(masterToken)).send({ dry_run: true })).status, 403);
    });
  }

  it('confirmar ciência exige login', async () => {
    assert.equal((await request(app).post('/api/deadline-alerts/ack').send({})).status, 401);
  });
});

describe('configuração: quem é advogado', () => {
  it('lista só advogados e explica por que os demais ficam de fora', async () => {
    const r = await request(app).get('/api/deadline-alerts/config').set(bearer(masterToken));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.lawyers.map((l) => l.name).sort(), ['Ana Lima', 'Carlos Substituto', 'Jorge Alvim']);
    const ex = Object.fromEntries(r.body.excluded.map((e) => [e.name, e.reason]));
    assert.match(ex['Maria Secretaria'], /não é de advogado/);
    assert.match(ex['Pedro Estagio'], /estagiário/);
    assert.ok(!JSON.stringify(r.body.lawyers).includes('verifiedLawyer'));
    assert.equal(r.body.hasTitular, false);
    assert.match(r.body.rule, /só para integrante ativo com função de Advogado e OAB/);
  });

  it('PUT prefs: define titular e substituto; recusa quem não é advogado e dados inválidos', async () => {
    const put = (id, body) => request(app).put(`/api/deadline-alerts/prefs/${id}`).set(bearer(masterToken)).send(body);
    assert.equal((await put('ML1', { is_titular: true })).status, 200);
    assert.equal((await put('ML2', { substitute_member_id: 'ML3' })).status, 200);

    const sec = await put('MS1', { notify_whatsapp: true });
    assert.equal(sec.status, 400);
    assert.match(sec.body.error, /não pode receber alertas de prazo/);
    assert.equal((await put('ME1', {})).status, 400, 'estagiário');
    assert.equal((await put('INEXISTENTE', {})).status, 404);
    assert.equal((await put('ML2', { substitute_member_id: 'MS1' })).status, 400, 'substituto precisa ser advogado');
    assert.equal((await put('ML2', { substitute_member_id: 'ML2' })).status, 400, 'substituto não pode ser o próprio');
    assert.equal((await put('ML2', { whatsapp: '123' })).status, 400);
    assert.equal((await put('ML2', { alert_email: 'sem-arroba' })).status, 400);
    assert.equal(
      db.prepare(`SELECT COUNT(*) c FROM deadline_alert_prefs WHERE member_id IN ('MS1','ME1')`).get().c,
      0,
      'nada gravado para não advogados'
    );

    const cfg = (await request(app).get('/api/deadline-alerts/config').set(bearer(masterToken))).body;
    assert.equal(cfg.hasTitular, true);
    assert.equal(cfg.lawyers.find((l) => l.id === 'ML2').substituteId, 'ML3');
  });
});

describe('envio de ponta a ponta (gateway de WhatsApp falso)', () => {
  const NAO_ADVOGADOS = ['5532966665555', '5532955554444'];
  before(() => {
    // O servidor de teste semeia compromissos de demonstração: remove, para o teste controlar todos os prazos.
    db.exec(
      `DELETE FROM calendar_events; DELETE FROM court_publications; DELETE FROM admin_requests; DELETE FROM deadline_alert_log;`
    );
    process.env.WHATSAPP_GATEWAY_URL = gateway.url;
    // e-mail desligado para este bloco: o foco aqui é o WhatsApp (o e-mail do teste não tem SMTP)
    for (const id of ['ML1', 'ML2', 'ML3'])
      db.prepare(
        `INSERT INTO deadline_alert_prefs (member_id, notify_email, updated_at) VALUES (?,0,?) ON CONFLICT(member_id) DO UPDATE SET notify_email=0`
      ).run(id, ts);
    addEvent('EV-ANA', 1, 'Ana Lima'); // D1: escala
    addEvent('EV-SEC', 1, 'Maria Secretaria', { title: 'Prazo da secretária' });
    addEvent('EV-EST', 1, 'Pedro Estagio', { title: 'Prazo do estagiário' });
    addEvent('EV-DONE', 1, 'Ana Lima', { title: 'Concluído', status: 'concluido' });
  });

  it('simulação (dry_run) lista o previsto sem enviar nem registrar, e só com advogados', async () => {
    gateway.messages.length = 0;
    const r = await request(app).post('/api/deadline-alerts/run').set(bearer(masterToken)).send({ dry_run: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.dryRun, true);
    assert.ok(r.body.planned > 0);
    assert.ok(
      r.body.items.every((i) => ['Ana Lima', 'Carlos Substituto', 'Jorge Alvim'].includes(i.recipient)),
      JSON.stringify(r.body.items)
    );
    assert.equal(gateway.messages.length, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM deadline_alert_log`).get().c, 0);
  });

  it('envio real: só os telefones dos advogados recebem; secretária e estagiário, jamais', async () => {
    gateway.messages.length = 0;
    const r = await runAlertsNow({ now: NOW });
    assert.ok(r.sent >= 3, JSON.stringify(r));
    const fones = gateway.messages.map((m) => m.phone);
    for (const p of NAO_ADVOGADOS) assert.ok(!fones.includes(p), `WhatsApp enviado a quem não é advogado: ${p}`);
    for (const m of gateway.messages) assert.ok(!/SIGILOSO/.test(m.message), 'nome de cliente no WhatsApp');
    assert.ok(fones.includes('5532988887777'), 'responsável Ana');
    assert.ok(fones.includes('5532977776666'), 'substituto Carlos');
    assert.ok(fones.includes('5532998153429'), 'titular Jorge');
    assert.ok(!gateway.messages.some((m) => /Concluído/.test(m.message)), 'prazo concluído não gera aviso');
  });

  it('o registro mostra cada envio e a rota de log (mestre) o expõe', async () => {
    const r = await request(app).get('/api/deadline-alerts/log').set(bearer(masterToken));
    assert.equal(r.status, 200);
    assert.ok(r.body.counts.enviado >= 3);
    assert.ok(
      r.body.log.every((l) => ['ML1', 'ML2', 'ML3'].includes(l.member_id)),
      'log com quem não é advogado'
    );
    const so = await request(app).get('/api/deadline-alerts/log?status=falha').set(bearer(masterToken));
    assert.ok(so.body.log.every((l) => l.status === 'falha'));
  });

  it('rodar de novo não repete (idempotente)', async () => {
    gateway.messages.length = 0;
    const r = await runAlertsNow({ now: NOW });
    assert.equal(r.sent, 0);
    assert.equal(gateway.messages.length, 0);
  });

  it('falha do gateway: registra, reenvia, desiste após as tentativas e avisa no painel (notificação crítica)', async () => {
    addEvent('EV-FALHA', 3, 'Ana Lima', { title: 'Prazo com gateway fora' });
    gateway.failing = true;
    for (let i = 0; i < svc.MAX_ATTEMPTS; i++) await runAlertsNow({ now: NOW });
    gateway.failing = false;
    const row = db
      .prepare(
        `SELECT status, attempts, last_error FROM deadline_alert_log WHERE resource_id='EV-FALHA' AND channel='whatsapp'`
      )
      .get();
    assert.deepEqual({ ...row }, { status: 'desistiu', attempts: svc.MAX_ATTEMPTS, last_error: 'gateway_http_500' });
    const notifs = (await request(app).get('/api/notifications?limit=100').set(bearer(masterToken))).body.notifications;
    const n = notifs.find((x) => /Não consegui avisar Ana Lima \(whatsapp\)/.test(x.title));
    assert.ok(n, 'faltou o alerta crítico no painel');
    assert.equal(n.level, 'critical');
    assert.equal(n.category, 'prazo');
    assert.equal(n.resource_type, 'calendar_event');
    assert.equal(n.resource_id, 'EV-FALHA');
  });

  it('o agendador não inicia em ambiente de teste', () => {
    assert.equal(startDeadlineAlerts(), false);
    assert.equal(startDeadlineAlerts({ env: { NODE_ENV: 'production', DEADLINE_ALERTS_DISABLED: '1' } }), false);
  });
});

describe('ciência pelo painel', () => {
  const ack = (token, body) => request(app).post('/api/deadline-alerts/ack').set(bearer(token)).send(body);

  it('advogado cadastrado confirma; repetir informa que já estava; fica registrado como "painel"', async () => {
    const r = await ack(sessions.ana, { resource_type: 'calendar_event', resource_id: 'EV-ANA' });
    assert.equal(r.status, 200);
    assert.equal(r.body.lawyer, 'Ana Lima');
    assert.equal(r.body.alreadyAcknowledged, false);
    assert.equal(
      (await ack(sessions.ana, { resource_type: 'calendar_event', resource_id: 'EV-ANA' })).body.alreadyAcknowledged,
      true
    );
    const a = db.prepare(`SELECT via, member_id FROM deadline_acks WHERE resource_id='EV-ANA'`).get();
    assert.deepEqual({ ...a }, { via: 'painel', member_id: 'ML2' });
  });

  it('secretária (mesmo rotulada "advogado" no controle de acesso) NÃO confirma ciência', async () => {
    const r = await ack(sessions.maria, { resource_type: 'calendar_event', resource_id: 'EV-SEC' });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /Somente advogados cadastrados/);
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM deadline_acks WHERE resource_id='EV-SEC'`).get().c, 0);
  });

  it('o mestre confirma como advogado titular', async () => {
    const r = await ack(masterToken, { resource_type: 'calendar_event', resource_id: 'EV-FALHA' });
    assert.equal(r.status, 200);
    assert.equal(r.body.lawyer, 'Jorge Alvim');
  });

  it('valida entrada: tipo inválido 400, prazo inexistente ou concluído 404', async () => {
    assert.equal((await ack(sessions.ana, { resource_type: 'outro', resource_id: 'X' })).status, 400);
    assert.equal((await ack(sessions.ana, { resource_type: 'calendar_event' })).status, 400);
    assert.equal((await ack(sessions.ana, { resource_type: 'calendar_event', resource_id: 'NAO-EXISTE' })).status, 404);
    assert.equal((await ack(sessions.ana, { resource_type: 'calendar_event', resource_id: 'EV-DONE' })).status, 404);
  });

  it('com a ciência dada, o escalonamento seguinte não envia mais ao responsável no D1', async () => {
    addEvent('EV-ACK', 1, 'Ana Lima', { title: 'Prazo já ciente' });
    await ack(sessions.ana, { resource_type: 'calendar_event', resource_id: 'EV-ACK' });
    gateway.messages.length = 0;
    await runAlertsNow({ now: NOW });
    assert.ok(!gateway.messages.some((m) => /Prazo já ciente/.test(m.message)));
  });
});

describe('ciência pelo link (WhatsApp/e-mail)', () => {
  const secret = () => svc.getAckSecret(db);
  const tokenFor = (id, memberId, offset = 1) =>
    svc.makeAckToken(secret(), { type: 'calendar_event', id, memberId, dueDate: day(offset) });
  const acks = (id) => db.prepare(`SELECT COUNT(*) c FROM deadline_acks WHERE resource_id = ?`).get(id).c;

  before(() => addEvent('EV-LINK', 2, 'Ana Lima', { title: 'Prazo do link' }));

  it('GET só mostra a página (o pré-visualizador do WhatsApp não confirma sozinho)', async () => {
    const r = await request(app).get(`/ciencia/${tokenFor('EV-LINK', 'ML2', 2)}`);
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /html/);
    assert.match(r.text, /Prazo do link/);
    assert.match(r.text, /Confirmo que estou ciente/);
    assert.match(r.text, /Dr\(a\)\. Ana Lima/);
    assert.ok(!/SIGILOSO/.test(r.text));
    assert.match(r.headers['cache-control'], /no-store/);
    assert.equal(acks('EV-LINK'), 0, 'o GET registrou ciência');
  });

  it('POST registra a ciência (via link, com IP) e repetir não duplica', async () => {
    const t = tokenFor('EV-LINK', 'ML2', 2);
    const r = await request(app).post(`/ciencia/${t}`);
    assert.equal(r.status, 200);
    assert.match(r.text, /Ciência registrada/);
    const row = db.prepare(`SELECT via, member_name FROM deadline_acks WHERE resource_id='EV-LINK'`).get();
    assert.deepEqual({ ...row }, { via: 'link', member_name: 'Ana Lima' });
    const r2 = await request(app).post(`/ciencia/${t}`);
    assert.match(r2.text, /já estava registrada/);
    assert.equal(acks('EV-LINK'), 1);
  });

  it('token adulterado, de outro segredo, expirado ou de quem não é advogado: 410 e nada é registrado', async () => {
    const bom = tokenFor('EV-LINK', 'ML2', 2);
    const [v, , s] = bom.split('.');
    const forjado = Buffer.from(
      JSON.stringify({ t: 'calendar_event', i: 'EV-LINK', m: 'ML1', e: 9999999999 })
    ).toString('base64url');
    const casos = {
      adulterado: `${v}.${forjado}.${s}`,
      outroSegredo: svc.makeAckToken('x'.repeat(48), {
        type: 'calendar_event',
        id: 'EV-LINK',
        memberId: 'ML2',
        dueDate: day(2),
      }),
      expirado: tokenFor('EV-LINK', 'ML2', -60),
      secretaria: tokenFor('EV-LINK', 'MS1', 2),
      lixo: 'abc',
    };
    for (const [nome, t] of Object.entries(casos)) {
      assert.equal((await request(app).get(`/ciencia/${t}`)).status, 410, `GET ${nome}`);
      assert.equal((await request(app).post(`/ciencia/${t}`)).status, 410, `POST ${nome}`);
    }
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM deadline_acks WHERE member_id = 'MS1'`).get().c, 0);
    assert.equal(acks('EV-LINK'), 1, 'nada além da ciência legítima');
  });

  it('prazo já encerrado: informa e não registra', async () => {
    const t = tokenFor('EV-DONE', 'ML2', 1);
    const r = await request(app).post(`/ciencia/${t}`);
    assert.equal(r.status, 200);
    assert.match(r.text, /não está mais em aberto/);
    assert.equal(acks('EV-DONE'), 0);
  });

  it('o texto do prazo é escapado (sem HTML injetado na página pública)', async () => {
    addEvent('EV-XSS', 2, 'Ana Lima', { title: '<script>alert(1)</script>' });
    const r = await request(app).get(`/ciencia/${tokenFor('EV-XSS', 'ML2', 2)}`);
    assert.ok(!r.text.includes('<script>alert(1)</script>'));
    assert.match(r.text, /&lt;script&gt;/);
  });
});

describe('módulo', () => {
  it('as tabelas existem e o módulo segue o padrão da arquitetura', () => {
    const t = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'deadline_%' ORDER BY name`)
      .all()
      .map((r) => r.name);
    assert.deepEqual(t, ['deadline_acks', 'deadline_alert_log', 'deadline_alert_prefs']);
  });
});
