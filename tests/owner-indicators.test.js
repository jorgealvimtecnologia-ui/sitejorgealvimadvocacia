/**
 * AUD-17: indicadores do dono. Cenário pequeno com números conferidos à mão.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { classifyArea } from '../src/shared/legal-areas.js';
import { classifyOrigin, hostOf } from '../src/shared/lead-origin.js';

const TMP_DB = path.join(os.tmpdir(), `jaw-ind-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { buildOwnerIndicators } = await import('../src/modules/indicators/owner-indicators.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

describe('classificação', () => {
  it('áreas do direito', () => {
    assert.equal(classifyArea('Ação Trabalhista - Verbas rescisórias'), 'Trabalhista');
    assert.equal(classifyArea('Revisão de benefício INSS'), 'Previdenciário');
    assert.equal(classifyArea('Divórcio e guarda'), 'Cível e Família');
    assert.equal(classifyArea('Cobrança indevida banco'), 'Consumidor e Contratos');
    assert.equal(classifyArea('Habeas corpus'), 'Criminal');
    assert.equal(classifyArea('Execução fiscal'), 'Tributário');
    assert.equal(classifyArea('Qualquer coisa estranha'), 'Outros');
    assert.equal(classifyArea('Consulta Express Geral'), null);
    assert.equal(classifyArea(''), null);
  });
  it('origem: campanha paga, busca, redes, WhatsApp, direto e terceiros', () => {
    assert.equal(classifyOrigin({ utm_source: 'google', utm_medium: 'cpc' }).origin, 'Google Ads');
    assert.equal(classifyOrigin({ utm_source: 'google', utm_medium: 'organic' }).origin, 'Busca na internet');
    assert.equal(classifyOrigin({ utm_source: 'facebook', utm_medium: 'paid_social' }).origin, 'Meta Ads');
    assert.equal(classifyOrigin({ utm_source: 'instagram', utm_medium: 'social' }).origin, 'Instagram / Facebook');
    assert.equal(classifyOrigin({ referrer: 'https://www.google.com.br/' }).origin, 'Busca na internet');
    assert.equal(classifyOrigin({ referrer: 'https://l.instagram.com/?u=abc' }).origin, 'Instagram / Facebook');
    assert.equal(classifyOrigin({ referrer: 'https://wa.me/55329' }).origin, 'WhatsApp');
    assert.equal(classifyOrigin({ referrer: 'https://blogdoamigo.com.br/post' }).origin, 'Site ou blog de terceiros');
    assert.equal(classifyOrigin({}).origin, 'Direto / não identificado');
    assert.equal(classifyOrigin({ referrer: 'https://jorgealvimadvocacia.com.br/blog' }).origin, 'Direto / não identificado');
    assert.equal(classifyOrigin({ utm_source: 'newsletter' }).origin, 'E-mail');
  });
  it('só o domínio de referência é guardado, nunca a URL', () => {
    const o = classifyOrigin({ referrer: 'https://exemplo.com.br/pagina?cpf=12345678900&token=abc' });
    assert.equal(hostOf('https://www.exemplo.com.br/x?a=1'), 'exemplo.com.br');
    assert.ok(!o.detail.includes('cpf') && !o.detail.includes('token') && o.detail.includes('exemplo.com.br'));
  });
});

describe('indicadores com números conferidos', () => {
  const TODAY = '2026-10-15';
  const ins = (sql, ...a) => db.prepare(sql).run(...a);
  const cli = (id, nome) => ins(`INSERT INTO clients (id, client_type, full_name, cpf, phone, contract_status, contract_value, created_at, updated_at) VALUES (?, 'PF', ?, ?, '32999990000', 'ATIVO', ?, 'x', 'x')`, id, nome, id.replace(/\D/g, '').padEnd(11, '0'), 1000);
  const law = (cid, tipo) => ins(`INSERT INTO lawsuits (id, client_id, cnj_number, tribunal, action_type, created_at, updated_at) VALUES (?, ?, ?, 'TJMG', ?, '2026-01-01', '2026-01-01')`, `L-${cid}`, cid, `N-${cid}`, tipo);
  const tx = (id, type, cat, amount, status, due, pay, client = null, inst = null) => ins(`INSERT INTO financial_transactions (id, type, category, description, amount, due_date, payment_date, status, client_id, installment_id, created_at, updated_at) VALUES (?, ?, ?, 'x', ?, ?, ?, ?, ?, ?, 'x', 'x')`, id, type, cat, amount, due, pay, status, client, inst);
  const parcela = (cid, n, valor, venc, status, pago = null) => ins(`INSERT INTO contract_installments (client_id, installment_number, total_installments, amount, due_date, paid_date, status, created_at, updated_at) VALUES (?, ?, 12, ?, ?, ?, ?, 'x', 'x')`, cid, n, valor, venc, pago, status);

  it('monta o cenário', () => {
    cli('CLI-A', 'Ana Trabalhista'); law('CLI-A', 'Ação Trabalhista');
    cli('CLI-B', 'Bruno Previdenciario'); law('CLI-B', 'Aposentadoria INSS');
    cli('CLI-C', 'Carla Sem Processo'); // sem área
    // livro caixa (pago): receitas A=1000, B=500, C=200, sem cliente=300; despesas: A=100 (direta), geral=400
    tx('T1', 'Receita', 'Honorários', 600, 'Pago', '2026-09-01', '2026-09-02', 'CLI-A');
    tx('T2', 'Receita', 'Honorários', 400, 'Pago', '2026-10-01', '2026-10-03', 'CLI-A');
    tx('T3', 'Receita', 'Honorários', 500, 'Pago', '2026-08-10', '2026-08-11', 'CLI-B');
    tx('T4', 'Receita', 'Honorários', 200, 'Pago', '2026-10-05', '2026-10-06', 'CLI-C');
    tx('T5', 'Receita', 'Consulta avulsa', 300, 'Pago', '2026-10-07', '2026-10-07');
    tx('T6', 'Despesa', 'Custas', 100, 'Pago', '2026-09-20', '2026-09-20', 'CLI-A');
    tx('T7', 'Despesa', 'Aluguel', 400, 'Pago', '2026-09-05', '2026-09-05');
    // fora do período e cancelado/pendente não entram no "pago"
    tx('T8', 'Receita', 'Antiga', 9999, 'Pago', '2024-01-01', '2024-01-02', 'CLI-A');
    tx('T9', 'Receita', 'Pendente', 777, 'Pendente', '2026-11-10', null, 'CLI-A');
    tx('T10', 'Despesa', 'Cancelada', 555, 'Cancelado', '2026-09-10', null);
    // parcelas: vencidas (A: 45 dias, B: 100 dias) e futuras
    parcela('CLI-A', 1, 300, '2026-08-31', 'Pendente');   // 45 dias de atraso
    parcela('CLI-B', 1, 200, '2026-07-07', 'Pendente');   // 100 dias
    parcela('CLI-A', 2, 300, '2026-10-31', 'Pendente');   // vence este mês
    parcela('CLI-A', 3, 300, '2026-11-30', 'Pendente');
    parcela('CLI-A', 4, 150, '2026-09-30', 'Pago', '2026-09-30');
    // alvarás: 1 em custódia (cliente), 1 repassado
    ins(`INSERT INTO alvaras (id, client_id, gross_amount, fee_percentage, fee_amount, net_client_amount, release_date, transfer_date, status, created_at, updated_at) VALUES ('AL1', 'CLI-A', 10000, 30, 3000, 7000, '2026-10-01', NULL, 'Pendente Repasse', 'x', 'x')`);
    ins(`INSERT INTO alvaras (id, client_id, gross_amount, fee_percentage, fee_amount, net_client_amount, release_date, transfer_date, status, created_at, updated_at) VALUES ('AL2', 'CLI-B', 5000, 30, 1500, 3500, '2026-09-01', '2026-09-10', 'Repassado ao Cliente', 'x', 'x')`);
    // leads por origem
    const lead = (id, origin, client) => ins(`INSERT INTO leads (id, created_at, name, phone, area, message, files, status, stage, client_id, origin) VALUES (?, '2026-09-01', 'L', '32', 'Trabalhista', '', '[]', 'Novo', 'recebido', ?, ?)`, id, client, origin);
    lead('LD1', 'Google Ads', 'CLI-A'); lead('LD2', 'Google Ads', null); lead('LD3', 'Busca na internet', 'CLI-B'); lead('LD4', null, null);
  });

  it('receita por área e margem direta batem com o livro caixa', () => {
    const r = buildOwnerIndicators(db, { today: TODAY, months: 12 });
    const por = Object.fromEntries(r.revenue_by_area.rows.map((x) => [x.area, x]));
    assert.equal(por['Trabalhista'].revenue, 1000);
    assert.equal(por['Trabalhista'].direct_expense, 100);
    assert.equal(por['Trabalhista'].direct_margin, 900);
    assert.equal(por['Previdenciário'].revenue, 500);
    assert.equal(por['Sem área definida'].revenue, 200);
    assert.equal(r.revenue_by_area.revenue_without_client, 300);
    assert.equal(r.revenue_by_area.general_expense, 400);
    assert.equal(por['Trabalhista'].share, 50); // 1000 de 2000
    assert.equal(r.reconciliation.ledger_revenue, 2000);
    assert.equal(r.reconciliation.revenue_diff, 0);
    assert.equal(r.reconciliation.ledger_expense, 500);
    assert.equal(r.reconciliation.expense_diff, 0);
    assert.equal(r.reconciliation.ok, true);
  });

  it('inadimplência: total, idade das dívidas e maiores devedores', () => {
    const d = buildOwnerIndicators(db, { today: TODAY, months: 12 }).delinquency;
    assert.equal(d.overdue_total, 500);
    assert.equal(d.overdue_count, 2);
    assert.equal(d.aging['31-60'], 300);
    assert.equal(d.aging['90+'], 200);
    assert.equal(d.top_debtors[0].name, 'Ana Trabalhista');
    assert.equal(d.top_debtors[0].oldest_days, 45);
    assert.equal(d.rate_percent, Math.round((500 / (150 + 500)) * 1000) / 10); // vencido ÷ (recebido em parcelas + vencido)
  });

  it('previsão de caixa: entradas contratadas, saídas = maior entre lançadas e média, sem inventar', () => {
    const f = buildOwnerIndicators(db, { today: TODAY, months: 12, horizon: 3 }).cash_forecast;
    assert.equal(f.months.length, 3);
    assert.equal(f.months[0].month, '2026-10');
    assert.equal(f.months[0].inflow, 300);      // parcela de 31/10 (as vencidas NÃO entram na previsão)
    assert.equal(f.months[1].month, '2026-11');
    assert.equal(f.months[1].inflow, 300 + 777); // parcela 30/11 + receita pendente de 10/11
    assert.equal(f.months[2].inflow, 0);
    assert.equal(f.avg_monthly_expense_3m, Math.round(((400 + 100) / 3) * 100) / 100); // set: 500; ago/jul: 0
    assert.ok(Math.abs(f.months[2].accumulated - f.months.reduce((s, m) => s + m.net, 0)) < 0.02); // acumulado = soma dos meses (arredondamentos)
  });

  it('horizonte aceita só 3 ou 6 meses', () => {
    assert.equal(buildOwnerIndicators(db, { today: TODAY, horizon: 6 }).cash_forecast.months.length, 6);
    assert.equal(buildOwnerIndicators(db, { today: TODAY, horizon: 99 }).cash_forecast.months.length, 6);
  });

  it('origem dos clientes: leads, contratos e conversão por origem', () => {
    const o = Object.fromEntries(buildOwnerIndicators(db, { today: TODAY, months: 12 }).lead_origins.rows.map((x) => [x.origin, x]));
    assert.equal(o['Google Ads'].leads, 2);
    assert.equal(o['Google Ads'].contracts, 1);
    assert.equal(o['Google Ads'].conversion_percent, 50);
    assert.equal(o['Busca na internet'].conversion_percent, 100);
    assert.equal(o['Não informado'].leads, 1);
  });

  it('dinheiro de terceiros fica separado e fora das receitas', () => {
    const r = buildOwnerIndicators(db, { today: TODAY, months: 12 });
    assert.equal(r.third_party.held_amount, 7000);
    assert.equal(r.third_party.held_count, 1);
    assert.equal(r.third_party.transferred_amount, 3500);
    assert.ok(r.reconciliation.ledger_revenue < 7000); // a parte do cliente não entrou no caixa do escritório
  });
});

describe('API', () => {
  it('só com a aba Financeiro (mestre sempre); sem login é negado', async () => {
    assert.equal((await request(app).get('/api/financial/owner-indicators')).status, 401);
    const m = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD });
    const ok = await request(app).get('/api/financial/owner-indicators?months=6&horizon=3').set({ Authorization: `Bearer ${m.body.token}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.period.months, 6);
    assert.equal(ok.body.cash_forecast.months.length, 3);
    assert.equal(ok.body.reconciliation.ok, true);
  });
  it('os leads do site e do agendamento guardam a origem', async () => {
    await request(app).post('/api/leads').field('name', 'Pessoa Teste').field('phone', '32999998888').field('area', 'Trabalhista').field('utm_source', 'google').field('utm_medium', 'cpc').field('utm_campaign', 'trabalhista-jf').field('referrer', 'google.com.br');
    const l = db.prepare(`SELECT origin, origin_detail FROM leads WHERE name = 'Pessoa Teste'`).get();
    assert.equal(l.origin, 'Google Ads');
    assert.match(l.origin_detail, /utm_campaign=trabalhista-jf/);
  });
});
