/**
 * Gestão de Leads v2 — distribuição, estágio do cadastro e linha do tempo.
 *
 * 1. Lead entra no estágio 'recebido' e registra evento na trilha.
 * 2. Caixa de novos leads e contadores de contratos (dashboard-summary).
 * 3. Distribuição é restrita ao Mestre (403 para outros); exige responsável (400).
 * 4. Distribuir grava responsável no lead e propaga para a ficha do cliente.
 * 5. Estágio inválido → 400; estágios válidos refletem no registration_status do cliente.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-leads-mgmt-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'jorgealvim';

const { app, db } = await import('../server.js');
const { createSession } = await import('../src/middleware/auth.js');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
let masterToken = '';
let advToken = '';
let leadId = '';

before(async () => {
  const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'jorgealvim' });
  assert.equal(r.status, 200);
  masterToken = r.body.token;
  // Sessão de um advogado comum (não-mestre) para testar o veto de distribuição.
  advToken = createSession({ id: 'USR-ADV-TESTE', username: 'adv_teste', name: 'Dra. Advogada Teste', role: 'advogado' });
});

after(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
});

describe('Gestão de Leads v2', () => {
  it('POST /api/leads cria lead no estágio "recebido" com evento na trilha', async () => {
    const r = await request(app).post('/api/leads')
      .field('name', 'Lead Distribuir').field('phone', '32999990000')
      .field('area', 'Trabalhista').field('message', 'teste de distribuição');
    assert.equal(r.status, 201);
    leadId = r.body.clientId;
    assert.ok(leadId);

    const list = await auth(request(app).get('/api/leads'), masterToken);
    const found = list.body.leads.find(l => l.id === leadId);
    assert.ok(found, 'lead deve aparecer na listagem');
    assert.equal(found.stage, 'recebido');

    const ev = await auth(request(app).get(`/api/leads/${leadId}/events`), masterToken);
    assert.equal(ev.status, 200);
    assert.ok(ev.body.events.some(e => e.event_type === 'recebido'), 'trilha deve ter evento "recebido"');
  });

  it('GET /api/leads/dashboard-summary lista novos leads e contadores de contratos', async () => {
    const r = await auth(request(app).get('/api/leads/dashboard-summary'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.newLeads.count >= 1);
    assert.ok(r.body.newLeads.items.some(l => l.id === leadId));
    assert.equal(typeof r.body.contracts.day, 'number');
    assert.equal(typeof r.body.contracts.month, 'number');
    assert.equal(typeof r.body.contracts.year, 'number');
  });

  it('GET /api/leads/contracts-list responde com array', async () => {
    const r = await auth(request(app).get('/api/leads/contracts-list'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.contracts));
  });

  it('distribuir sem responsável → 400', async () => {
    const r = await auth(request(app).post(`/api/leads/${leadId}/distribute`), masterToken).send({});
    assert.equal(r.status, 400);
  });

  it('distribuir por não-mestre (advogado) → 403', async () => {
    const r = await auth(request(app).post(`/api/leads/${leadId}/distribute`), advToken)
      .send({ responsible_lawyer_id: 'X', responsible_lawyer_name: 'Y' });
    assert.equal(r.status, 403);
  });

  it('mestre distribui → estágio "distribuido" e responsável no lead e no cliente', async () => {
    const r = await auth(request(app).post(`/api/leads/${leadId}/distribute`), masterToken).send({
      responsible_lawyer_id: 'USR-ADV-TESTE', responsible_lawyer_name: 'Dra. Advogada Teste',
      assigned_secretary_id: 'USR-SEC', assigned_secretary_name: 'Secretária Teste'
    });
    assert.equal(r.status, 200);

    const list = await auth(request(app).get('/api/leads'), masterToken);
    const found = list.body.leads.find(l => l.id === leadId);
    assert.equal(found.stage, 'distribuido');
    assert.equal(found.responsible_lawyer_name, 'Dra. Advogada Teste');
    assert.equal(found.assigned_secretary_name, 'Secretária Teste');

    const cli = db.prepare(`SELECT responsible_lawyer_name FROM clients WHERE id = ?`).get(leadId);
    assert.equal(cli.responsible_lawyer_name, 'Dra. Advogada Teste', 'cliente herda o responsável');

    // Distribuído deixa de contar como "novo lead".
    const sum = await auth(request(app).get('/api/leads/dashboard-summary'), masterToken);
    assert.ok(!sum.body.newLeads.items.some(l => l.id === leadId));
  });

  it('estágio inválido → 400', async () => {
    const r = await auth(request(app).patch(`/api/leads/${leadId}/stage`), masterToken).send({ stage: 'inexistente' });
    assert.equal(r.status, 400);
  });

  it('estágio "falta_documento" reflete pendência no cadastro do cliente', async () => {
    const r = await auth(request(app).patch(`/api/leads/${leadId}/stage`), masterToken)
      .send({ stage: 'falta_documento', note: 'Falta procuração assinada' });
    assert.equal(r.status, 200);
    const cli = db.prepare(`SELECT registration_status FROM clients WHERE id = ?`).get(leadId);
    assert.equal(cli.registration_status, 'pendente');
    const ev = await auth(request(app).get(`/api/leads/${leadId}/events`), masterToken);
    assert.ok(ev.body.events.some(e => e.event_type === 'estagio'));
  });

  it('estágio "concluido" marca o cadastro do cliente como concluído', async () => {
    const r = await auth(request(app).patch(`/api/leads/${leadId}/stage`), masterToken).send({ stage: 'concluido' });
    assert.equal(r.status, 200);
    const cli = db.prepare(`SELECT registration_status FROM clients WHERE id = ?`).get(leadId);
    assert.equal(cli.registration_status, 'concluido');
  });
});
