/**
 * RBAC central do backend — FECHADO POR PADRÃO (deny-by-default).
 *
 * Toda rota /api é NEGADA, a menos que se encaixe em uma regra abaixo. Cada regra diz
 * QUEM pode acessar. Antes, o que não estava mapeado passava direto — por isso uma sessão
 * do portal do colaborador alcançava clientes, financeiro e até o backup do banco.
 * Agora, o que não está explicitamente liberado responde 403.
 *
 * Uma regra é [regex, perfil] ou [regex, perfil, [MÉTODOS]] (a regra só vale para esses
 * métodos HTTP). A PRIMEIRA regra cujo caminho — e método, se houver — casa decide.
 */
import { db } from '../config/db.js';
import { hasTab } from '../shared/permissions.js';
import { validateToken, validateClientToken, validateEmployeeToken } from './auth.js';

import { PUBLIC, ANY, CLIENT, EMPLOYEE, PANEL, PANEL_OR_EMPLOYEE, MASTER, RULES } from './rbac-rules.js';

// Reexporta os perfis e a consulta de regras (quem já importava de rbac.js continua funcionando).
export { PUBLIC, ANY, CLIENT, EMPLOYEE, PANEL, PANEL_OR_EMPLOYEE, MASTER, RULES, ruleFor } from './rbac-rules.js';


function tokenOf(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.substring(7) : (req.query.token || req.headers['x-access-token'] || null);
}

export function isMasterSession(s) {
  return !!s && (s.userId === 'USR-MASTER-01' || s.username === 'jorgealvimtecnologia' || s.role === 'master');
}

/** Operador suspenso na Matriz de Acessos (is_active = 0): perde TODO acesso ao painel, mesmo com sessão já aberta. */
function isSuspended(userId) {
  try {
    const p = db.prepare(`SELECT is_active FROM access_permissions WHERE user_id = ?`).get(userId);
    return !!p && p.is_active === 0;
  } catch (e) {
    return false;
  }
}

function operatorHasTab(s, tabKey) {
  if (isMasterSession(s)) return true;
  try {
    const perm = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(s.userId);
    return !!(perm && hasTab(perm, tabKey));
  } catch (e) {
    return false;
  }
}

const deny = (res, msg) => res.status(403).json({ error: msg || 'Acesso negado para o seu perfil.' });
const needLogin = (res) => res.status(401).json({ error: 'Faça login para acessar este recurso.' });

export function rbacGuard(req, res, next) {
  try {
    if (!req.path.startsWith('/api/')) return next();

    const rule = RULES.find(r => r[0].test(req.path) && (!r[2] || r[2].includes(req.method)));
    if (!rule) {
      console.warn('[RBAC] Rota /api sem regra (negada por padrão):', req.method, req.path);
      return deny(res, 'Recurso não disponível para o seu perfil.');
    }
    const need = rule[1];
    if (need === PUBLIC) return next();

    const token = tokenOf(req);
    const panel = validateToken(token);
    const client = panel ? null : validateClientToken(token);
    const employee = panel || client ? null : validateEmployeeToken(token);
    if (!panel && !client && !employee) return needLogin(res);

    // Suspenso na matriz = sem acesso a NADA do painel, nem com sessão aberta antes da suspensão.
    if (panel && !isMasterSession(panel) && isSuspended(panel.userId)) {
      return deny(res, 'Seu perfil de operador está desativado na Matriz de Controle de Acesso. Contate a administração.');
    }

    if (need === ANY) return next();
    if (need === CLIENT) return client ? next() : deny(res);
    if (need === EMPLOYEE) return employee ? next() : deny(res);
    if (need === PANEL) return panel ? next() : deny(res);
    if (need === PANEL_OR_EMPLOYEE) return (panel || employee) ? next() : deny(res);
    if (need === MASTER) return isMasterSession(panel) ? next() : deny(res, 'Ação restrita ao Usuário Mestre.');
    if (need && need.panelTab) {
      if (!panel) return deny(res);
      return operatorHasTab(panel, need.panelTab) ? next() : deny(res, 'Seu perfil não tem permissão para este módulo.');
    }
    return deny(res);
  } catch (e) {
    console.error('[RBAC] Falha na verificação de permissão:', e.message);
    return res.status(500).json({ error: 'Falha ao verificar permissões de acesso.' });
  }
}
