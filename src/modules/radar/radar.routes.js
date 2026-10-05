/**
 * RADAR JUDICIAL — PROVEDOR ESCAVADOR
 * ============================================================================
 * Religa o Radar usando o Escavador Business como fonte de dados processuais.
 * Diferente da ComunicaAPI/DJEN (bloqueada fora do Brasil), a API do Escavador
 * funciona do servidor na França — então NÃO precisa de proxy nem de servidor no Brasil.
 *
 * FLUXO HONESTO (só dados reais):
 *   1. O mestre cria um MONITORAMENTO (ex.: a OAB do escritório) — POST /api/radar/monitoramentos.
 *   2. Quando sai uma intimação/publicação, o Escavador AVISA nosso servidor via CALLBACK
 *      (webhook público POST /api/webhooks/escavador, validado por token).
 *   3. A publicação entra na MESMA tabela (court_publications), com o MESMO dedupe, vínculo
 *      ao processo e alerta ao advogado que o motor de sync já faz (ingestComunicaItems).
 *
 * Sem ESCAVADOR_API_TOKEN, o Radar por Escavador fica INDISPONÍVEL (503 claro), sem inventar dado.
 * Chave no cofre: node scripts/env-vault.js set ESCAVADOR_API_TOKEN
 *                 node scripts/env-vault.js set ESCAVADOR_CALLBACK_TOKEN   (valida os callbacks)
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { registerSyncTask, ingestComunicaItems, reconcileDeadlinesToCalendar, relinkOrphanPublications, resolveLawyers } from '../sync/sync.routes.js';
import {
  escavadorConfig, escavadorConfigured, consultarSaldo, listarMonitoramentos,
  criarMonitoramentoDiario, criarMonitoramentoProcesso, removerMonitoramento, buscarProcessos,
  extrairOcorrencias, ocorrenciaParaComunicaItem, soDigitos,
} from '../../shared/escavador.js';

export const radarRouter = express.Router();

const STATUS_KEY = 'radar_escavador_status';
const INDISPONIVEL = { error: 'Radar por Escavador indisponível: configure ESCAVADOR_API_TOKEN no cofre do servidor (node scripts/env-vault.js set ESCAVADOR_API_TOKEN).' };

// ---------------------------------------------------------------------------
//  Status persistido (último contato / saldo), para o painel mostrar sem gastar crédito.
// ---------------------------------------------------------------------------
function salvarStatus(patch) {
  try {
    const atual = lerStatus() || {};
    const novo = { ...atual, ...patch };
    db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(STATUS_KEY, JSON.stringify(novo), new Date().toISOString());
  } catch { /* system_settings é criada pelo server.js */ }
}
function lerStatus() {
  try {
    const row = db.prepare(`SELECT value, updated_at FROM system_settings WHERE key = ?`).get(STATUS_KEY);
    if (row) { const s = JSON.parse(row.value); s.updated_at = row.updated_at; return s; }
  } catch { /* ignora */ }
  return null;
}

/** Advogado padrão (titular) para publicações cuja OAB não vem no callback. */
function advogadoPadrao() {
  try { return resolveLawyers({})[0] || null; } catch { return null; }
}

/**
 * Ingesta ocorrências do Escavador na tabela de publicações (dedupe/vínculo/alerta),
 * agrupando por OAB, e reconciliando prazos/órfãs quando algo novo entra.
 * @returns {{found:number, saved:number, grupos:number}}
 */
export function ingestarOcorrencias(ocorrencias = []) {
  const grupos = new Map();
  ocorrencias.forEach((oc, i) => {
    const item = ocorrenciaParaComunicaItem(oc, i);
    const oab = item._oab || '';
    const uf = item._uf || 'MG';
    const chave = `${oab}|${uf}`;
    if (!grupos.has(chave)) grupos.set(chave, { oab, uf, items: [] });
    grupos.get(chave).items.push(item);
  });
  const padrao = advogadoPadrao();
  let found = 0, saved = 0;
  for (const g of grupos.values()) {
    const oab = g.oab || (padrao?.oab || '');
    const uf = g.oab ? g.uf : (padrao?.uf || g.uf);
    const nome = g.oab ? undefined : (padrao?.name);
    const r = ingestComunicaItems({ oab, uf, nome, items: g.items });
    found += r.found; saved += r.saved;
  }
  if (saved > 0) { try { reconcileDeadlinesToCalendar(); relinkOrphanPublications(); } catch { /* best-effort */ } }
  return { found, saved, grupos: grupos.size };
}

// ---------------------------------------------------------------------------
//  ROTAS DO PAINEL (sob a aba tab_radar; ver src/middleware/rbac-rules.js)
// ---------------------------------------------------------------------------

/** GET /api/radar/status — estado do provedor (configurado?, último contato, saldo). ?refresh=1 consulta o saldo (gasta pouco). */
radarRouter.get('/api/radar/status', requireAuth, async (req, res) => {
  const configurado = escavadorConfigured();
  const cfg = escavadorConfig();
  const out = {
    provider: 'escavador',
    configurado,
    callback_configurado: !!cfg.callbackToken,
    webhook_url: `${process.env.SITE_URL || process.env.PROD_URL || ''}/api/webhooks/escavador`.replace(/^\/+/, ''),
    status: lerStatus(),
  };
  if (configurado && String(req.query.refresh) === '1') {
    const r = await consultarSaldo();
    out.saldo = r.ok ? (r.data ?? null) : null;
    salvarStatus({ ok: r.ok, saldo: out.saldo, checked_at: new Date().toISOString(), error: r.error || null });
    out.status = lerStatus();
  }
  return res.json(out);
});

/** GET /api/radar/monitoramentos — lista os monitoramentos na conta do Escavador. */
radarRouter.get('/api/radar/monitoramentos', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const r = await listarMonitoramentos();
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  return res.json({ success: true, monitoramentos: r.itens, creditos: r.creditos });
});

/** POST /api/radar/monitoramentos — cria monitoramento (diário por termo OU processo por CNJ). */
radarRouter.post('/api/radar/monitoramentos', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const b = req.body || {};
  const tipo = String(b.tipo || '').toLowerCase();
  let r;
  if (tipo === 'processo' || b.numeroCnj) {
    r = await criarMonitoramentoProcesso({ numeroCnj: b.numeroCnj || b.numero, frequencia: b.frequencia || 'SEMANAL' });
  } else {
    const termo = b.termo || b.oab || '';
    if (!termo) return res.status(400).json({ error: 'Informe "termo" (ex.: a OAB) ou "numeroCnj".' });
    r = await criarMonitoramentoDiario({ termo, variacoes: Array.isArray(b.variacoes) ? b.variacoes : [], origensIds: Array.isArray(b.origensIds) ? b.origensIds : [] });
  }
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  logAudit(req, { event_type: 'RADAR', event_name: 'MONITORAMENTO_CRIADO', module: 'RADAR', resource_id: String(r.data?.id || tipo || 'termo'), description: `Monitoramento criado (${tipo || 'diário'}).` });
  return res.json({ success: true, monitoramento: r.data, creditos: r.creditos });
});

/** DELETE /api/radar/monitoramentos/:id — remove um monitoramento. */
radarRouter.delete('/api/radar/monitoramentos/:id', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const r = await removerMonitoramento(req.params.id);
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  logAudit(req, { event_type: 'RADAR', event_name: 'MONITORAMENTO_REMOVIDO', module: 'RADAR', resource_id: String(req.params.id), description: 'Monitoramento removido.' });
  return res.json({ success: true });
});

/** POST /api/radar/buscar — busca sob demanda por OAB, nome, CPF/CNPJ ou número CNJ (consome créditos). */
radarRouter.post('/api/radar/buscar', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const b = req.body || {};
  if (!b.oab && !b.nome && !b.cpfCnpj && !b.numeroCnj) return res.status(400).json({ error: 'Informe oab, nome, cpfCnpj ou numeroCnj.' });
  const r = await buscarProcessos({ oab: b.oab, uf: b.uf || 'MG', nome: b.nome, cpfCnpj: b.cpfCnpj, numeroCnj: b.numeroCnj });
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  logAudit(req, { event_type: 'RADAR', event_name: 'BUSCA', module: 'RADAR', resource_id: soDigitos(b.oab || b.cpfCnpj || b.numeroCnj || '') || 'nome', description: 'Busca de processos no Escavador.' });
  return res.json({ success: true, resultado: r.data ?? r.itens, creditos: r.creditos });
});

// ---------------------------------------------------------------------------
//  WEBHOOK (público; validado por token). Recebe os avisos do Escavador em tempo real.
//  Rota já é PUBLIC em rbac-rules (/api/webhooks/...). A segurança é o token do callback.
// ---------------------------------------------------------------------------
radarRouter.post('/api/webhooks/escavador', (req, res) => {
  const cfg = escavadorConfig();
  if (!cfg.callbackToken) return res.status(503).json({ error: 'Callback do Escavador não configurado (ESCAVADOR_CALLBACK_TOKEN).' });
  const auth = req.get('authorization') || '';
  const enviado = auth.replace(/^Bearer\s+/i, '').trim() || (req.get('x-escavador-token') || '').trim();
  if (enviado !== cfg.callbackToken) return res.status(401).json({ error: 'Token de callback inválido.' });

  try {
    const ocorrencias = extrairOcorrencias(req.body);
    const r = ingestarOcorrencias(ocorrencias);
    salvarStatus({ last_callback_at: new Date().toISOString(), last_callback_recebidas: ocorrencias.length, last_callback_salvas: r.saved });
    return res.json({ success: true, recebidas: ocorrencias.length, salvas: r.saved });
  } catch (err) {
    console.error('[RADAR] Falha ao processar callback do Escavador:', err.message);
    return res.status(200).json({ success: false, error: 'processamento adiado' }); // 200 evita reentrega infinita; registramos a falha
  }
});

// ---------------------------------------------------------------------------
//  TAREFA PERIÓDICA (rede de segurança): confirma que o provedor está vivo e guarda o saldo.
//  A ingestão em tempo real é via callback; esta tarefa só verifica conectividade.
// ---------------------------------------------------------------------------
registerSyncTask('escavador_radar', async () => {
  if (!escavadorConfigured()) return { skipped: true, reason: 'ESCAVADOR_API_TOKEN ausente' };
  const r = await consultarSaldo();
  const status = { ok: r.ok, saldo: r.ok ? (r.data ?? null) : null, checked_at: new Date().toISOString(), error: r.error || null };
  salvarStatus(status);
  return status;
});
