/**
 * Observabilidade (AUD-08): logs em JSON com id de requisição, saúde real do sistema e vigia.
 *
 *  - Cada requisição ganha um id (cabeçalho X-Request-Id) e gera UMA linha de log em JSON ao terminar.
 *    NUNCA registra corpo, cabeçalhos, cookies, token nem a query string (onde podem ir códigos e tokens).
 *  - Tarefas de fundo (varredura de prazos, alertas, sincronização) batem um "ponto" a cada execução;
 *    se uma delas parar, /health mostra e o vigia avisa o mestre.
 *  - Erros não tratados ficam num anel em memória (contagem na última hora) e no log.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const SENSITIVE_KEY = /pass|senha|token|secret|authorization|cookie|api[-_]?key|bearer|cpf|cnpj/i;
const SKIP_PATH = /^\/(health|public\/|dist\/|favicon|manifest\.json|storage\/)/;
const REQ_ID_OK = /^[A-Za-z0-9._-]{8,64}$/;

const isTest = () => process.env.NODE_ENV === 'test' && process.env.LOG_JSON !== '1';

/** Troca por [oculto] o valor de qualquer chave sensível, em qualquer profundidade (limitada). */
export function redact(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[oculto]' : redact(v, depth + 1);
    return out;
  }
  return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

/** Escreve UMA linha JSON (stdout para info, stderr para erro). */
export function logEvent(level, msg, fields = {}, { out = null } = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(fields) });
  if (out) return out(line);
  if (isTest()) return undefined;
  return (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
}

// ---------------------------------------------------------------------------------------------
// Requisições
// ---------------------------------------------------------------------------------------------
export function requestLogger({ write = (l) => process.stdout.write(`${l}\n`) } = {}) {
  return (req, res, next) => {
    const incoming = String(req.headers['x-request-id'] || '');
    req.id = REQ_ID_OK.test(incoming) ? incoming : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    res.setHeader('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (SKIP_PATH.test(req.path)) return;
      const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      const line = JSON.stringify({
        ts: new Date().toISOString(), level, msg: 'http', id: req.id,
        method: req.method, path: req.path, status: res.statusCode, ms,
        user: req.panel?.userId || req.panel?.username || undefined,
      });
      if (!isTest()) write(line);
    });
    next();
  };
}

// ---------------------------------------------------------------------------------------------
// Erros (anel em memória)
// ---------------------------------------------------------------------------------------------
const RECENT_ERRORS = [];
const MAX_ERRORS = 100;

export function recordError(err, ctx = {}) {
  const entry = {
    at: Date.now(),
    message: String(err?.message || err).slice(0, 300),
    stack: String(err?.stack || '').split('\n').slice(0, 6).join('\n'),
    ...ctx,
  };
  RECENT_ERRORS.push(entry);
  if (RECENT_ERRORS.length > MAX_ERRORS) RECENT_ERRORS.shift();
  logEvent('error', 'erro', { id: ctx.id, path: ctx.path, error: entry.message, stack: entry.stack });
  return entry;
}

export function errorsSince(ms, now = Date.now()) {
  return RECENT_ERRORS.filter((e) => now - e.at <= ms).length;
}

export function installProcessErrorHandlers() {
  process.on('unhandledRejection', (reason) => recordError(reason, { origin: 'unhandledRejection' }));
  process.on('uncaughtException', (err) => { recordError(err, { origin: 'uncaughtException' }); });
}

// ---------------------------------------------------------------------------------------------
// Pontos de vida das tarefas de fundo
// ---------------------------------------------------------------------------------------------
const JOBS = new Map(); // nome -> { everyMs, lastOk, lastError, lastErrorMsg, runs }

/** Declara uma tarefa periódica e o intervalo esperado (para saber quando está "parada"). */
export function registerJob(name, everyMs) {
  const prev = JOBS.get(name) || {};
  JOBS.set(name, { runs: 0, ...prev, everyMs, registeredAt: Date.now() });
}

export function markJobRun(name, ok = true, errorMessage = '') {
  const j = JOBS.get(name) || { runs: 0 };
  j.runs += 1;
  if (ok) j.lastOk = Date.now();
  else { j.lastError = Date.now(); j.lastErrorMsg = String(errorMessage).slice(0, 200); }
  JOBS.set(name, j);
}

/** ok | never (ainda não rodou, dentro da tolerância do boot) | stale (parada) */
export function jobStatuses(now = Date.now()) {
  const out = {};
  for (const [name, j] of JOBS) {
    if (!j.everyMs) continue;
    const tolerance = j.everyMs * 2.5 + 5 * 60 * 1000;
    if (j.lastOk && now - j.lastOk <= tolerance) out[name] = 'ok';
    else if (!j.lastOk && now - (j.registeredAt || now) <= tolerance) out[name] = 'never';
    else out[name] = 'stale';
  }
  return out;
}

export function _resetForTests() {
  JOBS.clear();
  RECENT_ERRORS.length = 0;
}

// ---------------------------------------------------------------------------------------------
// Saúde
// ---------------------------------------------------------------------------------------------
export function checkDb(db) {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return 'ok';
  } catch {
    return 'fail';
  }
}

export function diskFreePercent(dir = process.cwd()) {
  try {
    if (typeof fs.statfsSync !== 'function') return null;
    const s = fs.statfsSync(dir);
    return s.blocks ? Math.round((s.bavail / s.blocks) * 1000) / 10 : null;
  } catch {
    return null;
  }
}

/** Corpo do /health. status: ok | degraded | fail (fail = banco fora). */
export function buildHealth(db, { now = Date.now(), dir = process.cwd() } = {}) {
  const dbState = checkDb(db);
  const jobs = jobStatuses(now);
  const disk = diskFreePercent(dir);
  const diskState = disk == null ? 'unknown' : disk < 5 ? 'critical' : disk < 15 ? 'low' : 'ok';
  const degraded = Object.values(jobs).includes('stale') || diskState === 'low' || diskState === 'critical';
  return {
    status: dbState === 'fail' ? 'fail' : degraded ? 'degraded' : 'ok',
    time: new Date(now).toISOString(),
    uptime_s: Math.round(process.uptime()),
    db: dbState,
    disk_free_percent: disk,
    disk: diskState,
    jobs,
    errors_last_hour: errorsSince(60 * 60 * 1000, now),
  };
}

// ---------------------------------------------------------------------------------------------
// Vigia: avisa o mestre (central de notificações) quando algo pára, o disco enche ou o certificado vence
// ---------------------------------------------------------------------------------------------
/** Problemas atuais, em texto, a partir do /health e (opcional) dos dias que faltam para o certificado vencer. */
export function findProblems(health, { certDaysLeft = null } = {}) {
  const p = [];
  if (health.db === 'fail') p.push({ key: 'db', level: 'critical', title: '🚨 Banco de dados não responde', message: 'O sistema não consegue consultar o banco. Verifique o servidor imediatamente.' });
  for (const [name, st] of Object.entries(health.jobs || {})) {
    if (st === 'stale') p.push({ key: `job:${name}`, level: 'critical', title: `⏱️ Tarefa automática parada: ${name}`, message: `A tarefa "${name}" não roda no intervalo esperado. Prazos ou sincronização podem estar sem atualização.` });
  }
  if (health.disk === 'critical' || health.disk === 'low') {
    p.push({ key: 'disk', level: health.disk === 'critical' ? 'critical' : 'warning', title: '💾 Pouco espaço em disco', message: `Resta ${health.disk_free_percent}% de espaço livre no servidor. Libere espaço antes que o sistema pare de gravar.` });
  }
  if (certDaysLeft != null && certDaysLeft <= 15) {
    p.push({ key: 'cert', level: certDaysLeft <= 5 ? 'critical' : 'warning', title: '🔒 Certificado do site perto de vencer', message: `O certificado HTTPS vence em ${certDaysLeft} dia(s). Renove para o site não ficar com aviso de segurança.` });
  }
  return p;
}

export async function certDaysLeft(host, { timeoutMs = 8000 } = {}) {
  let tls;
  try {
    tls = await import('node:tls');
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const sock = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
        const cert = sock.getPeerCertificate();
        sock.end();
        resolve(cert?.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000) : null);
      });
      sock.on('error', () => resolve(null));
      sock.on('timeout', () => { sock.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

let _watchdogStarted = false;
/**
 * Verifica a cada `intervalMs` e cria UMA notificação por problema por dia (dedupe) para o mestre.
 * `notify` e `getDb` são injetados para não acoplar este módulo ao banco nem ao módulo de notificações.
 */
export function startWatchdog({ db, notify, intervalMs = 10 * 60 * 1000, certHost = process.env.CERT_CHECK_HOST || '' } = {}) {
  if (_watchdogStarted || process.env.NODE_ENV === 'test') return false;
  _watchdogStarted = true;
  const run = async () => {
    try {
      const health = buildHealth(db);
      const days = certHost ? await certDaysLeft(certHost) : null;
      const day = new Date().toISOString().slice(0, 10);
      for (const pr of findProblems(health, { certDaysLeft: days })) {
        logEvent('warn', 'problema detectado', { problema: pr.key });
        notify?.({ category: 'sistema', level: pr.level, title: pr.title, message: pr.message, dedupe_key: `watchdog:${pr.key}:${day}`, target_user_id: 'USR-MASTER-01' });
      }
    } catch (e) {
      logEvent('error', 'falha no vigia', { error: e.message });
    }
  };
  setTimeout(run, 2 * 60 * 1000).unref?.();
  setInterval(run, intervalMs).unref?.();
  return true;
}
