/** Migrar como root não pode deixar o .env/.env.enc/chave inacessíveis ao serviço (EACCES derrubou a produção). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chownLike } from '../scripts/env-vault.js';
import { checkServer } from '../scripts/check-env-exposure.js';

describe('chownLike', () => {
  const ref = { uid: 33, gid: 33 };
  it('como root: copia o dono da pasta do serviço', () => {
    const chamadas = [];
    const ok = chownLike('/x/.env', '/x/src', { getuid: () => 0, fsImpl: { statSync: () => ref, chownSync: (...a) => chamadas.push(a) } });
    assert.equal(ok, true);
    assert.deepEqual(chamadas, [['/x/.env', 33, 33]]);
  });
  it('sem ser root: não mexe em nada', () => {
    const chamadas = [];
    assert.equal(chownLike('/x/.env', '/x/src', { getuid: () => 1000, fsImpl: { statSync: () => ref, chownSync: (...a) => chamadas.push(a) } }), false);
    assert.deepEqual(chamadas, []);
  });
  it('sem pasta de referência: não quebra', () => {
    assert.equal(chownLike('/x/.env', '/nao/existe', { getuid: () => 0 }), false);
  });
});

describe('guardião do servidor: dono dos arquivos', () => {
  it('arquivos do mesmo dono da pasta src/: sem violação de dono', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-owner-'));
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\n', { mode: 0o600 });
      fs.writeFileSync(path.join(dir, '.env.enc'), 'x', { mode: 0o600 });
      const r = checkServer(dir, { fix: false, env: { ENV_VAULT_KEY_FILE: path.join(os.tmpdir(), 'nao-existe.key') } });
      assert.ok(!r.violations.some((v) => /pertence ao uid/.test(v)), JSON.stringify(r.violations));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('arquivo de OUTRO dono (simulado) reprova com o comando chown', function () {
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) return this.skip?.() ?? undefined;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-owner2-'));
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.chownSync(path.join(dir, 'src'), 33, 33);
      fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\n', { mode: 0o600 });
      const r = checkServer(dir, { fix: false, env: { ENV_VAULT_KEY_FILE: path.join(os.tmpdir(), 'nao-existe.key') } });
      assert.ok(r.violations.some((v) => /pertence ao uid 0, mas o serviço roda com o uid 33.*chown 33:33/.test(v)), JSON.stringify(r.violations));
      const fixo = checkServer(dir, { fix: true, env: { ENV_VAULT_KEY_FILE: path.join(os.tmpdir(), 'nao-existe.key') } });
      assert.ok(fixo.fixed.some((f) => /dono corrigido/.test(f)));
      assert.equal(fs.statSync(path.join(dir, '.env')).uid, 33);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
