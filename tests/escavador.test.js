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
  criarMonitoramentoDiario, criarMonitoramentoProcesso,
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

describe('Escavador — criação de monitoramento (tipo correto, minúsculo)', () => {
  it('monitoramento por TERMO (OAB): tipo="termo" e termo no corpo', async () => {
    let corpo = null;
    const fetchImpl = async (url, opts) => { corpo = JSON.parse(opts.body); return fakeResponse({ body: { id: 1 } }); };
    const r = await criarMonitoramentoDiario({ termo: '222943/MG', env: { ESCAVADOR_API_TOKEN: 't' }, fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(corpo.tipo, 'termo', 'o tipo precisa ser "termo" (minúsculo), não "UNICO"');
    assert.equal(corpo.termo, '222943/MG');
    assert.equal(corpo.monitorar_em_todos_diarios, true);
  });
  it('monitoramento por PROCESSO: tipo="processo" e processo_id no corpo', async () => {
    let corpo = null;
    const fetchImpl = async (url, opts) => { corpo = JSON.parse(opts.body); return fakeResponse({ body: { id: 2 } }); };
    const r = await criarMonitoramentoProcesso({ processoId: 55, env: { ESCAVADOR_API_TOKEN: 't' }, fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(corpo.tipo, 'processo');
    assert.equal(corpo.processo_id, 55);
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

  it('sem a OAB do dono entre os advogados: não chuta o cliente, mas informa o réu (polo passivo)', () => {
    const pd = detalheParaImport(DETALHE, { oab: '999999', uf: 'MG' });
    assert.equal(pd.cliente_sugerido, null);                 // não sabemos quem o Dr. Jorge representa
    assert.equal(pd.parte_contraria, 'Banco Réu S.A.');      // mas o réu é fato (polo passivo), não chute
  });

  it('resposta REAL do Escavador (Usucapião): escolhe a fonte com capa, exclui advogados, preenche capa', () => {
    const REAL = {
      numero_cnj: '5015787-60.2024.8.13.0145',
      titulo_polo_ativo: 'Lessandro Hebert Zacaron Gomes e outros', titulo_polo_passivo: null,
      data_inicio: '2024-04-17', estado_origem: { sigla: 'MG' },
      fontes: [
        { tipo: 'DIARIO_OFICIAL', sigla: 'DJMG', grau: 1, capa: null,
          envolvidos: [{ nome: 'Francisco Carlos Oliveira Ladeira', tipo: 'Advogado', polo: 'ADVOGADO', oabs: [{ uf: 'MG', numero: 63175 }] }] },
        { tipo: 'TRIBUNAL', sigla: 'TJMG', nome: 'Tribunal de Justiça do Minas Gerais', grau: 1,
          url: 'https://pje-consulta-publica.tjmg.jus.br/pje/ConsultaPublica/listView.seam',
          capa: { classe: '[CÍVEL] USUCAPIÃO (49)', assunto: 'Usucapião Extraordinária',
            orgao_julgador: 'Vara de Sucessões, Empresarial e de Registros Públicos da Comarca de Juiz de Fora',
            valor_causa: { valor: '20000.0000', moeda: null, valor_formatado: '20.000,00' },
            data_distribuicao: '2024-04-17', situacao: 'Tramitando' },
          envolvidos: [
            { nome: 'Lessandro Hebert Zacaron Gomes', tipo: 'AUTOR', tipo_normalizado: 'Autor', polo: 'ATIVO', cpf: '00573244685',
              advogados: [{ nome: 'Diogo Teixeira Simoes', polo: 'ADVOGADO', oabs: [{ uf: 'MG', numero: 106846 }] }] },
            { nome: 'Luiz Carlos Adum Mockdeci', tipo: 'TERCEIRO INTERESSADO', polo: 'DESCONHECIDO', cpf: '20976283620', advogados: [] },
          ] },
      ],
    };
    const pd = detalheParaImport(REAL, { oab: '222943', uf: 'MG' });
    assert.equal(pd.numero_processo, '50157876020248130145');
    assert.equal(pd.tribunal_code, 'TJMG');
    assert.equal(pd.class_name, '[CÍVEL] USUCAPIÃO (49)');
    assert.equal(pd.subject, 'Usucapião Extraordinária');
    assert.match(pd.court_branch, /Vara de Sucessões/);
    assert.equal(pd.valor_causa, '20.000,00');            // usa o valor_formatado
    assert.equal(pd.distribution_date, '2024-04-17');
    assert.equal(pd.polo_ativo.length, 1);                 // advogado e terceiro não entram como parte ativa
    assert.equal(pd.polo_ativo[0].name, 'Lessandro Hebert Zacaron Gomes');
    assert.equal(pd.polo_passivo.length, 0);
    assert.equal(pd.parte_contraria, '');                  // não há polo passivo (réu) -> correto ficar vazio
    assert.equal(pd.cliente_sugerido, null);               // a OAB 222943 não está no processo -> não chuta cliente
    assert.match(pd.link, /pje-consulta-publica\.tjmg\.jus\.br/);
  });

  it('quando a OAB do dono representa uma parte: detecta cliente, réu e instância (grau 2)', () => {
    const COM_JORGE = {
      numero_cnj: '0000001-00.2023.8.13.0145',
      fontes: [{ sigla: 'TJMG', grau: 2,
        capa: { classe: 'Execução de Título', assunto: 'Contratos', valor_causa: { valor_formatado: '1.000,00' }, data_distribuicao: '2023-01-02' },
        envolvidos: [
          { nome: 'Cliente do Jorge', tipo: 'AUTOR', polo: 'ATIVO', cnpj: '11444777000161',
            advogados: [{ nome: 'Jorge Alvim', polo: 'ADVOGADO', oabs: [{ uf: 'MG', numero: 222943 }] }] },
          { nome: 'Banco Réu S.A.', tipo: 'RÉU', polo: 'PASSIVO',
            advogados: [{ nome: 'Outro Adv', polo: 'ADVOGADO', oabs: [{ uf: 'SP', numero: 111111 }] }] },
        ] }],
    };
    const pd = detalheParaImport(COM_JORGE, { oab: '222943', uf: 'MG' });
    assert.equal(pd.cliente_sugerido.name, 'Cliente do Jorge');
    assert.equal(pd.cliente_sugerido.document, '11444777000161');
    assert.equal(pd.parte_contraria, 'Banco Réu S.A.');
    assert.equal(pd.instance, '2ª Instância');
    assert.equal(pd.valor_causa, '1.000,00');
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
