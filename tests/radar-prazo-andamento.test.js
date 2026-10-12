/**
 * RADAR-04 — lançar prazo na Agenda a partir de um ANDAMENTO (POST /api/court/deadline/from-movement).
 * Nada automático: só cria quando chamado; cria um calendar_event 'prazo_fatal' ligado ao processo.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-prazo-andamento-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

let token = '';
let lawsuitId = '';
let movementId = 0;

before(async () => {
  const login = await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(login.status, 200);
  token = login.body.token;

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at)
    VALUES ('CLI-PRZ','PF','Cliente Prazo','529.982.247-25','c@x.com','(32) 90000-0000','Ativo',?,?)`).run(now, now);
  const r = await request(app).post('/api/lawsuits').set({ Authorization: `Bearer ${token}` })
    .send({ client_id: 'CLI-PRZ', cnj_number: '5000099-11.2026.8.13.0145', tribunal: 'TJMG' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  lawsuitId = r.body.lawsuitId;

  const info = db.prepare(`INSERT INTO lawsuit_movements (lawsuit_id, movement_date, title, description, created_at)
    VALUES (?, '2026-10-01', 'Intimação para contestar', 'Prazo para contestação', ?)`).run(lawsuitId, now);
  movementId = Number(info.lastInsertRowid);
});

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('RADAR-04: prazo na Agenda a partir do andamento', () => {
  it('lança o prazo e cria um evento prazo_fatal ligado ao processo', async () => {
    const r = await auth(request(app).post('/api/court/deadline/from-movement'))
      .send({ movement_id: movementId, days: 15, regime: 'cpc' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(r.body.deadline_date, 'deve devolver a data fatal');
    assert.ok(r.body.event_id, 'deve devolver o id do evento');
    const ev = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(r.body.event_id);
    assert.ok(ev, 'evento criado');
    assert.equal(ev.event_type, 'prazo_fatal');
    assert.equal(ev.lawsuit_id, lawsuitId);
    assert.ok(ev.start_datetime.startsWith(r.body.deadline_date), 'evento na data fatal');
  });

  it('a data fatal é posterior à base (15 dias úteis)', async () => {
    const r = await auth(request(app).post('/api/court/deadline/from-movement'))
      .send({ movement_id: movementId, days: 15, regime: 'cpc', title: 'Contestação' });
    assert.equal(r.status, 201);
    assert.ok(r.body.deadline_date > '2026-10-01', 'prazo depois da base');
  });

  it('andamento inexistente devolve 404', async () => {
    const r = await auth(request(app).post('/api/court/deadline/from-movement')).send({ movement_id: 999999, days: 15 });
    assert.equal(r.status, 404);
  });

  it('sem movement_id devolve 400', async () => {
    const r = await auth(request(app).post('/api/court/deadline/from-movement')).send({ days: 15 });
    assert.equal(r.status, 400);
  });
});
