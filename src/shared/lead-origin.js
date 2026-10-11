/**
 * Origem do lead (AUD-17): classifica de onde veio o contato a partir de UTM e do domínio de referência.
 * Só guardamos o DOMÍNIO de quem indicou (nunca a URL completa, que pode ter dados pessoais).
 */
export const ORIGINS = ['Google Ads', 'Busca na internet', 'Meta Ads', 'Instagram / Facebook', 'WhatsApp', 'E-mail', 'Site ou blog de terceiros', 'Direto / não identificado', 'Outra campanha'];
export const UNKNOWN_ORIGIN = 'Não informado';

const clean = (v, max = 80) => String(v ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N} _.\-:/]/gu, '').slice(0, max);

/** Domínio (sem "www.") de uma URL ou host; '' se inválido. */
export function hostOf(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

const OWN_HOSTS = /(^|\.)jorgealvimadvocacia\.com\.br$/;

/**
 * @param {{utm_source?:string, utm_medium?:string, utm_campaign?:string, referrer?:string}} a
 * @returns {{origin:string, detail:string}}
 */
export function classifyOrigin(a = {}) {
  const source = clean(a.utm_source);
  const medium = clean(a.utm_medium);
  const campaign = clean(a.utm_campaign, 60);
  const ref = hostOf(a.referrer);
  const paid = /^(cpc|ppc|paid|paidsearch|paid_social|paidsocial|display|ads?)$/.test(medium);
  const detail = [source && `utm_source=${source}`, medium && `utm_medium=${medium}`, campaign && `utm_campaign=${campaign}`, ref && `ref=${ref}`].filter(Boolean).join('; ');

  if (source) {
    if (/google|adwords|gads/.test(source)) return { origin: paid ? 'Google Ads' : 'Busca na internet', detail };
    if (/facebook|instagram|meta|^fb$|^ig$/.test(source)) return { origin: paid ? 'Meta Ads' : 'Instagram / Facebook', detail };
    if (/whats/.test(source)) return { origin: 'WhatsApp', detail };
    if (/e-?mail|newsletter/.test(source)) return { origin: 'E-mail', detail };
    return { origin: 'Outra campanha', detail };
  }
  if (!ref || OWN_HOSTS.test(ref)) return { origin: 'Direto / não identificado', detail };
  if (/(^|\.)google\.[a-z.]+$/.test(ref)) return { origin: 'Busca na internet', detail };
  if (/(^|\.)(bing|duckduckgo|yahoo|ecosia|brave)\./.test(ref)) return { origin: 'Busca na internet', detail: `${detail}` };
  if (/(facebook|instagram|fb)\.(com|me)$|(^|\.)l\.instagram\.com$|(^|\.)lm\.facebook\.com$/.test(ref)) return { origin: 'Instagram / Facebook', detail };
  if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(ref)) return { origin: 'WhatsApp', detail };
  return { origin: 'Site ou blog de terceiros', detail };
}
