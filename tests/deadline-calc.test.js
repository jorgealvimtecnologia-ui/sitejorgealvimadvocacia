/**
 * AUD-05: cálculo de prazos e calendário forense.
 * Datas conferidas à mão no calendário (CPC art. 219, 220 e 224; Páscoa de cada ano).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { computeLegalDeadline, isCourtBusinessDay } from '../src/shared/deadline-calc.js';
import { easterSunday, holidaysForYear, ensureCourtHolidays, holidayCoverage } from '../src/shared/court-calendar.js';

const TMP_DB = path.join(os.tmpdir(), `jaw-prazo-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const rows = (...years) => years.flatMap((y) => holidaysForYear(y)).map((h) => ({ holiday_date: h.holiday_date, name: h.name }));
const mapOf = (list) => new Map(list.map((h) => [h.holiday_date, h.name]));
const dia = (s) => new Date(`${s}T12:00:00`);

describe('dia útil forense', () => {
  const H = mapOf(rows(2025, 2026));
  it('sábado e domingo não são úteis', () => {
    assert.equal(isCourtBusinessDay(dia('2026-03-07'), H).isBusinessDay, false); // sábado
    assert.equal(isCourtBusinessDay(dia('2026-03-08'), H).isBusinessDay, false); // domingo
    assert.equal(isCourtBusinessDay(dia('2026-03-09'), H).isBusinessDay, true);  // segunda
  });
  it('feriado nacional e forense não são úteis', () => {
    assert.equal(isCourtBusinessDay(dia('2026-04-21'), H).isBusinessDay, false); // Tiradentes (terça)
    assert.equal(isCourtBusinessDay(dia('2026-04-03'), H).isBusinessDay, false); // Sexta-Feira Santa
    assert.match(isCourtBusinessDay(dia('2026-04-21'), H).reason, /Tiradentes/);
  });
  it('recesso forense vai de 20/dez a 20/jan (CPC art. 220)', () => {
    assert.equal(isCourtBusinessDay(dia('2025-12-19'), H).isBusinessDay, true);  // sexta, antes do recesso
    assert.equal(isCourtBusinessDay(dia('2025-12-22'), H).isBusinessDay, false); // segunda, recesso
    assert.equal(isCourtBusinessDay(dia('2026-01-20'), H).isBusinessDay, false); // terça, último dia do recesso
    assert.equal(isCourtBusinessDay(dia('2026-01-21'), H).isBusinessDay, true);  // quarta, volta
    assert.match(isCourtBusinessDay(dia('2025-12-22'), H).reason, /Recesso/);
  });
});

describe('cálculo de prazo', () => {
  const H26 = rows(2025, 2026, 2027);
  it('CPC, 15 dias úteis, sem feriado: publicação e início seguem o art. 224', () => {
    const r = computeLegalDeadline('2026-03-02', 15, 'cpc', [], H26);
    assert.equal(r.data_publicacao, '2026-03-03');
    assert.equal(r.data_inicio_prazo, '2026-03-04');
    assert.equal(r.data_fatal, '2026-03-24');
  });
  it('disponibilização na sexta: publicação na segunda, início na terça', () => {
    const r = computeLegalDeadline('2026-03-06', 5, 'cpc', [], H26);
    assert.equal(r.data_publicacao, '2026-03-09');
    assert.equal(r.data_inicio_prazo, '2026-03-10');
    assert.equal(r.data_fatal, '2026-03-16');
  });
  it('Semana Santa empurra o início do prazo', () => {
    // 30/03/2026 (seg) -> publicação 31/03; 01, 02 e 03/04 são Quarta/Quinta/Sexta Santa; início em 06/04.
    const r = computeLegalDeadline('2026-03-30', 5, 'cpc', [], H26);
    assert.equal(r.data_publicacao, '2026-03-31');
    assert.equal(r.data_inicio_prazo, '2026-04-06');
    assert.equal(r.data_fatal, '2026-04-10');
  });
  it('o prazo atravessa o recesso: dias de 20/12 a 20/01 não contam', () => {
    // 17/12/2025 (qua) -> pub 18/12 (qui) -> início 19/12 (sex, dia 1); retoma em 21/01 (dia 2).
    const r = computeLegalDeadline('2025-12-17', 5, 'cpc', [], H26);
    assert.equal(r.data_inicio_prazo, '2025-12-19');
    assert.equal(r.data_fatal, '2026-01-26');
  });
  it('feriado local informado desloca o vencimento', () => {
    const r = computeLegalDeadline('2026-03-02', 15, 'cpc', [{ date: '2026-03-05', name: 'Feriado local' }], H26);
    assert.equal(r.data_fatal, '2026-03-25');
    assert.ok(r.feriados_compensados.some((f) => f.date === '2026-03-05'));
  });
  it('prazo em dias corridos que vence em fim de semana prorroga para o próximo dia útil', () => {
    // pub 03/03, início 04/03; 5 dias corridos: 04..08/03; 08/03 é domingo -> 09/03.
    const r = computeLegalDeadline('2026-03-02', 5, 'cpp', [], H26);
    assert.equal(r.tipo_dias, 'Corridos');
    assert.equal(r.data_fatal, '2026-03-09');
    assert.ok(r.memoria_calculo.some((m) => m.status === 'prorrogado'));
  });
  it('o vencimento em prazo de dias úteis nunca cai em dia não útil', () => {
    const feriados = mapOf(H26);
    for (let d = 0; d < 365; d++) {
      const ini = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const r = computeLegalDeadline(ini, 10, 'cpc', [], H26);
      assert.equal(isCourtBusinessDay(dia(r.data_fatal), feriados).isBusinessDay, true, `vence em dia não útil a partir de ${ini}`);
    }
  });
});

describe('calendário gerado por regra', () => {
  it('Páscoa dos anos conferidos', () => {
    const d = (y) => easterSunday(y).toISOString().slice(0, 10);
    assert.equal(d(2026), '2026-04-05');
    assert.equal(d(2027), '2027-03-28');
    assert.equal(d(2028), '2028-04-16');
    assert.equal(d(2029), '2029-04-01');
    assert.equal(d(2030), '2030-04-21');
  });
  it('feriados móveis de 2028 a 2030', () => {
    const por = (y) => Object.fromEntries(holidaysForYear(y).map((h) => [h.name, h.holiday_date]));
    assert.equal(por(2028)['Carnaval (Segunda-Feira)'], '2028-02-28');
    assert.equal(por(2028)['Carnaval (Terça-Feira)'], '2028-02-29'); // ano bissexto
    assert.equal(por(2028)['Sexta-Feira Santa / Paixão de Cristo'], '2028-04-14');
    assert.equal(por(2028)['Corpus Christi'], '2028-06-15');
    assert.equal(por(2029)['Sexta-Feira Santa / Paixão de Cristo'], '2029-03-30');
    assert.equal(por(2030)['Carnaval (Segunda-Feira)'], '2030-03-04');
    assert.equal(por(2030)['Corpus Christi'], '2030-06-20');
  });
  it('reproduz exatamente o calendário que o sistema já usava em 2026', () => {
    assert.deepEqual(
      holidaysForYear(2026).map((h) => h.holiday_date),
      ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-21',
       '2026-05-01', '2026-06-04', '2026-08-11', '2026-09-07', '2026-10-12', '2026-10-28', '2026-11-02', '2026-11-15',
       '2026-11-20', '2026-12-08', '2026-12-25']
    );
  });
  it('estende o banco sem apagar nem alterar o que o escritório já cadastrou', () => {
    db.prepare(`DELETE FROM court_holidays`).run();
    db.prepare(`INSERT INTO court_holidays (id, holiday_date, name, jurisdiction, is_forensic_recess) VALUES ('HOL-2026-12-25','2026-12-25','Natal (nome ajustado)','nacional',0)`).run();
    const novos = ensureCourtHolidays(db, 2026, 2030);
    assert.ok(novos > 80);
    assert.equal(db.prepare(`SELECT name FROM court_holidays WHERE holiday_date='2026-12-25'`).get().name, 'Natal (nome ajustado)');
    assert.equal(ensureCourtHolidays(db, 2026, 2030), 0); // idempotente
    assert.equal(db.prepare(`SELECT MAX(holiday_date) m FROM court_holidays`).get().m, '2030-12-25');
  });
  it('avisa quando faltar ano à frente', () => {
    const hoje = new Date(2026, 9, 4);
    assert.equal(holidayCoverage(db, hoje).ok, true); // vai até 2030
    db.prepare(`DELETE FROM court_holidays WHERE holiday_date >= '2027-01-01'`).run();
    const c = holidayCoverage(db, hoje);
    assert.equal(c.ok, false);
    assert.match(c.warning, /só vai até 2026/);
    ensureCourtHolidays(db, 2026, 2030);
  });
});

describe('API de feriados locais', () => {
  let h;
  it('entra como mestre', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD });
    h = { Authorization: `Bearer ${r.body.token}` };
    assert.ok(r.body.token);
  });
  it('cobertura responde ok e sem aviso', async () => {
    const r = await request(app).get('/api/court/holidays/coverage').set(h);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });
  it('cadastra, rejeita duplicado e data inválida, e remove só feriado local', async () => {
    const ok = await request(app).post('/api/court/holidays').set(h).send({ date: '2026-05-31', name: 'Aniversário da cidade' });
    assert.equal(ok.status, 201);
    assert.equal((await request(app).post('/api/court/holidays').set(h).send({ date: '2026-05-31', name: 'Outra' })).status, 409);
    assert.equal((await request(app).post('/api/court/holidays').set(h).send({ date: '2026-02-30', name: 'Inválida' })).status, 400);
    assert.equal((await request(app).post('/api/court/holidays').set(h).send({ date: '2026-06-01', name: '' })).status, 400);
    assert.equal((await request(app).delete('/api/court/holidays/HOL-2026-12-25').set(h)).status, 403); // nacional não se apaga
    assert.equal((await request(app).delete(`/api/court/holidays/${ok.body.id}`).set(h)).status, 200);
    assert.equal((await request(app).delete(`/api/court/holidays/${ok.body.id}`).set(h)).status, 404);
  });
  it('o feriado local entra no cálculo do prazo', async () => {
    const antes = await request(app).post('/api/court/deadline/calculate').set(h).send({ start_date: '2026-03-02', days: 15, regime: 'cpc' });
    assert.equal(antes.body.data_fatal, '2026-03-24');
    const c = await request(app).post('/api/court/holidays').set(h).send({ date: '2026-03-05', name: 'Feriado local de teste' });
    const depois = await request(app).post('/api/court/deadline/calculate').set(h).send({ start_date: '2026-03-02', days: 15, regime: 'cpc' });
    assert.equal(depois.body.data_fatal, '2026-03-25');
    await request(app).delete(`/api/court/holidays/${c.body.id}`).set(h);
  });
  it('sem login, a API de feriados é negada', async () => {
    assert.equal((await request(app).post('/api/court/holidays').send({ date: '2026-05-31', name: 'x' })).status, 401);
  });
});
