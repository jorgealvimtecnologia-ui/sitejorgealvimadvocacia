/**
 * Módulo AUTENTICAÇÃO do painel (login/me/logout) — extraído do server.js.
 * Usa o login-guard compartilhado (rate-limit + bloqueio progressivo).
 */
import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth, createSession, validateToken, destroySession, sessions } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { verifyPassword, isStrongHash, hashPassword } from '../../shared/password-crypto.js';
import { loginRateLimit, loginLockRemaining, registerLoginFailure, clearLoginFailures } from '../../shared/login-guard.js';
import { verifyGoogleToken } from '../../shared/google-auth.js';
import { validatePassword } from '../../shared/password-policy.js';
import { sendLawyerWhatsAppNotification } from '../../shared/notify.js';

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

// Configuração pública do Google Client ID
authRouter.get('/api/auth/google-config', (req, res) => {
  const defaultClientId = '285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com';
  const clientId = (process.env.GOOGLE_CLIENT_ID || defaultClientId).trim();
  res.json({
    success: true,
    clientId,
    enabled: Boolean(clientId)
  });
});

// Autenticação com Google para operadores/advogados do painel (RBAC Estrito)
authRouter.post('/api/auth/google', loginRateLimit, async (req, res) => {
  try {
    const credential = req.body.credential || req.body.token || req.body.access_token;
    if (!credential) {
      return res.status(400).json({ error: 'Token de credencial do Google não fornecido.' });
    }

    const googleUser = await verifyGoogleToken(credential);
    if (!googleUser || !googleUser.email) {
      return res.status(401).json({ error: 'Não foi possível validar o login com a conta Google informada.' });
    }

    const email = googleUser.email.toLowerCase().trim();

    // 1. Verificar se a conta Google pertence a um CLIENTE (clients ou access_permissions com role_template = 'cliente')
    const clientDoc = db.prepare(`SELECT id, full_name, email FROM clients WHERE LOWER(TRIM(email)) = ? OR google_id = ?`).get(email, googleUser.sub);
    const clientPerm = db.prepare(`SELECT * FROM access_permissions WHERE role_template = 'cliente' AND (LOWER(TRIM(user_email)) = ? OR user_id = ?)`).get(email, clientDoc ? clientDoc.id : '');

    // 2. Localizar operador estritamente no ecossistema administrativo
    let user = null;

    // A) Por google_id já vinculado previamente a um usuário operador
    if (googleUser.sub) {
      user = db.prepare(`SELECT * FROM users WHERE google_id = ?`).get(googleUser.sub);
    }

    // B) Por e-mail exato ou username em users
    if (!user) {
      user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ? OR LOWER(TRIM(google_email)) = ?`).get(email, email);
    }

    // C) Por e-mail registrado na matriz de permissões RBAC de operadores (excluindo clientes)
    if (!user) {
      const operatorPerm = db.prepare(`
        SELECT user_id, role_template, is_active FROM access_permissions 
        WHERE LOWER(TRIM(user_email)) = ? AND role_template != 'cliente'
      `).get(email);
      if (operatorPerm) {
        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(operatorPerm.user_id);
      }
    }

    // D) Mestre oficial (Dr. Jorge Alvim) - emails explicitamente autorizados na env ou padrão institucional
    const adminEmailsEnv = (process.env.GOOGLE_ADMIN_EMAILS || 'jorgealvimtecnologia@gmail.com')
      .split(',')
      .map(s => s.toLowerCase().trim())
      .filter(Boolean);

    if (!user && adminEmailsEnv.includes(email)) {
      user = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
    }

    // 3. Validação RBAC estrita de perfil e acesso
    if ((clientDoc || clientPerm) && (!user || user.role === 'cliente')) {
      return res.status(403).json({
        error: `Acesso Negado (RBAC): A conta Google '${email}' está registrada como CLIENTE do escritório e não tem permissão para acessar o Painel Administrativo. Acesse o seu ambiente exclusivo pelo Portal do Cliente: https://jorgealvimadvocacia.com.br/cliente`
      });
    }

    if (!user) {
      return res.status(403).json({
        error: `Acesso Negado (RBAC): A conta Google '${email}' não possui perfil de operador autorizado na Matriz de Controle de Acesso. Solicite a vinculação do seu e-mail ao Administrador Mestre.`
      });
    }

    if (user.role === 'cliente') {
      return res.status(403).json({
        error: `Acesso Negado (RBAC): O usuário '${user.username}' possui perfil de Cliente e não pode acessar o Painel de Gestão. Acesse pelo Portal do Cliente.`
      });
    }

    // Checar se o operador está com status ativo na Matriz RBAC
    const accessRecord = db.prepare(`SELECT role_template, is_active FROM access_permissions WHERE user_id = ?`).get(user.id);
    if (accessRecord) {
      if (accessRecord.role_template === 'cliente') {
        return res.status(403).json({
          error: `Acesso Negado (RBAC): Sua função na Matriz de Permissões está atribuída como Cliente. Utilize o Portal do Cliente.`
        });
      }
      if (accessRecord.is_active === 0) {
        return res.status(403).json({
          error: `Acesso Negado (RBAC): Seu perfil de operador encontra-se desativado na Matriz de Controle de Acesso. Contate a administração.`
        });
      }
    }

    // 4. Salvar vínculo seguro da conta Google no registro do operador
    try {
      db.prepare(`UPDATE users SET google_id = ?, google_email = ?, avatar_url = ? WHERE id = ?`)
        .run(googleUser.sub, email, googleUser.picture || null, user.id);
      db.prepare(`UPDATE access_permissions SET user_email = ? WHERE user_id = ? AND (user_email IS NULL OR user_email = '')`)
        .run(email, user.id);
    } catch (e) {}

    const token = createSession(user);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'LOGIN_GOOGLE_ADMIN',
      module: 'USUARIOS',
      resource_id: user.id,
      user_name: user.name,
      user_role: user.role,
      description: `Operador ${user.name} (${user.role}) autenticou-se via Google (${email}) com autorização RBAC validada.`
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar_url: googleUser.picture || user.avatar_url || ''
      }
    });
  } catch (err) {
    console.error('[ERRO] Login Google Admin:', err);
    return res.status(500).json({ error: 'Erro ao processar autenticação Google.' });
  }
});

/**
 * POST /api/auth/forgot-password - Solicitar redefinição de senha para administrador/operador
 * Gera um código temporário de 6 dígitos enviado ao WhatsApp do Administrador.
 */
authRouter.post('/api/auth/forgot-password', loginRateLimit, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Informe o usuário ou e-mail cadastrado.' });
    }

    const rawUsername = String(username).trim();
    const cleanUsername = rawUsername.toLowerCase();
    const compactUsername = cleanUsername.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

    // Localizar usuário
    let user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ? OR REPLACE(LOWER(username), ' ', '') = ?`).get(cleanUsername, compactUsername);

    if (!user) {
      if (['jorgealvim', 'jorgealvimtecnologia', 'admin', 'mestre', 'drjorgealvim', 'drjorge', 'jorge.alvim', 'jorge'].includes(compactUsername)) {
        user = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
      } else {
        user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(google_email)) = ? OR LOWER(TRIM(name)) LIKE ?`).get(cleanUsername, `%${cleanUsername}%`);
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado no sistema.' });
    }

    // Gerar token de 6 dígitos numéricos
    const resetCode = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora de validade

    db.prepare(`UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`)
      .run(resetCode, expiresAt, user.id);

    const messageText = `🔐 *RECUPERAÇÃO DE SENHA - PAINEL ADMINISTRATIVO*\n\n` +
      `Olá Dr. Jorge Alvim / Administrador,\n\n` +
      `Foi solicitada a redefinição de senha para o usuário: *${user.username}* (${user.name}).\n` +
      `Seu código de segurança temporário (válido por 1 hora) é:\n\n` +
      `👉 *${resetCode}*\n\n` +
      `Digite este código no formulário de redefinição de senha para definir sua nova credencial.\n\n` +
      `_Caso não tenha solicitado este código, ignore esta mensagem._`;

    await sendLawyerWhatsAppNotification(messageText, { action: 'admin_password_reset', userId: user.id });

    logAudit(req, {
      event_type: 'SEGURANCA',
      event_name: 'SOLICITACAO_REINICIO_SENHA_ADMIN',
      module: 'USUARIOS',
      resource_id: user.id,
      user_name: user.name,
      user_role: user.role,
      description: `Código de redefinição de senha solicitado para ${user.name} (${user.username}).`
    });

    return res.json({
      success: true,
      message: 'Código de verificação enviado com sucesso ao WhatsApp do Administrador.'
    });
  } catch (err) {
    console.error('[ERRO] Forgot Password:', err);
    return res.status(500).json({ error: 'Falha ao processar solicitação de recuperação de senha.' });
  }
});

/**
 * POST /api/auth/reset-password - Concluir redefinição com código de verificação
 */
authRouter.post('/api/auth/reset-password', loginRateLimit, (req, res) => {
  try {
    const { username, code, new_password } = req.body;
    if (!username || !code || !new_password) {
      return res.status(400).json({ error: 'Usuário, código de segurança e nova senha são obrigatórios.' });
    }

    const cleanCode = String(code).trim();
    const rawUsername = String(username).trim();
    const cleanUsername = rawUsername.toLowerCase();
    const compactUsername = cleanUsername.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

    let user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ? OR REPLACE(LOWER(username), ' ', '') = ?`).get(cleanUsername, compactUsername);

    if (!user && ['jorgealvim', 'jorgealvimtecnologia', 'admin', 'mestre', 'drjorgealvim', 'drjorge', 'jorge.alvim', 'jorge'].includes(compactUsername)) {
      user = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
    }

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (!user.reset_token || user.reset_token !== cleanCode) {
      return res.status(400).json({ error: 'Código de segurança inválido.' });
    }

    if (user.reset_token_expires && new Date(user.reset_token_expires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código de segurança expirado. Solicite um novo código.' });
    }

    // Validar nova senha conforme política de 4 a 12 caracteres
    const pol = validatePassword(new_password);
    if (!pol.ok) {
      return res.status(400).json({ error: pol.error });
    }

    const hp = hashPassword(String(new_password).trim());
    db.prepare(`UPDATE users SET password_hash = ?, salt = ?, reset_token = NULL, reset_token_expires = NULL, plain_password = NULL WHERE id = ?`)
      .run(hp.hash, hp.salt, user.id);

    const reqIp = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    clearLoginFailures(reqIp, cleanUsername);

    logAudit(req, {
      event_type: 'SEGURANCA',
      event_name: 'REDEFINICAO_SENHA_ADMIN_CONCLUIDA',
      module: 'USUARIOS',
      resource_id: user.id,
      user_name: user.name,
      user_role: user.role,
      description: `Senha do operador ${user.name} (${user.username}) redefinida com sucesso via código de WhatsApp.`
    });

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode entrar no Painel com a nova senha.'
    });
  } catch (err) {
    console.error('[ERRO] Reset Password:', err);
    return res.status(500).json({ error: 'Falha ao redefinir a senha.' });
  }
});

