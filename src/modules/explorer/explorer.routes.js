/**
 * Módulo EXPLORER — gerenciador de arquivos estilo Windows (sandbox em /storage).
 * Extraído do server.js. Proteção contra path traversal via expResolve().
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../middleware/auth.js';
import { ROOT_DIR } from '../../config/constants.js';

export const explorerRouter = express.Router();

const EXPLORER_ROOT = path.join(ROOT_DIR, 'storage');
try { fs.mkdirSync(EXPLORER_ROOT, { recursive: true }); } catch (e) {}
function expResolve(rel) {
  rel = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const abs = path.resolve(EXPLORER_ROOT, rel);
  if (abs !== EXPLORER_ROOT && !abs.startsWith(EXPLORER_ROOT + path.sep)) throw new Error('Caminho inválido.');
  return abs;
}
function expRel(abs) { return abs === EXPLORER_ROOT ? '' : path.relative(EXPLORER_ROOT, abs).split(path.sep).join('/'); }
const expBadName = (n) => !n || /[\\/]/.test(n) || n === '.' || n === '..' || n.length > 120;

explorerRouter.get('/api/explorer/list', requireAuth, (req, res) => {
  try {
    const dir = expResolve(req.query.path || '');
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return res.status(400).json({ error: 'Pasta não encontrada.' });
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map(d => {
      const abs = path.join(dir, d.name); let s = {}; try { s = fs.statSync(abs); } catch (e) {}
      return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', size: d.isDirectory() ? 0 : (s.size || 0), mtime: s.mtimeMs || 0, path: expRel(abs) };
    }).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
    return res.json({ success: true, path: expRel(dir), parent: dir === EXPLORER_ROOT ? null : expRel(path.dirname(dir)), entries });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});
explorerRouter.post('/api/explorer/mkdir', requireAuth, (req, res) => {
  try { const { path: p, name } = req.body || {}; if (expBadName(name)) return res.status(400).json({ error: 'Nome inválido.' });
    const dir = expResolve((p || '') + '/' + name); if (fs.existsSync(dir)) return res.status(400).json({ error: 'Já existe uma pasta com esse nome.' });
    fs.mkdirSync(dir, { recursive: false }); return res.json({ success: true, path: expRel(dir) });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});
explorerRouter.post('/api/explorer/rename', requireAuth, (req, res) => {
  try { const { path: p, newName } = req.body || {}; if (expBadName(newName)) return res.status(400).json({ error: 'Nome inválido.' });
    const src = expResolve(p); if (src === EXPLORER_ROOT) return res.status(400).json({ error: 'Operação não permitida na raiz.' });
    const dst = path.join(path.dirname(src), newName); if (fs.existsSync(dst)) return res.status(400).json({ error: 'Já existe um item com esse nome.' });
    fs.renameSync(src, dst); return res.json({ success: true, path: expRel(dst) });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});
explorerRouter.post('/api/explorer/move', requireAuth, (req, res) => {
  try { const { path: p, dest } = req.body || {}; const src = expResolve(p); if (src === EXPLORER_ROOT) return res.status(400).json({ error: 'Operação não permitida na raiz.' });
    const destDir = expResolve(dest || ''); if (!fs.statSync(destDir).isDirectory()) return res.status(400).json({ error: 'Destino inválido.' });
    const dst = path.join(destDir, path.basename(src));
    if (dst === src) return res.json({ success: true, path: expRel(dst) });
    if (dst.startsWith(src + path.sep)) return res.status(400).json({ error: 'Não é possível mover uma pasta para dentro dela mesma.' });
    if (fs.existsSync(dst)) return res.status(400).json({ error: 'Já existe um item com esse nome no destino.' });
    fs.renameSync(src, dst); return res.json({ success: true, path: expRel(dst) });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});
explorerRouter.delete('/api/explorer/delete', requireAuth, (req, res) => {
  try { const p = (req.body && req.body.path) || req.query.path; const abs = expResolve(p);
    if (abs === EXPLORER_ROOT) return res.status(400).json({ error: 'Operação não permitida na raiz.' });
    fs.rmSync(abs, { recursive: true, force: true }); return res.json({ success: true });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});
explorerRouter.get('/api/explorer/download', requireAuth, (req, res) => {
  try { const abs = expResolve(req.query.path); if (fs.statSync(abs).isDirectory()) return res.status(400).json({ error: 'Não é possível baixar uma pasta.' });
    return res.download(abs);
  } catch (e) { return res.status(400).json({ error: e.message }); }
});
