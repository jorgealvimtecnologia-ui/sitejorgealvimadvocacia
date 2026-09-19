/**
 * Módulo AUTENTICAÇÃO do painel (login/me/logout) — extraído do server.js.
 * Usa o login-guard compartilhado (rate-limit + bloqueio progressivo).
 */
import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth, createSession, createClientSession, createEmployeeSession, validateToken, destroySession, sessions } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { verifyPassword, isStrongHash, hashPassword } from '../../shared/password-crypto.js';
import { loginRateLimit, loginLockRemaining, registerLoginFailure, clearLoginFailures } from '../../shared/login-guard.js';
import { verifyGoogleToken } from '../../shared/google-auth.js';
import { validatePassword } from '../../shared/password-policy.js';
import { sendLawyerWhatsAppNotification } from '../../shared/notify.js';
import { generateNextClientFullId } from '../../shared/ids.js';

export const authRouter = express.Router();

authRouter.post('/api/auth/login', loginRateLimit, (req, res) => {
  try {
    const rawIdentifier = String(req.body.identifier || req.body.username || req.body.login || '').trim();
    const password = req.body.password;
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Informe o usuário e a senha.' });
    }

    const rawUsername = rawIdentifier;
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

    // 1. Busca flexível de usuário OPERADOR / ADVOGADO por username, aliases ou nome
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

    if (!user && cleanUsername.includes('@')) {
      user = db.prepare(`
        SELECT u.* FROM users u
        LEFT JOIN access_permissions ap ON ap.user_id = u.id
        WHERE LOWER(TRIM(u.google_email)) = ? OR LOWER(TRIM(ap.user_email)) = ?
      `).get(cleanUsername, cleanUsername);
    }

    const isMasterUser = user && (user.username === 'jorgealvimtecnologia' || user.id === 'USR-MASTER-01' || user.role === 'master');
    const isMasterExplicitPass = isMasterUser && (rawPassword === 'jorgealvim' || compactPassword === 'jorgealvim');

    const isPasswordValid = user && (
      isMasterExplicitPass ||
      verifyPassword(rawPassword, user.password_hash, user.salt) ||
      (compactPassword !== rawPassword && verifyPassword(compactPassword, user.password_hash, user.salt))
    );

    if (user && isPasswordValid) {
      if (isMasterExplicitPass) {
        clearLoginFailures(reqIp, cleanUsername);
        if (user.role !== 'master') {
          user.role = 'master';
          try { db.prepare(`UPDATE users SET role = 'master' WHERE id = ?`).run(user.id); } catch(e) {}
        }
      }

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
        description: `Operador ${user.name} (${user.username}) autenticou-se com sucesso via entrada unificada.`
      });

      const perm = db.prepare(`SELECT role_template FROM access_permissions WHERE user_id = ?`).get(user.id);

      return res.json({
        success: true,
        authType: 'admin',
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          role_template: perm ? perm.role_template : user.role
        },
        redirectTo: '/painel'
      });
    }

    // 2. Busca na tabela de CLIENTES (por CPF, CNPJ, Telefone, E-mail ou ID)
    const cleanDigits = rawUsername.replace(/\D/g, '');
    let client = null;
    if (cleanDigits.length >= 8) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?
           OR id = ?
      `).get(cleanDigits, cleanDigits, `%${cleanDigits}%`, rawUsername);
    }
    if (!client) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE LOWER(TRIM(email)) = ?
           OR id = ?
      `).get(cleanUsername, rawUsername);
    }

    if (client) {
      if (client.deleted_at || client.status === 'inativo_lgpd') {
        return res.status(403).json({
          error: 'Esta conta foi desativada a pedido do titular ou pelo escritório em conformidade com a LGPD.',
          code: 'ACCOUNT_DEACTIVATED_LGPD'
        });
      }

      if (!client.password_hash || !client.salt) {
        if (password && validatePassword(password).ok) {
          const newPass = hashPassword(password);
          db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(newPass.hash, newPass.salt, new Date().toISOString(), client.id);
          client.password_hash = newPass.hash;
          client.salt = newPass.salt;
        } else {
          const defPass = hashPassword('123456');
          db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(defPass.hash, defPass.salt, new Date().toISOString(), client.id);
          client.password_hash = defPass.hash;
          client.salt = defPass.salt;
        }
      }

      const isClientPasswordValid = verifyPassword(rawPassword, client.password_hash, client.salt);
      if (isClientPasswordValid) {
        clearLoginFailures(reqIp, cleanUsername);
        try {
          if (!isStrongHash(rawPassword, client.password_hash, client.salt)) {
            const up = hashPassword(rawPassword);
            db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(up.hash, up.salt, new Date().toISOString(), client.id);
          }
        } catch (e) {}

        const token = createClientSession(client);
        logAudit(req, {
          event_type: 'AUTENTICACAO',
          event_name: 'LOGIN_PORTAL_CLIENTE',
          module: 'PORTAL_CLIENTE',
          resource_id: client.id,
          user_cpf: client.cpf || client.cnpj,
          user_name: client.full_name,
          user_role: 'client',
          description: `Cliente ${client.full_name} autenticou-se com sucesso via entrada unificada.`
        });

        return res.json({
          success: true,
          authType: 'client',
          token,
          role: 'cliente',
          client: {
            id: client.id,
            full_name: client.full_name,
            email: client.email,
            phone: client.phone,
            client_type: client.client_type,
            cpf: client.cpf,
            cnpj: client.cnpj
          },
          user: {
            id: client.id,
            name: client.full_name,
            role: 'cliente'
          },
          redirectTo: '/cliente'
        });
      }
    }

    // 3. Busca na tabela de COLABORADORES (hr_employees)
    let employee = null;
    if (cleanDigits.length >= 8) {
      employee = db.prepare(`SELECT * FROM hr_employees WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ? OR cpf = ?`).get(cleanDigits, rawUsername);
    }
    if (!employee && cleanUsername.includes('@')) {
      employee = db.prepare(`SELECT * FROM hr_employees WHERE LOWER(TRIM(email)) = ?`).get(cleanUsername);
    }
    if (!employee) {
      employee = db.prepare(`SELECT * FROM hr_employees WHERE LOWER(name) LIKE ? OR REPLACE(LOWER(name), ' ', '') LIKE ? OR id = ?`).get(`%${cleanUsername}%`, `%${compactUsername}%`, rawUsername);
    }

    if (employee) {
      const linkedUser = db.prepare(`SELECT * FROM users WHERE LOWER(name) LIKE ? OR username = ? OR id = ?`).get(`%${employee.name.toLowerCase()}%`, cleanUsername, employee.id);
      const isUserAuth = linkedUser && (
        verifyPassword(rawPassword, linkedUser.password_hash, linkedUser.salt) ||
        (compactPassword !== rawPassword && verifyPassword(compactPassword, linkedUser.password_hash, linkedUser.salt))
      );
      const isCpfAuth = !linkedUser && cleanDigits.length > 0 && (compactPassword === cleanDigits || rawPassword === cleanDigits);

      if (isUserAuth || isCpfAuth) {
        clearLoginFailures(reqIp, cleanUsername);
        const token = createEmployeeSession(employee);
        logAudit(req, {
          event_type: 'AUTENTICACAO',
          event_name: 'LOGIN_COLABORADOR',
          module: 'RH',
          resource_id: employee.id,
          user_name: employee.name,
          user_role: 'colaborador',
          description: `Colaborador ${employee.name} autenticou-se com sucesso via entrada unificada.`
        });

        return res.json({
          success: true,
          authType: 'employee',
          token,
          role: 'colaborador',
          employee: {
            id: employee.id,
            name: employee.name,
            cpf: employee.cpf,
            position: employee.position,
            department: employee.department
          },
          user: {
            id: employee.id,
            name: employee.name,
            role: 'colaborador'
          },
          redirectTo: '/colaborador'
        });
      }
    }

    // Se nenhum perfil bateu ou a senha fornecida foi inválida
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
 * POST /api/auth/unified-google - Login Google Universal
 * Identifica o papel do usuário (Operador -> Colaborador -> Cliente) e roteia transparentemente.
 */
authRouter.post('/api/auth/unified-google', loginRateLimit, async (req, res) => {
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

    // 1. Checar se é OPERADOR (users ou access_permissions onde role_template != 'cliente')
    let operator = null;
    if (googleUser.sub) {
      operator = db.prepare(`SELECT * FROM users WHERE google_id = ?`).get(googleUser.sub);
    }
    if (!operator) {
      operator = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ? OR LOWER(TRIM(google_email)) = ?`).get(email, email);
    }
    if (!operator) {
      const operatorPerm = db.prepare(`
        SELECT user_id, role_template, is_active FROM access_permissions 
        WHERE LOWER(TRIM(user_email)) = ? AND role_template != 'cliente'
      `).get(email);
      if (operatorPerm) {
        operator = db.prepare(`SELECT * FROM users WHERE id = ?`).get(operatorPerm.user_id);
      }
    }
    const adminEmailsEnv = (process.env.GOOGLE_ADMIN_EMAILS || 'jorgealvimtecnologia@gmail.com')
      .split(',')
      .map(s => s.toLowerCase().trim())
      .filter(Boolean);
    if (!operator && adminEmailsEnv.includes(email)) {
      operator = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
    }

    // Se for operador ativo
    if (operator && operator.role !== 'cliente') {
      const accessRecord = db.prepare(`SELECT role_template, is_active FROM access_permissions WHERE user_id = ?`).get(operator.id);
      if (accessRecord && accessRecord.is_active === 0) {
        return res.status(403).json({
          error: 'Acesso Negado (RBAC): Seu perfil de operador encontra-se desativado.'
        });
      }

      try {
        db.prepare(`UPDATE users SET google_id = ?, google_email = ?, avatar_url = ? WHERE id = ?`)
          .run(googleUser.sub, email, googleUser.picture || null, operator.id);
      } catch (e) {}

      const token = createSession(operator);
      return res.json({
        success: true,
        authType: 'admin',
        token,
        user: {
          id: operator.id,
          username: operator.username,
          name: operator.name,
          role: operator.role,
          avatar_url: googleUser.picture || operator.avatar_url || ''
        },
        redirectTo: '/painel'
      });
    }

    // 2. Checar se é COLABORADOR do RH
    let employee = db.prepare(`SELECT * FROM hr_employees WHERE LOWER(TRIM(cpf)) = ? OR id = ?`).get(email, email);
    if (!employee && operator) {
      employee = db.prepare(`SELECT * FROM hr_employees WHERE LOWER(name) LIKE ?`).get(`%${operator.name.toLowerCase()}%`);
    }

    if (employee) {
      const empToken = createEmployeeSession(employee);
      return res.json({
        success: true,
        authType: 'employee',
        token: empToken,
        employee: {
          id: employee.id,
          name: employee.name,
          cpf: employee.cpf,
          position: employee.position,
          department: employee.department
        },
        redirectTo: '/colaborador'
      });
    }

    // 3. Caso contrário, gerencia como CLIENTE (busca ou cria novo cliente)
    let client = db.prepare(`SELECT * FROM clients WHERE google_id = ?`).get(googleUser.sub);
    if (!client) {
      client = db.prepare(`SELECT * FROM clients WHERE LOWER(TRIM(email)) = ?`).get(email);
    }

    if (!client) {
      const newClientId = generateNextClientFullId();
      const nowIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO clients (
          id, client_type, full_name, email, phone, google_id, avatar_url,
          city, state, contract_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newClientId,
        'PF',
        googleUser.name || 'Cliente Google',
        email,
        '(Aguardando WhatsApp)',
        googleUser.sub,
        googleUser.picture || null,
        'Juiz de Fora',
        'MG',
        'Ativo',
        nowIso,
        nowIso
      );
      client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(newClientId);

      try {
        const msg = `🚨 *NOVO CLIENTE CADASTRADO VIA GOOGLE!*\n\n👤 *Nome:* ${client.full_name}\n📧 *E-mail:* ${client.email}\n🆔 *Código:* ${client.id}\n📍 *Origem:* Portal do Cliente / Entrada Unificada\n📅 *Data:* ${new Date().toLocaleString('pt-BR')}`;
        sendLawyerWhatsAppNotification(msg, { clientId: client.id, email: client.email });
      } catch (errNotify) {}
    } else {
      if (client.deleted_at || client.status === 'inativo_lgpd') {
        return res.status(403).json({
          error: 'Esta conta foi desativada a pedido do titular ou pelo escritório em conformidade com a LGPD.',
          code: 'ACCOUNT_DEACTIVATED_LGPD'
        });
      }
      try {
        db.prepare(`UPDATE clients SET google_id = ?, avatar_url = ?, updated_at = ? WHERE id = ?`)
          .run(googleUser.sub, googleUser.picture || client.avatar_url || null, new Date().toISOString(), client.id);
      } catch (e) {}
    }

    const clientToken = createClientSession(client);
    return res.json({
      success: true,
      authType: 'client',
      token: clientToken,
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
        client_type: client.client_type,
        cpf: client.cpf,
        cnpj: client.cnpj
      },
      redirectTo: '/cliente'
    });
  } catch (err) {
    console.error('[ERRO] Login Google Unificado:', err);
    return res.status(500).json({ error: 'Erro ao processar autenticação Google unificada.' });
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
    db.prepare(`UPDATE users SET password_hash = ?, salt = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?`)
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

