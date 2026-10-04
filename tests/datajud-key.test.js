/** Chave do DataJud: nunca literal no código; vem de DATAJUD_API_KEY; o guardião reprova chave fixa. */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = path.join(os.tmpdir(), `jaw-datajud-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.DATAJUD_API_KEY;

const { app, db } = await import('../server.js');
const { datajudAuthHeader } = await import('../src/modules/juridico/juridico.routes.js');
const { checkRepo } = await import('../scripts/check-env-exposure.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

describe('datajudAuthHeader', () => {
  it('aceita a chave com ou sem o prefixo "APIKey"', () => {
    assert.equal(datajudAuthHeader('abc123'), 'APIKey abc123');
    assert.equal(datajudAuthHeader('APIKey abc123'), 'APIKey abc123');
    assert.equal(datajudAuthHeader('  apikey abc123 '), 'apikey abc123');
  });
  it('vazio vira vazio (sem chave inventada)', () => {
    assert.equal(datajudAuthHeader(''), '');
    assert.equal(datajudAuthHeader(undefined), '');
    assert.equal(datajudAuthHeader('   '), '');
  });
});

describe('rota do DataJud sem chave configurada', () => {
  let token;
  before(async () => {
    token = (await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD })).body.token;
  });
  it('responde 503 claro (e não usa chave fixa)', async () => {
    const r = await request(app).post('/api/court/datajud/search').set('Authorization', `Bearer ${token}`).send({ lawsuit_number: '0000000-00.2020.8.13.0001' });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /DATAJUD_API_KEY/);
  });
});

describe('código-fonte', () => {
  it('não tem chave literal de API em src/, server.js nem scripts/', () => {
    assert.deepEqual(checkRepo(ROOT).violations.filter((v) => /Chave de API literal/.test(v)), []);
  });
  it('o guardião REPROVA uma chave literal (repositório de teste)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-lit-'));
    try {
      const sh = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
      sh('init', '-q');
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(path.join(dir, 'src', 'x.js'), "const k = 'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';\n");
      sh('add', '-A');
      const r = checkRepo(dir);
      assert.ok(r.violations.some((v) => /Chave de API literal no código \(src\/x\.js\)/.test(v)), JSON.stringify(r.violations));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('.env.example documenta DATAJUD_API_KEY sem valor', () => {
    const ex = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    assert.match(ex, /^DATAJUD_API_KEY=\s*$/m);
  });
});
