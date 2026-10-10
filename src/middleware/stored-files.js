/**
 * Entrega de arquivos guardados (documentos de clientes e do drive do escritório).
 * Substitui o express.static destas pastas para a leitura ser TRANSPARENTE à criptografia (AUD-12):
 *  - arquivo em texto puro: entregue normalmente (res.sendFile: tipo, cache e Range);
 *  - arquivo cifrado: decifrado em fluxo (a chave vem do cofre); sem chave, devolve erro claro (nunca o conteúdo cifrado).
 * Mantém as proteções: caminho preso à pasta, arquivos ocultos negados, tipos que o navegador executa
 * (html/svg/xml) vão em "sandbox" (sem scripts) e scripts soltos só como download.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDocKey, isEncryptedFile, createDecryptReadStream, plainSizeOf, VaultKeyMissingError } from '../shared/file-vault.js';

const RISKY = /\.(html?|xhtml|svg|xml|js|mjs)$/i;
const TYPES = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

function safeHeaders(res, abs, { download = false, name } = {}) {
  const ext = path.extname(abs).toLowerCase();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  if (RISKY.test(abs)) {
    // Sem permissão de scripts, formulários nem origem própria: o HTML/SVG pode ser LIDO (ex.: certificado de
    // cancelamento de assinatura), mas não executa nada no navegador. Scripts soltos só como download.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    if (/\.(js|mjs)$/i.test(abs)) download = true;
  }
  if (download) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name || path.basename(abs))}`);
  return TYPES[ext] || 'application/octet-stream';
}

/** Envia UM arquivo (cifrado ou não). Usado pelo servidor de arquivos e pelo explorador. */
export function sendStoredFile(req, res, abs, opts = {}) {
  try {
    const type = safeHeaders(res, abs, opts);
    if (!isEncryptedFile(abs)) {
      return res.sendFile(abs, { dotfiles: 'deny', headers: { 'Content-Type': type }, cacheControl: false, etag: false, lastModified: false }, (err) => {
        if (err && !res.headersSent) res.status(err.statusCode || 404).json({ error: 'Arquivo não encontrado.' });
      });
    }
    const key = getDocKey();
    if (!key) throw new VaultKeyMissingError();
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(plainSizeOf(abs)));
    if (req.method === 'HEAD') return res.end();
    const stream = createDecryptReadStream(abs, key);
    stream.on('error', () => res.destroy()); // etiqueta inválida / arquivo adulterado: corta a entrega
    return stream.pipe(res);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    if (e instanceof VaultKeyMissingError) return res.status(503).json({ error: e.message });
    return res.status(404).json({ error: 'Arquivo não encontrado.' });
  }
}

/** Handler para app.use('/storage/...', requireStorageAccess(...), serveStoredFiles(DIR)). */
export function serveStoredFiles(rootDir) {
  const root = path.resolve(rootDir);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return res.status(400).json({ error: 'Caminho inválido.' }); }
    if (rel.includes('\0')) return res.status(400).json({ error: 'Caminho inválido.' });
    const abs = path.resolve(root, `.${rel}`);
    if (abs !== root && !abs.startsWith(root + path.sep)) return res.status(403).json({ error: 'Caminho inválido.' });
    if (abs.split(path.sep).some((p) => p.startsWith('.') && p.length > 1)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    let st;
    try { st = fs.statSync(abs); } catch { return res.status(404).json({ error: 'Arquivo não encontrado.' }); }
    if (!st.isFile()) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    return sendStoredFile(req, res, abs);
  };
}
