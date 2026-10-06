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
    saldo: '/quantidade-creditos',   // {"quantidade_creditos":N,"saldo":200,"saldo_descricao":"R$ 200,00"}
    monitoramentos: '/monitoramentos',
    busca: '/busca',                 // full-text em DIÁRIOS: ?q=<termo>&qo=t -> items[] (publicações)
  },
  // Chaves de campo tentadas em ordem — cobrem o item de DIÁRIO do Escavador e a ComunicaAPI.
  campos: {
    id: ['id', 'diario_id', 'ocorrencia_id', 'aparicao_id', 'publicacao_id'],
    numero: ['numero_processo', 'numero_unico', 'numero', 'numeroProcesso'],
    tribunalSigla: ['diario_sigla', 'sigla_tribunal', 'siglaTribunal', 'tribunal_sigla'],
    orgao: ['caderno', 'nome_orgao', 'orgao', 'vara', 'nomeOrgao'],
    tipo: ['tipo_comunicacao', 'tipoComunicacao', 'especie'],
    data: ['diario_data', 'data_disponibilizacao', 'data_publicacao', 'data', 'dataDisponibilizacao'],
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
};

// Número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) — para extrair de dentro do texto da publicação.
export const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

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
      error: res.ok ? null : (data?.message || data?.error || (Array.isArray(data?.errors) ? data.errors.join(' | ') : null) || `HTTP ${res.status}`),
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
 * Cria um monitoramento de DIÁRIO OFICIAL por termo (ex.: a OAB "222943/MG").
 * É a "rede" das intimações: o termo é casado nos diários e as publicações chegam no callback.
 * A API exige: tipo + termo + onde monitorar (todos os diários, ou estados/origens).
 */
export async function criarMonitoramentoDiario({ termo, variacoes = [], estadosIds = [], origensIds = [], todosDiarios = true, tipo = 'UNICO', env = process.env, fetchImpl = fetch }) {
  const t = String(termo || '').trim();
  if (!t) return { ok: false, status: 0, error: 'termo obrigatório.' };
  const body = { tipo, termo: t, variacoes };
  if (origensIds.length) body.origens_ids = origensIds;
  else if (estadosIds.length) body.estados_ids = estadosIds;
  else body.monitorar_em_todos_diarios = !!todosDiarios;
  return escavadorFetch(WIRE.rotas.monitoramentos, { method: 'POST', body, env, fetchImpl });
}

/** Cria um monitoramento de PROCESSO pelo id interno do Escavador (processo_id). */
export async function criarMonitoramentoProcesso({ processoId, tipo = 'UNICO', env = process.env, fetchImpl = fetch }) {
  if (!processoId) return { ok: false, status: 0, error: 'processo_id obrigatório (resolva o CNJ antes).' };
  return escavadorFetch(WIRE.rotas.monitoramentos, { method: 'POST', body: { tipo, processo_id: processoId }, env, fetchImpl });
}

/** Remove um monitoramento pelo id. */
export async function removerMonitoramento(id, { env = process.env, fetchImpl = fetch } = {}) {
  if (!id) return { ok: false, status: 0, error: 'id obrigatório.' };
  return escavadorFetch(`${WIRE.rotas.monitoramentos}/${encodeURIComponent(id)}`, { method: 'DELETE', env, fetchImpl });
}

/**
 * Busca PUBLICAÇÕES de diário no Escavador (full-text, rota /busca?q=&qo=t). O número do
 * processo vem dentro do texto. Para OAB, casa "<numero>/<UF>" no texto (evita o homônimo de
 * outro estado — ex.: OAB 222943/SP é outra pessoa). Só mantém itens de diário com texto.
 */
export async function buscarProcessos({ oab, uf = 'MG', nome, cpfCnpj, numeroCnj, env = process.env, fetchImpl = fetch, max = 300 }) {
  let termo = '';
  let filtroRe = null; // quando setado, só mantém publicações cujo texto casa (ex.: a OAB com a UF)
  if (numeroCnj) {
    termo = String(numeroCnj).trim();
  } else if (oab) {
    const u = String(uf || 'MG').toUpperCase();
    const num = soDigitos(oab);
    termo = `${num}/${u}`;                 // busca "222943/MG" (narra na origem, evita SP)
    filtroRe = new RegExp(`\\b${num}\\s*/\\s*${u}\\b`, 'i');
  } else if (cpfCnpj) {
    termo = soDigitos(cpfCnpj);
  } else if (nome) {
    termo = String(nome).trim();
  } else {
    return { ok: false, status: 0, error: 'Informe oab, nome, cpfCnpj ou numeroCnj.' };
  }

  const r = await escavadorPaginar(WIRE.rotas.busca, { query: { q: termo, qo: 't' }, env, fetchImpl, max });
  if (!r.ok) return r;
  // Só publicações de diário (que têm texto); descarta resultados de pessoa/empresa.
  let itens = r.itens.filter((it) => it && (it.tipo_resultado === 'Diario' || primeiro(it, WIRE.campos.texto)));
  if (filtroRe) itens = itens.filter((it) => filtroRe.test(primeiro(it, WIRE.campos.texto) || ''));
  return { ok: true, itens, creditos: r.creditos };
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
  const texto = primeiro(o, WIRE.campos.texto) || '';
  // O número do processo vem em campo próprio OU dentro do texto da publicação do diário.
  const numeroMasc = primeiro(o, WIRE.campos.numero) || (texto.match(CNJ_RE) || [''])[0];
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

/**
 * Converte um processo retornado pela BUSCA do Escavador no formato que o importador do
 * escritório espera (process_data). Tolerante a variações de nome de campo (ver WIRE).
 */
export function processoParaImport(p) {
  const o = p || {};
  // Já normalizado (veio de uma busca que normalizamos)? Mantém como está — idempotente.
  if (Array.isArray(o.polo_ativo) || Array.isArray(o.polo_passivo)) {
    return {
      numero_processo: o.numero_processo || primeiro(o, WIRE.campos.numero) || '',
      tribunal_code: String(o.tribunal_code || primeiro(o, WIRE.campos.tribunalSigla) || '').toUpperCase(),
      tribunal_name: o.tribunal_name || o.tribunal_code || 'Tribunal',
      class_name: o.class_name || primeiro(o, WIRE.campos.classe) || 'Ação Judicial',
      subject: o.subject || '',
      court_branch: o.court_branch || '',
      polo_ativo: toArray(o.polo_ativo),
      polo_passivo: toArray(o.polo_passivo),
      resumo: o.resumo || resumoTexto(primeiro(o, WIRE.campos.texto)),
      link: o.link || o.link_api || '',
    };
  }
  const texto = primeiro(o, WIRE.campos.texto) || '';
  // Número em campo próprio OU extraído do texto do diário (publicação do Escavador).
  const numero = primeiro(o, WIRE.campos.numero) || o.numero_cnj || o.numeroProcessoUnico || (texto.match(CNJ_RE) || [''])[0];
  const envolvidos = toArray(primeiro(o, ['envolvidos', 'partes', 'destinatarios', 'advogados']));
  const doLado = (re) => envolvidos
    .filter((e) => re.test(String(e.polo || e.tipo || e.tipo_parte || e.posicao || '')))
    .map((e) => ({ name: e.nome || e.name || '', document: soDigitos(e.cpf || e.cnpj || e.documento || '') }));
  let ativo = doLado(/ativ|autor|exequ|reclamante|requerente|impetrante/i);
  let passivo = doLado(/passiv|réu|reu|execut|reclamad|requerid|impetrad/i);
  if (!ativo.length && envolvidos.length) ativo = [{ name: envolvidos[0].nome || envolvidos[0].name || '', document: '' }];
  const sigla = primeiro(o, WIRE.campos.tribunalSigla) || '';
  return {
    numero_processo: numero,
    tribunal_code: String(sigla).toUpperCase(),
    tribunal_name: sigla || 'Tribunal',
    class_name: primeiro(o, WIRE.campos.classe) || 'Ação Judicial',
    subject: primeiro(o, ['assunto', 'subject', 'objeto']) || '',
    court_branch: primeiro(o, WIRE.campos.orgao) || '',
    polo_ativo: ativo,
    polo_passivo: passivo,
    resumo: resumoTexto(texto),
    link: o.link || o.link_api || '',
  };
}

/** Trecho curto e limpo do texto da publicação (para exibir e guardar nas observações). */
export function resumoTexto(texto, max = 200) {
  const s = String(texto || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).trim() + '…' : s;
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
