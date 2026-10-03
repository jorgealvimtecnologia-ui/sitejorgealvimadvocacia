/**
 * REGRAS de RBAC (puras: sem banco, sem efeitos colaterais). Ficam num módulo à parte para o
 * guardião (scripts/check-rbac-guard.js) poder conferir que TODA rota /api tem uma regra sem
 * precisar abrir o banco de dados. A aplicação das regras está em rbac.js.
 *
 * FECHADO POR PADRÃO (deny-by-default): rota /api sem regra aqui é NEGADA.
 * Uma regra é [regex, perfil] ou [regex, perfil, [MÉTODOS]]; a PRIMEIRA que casa decide.
 */
// Perfis
export const PUBLIC = 'public';                 // sem login (site, captação, webhooks, consulta CEP/CNPJ)
export const ANY = 'any';                       // qualquer sessão válida
export const CLIENT = 'client';                 // sessão do portal do cliente
export const EMPLOYEE = 'employee';             // sessão do portal do colaborador
export const PANEL = 'panel';                   // operador do painel (mestre ou usuário)
export const PANEL_OR_EMPLOYEE = 'panel_emp';   // painel OU colaborador (ex.: despachos/foguetes)
export const MASTER = 'master';                 // só o mestre
const tab = (t) => ({ panelTab: t });           // operador do painel COM a aba `t` (mestre sempre passa)

export const RULES = [
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
  [/^\/api\/recaptcha\//, PUBLIC],                    // configuração pública do reCAPTCHA
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
  // Alertas de prazo por WhatsApp/e-mail: confirmar ciência = operador logado (o servidor exige que seja advogado
  // cadastrado ou o mestre); todo o resto (config, preferências, log, execução) = só o mestre.
  [/^\/api\/deadline-alerts\/ack\b/, PANEL],
  [/^\/api\/deadline-alerts(\/|$)/, MASTER],
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
  [/^\/api\/ocr(\/|$)/, tab('tab_clients')],   // OCR zero-digitação alimenta o cadastro de clientes
  [/^\/api\/leads(\/|$)/, tab('tab_leads')],
  [/^\/api\/lawsuits(\/|$)/, tab('tab_lawsuits')],
  [/^\/api\/(court|publications)(\/|$)/, tab('tab_publications')],
  [/^\/api\/calendar(\/|$)/, tab('tab_calendar')],
  [/^\/api\/documents(\/|$)/, tab('tab_lawsuits')],   // gerador de peças/procurações: mesma permissão da aba Documentos do painel
  [/^\/api\/(financial|nfse|esign|signatures)(\/|$)/, tab('tab_financial')],
  [/^\/api\/hr(\/|$)/, tab('tab_hr')],
  [/^\/api\/drive(\/|$)/, tab('tab_drive')],
  [/^\/api\/offices(\/|$)/, tab('tab_offices')],
  [/^\/api\/(judicial|juridico)(\/|$)/, tab('tab_radar')],
  [/^\/api\/(admin-requests|adminrequests)(\/|$)/, tab('tab_lawsuits')],
  [/^\/api\/(meta-ads|explorer)(\/|$)/, tab('tab_settings')],

  // ---- Administração do site e do sistema: a MESMA aba que libera o menu libera a API ----
  // (antes, /api/admin/* era "qualquer operador logado": o menu escondia a aba, mas o servidor deixava uma
  // secretária ler a auditoria, editar o blog/FAQ, baixar backups ou colocar o sistema em manutenção)
  [/^\/api\/admin\/maintenance(\/|$)/, MASTER],                       // manutenção, sessões, backups, VACUUM, modo manutenção
  [/^\/api\/admin\/(audit-logs|blog|site|whatsapp)(\/|$)/, tab('tab_settings')],
  [/^\/api\/admin\/(pre-clients|visits)(\/|$)/, tab('tab_leads')],      // aba "Tráfego & Acessos"

  // ---- Demais rotas do painel: qualquer operador logado ----
  [/^\/api\/(dashboard|kanban|sync|site-content|legaltech|legal-docs|ai|analytics|audit)(\/|$)/, PANEL]
];

/** Regra de RBAC que decide um caminho/método (a primeira que casa), ou undefined se não houver (=> negado). */
export function ruleFor(reqPath, method = 'GET') {
  return RULES.find((r) => r[0].test(reqPath) && (!r[2] || r[2].includes(method)));
}
