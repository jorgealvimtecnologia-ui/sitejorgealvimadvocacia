/**
 * Rotas dos testes físicos do site (aba "🧪 Testes Físicos" do Roadmap Vivo). Só o mestre.
 */
import express from 'express';
import { requireMaster } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { ensureQaTables, getQaOverview, getDayItems, recordResult, updateSettings } from './qa.service.js';

export const qaRouter = express.Router();

try {
  ensureQaTables();
} catch (e) {
  console.error('[QA] Erro ao inicializar tabelas de testes físicos:', e);
}

function actorOf(req) {
  return req.user?.username || req.user?.name || 'construtor';
}

// Painel do dia: hoje, atrasados, falhas e cronograma
qaRouter.get('/api/admin/qa', requireMaster, (req, res) => {
  try {
    return res.json({ success: true, ...getQaOverview(new Date(), { includeAll: req.query.all === '1' }) });
  } catch (err) {
    console.error('[QA] Erro ao montar o painel de testes:', err);
    return res.status(500).json({ error: 'Erro ao carregar os testes físicos.' });
  }
});

// Itens de um dia do cronograma
qaRouter.get('/api/admin/qa/day/:number', requireMaster, (req, res) => {
  const day = getDayItems(req.params.number);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado no cronograma.' });
  return res.json({ success: true, day });
});

// Registra o resultado de um teste: ok | falhou (com observação) | refazer
qaRouter.post('/api/admin/qa/results', requireMaster, (req, res) => {
  const r = recordResult(req.body || {}, actorOf(req));
  if (r.error) return res.status(400).json({ error: r.error });
  if (req.body.result === 'falhou') {
    logAudit(req, {
      event_type: 'QA',
      event_name: 'TESTE_FISICO_FALHOU',
      module: 'ROADMAP_VIVO',
      resource_id: req.body.item_id,
      user_name: req.user?.name,
      user_role: req.user?.role,
      description: `Teste físico ${req.body.item_id} falhou: ${String(req.body.note || '').slice(0, 200)}`
    });
  }
  return res.json({ success: true });
});

// Reprograma o cronograma (data de início e quantidade por dia)
qaRouter.post('/api/admin/qa/settings', requireMaster, (req, res) => {
  const r = updateSettings(req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  return res.json({ success: true, settings: r.value });
});
