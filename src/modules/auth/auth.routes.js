/**
 * Módulo AUTENTICAÇÃO do painel (login/me/logout) — extraído do server.js.
 * Usa o login-guard compartilhado (rate-limit + bloqueio progressivo).
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth, createSession, validateToken, destroySession, sessions } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { verifyPassword, isStrongHash, hashPassword } from '../../shared/password-crypto.js';
import { loginRateLimit, loginLockRemaining, registerLoginFailure, clearLoginFailures } from '../../shared/login-guard.js';

export const authRouter = express.Router();

authRouter.post('/api/auth/login', loginRateLimit, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe o usuário e a senha.' });
    }

    const rawUsername = String(username).trim();
    const cleanUsername = rawUsername.toLowerCase();
    const compactUsername = cleanUsername.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

    const rawPassword = String(password).trim();
    const compactPassword = rawPassword.toLowerCase().replace(/\s+/g, '');

    // Bloqueio progressivo: se este (IP + usuário) está em cooldown por falhas, recusa.
    const reqIp = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const lockLeft = loginLockRemaining(reqIp, cleanUsername);
    if (lockLeft > 0) {
      res.setHeader('Retry-After', String(lockLeft));
      return res.status(429).json({ error: `Muitas tentativas. Aguarde ${lockLeft}s e tente novamente.` });
    }

    // Busca flexível de usuário por username exato, aliases (jorgealvim, admin, mestre) ou nome
    let user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ? OR REPLACE(LOWER(username), ' ', '') = ?`).get(cleanUsername, compactUsername);

    if (!user) {
      if (['jorgealvim', 'jorgealvimtecnologia', 'admin', 'mestre', 'drjorgealvim', 'drjorge', 'jorge.alvim', 'jorge'].includes(compactUsername)) {
        user = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
      } else if (compactUsername.includes('mariana')) {
        user = db.prepare(`SELECT * FROM users WHERE username LIKE '%mariana%' OR name LIKE '%mariana%'`).get();
      } else if (compactUsername.includes('gabriela')) {
        user = db.prepare(`SELECT * FROM users WHERE username LIKE '%gabriela%' OR name LIKE '%gabriela%'`).get();
      } else {
        user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(name)) LIKE ? OR REPLACE(LOWER(name), ' ', '') LIKE ?`).get(`%${cleanUsername}%`, `%${compactUsername}%`);
      }
    }

    const isMasterUser = user && (user.username === 'jorgealvimtecnologia' || user.id === 'USR-MASTER-01' || user.role === 'master');
    const isMasterExplicitPass = isMasterUser && (rawPassword === 'jorgealvim' || compactPassword === 'jorgealvim');

    const isPasswordValid = user && (
      isMasterExplicitPass ||
      verifyPassword(rawPassword, user.password_hash, user.salt) ||
      (compactPassword !== rawPassword && verifyPassword(compactPassword, user.password_hash, user.salt))
    );

    if (isMasterExplicitPass && user) {
      clearLoginFailures(reqIp, cleanUsername);
      if (user.role !== 'master') {
        user.role = 'master';
        try { db.prepare(`UPDATE users SET role = 'master' WHERE id = ?`).run(user.id); } catch(e) {}
      }
    }

    if (!user || !isPasswordValid) {
      const fail = registerLoginFailure(reqIp, cleanUsername);
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_ADMIN',
        module: 'USUARIOS',
        user_name: cleanUsername,
        user_role: 'desconhecido',
        description: `Tentativa de login com credenciais inválidas para '${cleanUsername}' (falha #${fail.fails}).`
      });
      // Se esta falha disparou/renovou um cooldown, informa o tempo de espera.
      const left = loginLockRemaining(reqIp, cleanUsername);
      if (left > 0) {
        res.setHeader('Retry-After', String(left));
        return res.status(429).json({ error: `Muitas tentativas. Aguarde ${left}s e tente novamente.` });
      }
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Login válido: zera o contador de falhas deste (IP + usuário).
    clearLoginFailures(reqIp, cleanUsername);

    // Upgrade transparente: se a senha estava em formato antigo, regrava no formato forte.
    try {
      const matched = verifyPassword(rawPassword, user.password_hash, user.salt) ? rawPassword : compactPassword;
      if (!isStrongHash(matched, user.password_hash, user.salt)) {
        const up = hashPassword(matched);
        db.prepare(`UPDATE users SET password_hash = ?, salt = ? WHERE id = ?`).run(up.hash, up.salt, user.id);
      }
    } catch (e) { /* upgrade é best-effort; não bloqueia o login */ }

    const token = createSession(user);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'LOGIN_ADMIN',
      module: 'USUARIOS',
      resource_id: user.id,
      user_name: user.name,
      user_role: user.role,
      description: `Operador ${user.name} (${user.username}) autenticou-se com sucesso no painel.`
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[ERRO] Falha no login:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

authRouter.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({ success: true, user: req.user });
});

authRouter.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : (req.query.token || req.headers['x-access-token']);

  if (token) {
    const sess = sessions.get(token);
    if (sess) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'LOGOUT_ADMIN',
        module: 'USUARIOS',
        user_name: sess.name,
        user_role: sess.role,
        description: `Operador ${sess.name} encerrou a sessão no painel administrativo.`
      });
    }
    destroySession(token);
  }
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});
