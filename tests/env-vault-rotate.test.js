/** Troca da chave do cofre (quando a chave vazou): reencripta, confere, e a chave antiga deixa de abrir. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { genKey, setVar, rotateKey } from '../scripts/env-vault.js';
import { decryptEnv, loadEnvironment } from '../src/shared/env-vault.js';

function montar() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-rotate-'));
  const dir = path.join(base, 'proj');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\n');
  const keyFile = path.join(base, 'chaves', 'env.key');
  const env = { ENV_VAULT_KEY_FILE: keyFile };
  const { key } = genKey({ file: keyFile });
  setVar('SMTP_PASS', 'senha-secreta-123', { dir, env });
  setVar('ASAAS_API_KEY', 'chave-asaas-456', { dir, env });
  return { base, dir, keyFile, env, oldKey: key };
}

describe('rotateKey', () => {
  it('troca a chave: o ambiente é o mesmo, a chave nova abre e a antiga NÃO abre mais', () => {
    const { base, dir, keyFile, env, oldKey } = montar();
    try {
      const antes = {};
      loadEnvironment({ dir, env: antes, key: oldKey });
      const r = rotateKey({ dir, env });
      assert.deepEqual(r.names, ['ASAAS_API_KEY', 'SMTP_PASS']);
      const novaChave = fs.readFileSync(keyFile, 'utf8').trim();
      assert.notEqual(novaChave, oldKey);
      const vault = fs.readFileSync(path.join(dir, '.env.enc'), 'utf8');
      assert.match(decryptEnv(vault, novaChave), /SMTP_PASS=.*senha-secreta-123/);
      assert.throws(() => decryptEnv(vault, oldKey), /chave|abrir|decrypt|autent/i);
      const depois = {};
      loadEnvironment({ dir, env: depois, key: novaChave });
      assert.equal(depois.SMTP_PASS, antes.SMTP_PASS);
      assert.equal(depois.ASAAS_API_KEY, antes.ASAAS_API_KEY);
      assert.equal(depois.PORT, '3000');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it('guarda a chave e o cofre antigos (permissão 600) para desfazer', () => {
    const { base, dir, keyFile, env, oldKey } = montar();
    try {
      const vaultAntigo = fs.readFileSync(path.join(dir, '.env.enc'), 'utf8');
      const r = rotateKey({ dir, env });
      assert.equal(fs.readFileSync(r.keyAnterior, 'utf8').trim(), oldKey);
      assert.equal(fs.readFileSync(r.vaultAnterior, 'utf8'), vaultAntigo);
      for (const f of [keyFile, r.keyAnterior, r.vaultAnterior, path.join(dir, '.env.enc')])
        assert.equal(fs.statSync(f).mode & 0o077, 0, `${f} com permissão aberta`);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it('não toca em nada se a chave atual não abre o cofre', () => {
    const { base, dir, keyFile, env } = montar();
    try {
      fs.writeFileSync(keyFile, `${Buffer.alloc(48, 7).toString('base64')}\n`, { mode: 0o600 });
      const vaultAntes = fs.readFileSync(path.join(dir, '.env.enc'), 'utf8');
      const chaveAntes = fs.readFileSync(keyFile, 'utf8');
      assert.throws(() => rotateKey({ dir, env }));
      assert.equal(fs.readFileSync(path.join(dir, '.env.enc'), 'utf8'), vaultAntes);
      assert.equal(fs.readFileSync(keyFile, 'utf8'), chaveAntes);
      assert.ok(!fs.existsSync(`${keyFile}.anterior`));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it('recusa quando a chave vem de variável de ambiente (não de arquivo)', () => {
    const { base, dir, oldKey } = montar();
    try {
      assert.throws(() => rotateKey({ dir, env: { ENV_VAULT_KEY: oldKey } }), /ENV_VAULT_KEY/);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it('sem cofre: erro claro', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-rotate2-'));
    try {
      const keyFile = path.join(base, 'env.key');
      genKey({ file: keyFile });
      assert.throws(() => rotateKey({ dir: base, env: { ENV_VAULT_KEY_FILE: keyFile } }), /nada para reencriptar/);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
