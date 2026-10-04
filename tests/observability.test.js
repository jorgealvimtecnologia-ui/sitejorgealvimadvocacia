/**
 * AUD-08: logs JSON com id de requisição (sem dados sensíveis), /health real e vigia.
 */
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  redact, requestLogger, recordError, errorsSince, registerJob, markJobRun, jobStatuses,
  checkDb, buildHealth, findProblems, _resetForTests,
} from '../src/shared/observability.js';

const TMP_DB = path.join(os.tmpdir(), `jaw-obs-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});
beforeEach(() => _resetForTests());

describe('logs sem dados sensíveis', () => {
  it('oculta senha, token, chave, cookie e CPF em qualquer profundidade', () => {
    const r = redact({ ok: 1, password: 'x', nested: { Authorization: 'Bearer abc', api_key: 'k', cpf: '111', fine: 'a' }, lista: [{ token: 't' }] });
    assert.equal(r.password, '[oculto]');
    assert.equal(r.nested.Authorization, '[oculto]');
    assert.equal(r.nested.api_key, '[oculto]');
    assert.equal(r.nested.cpf, '[oculto]');
    assert.equal(r.nested.fine, 'a');
    assert.equal(r.lista[0].token, '[oculto]');
  });
});

describe('id de requisição e linha de log', () => {
  function appWithLogger(lines) {
    process.env.LOG_JSON = '1';
    const a = express();
    a.use(requestLogger({ write: (l) => lines.push(l) }));
    a.get('/x', (req, res) => res.json({ id: req.id }));
    a.get('/boom', (req, res) => res.status(500).json({ erro: 1 }));
    a.get('/health', (req, res) => res.json({}));
    return a;
  }
  after(() => { delete process.env.LOG_JSON; });

  it('gera id, devolve no cabeçalho e registra UMA linha JSON sem query nem corpo', async () => {
    const lines = [];
    const r = await request(appWithLogger(lines)).get('/x?token=SEGREDO&cpf=123').set('Authorization', 'Bearer SEGREDO');
    assert.ok(r.headers['x-request-id']);
    assert.equal(r.body.id, r.headers['x-request-id']);
    assert.equal(lines.length, 1);
    const l = JSON.parse(lines[0]);
    assert.equal(l.msg, 'http');
    assert.equal(l.path, '/x');
    assert.equal(l.status, 200);
    assert.equal(l.id, r.headers['x-request-id']);
    assert.ok(!lines[0].includes('SEGREDO') && !lines[0].includes('cpf'));
  });
  it('aceita id válido de entrada e troca id suspeito', async () => {
    const lines = [];
    const a = appWithLogger(lines);
    assert.equal((await request(a).get('/x').set('X-Request-Id', 'abc-12345678')).headers['x-request-id'], 'abc-12345678');
    const ruim = (await request(a).get('/x').set('X-Request-Id', 'a b<script>')).headers['x-request-id'];
    assert.match(ruim, /^[a-f0-9]{16}$/);
  });
  it('status 5xx vira nível error e /health não gera ruído', async () => {
    const lines = [];
    const a = appWithLogger(lines);
    await request(a).get('/boom');
    await request(a).get('/health');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).level, 'error');
  });
});

describe('tarefas de fundo', () => {
  it('ok, never (acabou de subir) e stale (parou)', () => {
    const H = 60 * 60 * 1000;
    registerJob('varredura', H);
    const t0 = Date.now();
    assert.equal(jobStatuses(t0).varredura, 'never');
    markJobRun('varredura', true);
    assert.equal(jobStatuses(Date.now()).varredura, 'ok');
    assert.equal(jobStatuses(Date.now() + 2 * H).varredura, 'ok');          // dentro da tolerância
    assert.equal(jobStatuses(Date.now() + 4 * H).varredura, 'stale');       // parou
  });
  it('nunca rodou e passou da tolerância = stale', () => {
    registerJob('sync', 60 * 60 * 1000);
    assert.equal(jobStatuses(Date.now() + 4 * 60 * 60 * 1000).sync, 'stale');
  });
});

describe('/health', () => {
  it('banco ok responde 200 com o estado dos componentes', async () => {
    const r = await request(app).get('/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.db, 'ok');
    assert.ok(['ok', 'degraded'].includes(r.body.status));
    assert.ok('jobs' in r.body && 'disk' in r.body && 'errors_last_hour' in r.body);
  });
  it('banco fora = fail', () => {
    const quebrado = { prepare() { throw new Error('banco fechado'); } };
    assert.equal(checkDb(quebrado), 'fail');
    assert.equal(buildHealth(quebrado).status, 'fail');
  });
  it('tarefa parada deixa o sistema degradado', () => {
    registerJob('varredura', 60 * 1000);
    const h = buildHealth(db, { now: Date.now() + 60 * 60 * 1000 });
    assert.equal(h.jobs.varredura, 'stale');
    assert.equal(h.status, 'degraded');
  });
  it('/health é público e não vaza caminhos nem segredos', async () => {
    const r = await request(app).get('/health');
    assert.ok(!/leads\.db|\/var\/|password|token/i.test(JSON.stringify(r.body)));
  });
});

describe('erros e vigia', () => {
  it('conta erros recentes', () => {
    recordError(new Error('falhou'), { id: 'abc', path: '/api/x' });
    recordError('texto solto');
    assert.equal(errorsSince(60 * 60 * 1000), 2);
    assert.equal(errorsSince(60 * 60 * 1000, Date.now() + 2 * 60 * 60 * 1000), 0);
  });
  it('encontra problemas: tarefa parada, disco baixo, banco fora e certificado perto de vencer', () => {
    const base = { db: 'ok', jobs: {}, disk: 'ok', disk_free_percent: 60 };
    assert.deepEqual(findProblems(base), []);
    assert.equal(findProblems({ ...base, jobs: { sync: 'stale' } })[0].key, 'job:sync');
    assert.equal(findProblems({ ...base, disk: 'low', disk_free_percent: 9 })[0].level, 'warning');
    assert.equal(findProblems({ ...base, disk: 'critical', disk_free_percent: 3 })[0].level, 'danger');
    assert.equal(findProblems({ ...base, db: 'fail' })[0].key, 'db');
    assert.equal(findProblems(base, { certDaysLeft: 20 }).length, 0);
    assert.equal(findProblems(base, { certDaysLeft: 10 })[0].level, 'warning');
    assert.equal(findProblems(base, { certDaysLeft: 3 })[0].level, 'danger');
  });
  it('o tratador de erros do servidor devolve o id da requisição', async () => {
    const r = await request(app).get('/api/rota-inexistente-xyz');
    assert.ok(r.headers['x-request-id']);
  });
});
