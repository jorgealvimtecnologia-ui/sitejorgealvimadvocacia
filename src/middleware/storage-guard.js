/**
 * Guarda de acesso aos arquivos em /storage/clients e /storage/office_drive.
 * Antes eram servidos sem login (qualquer um com a URL baixava documentos de clientes).
 *
 * Aceita o token por Authorization: Bearer, ?token= ou x-access-token (links <a> não
 * enviam cabeçalho — o front acrescenta ?token= no clique, ver public/js/core/storage-links.js).
 *  - Operador do painel: mestre sempre; perfil restrito precisa da aba correspondente.
 *  - Cliente do portal: só a PRÓPRIA pasta (/storage/clients/<clientId>/...).
 */
import { db } from '../config/db.js';
import { validateToken, validateClientToken } from './auth.js';

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  return req.query.token || req.headers['x-access-token'] || null;
}

function operatorHasTab(session, tab) {
  if (session.userId === 'USR-MASTER-01' || session.username === 'jorgealvimtecnologia' || session.role === 'master') return true;
  try {
    const perm = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(session.userId);
    return !!(perm && perm[tab]);
  } catch (e) {
    return false;
  }
}

export function requireStorageAccess(kind) {
  const tab = kind === 'drive' ? 'tab_drive' : 'tab_clients';
  return (req, res, next) => {
    const token = extractToken(req);
    const operator = validateToken(token);
    if (operator) {
      if (operatorHasTab(operator, tab)) return next();
      return res.status(403).json({ error: 'Acesso negado a este arquivo.' });
    }

    if (kind === 'clients') {
      const client = validateClientToken(token);
      // req.path aqui é relativo ao mount: "/<clientId>/<arquivo>"
      const folder = decodeURIComponent(req.path.split('/')[1] || '');
      if (client && folder && folder === String(client.clientId)) return next();
      if (client) return res.status(403).json({ error: 'Acesso negado a este arquivo.' });
    }

    return res.status(401).json({ error: 'Faça login para acessar este arquivo.' });
  };
}
