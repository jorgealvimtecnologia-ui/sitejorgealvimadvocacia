import crypto from 'node:crypto';
import { db } from '../config/db.js';

// ============================================================
//  Sessões persistentes (SQLite)
//  Antes as sessões viviam apenas em memória e caíam a cada
//  restart do servidor, deslogando todos os usuários. Agora
//  elas são espelhadas em SQLite e recarregadas na inicialização.
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL,          -- 'admin' | 'client' | 'employee'
    data TEXT NOT NULL,          -- JSON com os dados da sessão
    expires_at INTEGER NOT NULL  -- timestamp (ms)
  );
`);

const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

// Limpa sessões expiradas do banco na carga
try {
  db.prepare(`DELETE FROM auth_sessions WHERE expires_at < ?`).run(Date.now());
} catch (e) {}

function persistSession(token, kind, sessionData) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO auth_sessions (token, kind, data, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(token, kind, JSON.stringify(sessionData), sessionData.expiresAt);
  } catch (e) {
    console.warn('[AUTH] Falha ao persistir sessão:', e.message);
  }
}

function removeSession(token) {
  try {
    db.prepare(`DELETE FROM auth_sessions WHERE token = ?`).run(token);
  } catch (e) {}
}

function loadSessions(kind, targetMap) {
  try {
    const rows = db.prepare(
      `SELECT token, data FROM auth_sessions WHERE kind = ? AND expires_at > ?`
    ).all(kind, Date.now());
    rows.forEach(r => {
      try { targetMap.set(r.token, JSON.parse(r.data)); } catch (e) {}
    });
  } catch (e) {}
}

// ============================================================
//  Sessões do Painel Administrativo
// ============================================================
export const sessions = new Map();
loadSessions('admin', sessions);

export function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL_MS;
  const data = {
    userId: user.id,
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt
  };
  sessions.set(token, data);
  persistSession(token, 'admin', data);
  return token;
}

export function validateToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    removeSession(token);
    return null;
  }
  return session;
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token || req.headers['x-access-token']);

  const session = validateToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login no painel.' });
  }
  req.user = session;
  next();
}

export function requireMaster(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'master' && req.user.username !== 'jorgealvimtecnologia') {
      return res.status(403).json({ error: 'Ação restrita ao Usuário Mestre (Dr. Jorge Alvim).' });
    }
    next();
  });
}

// ============================================================
//  Sessões do Portal do Cliente
// ============================================================
export const clientSessions = new Map();
loadSessions('client', clientSessions);

export function createClientSession(client) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL_MS;
  const data = {
    clientId: client.id,
    id: client.id,
    fullName: client.full_name,
    name: client.full_name,
    email: client.email,
    cpf: client.cpf,
    cnpj: client.cnpj,
    clientType: client.client_type,
    expiresAt
  };
  clientSessions.set(token, data);
  persistSession(token, 'client', data);
  return token;
}

export function validateClientToken(token) {
  if (!token) return null;
  const session = clientSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    clientSessions.delete(token);
    removeSession(token);
    return null;
  }
  return session;
}

export function requireClientAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token || req.headers['x-client-token']);

  const session = validateClientToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Sessão do cliente expirada ou inválida. Faça login novamente.' });
  }
  req.client = session;
  next();
}

// ============================================================
//  Sessões do Portal do Colaborador (RH/CLT)
// ============================================================
export const employeeSessions = new Map();
loadSessions('employee', employeeSessions);

export function createEmployeeSession(emp) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL_MS;
  const data = {
    employeeId: emp.id,
    id: emp.id,
    fullName: emp.name || emp.full_name,
    name: emp.name || emp.full_name,
    cpf: emp.cpf,
    position: emp.position,
    contractType: emp.contract_type,
    expiresAt
  };
  employeeSessions.set(token, data);
  persistSession(token, 'employee', data);
  return token;
}

export function validateEmployeeToken(token) {
  if (!token) return null;
  const session = employeeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    employeeSessions.delete(token);
    removeSession(token);
    return null;
  }
  return session;
}

export function requireEmployeeAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token || req.headers['x-employee-token']);

  // Permite acesso se for Admin autenticado no painel
  const adminSession = validateToken(token);
  if (adminSession) {
    req.user = adminSession;
    return next();
  }

  const session = validateEmployeeToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Sessão do colaborador expirada ou inválida. Faça login novamente.' });
  }
  req.employee = session;
  next();
}

// Remove uma sessão de qualquer tipo (usado no logout)
export function destroySession(token) {
  if (!token) return;
  sessions.delete(token);
  clientSessions.delete(token);
  employeeSessions.delete(token);
  removeSession(token);
}
