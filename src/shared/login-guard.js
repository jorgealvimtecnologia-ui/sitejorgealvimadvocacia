/**
 * Proteção de login (anti força-bruta): rate-limit por IP + bloqueio progressivo
 * por falhas (IP+usuário). Compartilhado pelo login do painel e do portal do cliente.
 */
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
export function loginLockRemaining(ip, username) {
  const rec = loginFailures.get(loginLockKey(ip, username));
  if (rec && rec.lockUntil && Date.now() < rec.lockUntil) {
    return Math.ceil((rec.lockUntil - Date.now()) / 1000); // segundos restantes
  }
  return 0;
}
export function registerLoginFailure(ip, username) {
  const k = loginLockKey(ip, username);
  const rec = loginFailures.get(k) || { fails: 0, lockUntil: 0 };
  rec.fails += 1;
  const d = progressiveLockMs(rec.fails);
  rec.lockUntil = d > 0 ? Date.now() + d : 0;
  loginFailures.set(k, rec);
  if (loginFailures.size > 5000) { // limpeza esporádica
    const now = Date.now();
    for (const [key, v] of loginFailures) if (!v.lockUntil || now > v.lockUntil) loginFailures.delete(key);
  }
  return rec;
}
export function clearLoginFailures(ip, username) {
  loginFailures.delete(loginLockKey(ip, username));
}
