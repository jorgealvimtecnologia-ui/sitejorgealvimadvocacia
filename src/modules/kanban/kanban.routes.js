/**
 * Módulo KANBAN — Fluxo de Trabalho 5W2H (quadro visual com WIP e prioridade).
 * Extraído do server.js para provar o padrão modular (routers por domínio).
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { validateBody } from '../../shared/validate.js';

export const kanbanRouter = express.Router();

db.exec(`CREATE TABLE IF NOT EXISTS kanban_cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  column_key TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'normal',
  w_what TEXT, w_why TEXT, w_where TEXT, w_when TEXT, w_who TEXT, h_how TEXT, h_howmuch TEXT,
  deadline TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
)`);

kanbanRouter.get('/api/kanban', requireAuth, (req, res) => {
  try {
    const cards = db.prepare(`SELECT * FROM kanban_cards ORDER BY order_index ASC, created_at ASC`).all();
    return res.json({ success: true, cards });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

kanbanRouter.post('/api/kanban', requireAuth, validateBody({
  title: { required: true, trim: true, max: 300, label: 'Título' },
  column_key: { trim: true, default: 'todo' },
  priority: { trim: true, default: 'normal' }
}), (req, res) => {
  try {
    const b = req.body || {}; const v = req.valid; const now = new Date().toISOString();
    const id = 'KAN-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    db.prepare(`INSERT INTO kanban_cards (id,title,column_key,priority,w_what,w_why,w_where,w_when,w_who,h_how,h_howmuch,deadline,order_index,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, v.title, v.column_key, v.priority,
      b.w_what || '', b.w_why || '', b.w_where || '', b.w_when || '', b.w_who || '', b.h_how || '', b.h_howmuch || '',
      b.deadline || '', Date.now(), now, now);
    logAudit(req, { event_type: 'CRIACAO', event_name: 'CRIAR_CARTAO_KANBAN', module: 'KANBAN', resource_id: id, description: `Novo cartão Kanban: ${v.title.slice(0, 80)}` });
    return res.json({ success: true, id });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

kanbanRouter.put('/api/kanban/:id', requireAuth, (req, res) => {
  try {
    const b = req.body || {}; const ex = db.prepare(`SELECT * FROM kanban_cards WHERE id=?`).get(req.params.id);
    if (!ex) return res.status(404).json({ error: 'Cartão não encontrado.' });
    const pick = (k) => (b[k] !== undefined ? b[k] : ex[k]);
    db.prepare(`UPDATE kanban_cards SET title=?,column_key=?,priority=?,w_what=?,w_why=?,w_where=?,w_when=?,w_who=?,h_how=?,h_howmuch=?,deadline=?,order_index=?,updated_at=? WHERE id=?`).run(
      pick('title'), pick('column_key'), pick('priority'), pick('w_what'), pick('w_why'), pick('w_where'), pick('w_when'),
      pick('w_who'), pick('h_how'), pick('h_howmuch'), pick('deadline'), pick('order_index'), new Date().toISOString(), req.params.id);
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

kanbanRouter.delete('/api/kanban/:id', requireAuth, (req, res) => {
  try { db.prepare(`DELETE FROM kanban_cards WHERE id=?`).run(req.params.id); return res.json({ success: true }); }
  catch (e) { return res.status(500).json({ error: e.message }); }
});
