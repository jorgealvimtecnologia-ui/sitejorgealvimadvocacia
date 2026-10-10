/**
 * VIGIA DE ALTERAÇÕES DO .env — toda mudança gera um e-mail ao titular.
 *
 * Detecta qualquer alteração no .env e no cofre .env.enc (variável adicionada,
 * removida, alterada, ou arquivo regravado) e envia ao e-mail do titular:
 *   - um RELATÓRIO (.txt) com o que mudou: só NOMES de variáveis, nunca valores;
 *   - a cópia CRIPTOGRAFADA do cofre (.env.enc), quando existe.
 * O .env em texto puro NUNCA é enviado, e a chave do cofre jamais vai no e-mail:
 * mandar segredos em texto puro por e-mail seria expô-los, que é o que o guardião
 * proíbe. Para abrir o anexo é preciso a chave, guardada à parte (cofre de senhas).
 *
 * Como detecta: guarda, em `.env.estado.json` (permissão 600, ignorado pelo git),
 * uma impressão digital HMAC de cada variável (com um "pepper" aleatório), e
 * compara a cada inicialização e de hora em hora. Mudanças feitas por qualquer
 * meio (script, ssh, editor) são pegas, pois o serviço é reiniciado para aplicá-las.
 * Se o e-mail falhar, a alteração continua "pendente" e é reenviada na próxima
 * varredura: nenhuma alteração fica sem aviso.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sendEmail as defaultSendEmail } from './email.js';
import {
  PLAIN_FILE,
  VAULT_FILE,
  decryptEnv,
  findPlainSecrets,
  isSecretName,
  parseEnvText,
  readVaultKey,
} from './env-vault.js';

export const STATE_FILE = '.env.estado.json';
export const HISTORY_FILE = '.env.historico.log';
export const DEFAULT_NOTIFY_TO = 'jorgealvimtecnologia@gmail.com';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const fingerprint = (pepper, name, value) =>
  crypto.createHmac('sha256', pepper).update(`${name}\0${value}`).digest('hex');
const stamp = (d) => d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const kind = (name) => (isSecretName(name) ? 'secreta' : 'pública');

/** Lê .env e .env.enc e devolve as variáveis (cofre prevalece sobre o texto puro). */
function readSnapshot(dir, env) {
  const snap = { vars: {}, plainText: null, vaultText: null, plainSecrets: [], vaultCount: 0 };
  const plainFile = path.join(dir, PLAIN_FILE);
  if (fs.existsSync(plainFile)) {
    snap.plainText = fs.readFileSync(plainFile, 'utf8');
    Object.assign(snap.vars, parseEnvText(snap.plainText));
    snap.plainSecrets = findPlainSecrets(snap.plainText);
  }
  const vaultFile = path.join(dir, VAULT_FILE);
  if (fs.existsSync(vaultFile)) {
    snap.vaultText = fs.readFileSync(vaultFile, 'utf8');
    const key = readVaultKey({ env });
    if (!key) throw new Error('cofre .env.enc presente, mas a chave não foi encontrada');
    const vars = parseEnvText(decryptEnv(snap.vaultText, key));
    snap.vaultCount = Object.keys(vars).length;
    Object.assign(snap.vars, vars);
  }
  return snap;
}

function readState(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(dir, state) {
  const file = path.join(dir, STATE_FILE);
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* sistemas sem chmod */
  }
}

/** Compara o ambiente atual com o último estado notificado. Sem efeitos colaterais. */
export function detectChange(dir, { env = process.env } = {}) {
  const snap = readSnapshot(dir, env);
  const state = readState(dir);
  const pepper = state?.pepper || crypto.randomBytes(32).toString('hex');
  const fp = Object.fromEntries(Object.entries(snap.vars).map(([k, v]) => [k, fingerprint(pepper, k, v)]));
  const files = {
    plain: snap.plainText == null ? null : sha256(snap.plainText),
    vault: snap.vaultText == null ? null : sha256(snap.vaultText),
  };

  const prev = state?.vars || {};
  const added = Object.keys(fp)
    .filter((k) => !(k in prev))
    .sort();
  const removed = Object.keys(prev)
    .filter((k) => !(k in fp))
    .sort();
  const modified = Object.keys(fp)
    .filter((k) => k in prev && prev[k] !== fp[k])
    .sort();
  const fileChanged = !!state && (state.files?.plain !== files.plain || state.files?.vault !== files.vault);

  return {
    first: !state,
    changed: !state || added.length + removed.length + modified.length > 0 || fileChanged,
    added: state ? added : [],
    removed,
    modified,
    fileChanged,
    total: Object.keys(fp).length,
    snap,
    next: { pepper, vars: fp, files },
  };
}

function deployedVersion(dir) {
  try {
    return fs
      .readFileSync(path.join(dir, 'backups', 'DEPLOYED'), 'utf8')
      .trim()
      .split('\n')[0];
  } catch {
    return 'não informada';
  }
}

/** Monta o relatório em texto. Contém SÓ nomes de variáveis, jamais valores. */
export function buildReport(change, { dir, origem, now, env = process.env }) {
  const L = [];
  const lista = (titulo, nomes, sufixo = '') => {
    L.push(`${titulo} (${nomes.length}):`);
    nomes.length ? nomes.forEach((n) => L.push(`  - ${n} [${kind(n)}]${sufixo}`)) : L.push('  (nenhuma)');
  };
  L.push(change.first ? 'MONITORAMENTO DO .env ATIVADO (linha de base)' : 'ALTERAÇÃO NO .env DETECTADA');
  L.push('');
  L.push(`Servidor ........: ${os.hostname()}`);
  L.push(`Ambiente ........: ${env.NODE_ENV || 'não definido'}`);
  L.push(`Versão no ar ....: ${deployedVersion(dir)}`);
  L.push(`Detectado em ....: ${now.toISOString()} (${origem})`);
  L.push('');
  if (change.first) {
    L.push(
      `Variáveis monitoradas: ${change.total} (${Object.keys(change.snap.vars).filter(isSecretName).length} secretas).`
    );
    L.push('Daqui em diante, qualquer alteração gera um novo e-mail.');
  } else {
    lista('Adicionadas', change.added);
    lista('Removidas', change.removed);
    lista('Alteradas', change.modified, ' — valor alterado (o valor não é enviado)');
    if (change.fileChanged && !change.added.length && !change.removed.length && !change.modified.length) {
      L.push(
        '',
        'Os arquivos foram regravados sem mudar nenhuma variável (ex.: comentário, nova chave de criptografia).'
      );
    }
  }
  L.push('');
  const usaCofre = !!change.snap.vaultText;
  L.push(
    `Cofre criptografado (.env.enc): ${usaCofre ? `ATIVO (${change.snap.vaultCount} variável(is))` : 'NÃO ativo'}`
  );
  if (change.snap.plainSecrets.length) {
    L.push('', '⚠ ATENÇÃO: há SEGREDOS EM TEXTO PURO no .env do servidor:');
    change.snap.plainSecrets.forEach((n) => L.push(`  - ${n}`));
    L.push('  Migre para o cofre:  node scripts/env-vault.js migrate');
  }
  L.push('', 'SOBRE O ANEXO');
  L.push(
    usaCofre
      ? '  Segue a cópia CRIPTOGRAFADA do cofre (.env.enc). Ela só abre com a chave do cofre,\n  que fica guardada à parte (cofre de senhas) e NUNCA é enviada por e-mail.'
      : '  Nenhum arquivo do .env foi anexado: o cofre não está ativo e o .env em texto puro\n  não pode ser enviado por e-mail.'
  );
  L.push('  Esta mensagem não contém valores de variáveis nem a chave de descriptografia.');
  return L.join('\n') + '\n';
}

/**
 * Verifica se o .env mudou e, se mudou, envia o e-mail ao titular.
 * @returns {Promise<{status:'baseline'|'sem-alteracao'|'notificado'|'falha-envio'|'erro', change?:object, reason?:string}>}
 */
export async function checkEnvChange({
  dir,
  env = process.env,
  sender = defaultSendEmail,
  to = env.ENV_CHANGE_NOTIFY_TO || DEFAULT_NOTIFY_TO,
  origem = 'varredura',
  now = new Date(),
  log = console,
} = {}) {
  let change;
  try {
    change = detectChange(dir, { env });
  } catch (e) {
    log.error(`[ENV-WATCH] Não foi possível ler o ambiente: ${e.message}`);
    return { status: 'erro', reason: e.message };
  }
  if (!change.changed) return { status: 'sem-alteracao', change };

  const report = buildReport(change, { dir, origem, now, env });
  const attachments = [{ filename: `env-alteracao-${stamp(now)}.txt`, content: report }];
  if (change.snap.vaultText)
    attachments.push({ filename: `env-cofre-${stamp(now)}.enc`, content: change.snap.vaultText });

  const subject = `[Jorge Alvim Advocacia] ${change.first ? 'Monitoramento do .env ativado' : 'Alteração no .env'} — ${os.hostname()}`;
  const result = await sender({ to, subject, text: report, attachments });
  if (!result?.sent) {
    log.warn(
      `[ENV-WATCH] Alteração do .env detectada, mas o e-mail não foi enviado (${result?.reason || 'erro'}). Será tentado de novo na próxima varredura.`
    );
    return { status: 'falha-envio', change, reason: result?.reason };
  }

  writeState(dir, { ...change.next, notified_at: now.toISOString() });
  const nomes = (a) => (a.length ? a.join(',') : '-');
  try {
    fs.appendFileSync(
      path.join(dir, HISTORY_FILE),
      `${now.toISOString()} | ${origem} | ${change.first ? 'linha-de-base' : 'alteracao'} | +${nomes(change.added)} | -${nomes(change.removed)} | ~${nomes(change.modified)} | enviado para ${to}\n`,
      { mode: 0o600 }
    );
  } catch {
    /* o histórico é auxiliar */
  }
  log.log(`[ENV-WATCH] ${change.first ? 'Linha de base registrada' : 'Alteração notificada'} por e-mail (${to}).`);
  return { status: change.first ? 'baseline' : 'notificado', change };
}

let _started = false;
/** Inicia o vigia: verifica ~20 s após o boot e depois de hora em hora. Idempotente. */
export function startEnvWatcher({ dir, intervalMs = 60 * 60 * 1000, env = process.env } = {}) {
  if (_started || env.NODE_ENV === 'test' || env.ENV_WATCH_DISABLED === '1') return false;
  _started = true;
  const run = (origem) =>
    checkEnvChange({ dir, env, origem }).catch((e) => console.error('[ENV-WATCH] Erro inesperado:', e.message));
  setTimeout(() => run('inicialização'), 20000).unref?.();
  setInterval(() => run('varredura'), intervalMs).unref?.();
  return true;
}
