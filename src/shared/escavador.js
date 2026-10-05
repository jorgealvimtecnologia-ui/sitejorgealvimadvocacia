/**
 * CLIENTE DA API DO ESCAVADOR BUSINESS (V1) — fonte de dados processuais que funciona
 * de qualquer lugar (inclusive do servidor na França), ao contrário da ComunicaAPI/DJEN,
 * que bloqueia acesso de fora do Brasil. Serve para RELIGAR o Radar Judicial sem depender
 * de proxy nem de servidor no Brasil.
 *
 * SEGREDO NO COFRE: a chave vem SÓ do ambiente (ESCAVADOR_API_TOKEN), nunca do código,
 * nunca do frontend (regra do Escavador: o token é server-to-server). Em produção:
 *   node scripts/env-vault.js set ESCAVADOR_API_TOKEN
 *
 * Este módulo é PURO em relação ao banco (não importa o db). Ele só fala HTTP com o
 * Escavador e NORMALIZA as publicações para o mesmo formato que o motor de sincronização
 * já sabe gravar (saveComunicaItem/ingestComunicaItems em src/modules/sync/sync.routes.js).
 *
 * ⚠️ FORMATO DA API (WIRE): os caminhos e nomes de campos ficam todos no objeto WIRE abaixo,
 * num lugar só. Sem o token real não dá para confirmar cada campo ao vivo, então os
 * extratores são TOLERANTES (tentam vários nomes prováveis). No "teste de fumaça" com o
 * token verdadeiro, qualquer ajuste de nome é feito AQUI, em um ponto, sem tocar no resto.
 */

const DEFAULT_BASE = 'https://api.escavador.com/api/v1';
const DEFAULT_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
//  WIRE — contrato com a API (ÚNICO ponto a conferir no teste de fumaça)
// ---------------------------------------------------------------------------
export const WIRE = {
  // Rotas da V1 (relativas ao base). Conferir na doc oficial ao ligar o token.
  rotas: {
    saldo: '/saldo',
    monitoramentos: '/monitoramentos',
    monitoramentoDiario: '/monitoramentos',          // POST (tipo "DIARIO")
    monitoramentoProcesso: '/monitoramentos',        // POST (tipo "UNICO")
    buscaProcessosPorOab: '/advogado/processos',
    buscaProcessosPorNome: '/busca',
    buscaProcessoPorNumero: '/processos/numero',
  },
  // Chaves de campo que podem vir na publicação/ocorrência (tentadas em ordem).
  campos: {
    id: ['id', 'ocorrencia_id', 'aparicao_id', 'publicacao_id'],
    numero: ['numero_processo', 'numero_unico', 'numero', 'numeroProcesso'],
    tribunalSigla: ['sigla_tribunal', 'siglaTribunal', 'tribunal_sigla'],
    orgao: ['nome_orgao', 'orgao', 'vara', 'caderno', 'nomeOrgao'],
    tipo: ['tipo_comunicacao', 'tipo', 'tipoComunicacao', 'especie'],
    data: ['data_disponibilizacao', 'data_publicacao', 'data', 'dataDisponibilizacao'],
    texto: ['texto', 'conteudo', 'trecho', 'inteiro_teor', 'conteudo_publicacao'],
    classe: ['nome_classe', 'classe', 'nomeClasse'],
    partes: ['destinatarios', 'envolvidos', 'partes', 'advogados'],
    oab: ['numero_oab', 'oab', 'numeroOab'],
    oabUf: ['uf_oab', 'ufOab', 'estado_oab', 'uf'],
  },
  // Onde ficam as ocorrências dentro do corpo de um callback (tentadas em ordem).
  listasOcorrencia: ['aparicoes', 'ocorrencias', 'publicacoes', 'itens', 'items', 'data', 'resultados'],
  // Cabeçalho com o custo da requisição (em centavos).
  headerCreditos: 'creditos-utilizados',
  // Nome do campo de tribunais/origens ao criar monitoramento de diário.
  origensCampo: 'origens_ids',
};

// ---------------------------------------------------------------------------
//  Configuração (vem do ambiente/cofre)
// ---------------------------------------------------------------------------
/** Lê a configuração do ambiente. `env` injetável para testes. */
export function escavadorConfig(env = process.env) {
  return {
    token: (env.ESCAVADOR_API_TOKEN || '').trim(),
    base: (env.ESCAVADOR_API_BASE || DEFAULT_BASE).replace(/\/+$/, ''),
    callbackToken: (env.ESCAVADOR_CALLBACK_TOKEN || '').trim(),
    proxy: (env.ESCAVADOR_PROXY || '').trim(),
  };
}

/** True se o token da API está configurado (sem ele, o Radar por Escavador fica indisponível). */
export function escavadorConfigured(env = process.env) {
  return escavadorConfig(env).token.length > 0;
}

// ---------------------------------------------------------------------------
//  Transporte HTTP (Bearer + timeout + leitura de créditos + proxy opcional)
// ---------------------------------------------------------------------------
let _dispatcher = null;
let _proxyTried = false;
async function proxyDispatcher(proxy) {
  if (!proxy) return null;
  if (!_dispatcher && !_proxyTried) {
    _proxyTried = true;
    try {
      const { ProxyAgent } = await import('undici');
      _dispatcher = new ProxyAgent(proxy);
    } catch { /* undici ausente: segue sem proxy (a API funciona direto) */ }
  }
  return _dispatcher;
}

function headerCreditos(headers) {
  try {
    const raw = headers?.get?.(WIRE.headerCreditos);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/**
 * Faz uma requisição à API do Escavador. Devolve SEMPRE um objeto (nunca lança por HTTP):
 *   { ok, status, data, creditos, error }
 * @param {string} caminho  rota relativa (ex.: '/monitoramentos') ou URL absoluta
 */
export async function escavadorFetch(caminho, {
  method = 'GET', body = null, query = null, env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch,
} = {}) {
  const cfg = escavadorConfig(env);
  if (!cfg.token) return { ok: false, status: 0, data: null, creditos: null, error: 'ESCAVADOR_API_TOKEN não configurado no servidor.' };

  let url = /^https?:\/\//.test(caminho) ? caminho : `${cfg.base}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') qs.append(k, String(v));
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/json',
      'User-Agent': 'JorgeAlvimAdvocacia/1.0 (+radar-judicial)',
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body != null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const disp = await proxyDispatcher(cfg.proxy);
  if (disp) opts.dispatcher = disp;

  try {
    const res = await fetchImpl(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* corpo não-JSON */ }
    return {
      ok: res.ok, status: res.status, data,
      creditos: headerCreditos(res.headers),
      error: res.ok ? null : (data?.message || data?.error || `HTTP ${res.status}`),
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, creditos: null, error: e.name === 'TimeoutError' ? 'tempo esgotado' : e.message };
  }
}

// ---------------------------------------------------------------------------
//  Paginação (numerada OU por cursor — a rota define; seguimos o que vier)
// ---------------------------------------------------------------------------
/** Percorre as páginas de uma rota e junta os itens. `max` limita o total (segurança). */
export async function escavadorPaginar(caminho, { query = {}, env = process.env, max = 2000, fetchImpl = fetch, maxPaginas = 50 } = {}) {
  const itens = [];
  let creditos = 0;
  let proximo = null;
  let pagina = 0;
  do {
    const r = proximo
      ? await escavadorFetch(proximo, { env, fetchImpl })
      : await escavadorFetch(caminho, { query, env, fetchImpl });
    if (!r.ok) return { ok: false, status: r.status, error: r.error, itens, creditos };
    if (typeof r.creditos === 'number') creditos += r.creditos;
    const body = r.data || {};
    const lote = pegaLista(body, ['items', 'data', 'itens', 'resultados']) || [];
    for (const it of lote) { if (itens.length >= max) break; itens.push(it); }
    proximo = body?.links?.next || body?.next || null;
    pagina += 1;
  } while (proximo && itens.length < max && pagina < maxPaginas);
  return { ok: true, itens, creditos };
}

// ---------------------------------------------------------------------------
//  Operações de alto nível
// ---------------------------------------------------------------------------
/** Consulta o saldo/créditos da conta (em centavos, conforme a API). */
export async function consultarSaldo({ env = process.env, fetchImpl = fetch } = {}) {
  return escavadorFetch(WIRE.rotas.saldo, { env, fetchImpl });
}

/** Lista os monitoramentos cadastrados na conta. */
export async function listarMonitoramentos({ env = process.env, fetchImpl = fetch } = {}) {
  return escavadorPaginar(WIRE.rotas.monitoramentos, { env, fetchImpl, max: 500 });
}

/**
 * Cria um monitoramento de DIÁRIO OFICIAL por termo (OAB, nome, CPF/CNPJ).
 * É a "rede" mais barata: 1 termo (a OAB) captura todas as intimações em nome do advogado.
 */
export async function criarMonitoramentoDiario({ termo, variacoes = [], origensIds = [], env = process.env, fetchImpl = fetch }) {
  const body = { tipo: 'DIARIO', termo: String(termo || '').trim(), variacoes };
  if (origensIds.length) body[WIRE.origensCampo] = origensIds;
  if (!body.termo) return { ok: false, status: 0, error: 'termo obrigatório.' };
  return escavadorFetch(WIRE.rotas.monitoramentoDiario, { method: 'POST', body, env, fetchImpl });
}

/** Cria um monitoramento de PROCESSO específico pelo número CNJ. */
export async function criarMonitoramentoProcesso({ numeroCnj, frequencia = 'SEMANAL', env = process.env, fetchImpl = fetch }) {
  const numero = soDigitos(numeroCnj);
  if (!numero) return { ok: false, status: 0, error: 'numeroCnj obrigatório.' };
  const body = { tipo: 'UNICO', numero_processo: numero, frequencia };
  return escavadorFetch(WIRE.rotas.monitoramentoProcesso, { method: 'POST', body, env, fetchImpl });
}

/** Remove um monitoramento pelo id. */
export async function removerMonitoramento(id, { env = process.env, fetchImpl = fetch } = {}) {
  if (!id) return { ok: false, status: 0, error: 'id obrigatório.' };
  return escavadorFetch(`${WIRE.rotas.monitoramentos}/${encodeURIComponent(id)}`, { method: 'DELETE', env, fetchImpl });
}

/** Busca processos por OAB, nome, CPF/CNPJ ou número CNJ (consome créditos). */
export async function buscarProcessos({ oab, uf = 'MG', nome, cpfCnpj, numeroCnj, env = process.env, fetchImpl = fetch }) {
  if (numeroCnj) return escavadorFetch(`${WIRE.rotas.buscaProcessoPorNumero}/${soDigitos(numeroCnj)}`, { env, fetchImpl });
  if (oab) return escavadorPaginar(WIRE.rotas.buscaProcessosPorOab, { query: { oab: soDigitos(oab), estado: uf }, env, fetchImpl, max: 500 });
  if (cpfCnpj) return escavadorPaginar(WIRE.rotas.buscaProcessosPorNome, { query: { cpf_cnpj: soDigitos(cpfCnpj) }, env, fetchImpl, max: 500 });
  if (nome) return escavadorPaginar(WIRE.rotas.buscaProcessosPorNome, { query: { q: String(nome).trim() }, env, fetchImpl, max: 500 });
  return { ok: false, status: 0, error: 'Informe oab, nome, cpfCnpj ou numeroCnj.' };
}

// ---------------------------------------------------------------------------
//  Normalização → formato que o motor de sync já grava (court_publications)
// ---------------------------------------------------------------------------
/** Extrai a lista de ocorrências de um corpo de callback/resposta, de forma tolerante. */
export function extrairOcorrencias(payload) {
  if (Array.isArray(payload)) return payload;
  const body = payload || {};
  for (const chave of WIRE.listasOcorrencia) {
    const v = body[chave];
    if (Array.isArray(v)) return v;
  }
  // Às vezes vem aninhado em "monitoramento" ou "resultado".
  for (const wrap of ['monitoramento', 'resultado', 'evento', 'data']) {
    const inner = body[wrap];
    if (inner && typeof inner === 'object') {
      for (const chave of WIRE.listasOcorrencia) if (Array.isArray(inner[chave])) return inner[chave];
    }
  }
  // Objeto único que já parece uma ocorrência.
  if (primeiro(body, WIRE.campos.texto) || primeiro(body, WIRE.campos.numero)) return [body];
  return [];
}

/**
 * Converte UMA ocorrência do Escavador no "item" que ingestComunicaItems/saveComunicaItem espera
 * (mesmo formato da ComunicaAPI). Tolerante a variações de nome de campo (ver WIRE.campos).
 */
export function ocorrenciaParaComunicaItem(oc, idx = 0) {
  const o = oc || {};
  const numeroMasc = primeiro(o, WIRE.campos.numero) || '';
  const numero = soDigitos(numeroMasc);
  const data = normalizaData(primeiro(o, WIRE.campos.data));
  const idBruto = primeiro(o, WIRE.campos.id);
  const id = idBruto != null ? `ESC-${idBruto}` : `ESC-${data || 's'}-${numero || 'sn'}-${idx}`;
  return {
    id,                                   // vira comunicacao_id e PUB-<id> (dedupe)
    numero_processo: numero,
    numeroprocessocommascara: numeroMasc || mascaraCnj(numero),
    siglaTribunal: primeiro(o, WIRE.campos.tribunalSigla) || '',
    nomeOrgao: primeiro(o, WIRE.campos.orgao) || '',
    tipoComunicacao: primeiro(o, WIRE.campos.tipo) || 'Publicação',
    data_disponibilizacao: data,
    datadisponibilizacao: data,           // saveComunicaItem usa este p/ data_publicacao
    texto: primeiro(o, WIRE.campos.texto) || '',
    nomeClasse: primeiro(o, WIRE.campos.classe) || '',
    destinatarios: toArray(primeiro(o, WIRE.campos.partes)),
    _oab: soDigitos(primeiro(o, WIRE.campos.oab) || ''),
    _uf: (primeiro(o, WIRE.campos.oabUf) || '').toString().toUpperCase().slice(0, 2),
  };
}

// ---------------------------------------------------------------------------
//  Utilitários puros
// ---------------------------------------------------------------------------
export function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

function primeiro(obj, chaves) {
  for (const k of chaves) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}
function pegaLista(obj, chaves) {
  for (const k of chaves) if (Array.isArray(obj?.[k])) return obj[k];
  return null;
}
function toArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }

/** Normaliza data para YYYY-MM-DD (aceita ISO, dd/mm/aaaa, timestamp). */
export function normalizaData(v) {
  if (!v) return '';
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

/** Aplica a máscara CNJ a um número só com dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO). */
export function mascaraCnj(numero) {
  const n = soDigitos(numero);
  if (n.length !== 20) return numero || '';
  return `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n.slice(13, 14)}.${n.slice(14, 16)}.${n.slice(16, 20)}`;
}
