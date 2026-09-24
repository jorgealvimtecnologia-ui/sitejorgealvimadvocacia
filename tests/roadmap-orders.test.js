/**
 * Roadmap Vivo como painel de controle do construtor:
 * 1. Só o mestre lê/lança/altera/arquiva ordens pelo painel (colaborador é barrado)
 * 2. Campos validados (sem injeção de HTML pela prioridade/status)
 * 3. "Remover" arquiva (nada é apagado) e tudo entra no histórico
 * 4. Resumo informa quanto falta e quando todas as ordens terminaram
 * 5. API dos agentes (Claude/Antigravity) por chave própria, com escopo só do roadmap
 * 6. Importação de ordens de banco local preservando id, data e histórico
 * 7. Soft delete de processo: some do portal do cliente
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

const TMP_DB = path.join(os.tmpdir(), `jaw-roadmap-test-${Date.now()}.db`);
const AGENT_KEY = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
process.env.ROADMAP_AGENT_KEY_SHA256 = crypto.createHash('sha256').update(AGENT_KEY).digest('hex');

const { app, db } = await import('../server.js');
const { createEmployeeSession, createClientSession } = await import('../src/middleware/auth.js');

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
const asMaster = (req, token) => req.set('Authorization', `Bearer ${token}`);
const asAgent = (req, name = 'claude') => req.set('X-Roadmap-Agent-Key', AGENT_KEY).set('X-Roadmap-Agent', name);

describe('Painel de ordens: permissões e validação', () => {
  it('colaborador não acessa o roadmap nem lança ordens', async () => {
    const emp = createEmployeeSession({ id: 'EMP-TEST-1', name: 'Motorista Teste', cpf: '000' });
    const get = await request(app).get('/api/admin/roadmap').set('Authorization', `Bearer ${emp}`);
    assert.equal(get.status, 403);
    const post = await request(app).post('/api/admin/roadmap/orders').set('Authorization', `Bearer ${emp}`).send({ title: 'x' });
    assert.equal(post.status, 403);
  });

  it('recusa prioridade/status fora da lista (sem HTML injetado)', async () => {
    const t = await masterToken();
    const bad = await asMaster(request(app).post('/api/admin/roadmap/orders'), t)
      .send({ title: 'Teste', priority: '<img src=x onerror=alert(1)>' });
    assert.equal(bad.status, 400);
    const ok = await asMaster(request(app).post('/api/admin/roadmap/orders'), t).send({ title: 'Ordem válida', priority: 'P0' });
    assert.equal(ok.status, 200);
    const badStatus = await asMaster(request(app).patch(`/api/admin/roadmap/orders/${ok.body.order.id}`), t).send({ status: '<b>x</b>' });
    assert.equal(badStatus.status, 400);
  });
});

describe('Ciclo de vida, arquivamento e resumo', () => {
  it('lança, executa, conclui e arquiva — tudo no histórico, nada apagado', async () => {
    const t = await masterToken();
    const created = await asMaster(request(app).post('/api/admin/roadmap/orders'), t)
      .send({ title: 'Ciclo completo', description: 'Descrição', acceptance_criteria: 'AC1' });
    const id = created.body.order.id;
    await asMaster(request(app).patch(`/api/admin/roadmap/orders/${id}`), t).send({ status: 'em_curso' });
    await asMaster(request(app).patch(`/api/admin/roadmap/orders/${id}`), t).send({ status: 'conforme' });
    const del = await asMaster(request(app).delete(`/api/admin/roadmap/orders/${id}`), t);
    assert.equal(del.status, 200);

    const row = db.prepare(`SELECT status, completed_at FROM roadmap_builder_orders WHERE id = ?`).get(id);
    assert.equal(row.status, 'cancelada');
    const hist = db.prepare(`SELECT action FROM roadmap_order_history WHERE order_id = ? ORDER BY id`).all(id).map(h => h.action);
    assert.deepEqual(hist, ['CRIADA', 'STATUS_ALTERADO', 'STATUS_ALTERADO', 'STATUS_ALTERADO']);

    const audit = db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE event_name = 'ARQUIVAR_ORDEM_ROADMAP' AND resource_id = ?`).get(id).c;
    assert.equal(audit, 1);
  });

  it('resumo mostra o que falta e sinaliza quando tudo terminou', async () => {
    const t = await masterToken();
    for (const o of db.prepare(`SELECT id FROM roadmap_builder_orders WHERE status IN ('planejado','em_curso','bloqueado')`).all()) {
      await asMaster(request(app).patch(`/api/admin/roadmap/orders/${o.id}`), t).send({ status: 'conforme' });
    }
    let r = await asMaster(request(app).get('/api/admin/roadmap'), t);
    assert.equal(r.body.ordersSummary.open, 0);
    assert.equal(r.body.ordersSummary.all_done, true);

    await asMaster(request(app).post('/api/admin/roadmap/orders'), t).send({ title: 'Nova pendência' });
    r = await asMaster(request(app).get('/api/admin/roadmap'), t);
    assert.equal(r.body.ordersSummary.open, 1);
    assert.equal(r.body.ordersSummary.all_done, false);
  });
});

describe('API dos agentes (Claude / Antigravity)', () => {
  it('sem chave ou com chave errada → 401; a chave não abre outras áreas', async () => {
    assert.equal((await request(app).get('/api/agent/roadmap')).status, 401);
    const wrong = await request(app).get('/api/agent/roadmap').set('X-Roadmap-Agent-Key', 'x'.repeat(64));
    assert.equal(wrong.status, 401);
    const other = await asAgent(request(app).get('/api/clients'));
    assert.equal(other.status, 401);
  });

  it('agente lê a fila, assume, anota e conclui — com o nome dele no histórico', async () => {
    const pend = await asAgent(request(app).get('/api/agent/roadmap'));
    assert.equal(pend.status, 200);
    assert.ok(pend.body.pending.length >= 1);
    const id = pend.body.pending[0].id;

    const start = await asAgent(request(app).patch(`/api/agent/roadmap/orders/${id}`), 'antigravity').send({ status: 'em_curso', note: 'Assumindo' });
    assert.equal(start.body.order.assigned_to, 'antigravity');
    await asAgent(request(app).patch(`/api/agent/roadmap/orders/${id}`), 'antigravity').send({ note: 'Metade pronta' });
    const done = await asAgent(request(app).patch(`/api/agent/roadmap/orders/${id}`), 'antigravity').send({ status: 'conforme', note: 'Entregue no commit abc' });
    assert.equal(done.body.order.status, 'conforme');

    const hist = db.prepare(`SELECT action, performed_by, details FROM roadmap_order_history WHERE order_id = ? ORDER BY id`).all(id);
    assert.ok(hist.some(h => h.action === 'NOTA' && h.details === 'Metade pronta' && h.performed_by === 'antigravity'));
  });

  it('agente não pode arquivar ordens', async () => {
    const reg = await asAgent(request(app).post('/api/agent/roadmap/orders')).send({ title: 'Pendência registrada pelo agente' });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.order.created_by, 'claude');
    const arch = await asAgent(request(app).patch(`/api/agent/roadmap/orders/${reg.body.order.id}`)).send({ status: 'cancelada' });
    assert.equal(arch.status, 403);
  });

  it('importa ordens locais preservando id, data e histórico, sem sobrescrever', async () => {
    const orders = [{
      id: 'ORD-LEGADO1', title: 'Ordem antiga do notebook', wave: 'Onda 1 — Core Jurídico & Experiência',
      priority: 'P1', status: 'em_curso', created_by: 'construtor', created_at: '2026-09-20T10:00:00.000Z'
    }];
    const history = [
      { order_id: 'ORD-LEGADO1', action: 'CRIADA', title: 'Ordem antiga do notebook', new_status: 'planejado', performed_by: 'construtor', created_at: '2026-09-20T10:00:00.000Z' },
      { order_id: 'ORD-LEGADO1', action: 'STATUS_ALTERADO', title: 'Ordem antiga do notebook', previous_status: 'planejado', new_status: 'em_curso', performed_by: 'antigravity', created_at: '2026-09-21T09:00:00.000Z' }
    ];
    const r1 = await asAgent(request(app).post('/api/agent/roadmap/import')).send({ orders, history });
    assert.equal(r1.body.imported, 1);
    const row = db.prepare(`SELECT * FROM roadmap_builder_orders WHERE id = 'ORD-LEGADO1'`).get();
    assert.equal(row.created_at, '2026-09-20T10:00:00.000Z');
    assert.equal(row.status, 'em_curso');
    assert.equal(row.wave, 'Onda 1 — Confiabilidade & SRE'); // onda antiga ajustada, ordem preservada
    const hist = db.prepare(`SELECT action FROM roadmap_order_history WHERE order_id = 'ORD-LEGADO1' ORDER BY id`).all().map(h => h.action);
    assert.deepEqual(hist, ['CRIADA', 'STATUS_ALTERADO', 'IMPORTADA']);

    const r2 = await asAgent(request(app).post('/api/agent/roadmap/import')).send({ orders: [{ ...orders[0], title: 'Tentativa de sobrescrever' }] });
    assert.equal(r2.body.skipped, 1);
    assert.equal(db.prepare(`SELECT title FROM roadmap_builder_orders WHERE id = 'ORD-LEGADO1'`).get().title, 'Ordem antiga do notebook');
  });

  it('chave errada repetida bloqueia o endereço (429)', async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app).get('/api/agent/roadmap').set('X-Roadmap-Agent-Key', 'y'.repeat(64));
    }
    assert.equal(last.status, 429);
  });
});

describe('Soft delete de processos', () => {
  it('processo inativado some do portal do cliente', async () => {
    const t = await masterToken();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, created_at, updated_at)
                VALUES ('CLI-SOFT-1', 'PF', 'Cliente Soft', '390.533.447-05', 'soft@teste.com', '(32) 9', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO lawsuits (id, client_id, cnj_number, tribunal, action_type, status, created_at, updated_at)
                VALUES ('LAW-SOFT-1', 'CLI-SOFT-1', '0000001-00.2026.5.03.0001', 'TRT3', 'Trabalhista', 'Em Andamento', ?, ?)`).run(now, now);

    const del = await asMaster(request(app).delete('/api/lawsuits/LAW-SOFT-1'), t);
    assert.equal(del.status, 200);
    assert.ok(db.prepare(`SELECT deleted_at FROM lawsuits WHERE id = 'LAW-SOFT-1'`).get().deleted_at);

    const clientToken = createClientSession({ id: 'CLI-SOFT-1', full_name: 'Cliente Soft' });
    const me = await request(app).get('/api/client-portal/me').set('Authorization', `Bearer ${clientToken}`);
    assert.equal(me.status, 200);
    const list = me.body.lawsuits || me.body.client?.lawsuits || [];
    assert.ok(!list.some(l => l.id === 'LAW-SOFT-1'));
  });
});
