/**
 * Proteção de login (anti força-bruta), compartilhada por TODAS as entradas de login
 * (painel, portal do cliente, portal do colaborador):
 *  1) rate-limit por IP;
 *  2) bloqueio progressivo por falhas de (IP + usuário);
 *  3) bloqueio por CONTA (qualquer IP): muitas falhas na mesma conta em 1h travam a
 *     conta por 15 min e avisam o mestre (painel + WhatsApp, se houver gateway).
 */
import { createNotification } from '../modules/notifications/notifications.routes.js';
import { sendLawyerWhatsAppNotification } from './notify.js';
// Rate-limiting simples em memória para rotas de login (anti força-bruta).
const loginHits = new Map();
export function loginRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  try {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // janela de 15 minutos
    const maxAttempts = 15;
    var rec = loginHits.get(ip);
    if (!rec || now > rec.reset) rec = { count: 0, reset: now + windowMs };
    rec.count++;
    loginHits.set(ip, rec);
    if (loginHits.size > 5000) { // limpeza esporádica
      for (const [k, v] of loginHits) if (now > v.reset) loginHits.delete(k);
    }
    if (rec.count > maxAttempts) {
      res.setHeader('Retry-After', String(Math.ceil((rec.reset - now) / 1000)));
      return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' });
    }
  } catch (_) { /* nunca bloquear por erro do limitador */ }
  next();
}

// ---------------------------------------------------------------------------
// BLOQUEIO PROGRESSIVO por FALHAS (defesa em profundidade, além do rate-limit
// por IP acima). Conta falhas consecutivas por (IP + usuário) e impõe uma espera
// que CRESCE a cada faixa de erros. Um login bem-sucedido zera o contador. Assim
// um ataque de força bruta fica exponencialmente mais lento sem punir quem
// simplesmente errou a senha uma ou duas vezes.
// ---------------------------------------------------------------------------
const loginFailures = new Map(); // chave `${ip}|${usuario}` -> { fails, lockUntil }
function loginLockKey(ip, username) {
  return `${ip}|${String(username || '').toLowerCase().trim()}`;
}
function progressiveLockMs(fails) {
  if (fails < 5) return 0;            // 1–4 falhas: sem punição
  if (fails < 8) return 30 * 1000;   // 5–7: 30 segundos
  if (fails < 12) return 2 * 60 * 1000;  // 8–11: 2 minutos
  if (fails < 20) return 15 * 60 * 1000; // 12–19: 15 minutos
  return 60 * 60 * 1000;             // 20+: 1 hora
}
// Bloqueio por CONTA (defesa contra ataque distribuído em vários IPs)
const ACCOUNT_FAIL_LIMIT = 30;
const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const accountFailures = new Map(); // usuario -> { fails, first, lockUntil }
function accountKey(username) {
  return String(username || '').toLowerCase().trim();
}

function secondsLeft(until) {
  return until && Date.now() < until ? Math.ceil((until - Date.now()) / 1000) : 0;
}

export function loginLockRemaining(ip, username) {
  const rec = loginFailures.get(loginLockKey(ip, username));
  const acc = accountFailures.get(accountKey(username));
  return Math.max(secondsLeft(rec && rec.lockUntil), secondsLeft(acc && acc.lockUntil)); // segundos restantes
}

function notifyAccountLocked(username, fails) {
  const msg = `A conta "${username}" teve ${fails} tentativas de login erradas em menos de 1 hora e foi bloqueada por 15 minutos. Se não foi você nem alguém da equipe, pode ser uma tentativa de invasão.`;
  try {
    createNotification({
      category: 'seguranca', level: 'critical',
      title: '🚨 Conta bloqueada por tentativas de login',
      message: msg,
      link: '#tab:audit',
      resource_type: 'login_lock',
      resource_id: username,
      target_user_id: 'USR-MASTER-01',
      dedupe_key: `login-lock:${username}:${Math.floor(Date.now() / ACCOUNT_LOCK_MS)}`
    });
  } catch (_) { /* aviso é best-effort */ }
  if (process.env.WHATSAPP_GATEWAY_URL) {
    sendLawyerWhatsAppNotification(`🚨 *ALERTA DE SEGURANÇA*\n\n${msg}`, { action: 'login_lock', username }).catch(() => {});
  }
}
export function registerLoginFailure(ip, username) {
  const k = loginLockKey(ip, username);
  const rec = loginFailures.get(k) || { fails: 0, lockUntil: 0 };
  rec.fails += 1;
  const d = progressiveLockMs(rec.fails);
  rec.lockUntil = d > 0 ? Date.now() + d : 0;
  loginFailures.set(k, rec);

  const ak = accountKey(username);
  if (ak) {
    const now = Date.now();
    let acc = accountFailures.get(ak);
    if (!acc || now - acc.first > ACCOUNT_WINDOW_MS) acc = { fails: 0, first: now, lockUntil: 0 };
    acc.fails += 1;
    if (acc.fails >= ACCOUNT_FAIL_LIMIT && secondsLeft(acc.lockUntil) === 0) {
      acc.lockUntil = now + ACCOUNT_LOCK_MS;
      rec.accountLocked = true;
      notifyAccountLocked(ak, acc.fails);
    }
    accountFailures.set(ak, acc);
    if (accountFailures.size > 5000) {
      for (const [key, v] of accountFailures) if (now - v.first > ACCOUNT_WINDOW_MS && !secondsLeft(v.lockUntil)) accountFailures.delete(key);
    }
  }
  if (loginFailures.size > 5000) { // limpeza esporádica
    const now = Date.now();
    for (const [key, v] of loginFailures) if (!v.lockUntil || now > v.lockUntil) loginFailures.delete(key);
  }
  return rec;
}
export function clearLoginFailures(ip, username) {
  loginFailures.delete(loginLockKey(ip, username));
  accountFailures.delete(accountKey(username));
}

// ---------------------------------------------------------------------------
// Atalhos para as rotas de login: início (já bloqueado?), falha e sucesso.
// O identificador é normalizado (CPF/CNPJ/telefone → só dígitos; resto → minúsculas).
// ---------------------------------------------------------------------------
function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

export function normalizeLoginId(identifier) {
  const raw = String(identifier || '').trim();
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && /^[\d.\-/\s()+]+$/.test(raw) ? digits : raw.toLowerCase();
}

function respondLocked(res, left) {
  res.setHeader('Retry-After', String(left));
  res.status(429).json({ error: `Muitas tentativas. Aguarde ${left}s e tente novamente.` });
  return true;
}

/** Antes de validar a senha: responde 429 e retorna true se este acesso está bloqueado. */
export function guardLoginStart(req, res, identifier) {
  const left = loginLockRemaining(clientIp(req), normalizeLoginId(identifier));
  return left > 0 ? respondLocked(res, left) : false;
}

/** Após falha: registra; responde 429 e retorna true se a falha ativou um bloqueio. */
export function guardLoginFailure(req, res, identifier) {
  const id = normalizeLoginId(identifier);
  registerLoginFailure(clientIp(req), id);
  const left = loginLockRemaining(clientIp(req), id);
  return left > 0 ? respondLocked(res, left) : false;
}

/** Após sucesso: zera os contadores deste acesso. */
export function guardLoginSuccess(req, identifier) {
  clearLoginFailures(clientIp(req), normalizeLoginId(identifier));
}
