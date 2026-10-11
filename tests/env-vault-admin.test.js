/**
 * Administração do cofre (scripts/env-vault.js): migrar segredos do .env para o cofre,
 * gerar a chave, definir variáveis e conferir a situação. A migração só pode ter
 * sucesso se o ambiente efetivo continuar IDÊNTICO ao de antes.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_KEY_LENGTH,
  decryptEnv,
  encryptEnv,
  loadEnvironment,
  parseEnvText,
  readVaultKey,
  serializeEnv,
} from '../src/shared/env-vault.js';
import { genKey, migrate, setVar, status } from '../scripts/env-vault.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'k'.repeat(MIN_KEY_LENGTH + 8);
const posix = process.platform !== 'win32';
const S = { asaas: 'ASAAS-SEGREDO-AAA111', smtp: 'SMTP-SEGREDO-BBB222', meta: 'META-SEGREDO-CCC333' };

describe('env-vault admin', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-admin-'));
    fs.writeFileSync(
      path.join(dir, '.env'),
      serializeEnv({
        PORT: '3000',
        GA_MEASUREMENT_ID: 'G-TESTE',
        ALLOWED_ORIGINS: 'https://a.com,https://b.com',
        ASAAS_API_KEY: S.asaas,
        SMTP_PASS: S.smtp,
        RECAPTCHA_SITE_KEY: 'publica',
      })
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('migrate: segredos vão para o cofre, .env fica só com o público e o ambiente efetivo é idêntico', () => {
    const antes = {};
    loadEnvironment({ dir, env: antes });
    const r = migrate({ dir, key: KEY });
    assert.deepEqual(r.moved, ['ASAAS_API_KEY', 'SMTP_PASS']);
    assert.deepEqual(r.kept, ['ALLOWED_ORIGINS', 'GA_MEASUREMENT_ID', 'PORT', 'RECAPTCHA_SITE_KEY']);

    const plain = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    assert.ok(!plain.includes(S.asaas) && !plain.includes(S.smtp), 'segredo continua em texto puro no .env');
    assert.deepEqual(parseEnvText(decryptEnv(fs.readFileSync(path.join(dir, '.env.enc'), 'utf8'), KEY)), {
      ASAAS_API_KEY: S.asaas,
      SMTP_PASS: S.smtp,
    });

    const depois = {};
    loadEnvironment({ dir, env: depois, key: KEY });
    assert.deepEqual(depois, antes);
  });

  it('migrate: arquivos ficam com permissão 600', { skip: !posix }, () => {
    migrate({ dir, key: KEY });
    for (const f of ['.env', '.env.enc']) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o777, 0o600, f);
  });

  it('migrate é idempotente e preserva segredos que já estavam no cofre', () => {
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv(serializeEnv({ META_SYSTEM_USER_TOKEN: S.meta }), KEY));
    migrate({ dir, key: KEY });
    const vault = () => parseEnvText(decryptEnv(fs.readFileSync(path.join(dir, '.env.enc'), 'utf8'), KEY));
    assert.deepEqual(Object.keys(vault()).sort(), ['ASAAS_API_KEY', 'META_SYSTEM_USER_TOKEN', 'SMTP_PASS']);
    const primeira = vault();
    migrate({ dir, key: KEY });
    assert.deepEqual(vault(), primeira);
  });

  it('migrate: o valor do cofre prevalece sobre uma cópia antiga em texto puro (igual ao carregador)', () => {
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv(serializeEnv({ ASAAS_API_KEY: 'VALOR-DO-COFRE' }), KEY));
    migrate({ dir, key: KEY });
    const vault = parseEnvText(decryptEnv(fs.readFileSync(path.join(dir, '.env.enc'), 'utf8'), KEY));
    assert.equal(vault.ASAAS_API_KEY, 'VALOR-DO-COFRE');
  });

  it('migrate com chave ERRADA em cofre existente não altera nada', () => {
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv(serializeEnv({ A_API_KEY: 'x' }), KEY));
    const envAntes = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    assert.throws(() => migrate({ dir, key: 'z'.repeat(MIN_KEY_LENGTH + 8) }), /chave incorreta/);
    assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), envAntes);
  });

  it('migrate sem .env falha com mensagem clara', () => {
    fs.rmSync(path.join(dir, '.env'));
    assert.throws(() => migrate({ dir, key: KEY }), /Não há \.env/);
  });

  it('set: segredo vai para o cofre e remove cópia em texto puro; público vai para o .env', () => {
    setVar('ASAAS_API_KEY', 'NOVO-VALOR-XYZ', { dir, key: KEY });
    const plain = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    assert.ok(!plain.includes('ASAAS_API_KEY') && !plain.includes('NOVO-VALOR-XYZ'));
    assert.equal(
      parseEnvText(decryptEnv(fs.readFileSync(path.join(dir, '.env.enc'), 'utf8'), KEY)).ASAAS_API_KEY,
      'NOVO-VALOR-XYZ'
    );

    const r = setVar('PORT', '3001', { dir, key: KEY });
    assert.equal(r.secret, false);
    assert.equal(parseEnvText(fs.readFileSync(path.join(dir, '.env'), 'utf8')).PORT, '3001');
  });

  it('set recusa nome inválido', () => {
    assert.throws(() => setVar('NOME INVALIDO', 'x', { dir, key: KEY }), /inválido/);
  });

  it('status mostra só nomes e acusa segredos em texto puro', () => {
    const s = status({ dir, env: {} });
    assert.deepEqual(s.plainSecrets.sort(), ['ASAAS_API_KEY', 'SMTP_PASS']);
    assert.equal(s.vault, false);
    assert.ok(!JSON.stringify(s).includes(S.asaas));
    migrate({ dir, key: KEY });
    const depois = status({ dir, env: { ENV_VAULT_KEY: KEY } });
    assert.deepEqual(depois.plainSecrets, []);
    assert.equal(depois.vault, true);
    assert.equal(depois.keyOk, true);
    assert.deepEqual(depois.vaultNames.sort(), ['ASAAS_API_KEY', 'SMTP_PASS']);
  });

  it('genKey cria chave forte com permissão 600, utilizável e sem sobrescrever', { skip: !posix }, () => {
    const file = path.join(dir, 'chaves', 'env.key');
    const { key } = genKey({ file });
    assert.ok(key.length >= MIN_KEY_LENGTH);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(readVaultKey({ env: { ENV_VAULT_KEY_FILE: file } }), key);
    assert.throws(() => genKey({ file }), /Já existe uma chave/);
  });

  it('CLI de ponta a ponta: gen-key, migrate, status e decrypt', { skip: !posix }, () => {
    const keyFile = path.join(dir, 'fora-do-projeto', 'env.key');
    const env = { ...process.env, ENV_VAULT_KEY_FILE: keyFile, NODE_ENV: 'production' };
    for (const k of ['ENV_VAULT_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ASAAS_API_KEY']) delete env[k];
    const cli = (...args) =>
      spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'env-vault.js'), ...args, `--dir=${dir}`], { env });

    const antes = cli('status');
    assert.equal(antes.status, 1, 'status deve falhar com segredos em texto puro');
    assert.match(antes.stdout.toString(), /ASAAS_API_KEY, SMTP_PASS|SMTP_PASS, ASAAS_API_KEY/);

    const g = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'env-vault.js'), 'gen-key', `--arquivo=${keyFile}`],
      { env }
    );
    assert.equal(g.status, 0, g.stderr.toString());
    assert.ok(
      !g.stdout.toString().includes(fs.readFileSync(keyFile, 'utf8').trim()),
      'gen-key não deve imprimir a chave sem --mostrar'
    );

    const m = cli('migrate');
    assert.equal(m.status, 0, m.stderr.toString() + m.stdout.toString());
    const saida = m.stdout.toString() + m.stderr.toString();
    for (const seg of Object.values(S)) assert.ok(!saida.includes(seg), 'a saída do migrate vazou um segredo');
    assert.match(saida, /Migração concluída/);

    const depois = cli('status');
    assert.equal(depois.status, 0, depois.stdout.toString() + depois.stderr.toString());
    assert.match(depois.stdout.toString(), /ATIVO \(2 variável/);

    const d = cli('decrypt');
    assert.equal(d.status, 0);
    assert.equal(parseEnvText(d.stdout.toString()).ASAAS_API_KEY, S.asaas);
  });
});
