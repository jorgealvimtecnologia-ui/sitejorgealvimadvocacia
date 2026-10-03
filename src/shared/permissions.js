/**
 * Permissões efetivas de um operador (módulo puro, sem banco).
 *
 * A matriz tem colunas "legadas" (tab_financial, tab_settings…) e colunas granulares novas
 * (tab_nfse, tab_esign, tab_blog, tab_audit, tab_alerts). Coluna nova NULL = HERDA da legada:
 * assim ninguém ganha nem perde acesso ao atualizar; o mestre passa a poder desligar cada uma.
 *   tab_nfse, tab_esign -> herdam tab_financial
 *   tab_blog, tab_audit -> herdam tab_settings
 *   tab_alerts          -> herda (tab_lawsuits OU tab_calendar): quem trabalha com processos/agenda vê os alertas
 *   tab_dashboard, tab_kanban, tab_tools -> herdam 1 (eram de todos); o mestre pode desligar por pessoa
 */
export const LEGACY_TABS = [
  'tab_leads', 'tab_clients', 'tab_lawsuits', 'tab_radar', 'tab_offices', 'tab_drive', 'tab_calendar',
  'tab_publications', 'tab_hr', 'tab_financial', 'tab_colaborador', 'tab_portal_cliente', 'tab_users', 'tab_settings'
];
export const GRANULAR_TABS = ['tab_nfse', 'tab_esign', 'tab_blog', 'tab_audit', 'tab_alerts', 'tab_dashboard', 'tab_kanban', 'tab_tools'];
export const ALL_TABS = [...LEGACY_TABS, ...GRANULAR_TABS];

const INHERIT = {
  tab_nfse: (r) => r.tab_financial,
  tab_esign: (r) => r.tab_financial,
  tab_blog: (r) => r.tab_settings,
  tab_audit: (r) => r.tab_settings,
  tab_alerts: (r) => (r.tab_lawsuits ? 1 : r.tab_calendar ? 1 : 0),
  // Visão Geral, Kanban e Ferramentas (editor/calculadora) sempre foram de todos: herdam "liberado" até o mestre desligar
  tab_dashboard: () => 1,
  tab_kanban: () => 1,
  tab_tools: () => 1
};

/** @returns {Record<string, 0|1>} todas as abas (legadas + granulares) já resolvidas. */
export function effectivePerms(row) {
  const r = row || {};
  const out = {};
  // Sem linha de permissão, ou perfil "sem_perfil" (papel não reconhecido): NADA liberado (nem a herança "liberado").
  if (!row || r.role_template === 'sem_perfil') {
    for (const k of ALL_TABS) out[k] = 0;
    return out;
  }
  for (const k of LEGACY_TABS) out[k] = r[k] ? 1 : 0;
  for (const k of GRANULAR_TABS) out[k] = (r[k] === null || r[k] === undefined ? INHERIT[k](r) : r[k]) ? 1 : 0;
  return out;
}

/** O operador tem a aba `key`? (resolve a herança) */
export function hasTab(row, key) {
  return effectivePerms(row)[key] === 1;
}
