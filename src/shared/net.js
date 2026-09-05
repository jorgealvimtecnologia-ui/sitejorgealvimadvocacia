/**
 * Utilitários de rede compartilhados.
 */

// Extração segura do IP do cliente.
// Com a Cloudflare na frente, o IP real vem em `CF-Connecting-IP` (o x-forwarded-for
// passa a conter o IP da CF). Só confiamos nesse cabeçalho quando TRUST_CLOUDFLARE=1
// no .env — senão um cliente poderia forjá-lo.
export function getClientIp(req) {
  if (!req) return '127.0.0.1';
  if (process.env.TRUST_CLOUDFLARE === '1') {
    const cf = req.headers['cf-connecting-ip'];
    if (cf) return String(cf).trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map((s) => s.trim());
    if (ips[0]) return ips[0];
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}
