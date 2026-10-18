import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-radar-b2b-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

let masterToken = '';

before(async () => {
  const r = await request(app)
    .post('/api/auth/login')
    .send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(r.status, 200);
  masterToken = r.body.token;
});

after(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

describe('▶ MÓDULO RADAR / PROSPECÇÃO B2B (GOOGLE EMPRESAS & CRM KANBAN)', () => {
  it('1. GET /api/radar-b2b/stats -> retorna estatísticas do funil', async () => {
    const res = await request(app)
      .get('/api/radar-b2b/stats')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(res.body.statusCounts);
  });

  it('2. POST /api/radar-b2b/importar-local -> importa base de empresas deduplicadas', async () => {
    const res = await request(app)
      .post('/api/radar-b2b/importar-local')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.inserted > 0 || res.body.skipped > 0);
    assert.ok(res.body.totalNow > 0);
  });

  it('3. GET /api/radar-b2b/prospects -> lista empresas com suporte a filtros e Kanban', async () => {
    const res = await request(app)
      .get('/api/radar-b2b/prospects?view=kanban')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.prospects));
    assert.ok(res.body.prospects.length > 0);

    const first = res.body.prospects[0];
    assert.ok(first.name);
    assert.ok(first.status);
  });

  it('4. PUT /api/radar-b2b/prospects/:id/status -> move etapa no Kanban', async () => {
    const listRes = await request(app)
      .get('/api/radar-b2b/prospects?limit=1')
      .set('Authorization', `Bearer ${masterToken}`);

    const prospect = listRes.body.prospects[0];
    assert.ok(prospect);

    const updateRes = await request(app)
      .put(`/api/radar-b2b/prospects/${prospect.id}/status`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ status: 'contatado', notes: 'Ligação feita pelo escritório' });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.status, 'contatado');

    const check = db.prepare('SELECT status, notes FROM radar_b2b_prospects WHERE id = ?').get(prospect.id);
    assert.equal(check.status, 'contatado');
    assert.equal(check.notes, 'Ligação feita pelo escritório');
  });

  it('5. POST /api/radar-b2b/prospects/:id/convert -> promove prospect para Cliente PJ oficial', async () => {
    const now = new Date().toISOString();
    const testPid = `test_place_${Date.now()}`;
    db.prepare(`
      INSERT INTO radar_b2b_prospects (
        place_id, name, phone, website, address, neighborhood, city, state, status, created_at, updated_at
      ) VALUES (?, 'Contabilidade Alfa Juiz de Fora Ltda', '(32) 3215-0000', 'https://alfa.com.br', 'Rua Halfeld, 100', 'Centro', 'Juiz de Fora', 'MG', 'novo', ?, ?)
    `).run(testPid, now, now);

    const created = db.prepare('SELECT id FROM radar_b2b_prospects WHERE place_id = ?').get(testPid);
    assert.ok(created);

    const convertRes = await request(app)
      .post(`/api/radar-b2b/prospects/${created.id}/convert`)
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(convertRes.status, 200);
    assert.equal(convertRes.body.success, true);
    assert.ok(convertRes.body.clientId);

    // Confere que entrou na tabela clients como PJ
    const clientRecord = db.prepare('SELECT * FROM clients WHERE id = ?').get(convertRes.body.clientId);
    assert.ok(clientRecord);
    assert.equal(clientRecord.client_type, 'PJ');
    assert.equal(clientRecord.full_name, 'Contabilidade Alfa Juiz de Fora Ltda');

    // Confere que o prospect foi marcado como convertido
    const updatedProspect = db.prepare('SELECT status, converted_client_id FROM radar_b2b_prospects WHERE id = ?').get(created.id);
    assert.equal(updatedProspect.status, 'convertido');
    assert.equal(updatedProspect.converted_client_id, convertRes.body.clientId);
  });

  it('6. GET /api/radar-b2b/export/meta-ads -> gera CSV formatado para Público Personalizado Meta Ads', async () => {
    const res = await request(app)
      .get('/api/radar-b2b/export/meta-ads')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.text.includes('phone,fn,ct,st,country'));
    assert.ok(res.text.includes('juiz de fora'));
  });

  it('7. GET /api/radar-b2b/export/brevo -> gera CSV formatado para Brevo', async () => {
    const res = await request(app)
      .get('/api/radar-b2b/export/brevo')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.text.includes('COMPANY,FIRSTNAME,SMS,PHONE,CITY,WEBSITE,CATEGORY,STATUS'));
  });

  it('8. GET /api/radar-b2b/locations/states e cities -> retorna estados e cidades do Brasil', async () => {
    const resStates = await request(app)
      .get('/api/radar-b2b/locations/states')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(resStates.status, 200);
    assert.ok(Array.isArray(resStates.body.states));
    assert.ok(resStates.body.states.some(s => s.sigla === 'MG'));

    const resCities = await request(app)
      .get('/api/radar-b2b/locations/cities?uf=MG')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(resCities.status, 200);
    assert.ok(Array.isArray(resCities.body.cities));
    assert.ok(resCities.body.cities.includes('Juiz de Fora'));
  });

  it('9. POST & GET /api/radar-b2b/prospects/:id/history -> registra e consulta linha do tempo do lead', async () => {
    const listRes = await request(app)
      .get('/api/radar-b2b/prospects?limit=1')
      .set('Authorization', `Bearer ${masterToken}`);

    const prospect = listRes.body.prospects[0];
    assert.ok(prospect);

    const postHist = await request(app)
      .post(`/api/radar-b2b/prospects/${prospect.id}/history`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        disposition: 'cliente_entrou_em_contato',
        notes: 'Lead ligou para tirar dúvidas sobre direito empresarial e tributário',
        operator_name: 'Dr. Jorge Alvim',
        status: 'contatado'
      });

    assert.equal(postHist.status, 200);
    assert.equal(postHist.body.success, true);

    const getHist = await request(app)
      .get(`/api/radar-b2b/prospects/${prospect.id}/history`)
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(getHist.status, 200);
    assert.ok(Array.isArray(getHist.body.history));
    assert.ok(getHist.body.history.length > 0);
    assert.equal(getHist.body.history[0].disposition, 'cliente_entrou_em_contato');
  });

  it('10. POST /api/radar-b2b/sync-clients -> cruza com tabela clients do escritório', async () => {
    const res = await request(app)
      .post('/api/radar-b2b/sync-clients')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.totalChecked === 'number');
  });

  it('11. POST & GET /api/radar-b2b/campaigns -> cria e lista campanhas de WhatsApp', async () => {
    const createRes = await request(app)
      .post('/api/radar-b2b/campaigns')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'Campanha Jurídica B2B Q4',
        message_template: 'Olá {empresa}! Vimos sua atuação em {bairro} e gostaríamos de apresentar nossa consultoria jurídica.',
        target_status: 'todos',
        target_category: 'todos',
        target_neighborhood: 'todos'
      });

    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.success, true);
    assert.ok(createRes.body.campaignId);

    const listRes = await request(app)
      .get('/api/radar-b2b/campaigns')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.campaigns));
    assert.ok(listRes.body.campaigns.some(c => c.name === 'Campanha Jurídica B2B Q4'));
  });
});
