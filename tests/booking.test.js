/**
 * AUD-15: agendamento online de consulta (regras de horários + API + agenda + funil + e-mail).
 */
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  DEFAULT_CONFIG, normalizeConfig, nowSaoPaulo, minutesOf, addMinutes, weekdayOf, slotsForDate, slotsForRange, isSlotFree, busyIntervals, buildIcs,
} from '../src/shared/booking-slots.js';

const TMP_DB = path.join(os.tmpdir(), `jaw-booking-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.RECAPTCHA_SECRET_KEY;

const { app, db } = await import('../server.js');
const { sendDueReminders, _resetLimits } = await import('../src/modules/booking/booking.routes.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const cfg = (over = {}) => normalizeConfig({ ...DEFAULT_CONFIG, enabled: true, ...over }).config;
// 2026-10-05 é segunda-feira; 2026-10-10 é sábado.
const NOW = '2026-10-04T10:00';

describe('regras de horários (puras)', () => {
  it('valida a configuração e corrige valores impossíveis', () => {
    const { config, errors } = normalizeConfig({ start: '25:00', slot_minutes: 5, end: '08:00', max_days_ahead: 500 });
    assert.ok(errors.length >= 3);
    assert.equal(config.slot_minutes, DEFAULT_CONFIG.slot_minutes);
    assert.ok(minutesOf(`2026-01-01T${config.end}`) > minutesOf(`2026-01-01T${config.start}`));
  });
  it('relógio de Brasília e aritmética de datas', () => {
    assert.match(nowSaoPaulo(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.equal(addMinutes('2026-10-05T23:30', 60), '2026-10-06T00:30');
    assert.equal(addMinutes('2026-12-31T23:00', 120), '2027-01-01T01:00');
    assert.equal(weekdayOf('2026-10-05'), 1);
  });
  it('dia útil: expediente, sem o intervalo do almoço', () => {
    const s = slotsForDate('2026-10-05', cfg(), { now: NOW });
    assert.deepEqual(s, ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
  });
  it('fim de semana e feriado não têm horário', () => {
    assert.deepEqual(slotsForDate('2026-10-10', cfg(), { now: NOW }), []);
    assert.deepEqual(slotsForDate('2026-10-12', cfg(), { now: NOW, holidays: new Set(['2026-10-12']) }), []);
  });
  it('antecedência mínima esconde horários próximos demais', () => {
    const s = slotsForDate('2026-10-05', cfg({ min_notice_hours: 5 }), { now: '2026-10-05T07:00' }); // só a partir de 12:00
    assert.ok(!s.includes('09:00') && !s.includes('11:00') && s.includes('14:00'));
    assert.deepEqual(slotsForDate('2026-10-05', cfg({ min_notice_hours: 12 }), { now: '2026-10-05T07:00' }), []); // 07:00 + 12 h = 19:00: dia todo fechado
  });
  it('compromisso na agenda bloqueia o horário (e só o do advogado)', () => {
    const c = cfg();
    const busy = busyIntervals([
      { start_datetime: '2026-10-05T10:00', end_datetime: '2026-10-05T11:00', all_day: 0, status: 'agendado', lawyer_id: 'dr-jorge-alvim' },
      { start_datetime: '2026-10-05T15:00', end_datetime: '2026-10-05T16:00', all_day: 0, status: 'agendado', lawyer_id: 'outro-advogado' },
      { start_datetime: '2026-10-05T16:00', end_datetime: '2026-10-05T17:00', all_day: 0, status: 'cancelado', lawyer_id: 'dr-jorge-alvim' },
      { start_datetime: '2026-10-05', all_day: 1, status: 'agendado' },
    ], c);
    const s = slotsForDate('2026-10-05', c, { busy, now: NOW });
    assert.ok(!s.includes('10:00'));
    assert.ok(s.includes('15:00') && s.includes('16:00') && s.includes('09:00'));
  });
  it('compromisso sem horário final ocupa 1 hora; evento que atravessa o horário também bloqueia', () => {
    const c = cfg({ slot_minutes: 30 });
    const busy = busyIntervals([{ start_datetime: '2026-10-05T09:45', all_day: 0, status: 'agendado' }], c);
    const s = slotsForDate('2026-10-05', c, { busy, now: NOW });
    assert.ok(!s.includes('09:30') && !s.includes('10:00') && !s.includes('10:30') && s.includes('11:00'));
  });
  it('intervalo entre consultas (buffer) afasta os horários', () => {
    const s = slotsForDate('2026-10-05', cfg({ buffer_minutes: 30 }), { now: NOW });
    assert.deepEqual(s.slice(0, 2), ['09:00', '10:30']);
  });
  it('intervalo (almoço) respeitado mesmo com consulta que invade', () => {
    const s = slotsForDate('2026-10-05', cfg({ slot_minutes: 90 }), { now: NOW });
    assert.ok(!s.includes('11:00')); // 11:00-12:30 invade o almoço (12:00-14:00)
  });
  it('intervalo de dias respeita limite e ignora passado', () => {
    const r = slotsForRange('2026-10-01', 14, cfg({ max_days_ahead: 3 }), { now: NOW });
    assert.ok(r.every((d) => d.date >= '2026-10-04' && d.date <= '2026-10-07'));
    assert.deepEqual(r.map((d) => d.date), ['2026-10-05', '2026-10-06', '2026-10-07']);
  });
  it('isSlotFree só aceita horário oferecido', () => {
    const c = cfg();
    assert.equal(isSlotFree('2026-10-05T09:00', c, { now: NOW }), true);
    assert.equal(isSlotFree('2026-10-05T09:30', c, { now: NOW }), false); // fora da grade
    assert.equal(isSlotFree('2026-10-05T12:00', c, { now: NOW }), false); // almoço
    assert.equal(isSlotFree('amanhã', c, { now: NOW }), false);
  });
  it('gera convite .ics válido', () => {
    const ics = buildIcs({ uid: 'x@y', start: '2026-10-05T09:00', end: '2026-10-05T10:00', title: 'Consulta; teste', location: 'Rua A, 1' });
    assert.match(ics, /BEGIN:VCALENDAR[\s\S]*DTSTART;TZID=America\/Sao_Paulo:20261005T090000/);
    assert.match(ics, /SUMMARY:Consulta\; teste/);
  });
});

describe('API de agendamento', () => {
  let h;
  beforeEach(() => _resetLimits());
  const mestre = async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD });
    h = { Authorization: `Bearer ${r.body.token}` };
    return r.body.token;
  };
  const dados = (slot, over = {}) => ({ name: 'Maria da Silva', email: 'maria@exemplo.com.br', phone: '(32) 99999-1234', area: 'Trabalhista', message: 'Fui demitida', slot, consent: true, ...over });
  const primeiroSlot = async (pular = 0) => {
    const r = await request(app).get('/api/booking/slots?days=30');
    const dias = r.body.days || [];
    const todos = dias.flatMap((d) => d.slots.map((s) => `${d.date}T${s}`));
    return todos[pular];
  };

  it('começa DESLIGADO: nada de horários nem marcação', async () => {
    await mestre();
    const c = await request(app).get('/api/booking/config');
    assert.equal(c.body.enabled, false);
    const s = await request(app).get('/api/booking/slots');
    assert.deepEqual(s.body.days, []);
    const p = await request(app).post('/api/booking').send(dados('2026-12-01T09:00'));
    assert.equal(p.status, 503);
  });

  it('só o mestre liga e configura; sem login é negado', async () => {
    assert.equal((await request(app).get('/api/booking/settings')).status, 401);
    assert.equal((await request(app).put('/api/booking/settings').send({ enabled: true })).status, 401);
    const bad = await request(app).put('/api/booking/settings').set(h).send({ start: '25:99' });
    assert.equal(bad.status, 400);
    const ok = await request(app).put('/api/booking/settings').set(h).send({ enabled: true, min_notice_hours: 1, max_days_ahead: 30 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.config.enabled, true);
  });

  it('ligado: oferece horários e valida os dados', async () => {
    const slot = await primeiroSlot();
    assert.ok(slot, 'deveria haver horário livre');
    for (const [campo, valor] of [['name', 'A'], ['email', 'sem-arroba'], ['phone', '123'], ['consent', false]]) {
      const r = await request(app).post('/api/booking').send(dados(slot, { [campo]: valor }));
      assert.equal(r.status, 400, campo);
    }
    assert.equal((await request(app).post('/api/booking').send(dados('2020-01-01T09:00'))).status, 409); // horário que não existe
  });

  it('robô (campo escondido) é ignorado sem gravar nada', async () => {
    const slot = await primeiroSlot();
    const antes = db.prepare('SELECT COUNT(*) n FROM booking_appointments').get().n;
    const r = await request(app).post('/api/booking').send(dados(slot, { website_hp: 'sou robo' }));
    assert.equal(r.body.id, 'IGNORED');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_appointments').get().n, antes);
  });

  let token, id, slotMarcado;
  it('marcar cria o lead, o evento na agenda, a marcação e avisa o escritório', async () => {
    slotMarcado = await primeiroSlot();
    const r = await request(app).post('/api/booking').send(dados(slotMarcado));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.id;
    token = r.body.manage_url.split('t=')[1];
    assert.match(token, /^[a-f0-9]{48}$/);
    const a = db.prepare('SELECT * FROM booking_appointments WHERE id = ?').get(id);
    assert.equal(a.status, 'confirmado');
    assert.notEqual(a.token_hash, token); // só o hash fica no banco
    const ev = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(a.event_id);
    assert.equal(ev.event_type, 'consulta');
    assert.equal(ev.start_datetime, slotMarcado);
    assert.equal(ev.status, 'agendado');
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(a.lead_id);
    assert.equal(lead.stage, 'recebido');
    assert.equal(lead.email, 'maria@exemplo.com.br');
    assert.ok(db.prepare(`SELECT 1 FROM notifications WHERE dedupe_key = ?`).get(`booking:${id}:novo`));
  });

  it('o horário marcado some da lista e uma segunda marcação no mesmo horário é recusada', async () => {
    const r = await request(app).get('/api/booking/slots?days=30');
    assert.ok(!r.body.days.flatMap((d) => d.slots.map((s) => `${d.date}T${s}`)).includes(slotMarcado));
    const dup = await request(app).post('/api/booking').send(dados(slotMarcado, { email: 'outro@exemplo.com.br' }));
    assert.equal(dup.status, 409);
  });

  it('o compromisso criado pela agenda do advogado também bloqueia o horário', async () => {
    const slot = await primeiroSlot();
    const fim = addMinutes(slot, 60);
    db.prepare(`INSERT INTO calendar_events (id, title, event_type, start_datetime, end_datetime, all_day, lawyer_id, status, created_at, updated_at)
                VALUES ('EVT-TESTE-AUD15', 'Audiência', 'audiencia', ?, ?, 0, 'dr-jorge-alvim', 'agendado', 'x', 'x')`).run(slot, fim);
    const r = await request(app).post('/api/booking').send(dados(slot, { email: 'bloqueado@exemplo.com.br' }));
    assert.equal(r.status, 409);
    db.prepare(`DELETE FROM calendar_events WHERE id = 'EVT-TESTE-AUD15'`).run();
  });

  it('o titular vê a própria marcação pelo link; link falso não revela nada', async () => {
    const ok = await request(app).get(`/api/booking/manage/${token}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.appointment.status, 'confirmado');
    assert.ok(!JSON.stringify(ok.body).includes('99999-1234')); // telefone não volta
    assert.equal((await request(app).get('/api/booking/manage/' + 'a'.repeat(48))).status, 404);
    assert.equal((await request(app).get('/api/booking/manage/curto')).status, 404);
  });

  it('remarcar move o evento da agenda e libera o horário antigo', async () => {
    const novo = await primeiroSlot();
    const r = await request(app).post(`/api/booking/manage/${token}/reschedule`).send({ slot: novo });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const a = db.prepare('SELECT * FROM booking_appointments WHERE id = ?').get(id);
    assert.equal(a.start_datetime, novo);
    assert.equal(a.reschedule_count, 1);
    assert.equal(db.prepare('SELECT start_datetime FROM calendar_events WHERE id = ?').get(a.event_id).start_datetime, novo);
    const lista = (await request(app).get('/api/booking/slots?days=30')).body.days.flatMap((d) => d.slots.map((s) => `${d.date}T${s}`));
    assert.ok(lista.includes(slotMarcado)); // o horário antigo voltou
    assert.ok(!lista.includes(novo));
    slotMarcado = novo;
  });

  it('remarcar para horário inexistente ou ocupado é recusado', async () => {
    assert.equal((await request(app).post(`/api/booking/manage/${token}/reschedule`).send({ slot: '2020-01-01T09:00' })).status, 409);
  });

  it('o painel lista as marcações (com a aba Agenda) e o cliente cancela pelo link', async () => {
    const l = await request(app).get('/api/booking/appointments').set(h);
    assert.equal(l.status, 200);
    assert.ok(l.body.appointments.some((x) => x.id === id));
    assert.equal((await request(app).get('/api/booking/appointments')).status, 401);
    const c = await request(app).post(`/api/booking/manage/${token}/cancel`);
    assert.equal(c.status, 200);
    assert.equal(db.prepare('SELECT status FROM booking_appointments WHERE id = ?').get(id).status, 'cancelado');
    const a = db.prepare('SELECT event_id FROM booking_appointments WHERE id = ?').get(id);
    assert.equal(db.prepare('SELECT status FROM calendar_events WHERE id = ?').get(a.event_id).status, 'cancelado');
    const lista = (await request(app).get('/api/booking/slots?days=30')).body.days.flatMap((d) => d.slots.map((s) => `${d.date}T${s}`));
    assert.ok(lista.includes(slotMarcado)); // cancelou: o horário volta
    assert.equal((await request(app).post(`/api/booking/manage/${token}/cancel`)).status, 409); // não cancela duas vezes
    assert.equal((await request(app).post(`/api/booking/manage/${token}/reschedule`).send({ slot: slotMarcado })).status, 409);
  });

  it('a página /agendar abre e o RBAC mantém os dados do painel protegidos', async () => {
    const p = await request(app).get('/agendar');
    assert.equal(p.status, 200);
    assert.match(p.text, /Agende sua consulta/);
  });
});

describe('lembrete 24 h antes', () => {
  it('envia uma vez só, apenas para consultas confirmadas das próximas 24 h', async () => {
    const now = '2026-10-04T10:00';
    const ins = db.prepare(`INSERT INTO booking_appointments (id, token_hash, start_datetime, end_datetime, name, email, phone, status, created_at, updated_at)
                            VALUES (?, ?, ?, ?, 'Fulano', 'fulano@exemplo.com.br', '32999990000', ?, 'x', 'x')`);
    ins.run('AGD-T-1', 'h1', '2026-10-05T09:00', '2026-10-05T10:00', 'confirmado');   // amanhã 09:00: dentro das 24 h
    ins.run('AGD-T-2', 'h2', '2026-10-07T09:00', '2026-10-07T10:00', 'confirmado');   // longe
    ins.run('AGD-T-3', 'h3', '2026-10-05T08:00', '2026-10-05T09:00', 'cancelado');    // cancelada
    const enviados = [];
    const send = async (m) => { enviados.push(m); return { sent: true }; };
    assert.equal(await sendDueReminders({ now, send }), 1);
    assert.equal(enviados[0].to, 'fulano@exemplo.com.br');
    assert.match(enviados[0].subject, /Lembrete/);
    assert.ok(!enviados[0].text.includes('agendar?t=')); // o lembrete não leva link com token vazio
    assert.equal(await sendDueReminders({ now, send }), 0); // não repete
  });
  it('se o e-mail falhar, tenta de novo na próxima rodada', async () => {
    db.prepare(`INSERT INTO booking_appointments (id, token_hash, start_datetime, end_datetime, name, email, phone, status, created_at, updated_at)
                VALUES ('AGD-T-4', 'h4', '2026-10-05T11:00', '2026-10-05T12:00', 'Beltrano', 'b@exemplo.com.br', '32999990001', 'confirmado', 'x', 'x')`).run();
    assert.equal(await sendDueReminders({ now: '2026-10-04T12:00', send: async () => ({ sent: false }) }), 0);
    assert.equal(db.prepare(`SELECT reminder_sent FROM booking_appointments WHERE id = 'AGD-T-4'`).get().reminder_sent, 0);
  });
});
