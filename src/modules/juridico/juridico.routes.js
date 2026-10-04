/**
 * Módulo JURÍDICO (radar) — intimações DJEN, DataJud/CNJ, prazos e tribunais.
 * Rotas /api/judicial e /api/court. Extraído do server.js.
 */
import { computeLegalDeadline } from '../../shared/deadline-calc.js';
import { ensureCourtHolidays, holidayCoverage } from '../../shared/court-calendar.js';
import express from 'express';
import { execFile } from 'node:child_process';
import path from 'path';
import { ROOT_DIR } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { syncComunicaApi, registerSyncTask } from '../sync/sync.routes.js';
import { generateNextLawsuitId, generateNextClientFullId } from '../../shared/ids.js';
import { hashPassword } from '../../shared/password-crypto.js';

export const juridicoRouter = express.Router();

// Catálogo de Tribunais Brasileiros Homologados no DataJud & MNI
const JUDICIAL_TRIBUNALS = {
  tjmg: {
    code: 'tjmg',
    name: 'Tribunal de Justiça de Minas Gerais',
    segment: 'Justiça Estadual',
    state: 'MG',
    apiEndpoint: 'api_publica_tjmg',
    system: 'PJe / Themis',
    portalUrl: (npu) => `https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  trf6: {
    code: 'trf6',
    name: 'Tribunal Regional Federal da 6ª Região (MG)',
    segment: 'Justiça Federal',
    state: 'MG',
    apiEndpoint: 'api_publica_trf6',
    system: 'PJe 1G/2G',
    portalUrl: (npu) => `https://pje1g.trf6.jus.br/consultapublica/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  trf1: {
    code: 'trf1',
    name: 'Tribunal Regional Federal da 1ª Região',
    segment: 'Justiça Federal',
    state: 'DF/Nacional',
    apiEndpoint: 'api_publica_trf1',
    system: 'PJe 1G/2G',
    portalUrl: (npu) => `https://pje1g.trf1.jus.br/consultapublica/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  trt3: {
    code: 'trt3',
    name: 'Tribunal Regional do Trabalho da 3ª Região (MG)',
    segment: 'Justiça do Trabalho',
    state: 'MG',
    apiEndpoint: 'api_publica_trt3',
    system: 'PJe-JT',
    portalUrl: (npu) => `https://pje.trt3.jus.br/consultapublica/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  tjsp: {
    code: 'tjsp',
    name: 'Tribunal de Justiça de São Paulo',
    segment: 'Justiça Estadual',
    state: 'SP',
    apiEndpoint: 'api_publica_tjsp',
    system: 'ESAJ',
    portalUrl: (npu) => `https://esaj.tjsp.jus.br/cpopg/search.do?conversationId=&cbPesquisa=NUMPROC&numeroDigitoAnoUnificado=${encodeURIComponent(npu || '')}&foroNumeroUnificado=`
  },
  stj: {
    code: 'stj',
    name: 'Superior Tribunal de Justiça',
    segment: 'Tribunal Superior',
    state: 'DF',
    apiEndpoint: 'api_publica_stj',
    system: 'Processo Eletrônico STJ',
    portalUrl: (npu) => `https://processo.stj.jus.br/processo/pesquisa/?num_processo=${encodeURIComponent(npu || '')}`
  },
  stf: {
    code: 'stf',
    name: 'Supremo Tribunal Federal',
    segment: 'Tribunal Superior',
    state: 'DF',
    apiEndpoint: 'api_publica_stf',
    system: 'Portal STF Processos',
    portalUrl: (npu) => `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${encodeURIComponent(npu || '')}`
  },
  tst: {
    code: 'tst',
    name: 'Tribunal Superior do Trabalho',
    segment: 'Tribunal Superior',
    state: 'DF',
    apiEndpoint: 'api_publica_tst',
    system: 'PJe TST',
    portalUrl: (npu) => `https://consultapje.tst.jus.br/`
  }
};

/**
 * Identifica o tribunal de origem a partir da estrutura NPU / CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)
 */
function detectTribunalFromNPU(npu) {
  if (!npu) return null;
  const digits = npu.replace(/\D/g, '');
  if (digits.length !== 20) return null;

  const ramo = digits.substring(13, 14); // J (8=Estadual, 4=Federal, 5=Trabalho, 3=STJ, 1=STF)
  const tribunalId = digits.substring(14, 16); // TR

  if (ramo === '8' && tribunalId === '13') return 'tjmg';
  if (ramo === '8' && tribunalId === '26') return 'tjsp';
  if (ramo === '4' && tribunalId === '06') return 'trf6';
  if (ramo === '4' && tribunalId === '01') return 'trf1';
  if (ramo === '5' && tribunalId === '03') return 'trt3';
  if (ramo === '3' && tribunalId === '00') return 'stj';
  if (ramo === '1' && tribunalId === '00') return 'stf';
  if (ramo === '5' && tribunalId === '00') return 'tst';

  return null;
}

/** Valor do cabeçalho Authorization do DataJud ("APIKey <chave>"); aceita a chave com ou sem o prefixo. */
export function datajudAuthHeader(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  return /^APIKey\s+/i.test(v) ? v : `APIKey ${v}`;
}

/**
 * Consulta oficial à API REST / ElasticSearch do DataJud (CNJ)
 */
async function callDataJudAPI(tribunalCode, esQuery) {
  const tribunal = JUDICIAL_TRIBUNALS[tribunalCode];
  if (!tribunal) throw new Error(`Tribunal '${tribunalCode}' não suportado.`);

  // A chave NÃO fica no código: vem só de DATAJUD_API_KEY (cofre do servidor: node scripts/env-vault.js set DATAJUD_API_KEY).
  const apiKey = datajudAuthHeader(process.env.DATAJUD_API_KEY);
  if (!apiKey) {
    if (!callDataJudAPI.avisou) {
      callDataJudAPI.avisou = true;
      console.warn('[DATAJUD] DATAJUD_API_KEY não configurada: o Radar Judicial por DataJud fica indisponível até configurar (veja .env.example).');
    }
    return { success: false, error: 'Chave do DataJud não configurada no servidor (DATAJUD_API_KEY).' };
  }
  const url = `https://api-publica.datajud.cnj.jus.br/${tribunal.apiEndpoint}/_search`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'JorgeAlvimAdvocacia-LegalTech/2.0'
      },
      body: JSON.stringify(esQuery),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    } else {
      const errText = await res.text();
      console.warn(`[DATAJUD] Tribunal ${tribunalCode} respondeu HTTP ${res.status}:`, errText.substring(0, 150));
      return { success: false, status: res.status, error: 'Resposta não-200 do DataJud' };
    }
  } catch (err) {
    console.warn(`[DATAJUD] Erro ao consultar ${tribunalCode}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Normaliza e formata o resultado bruto do DataJud / Processo
 */
function normalizeJudicialHit(hit, tribunalCode) {
  const src = hit._source || hit;
  const tribunal = JUDICIAL_TRIBUNALS[tribunalCode] || { name: 'Poder Judiciário', segment: 'Nacional' };
  const rawNumber = src.numeroProcesso || '';
  
  // Formata o número NPU: NNNNNNN-DD.AAAA.J.TR.OOOO
  let formattedNumber = rawNumber;
  if (rawNumber.length === 20) {
    formattedNumber = `${rawNumber.slice(0, 7)}-${rawNumber.slice(7, 9)}.${rawNumber.slice(9, 13)}.${rawNumber.slice(13, 14)}.${rawNumber.slice(14, 16)}.${rawNumber.slice(16, 20)}`;
  }

  // Extrair Polos (Partes)
  const poloAtivo = [];
  const poloPassivo = [];
  const advogados = [];

  if (Array.isArray(src.polos)) {
    src.polos.forEach(polo => {
      const isAtivo = polo.polo === 'AT' || polo.polo === 'A' || polo.tipoPolo === 'ATIVO';
      if (Array.isArray(polo.partes)) {
        polo.partes.forEach(p => {
          const nome = p.nome || p.pessoa?.nome || 'Parte Sob Segredo';
          const doc = p.numeroDocumentoPrincipal || p.cpf || p.cnpj || '';
          if (isAtivo) poloAtivo.push({ name: nome, document: doc });
          else poloPassivo.push({ name: nome, document: doc });

          if (Array.isArray(p.advogados)) {
            p.advogados.forEach(adv => {
              advogados.push({
                name: adv.nome || 'Advogado',
                oab: adv.numeroOab || adv.oab || 'OAB Registrada',
                uf: adv.ufOab || ''
              });
            });
          }
        });
      }
    });
  }

  // Extrair Movimentações
  const movements = [];
  if (Array.isArray(src.movimentos)) {
    src.movimentos.forEach(m => {
      movements.push({
        date: m.dataHora || src.dataHoraUltimaAtualizacao || new Date().toISOString(),
        title: m.nome || m.descricao || 'Movimentação Processual',
        details: m.complementosTabelados?.map(c => `${c.nome}: ${c.descricao}`).join(' | ') || m.detalhes || '',
        code: m.codigo
      });
    });
  }

  // Ordenar movimentações da mais recente para a mais antiga
  movements.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Formatar data de distribuição
  let distDate = src.dataAjuizamento || src.dataDistribuicao || '';
  if (typeof distDate === 'string' && distDate.length >= 8 && !distDate.includes('-')) {
    distDate = `${distDate.slice(0, 4)}-${distDate.slice(4, 6)}-${distDate.slice(6, 8)}`;
  }

  return {
    id: src.id || rawNumber,
    numero_processo: formattedNumber,
    numero_processo_raw: rawNumber,
    tribunal_code: tribunalCode,
    tribunal_name: tribunal.name,
    segment: tribunal.segment,
    court_system: tribunal.system || 'PJe',
    // NADA aqui é inventado: o que a base pública do CNJ não informa aparece como "não informado" (ou vazio).
    class_name: src.classe?.nome || 'Não informado',
    subject: Array.isArray(src.assuntos) && src.assuntos.length ? src.assuntos.map(a => a.nome).join(', ') : (src.assunto || 'Não informado'),
    distribution_date: distDate,
    court_branch: src.orgaoJulgador?.nome || 'Não informado',
    city: src.orgaoJulgador?.municipio || '',
    confidential: !!src.nivelSigilo,
    polo_ativo: poloAtivo.length > 0 ? poloAtivo : [{ name: 'Não informado pela base pública do CNJ', document: '' }],
    polo_passivo: poloPassivo.length > 0 ? poloPassivo : [{ name: 'Não informado pela base pública do CNJ', document: '' }],
    lawyers: advogados,
    movements,
    direct_portal_url: tribunal.portalUrl ? tribunal.portalUrl(formattedNumber) : '',
    public_documents: [],   // a base pública do DataJud não traz documentos: use o portal do tribunal
    origin: 'datajud'
  };
}

/**
 * Executa o motor especializado em Python (radar_crawler.py)
 */
function runPythonRadarCrawler({ queryType, queryTerm, tribunal = 'all', uf = 'MG' }) {
  return new Promise((resolve) => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'radar_crawler.py');
    const args = [
      scriptPath,
      '--type', queryType || 'number',
      '--term', queryTerm,
      '--tribunal', tribunal || 'all',
      '--uf', uf || 'MG'
    ];

    execFile('python3', args, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.warn('⚠️ [RADAR PYTHON CRAWLER WARN]', error.message);
        return resolve({ success: false, error: `motor Python indisponível (${error.code === 'ENOENT' ? 'python3 não instalado' : error.message})` });
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        console.warn('⚠️ [RADAR PYTHON PARSE ERROR]', e.message);
        resolve({ success: false, error: 'o motor Python devolveu uma resposta inválida' });
      }
    });
  });
}

/**
 * Links oficiais de consulta para o(s) tribunal(is) da busca (nunca um "processo de mentira": só o caminho para o portal).
 */
function judicialPortalLinks(tribunal, term) {
  const codes = tribunal !== 'all' && JUDICIAL_TRIBUNALS[tribunal] ? [tribunal] : ['tjmg', 'trf6', 'trt3', 'tjsp'];
  return codes
    .map((c) => JUDICIAL_TRIBUNALS[c])
    .filter((t) => t && typeof t.portalUrl === 'function')
    .map((t) => ({ name: t.name, url: t.portalUrl(term) }));
}

/** Processo do ESCRITÓRIO (tabela lawsuits) no formato do Radar: só campos reais; o que falta aparece como "não informado". */
function localLawsuitToRadar(lp) {
  const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(lp.client_id);
  const movements = db.prepare(`SELECT * FROM lawsuit_movements WHERE lawsuit_id = ? ORDER BY movement_date DESC`).all(lp.id);
  return {
    id: lp.id,
    numero_processo: lp.cnj_number,
    numero_processo_raw: String(lp.cnj_number || '').replace(/\D/g, ''),
    tribunal_code: lp.tribunal ? String(lp.tribunal).split(/\s|-/)[0].toLowerCase() : '',
    tribunal_name: lp.tribunal || 'Não informado',
    segment: '',
    court_system: '',
    class_name: lp.action_type || 'Não informado',
    subject: lp.subject || lp.notes || 'Não informado',
    distribution_date: lp.distribution_date || '',
    court_branch: lp.court_branch || 'Não informado',
    city: '',
    confidential: false,
    polo_ativo: client ? [{ name: client.full_name, document: client.cpf || client.cnpj || '' }] : [{ name: 'Não informado', document: '' }],
    polo_passivo: [{ name: 'Não informado', document: '' }],
    lawyers: [],
    movements: movements.map((m) => ({ date: m.movement_date || m.created_at, title: m.title, details: m.description || '' })),
    direct_portal_url: '',
    public_documents: [],
    origin: 'escritorio',
    source: 'Base do Escritório'
  };
}

/**
 * Orquestrador central de busca. REGRA DE OURO: só devolve dado REAL (DataJud, DJEN ou o cadastro do próprio
 * escritório). Quando não acha, devolve lista vazia + o MOTIVO (fontes consultadas) + links do portal oficial.
 */
async function searchJudicialNetwork({ queryType, queryTerm, tribunal = 'all' }) {
  const cleanTerm = queryTerm.trim();
  const digitsOnly = cleanTerm.replace(/\D/g, '');
  const now = new Date();
  const sources = []; // { name, ok, detail }: o que foi consultado e o que respondeu
  const notices = []; // limites da busca, em linguagem simples

  if (queryType === 'cpf' || queryType === 'cnpj') {
    notices.push('Não existe busca por CPF/CNPJ nas bases públicas (DataJud e Diário da Justiça). Esta busca só encontra processos do escritório cadastrados neste sistema; para os demais, use o portal do tribunal.');
  } else if (queryType === 'name') {
    notices.push('A busca por nome usa o Diário da Justiça (DJEN): só encontra quem teve intimação publicada. O DataJud público não permite buscar por nome.');
  } else if (queryType === 'oab') {
    notices.push('A busca por OAB usa o Diário da Justiça (DJEN): mostra processos com intimações publicadas para essa OAB.');
  }
  const portal_links = judicialPortalLinks(tribunal, cleanTerm);
  const base = { notices, portal_links };

  // 1. Cache local (2 horas). Só guardamos resultados reais de fontes externas.
  try {
    const cached = db.prepare(`
      SELECT * FROM judicial_search_cache 
      WHERE query_type = ? AND query_term = ? AND tribunal = ? AND expires_at > ?
    `).get(queryType, cleanTerm, tribunal, now.toISOString());
    if (cached) {
      console.log(`⚡ [RADAR JUDICIAL CACHE HIT] Retornando ${cached.total_results} processo(s) do cache para '${cleanTerm}'`);
      return { success: true, source: 'cache', total: cached.total_results, processes: JSON.parse(cached.results_json), sources: [{ name: 'Cache local (2 h)', ok: true, detail: `${cached.total_results} resultado(s)` }], ...base };
    }
  } catch (err) {
    console.warn('Erro ao consultar cache judicial:', err);
  }

  const saveCache = (processes) => {
    if (!processes.length || processes.every((p) => p.origin === 'escritorio' || p.source === 'Base do Escritório')) return;
    try {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO judicial_search_cache (query_type, query_term, tribunal, total_results, results_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(queryType, cleanTerm, tribunal, processes.length, JSON.stringify(processes), now.toISOString(), expiresAt);
    } catch (err) { /* cache é opcional */ }
  };

  // 2. Motor Python (DataJud + DJEN + cadastro do escritório)
  const pyResult = await runPythonRadarCrawler({ queryType, queryTerm: cleanTerm, tribunal });
  if (pyResult && pyResult.success) {
    const n = (pyResult.processes || []).length;
    sources.push({ name: 'Motor Python (DataJud + Diário da Justiça)', ok: true, detail: `${n} resultado(s)` });
    (pyResult.errors || []).forEach((e) => sources.push({ name: e.source || 'Consulta externa', ok: false, detail: e.detail }));
    if (n > 0) {
      console.log(`🐍 [RADAR PYTHON CRAWLER] ${n} processo(s) capturados com sucesso para '${cleanTerm}'`);
      saveCache(pyResult.processes);
      return { success: true, engine: pyResult.engine, source: 'python_crawler', total: n, processes: pyResult.processes, sources, ...base };
    }
  } else {
    sources.push({ name: 'Motor Python (DataJud + Diário da Justiça)', ok: false, detail: (pyResult && pyResult.error) || 'não respondeu' });
  }

  let aggregated = [];

  // 3. Caminho nativo: DataJud por NÚMERO do processo (é o único tipo de busca que o DataJud público aceita)
  if (queryType === 'number' && digitsOnly.length >= 8) {
    const detected = detectTribunalFromNPU(digitsOnly);
    const targets = tribunal !== 'all' && JUDICIAL_TRIBUNALS[tribunal] ? [tribunal] : detected ? [detected] : ['tjmg', 'trf6', 'trf1', 'trt3', 'tjsp', 'stj', 'stf', 'tst'];
    const esQuery = { size: 10, query: { match: { numeroProcesso: digitsOnly } } };
    const lists = await Promise.all(
      targets.map(async (code) => {
        try {
          const res = await callDataJudAPI(code, esQuery);
          if (res.success) {
            const hits = res.data?.hits?.hits || [];
            sources.push({ name: `DataJud ${code.toUpperCase()}`, ok: true, detail: `${hits.length} resultado(s)` });
            return hits.map((hit) => normalizeJudicialHit(hit, code));
          }
          sources.push({ name: `DataJud ${code.toUpperCase()}`, ok: false, detail: res.status ? `HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (chave recusada pelo CNJ)' : ''}` : res.error });
        } catch (e) {
          sources.push({ name: `DataJud ${code.toUpperCase()}`, ok: false, detail: e.message });
        }
        return [];
      })
    );
    lists.forEach((l) => aggregated.push(...l));
  } else if (queryType === 'number') {
    notices.push('Informe o número completo do processo (CNJ, 20 dígitos) para consultar o DataJud.');
  }

  // 4. Cadastro do ESCRITÓRIO (dados reais gravados aqui; nada é inventado)
  if (aggregated.length === 0) {
    try {
      const cleanDoc = digitsOnly;
      const firmOab = cleanTerm.includes('222943') || cleanTerm.includes('222.943');
      let local = [];
      if (queryType === 'number') {
        local = db.prepare(`SELECT * FROM lawsuits WHERE (cnj_number LIKE ? OR cnj_number LIKE ?) AND deleted_at IS NULL`).all(`%${cleanTerm}%`, `%${digitsOnly}%`);
      } else if (queryType === 'oab') {
        // Só a OAB do próprio escritório lista os processos dele; a de terceiros não devolve nada daqui.
        if (firmOab) local = db.prepare(`SELECT * FROM lawsuits WHERE deleted_at IS NULL ORDER BY created_at DESC`).all();
      } else if (cleanTerm) {
        local = db.prepare(`
          SELECT l.* FROM lawsuits l
          LEFT JOIN clients c ON l.client_id = c.id
          WHERE (c.full_name LIKE ? OR c.cpf LIKE ? OR c.cnpj LIKE ?
             OR (? != '' AND REPLACE(REPLACE(REPLACE(c.cpf, '.', ''), '-', ''), ' ', '') LIKE ?)
             OR (? != '' AND REPLACE(REPLACE(REPLACE(REPLACE(c.cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ?)
             OR l.action_type LIKE ? OR l.subject LIKE ? OR l.court_branch LIKE ?)
            AND l.deleted_at IS NULL
        `).all(`%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, cleanDoc, `%${cleanDoc}%`, cleanDoc, `%${cleanDoc}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`);
        if (local.length === 0) {
          const clients = db.prepare(`
            SELECT full_name FROM clients 
            WHERE full_name LIKE ? OR cpf LIKE ? OR cnpj LIKE ?
               OR (? != '' AND REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') LIKE ?)
               OR (? != '' AND REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ?)
          `).all(`%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, cleanDoc, `%${cleanDoc}%`, cleanDoc, `%${cleanDoc}%`);
          if (clients.length) notices.push(`Cliente encontrado no cadastro (${clients.map((c) => c.full_name).join(', ')}), mas sem processo cadastrado neste sistema.`);
        }
      }
      sources.push({ name: 'Cadastro do escritório', ok: true, detail: `${local.length} processo(s) cadastrado(s)` });
      aggregated = local.map(localLawsuitToRadar);
    } catch (e) {
      sources.push({ name: 'Cadastro do escritório', ok: false, detail: e.message });
    }
  }

  if (aggregated.length === 0) {
    notices.push('Nenhum processo encontrado nas fontes consultadas. Isso NÃO prova que o processo não existe: confira as fontes abaixo e use o portal oficial do tribunal.');
  }
  saveCache(aggregated);
  return { success: true, source: 'live_network', total: aggregated.length, processes: aggregated, sources, ...base };
}

// ---------------- ROTAS DO RADAR JUDICIAL ----------------

/**
 * 1. POST /api/judicial/search - Busca Unificada de Processos
 */
juridicoRouter.post('/api/judicial/search', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { query_type = 'number', query_term, tribunal = 'all' } = body;

    if (!query_term || !query_term.trim()) {
      return res.status(400).json({ error: 'Informe o número do processo, nome, CPF ou CNPJ para pesquisar.' });
    }

    const result = await searchJudicialNetwork({
      queryType: query_type,
      queryTerm: query_term,
      tribunal
    });

    logAudit(req, {
      event_type: 'ACESSO',
      event_name: 'BUSCA_RADAR_JUDICIAL',
      module: 'RADAR_JUDICIAL',
      user_name: req.user ? req.user.name : 'Operador',
      description: `Busca no Radar Judicial por ${query_type.toUpperCase()}: '${query_term}' (Tribunal: ${tribunal}) - ${result.total} resultado(s) encontrado(s).`,
      details: { query_type, query_term, tribunal, total_found: result.total }
    });

    return res.json(result);
  } catch (error) {
    console.error('[ERRO] Falha no Radar Judicial:', error);
    return res.status(500).json({ error: 'Erro ao consultar a base de dados judicial: ' + error.message });
  }
});

/**
 * 2. GET /api/judicial/tribunals - Lista de Tribunais Homologados
 */
juridicoRouter.get('/api/judicial/tribunals', requireAuth, (req, res) => {
  return res.json({
    success: true,
    tribunals: Object.values(JUDICIAL_TRIBUNALS).map(t => ({
      code: t.code,
      name: t.name,
      segment: t.segment,
      state: t.state,
      system: t.system
    }))
  });
});

// Tarefa de sincronização registrada no Motor: puxa andamentos do DataJud/CNJ
// para os processos ativos do escritório, gravando os novos em lawsuit_movements.
async function syncActiveLawsuitMovements() {
  let checked = 0, newMovements = 0;
  let lawsuits = [];
  try {
    lawsuits = db.prepare(`SELECT id, cnj_number, client_id FROM lawsuits WHERE (status = 'Em Andamento' OR status IS NULL) AND deleted_at IS NULL LIMIT 100`).all();
  } catch (e) { return { lawsuitsChecked: 0, newMovements: 0 }; }

  for (const ls of lawsuits) {
    const code = detectTribunalFromNPU(ls.cnj_number);
    if (!code) continue; // sem tribunal identificável, pula (evita varrer todos)
    checked++;
    try {
      const r = await searchJudicialNetwork({ queryType: 'number', queryTerm: ls.cnj_number, tribunal: code });
      // Só andamentos de fonte REAL (DataJud/DJEN). Nunca o cadastro do próprio escritório nem texto de enchimento.
      const proc = (r.processes || []).find((p) => p.origin === 'datajud' || p.source === 'DataJud CNJ' || p.source === 'DJEN / ComunicaAPI');
      if (proc && Array.isArray(proc.movements)) {
        for (const m of proc.movements) {
          const mdate = String(m.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
          const title = String(m.title || 'Movimentação').slice(0, 300);
          const exists = db.prepare(`SELECT 1 FROM lawsuit_movements WHERE lawsuit_id = ? AND movement_date = ? AND title = ?`).get(ls.id, mdate, title);
          if (!exists) {
            db.prepare(`INSERT INTO lawsuit_movements (lawsuit_id, movement_date, title, description, created_at) VALUES (?, ?, ?, ?, ?)`)
              .run(ls.id, mdate, title, String(m.details || '').slice(0, 2000), new Date().toISOString());
            newMovements++;
          }
        }
      }
    } catch (e) { /* processo indisponível no DataJud, segue */ }
    await new Promise(rr => setTimeout(rr, 300)); // polidez com a API do CNJ
  }
  return { lawsuitsChecked: checked, newMovements };
}
registerSyncTask('datajud_movements', syncActiveLawsuitMovements);

/**
 * 3. POST /api/judicial/import-to-office - Importação de Processo para a Base do Escritório com 1 Clique
 */
juridicoRouter.post('/api/judicial/import-to-office', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const { process_data } = body;
    if (!process_data || !process_data.numero_processo) {
      return res.status(400).json({ error: 'Dados do processo inválidos para importação.' });
    }

    const lawsuitNumber = process_data.numero_processo;
    const authorName = process_data.polo_ativo?.[0]?.name || 'Parte Autora Importada';
    const authorDoc = process_data.polo_ativo?.[0]?.document || '';
    const defendantName = process_data.polo_passivo?.[0]?.name || 'Parte Ré';
    const courtName = process_data.tribunal_name || 'Tribunal de Justiça';
    const actionType = process_data.class_name || 'Ação Judicial';
    const description = process_data.subject || 'Ação importada via Radar Judicial (DataJud / MNI)';
    const now = new Date().toISOString();

    // 1. Localizar ou Criar Cliente
    let client = null;
    const cleanDocDigits = authorDoc.replace(/\D/g, '');
    if (cleanDocDigits.length >= 11) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      `).get(cleanDocDigits, cleanDocDigits);
    }

    if (!client) {
      client = db.prepare(`SELECT * FROM clients WHERE LOWER(TRIM(full_name)) = ?`).get(authorName.toLowerCase().trim());
    }

    let clientId = client ? client.id : null;

    if (!clientId) {
      clientId = generateNextClientFullId();
      const defaultPass = hashPassword('123456');
      db.prepare(`
        INSERT INTO clients (
          id, client_type, full_name, cpf, cnpj, email, phone,
          city, state, contract_value, contract_status,
          password_hash, salt, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clientId,
        cleanDocDigits.length > 11 ? 'PJ' : 'PF',
        authorName,
        cleanDocDigits.length <= 11 ? authorDoc : '',
        cleanDocDigits.length > 11 ? authorDoc : '',
        'contato@' + authorName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com.br',
        '(32) 99815-3429',
        'Juiz de Fora',
        'MG',
        0,
        'Ativo',
        defaultPass.hash,
        defaultPass.salt,
        now,
        now
      );
    }

    // 2. Verificar se o processo já existe
    let lawsuit = db.prepare(`SELECT * FROM lawsuits WHERE cnj_number = ?`).get(lawsuitNumber);
    let lawsuitId = lawsuit ? lawsuit.id : generateNextLawsuitId();

    if (!lawsuit) {
      db.prepare(`
        INSERT INTO lawsuits (
          id, client_id, cnj_number, tribunal, instance,
          action_type, court_branch, subject, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        lawsuitId,
        clientId,
        lawsuitNumber,
        (process_data.tribunal_code || 'TJMG').toUpperCase(),
        '1ª Instância',
        actionType,
        process_data.court_branch || 'Vara Cível de Juiz de Fora - MG',
        description,
        'Em Andamento',
        `Importado via Radar Judicial. Réu: ${defendantName}`,
        now,
        now
      );
    } else {
      // Atualizar dados
      db.prepare(`
        UPDATE lawsuits SET
          tribunal = ?,
          court_branch = ?,
          action_type = ?,
          subject = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        (process_data.tribunal_code || 'TJMG').toUpperCase(),
        process_data.court_branch || 'Vara Cível de Juiz de Fora - MG',
        actionType,
        description,
        `Importado via Radar Judicial. Réu: ${defendantName}`,
        now,
        lawsuit.id
      );
    }

    // 3. Inserir Movimentações Históricas
    if (Array.isArray(process_data.movements)) {
      const insertMovStmt = db.prepare(`
        INSERT INTO lawsuit_movements (lawsuit_id, movement_date, title, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      process_data.movements.forEach(m => {
        const movDate = m.date ? m.date.split('T')[0] : now.split('T')[0];
        const movTitle = m.title || 'Movimentação Processual';
        const movDesc = m.details || '';

        // Evitar duplicatas
        const exists = db.prepare(`
          SELECT id FROM lawsuit_movements WHERE lawsuit_id = ? AND movement_date = ? AND title = ?
        `).get(lawsuitId, movDate, movTitle);

        if (!exists) {
          insertMovStmt.run(lawsuitId, movDate, movTitle, movDesc, now);
        }
      });
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'IMPORTAR_PROCESSO_RADAR',
      module: 'PROCESSOS',
      resource_id: lawsuitId,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Processo nº ${lawsuitNumber} (${courtName}) importado com sucesso para o Cliente #${clientId} (${authorName}).`,
      details: { lawsuitId, clientId, authorName, lawsuitNumber, courtName }
    });

    return res.json({
      success: true,
      message: `Processo nº ${lawsuitNumber} importado com sucesso para o escritório!`,
      clientId,
      lawsuitId
    });

  } catch (error) {
    console.error('[ERRO] Falha ao importar processo:', error);
    return res.status(500).json({ error: 'Erro ao importar processo: ' + error.message });
  }
});

// ===== AGENDA: extraída para src/modules/calendar/calendar.routes.js =====

// =========================================================================
// 📢 MÓDULO DE INTIMAÇÕES (COMUNICAAPI / DJEN), DATAJUD & CALCULADORA DE PRAZOS
// =========================================================================

// Feriados forenses e nacionais: gerados por regra (src/shared/court-calendar.js) e estendidos a cada partida,
// sempre com folga de anos à frente. Não apaga nem altera o que o escritório já cadastrou.
export function seedCourtHolidays() {
  try {
    const hoje = new Date().getFullYear();
    const novos = ensureCourtHolidays(db, 2025, hoje + 4);
    if (novos > 0) console.log(`📅 [FERIADOS FORENSES] ${novos} feriado(s) acrescentado(s) até ${hoje + 4}.`);
    const cob = holidayCoverage(db);
    if (!cob.ok) console.warn(`📅 [FERIADOS FORENSES] ${cob.warning}`);
  } catch (err) {
    console.warn('Aviso ao preparar feriados:', err.message);
  }
}
// (seedCourtHolidays é chamado no boot pelo server.js, dentro do app.listen)

// Calcula o prazo lendo os feriados do banco (o motor puro fica em src/shared/deadline-calc.js).
function calculateLegalDeadline(disponibilizacaoStr, daysCount, regime = 'cpc', customHolidays = []) {
  const holidaysRows = db.prepare(`SELECT holiday_date, name FROM court_holidays`).all();
  return computeLegalDeadline(disponibilizacaoStr, daysCount, regime, customHolidays, holidaysRows);
}

// 1. Endpoint: Calcular Prazo Processual
juridicoRouter.post('/api/court/deadline/calculate', requireAuth, (req, res) => {
  try {
    const { start_date, days = 15, regime = 'cpc', custom_holidays = [] } = req.body;
    if (!start_date) {
      return res.status(400).json({ error: 'Data de disponibilização ou início é obrigatória.' });
    }

    const result = calculateLegalDeadline(start_date, Number(days) || 15, regime, custom_holidays);
    return res.json(result);
  } catch (err) {
    console.error('[ERRO] Falha no cálculo de prazo:', err);
    return res.status(500).json({ error: 'Erro ao calcular prazo: ' + err.message });
  }
});

// Alias da Fase 2 para Calculadora de Prazos
juridicoRouter.post('/api/legaltech/calculate-deadline', requireAuth, (req, res) => {
  try {
    const { start_date, days = 15, regime = 'cpc', custom_holidays = [] } = req.body;
    if (!start_date) {
      return res.status(400).json({ error: 'Data de disponibilização ou início é obrigatória.' });
    }

    const result = calculateLegalDeadline(start_date, Number(days) || 15, regime, custom_holidays);
    return res.json(result);
  } catch (err) {
    console.error('[ERRO] Falha no cálculo de prazo (legaltech):', err);
    return res.status(500).json({ error: 'Erro ao calcular prazo: ' + err.message });
  }
});

// 2. Endpoint: Buscar Publicações em Tempo Real na ComunicaAPI (PJe / DJEN)
juridicoRouter.get('/api/court/publications/search-live', requireAuth, async (req, res) => {
  try {
    const { numeroOab, ufOab = 'MG', nomeAdvogado, numeroProcesso, siglaTribunal, dataInicio, dataFim, pagina = 1, itensPorPagina = 20 } = req.query;

    const params = new URLSearchParams();
    if (numeroOab) params.append('numeroOab', String(numeroOab).replace(/\D/g, ''));
    if (ufOab) params.append('ufOab', ufOab.toUpperCase());
    if (nomeAdvogado) params.append('nomeAdvogado', nomeAdvogado);
    if (numeroProcesso) params.append('numeroProcesso', String(numeroProcesso).replace(/\D/g, ''));
    if (siglaTribunal) params.append('siglaTribunal', siglaTribunal.toUpperCase());
    if (dataInicio) params.append('dataDisponibilizacaoInicio', dataInicio);
    if (dataFim) params.append('dataDisponibilizacaoFim', dataFim);
    params.append('pagina', String(pagina));
    params.append('itensPorPagina', String(itensPorPagina));

    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?${params.toString()}`;
    const apiRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JorgeAlvimAdvocacia/1.0'
      }
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Erro na ComunicaAPI (${apiRes.status}): ${errText}` });
    }

    const data = await apiRes.json();
    return res.json({
      success: true,
      count: data.count || (data.items ? data.items.length : 0),
      items: data.items || []
    });
  } catch (err) {
    console.error('[ERRO] Falha ao consultar ComunicaAPI ao vivo:', err);
    return res.status(500).json({ error: 'Erro ao consultar ComunicaAPI: ' + err.message });
  }
});

// 3. Endpoint: Sincronizar Publicações (delega ao Motor de Sincronização)
//    Aceita numeroOab/ufOab/nomeAdvogado (body ou query) para mirar uma OAB.
juridicoRouter.post('/api/court/publications/sync', requireAuth, async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const targetOab = src.numeroOab ? String(src.numeroOab).replace(/\D/g, '') : null;
    const targetUf = (src.ufOab || 'MG').toUpperCase();
    const targetName = src.nomeAdvogado || null;

    const r = await syncComunicaApi({ targetOab, targetUf, targetName });

    logAudit(req, {
      event_type: 'SINCRONIZACAO',
      event_name: 'SINCRONIZAR_COMUNICAAPI_DJEN',
      module: 'INTIMACOES',
      resource_id: 'COMUNICAAPI-DJEN',
      user_name: req.user ? req.user.name : 'Operador',
      description: `Sincronização de intimações do DJEN/PJe concluída: ${r.totalSaved} novas publicações salvas de ${r.totalFound} encontradas.`,
      details: r
    });

    return res.json({
      success: true,
      message: `Sincronização concluída! ${r.totalSaved} novas intimações importadas (${r.totalFound} analisadas).`,
      totalSaved: r.totalSaved,
      totalFound: r.totalFound,
      lawyersChecked: r.lawyersChecked,
      errors: r.errors
    });
  } catch (err) {
    console.error('[ERRO] Falha ao sincronizar publicações:', err);
    return res.status(500).json({ error: 'Erro ao sincronizar publicações: ' + err.message });
  }
});

// 4. Endpoint: Listar Publicações Armazenadas
juridicoRouter.get('/api/court/publications', requireAuth, (req, res) => {
  try {
    const { status, lawyer_id, tribunal, search } = req.query;
    let query = `SELECT * FROM court_publications WHERE 1=1`;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (lawyer_id && lawyer_id !== 'all') {
      query += ` AND (lawyer_id = ? OR advogado_nome LIKE ?)`;
      params.push(lawyer_id, `%${lawyer_id}%`);
    }
    if (tribunal && tribunal !== 'all') {
      query += ` AND sigla_tribunal = ?`;
      params.push(tribunal);
    }
    if (search && search.trim() !== '') {
      query += ` AND (texto LIKE ? OR numero_processo LIKE ? OR numeroprocessocommascara LIKE ? OR nome_orgao LIKE ? OR advogado_nome LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY data_disponibilizacao DESC, created_at DESC LIMIT 100`;

    const publications = db.prepare(query).all(...params);

    const stats = {
      total: db.prepare(`SELECT count(*) as count FROM court_publications`).get().count,
      unread: db.prepare(`SELECT count(*) as count FROM court_publications WHERE status = 'nao_lido'`).get().count,
      deadline_launched: db.prepare(`SELECT count(*) as count FROM court_publications WHERE status = 'prazo_lancado'`).get().count
    };

    return res.json({ success: true, publications, stats });
  } catch (err) {
    console.error('[ERRO] Falha ao listar publicações:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. Endpoint: Atualizar Status da Publicação (Lido / Arquivado)
juridicoRouter.patch('/api/court/publications/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['nao_lido', 'lido', 'prazo_lancado', 'arquivado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    db.prepare(`UPDATE court_publications SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    return res.json({ success: true, message: `Status da publicação atualizado para ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5.1 Endpoint: Triagem Rápida de Publicação do DJEN no Cockpit Matinal
 * Ações: 'ciente' (marca como lido), 'arquivar' (marca como arquivado), 'lancar_prazo' (cria evento na agenda)
 */
juridicoRouter.post('/api/juridico/publications/:id/triage', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { action, deadline_date, notes } = req.body;

    const pub = db.prepare(`SELECT * FROM court_publications WHERE id = ?`).get(id);
    if (!pub) {
      return res.status(404).json({ error: 'Publicação não encontrada.' });
    }

    if (action === 'ciente') {
      db.prepare(`UPDATE court_publications SET status = 'lido', notes = COALESCE(notes || ' ', '') || ?, updated_at = datetime('now') WHERE id = ?`)
        .run(`[Ciente em ${new Date().toISOString()}]`, id);
      return res.json({ success: true, action: 'ciente', message: 'Publicação marcada como ciente.' });
    }

    if (action === 'arquivar') {
      db.prepare(`UPDATE court_publications SET status = 'arquivado', notes = COALESCE(notes || ' ', '') || ?, updated_at = datetime('now') WHERE id = ?`)
        .run(`[Arquivado em ${new Date().toISOString()}]`, id);
      return res.json({ success: true, action: 'arquivar', message: 'Publicação arquivada.' });
    }

    if (action === 'lancar_prazo') {
      if (!deadline_date) {
        return res.status(400).json({ error: 'Data fatal é obrigatória para lançar prazo.' });
      }

      const eventId = `EVT-DJEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const title = `Prazo DJEN: ${pub.tipo_comunicacao || 'Intimação'} - Proc: ${pub.numeroprocessocommascara || pub.numero_processo || 'S/N'}`;
      const desc = `Prazo vinculado à publicação DJEN #${pub.id}. Órgão: ${pub.nome_orgao || 'Tribunal'}. ${notes || ''}`;

      db.prepare(`
        INSERT INTO calendar_events (
          id, title, description, event_type, start_datetime, end_datetime,
          all_day, location, meeting_url, lawyer_id, lawyer_name,
          client_id, client_name, lawsuit_id, lawsuit_number,
          priority, status, color, ical_uid, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'prazo_fatal', ?, ?,
          1, 'PJe / Tribunal', '', 'dr-jorge-alvim', 'Dr. Jorge Alvim',
          ?, ?, ?, ?,
          'fatal', 'agendado', '#dc2626', ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        eventId,
        title,
        desc,
        `${deadline_date}T00:00`,
        `${deadline_date}T23:59`,
        pub.client_id || null,
        pub.destinatario_nome || '',
        pub.lawsuit_id || null,
        pub.numeroprocessocommascara || pub.numero_processo || '',
        `prazo-djen-${Date.now()}@jorgealvimadvocacia.com.br`,
        notes || 'Triagem rápida do Cockpit Matinal.'
      );

      db.prepare(`UPDATE court_publications SET status = 'prazo_lancado', deadline_date = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(deadline_date, id);

      logAudit(req, {
        event_type: 'CRIACAO',
        event_name: 'TRIAGEM_DJEN_LANCAR_PRAZO',
        module: 'JURIDICO',
        resource_id: id,
        description: `Triagem DJEN da publicação #${id}: Prazo Fatal para ${deadline_date} lançado na agenda com sucesso.`
      });

      return res.json({ success: true, action: 'lancar_prazo', event_id: eventId, message: 'Prazo fatal lançado na agenda e publicação atualizada!' });
    }

    return res.status(400).json({ error: 'Ação inválida. Use ciente, arquivar ou lancar_prazo.' });
  } catch (err) {
    console.error('[TRIAGEM DJEN] Erro:', err);
    return res.status(500).json({ error: 'Erro ao processar triagem: ' + err.message });
  }
});

// 6. Endpoint: Lançar Prazo Calculado Diretamente na Agenda
juridicoRouter.post('/api/court/deadline/launch-to-calendar', requireAuth, (req, res) => {
  try {
    const {
      publication_id,
      title,
      description,
      lawyer_id,
      lawyer_name,
      client_id,
      client_name,
      lawsuit_id,
      lawsuit_number,
      deadline_date,
      regime,
      days_count
    } = req.body;

    if (!title || !deadline_date) {
      return res.status(400).json({ error: 'Título e data fatal do prazo são obrigatórios.' });
    }

    const eventId = `EVT-PRAZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const icalUid = `prazo-${Date.now()}@jorgealvimadvocacia.com.br`;

    db.prepare(`
      INSERT INTO calendar_events (
        id, title, description, event_type, start_datetime, end_datetime,
        all_day, location, meeting_url, lawyer_id, lawyer_name,
        client_id, client_name, lawsuit_id, lawsuit_number,
        priority, status, color, ical_uid, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'prazo_fatal', ?, ?,
        1, 'PJe / Tribunal', '', ?, ?,
        ?, ?, ?, ?,
        'fatal', 'agendado', '#dc2626', ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      eventId,
      title,
      description || `Prazo fatal de ${days_count} dias (${(regime || 'CPC').toUpperCase()}).`,
      `${deadline_date}T00:00`,
      `${deadline_date}T23:59`,
      lawyer_id || 'dr-jorge-alvim',
      lawyer_name || 'Dr. Jorge Alvim',
      client_id || null,
      client_name || '',
      lawsuit_id || null,
      lawsuit_number || '',
      icalUid,
      `Calculado automaticamente pela Calculadora de Prazos Processuais.`
    );

    // Se vinculado a publicação, atualizar status para 'prazo_lancado'
    if (publication_id) {
      db.prepare(`UPDATE court_publications SET status = 'prazo_lancado', deadline_date = ?, updated_at = datetime('now') WHERE id = ?`).run(deadline_date, publication_id);
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'LANCAR_PRAZO_CALCULADORA',
      module: 'AGENDA_PRAZOS',
      resource_id: eventId,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Prazo Fatal "${title}" para ${deadline_date} lançado com sucesso na agenda de ${lawyer_name || 'Geral'}.`,
      details: { eventId, publication_id, deadline_date, days_count, regime }
    });

    return res.json({
      success: true,
      message: `Prazo Fatal lançado com sucesso na agenda do advogado para o dia ${deadline_date.split('-').reverse().join('/')}!`,
      eventId,
      deadline_date
    });
  } catch (err) {
    console.error('[ERRO] Falha ao lançar prazo na agenda:', err);
    return res.status(500).json({ error: 'Erro ao lançar prazo: ' + err.message });
  }
});

// 7. Endpoint: Consulta DataJud (CNJ)
juridicoRouter.post('/api/court/datajud/search', requireAuth, async (req, res) => {
  try {
    const { lawsuit_number, tribunal = 'tjmg', custom_api_key } = req.body;
    if (!lawsuit_number) {
      return res.status(400).json({ error: 'Número do processo é obrigatório.' });
    }

    const cleanNumber = String(lawsuit_number).replace(/\D/g, '');
    const cleanTribunal = String(tribunal).toLowerCase().replace(/[^a-z0-9]/g, '');
    // Chave própria informada na chamada, ou a do servidor (DATAJUD_API_KEY). Nunca uma chave fixa no código.
    const apiKey = datajudAuthHeader(custom_api_key) || datajudAuthHeader(process.env.DATAJUD_API_KEY);
    if (!apiKey) {
      return res.status(503).json({ error: 'Chave do DataJud não configurada no servidor (DATAJUD_API_KEY).' });
    }

    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${cleanTribunal}/_search`;

    const body = {
      query: {
        match: {
          numeroProcesso: cleanNumber
        }
      }
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.json({
        success: false,
        status: apiRes.status,
        message: `Serviço DataJud retornou status ${apiRes.status}.`,
        details: errText
      });
    }

    const data = await apiRes.json();
    return res.json({
      success: true,
      hits: data.hits ? data.hits.hits : []
    });
  } catch (err) {
    console.error('[ERRO] Falha na consulta DataJud:', err);
    return res.status(500).json({ error: 'Erro na consulta DataJud: ' + err.message });
  }
});

// 8a. Cobertura do calendário (aviso quando faltar ano à frente)
juridicoRouter.get('/api/court/holidays/coverage', requireAuth, (req, res) => {
  try {
    return res.json({ success: true, ...holidayCoverage(db) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 8b. Cadastro de feriado LOCAL do escritório (municipal, ponto facultativo do tribunal, portaria)
juridicoRouter.post('/api/court/holidays', requireAuth, (req, res) => {
  try {
    const date = String(req.body?.date || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
    if (!dt || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: 'Informe uma data válida (AAAA-MM-DD).' });
    }
    if (!name) return res.status(400).json({ error: 'Informe o nome do feriado.' });
    const exists = db.prepare('SELECT name FROM court_holidays WHERE holiday_date = ?').get(date);
    if (exists) return res.status(409).json({ error: `Esta data já está cadastrada: ${exists.name}.` });
    db.prepare(`INSERT INTO court_holidays (id, holiday_date, name, jurisdiction, is_forensic_recess) VALUES (?, ?, ?, 'local', 0)`)
      .run(`HOL-LOC-${date}`, date, name);
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'FERIADO_LOCAL_CADASTRADO', module: 'PRAZOS', resource_id: `HOL-LOC-${date}`, description: `Feriado local cadastrado: ${date} — ${name}.` });
    return res.status(201).json({ success: true, id: `HOL-LOC-${date}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 8c. Remove só feriados LOCAIS cadastrados pelo escritório (os do calendário gerado não se apagam)
juridicoRouter.delete('/api/court/holidays/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!id.startsWith('HOL-LOC-')) return res.status(403).json({ error: 'Só é possível remover feriados locais cadastrados pelo escritório.' });
    const r = db.prepare('DELETE FROM court_holidays WHERE id = ?').run(id);
    if (!r.changes) return res.status(404).json({ error: 'Feriado não encontrado.' });
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'FERIADO_LOCAL_REMOVIDO', module: 'PRAZOS', resource_id: id, description: `Feriado local removido: ${id}.` });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. Endpoint: Listar Feriados Forenses
juridicoRouter.get('/api/court/holidays', requireAuth, (req, res) => {
  try {
    const holidays = db.prepare(`SELECT * FROM court_holidays ORDER BY holiday_date ASC`).all();
    return res.json({ success: true, holidays });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
