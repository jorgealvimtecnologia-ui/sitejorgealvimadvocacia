import crypto from 'node:crypto';

// Gerenciamento de Sessões do Painel Administrativo em Memória
export const sessions = new Map();

export function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  sessions.set(token, {
    userId: user.id,
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt
  });
  return token;
}

export function validateToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
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

// Gerenciamento de Sessões do Portal do Cliente
export const clientSessions = new Map();

export function createClientSession(client) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  clientSessions.set(token, {
    clientId: client.id,
    id: client.id,
    fullName: client.full_name,
    name: client.full_name,
    email: client.email,
    cpf: client.cpf,
    cnpj: client.cnpj,
    clientType: client.client_type,
    expiresAt
  });
  return token;
}

export function validateClientToken(token) {
  if (!token) return null;
  const session = clientSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    clientSessions.delete(token);
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

// Gerenciamento de Sessões do Portal do Colaborador (RH/CLT)
export const employeeSessions = new Map();

export function createEmployeeSession(emp) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  employeeSessions.set(token, {
    employeeId: emp.id,
    id: emp.id,
    fullName: emp.name || emp.full_name,
    name: emp.name || emp.full_name,
    cpf: emp.cpf,
    position: emp.position,
    contractType: emp.contract_type,
    expiresAt
  });
  return token;
}

export function validateEmployeeToken(token) {
  if (!token) return null;
  const session = employeeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    employeeSessions.delete(token);
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
