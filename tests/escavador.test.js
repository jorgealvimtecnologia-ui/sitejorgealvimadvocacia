/**
 * Cliente do Escavador (unitário, sem rede real): porta de entrada do Radar.
 * Confere gating pela chave, montagem da requisição (Bearer, query, créditos),
 * paginação e a NORMALIZAÇÃO tolerante das publicações para o formato da ComunicaAPI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escavadorConfigured, escavadorConfig, escavadorFetch, escavadorPaginar,
  extrairOcorrencias, ocorrenciaParaComunicaItem, processoParaImport, resumoTexto, normalizaData, mascaraCnj, soDigitos,
  detalharProcesso, detalheParaImport, grauParaInstancia,
} from '../src/shared/escavador.js';

// Resposta falsa no formato do fetch (headers case-insensitive, .json()).
function fakeResponse({ ok = true, status = 200, body = {}, headers = {} } = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return { ok, status, headers: { get: (n) => (h.has(String(n).toLowerCase()) ? h.get(String(n).toLowerCase()) : null) }, json: async () => body };
}

describe('Escavador — configuração', () => {
  it('sem token: não configurado; escavadorFetch recusa com motivo claro', async () => {
    assert.equal(escavadorConfigured({}), false);
    const r = await escavadorFetch('/saldo', { env: {} });
    assert.equal(r.ok, false);
    assert.match(r.error, /ESCAVADOR_API_TOKEN/);
  });
  it('com token: configurado e base padrão', () => {
    const env = { ESCAVADOR_API_TOKEN: 'tok-123' };
    assert.equal(escavadorConfigured(env), true);
    assert.equal(escavadorConfig(env).base, 'https://api.escavador.com/api/v1');
  });
});

describe('Escavador — transporte HTTP', () => {
  it('envia Bearer, monta a query e lê os créditos do cabeçalho', async () => {
    let capturado = null;
    const fetchImpl = async (url, opts) => { capturado = { url, opts }; return fakeResponse({ body: { ok: true }, headers: { 'Creditos-Utilizados': '8' } }); };
    const r = await escavadorFetch('/busca', { env: { ESCAVADOR_API_TOKEN: 'tok-123' }, query: { q: 'fulano', vazio: '' }, fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.creditos, 8);
    assert.equal(capturado.opts.headers.Authorization, 'Bearer tok-123');
    assert.match(capturado.url, /\/busca\?q=fulano$/); // o parâmetro vazio é descartado
  });
  it('HTTP de erro vira ok:false com a mensagem da API', async () => {
    const fetchImpl = async () => fakeResponse({ ok: false, status: 402, body: { message: 'Saldo insuficiente' } });
    const r = await escavadorFetch('/x', { env: { ESCAVADOR_API_TOKEN: 't' }, fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.status, 402);
    assert.equal(r.error, 'Saldo insuficiente');
  });
  it('paginação segue links.next e soma os créditos', async () => {
    const paginas = {
      'https://api.escavador.com/api/v1/mon': fakeResponse({ body: { items: [{ id: 1 }, { id: 2 }], links: { next: 'https://api.escavador.com/api/v1/mon?page=2' } }, headers: { 'Creditos-Utilizados': '2' } }),
      'https://api.escavador.com/api/v1/mon?page=2': fakeResponse({ body: { items: [{ id: 3 }], links: { next: null } }, headers: { 'Creditos-Utilizados': '1' } }),
    };
    const fetchImpl = async (url) => paginas[url] || fakeResponse({ body: { items: [] } });
    const r = await escavadorPaginar('/mon', { env: { ESCAVADOR_API_TOKEN: 't' }, fetchImpl });
    assert.equal(r.ok, true);
    assert.deepEqual(r.itens.map((i) => i.id), [1, 2, 3]);
    assert.equal(r.creditos, 3);
  });
});

describe('Escavador — normalização de publicações (tolerante a nomes de campo)', () => {
  it('nomes "canônicos": mapeia tudo e extrai OAB/UF', () => {
    const item = ocorrenciaParaComunicaItem({
      id: 55, numero_processo: '5009999-11.2026.8.13.0145', sigla_tribunal: 'TJMG',
      nome_orgao: '1ª Vara Cível', tipo_comunicacao: 'Intimação', data_disponibilizacao: '2026-10-01',
      texto: 'Fica intimado...', nome_classe: 'Procedimento Comum', destinatarios: [{ nome: 'Fulano' }],
      numero_oab: '222943', uf_oab: 'mg',
    });
    assert.equal(item.id, 'ESC-55');
    assert.equal(item.numero_processo, '50099991120268130145');
    assert.equal(item.numeroprocessocommascara, '5009999-11.2026.8.13.0145');
    assert.equal(item.siglaTribunal, 'TJMG');
    assert.equal(item.tipoComunicacao, 'Intimação');
    assert.equal(item.data_disponibilizacao, '2026-10-01');
    assert.equal(item._oab, '222943');
    assert.equal(item._uf, 'MG');
  });
  it('nomes alternativos (ocorrencia_id/numero/especie/conteudo/data dd/mm/aaaa)', () => {
    const item = ocorrenciaParaComunicaItem({ ocorrencia_id: 9, numero: '0000001-02.2020.8.13.0001', siglaTribunal: 'TRT3', especie: 'Citação', data: '01/10/2026', conteudo: 'teor' });
    assert.equal(item.id, 'ESC-9');
    assert.equal(item.tipoComunicacao, 'Citação');
    assert.equal(item.data_disponibilizacao, '2026-10-01');
    assert.equal(item.texto, 'teor');
  });
  it('item de DIÁRIO (Escavador): extrai o CNJ do texto e mapeia diario_sigla/diario_data/caderno', () => {
    const item = ocorrenciaParaComunicaItem({
      id: 757007, diario_sigla: 'DJSP', diario_data: '2018-12-18', caderno: 'Primeira Instancia da Capital',
      texto: '(OAB 222943/MG) Processo 0024251-28.2013.8.26.0002 - Procedimento Comum - Fulano - Amil Saúde', tipo_resultado: 'Diario',
    });
    assert.equal(item.id, 'ESC-757007');
    assert.equal(item.numero_processo, '00242512820138260002'); // extraído do texto
    assert.equal(item.numeroprocessocommascara, '0024251-28.2013.8.26.0002');
    assert.equal(item.siglaTribunal, 'DJSP');
    assert.equal(item.nomeOrgao, 'Primeira Instancia da Capital');
    assert.equal(item.data_disponibilizacao, '2018-12-18');
  });
  it('sem id: gera id estável a partir de data+número (dedupe não quebra)', () => {
    const a = ocorrenciaParaComunicaItem({ numero: '123', data: '2026-10-01', texto: 't' }, 0);
    assert.match(a.id, /^ESC-2026-10-01-123-0$/);
  });
});

describe('Escavador — extração de ocorrências do callback', () => {
  it('encontra em "aparicoes", aninhado em "monitoramento", e aceita objeto único', () => {
    assert.equal(extrairOcorrencias({ aparicoes: [{ id: 1 }, { id: 2 }] }).length, 2);
    assert.equal(extrairOcorrencias({ monitoramento: { ocorrencias: [{ id: 3 }] } }).length, 1);
    assert.equal(extrairOcorrencias([{ id: 9 }]).length, 1);
    assert.equal(extrairOcorrencias({ texto: 'uma publicação só' }).length, 1);
    assert.deepEqual(extrairOcorrencias({ nada: true }), []);
  });
});

describe('Escavador — mapeamento para importar processo', () => {
  it('mapeia número, tribunal, classe e separa autor/réu (tolerante)', () => {
    const pd = processoParaImport({
      numero_processo: '5009999-11.2026.8.13.0145', sigla_tribunal: 'TJMG', classe: 'Execução Fiscal',
      assunto: 'ISS', envolvidos: [{ nome: 'Fulano', polo: 'ATIVO', cpf: '529.982.247-25' }, { nome: 'Município', polo: 'PASSIVO' }],
    });
    assert.equal(pd.numero_processo, '5009999-11.2026.8.13.0145');
    assert.equal(pd.tribunal_code, 'TJMG');
    assert.equal(pd.class_name, 'Execução Fiscal');
    assert.equal(pd.polo_ativo[0].name, 'Fulano');
    assert.equal(pd.polo_ativo[0].document, '52998224725');
    assert.equal(pd.polo_passivo[0].name, 'Município');
  });
  it('sem lado definido, usa o primeiro envolvido como autor', () => {
    const pd = processoParaImport({ numero: '1', envolvidos: [{ nome: 'Única Parte' }] });
    assert.equal(pd.polo_ativo[0].name, 'Única Parte');
  });
  it('traz o trecho (resumo) e o link da publicação para conferência', () => {
    const pd = processoParaImport({ numero: '5', sigla_tribunal: 'DJMG', texto: '  Processo 1234567-89.2024.8.13.0145   -   intimação   ', link: 'https://www.escavador.com/diarios/1/x' });
    assert.equal(pd.link, 'https://www.escavador.com/diarios/1/x');
    assert.match(pd.resumo, /Processo 1234567-89\.2024\.8\.13\.0145 - intima/);
    assert.ok(!/\s{2,}/.test(pd.resumo), 'o resumo não deve ter espaços duplicados');
  });
  it('resumoTexto limpa espaços e corta no tamanho', () => {
    assert.equal(resumoTexto('  a   b  c '), 'a b c');
    assert.equal(resumoTexto('abcdef', 3), 'abc…');
    assert.equal(resumoTexto(''), '');
  });
  it('é idempotente: já normalizado passa de novo sem perder nada', () => {
    const uma = processoParaImport({ numero_processo: '9', sigla_tribunal: 'TRT3', classe: 'Reclamatória', envolvidos: [{ nome: 'A', polo: 'ATIVO' }, { nome: 'B', polo: 'PASSIVO' }] });
    const duas = processoParaImport(uma); // reaplicar não pode estragar (busca → adicionar)
    assert.deepEqual(duas.polo_ativo, uma.polo_ativo);
    assert.equal(duas.numero_processo, '9');
    assert.equal(duas.tribunal_code, 'TRT3');
    assert.equal(duas.class_name, 'Reclamatória');
  });
});

describe('Escavador — detalhe estruturado do processo (V2) "completa o máximo"', () => {
  // Resposta V2 típica: fontes[].capa (dados do processo) + fontes[].envolvidos (partes+advogados).
  const DETALHE = {
    numero_cnj: '5009999-11.2026.8.13.0145', id: 123,
    fontes: [{
      sigla: 'TJMG', nome: 'Tribunal de Justiça de Minas Gerais', grau: 1,
      capa: {
        classe: 'Procedimento Comum Cível', assunto: 'Indenização por Dano Moral',
        orgao_julgador: '2ª Vara Cível de Juiz de Fora', data_distribuicao: '2024-03-10',
        valor_causa: { valor: '15000.00', moeda: 'R$' }, situacao: 'Ativo', juiz: 'Dra. Fulana de Tal',
      },
      envolvidos: [
        { nome: 'Maria Cliente', polo: 'ATIVO', cpf: '529.982.247-25', advogados: [{ nome: 'Dr. Jorge Alvim', oabs: [{ numero: 222943, uf: 'MG' }] }] },
        { nome: 'Banco Réu S.A.', polo: 'PASSIVO', cnpj: '11.444.777/0001-61', advogados: [{ nome: 'Outro Adv', oabs: [{ numero: 111111, uf: 'SP' }] }] },
      ],
    }],
  };

  it('detalharProcesso monta a URL V2 com o CNJ mascarado e manda o Bearer', async () => {
    let capturado = null;
    const fetchImpl = async (url, opts) => { capturado = { url, opts }; return fakeResponse({ body: DETALHE }); };
    const r = await detalharProcesso({ numeroCnj: '50099991120268130145', env: { ESCAVADOR_API_TOKEN: 't' }, fetchImpl });
    assert.equal(r.ok, true);
    assert.match(capturado.url, /\/api\/v2\/processos\/numero_cnj\/5009999-11\.2026\.8\.13\.0145$/);
    assert.equal(capturado.opts.headers.Authorization, 'Bearer t');
  });

  it('mapeia capa (classe/assunto/vara/juiz/distribuição/valor) e separa as partes', () => {
    const pd = detalheParaImport(DETALHE, { oab: '222943', uf: 'MG' });
    assert.equal(pd.numero_processo, '50099991120268130145');
    assert.equal(pd.tribunal_code, 'TJMG');
    assert.equal(pd.class_name, 'Procedimento Comum Cível');
    assert.equal(pd.subject, 'Indenização por Dano Moral');
    assert.equal(pd.court_branch, '2ª Vara Cível de Juiz de Fora');
    assert.equal(pd.judge_name, 'Dra. Fulana de Tal');
    assert.equal(pd.distribution_date, '2024-03-10');
    assert.equal(pd.valor_causa, '15000.00');
    assert.equal(pd.situacao, 'Ativo');
    assert.equal(pd.polo_ativo[0].name, 'Maria Cliente');
    assert.equal(pd.polo_passivo[0].name, 'Banco Réu S.A.');
    assert.equal(pd.detalhado, true);
  });

  it('detecta o CLIENTE pela OAB do dono e aponta a PARTE CONTRÁRIA', () => {
    const pd = detalheParaImport(DETALHE, { oab: '222943', uf: 'MG' });
    assert.equal(pd.cliente_sugerido.name, 'Maria Cliente');          // a parte que ELE representa
    assert.equal(pd.cliente_sugerido.document, '52998224725');
    assert.equal(pd.parte_contraria, 'Banco Réu S.A.');               // o polo oposto
  });

  it('sem a OAB do dono entre os advogados: não chuta cliente nem parte contrária', () => {
    const pd = detalheParaImport(DETALHE, { oab: '999999', uf: 'MG' });
    assert.equal(pd.cliente_sugerido, null);
    assert.equal(pd.parte_contraria, '');
  });

  it('grauParaInstancia traduz grau/recurso para o rótulo do sistema', () => {
    assert.equal(grauParaInstancia(1), '1ª Instância');
    assert.equal(grauParaInstancia('2'), '2ª Instância');
    assert.equal(grauParaInstancia('Recurso'), '2ª Instância');
    assert.equal(grauParaInstancia('STJ'), 'Instância Superior');
    assert.equal(grauParaInstancia(''), '1ª Instância');
  });
});

describe('Escavador — utilitários', () => {
  it('normalizaData aceita ISO, dd/mm/aaaa e timestamp', () => {
    assert.equal(normalizaData('2026-10-01T10:00:00Z'), '2026-10-01');
    assert.equal(normalizaData('01/10/2026'), '2026-10-01');
    assert.equal(normalizaData(''), '');
  });
  it('mascaraCnj formata 20 dígitos e ignora tamanho errado', () => {
    assert.equal(mascaraCnj('50099991120268130145'), '5009999-11.2026.8.13.0145');
    assert.equal(mascaraCnj('123'), '123');
    assert.equal(soDigitos('5009999-11.2026.8.13.0145'), '50099991120268130145');
  });
});
