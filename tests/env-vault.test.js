/**
 * Cofre do .env (src/shared/env-vault.js) e carregamento do ambiente.
 * Garante: criptografia correta (e que adulteração/chave errada falham), classificação
 * de segredos, serialização sem corromper valores, chave fora do projeto com
 * permissão restrita, precedência do carregamento e ordem de importação no server.js.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VAULT_HEADER,
  MIN_KEY_LENGTH,
  encryptEnv,
  decryptEnv,
  isVaultContent,
  isSecretName,
  findPlainSecrets,
  parseEnvText,
  serializeEnv,
  readVaultKey,
  loadEnvironment,
} from '../src/shared/env-vault.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'k'.repeat(MIN_KEY_LENGTH + 8);
const posix = process.platform !== 'win32';

describe('criptografia do cofre', () => {
  it('ida e volta preserva o conteúdo, e o texto cifrado não revela nada', () => {
    const plain = 'ASAAS_API_KEY=segredo-super-secreto-123\nSMTP_PASS=outra-senha\n';
    const enc = encryptEnv(plain, KEY);
    assert.ok(enc.startsWith(`${VAULT_HEADER}\n`));
    assert.ok(!enc.includes('segredo-super-secreto') && !enc.includes('ASAAS'));
    assert.equal(decryptEnv(enc, KEY), plain);
  });

  it('cada criptografia é diferente (sal e IV aleatórios)', () => {
    assert.notEqual(encryptEnv('A=1\n', KEY), encryptEnv('A=1\n', KEY));
  });

  it('chave errada falha', () => {
    const enc = encryptEnv('A=1\n', KEY);
    assert.throws(() => decryptEnv(enc, 'x'.repeat(MIN_KEY_LENGTH + 8)), /chave incorreta ou arquivo adulterado/);
  });

  it('arquivo adulterado falha (autenticação GCM)', () => {
    const enc = encryptEnv('A=1\n', KEY);
    const linhas = enc.split('\n');
    const i = linhas.findIndex((l, n) => n > 0 && l.length > 10);
    const c = linhas[i][5] === 'A' ? 'B' : 'A';
    linhas[i] = linhas[i].slice(0, 5) + c + linhas[i].slice(6);
    assert.throws(() => decryptEnv(linhas.join('\n'), KEY), /adulterado/);
  });

  it('recusa chave curta (força bruta offline)', () => {
    assert.throws(() => encryptEnv('A=1\n', 'curta'), new RegExp(String(MIN_KEY_LENGTH)));
  });

  it('isVaultContent distingue cofre de .env em texto puro', () => {
    assert.equal(isVaultContent(encryptEnv('A=1\n', KEY)), true);
    assert.equal(isVaultContent('ASAAS_API_KEY=abc\n'), false);
    assert.equal(isVaultContent(''), false);
    assert.equal(isVaultContent(`${VAULT_HEADER}\ncurto`), false);
  });
});

describe('classificação de segredos', () => {
  it('reconhece segredos e não confunde chaves públicas', () => {
    for (const n of [
      'ASAAS_API_KEY',
      'SMTP_PASS',
      'MASTER_PASSWORD',
      'META_SYSTEM_USER_TOKEN',
      'RECAPTCHA_SECRET_KEY',
      'WHATSAPP_API_KEY',
      'SYNC_PASS',
      'COMUNICA_PROXY',
      'GOOGLE_MAPS_API_KEY',
      'DATAJUD_API_KEY',
      'ENV_VAULT_KEY',
    ]) {
      assert.equal(isSecretName(n), true, n);
    }
    for (const n of [
      'PORT',
      'NODE_ENV',
      'GA_MEASUREMENT_ID',
      'META_PIXEL_ID',
      'ALLOWED_ORIGINS',
      'RECAPTCHA_SITE_KEY',
      'ROADMAP_AGENT_KEY_SHA256',
      'SMTP_HOST',
      'SMTP_USER',
      'ENV_VAULT_KEY_FILE',
      'ENV_CHANGE_NOTIFY_TO',
    ]) {
      assert.equal(isSecretName(n), false, n);
    }
  });

  it('findPlainSecrets lista só segredos com valor preenchido', () => {
    const txt = 'PORT=3000\nASAAS_API_KEY=abc\nSMTP_PASS=\nRECAPTCHA_SITE_KEY=publica\nMETA_SYSTEM_USER_TOKEN=tok\n';
    assert.deepEqual(findPlainSecrets(txt).sort(), ['ASAAS_API_KEY', 'META_SYSTEM_USER_TOKEN']);
  });
});

describe('serializeEnv / parseEnvText', () => {
  it('valores difíceis voltam idênticos', () => {
    const vars = {
      A: 'simples',
      B: 'com espaço',
      C: 'x#y',
      D: "it's",
      E: 'say "hi"',
      F: 'back\\slash',
      G: 'a=b',
      H: '',
      I: ' borda ',
      J: '$VAR',
    };
    assert.deepEqual(parseEnvText(serializeEnv(vars)), vars);
  });

  it('recusa valor impossível de gravar com segurança em vez de corrompê-lo', () => {
    assert.throws(() => serializeEnv({ X: `a'b"c\`d` }), /não pode ser gravado com segurança/);
  });
});

describe('chave do cofre (fora do projeto)', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-key-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('lê de ENV_VAULT_KEY', () => {
    assert.equal(readVaultKey({ env: { ENV_VAULT_KEY: KEY } }), KEY);
  });

  it('retorna null quando não há nenhuma chave configurada', () => {
    assert.equal(readVaultKey({ env: { ENV_VAULT_KEY_FILE: path.join(dir, 'nao-existe') } }), null);
  });

  it('lê do arquivo com permissão 600', { skip: !posix }, () => {
    const f = path.join(dir, 'env.key');
    fs.writeFileSync(f, `${KEY}\n`, { mode: 0o600 });
    assert.equal(readVaultKey({ env: { ENV_VAULT_KEY_FILE: f } }), KEY);
  });

  it('recusa arquivo de chave legível por outros (644)', { skip: !posix }, () => {
    const f = path.join(dir, 'env.key');
    fs.writeFileSync(f, `${KEY}\n`);
    fs.chmodSync(f, 0o644);
    assert.throws(() => readVaultKey({ env: { ENV_VAULT_KEY_FILE: f } }), /permissão aberta/);
  });

  it('recusa chave curta', () => {
    assert.throws(() => readVaultKey({ env: { ENV_VAULT_KEY: 'curta' } }), new RegExp(String(MIN_KEY_LENGTH)));
  });
});

describe('loadEnvironment', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-load-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('precedência: ambiente do processo > cofre > .env', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\nORIGEM=plain\nSO_PLAIN=p\nJA_NO_PROCESSO=plain\n');
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv('ORIGEM=cofre\nSMTP_PASS=s3\nJA_NO_PROCESSO=cofre\n', KEY));
    const env = { JA_NO_PROCESSO: 'processo' };
    const r = loadEnvironment({ dir, env, key: KEY });
    assert.equal(env.JA_NO_PROCESSO, 'processo');
    assert.equal(env.ORIGEM, 'cofre');
    assert.equal(env.SO_PLAIN, 'p');
    assert.equal(env.SMTP_PASS, 's3');
    assert.equal(r.vault, true);
    assert.deepEqual(r.vaultNames.sort(), ['JA_NO_PROCESSO', 'ORIGEM', 'SMTP_PASS']);
  });

  it('sem nenhum arquivo, não faz nada', () => {
    const env = {};
    assert.deepEqual(loadEnvironment({ dir, env }), { plain: false, vault: false, plainSecrets: [], vaultNames: [] });
    assert.deepEqual(env, {});
  });

  it('acusa segredos em texto puro no .env', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\nASAAS_API_KEY=abc\n');
    assert.deepEqual(loadEnvironment({ dir, env: {} }).plainSecrets, ['ASAAS_API_KEY']);
  });

  it('com cofre e SEM chave: lança erro em vez de subir incompleto', () => {
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv('A=1\n', KEY));
    assert.throws(
      () => loadEnvironment({ dir, env: { ENV_VAULT_KEY_FILE: path.join(dir, 'nao-existe') } }),
      /chave do cofre não foi encontrada/
    );
  });

  it('com cofre e chave ERRADA: lança erro', () => {
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv('A=1\n', KEY));
    assert.throws(
      () => loadEnvironment({ dir, env: { ENV_VAULT_KEY: 'z'.repeat(MIN_KEY_LENGTH + 8) } }),
      /chave incorreta/
    );
  });
});

describe('ordem de carregamento no servidor', () => {
  it('src/config/load-env.js é o PRIMEIRO import do server.js', () => {
    const first = fs
      .readFileSync(path.join(ROOT, 'server.js'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('import '));
    assert.match(first, /import '\.\/src\/config\/load-env\.js'/);
  });

  it('o SMTP do .env chega ao email.js (bug antigo: o .env era lido depois do email.js)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-smtp-'));
    try {
      fs.writeFileSync(
        path.join(dir, '.env'),
        'SMTP_HOST=smtp.teste.local\nSMTP_USER=u@teste.local\nSMTP_PASS=senha-teste\n'
      );
      const script = `
        import { loadEnvironment } from ${JSON.stringify(path.join(ROOT, 'src/shared/env-vault.js'))};
        loadEnvironment({ dir: ${JSON.stringify(dir)} });
        const m = await import(${JSON.stringify(path.join(ROOT, 'src/shared/email.js'))});
        console.log('CONFIGURADO=' + m.isEmailConfigured());`;
      const env = { ...process.env };
      for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) delete env[k];
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env });
      assert.match(r.stdout.toString(), /CONFIGURADO=true/, r.stderr.toString());
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
