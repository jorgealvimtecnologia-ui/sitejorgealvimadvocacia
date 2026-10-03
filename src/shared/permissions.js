/**
 * Permissões efetivas de um operador (módulo puro, sem banco).
 *
 * A matriz tem colunas "legadas" (tab_financial, tab_settings…) e colunas granulares novas
 * (tab_nfse, tab_esign, tab_blog, tab_audit, tab_alerts). Coluna nova NULL = HERDA da legada:
 * assim ninguém ganha nem perde acesso ao atualizar; o mestre passa a poder desligar cada uma.
 *   tab_nfse, tab_esign -> herdam tab_financial
 *   tab_blog, tab_audit -> herdam tab_settings
 *   tab_alerts          -> herda (tab_lawsuits OU tab_calendar): quem trabalha com processos/agenda vê os alertas
 */
export const LEGACY_TABS = [
  'tab_leads', 'tab_clients', 'tab_lawsuits', 'tab_radar', 'tab_offices', 'tab_drive', 'tab_calendar',
  'tab_publications', 'tab_hr', 'tab_financial', 'tab_colaborador', 'tab_portal_cliente', 'tab_users', 'tab_settings'
];
export const GRANULAR_TABS = ['tab_nfse', 'tab_esign', 'tab_blog', 'tab_audit', 'tab_alerts'];
export const ALL_TABS = [...LEGACY_TABS, ...GRANULAR_TABS];

const INHERIT = {
  tab_nfse: (r) => r.tab_financial,
  tab_esign: (r) => r.tab_financial,
  tab_blog: (r) => r.tab_settings,
  tab_audit: (r) => r.tab_settings,
  tab_alerts: (r) => (r.tab_lawsuits ? 1 : r.tab_calendar ? 1 : 0)
};

/** @returns {Record<string, 0|1>} todas as abas (legadas + granulares) já resolvidas. */
export function effectivePerms(row) {
  const r = row || {};
  const out = {};
  for (const k of LEGACY_TABS) out[k] = r[k] ? 1 : 0;
  for (const k of GRANULAR_TABS) out[k] = (r[k] === null || r[k] === undefined ? INHERIT[k](r) : r[k]) ? 1 : 0;
  return out;
}

/** O operador tem a aba `key`? (resolve a herança) */
export function hasTab(row, key) {
  return effectivePerms(row)[key] === 1;
}
