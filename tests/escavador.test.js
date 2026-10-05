/**
 * Cliente do Escavador (unitário, sem rede real): porta de entrada do Radar.
 * Confere gating pela chave, montagem da requisição (Bearer, query, créditos),
 * paginação e a NORMALIZAÇÃO tolerante das publicações para o formato da ComunicaAPI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escavadorConfigured, escavadorConfig, escavadorFetch, escavadorPaginar,
  extrairOcorrencias, ocorrenciaParaComunicaItem, normalizaData, mascaraCnj, soDigitos,
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
