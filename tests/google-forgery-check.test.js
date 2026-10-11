/**
 * scripts/check-google-forgery.js: encontra os rastros de um login Google forjado
 * (google_id que não é numérico) e lista os logins Google por IP. Somente leitura.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = path.join(os.tmpdir(), `jaw-forgery-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { inspectGoogleForgery } = await import('../scripts/check-google-forgery.js');
const tmpFiles = [];

after(() => {
  try {
    db?.close?.();
  } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`, ...tmpFiles]) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
});

function memDb() {
  const m = new DatabaseSync(':memory:');
  m.exec(`
    CREATE TABLE users (id TEXT, username TEXT, google_id TEXT, google_email TEXT);
    CREATE TABLE clients (id TEXT, full_name TEXT, email TEXT, google_id TEXT);
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_name TEXT, user_name TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT);
  `);
  return m;
}

describe('inspectGoogleForgery (unidade)', () => {
  it('só o google_id NUMÉRICO real é aceito; texto, número curto e misto são suspeitos; vazio/nulo são ignorados', () => {
    const m = memDb();
    const ins = (id, gid) =>
      m
        .prepare(`INSERT INTO users (id, username, google_id, google_email) VALUES (?,?,?,?)`)
        .run(id, `u${id}`, gid, 'a@b.com');
    ins('1', '112233445566778899001'); // real (21 dígitos)
    ins('2', 'qualquer-id');
    ins('3', 'sub-master-1');
    ins('4', '123');
    ins('5', '1122334455667788990ab');
    ins('6', null);
    ins('7', '   ');
    const { suspicious } = inspectGoogleForgery(m);
    assert.deepEqual(suspicious.map((s) => s.id).sort(), ['2', '3', '4', '5']);
    assert.equal(suspicious[0].tabela, 'users');
  });

  it('varre também clients e tolera tabelas ausentes (hr_employees)', () => {
    const m = memDb();
    m.prepare(
      `INSERT INTO clients (id, full_name, email, google_id) VALUES ('C1','Cliente X','x@y.com','forjado')`
    ).run();
    const { suspicious } = inspectGoogleForgery(m);
    assert.deepEqual(
      suspicious.map((s) => `${s.tabela}:${s.id}`),
      ['clients:C1']
    );
  });

  it('lista os logins Google por IP, só dentro da janela de dias', () => {
    const m = memDb();
    const now = new Date('2026-10-03T12:00:00Z');
    const log = (ev, ip, dias) =>
      m
        .prepare(
          `INSERT INTO audit_logs (event_name, user_name, ip_address, user_agent, created_at) VALUES (?,?,?,?,?)`
        )
        .run(ev, 'Dr. Jorge', ip, 'Firefox', new Date(now.getTime() - dias * 86400000).toISOString());
    log('LOGIN_GOOGLE_ADMIN', '200.1.1.1', 1);
    log('LOGIN_GOOGLE_ADMIN', '200.1.1.1', 2);
    log('LOGIN_GOOGLE_ADMIN', '66.6.6.6', 3);
    log('LOGIN_GOOGLE_ADMIN', '9.9.9.9', 200); // fora da janela
    log('LOGIN_SENHA', '200.1.1.1', 1); // não é Google
    const { logins } = inspectGoogleForgery(m, { days: 90, now });
    const porIp = Object.fromEntries(logins.map((l) => [l.ip, l.total]));
    assert.deepEqual(porIp, { '200.1.1.1': 2, '66.6.6.6': 1 });
  });
});

describe('o rastro de um login forjado de verdade é detectado', () => {
  it('um login com token de teste deixa google_id não numérico no mestre e o script o acusa', async () => {
    const r = await request(app)
      .post('/api/auth/google')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ credential: 'mock-google-token:qualquer-id:jorgealvimtecnologia@gmail.com:Atacante' });
    assert.equal(r.status, 200); // em teste o token de teste vale; em produção é recusado (google-auth-security.test.js)
    const { suspicious, logins } = inspectGoogleForgery(db);
    const mestre = suspicious.find((s) => s.tabela === 'users');
    assert.ok(mestre, 'o google_id forjado deveria ter sido acusado');
    assert.equal(mestre.google_id, 'qualquer-id');
    assert.ok(
      logins.some((l) => l.event_name === 'LOGIN_GOOGLE_ADMIN'),
      'o login deveria constar na auditoria'
    );
  });

  it('CLI: exit 1 e mensagem quando há suspeito; exit 0 num banco limpo; não altera o banco', () => {
    const sujo = path.join(os.tmpdir(), `jaw-forgery-cli-${Date.now()}.db`);
    const limpo = path.join(os.tmpdir(), `jaw-forgery-cli-ok-${Date.now()}.db`);
    tmpFiles.push(sujo, limpo);
    for (const [f, gid] of [
      [sujo, 'forjado'],
      [limpo, '112233445566778899001'],
    ]) {
      const x = new DatabaseSync(f);
      x.exec(
        `CREATE TABLE users (id TEXT, username TEXT, google_id TEXT, google_email TEXT); CREATE TABLE audit_logs (event_name TEXT, user_name TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT);`
      );
      x.prepare(`INSERT INTO users VALUES ('1','mestre',?, 'a@b.com')`).run(gid);
      x.close();
    }
    const antes = fs.readFileSync(sujo);
    const rSujo = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-google-forgery.js'), `--db=${sujo}`]);
    assert.equal(rSujo.status, 1);
    assert.match(rSujo.stdout.toString(), /1 google_id SUSPEITO.*forjado/s);
    assert.ok(Buffer.compare(antes, fs.readFileSync(sujo)) === 0, 'o script alterou o banco');
    const rLimpo = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-google-forgery.js'), `--db=${limpo}`]);
    assert.equal(rLimpo.status, 0);
    assert.match(rLimpo.stdout.toString(), /Nenhum google_id suspeito/);
  });
});
