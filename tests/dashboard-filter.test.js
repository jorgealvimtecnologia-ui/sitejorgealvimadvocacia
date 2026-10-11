/** Visão Geral: cada pessoa recebe SÓ os números das abas que pode abrir (o resto vem zerado). */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-dash-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { filterOverviewForUser, filterCockpitForUser } = await import('../src/modules/dashboard/dashboard.routes.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const cheio = () => ({
  success: true,
  risco: { nivel: 'VERMELHO', mensagem: 'x', prazos_hoje: 3, prazos_3dias: 2, audiencias_hoje: 1 },
  financeiro: { receita_mes: 9000, despesa_mes: 1000, saldo_mes: 8000, a_receber: 500, inadimplente: 300, inadimplente_qtd: 2 },
  juridico: { clientes_total: 40, clientes_ativos: 30, processos_total: 70, processos_andamento: 50 },
  prazos: { proximos: [{ titulo: 'Apelação X', processo: '001' }], hoje: 3, fatais_3dias: 2, total_15dias: 9 },
  comercial: { leads_novos: 4, leads_mes: 12 },
  equipe: { funcionarios_ativos: 8, ponto_hoje: 6, foguetes_pendentes: 2 },
  compliance: { assinaturas_pendentes: 5, assinaturas_concluidas: 9, lgpd_abertas: 1, notificacoes_nao_lidas: 7 },
});

describe('filterOverviewForUser', () => {
  it('mestre recebe tudo', () => {
    assert.deepEqual(filterOverviewForUser(cheio(), {}, true), cheio());
  });
  it('secretária (leads, clientes, agenda): sem financeiro, processos, RH e LGPD; com clientes, leads e prazos', () => {
    const p = filterOverviewForUser(cheio(), { tab_leads: 1, tab_clients: 1, tab_calendar: 1 });
    assert.equal(p.financeiro.receita_mes, 0);
    assert.equal(p.financeiro.a_receber, 0);
    assert.equal(p.juridico.processos_total, 0);
    assert.equal(p.juridico.clientes_total, 40);
    assert.equal(p.equipe.funcionarios_ativos, 0);
    assert.equal(p.equipe.foguetes_pendentes, 2);
    assert.equal(p.compliance.lgpd_abertas, 0);
    assert.equal(p.compliance.assinaturas_pendentes, 0);
    assert.equal(p.comercial.leads_novos, 4);
    assert.equal(p.prazos.hoje, 3);
  });
  it('sem agenda nem processos: prazos e risco vêm vazios (e sem nomes de processo)', () => {
    const p = filterOverviewForUser(cheio(), { tab_leads: 1 });
    assert.deepEqual(p.prazos.proximos, []);
    assert.equal(p.risco.prazos_hoje, 0);
    assert.equal(p.risco.nivel, 'VERDE');
    assert.ok(!JSON.stringify(p).includes('Apelação X'));
  });
  it('quem tem Financeiro vê o financeiro', () => {
    assert.equal(filterOverviewForUser(cheio(), { tab_financial: 1 }).financeiro.receita_mes, 9000);
  });
});

describe('GET /api/dashboard/overview', () => {
  let masterToken, opToken;
  before(async () => {
    masterToken = (await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD })).body.token;
    const p = hashPassword('SenhaDeTeste#2026');
    db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES ('U-DASH', 'dash.sec', ?, ?, 'Dash Sec', 'secretaria', datetime('now'))`).run(p.hash, p.salt);
    db.prepare(`INSERT INTO access_permissions (id, user_id, user_type, user_name, user_identifier, role_template, tab_leads, tab_clients, tab_calendar, is_active, data_scope, created_at, updated_at) VALUES ('P-DASH', 'U-DASH', 'admin', 'Dash Sec', 'dash.sec', 'secretaria', 1, 1, 1, 1, 'office', datetime('now'), datetime('now'))`).run();
    opToken = (await request(app).post('/api/auth/login').send({ identifier: 'dash.sec', password: 'SenhaDeTeste#2026' })).body.token;
    db.prepare(`INSERT INTO financial_transactions (id, type, category, description, amount, status, payment_date, created_at, updated_at) VALUES ('FT-DASH', 'Receita', 'honorarios', 'x', 12345.67, 'Pago', date('now'), datetime('now'), datetime('now'))`).run();
  });
  it('a secretária recebe o financeiro ZERADO e o mestre recebe o real (cache compartilhado não vaza)', async () => {
    const m = await request(app).get('/api/dashboard/overview?refresh=1').set('Authorization', `Bearer ${masterToken}`);
    assert.equal(m.status, 200);
    const s = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${opToken}`);
    assert.equal(s.status, 200);
    assert.equal(s.body.financeiro.receita_mes, 0);
    assert.equal(s.body.financeiro.saldo_mes, 0);
    assert.ok(!JSON.stringify(s.body).includes('12345'));
    assert.ok(m.body.financeiro.receita_mes >= 12345, `o mestre deveria ver a receita real, veio ${m.body.financeiro.receita_mes}`);
  });
});

const cockpit = () => ({
  success: true,
  prazos: {
    hoje: [{ id: 1, source: 'agenda', title: 'Prazo agenda', client_name: 'Cliente A' }, { id: 2, source: 'djen', title: 'Intimação X', client_name: 'Vara 1' }],
    amanha: [{ id: 3, title: 'Amanhã', client_name: 'Cliente B' }],
    semana: [{ id: 4, title: 'Semana', client_name: 'Cliente C' }],
    total_hoje: 2, total_semana: 4
  },
  audiencias: [{ id: 5, title: 'Audiência', client_name: 'Cliente D' }],
  intimacoes: [{ id: 6, numero_processo: '0001', texto: 'texto da intimação' }]
});

describe('filterCockpitForUser (Meu Dia Hoje)', () => {
  it('mestre recebe tudo', () => assert.deepEqual(filterCockpitForUser(cockpit(), {}, true), cockpit()));
  it('secretária (agenda, sem intimações): vê a agenda e NÃO vê intimações do DJEN', () => {
    const c = filterCockpitForUser(cockpit(), { tab_calendar: 1 });
    assert.equal(c.prazos.hoje.length, 1);
    assert.equal(c.prazos.hoje[0].source, 'agenda');
    assert.equal(c.audiencias.length, 1);
    assert.deepEqual(c.intimacoes, []);
    assert.ok(!JSON.stringify(c).includes('Intimação X'));
    assert.equal(c.prazos.total_hoje, 1);
  });
  it('só Leads (sem agenda, processos nem intimações): nada de prazos, audiências ou intimações', () => {
    const c = filterCockpitForUser(cockpit(), { tab_leads: 1 });
    assert.deepEqual([c.prazos.hoje, c.prazos.amanha, c.prazos.semana, c.audiencias, c.intimacoes], [[], [], [], [], []]);
    assert.equal(c.prazos.total_semana, 0);
  });
  it('quem tem Intimações vê as do DJEN', () => {
    const c = filterCockpitForUser(cockpit(), { tab_publications: 1 });
    assert.equal(c.intimacoes.length, 1);
    assert.equal(c.prazos.hoje.length, 1);
    assert.equal(c.prazos.hoje[0].source, 'djen');
  });
});
