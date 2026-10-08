/**
 * RADAR JUDICIAL — PROVEDOR ESCAVADOR
 * ============================================================================
 * Religa o Radar usando o Escavador Business como fonte de dados processuais.
 * Diferente da ComunicaAPI/DJEN (bloqueada fora do Brasil), a API do Escavador
 * funciona do servidor na França — então NÃO precisa de proxy nem de servidor no Brasil.
 *
 * FLUXO HONESTO (só dados reais):
 *   1. O mestre cria um MONITORAMENTO (a OAB, e/ou os processos por CNJ).
 *   2. Quando sai uma intimação/publicação, o Escavador AVISA nosso servidor via CALLBACK
 *      (webhook público POST /api/webhooks/escavador, validado por token).
 *   3. A publicação entra na MESMA tabela (court_publications), com o MESMO dedupe, vínculo
 *      ao processo e alerta ao ADVOGADO que o motor de sync já faz (ingestComunicaItems).
 *
 * 🚫 PRIVACIDADE/DECISÃO DO ADVOGADO: nada aqui envia andamento, intimação ou aviso ao
 * CLIENTE (nem WhatsApp, nem e-mail). A ingestão só cria notificação INTERNA do painel para
 * o advogado; é ele quem decide o que (e se) repassa ao cliente. Nunca chame envio ao cliente daqui.
 *
 * Sem ESCAVADOR_API_TOKEN, o Radar por Escavador fica INDISPONÍVEL (503 claro), sem inventar dado.
 * Chaves no cofre: node scripts/env-vault.js set ESCAVADOR_API_TOKEN
 *                  node scripts/env-vault.js set ESCAVADOR_CALLBACK_TOKEN   (valida os callbacks)
 */
import crypto from 'node:crypto';
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { createNotification } from '../notifications/notifications.routes.js';
import { registerSyncTask, ingestComunicaItems, reconcileDeadlinesToCalendar, relinkOrphanPublications, resolveLawyers } from '../sync/sync.routes.js';
import { generateNextClientFullId, generateNextLawsuitId } from '../../shared/ids.js';
import { hashPassword } from '../../shared/password-crypto.js';
import { responsavelAoCriar } from '../../middleware/data-scope.js';
import {
  escavadorConfig, escavadorConfigured, consultarSaldo, listarMonitoramentos,
  criarMonitoramentoDiario, removerMonitoramento, buscarProcessos, buscarProcessosPorOab,
  extrairOcorrencias, ocorrenciaParaComunicaItem, processoParaImport, soDigitos,
  detalharProcesso, detalheParaImport,
} from '../../shared/escavador.js';

export const radarRouter = express.Router();

const STATUS_KEY = 'radar_escavador_status';
const SALDO_MINIMO_PADRAO = 3000; // centavos (R$ 30) — abaixo disso, avisa o mestre
const INDISPONIVEL = { error: 'Radar por Escavador indisponível: configure ESCAVADOR_API_TOKEN no cofre do servidor (node scripts/env-vault.js set ESCAVADOR_API_TOKEN).' };

// ---------------------------------------------------------------------------
//  Tabelas locais (criadas na carga): memória dos monitoramentos e registro de gastos.
// ---------------------------------------------------------------------------
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS radar_monitoramentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,              -- 'diario' | 'processo'
      chave TEXT NOT NULL,             -- a OAB/termo, ou o CNJ (só dígitos)
      escavador_id TEXT,               -- id devolvido pelo Escavador
      frequencia TEXT,                 -- para 'processo': diario|semanal|mensal
      created_at TEXT NOT NULL,
      UNIQUE(tipo, chave)
    );
    CREATE TABLE IF NOT EXISTS radar_gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operacao TEXT NOT NULL,
      creditos_centavos INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
} catch { /* o server.js garante o banco; em import muito cedo, segue */ }

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

// ---------------------------------------------------------------------------
//  Controle de gasto (créditos) — tudo sai da MESMA carteira pré-paga do Escavador.
// ---------------------------------------------------------------------------
/** Registra o custo de uma operação (centavos), para o painel somar e acompanhar. */
export function registrarGasto(operacao, creditos) {
  const c = Number(creditos);
  if (!Number.isFinite(c) || c <= 0) return;
  try {
    db.prepare(`INSERT INTO radar_gastos (operacao, creditos_centavos, created_at) VALUES (?, ?, ?)`)
      .run(String(operacao || 'operacao'), Math.round(c), new Date().toISOString());
  } catch { /* best-effort */ }
}
function resumoGastos() {
  try {
    const total = db.prepare(`SELECT COALESCE(SUM(creditos_centavos), 0) t FROM radar_gastos`).get().t;
    const ultimos = db.prepare(`SELECT operacao, creditos_centavos, created_at FROM radar_gastos ORDER BY id DESC LIMIT 10`).all();
    return { gasto_total_centavos: total, ultimos };
  } catch { return { gasto_total_centavos: 0, ultimos: [] }; }
}

/** Extrai o saldo (em centavos) de formatos possíveis da resposta do Escavador (tolerante). */
export function saldoCentavos(saldoData) {
  const d = saldoData || {};
  for (const k of ['saldo_centavos', 'saldo', 'creditos', 'credito', 'valor', 'balance']) {
    if (d[k] != null && Number.isFinite(Number(d[k]))) {
      const v = Number(d[k]);
      // Heurística: campos "*_centavos" já vêm em centavos; "saldo/valor" costumam vir em reais.
      return /cent/i.test(k) ? Math.round(v) : Math.round(v * 100);
    }
  }
  return null;
}
/** True se o saldo (centavos) está abaixo do mínimo configurado (ESCAVADOR_SALDO_MINIMO_CENTAVOS). */
export function saldoBaixo(centavos, env = process.env) {
  if (centavos == null) return false;
  const min = Number(env.ESCAVADOR_SALDO_MINIMO_CENTAVOS) || SALDO_MINIMO_PADRAO;
  return centavos < min;
}

// ---------------------------------------------------------------------------
//  Ingestão de ocorrências → tabela de publicações (dedupe/vínculo/alerta AO ADVOGADO).
// ---------------------------------------------------------------------------
function advogadoPadrao() {
  try { return resolveLawyers({})[0] || null; } catch { return null; }
}

/**
 * Ingesta ocorrências do Escavador na tabela de publicações, agrupando por OAB, reconciliando
 * prazos/órfãs quando algo novo entra. NÃO notifica o cliente (só alerta interno ao advogado).
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
//  Seleção dos processos ativos do escritório (para o cadastro automático por CNJ).
// ---------------------------------------------------------------------------
/** Processos ATIVOS com número CNJ, sem repetir o mesmo número. */
export function processosAtivosParaMonitorar() {
  try {
    const rows = db.prepare(`
      SELECT id, cnj_number FROM lawsuits
      WHERE cnj_number IS NOT NULL AND TRIM(cnj_number) != ''
        AND status NOT IN ('Arquivado', 'Encerrado', 'Baixado', 'Extinto')
    `).all();
    const vistos = new Set();
    const saida = [];
    for (const r of rows) {
      const cnj = soDigitos(r.cnj_number);
      if (!cnj || vistos.has(cnj)) continue;
      vistos.add(cnj);
      saida.push({ id: r.id, cnj, cnjMasc: r.cnj_number });
    }
    return saida;
  } catch { return []; }
}

function jaMonitorado(tipo, chave) {
  try { return !!db.prepare(`SELECT id FROM radar_monitoramentos WHERE tipo = ? AND chave = ?`).get(tipo, chave); }
  catch { return false; }
}
function lembrarMonitoramento(tipo, chave, escavadorId, frequencia) {
  try {
    db.prepare(`INSERT OR IGNORE INTO radar_monitoramentos (tipo, chave, escavador_id, frequencia, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(tipo, chave, escavadorId ? String(escavadorId) : null, frequencia || null, new Date().toISOString());
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
//  ROTAS DO PAINEL (sob a aba tab_radar; ver src/middleware/rbac-rules.js)
// ---------------------------------------------------------------------------

/** GET /api/radar/status — provedor configurado?, gasto acumulado, saldo (?refresh=1 consulta o saldo). */
radarRouter.get('/api/radar/status', requireAuth, async (req, res) => {
  const configurado = escavadorConfigured();
  const cfg = escavadorConfig();
  const out = {
    provider: 'escavador',
    configurado,
    callback_configurado: !!cfg.callbackToken,
    webhook_url: `${process.env.SITE_URL || process.env.PROD_URL || ''}/api/webhooks/escavador`,
    monitoramentos_locais: (() => { try { return db.prepare(`SELECT COUNT(*) n FROM radar_monitoramentos`).get().n; } catch { return 0; } })(),
    gastos: resumoGastos(),
    status: lerStatus(),
  };
  if (configurado && String(req.query.refresh) === '1') {
    const r = await consultarSaldo();
    if (typeof r.creditos === 'number') registrarGasto('consultar_saldo', r.creditos);
    const centavos = r.ok ? saldoCentavos(r.data) : null;
    salvarStatus({ ok: r.ok, saldo: r.ok ? (r.data ?? null) : null, saldo_centavos: centavos, saldo_baixo: saldoBaixo(centavos), checked_at: new Date().toISOString(), error: r.error || null });
    out.status = lerStatus();
  }
  return res.json(out);
});

/** GET /api/radar/monitoramentos — lista os monitoramentos na conta do Escavador. */
radarRouter.get('/api/radar/monitoramentos', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const r = await listarMonitoramentos();
  if (typeof r.creditos === 'number') registrarGasto('listar_monitoramentos', r.creditos);
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  return res.json({ success: true, monitoramentos: r.itens, creditos: r.creditos });
});

/** POST /api/radar/monitoramentos — cria monitoramento (diário por termo OU processo por CNJ). */
radarRouter.post('/api/radar/monitoramentos', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const b = req.body || {};
  const tipo = String(b.tipo || '').toLowerCase();
  let r, tipoReg, chave, freq;
  if (tipo === 'processo' || b.numeroCnj) {
    // Monitora o PROCESSO como termo (o número CNJ) nos diários — captura as publicações dele.
    chave = String(b.numeroCnj || b.numero || '').trim();
    freq = b.frequencia || 'SEMANAL';
    if (!chave) return res.status(400).json({ error: 'Informe o número do processo (numeroCnj).' });
    r = await criarMonitoramentoDiario({ termo: chave });
    tipoReg = 'processo';
  } else {
    // OAB vira o termo "<numero>/<UF>" (ex.: 222943/MG) — evita o homônimo de outro estado.
    const oab = b.oab ? `${soDigitos(b.oab)}/${String(b.uf || 'MG').toUpperCase()}` : '';
    chave = oab || String(b.termo || '').trim();
    if (!chave) return res.status(400).json({ error: 'Informe "oab" (com uf) ou "termo", ou "numeroCnj".' });
    r = await criarMonitoramentoDiario({ termo: chave, variacoes: Array.isArray(b.variacoes) ? b.variacoes : [], origensIds: Array.isArray(b.origensIds) ? b.origensIds : [] });
    tipoReg = 'diario';
  }
  if (typeof r.creditos === 'number') registrarGasto(`monitorar_${tipoReg}`, r.creditos);
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  lembrarMonitoramento(tipoReg, soDigitos(chave) || chave, r.data?.id, freq);
  logAudit(req, { event_type: 'RADAR', event_name: 'MONITORAMENTO_CRIADO', module: 'RADAR', resource_id: String(r.data?.id || chave), description: `Monitoramento criado (${tipoReg}).` });
  return res.json({ success: true, monitoramento: r.data, creditos: r.creditos });
});

/**
 * POST /api/radar/monitorar-processos-ativos — cadastra TODOS os processos ativos (com CNJ) no
 * monitoramento por CNJ (padrão SEMANAL, o mais barato). Não recadastra o que já está monitorado.
 */
radarRouter.post('/api/radar/monitorar-processos-ativos', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const b = req.body || {};
  const processos = processosAtivosParaMonitorar();
  // PROTEÇÃO DE CUSTO: cada processo monitorado como termo custa R$ 2,20/mês. A OAB já captura
  // as intimações de TODOS por R$ 2,20 no total. Só cria um a um se confirmar: true.
  if (!b.confirmar) {
    return res.json({
      success: false, requer_confirmacao: true, total: processos.length,
      aviso: `Monitorar ${processos.length} processo(s) um a um custaria cerca de R$ ${(processos.length * 2.2).toFixed(2)}/mês. O monitoramento da sua OAB já captura as intimações de todos por R$ 2,20/mês no total. Só confirme se realmente quiser monitorar individualmente.`,
    });
  }
  let criados = 0, jaExistiam = 0, falhas = 0, creditos = 0;
  const erros = [];
  for (const p of processos) {
    if (jaMonitorado('processo', p.cnj)) { jaExistiam++; continue; }
    const r = await criarMonitoramentoDiario({ termo: p.cnjMasc });
    if (typeof r.creditos === 'number') { creditos += r.creditos; registrarGasto('monitorar_processo', r.creditos); }
    if (r.ok) { lembrarMonitoramento('processo', p.cnj, r.data?.id, 'termo'); criados++; }
    else { falhas++; erros.push(`${p.cnjMasc}: ${r.error}`); }
  }
  logAudit(req, { event_type: 'RADAR', event_name: 'MONITORAR_ATIVOS', module: 'RADAR', resource_id: 'lote', description: `Monitoramento por processo: ${criados} criado(s), ${jaExistiam} já existia(m), ${falhas} falha(s).` });
  return res.json({ success: true, total: processos.length, criados, jaExistiam, falhas, creditos, erros: erros.slice(0, 20) });
});

/**
 * Importa UM processo (já no formato process_data) para a base do escritório: cria/acha o cliente,
 * cria o processo com dedupe por CNJ e define o responsável conforme quem importa. Não envia nada ao cliente.
 */
/**
 * Mescla o process_data da BUSCA (base) com o do DETALHE (rico): o detalhe COMPLETA campo a
 * campo, mas nunca apaga o que a busca já tinha (ex.: o resumo/link da publicação). Idempotente.
 */
export function mesclarProcesso(base, rico) {
  const b = base || {};
  const r = rico || {};
  const pick = (campo, vazio = '') => (r[campo] != null && r[campo] !== '' && r[campo] !== vazio ? r[campo] : b[campo]);
  const lista = (campo) => (Array.isArray(r[campo]) && r[campo].length ? r[campo] : (Array.isArray(b[campo]) ? b[campo] : []));
  return {
    ...b,
    numero_processo: b.numero_processo || r.numero_processo,
    tribunal_code: pick('tribunal_code'),
    tribunal_name: pick('tribunal_name'),
    class_name: r.class_name && r.class_name !== 'Ação Judicial' ? r.class_name : (b.class_name || r.class_name),
    subject: pick('subject'),
    court_branch: pick('court_branch'),
    judge_name: pick('judge_name'),
    distribution_date: pick('distribution_date'),
    instance: pick('instance'),
    valor_causa: pick('valor_causa'),
    situacao: pick('situacao'),
    polo_ativo: lista('polo_ativo'),
    polo_passivo: lista('polo_passivo'),
    parte_contraria: pick('parte_contraria'),
    cliente_sugerido: r.cliente_sugerido || b.cliente_sugerido || null,
    resumo: b.resumo || r.resumo || '',
    link: b.link || r.link || '',
    detalhado: !!(r.detalhado || b.detalhado),
  };
}

function importarProcessoEscritorio(pd, session) {
  const numero = String(pd.numero_processo || '').trim();
  if (!numero) return { ok: false, reason: 'sem número' };
  const existente = db.prepare(`SELECT id FROM lawsuits WHERE cnj_number = ?`).get(numero);
  if (existente) return { ok: true, jaExistia: true, lawsuitId: existente.id };

  const now = new Date().toISOString();
  // O CLIENTE é, de preferência, a parte que o advogado representa (detectada pela OAB no
  // detalhe); se não houver, cai no 1º do polo ativo (ou um marcador, para o advogado conferir).
  const clienteBase = pd.cliente_sugerido
    || (pd.polo_ativo?.[0] ? { name: pd.polo_ativo[0].name, document: pd.polo_ativo[0].document } : null);
  const cliNome = (clienteBase?.name || 'Parte importada (Radar)').trim();
  const cliDoc = soDigitos(clienteBase?.document || '');

  let cli = null;
  if (cliDoc.length >= 11) {
    cli = db.prepare(`SELECT id FROM clients WHERE REPLACE(REPLACE(REPLACE(cpf,'.',''),'-',''),' ','') = ?
                      OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') = ?`).get(cliDoc, cliDoc);
  }
  if (!cli) cli = db.prepare(`SELECT id FROM clients WHERE LOWER(TRIM(full_name)) = ?`).get(cliNome.toLowerCase());
  let clientId = cli ? cli.id : null;
  if (!clientId) {
    clientId = generateNextClientFullId();
    // Senha ALEATÓRIA e forte (nunca "123456"): o cliente define a dele por "esqueci a senha".
    const s = hashPassword(crypto.randomBytes(18).toString('base64') + 'Aa1!');
    db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, cnpj, email, phone, contract_status, password_hash, salt, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Ativo', ?, ?, ?, ?)`).run(
      clientId, cliDoc.length === 14 ? 'PJ' : 'PF', cliNome,
      cliDoc.length === 11 ? cliDoc : '', cliDoc.length === 14 ? cliDoc : '',
      '', '', s.hash, s.salt, now, now);
  }

  // Observações: tudo que ajuda o advogado a CONFERIR se o processo é dele (parte contrária,
  // valor, situação, resumo da publicação e link para abrir no Escavador).
  const obs = ['Importado do Radar (Escavador).'];
  if (pd.parte_contraria) obs.push(`Parte contrária: ${pd.parte_contraria}.`);
  if (pd.valor_causa) obs.push(`Valor da causa: ${pd.valor_causa}.`);
  if (pd.situacao) obs.push(`Situação: ${pd.situacao}.`);
  if (pd.resumo) obs.push(`Publicação: ${pd.resumo}`);
  if (pd.link) obs.push(`Conferir: ${pd.link}`);

  const resp = responsavelAoCriar(session, undefined);
  const lawsuitId = generateNextLawsuitId();
  db.prepare(`INSERT INTO lawsuits (id, client_id, cnj_number, tribunal, instance, action_type, court_branch,
                subject, judge_name, distribution_date, status, notes, responsible_user_id, responsible_name, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Em Andamento', ?, ?, ?, ?, ?)`).run(
    lawsuitId, clientId, numero, pd.tribunal_code || 'TJMG', pd.instance || '1ª Instância',
    pd.class_name || 'Ação Judicial', pd.court_branch || '',
    pd.subject || 'Importado do Radar (Escavador)', pd.judge_name || '', pd.distribution_date || '',
    obs.join(' '), resp.id, resp.name, now, now);
  return { ok: true, lawsuitId, clientId };
}

/**
 * POST /api/radar/importar-processos — ADICIONA processos ao sistema a partir do Escavador.
 *  - body { oab, uf }     → busca os processos do advogado e importa TODOS (os antigos de uma vez);
 *  - body { processos:[]} → importa uma lista já encontrada (ex.: botão "Adicionar" num resultado).
 * Dedupe por CNJ (não duplica os que já existem). Nada é enviado ao cliente.
 */
radarRouter.post('/api/radar/importar-processos', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const b = req.body || {};
  let encontrados = [];
  let creditos = 0;
  if (Array.isArray(b.processos) && b.processos.length) {
    encontrados = b.processos;
  } else if (b.oab) {
    // Processos do advogado pela OAB (V2) — já estruturados (capa + partes), sem consulta extra.
    const r = await buscarProcessosPorOab({ oab: b.oab, uf: b.uf || 'MG' });
    if (typeof r.creditos === 'number') { creditos += r.creditos; registrarGasto('busca_oab', r.creditos); }
    if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
    encontrados = (r.itens || []).map((it) => detalheParaImport(it, { oab: b.oab, uf: b.uf || 'MG' }));
  } else {
    return res.status(400).json({ error: 'Informe "oab" (para buscar e importar) ou "processos".' });
  }

  // OAB do dono (p/ detectar o cliente = a parte que ELE representa). Do pedido ou do advogado padrão.
  const padrao = advogadoPadrao();
  const oabDono = soDigitos(b.oab || padrao?.oab || '');
  const ufDono = String(b.uf || padrao?.uf || 'MG').toUpperCase();
  // Enriquecer = buscar o detalhe estruturado do processo (consome crédito). Ligado por padrão;
  // o chamador pode desligar (enriquecer:false) para só cadastrar sem conferir.
  const enriquecer = b.enriquecer !== false;

  let importados = 0, jaExistiam = 0, falhas = 0, enriquecidos = 0;
  for (const p of encontrados) {
    // Já normalizado/enriquecido (veio da busca por OAB V2 ou de um resultado)? Usa como está,
    // sem perder os campos ricos. Caso contrário (publicação crua), normaliza.
    let pd = (p && (p.detalhado || Array.isArray(p.polo_ativo) || Array.isArray(p.polo_passivo))) ? p : processoParaImport(p);
    if (!pd.numero_processo) { falhas++; continue; }
    // Só gasta crédito com o detalhe se o processo ainda NÃO existe e ainda não veio detalhado.
    const existe = db.prepare(`SELECT id FROM lawsuits WHERE cnj_number = ?`).get(soDigitos(pd.numero_processo))
      || db.prepare(`SELECT id FROM lawsuits WHERE cnj_number = ?`).get(pd.numero_processo);
    if (enriquecer && !existe && !pd.detalhado) {
      const d = await detalharProcesso({ numeroCnj: pd.numero_processo });
      if (typeof d.creditos === 'number') { creditos += d.creditos; registrarGasto('detalhar_processo', d.creditos); }
      if (d.ok && d.data) {
        const rico = detalheParaImport(d.data, { oab: oabDono, uf: ufDono });
        // O detalhe COMPLETA: só sobrescreve quando trouxe valor (não apaga o que a busca já tinha).
        pd = mesclarProcesso(pd, rico);
        enriquecidos++;
      }
    }
    const r = importarProcessoEscritorio(pd, req.user);
    if (!r.ok) falhas++;
    else if (r.jaExistia) jaExistiam++;
    else importados++;
  }
  logAudit(req, { event_type: 'RADAR', event_name: 'IMPORTAR_PROCESSOS', module: 'RADAR', resource_id: soDigitos(b.oab || '') || 'lote', description: `Importação do Radar: ${importados} novo(s), ${jaExistiam} já existia(m), ${enriquecidos} detalhado(s), ${falhas} falha(s).` });
  return res.json({ success: true, total: encontrados.length, importados, jaExistiam, enriquecidos, falhas, creditos });
});

/** DELETE /api/radar/monitoramentos/:id — remove um monitoramento. */
radarRouter.delete('/api/radar/monitoramentos/:id', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const r = await removerMonitoramento(req.params.id);
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  try { db.prepare(`DELETE FROM radar_monitoramentos WHERE escavador_id = ?`).run(String(req.params.id)); } catch { /* ok */ }
  logAudit(req, { event_type: 'RADAR', event_name: 'MONITORAMENTO_REMOVIDO', module: 'RADAR', resource_id: String(req.params.id), description: 'Monitoramento removido.' });
  return res.json({ success: true });
});

/** POST /api/radar/buscar — busca sob demanda por OAB, nome, CPF/CNPJ ou número CNJ (consome créditos). */
radarRouter.post('/api/radar/buscar', requireAuth, async (req, res) => {
  if (!escavadorConfigured()) return res.status(503).json(INDISPONIVEL);
  const b = req.body || {};
  if (!b.oab && !b.nome && !b.cpfCnpj && !b.numeroCnj) return res.status(400).json({ error: 'Informe oab, nome, cpfCnpj ou numeroCnj.' });

  // Por OAB: processos ESTRUTURADOS do advogado (V2). Demais: full-text em diários (V1).
  const porOab = !!b.oab && !b.nome && !b.cpfCnpj && !b.numeroCnj;
  const r = porOab
    ? await buscarProcessosPorOab({ oab: b.oab, uf: b.uf || 'MG' })
    : await buscarProcessos({ oab: b.oab, uf: b.uf || 'MG', nome: b.nome, cpfCnpj: b.cpfCnpj, numeroCnj: b.numeroCnj });
  if (typeof r.creditos === 'number') registrarGasto(porOab ? 'busca_oab' : 'busca', r.creditos);
  if (!r.ok) return res.status(502).json({ error: `Escavador: ${r.error}` });
  logAudit(req, { event_type: 'RADAR', event_name: 'BUSCA', module: 'RADAR', resource_id: soDigitos(b.oab || b.cpfCnpj || b.numeroCnj || '') || 'nome', description: 'Busca de processos no Escavador.' });

  const bruto = Array.isArray(r.itens) ? r.itens : (Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : (r.data ? [r.data] : [])));
  // Cada processo UMA vez (full-text repete por publicação). Por OAB já vem estruturado.
  const vistos = new Set();
  const processos = [];
  for (const it of bruto) {
    const p = porOab ? detalheParaImport(it, { oab: b.oab, uf: b.uf || 'MG' }) : processoParaImport(it);
    if (!p.numero_processo || vistos.has(p.numero_processo)) continue;
    if (porOab && !p.resumo) {
      p.resumo = [p.class_name, p.subject, p.parte_contraria ? `réu: ${p.parte_contraria}` : '']
        .filter(Boolean).join(' • ');
    }
    vistos.add(p.numero_processo);
    processos.push(p);
  }
  return res.json({ success: true, processos, creditos: r.creditos });
});

// ---------------------------------------------------------------------------
//  WEBHOOK (público; validado por token). Recebe os avisos do Escavador em tempo real.
//  Só alerta o ADVOGADO (notificação interna) — NUNCA envia nada ao cliente.
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
    return res.status(200).json({ success: false, error: 'processamento adiado' }); // 200 evita reentrega infinita; a falha fica no log
  }
});

// ---------------------------------------------------------------------------
//  TAREFA PERIÓDICA (rede de segurança): confirma o provedor, guarda o saldo e AVISA O MESTRE
//  quando o saldo fica baixo. A ingestão em tempo real é via callback.
// ---------------------------------------------------------------------------
registerSyncTask('escavador_radar', async () => {
  if (!escavadorConfigured()) return { skipped: true, reason: 'ESCAVADOR_API_TOKEN ausente' };
  const r = await consultarSaldo();
  if (typeof r.creditos === 'number') registrarGasto('consultar_saldo', r.creditos);
  const centavos = r.ok ? saldoCentavos(r.data) : null;
  const baixo = saldoBaixo(centavos);
  salvarStatus({ ok: r.ok, saldo: r.ok ? (r.data ?? null) : null, saldo_centavos: centavos, saldo_baixo: baixo, checked_at: new Date().toISOString(), error: r.error || null });
  if (baixo) {
    createNotification({
      category: 'geral', level: 'warning',
      title: '💳 Saldo do Radar (Escavador) baixo',
      message: `O crédito do Radar está em R$ ${(centavos / 100).toFixed(2)}. Recarregue no painel do Escavador para não interromper o monitoramento.`,
      link: '#tab:radar', dedupe_key: `radar:saldo-baixo:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  return { ok: r.ok, saldo_centavos: centavos, saldo_baixo: baixo };
});
