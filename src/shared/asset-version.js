/**
 * Versão automática dos scripts/estilos nas páginas (cache-busting por deploy).
 *
 * O Cloudflare força "Cache-Control: max-age=14400" nos .js/.css, então o navegador
 * guardava a versão antiga por até 4h depois de cada publicação (e os ?v= fixos no
 * HTML nunca mudavam). Aqui, ao entregar cada página, trocamos/acrescentamos ?v=<ASSET_VERSION>
 * nos arquivos locais. ASSET_VERSION muda a cada reinício do servidor (todo deploy reinicia).
 */
import fs from 'node:fs';

export const ASSET_VERSION = (process.env.ASSET_VERSION || Date.now().toString(36)).replace(/[^a-zA-Z0-9._-]/g, '');

// src/href de arquivos locais .js/.css em /js, /public/js ou /public/css (com ou sem ?v= antigo)
const LOCAL_ASSET_RE = /((?:src|href)=["'])(\/(?:js|public\/js|public\/css)\/[^"'?#]+\.(?:js|css))(?:\?[^"'#]*)?(["'])/g;

export function versionAssets(html) {
  return String(html).replace(LOCAL_ASSET_RE, (_m, pre, url, quote) => `${pre}${url}?v=${ASSET_VERSION}${quote}`);
}

const cache = new Map(); // arquivo -> { mtimeMs, html }

/** Lê a página, aplica a versão nos assets e guarda em memória até o arquivo mudar. */
export function readVersionedHtml(filePath) {
  const stat = fs.statSync(filePath);
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.html;
  const html = versionAssets(fs.readFileSync(filePath, 'utf8'));
  cache.set(filePath, { mtimeMs: stat.mtimeMs, html });
  return html;
}
