/**
 * API dos agentes de IA (Claude, Antigravity) para o Roadmap Vivo.
 *
 * Autenticação por chave própria (cabeçalho X-Roadmap-Agent-Key), SEM senha do mestre.
 * O servidor guarda só o SHA-256 da chave (ROADMAP_AGENT_KEY_SHA256 no .env).
 * Escopo mínimo: ler ordens/histórico, atualizar status com nota, registrar pendências
 * e importar ordens de bancos locais. Nenhum acesso a clientes, processos ou financeiro.
 */
import express from 'express';
import crypto from 'node:crypto';
import { logAudit } from '../../middleware/audit.js';
import {
  validateOrderInput, cleanActor, isValidOrderId, getOrder, listOrders, listHistory,
  getOrdersSummary, createOrder, updateOrder, importOrders, OPEN_STATUSES
} from './roadmap.orders.js';
import { getQaSummaryForAgents } from '../qa/qa.service.js';

export const roadmapAgentRouter = express.Router();

const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { n, first }

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function requireAgentKey(req, res, next) {
  const expected = String(process.env.ROADMAP_AGENT_KEY_SHA256 || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return res.status(503).json({ error: 'Acesso de agentes ao Roadmap Vivo não configurado no servidor.' });
  }
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let f = failures.get(ip);
  if (f && now - f.first > FAIL_WINDOW_MS) { failures.delete(ip); f = null; }
  if (f && f.n >= FAIL_LIMIT) {
    return res.status(429).json({ error: 'Muitas tentativas com chave inválida. Aguarde 15 minutos.' });
  }
  const key = String(req.headers['x-roadmap-agent-key'] || '');
  const ok = key.length >= 32 && crypto.timingSafeEqual(Buffer.from(sha256Hex(key), 'hex'), Buffer.from(expected, 'hex'));
  if (!ok) {
    failures.set(ip, { n: (f ? f.n : 0) + 1, first: f ? f.first : now });
    return res.status(401).json({ error: 'Chave de agente inválida.' });
  }
  failures.delete(ip);
  req.agentName = cleanActor(req.headers['x-roadmap-agent'], 'agente-ia');
  next();
}

function audit(req, event_name, resource_id, description) {
  logAudit(req, {
    event_type: 'ROADMAP',
    event_name,
    module: 'ROADMAP_VIVO',
    resource_id,
    user_name: req.agentName,
    user_role: 'agente-ia',
    description
  });
}

// Painel resumido para o agente: resumo + ordens abertas/concluídas + histórico recente
roadmapAgentRouter.get('/api/agent/roadmap', requireAgentKey, (req, res) => {
  const orders = listOrders({ includeCancelled: req.query.all === 'true' });
  res.json({
    success: true,
    summary: getOrdersSummary(),
    pending: orders.filter(o => OPEN_STATUSES.includes(o.status)),
    orders,
    history: listHistory(Number(req.query.history) || 50),
    // Testes físicos: andamento e falhas registradas pelo Dr. Jorge (para propor correções)
    qa: (() => { try { return getQaSummaryForAgents(); } catch (e) { return null; } })()
  });
});

// Atualiza status e/ou registra nota de andamento
roadmapAgentRouter.patch('/api/agent/roadmap/orders/:id', requireAgentKey, (req, res) => {
  const { id } = req.params;
  if (!isValidOrderId(id) || !getOrder(id)) return res.status(404).json({ error: 'Ordem não encontrada.' });
  const { status, note } = req.body || {};
  if (status === undefined && !String(note || '').trim()) return res.status(400).json({ error: 'Informe o status e/ou uma nota.' });
  if (status === 'cancelada') return res.status(403).json({ error: 'Só o construtor pode arquivar ordens.' });
  const v = validateOrderInput({ status }, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const updated = updateOrder(id, v.value, req.agentName, note);
  audit(req, 'AGENTE_ATUALIZOU_ORDEM', id, `${req.agentName} atualizou a ordem ${id} para ${updated.status}.`);
  res.json({ success: true, order: updated });
});

// Agente registra algo que ficou pendente/"só na intenção" (entra como planejado)
roadmapAgentRouter.post('/api/agent/roadmap/orders', requireAgentKey, (req, res) => {
  const v = validateOrderInput(req.body, { partial: false });
  if (v.error) return res.status(400).json({ error: v.error });
  const order = createOrder(v.value, req.agentName);
  audit(req, 'AGENTE_REGISTROU_ORDEM', order.id, `${req.agentName} registrou pendência: ${order.title}`);
  res.status(201).json({ success: true, order });
});

// Importa ordens de um banco local (preserva id, data e histórico; não sobrescreve)
roadmapAgentRouter.post('/api/agent/roadmap/import', requireAgentKey, (req, res) => {
  const { orders, history } = req.body || {};
  const result = importOrders(orders, history, req.agentName);
  audit(req, 'AGENTE_IMPORTOU_ORDENS', null, `${req.agentName} importou ${result.imported} ordem(ns); ${result.skipped} já existiam.`);
  res.json({ success: true, ...result });
});
