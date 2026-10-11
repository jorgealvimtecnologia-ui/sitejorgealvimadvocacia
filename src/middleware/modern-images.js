/**
 * Imagens em formato moderno (AUD-19): se existir um irmão .webp/.avif de uma imagem PNG/JPG e o navegador aceitar,
 * entrega o arquivo menor (mesma URL, sem mexer no HTML). Quem não aceita (ou robôs de pré-visualização do
 * WhatsApp/Facebook/Google) continua recebendo o original. `Vary: Accept` mantém caches corretos.
 */
import fs from 'node:fs';
import path from 'node:path';

const ORIGINAL = /\.(png|jpe?g)$/i;

export function modernImages(rootDir, { maxAge = 7 * 24 * 3600 } = {}) {
  const root = path.resolve(rootDir);
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !ORIGINAL.test(req.path)) return next();
    const accept = String(req.headers.accept || '');
    const wantsAvif = /image\/avif/.test(accept);
    const wantsWebp = /image\/webp/.test(accept);
    if (!wantsAvif && !wantsWebp) return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    const base = path.resolve(root, `.${rel}`.replace(ORIGINAL, ''));
    if (!base.startsWith(root + path.sep)) return next();
    for (const [ok, ext, type] of [[wantsAvif, 'avif', 'image/avif'], [wantsWebp, 'webp', 'image/webp']]) {
      const file = `${base}.${ext}`;
      if (ok && fs.existsSync(file)) {
        res.setHeader('Vary', 'Accept');
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
        return res.sendFile(file, { dotfiles: 'deny' }, (err) => { if (err && !res.headersSent) next(); });
      }
    }
    return next();
  };
}
