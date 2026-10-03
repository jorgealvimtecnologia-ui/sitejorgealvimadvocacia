/**
 * COFRE DO .env — segredos criptografados em repouso.
 *
 * Regra do projeto (guardião): o .env com SEGREDOS nunca fica em texto puro no
 * GitHub nem no servidor. Segredos vivem em `.env.enc` (AES-256-GCM, chave derivada
 * por scrypt); o `.env` em texto puro só pode ter configuração NÃO secreta (porta,
 * IDs públicos, origens CORS). A chave de descriptografia fica FORA da pasta do
 * projeto (padrão /etc/advocacia/env.key, permissão 600) ou na variável
 * ENV_VAULT_KEY — nunca no repositório, nunca em backup, nunca por e-mail.
 *
 * Este módulo é puro (sem efeitos colaterais ao importar). O carregamento no boot
 * está em src/config/load-env.js; a administração, em scripts/env-vault.js.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const VAULT_HEADER = 'JAWENV1';
export const VAULT_FILE = '.env.enc';
export const PLAIN_FILE = '.env';
export const DEFAULT_KEY_FILE = '/etc/advocacia/env.key';
export const MIN_KEY_LENGTH = 32;

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// ---------------------------------------------------------------------------
// Classificação: o que é segredo (vai para o cofre) e o que é configuração pública.
// ---------------------------------------------------------------------------
const SECRET_NAME_RE = /(KEY|TOKEN|SECRET|PASS|PASSWORD|PWD|SENHA|CREDENTIAL)/i;
// O CAMINHO do arquivo da chave (…_KEY_FILE) não é segredo; a chave em si (ENV_VAULT_KEY) é.
const PUBLIC_NAME_RE = /(SITE_KEY|PUBLIC_KEY|KEY_SHA256|KEY_FILE)$/i;
const EXTRA_SECRET_NAMES = new Set(['COMUNICA_PROXY']); // proxy com usuário:senha@host

/** True se o NOME da variável indica segredo (chave de API, token, senha...). */
export function isSecretName(name) {
  const n = String(name || '');
  if (EXTRA_SECRET_NAMES.has(n.toUpperCase())) return true;
  return SECRET_NAME_RE.test(n) && !PUBLIC_NAME_RE.test(n);
}

/** Lê um texto no formato .env (mesma gramática do carregador nativo do Node). */
export function parseEnvText(text) {
  return parseEnv(String(text || ''));
}

/**
 * Gera linhas NOME=valor que o parseEnv do Node lê de volta IDÊNTICAS.
 * O parseEnv não entende escape dentro de aspas; por isso escolhemos o tipo de aspas
 * que NÃO aparece no valor (simples, depois duplas, depois crase). Um valor que usa
 * os três (praticamente inexistente em chaves de API) é recusado em vez de gravado
 * corrompido — num cofre de segredos, um valor errado seria pior que um erro.
 */
export function serializeEnv(vars) {
  const lines = Object.entries(vars).map(([k, v]) => {
    const s = String(v);
    if (s !== '' && !/[\s#"'`\\]/.test(s)) return `${k}=${s}`;
    const q = ["'", '"', '`'].find((c) => !s.includes(c) && !(c === '"' && s.includes('\\')));
    if (!q)
      throw new Error(
        `O valor de ${k} usa aspas simples, duplas e crase ao mesmo tempo e não pode ser gravado com segurança.`
      );
    return `${k}=${q}${s}${q}`;
  });
  return lines.join('\n') + '\n';
}

/** Nomes de variáveis SECRETAS com valor preenchido num texto .env em texto puro. */
export function findPlainSecrets(envText) {
  const vars = parseEnvText(envText);
  return Object.keys(vars).filter((k) => isSecretName(k) && String(vars[k]).trim() !== '');
}

// ---------------------------------------------------------------------------
// Criptografia
// ---------------------------------------------------------------------------
function deriveKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, 32, SCRYPT);
}

/** Valida a chave/frase do cofre. Chaves curtas permitem força bruta offline no arquivo. */
export function assertStrongKey(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_KEY_LENGTH) {
    throw new Error(
      `A chave do cofre deve ter pelo menos ${MIN_KEY_LENGTH} caracteres (gere com: node scripts/env-vault.js gen-key).`
    );
  }
}

/** Criptografa o texto do .env. Resultado: texto seguro para gravar/anexar (.env.enc). */
export function encryptEnv(plainText, passphrase) {
  assertStrongKey(passphrase);
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  cipher.setAAD(Buffer.from(VAULT_HEADER));
  const data = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const payload = Buffer.concat([salt, iv, cipher.getAuthTag(), data]).toString('base64');
  return `${VAULT_HEADER}\n${payload.replace(/(.{76})/g, '$1\n')}\n`;
}

/** True se o conteúdo tem o formato do cofre (cabeçalho + carga mínima plausível). */
export function isVaultContent(text) {
  const s = String(text || '');
  if (!s.startsWith(`${VAULT_HEADER}\n`)) return false;
  const body = s.slice(VAULT_HEADER.length).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return false;
  return Buffer.from(body, 'base64').length > SALT_LEN + IV_LEN + TAG_LEN;
}

/** Descriptografa. Lança erro se a chave estiver errada ou o arquivo tiver sido alterado. */
export function decryptEnv(vaultText, passphrase) {
  if (!isVaultContent(vaultText)) throw new Error('Arquivo não está no formato do cofre do .env.');
  const raw = Buffer.from(String(vaultText).slice(VAULT_HEADER.length).replace(/\s+/g, ''), 'base64');
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const data = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAAD(Buffer.from(VAULT_HEADER));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Não foi possível abrir o cofre do .env: chave incorreta ou arquivo adulterado.');
  }
}

// ---------------------------------------------------------------------------
// Chave do cofre (fora do projeto)
// ---------------------------------------------------------------------------
/**
 * Obtém a chave do cofre: variável ENV_VAULT_KEY ou arquivo (ENV_VAULT_KEY_FILE,
 * padrão /etc/advocacia/env.key). Em POSIX o arquivo NÃO pode ser legível por
 * grupo/outros (permissão 600 ou 400).
 * @returns {string|null} a chave, ou null se não houver nenhuma configurada
 */
export function readVaultKey({ env = process.env, platform = process.platform } = {}) {
  if (env.ENV_VAULT_KEY) {
    assertStrongKey(env.ENV_VAULT_KEY.trim());
    return env.ENV_VAULT_KEY.trim();
  }
  const file = env.ENV_VAULT_KEY_FILE || DEFAULT_KEY_FILE;
  if (!fs.existsSync(file)) return null;
  if (platform !== 'win32') {
    const mode = fs.statSync(file).mode & 0o777;
    if (mode & 0o077) {
      throw new Error(
        `Arquivo da chave do cofre (${file}) com permissão aberta (${mode.toString(8)}). Use: chmod 600 ${file}`
      );
    }
  }
  const key = fs.readFileSync(file, 'utf8').trim();
  assertStrongKey(key);
  return key;
}

// ---------------------------------------------------------------------------
// Carregamento do ambiente
// ---------------------------------------------------------------------------
/**
 * Carrega .env (configuração em texto puro) e .env.enc (segredos) para o ambiente.
 * Precedência: variável já definida no processo (ex.: systemd) > cofre > .env.
 * Se existe .env.enc e a chave está ausente ou errada, LANÇA erro: iniciar com
 * configuração incompleta é pior do que não iniciar.
 * @returns {{ plain: boolean, vault: boolean, plainSecrets: string[], vaultNames: string[] }}
 */
export function loadEnvironment({ dir, env = process.env, key } = {}) {
  const existing = new Set(Object.keys(env));
  const result = { plain: false, vault: false, plainSecrets: [], vaultNames: [] };

  const plainFile = path.join(dir, PLAIN_FILE);
  if (fs.existsSync(plainFile)) {
    const text = fs.readFileSync(plainFile, 'utf8');
    const vars = parseEnvText(text);
    for (const [k, v] of Object.entries(vars)) if (!existing.has(k)) env[k] = v;
    result.plain = true;
    result.plainSecrets = findPlainSecrets(text);
  }

  const vaultFile = path.join(dir, VAULT_FILE);
  if (fs.existsSync(vaultFile)) {
    const passphrase = key ?? readVaultKey({ env });
    if (!passphrase) {
      throw new Error(
        `Existe ${VAULT_FILE}, mas a chave do cofre não foi encontrada (ENV_VAULT_KEY ou ${env.ENV_VAULT_KEY_FILE || DEFAULT_KEY_FILE}).`
      );
    }
    const vars = parseEnvText(decryptEnv(fs.readFileSync(vaultFile, 'utf8'), passphrase));
    for (const [k, v] of Object.entries(vars)) if (!existing.has(k)) env[k] = v;
    result.vault = true;
    result.vaultNames = Object.keys(vars);
  }
  return result;
}
