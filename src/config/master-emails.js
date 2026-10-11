/**
 * CONTAS GOOGLE MESTRAS — fonte única da verdade.
 *
 * Quem entra com Google por um destes e-mails é o USUÁRIO MESTRE (acesso irrestrito). A lista
 * fica NO CÓDIGO, e não numa variável de ambiente, de propósito: ninguém passa a ser mestre
 * por uma configuração do servidor. Mudar esta lista exige mudar o código E o guardião
 * (scripts/check-rbac-guard.js), ou seja, é uma decisão revisada.
 *
 * O e-mail só chega aqui depois de verifyGoogleToken confirmar o token com o Google, o
 * destinatário (aud) e o e-mail verificado (src/shared/google-auth.js).
 */
export const MASTER_EMAILS = Object.freeze([
  'jorgealvimtecnologia@gmail.com',
  'jorgealvim10@gmail.com',
  'jorgealvimadvocacia@gmail.com'
]);

/** True se o e-mail (já verificado pelo Google) é de uma conta mestra. */
export function isMasterEmail(email) {
  return MASTER_EMAILS.includes(String(email || '').toLowerCase().trim());
}

// A variável antiga não vale mais: avisa, em vez de ignorar em silêncio.
if (process.env.GOOGLE_ADMIN_EMAILS && process.env.NODE_ENV !== 'test') {
  console.warn('[MESTRES] GOOGLE_ADMIN_EMAILS foi IGNORADA: as contas mestras ficam em src/config/master-emails.js (decisão revisada, não configuração).');
}
