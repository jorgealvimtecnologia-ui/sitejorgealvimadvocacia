/**
 * Testes físicos do site (ordens ORD-MUFSK5A6-V21 e ORD-MUFSMMFL-IJ4):
 * 1. Checklist cobre as páginas e tem ids únicos
 * 2. Cronograma por dia útil (sem fim de semana, sem passar do limite por dia)
 * 3. Hoje / atrasados / falhas conforme os registros; "falhou" exige observação
 * 4. Só o mestre acessa; agentes veem as falhas pela chave deles
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

const TMP_DB = path.join(os.tmpdir(), `jaw-qa-test-${Date.now()}.db`);
const AGENT_KEY = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
process.env.ROADMAP_AGENT_KEY_SHA256 = crypto.createHash('sha256').update(AGENT_KEY).digest('hex');

const { app, db } = await import('../server.js');
const { createEmployeeSession } = await import('../src/middleware/auth.js');
const qa = await import('../src/modules/qa/qa.service.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch {}
  }
});

async function masterToken() {
  const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(r.status, 200);
  return r.body.token;
}

describe('Checklist e cronograma', () => {
  it('checklist cobre as páginas principais e os ids são únicos', () => {
    const { items } = qa.loadCatalog();
    assert.ok(items.length > 500);
    const pages = new Set(items.map(i => i.page));
    for (const p of ['Site institucional (página inicial)', 'Blog (lista e artigo)', 'Portal do Cliente', 'Portal do Colaborador', 'Painel administrativo']) {
      assert.ok(pages.has(p), `faltando: ${p}`);
    }
    assert.equal(new Set(items.map(i => i.id)).size, items.length);
  });

  it('cronograma usa só dias úteis e respeita o limite por dia, sem perder itens', () => {
    const { items } = qa.loadCatalog();
    const days = qa.buildSchedule(items, { start_date: '2026-09-25', per_day: 30 }); // sexta
    assert.equal(days[0].date, '2026-09-25');
    assert.equal(days[1].date, '2026-09-28'); // pula sábado e domingo
    for (const d of days) {
      const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay();
      assert.ok(wd !== 0 && wd !== 6, `dia ${d.number} cai no fim de semana`);
      assert.ok(d.items.length <= 30);
    }
    assert.equal(days.reduce((n, d) => n + d.items.length, 0), items.length);
  });
});

describe('Hoje, atrasados e falhas', () => {
  it('itens de dias passados sem registro ficam atrasados; OK e Falhou contam como feitos', () => {
    qa.ensureQaTables();
    qa.updateSettings({ start_date: '2026-09-21', per_day: 30 }); // segunda
    const now = new Date('2026-09-23T15:00:00Z'); // quarta, dia 3
    let o = qa.getQaOverview(now);
    assert.equal(o.today.date, '2026-09-23');
    assert.equal(o.summary.overdue, o.days[0].total + o.days[1].total);
    assert.ok(o.ask_today);

    const first = o.overdue_items[0];
    assert.ok(qa.recordResult({ item_id: first.id, result: 'ok' }, 'teste').value);
    const second = o.overdue_items[1];
    assert.ok(qa.recordResult({ item_id: second.id, result: 'falhou', note: 'Botão não responde' }, 'teste').value);

    o = qa.getQaOverview(now);
    assert.equal(o.summary.done, 2);
    assert.equal(o.summary.failed, 1);
    assert.equal(o.failed_items[0].note, 'Botão não responde');
    assert.equal(o.overdue_items.some(i => i.id === first.id), false);

    // refazer volta para pendente
    qa.recordResult({ item_id: first.id, result: 'refazer' }, 'teste');
    o = qa.getQaOverview(now);
    assert.equal(o.summary.done, 1);
  });

  it('"falhou" exige observação e item inexistente é recusado', () => {
    const id = qa.loadCatalog().items[0].id;
    assert.ok(qa.recordResult({ item_id: id, result: 'falhou', note: '' }, 'x').error);
    assert.ok(qa.recordResult({ item_id: 'QA-NAOEXISTE', result: 'ok' }, 'x').error);
    assert.ok(qa.recordResult({ item_id: id, result: '<b>x</b>' }, 'x').error);
  });

  it('com tudo do dia feito e sem atrasos, não pergunta', () => {
    qa.updateSettings({ start_date: '2026-10-05', per_day: 30 }); // segunda futura
    const now = new Date('2026-10-05T15:00:00Z');
    let o = qa.getQaOverview(now);
    for (const it of o.today_items) qa.recordResult({ item_id: it.id, result: 'ok' }, 'teste');
    o = qa.getQaOverview(now);
    assert.equal(o.summary.today_done, o.summary.today_total);
    assert.equal(o.ask_today, false);
  });
});

describe('Rotas e acesso', () => {
  it('colaborador não acessa; mestre acessa e registra', async () => {
    const emp = createEmployeeSession({ id: 'EMP-QA-1', name: 'Colaborador QA', cpf: '000' });
    const denied = await request(app).get('/api/admin/qa').set('Authorization', `Bearer ${emp}`);
    assert.equal(denied.status, 403);

    const t = await masterToken();
    const ok = await request(app).get('/api/admin/qa').set('Authorization', `Bearer ${t}`);
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.body.days) && ok.body.days.length > 10);

    const item = qa.loadCatalog().items[5];
    const rec = await request(app).post('/api/admin/qa/results').set('Authorization', `Bearer ${t}`).send({ item_id: item.id, result: 'falhou', note: 'Link quebrado no rodapé' });
    assert.equal(rec.status, 200);
    const day = await request(app).get(`/api/admin/qa/day/1`).set('Authorization', `Bearer ${t}`);
    assert.equal(day.status, 200);
  });

  it('agentes veem as falhas para propor correções', async () => {
    const r = await request(app).get('/api/agent/roadmap').set('X-Roadmap-Agent-Key', AGENT_KEY).set('X-Roadmap-Agent', 'claude');
    assert.equal(r.status, 200);
    assert.ok(r.body.qa.failed_items.some(i => i.note === 'Link quebrado no rodapé'));
  });
});
