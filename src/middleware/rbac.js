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
import { validateToken, validateClientToken, validateEmployeeToken } from './auth.js';

// Perfis
export const PUBLIC = 'public';                 // sem login (site, captação, webhooks, consulta CEP/CNPJ)
export const ANY = 'any';                       // qualquer sessão válida
export const CLIENT = 'client';                 // sessão do portal do cliente
export const EMPLOYEE = 'employee';             // sessão do portal do colaborador
export const PANEL = 'panel';                   // operador do painel (mestre ou usuário)
export const PANEL_OR_EMPLOYEE = 'panel_emp';   // painel OU colaborador (ex.: despachos/foguetes)
export const MASTER = 'master';                 // só o mestre
const tab = (t) => ({ panelTab: t });           // operador do painel COM a aba `t` (mestre sempre passa)

const RULES = [
  // ---- Público (sem login) ----
  [/^\/api\/health\b/, PUBLIC],
  [/^\/api\/auth\/(login|logout|google|unified-google|forgot-password|reset-password|google-config)\b/, PUBLIC],
  [/^\/api\/client-portal\/(login|register|forgot-password|reset-password|auth\/google)\b/, PUBLIC],
  [/^\/api\/hr\/(employee|portal)\/(login|google|auth\/google)\b/, PUBLIC],
  [/^\/api\/(site|lookup|webhooks)\//, PUBLIC],
  [/^\/api\/blog\/posts\/[^/]+\/(comments|like|share)\b/, PUBLIC],
  [/^\/api\/blog\/track-click\b/, PUBLIC],
  [/^\/api\/blog\/(posts|categories)\b/, PUBLIC, ['GET']],
  [/^\/api\/esign\/(public|verify)\//, PUBLIC],
  [/^\/api\/esign\/requests\/[^/]+\/chancelado\b/, PUBLIC],
  [/^\/api\/client-portal\/magic-(info|upload)\//, PUBLIC],
  [/^\/api\/faq\b/, PUBLIC],
  [/^\/api\/visits\//, PUBLIC],
  [/^\/api\/analytics\/(event|consent)\b/, PUBLIC],
  [/^\/api\/lgpd\/request\b/, PUBLIC, ['POST']],
  [/^\/api\/leads\/?$/, PUBLIC, ['POST']],            // captação de leads pelo site (só POST)
  [/^\/api\/agent\/roadmap/, PUBLIC],                 // API dos agentes: tem chave própria (X-Roadmap-Agent-Key)

  // ---- Portais (só o próprio titular logado) ----
  [/^\/api\/client-portal\/magic-link\b/, PANEL],   // painel gera o link de upload para o cliente
  [/^\/api\/client-portal\//, CLIENT],
  [/^\/api\/hr\/reports\/annual-financial\/employee\//, EMPLOYEE],
  [/^\/api\/hr\/(employee|portal)\//, EMPLOYEE],

  // ---- Compartilhado painel + colaborador (despachos/foguetes) ----
  [/^\/api\/rockets(\/|$)/, PANEL_OR_EMPLOYEE],

  // ---- Qualquer sessão logada ----
  [/^\/api\/auth\/(me|unlock)\b/, ANY],
  [/^\/api\/notifications(\/|$)/, PANEL],
  [/^\/api\/access-control\/my-permissions\b/, ANY],

  // ---- Só o mestre (administração sensível) ----
  [/^\/api\/admin\/backup(\/|$)/, MASTER],
  [/^\/api\/admin\/(restore|wipe|reset|export)/, MASTER],
  [/^\/api\/access-control\/(toggle|apply-template|toggle-user-status|matrix)\b/, MASTER],
  [/^\/api\/users(\/|$)/, MASTER],
  [/^\/api\/admin\/roadmap(\/|$)/, MASTER],
  [/^\/api\/admin\/qa(\/|$)/, MASTER],
  [/^\/api\/admin\/relatorios(\/|$)/, MASTER],
  [/^\/api\/lgpd(\/|$)/, MASTER],

  // ---- Módulos do painel controlados pela matriz de permissões (mestre sempre) ----
  [/^\/api\/clients(\/|$)/, tab('tab_clients')],
  [/^\/api\/leads(\/|$)/, tab('tab_leads')],
  [/^\/api\/lawsuits(\/|$)/, tab('tab_lawsuits')],
  [/^\/api\/(court|publications)(\/|$)/, tab('tab_publications')],
  [/^\/api\/calendar(\/|$)/, tab('tab_calendar')],
  [/^\/api\/(financial|nfse|esign|signatures)(\/|$)/, tab('tab_financial')],
  [/^\/api\/hr(\/|$)/, tab('tab_hr')],
  [/^\/api\/drive(\/|$)/, tab('tab_drive')],
  [/^\/api\/offices(\/|$)/, tab('tab_offices')],
  [/^\/api\/(judicial|juridico)(\/|$)/, tab('tab_radar')],
  [/^\/api\/(admin-requests|adminrequests)(\/|$)/, tab('tab_lawsuits')],
  [/^\/api\/(meta-ads|explorer)(\/|$)/, tab('tab_settings')],

  // ---- Demais rotas do painel: qualquer operador logado ----
  [/^\/api\/(dashboard|kanban|sync|admin|blog|site-content|maintenance|legaltech|legal-docs|ai|analytics|audit)(\/|$)/, PANEL]
];

function tokenOf(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.substring(7) : (req.query.token || req.headers['x-access-token'] || null);
}

export function isMasterSession(s) {
  return !!s && (s.userId === 'USR-MASTER-01' || s.username === 'jorgealvimtecnologia' || s.role === 'master');
}

function operatorHasTab(s, tabKey) {
  if (isMasterSession(s)) return true;
  try {
    const perm = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(s.userId);
    return !!(perm && perm[tabKey]);
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
