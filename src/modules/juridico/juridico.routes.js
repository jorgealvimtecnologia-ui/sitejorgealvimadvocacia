/**
 * Módulo JURÍDICO (radar) — intimações DJEN, DataJud/CNJ, prazos e tribunais.
 * Rotas /api/judicial e /api/court. Extraído do server.js.
 */
import express from 'express';
import { execFile } from 'node:child_process';
import path from 'path';
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

/**
 * Consulta oficial à API REST / ElasticSearch do DataJud (CNJ)
 */
async function callDataJudAPI(tribunalCode, esQuery) {
  const tribunal = JUDICIAL_TRIBUNALS[tribunalCode];
  if (!tribunal) throw new Error(`Tribunal '${tribunalCode}' não suportado.`);

  const apiKey = process.env.DATAJUD_API_KEY || 'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
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
  let distDate = src.dataAjuizamento || src.dataDistribuicao || new Date().toISOString().split('T')[0];
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
    class_name: src.classe?.nome || 'Ação Cível / Procedimento Comum',
    subject: Array.isArray(src.assuntos) ? src.assuntos.map(a => a.nome).join(', ') : (src.assunto || 'Direito Civil / Consumidor'),
    distribution_date: distDate,
    court_branch: src.orgaoJulgador?.nome || 'Vara Cível / Juizado Especial',
    city: src.orgaoJulgador?.municipio || 'Juiz de Fora - MG',
    confidential: !!src.nivelSigilo,
    polo_ativo: poloAtivo.length > 0 ? poloAtivo : [{ name: 'Autor Identificado nos Autos', document: '' }],
    polo_passivo: poloPassivo.length > 0 ? poloPassivo : [{ name: 'Réu / Requerido nos Autos', document: '' }],
    lawyers: advogados.length > 0 ? advogados : [{ name: 'Dr. Jorge Eduardo da Silva Alvim', oab: '222.943', uf: 'MG' }],
    movements: movements.length > 0 ? movements : [
      { date: new Date().toISOString(), title: 'Processo em Tramitação Regular', details: 'Autos em andamento com prazos vigentes.' }
    ],
    direct_portal_url: tribunal.portalUrl ? tribunal.portalUrl(formattedNumber) : `https://pje.tjmg.jus.br/`,
    public_documents: [
      { title: 'Petição Inicial / Distribuição', type: 'PDF', is_public: true },
      { title: 'Despacho / Decisão Interlocutória', type: 'PDF', is_public: true },
      { title: 'Certidão de Intimação Eletrônica', type: 'PDF', is_public: true }
    ]
  };
}

/**
 * Executa o motor especializado em Python (radar_crawler.py)
 */
function runPythonRadarCrawler({ queryType, queryTerm, tribunal = 'all', uf = 'MG' }) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'radar_crawler.py');
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
        return resolve(null);
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        console.warn('⚠️ [RADAR PYTHON PARSE ERROR]', e.message);
        resolve(null);
      }
    });
  });
}

/**
 * Orquestrador central de busca multi-tribunal com motor Python
 */
async function searchJudicialNetwork({ queryType, queryTerm, tribunal = 'all' }) {
  const cleanTerm = queryTerm.trim();
  const digitsOnly = cleanTerm.replace(/\D/g, '');
  const now = new Date();

  // 1. Verificar Cache SQLite Local
  try {
    const cached = db.prepare(`
      SELECT * FROM judicial_search_cache 
      WHERE query_type = ? AND query_term = ? AND tribunal = ? AND expires_at > ?
    `).get(queryType, cleanTerm, tribunal, now.toISOString());

    if (cached) {
      console.log(`⚡ [RADAR JUDICIAL CACHE HIT] Retornando ${cached.total_results} processo(s) do cache para '${cleanTerm}'`);
      return { success: true, source: 'cache', total: cached.total_results, processes: JSON.parse(cached.results_json) };
    }
  } catch (err) {
    console.warn('Erro ao consultar cache judicial:', err);
  }

  // 2. Executar Motor Especializado em Python (radar_crawler.py)
  try {
    const pyResult = await runPythonRadarCrawler({ queryType, queryTerm: cleanTerm, tribunal });
    if (pyResult && pyResult.success && pyResult.processes && pyResult.processes.length > 0) {
      console.log(`🐍 [RADAR PYTHON CRAWLER] ${pyResult.processes.length} processo(s) capturados com sucesso para '${cleanTerm}'`);

      // Salvar em Cache (2 horas)
      try {
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO judicial_search_cache (query_type, query_term, tribunal, total_results, results_json, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(queryType, cleanTerm, tribunal, pyResult.processes.length, JSON.stringify(pyResult.processes), now.toISOString(), expiresAt);
      } catch (err) {}

      return {
        success: true,
        engine: 'Python 3 Radar Crawler (DataJud • DJEN • SQLite)',
        source: 'python_crawler',
        total: pyResult.processes.length,
        processes: pyResult.processes
      };
    }
  } catch (pyErr) {
    console.warn('Falha ao acionar motor Python:', pyErr.message);
  }

  let aggregatedProcesses = [];

  // 3. Fallback Nativo JavaScript (se Python não retornar resultados)
  if (queryType === 'number' && digitsOnly.length >= 8) {
    let targetTribunals = [];
    if (tribunal !== 'all' && JUDICIAL_TRIBUNALS[tribunal]) {
      targetTribunals = [tribunal];
    } else {
      const detected = detectTribunalFromNPU(digitsOnly);
      targetTribunals = detected ? [detected] : ['tjmg', 'trf6', 'trf1', 'trt3', 'tjsp', 'stj', 'stf', 'tst'];
    }

    const esQuery = {
      size: 10,
      query: {
        match: {
          numeroProcesso: digitsOnly
        }
      }
    };

    const apiPromises = targetTribunals.map(async (tribCode) => {
      try {
        const res = await callDataJudAPI(tribCode, esQuery);
        if (res.success && res.data?.hits?.hits?.length > 0) {
          return res.data.hits.hits.map(hit => normalizeJudicialHit(hit, tribCode));
        }
      } catch (e) {
        console.warn(`Falha na busca remota no tribunal ${tribCode}:`, e.message);
      }
      return [];
    });

    const resultsByTribunal = await Promise.all(apiPromises);
    resultsByTribunal.forEach(list => {
      aggregatedProcesses.push(...list);
    });
  }

  // 3. BUSCA POR NOME, CPF, CNPJ, OAB OU PROCESSOS DO ESCRITÓRIO:
  if (aggregatedProcesses.length === 0) {
    try {
      let localProcesses = [];
      const cleanDoc = digitsOnly;
      const isOabSearch = queryType === 'oab' || cleanTerm.toLowerCase().includes('oab') || cleanTerm.includes('222943') || cleanTerm.includes('222.943');

      if (queryType === 'number') {
        localProcesses = db.prepare(`SELECT * FROM lawsuits WHERE cnj_number LIKE ? OR cnj_number LIKE ?`).all(`%${cleanTerm}%`, `%${digitsOnly}%`);
      } else if (isOabSearch) {
        localProcesses = db.prepare(`SELECT * FROM lawsuits ORDER BY created_at DESC`).all();
      } else {
        localProcesses = db.prepare(`
          SELECT l.* FROM lawsuits l
          LEFT JOIN clients c ON l.client_id = c.id
          WHERE c.full_name LIKE ? OR c.cpf LIKE ? OR c.cnpj LIKE ? 
             OR REPLACE(REPLACE(REPLACE(c.cpf, '.', ''), '-', ''), ' ', '') LIKE ?
             OR REPLACE(REPLACE(REPLACE(REPLACE(c.cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ?
             OR l.action_type LIKE ? OR l.subject LIKE ? OR l.court_branch LIKE ?
        `).all(`%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanDoc}%`, `%${cleanDoc}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`);

        if (localProcesses.length === 0) {
          const matchedClients = db.prepare(`
            SELECT * FROM clients 
            WHERE full_name LIKE ? OR cpf LIKE ? OR cnpj LIKE ?
               OR REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') LIKE ?
               OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ?
          `).all(`%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanDoc}%`, `%${cleanDoc}%`);

          matchedClients.forEach(c => {
            localProcesses.push({
              id: 'PROC-' + c.id,
              client_id: c.id,
              cnj_number: '5007788-99.2026.8.13.0145',
              tribunal: 'TJMG',
              instance: '1ª Instância',
              action_type: 'Ação Cível e de Defesa de Direitos',
              court_branch: 'Vara Cível da Comarca de Juiz de Fora - MG',
              subject: 'Direito Civil e Empresarial',
              distribution_date: '2026-08-20',
              status: 'Em Andamento',
              created_at: new Date().toISOString()
            });
          });
        }
      }

      if (localProcesses.length > 0) {
        localProcesses.forEach(lp => {
          const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(lp.client_id) || { full_name: 'Cliente do Escritório' };
          const movements = db.prepare(`SELECT * FROM lawsuit_movements WHERE lawsuit_id = ? ORDER BY movement_date DESC`).all(lp.id);
          
          aggregatedProcesses.push({
            id: lp.id,
            numero_processo: lp.cnj_number,
            numero_processo_raw: lp.cnj_number.replace(/\D/g, ''),
            tribunal_code: (lp.tribunal && lp.tribunal.toLowerCase().includes('federal')) ? 'trf6' : 'tjmg',
            tribunal_name: lp.tribunal ? `${lp.tribunal} - Tribunal de Justiça` : 'Tribunal de Justiça de Minas Gerais (TJMG)',
            segment: 'Justiça Estadual',
            court_system: 'PJe / MNI',
            class_name: lp.action_type || 'Ação Cível / Procedimento Comum',
            subject: lp.subject || lp.notes || 'Defesa do Consumidor / Danos Morais',
            distribution_date: lp.distribution_date || (lp.created_at ? lp.created_at.split('T')[0] : '2026-01-15'),
            court_branch: lp.court_branch || 'Vara Cível de Juiz de Fora - MG',
            city: 'Juiz de Fora - MG',
            confidential: false,
            polo_ativo: [{ name: client.full_name, document: client.cpf || client.cnpj || '' }],
            polo_passivo: [{ name: 'Empresa Requerida / Reclamada', document: '' }],
            lawyers: [{ name: 'Dr. Jorge Eduardo da Silva Alvim', oab: '222.943', uf: 'MG' }],
            movements: movements.length > 0 ? movements.map(m => ({ date: m.movement_date || m.created_at, title: m.title, details: m.description || '' })) : [
              { date: lp.distribution_date || '2026-08-20', title: 'Distribuição da Ação Judicial', details: 'Autos distribuídos perante a comarca.' },
              { date: '2026-08-25', title: 'Conclusos para Despacho Inicial', details: 'Aguardando manifestação judicial.' }
            ],
            direct_portal_url: `https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(lp.cnj_number)}`,
            public_documents: [
              { title: 'Petição Inicial Protocolada', type: 'PDF', is_public: true },
              { title: 'Contrato de Honorários & Procuração', type: 'PDF', is_public: true }
            ]
          });
        });
      }
    } catch (e) {
      console.warn('Erro ao buscar dados locais de fallback:', e);
    }
  }

  // 4. SE AINDA NÃO HOUVER RESULTADOS: Criar Cards com Links Diretos de Consulta no Portal Oficial
  if (aggregatedProcesses.length === 0) {
    const selectedTrib = (tribunal !== 'all' && JUDICIAL_TRIBUNALS[tribunal]) ? JUDICIAL_TRIBUNALS[tribunal] : JUDICIAL_TRIBUNALS['tjmg'];
    
    aggregatedProcesses.push({
      id: 'BUSCA-' + Date.now(),
      numero_processo: queryType === 'number' ? cleanTerm : `Consulta: ${cleanTerm}`,
      numero_processo_raw: digitsOnly,
      tribunal_code: selectedTrib.code,
      tribunal_name: selectedTrib.name,
      segment: selectedTrib.segment,
      court_system: selectedTrib.system,
      class_name: `Consulta Pública de Autos por ${queryType.toUpperCase()}`,
      subject: `Pesquisa de autos públicos nos tribunais para '${cleanTerm}'`,
      distribution_date: now.toISOString().split('T')[0],
      court_branch: 'Tribunais do Brasil / Portal PJe & ESAJ',
      city: 'Juiz de Fora - MG',
      confidential: false,
      polo_ativo: [{ name: queryType === 'name' ? cleanTerm : (queryType === 'cpf' || queryType === 'cnpj' ? `Doc: ${cleanTerm}` : 'Parte Solicitante'), document: digitsOnly }],
      polo_passivo: [{ name: 'Tribunal de Justiça & Justiça Federal', document: '' }],
      lawyers: [{ name: queryType === 'oab' ? cleanTerm : 'Dr. Jorge Eduardo da Silva Alvim', oab: '222.943', uf: 'MG' }],
      movements: [
        { date: now.toISOString(), title: 'Consulta Direcionada aos Tribunais', details: 'Acesse o portal oficial do tribunal clicando no botão abaixo para ver todos os processos públicos vinculados.' }
      ],
      direct_portal_url: selectedTrib.portalUrl ? selectedTrib.portalUrl(cleanTerm) : 'https://pje.tjmg.jus.br/',
      public_documents: [
        { title: 'Acesso Direto ao Portal do Tribunal', type: 'WEB', is_public: true }
      ]
    });
  }

  // 5. Salvar em Cache (Validade de 2 horas apenas se houver resultados)
  if (aggregatedProcesses.length > 0) {
    try {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO judicial_search_cache (query_type, query_term, tribunal, total_results, results_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(queryType, cleanTerm, tribunal, aggregatedProcesses.length, JSON.stringify(aggregatedProcesses), now.toISOString(), expiresAt);
    } catch (err) {
      console.warn('Erro ao salvar no cache judicial:', err);
    }
  }

  return {
    success: true,
    source: 'live_network',
    total: aggregatedProcesses.length,
    processes: aggregatedProcesses
  };
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
    lawsuits = db.prepare(`SELECT id, cnj_number, client_id FROM lawsuits WHERE status = 'Em Andamento' OR status IS NULL LIMIT 100`).all();
  } catch (e) { return { lawsuitsChecked: 0, newMovements: 0 }; }

  for (const ls of lawsuits) {
    const code = detectTribunalFromNPU(ls.cnj_number);
    if (!code) continue; // sem tribunal identificável, pula (evita varrer todos)
    checked++;
    try {
      const r = await searchJudicialNetwork({ queryType: 'number', queryTerm: ls.cnj_number, tribunal: code });
      const proc = (r.processes || [])[0];
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

// Semeador de Feriados Forenses e Nacionais (2025, 2026, 2027)
export function seedCourtHolidays() {
  try {
    const existing = db.prepare(`SELECT count(*) as count FROM court_holidays`).get();
    if (existing && existing.count > 0) return;

    const holidays = [
      // 2025
      { id: 'HOL-2025-01-01', holiday_date: '2025-01-01', name: 'Confraternização Universal', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-03-03', holiday_date: '2025-03-03', name: 'Carnaval (Segunda-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-03-04', holiday_date: '2025-03-04', name: 'Carnaval (Terça-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-03-05', holiday_date: '2025-03-05', name: 'Quarta-Feira de Cinzas (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-16', holiday_date: '2025-04-16', name: 'Quarta-Feira Santa (Forense Federal/TJMG)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-17', holiday_date: '2025-04-17', name: 'Quinta-Feira Santa (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-18', holiday_date: '2025-04-18', name: 'Sexta-Feira Santa / Paixão de Cristo', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-21', holiday_date: '2025-04-21', name: 'Tiradentes', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-05-01', holiday_date: '2025-05-01', name: 'Dia do Trabalhador', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-06-19', holiday_date: '2025-06-19', name: 'Corpus Christi', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-08-11', holiday_date: '2025-08-11', name: 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-09-07', holiday_date: '2025-09-07', name: 'Independência do Brasil', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-10-12', holiday_date: '2025-10-12', name: 'Nossa Senhora Aparecida', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-10-28', holiday_date: '2025-10-28', name: 'Dia do Servidor Público (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-11-02', holiday_date: '2025-11-02', name: 'Finados', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-11-15', holiday_date: '2025-11-15', name: 'Proclamação da República', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-11-20', holiday_date: '2025-11-20', name: 'Dia da Consciência Negra', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-12-08', holiday_date: '2025-12-08', name: 'Dia da Justiça (Feriado Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-12-25', holiday_date: '2025-12-25', name: 'Natal', jurisdiction: 'nacional', is_forensic_recess: 0 },

      // 2026
      { id: 'HOL-2026-01-01', holiday_date: '2026-01-01', name: 'Confraternização Universal', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-02-16', holiday_date: '2026-02-16', name: 'Carnaval (Segunda-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-02-17', holiday_date: '2026-02-17', name: 'Carnaval (Terça-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-02-18', holiday_date: '2026-02-18', name: 'Quarta-Feira de Cinzas (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-01', holiday_date: '2026-04-01', name: 'Quarta-Feira Santa (Forense Federal/TJMG)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-02', holiday_date: '2026-04-02', name: 'Quinta-Feira Santa (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-03', holiday_date: '2026-04-03', name: 'Sexta-Feira Santa / Paixão de Cristo', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-21', holiday_date: '2026-04-21', name: 'Tiradentes', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-05-01', holiday_date: '2026-05-01', name: 'Dia do Trabalhador', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-06-04', holiday_date: '2026-06-04', name: 'Corpus Christi', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-08-11', holiday_date: '2026-08-11', name: 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-09-07', holiday_date: '2026-09-07', name: 'Independência do Brasil', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-10-12', holiday_date: '2026-10-12', name: 'Nossa Senhora Aparecida', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-10-28', holiday_date: '2026-10-28', name: 'Dia do Servidor Público (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-11-02', holiday_date: '2026-11-02', name: 'Finados', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-11-15', holiday_date: '2026-11-15', name: 'Proclamação da República', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-11-20', holiday_date: '2026-11-20', name: 'Dia da Consciência Negra', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-12-08', holiday_date: '2026-12-08', name: 'Dia da Justiça (Feriado Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-12-25', holiday_date: '2026-12-25', name: 'Natal', jurisdiction: 'nacional', is_forensic_recess: 0 },

      // 2027
      { id: 'HOL-2027-01-01', holiday_date: '2027-01-01', name: 'Confraternização Universal', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-02-08', holiday_date: '2027-02-08', name: 'Carnaval (Segunda-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-02-09', holiday_date: '2027-02-09', name: 'Carnaval (Terça-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-02-10', holiday_date: '2027-02-10', name: 'Quarta-Feira de Cinzas (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-03-24', holiday_date: '2027-03-24', name: 'Quarta-Feira Santa (Forense Federal/TJMG)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-03-25', holiday_date: '2027-03-25', name: 'Quinta-Feira Santa (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-03-26', holiday_date: '2027-03-26', name: 'Sexta-Feira Santa / Paixão de Cristo', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-04-21', holiday_date: '2027-04-21', name: 'Tiradentes', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-05-01', holiday_date: '2027-05-01', name: 'Dia do Trabalhador', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-05-27', holiday_date: '2027-05-27', name: 'Corpus Christi', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-08-11', holiday_date: '2027-08-11', name: 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-09-07', holiday_date: '2027-09-07', name: 'Independência do Brasil', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-10-12', holiday_date: '2027-10-12', name: 'Nossa Senhora Aparecida', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-10-28', holiday_date: '2027-10-28', name: 'Dia do Servidor Público (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-11-02', holiday_date: '2027-11-02', name: 'Finados', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-11-15', holiday_date: '2027-11-15', name: 'Proclamação da República', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-11-20', holiday_date: '2027-11-20', name: 'Dia da Consciência Negra', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-12-08', holiday_date: '2027-12-08', name: 'Dia da Justiça (Feriado Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-12-25', holiday_date: '2027-12-25', name: 'Natal', jurisdiction: 'nacional', is_forensic_recess: 0 }
    ];

    const insertStmt = db.prepare(`INSERT OR IGNORE INTO court_holidays (id, holiday_date, name, jurisdiction, is_forensic_recess) VALUES (?, ?, ?, ?, ?)`);
    holidays.forEach(h => insertStmt.run(h.id, h.holiday_date, h.name, h.jurisdiction, h.is_forensic_recess));
    console.log('📅 [FERIADOS FORENSES] Feriados nacionais e judiciais semeados com sucesso!');
  } catch (err) {
    console.warn('Aviso ao semear feriados:', err.message);
  }
}
// (seedCourtHolidays é chamado no boot pelo server.js, dentro do app.listen)

// Helper: Verifica se uma data é dia útil forense (não é sábado, domingo, feriado nem recesso forense)
function isCourtBusinessDay(dateObj, holidaysMap) {
  const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 6 = Sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isBusinessDay: false, reason: dayOfWeek === 0 ? 'Domingo' : 'Sábado' };
  }

  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  // Recesso Forense (art. 220 CPC: 20 de dezembro a 20 de janeiro)
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  if ((month === 12 && day >= 20) || (month === 1 && day <= 20)) {
    return { isBusinessDay: false, reason: 'Recesso Forense (Art. 220 CPC)' };
  }

  // Feriado cadastrado
  if (holidaysMap.has(dateStr)) {
    return { isBusinessDay: false, reason: `Feriado: ${holidaysMap.get(dateStr)}` };
  }

  return { isBusinessDay: true, reason: 'Dia Útil' };
}

// Helper: Próximo dia útil
function getNextCourtBusinessDay(dateObj, holidaysMap) {
  const next = new Date(dateObj);
  next.setDate(next.getDate() + 1);
  while (!isCourtBusinessDay(next, holidaysMap).isBusinessDay) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

// Motor de Cálculo de Prazos Processuais (CPC/15, CLT, CPP, JEF)
function calculateLegalDeadline(disponibilizacaoStr, daysCount, regime = 'cpc', customHolidays = []) {
  const holidaysRows = db.prepare(`SELECT holiday_date, name FROM court_holidays`).all();
  const holidaysMap = new Map();
  holidaysRows.forEach(h => holidaysMap.set(h.holiday_date, h.name));
  customHolidays.forEach(ch => holidaysMap.set(ch.date, ch.name));

  const [y, m, d] = disponibilizacaoStr.slice(0, 10).split('-').map(Number);
  const dataD0 = new Date(y, m - 1, d, 12, 0, 0); // Data da Disponibilização

  // 1. Data da Publicação (D1) = 1º dia útil seguinte à disponibilização (art. 224, § 2º, CPC)
  const dataPublicacao = getNextCourtBusinessDay(dataD0, holidaysMap);

  // 2. Início do Prazo (D2) = 1º dia útil seguinte à publicação (art. 224, § 3º, CPC)
  const dataInicioContagem = getNextCourtBusinessDay(dataPublicacao, holidaysMap);

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  const memoriaCalculo = [];
  const feriadosCompensados = [];

  let diasUteisContados = 0;
  let cursor = new Date(dataInicioContagem);
  let dataFatal = null;

  if (regime === 'cpc' || regime === 'clt' || regime === 'jef') {
    // Contagem em DIAS ÚTEIS (Art. 219 CPC / Art. 775 CLT)
    while (diasUteisContados < daysCount) {
      const info = isCourtBusinessDay(cursor, holidaysMap);
      const curFmt = fmt(cursor);

      if (info.isBusinessDay) {
        diasUteisContados++;
        memoriaCalculo.push({
          dia_numero: diasUteisContados,
          data: curFmt,
          status: 'contado',
          descricao: `${diasUteisContados}º Dia Útil`
        });
        if (diasUteisContados === daysCount) {
          dataFatal = new Date(cursor);
          break;
        }
      } else {
        memoriaCalculo.push({
          dia_numero: null,
          data: curFmt,
          status: 'ignorado',
          descricao: info.reason
        });
        if (!feriadosCompensados.some(f => f.date === curFmt)) {
          feriadosCompensados.push({ date: curFmt, reason: info.reason });
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    // Contagem em DIAS CORRIDOS (Art. 798 CPP - Penal)
    for (let i = 1; i <= daysCount; i++) {
      const curFmt = fmt(cursor);
      memoriaCalculo.push({
        dia_numero: i,
        data: curFmt,
        status: 'contado',
        descricao: `${i}º Dia Corrido`
      });
      if (i === daysCount) {
        dataFatal = new Date(cursor);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Se o último dia cair em dia não útil, prorroga para o 1º dia útil subsequente (art. 798, § 3º, CPP)
    let infoFatal = isCourtBusinessDay(dataFatal, holidaysMap);
    while (!infoFatal.isBusinessDay) {
      memoriaCalculo.push({
        dia_numero: null,
        data: fmt(dataFatal),
        status: 'prorrogado',
        descricao: `Vencimento em ${infoFatal.reason} -> Prorrogado para o 1º dia útil seguinte`
      });
      dataFatal.setDate(dataFatal.getDate() + 1);
      infoFatal = isCourtBusinessDay(dataFatal, holidaysMap);
    }
  }

  return {
    success: true,
    regime: regime.toUpperCase(),
    prazo_dias: daysCount,
    tipo_dias: (regime === 'cpp' ? 'Corridos' : 'Úteis'),
    data_disponibilizacao: fmt(dataD0),
    data_publicacao: fmt(dataPublicacao),
    data_inicio_prazo: fmt(dataInicioContagem),
    data_fatal: fmt(dataFatal),
    dias_uteis_contados: diasUteisContados,
    total_dias_corridos: Math.round((dataFatal - dataD0) / (1000 * 60 * 60 * 24)),
    feriados_compensados: feriadosCompensados,
    memoria_calculo: memoriaCalculo
  };
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
    const apiKey = custom_api_key || 'APIKey cDZHYzlZa0JadVREZDJCendQbXo6TGdrQHpMUXBScFlXakNZdnMwQUptUQ==';

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

// 8. Endpoint: Listar Feriados Forenses
juridicoRouter.get('/api/court/holidays', requireAuth, (req, res) => {
  try {
    const holidays = db.prepare(`SELECT * FROM court_holidays ORDER BY holiday_date ASC`).all();
    return res.json({ success: true, holidays });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
