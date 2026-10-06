/**
 * Radar via Escavador (ponta a ponta): o webhook valida o token do callback e grava a
 * publicação REAL na mesma tabela (court_publications), com dedupe, vínculo e alerta.
 * Sem chave, as rotas devolvem 503 claro (nunca dado inventado); sem login, RBAC nega.
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DB = path.join(os.tmpdir(), `jaw-radar-esc-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.ESCAVADOR_API_TOKEN;
delete process.env.ESCAVADOR_CALLBACK_TOKEN;

const { app, db } = await import('../server.js');
const { processosAtivosParaMonitorar, saldoCentavos, saldoBaixo, registrarGasto, mesclarProcesso } = await import('../src/modules/radar/radar.routes.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

let token;
before(async () => {
  token = (await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD })).body.token;
});

const OCORRENCIA = {
  id: 7001, numero_processo: '5009999-11.2026.8.13.0145', sigla_tribunal: 'TJMG',
  nome_orgao: '1ª Vara Cível de Juiz de Fora', tipo_comunicacao: 'Intimação',
  data_disponibilizacao: '2026-10-02', texto: 'Fica a parte intimada a se manifestar em 15 dias.',
  nome_classe: 'Procedimento Comum', numero_oab: '222943', uf_oab: 'MG',
};

describe('Radar/Escavador — gating sem chave', () => {
  it('status reporta não configurado (honesto, sem inventar)', async () => {
    const r = await request(app).get('/api/radar/status').set('Authorization', `Bearer ${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.configurado, false);
    assert.equal(r.body.provider, 'escavador');
  });
  it('listar monitoramentos sem token da API → 503 com instrução', async () => {
    const r = await request(app).get('/api/radar/monitoramentos').set('Authorization', `Bearer ${token}`);
    assert.equal(r.status, 503);
    assert.match(r.body.error, /ESCAVADOR_API_TOKEN/);
  });
  it('RBAC: sem login o Radar é negado', async () => {
    const r = await request(app).get('/api/radar/status');
    assert.ok(r.status === 401 || r.status === 403, `esperava 401/403, veio ${r.status}`);
  });
});

describe('Radar/Escavador — webhook (callback)', () => {
  it('sem ESCAVADOR_CALLBACK_TOKEN configurado → 503', async () => {
    const r = await request(app).post('/api/webhooks/escavador').send({ aparicoes: [OCORRENCIA] });
    assert.equal(r.status, 503);
  });

  it('com token configurado: valida, recusa token errado e ingere publicação real', async () => {
    process.env.ESCAVADOR_CALLBACK_TOKEN = 'callback-secreto-123';

    // token errado → 401
    const errado = await request(app).post('/api/webhooks/escavador').set('Authorization', 'Bearer token-errado').send({ aparicoes: [OCORRENCIA] });
    assert.equal(errado.status, 401);

    // token certo → ingere
    const ok = await request(app).post('/api/webhooks/escavador').set('Authorization', 'Bearer callback-secreto-123').send({ aparicoes: [OCORRENCIA] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.recebidas, 1);
    assert.equal(ok.body.salvas, 1);

    // gravou na tabela real, com os campos certos
    const row = db.prepare(`SELECT * FROM court_publications WHERE comunicacao_id = 'ESC-7001'`).get();
    assert.ok(row, 'a publicação deveria estar em court_publications');
    assert.equal(row.numero_processo, '50099991120268130145');
    assert.equal(row.sigla_tribunal, 'TJMG');
    assert.equal(row.tipo_comunicacao, 'Intimação');
    assert.equal(row.advogado_oab, 'OAB/MG 222943');

    // reenvio idêntico não duplica (dedupe)
    const denovo = await request(app).post('/api/webhooks/escavador').set('Authorization', 'Bearer callback-secreto-123').send({ aparicoes: [OCORRENCIA] });
    assert.equal(denovo.body.salvas, 0, 'o mesmo callback não pode duplicar a publicação');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM court_publications WHERE comunicacao_id = 'ESC-7001'`).get().n, 1);

    delete process.env.ESCAVADOR_CALLBACK_TOKEN;
  });
});

describe('Radar/Escavador — controle de gasto (saldo)', () => {
  it('saldoCentavos entende reais e centavos; saldoBaixo respeita o mínimo', () => {
    assert.equal(saldoCentavos({ saldo: 12.5 }), 1250);          // reais → centavos
    assert.equal(saldoCentavos({ saldo_centavos: 800 }), 800);   // já em centavos
    assert.equal(saldoCentavos({}), null);
    assert.equal(saldoBaixo(2000, { ESCAVADOR_SALDO_MINIMO_CENTAVOS: '3000' }), true);
    assert.equal(saldoBaixo(5000, { ESCAVADOR_SALDO_MINIMO_CENTAVOS: '3000' }), false);
    assert.equal(saldoBaixo(null), false); // sem saldo conhecido não dispara alarme falso
  });
  it('o gasto registrado aparece no total do status', async () => {
    registrarGasto('teste', 37);
    const r = await request(app).get('/api/radar/status').set('Authorization', `Bearer ${token}`);
    assert.ok(r.body.gastos.gasto_total_centavos >= 37, JSON.stringify(r.body.gastos));
  });
});

describe('Radar/Escavador — cadastro automático por CNJ', () => {
  before(() => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at) VALUES ('CLI-AUTO-1','PF','Cliente Auto','529.982.247-25','cliente.auto@teste.com','(32) 99999-0003','Ativo',?,?)`).run(now, now);
    const ins = db.prepare(`INSERT INTO lawsuits (id, client_id, cnj_number, tribunal, status, created_at, updated_at) VALUES (?, 'CLI-AUTO-1', ?, 'TJMG', ?, ?, ?)`);
    ins.run('LAW-AUTO-1', '5001111-11.2026.8.13.0145', 'Em Andamento', now, now);
    ins.run('LAW-AUTO-2', '5002222-22.2026.8.13.0145', 'Em Andamento', now, now);
    ins.run('LAW-AUTO-3', '5002222-22.2026.8.13.0145', 'Em Andamento', now, now); // CNJ repetido
    ins.run('LAW-AUTO-4', '5003333-33.2026.8.13.0145', 'Arquivado', now, now);     // inativo
  });
  it('seleciona só os ativos e não repete o mesmo número', () => {
    const lista = processosAtivosParaMonitorar();
    const cnjs = lista.map((p) => p.cnj);
    assert.ok(cnjs.includes('50011111120268130145'));
    assert.ok(cnjs.includes('50022222220268130145'));
    assert.equal(cnjs.filter((c) => c === '50022222220268130145').length, 1, 'CNJ repetido deve entrar uma vez só');
    assert.ok(!cnjs.includes('50033333330268130145'), 'processo arquivado não deve ser monitorado');
  });
  it('sem chave da API, o cadastro automático responde 503 (não finge)', async () => {
    const r = await request(app).post('/api/radar/monitorar-processos-ativos').set('Authorization', `Bearer ${token}`).send({});
    assert.equal(r.status, 503);
    assert.match(r.body.error, /ESCAVADOR_API_TOKEN/);
  });
});

describe('Radar/Escavador — adicionar processos ao sistema (importar)', () => {
  it('sem chave da API → 503', async () => {
    const r = await request(app).post('/api/radar/importar-processos').set('Authorization', `Bearer ${token}`).send({ oab: '222943' });
    assert.equal(r.status, 503);
  });
  it('com chave: importa de uma lista, cria o processo e não duplica (sem enriquecer = sem rede)', async () => {
    process.env.ESCAVADOR_API_TOKEN = 'token-teste';
    const proc = { numero_processo: '7777777-77.2026.8.13.0145', sigla_tribunal: 'TJMG', classe: 'Ação de Teste', envolvidos: [{ nome: 'Cliente Importado', polo: 'ATIVO', cpf: '111.444.777-35' }] };

    const r1 = await request(app).post('/api/radar/importar-processos').set('Authorization', `Bearer ${token}`).send({ processos: [proc], enriquecer: false });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.importados, 1);
    const row = db.prepare(`SELECT * FROM lawsuits WHERE cnj_number = '7777777-77.2026.8.13.0145'`).get();
    assert.ok(row, 'o processo deveria ter sido criado');
    assert.ok(row.client_id, 'deveria ter criado/achado um cliente');

    const r2 = await request(app).post('/api/radar/importar-processos').set('Authorization', `Bearer ${token}`).send({ processos: [proc], enriquecer: false });
    assert.equal(r2.body.importados, 0, 'não pode duplicar');
    assert.equal(r2.body.jaExistiam, 1);
    delete process.env.ESCAVADOR_API_TOKEN;
  });
});

describe('Radar/Escavador — "achou pelo Radar, completa o máximo" (enriquecimento)', () => {
  it('mesclarProcesso: o detalhe completa, mas não apaga o que a busca já tinha', () => {
    const base = { numero_processo: '1', tribunal_code: 'TJMG', class_name: 'Ação Judicial', subject: '', resumo: 'trecho do diário', link: 'https://x/diario' };
    const rico = { numero_processo: '1', tribunal_code: 'TJMG', class_name: 'Execução Fiscal', subject: 'ISS', court_branch: '1ª Vara', parte_contraria: 'Município', link: '', detalhado: true };
    const m = mesclarProcesso(base, rico);
    assert.equal(m.class_name, 'Execução Fiscal');   // detalhe completa a classe genérica
    assert.equal(m.subject, 'ISS');
    assert.equal(m.court_branch, '1ª Vara');
    assert.equal(m.parte_contraria, 'Município');
    assert.equal(m.resumo, 'trecho do diário');       // não perdeu o resumo da publicação
    assert.equal(m.link, 'https://x/diario');          // manteve o link que já existia
    assert.equal(m.detalhado, true);
  });

  it('importar com enriquecer: busca o detalhe, detecta o cliente pela OAB e preenche a ficha', async () => {
    process.env.ESCAVADOR_API_TOKEN = 'token-teste';
    const CNJ = '8888888-88.2026.8.13.0145';
    const detalhe = {
      numero_cnj: CNJ, id: 999,
      fontes: [{
        sigla: 'TJMG', nome: 'TJMG', grau: 1,
        capa: { classe: 'Execução Fiscal', assunto: 'ISS', orgao_julgador: '3ª Vara da Fazenda', data_distribuicao: '2023-05-01', valor_causa: { valor: '9000.00' }, situacao: 'Ativo', juiz: 'Dr. Juiz' },
        envolvidos: [
          { nome: 'Empresa do Dr. Jorge', polo: 'ATIVO', cnpj: '11.444.777/0001-61', advogados: [{ nome: 'Jorge', oabs: [{ numero: 222943, uf: 'MG' }] }] },
          { nome: 'Município de Juiz de Fora', polo: 'PASSIVO' },
        ],
      }],
    };
    const realFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      const body = u.includes('/api/v2/processos/numero_cnj/') ? detalhe : {};
      return { ok: true, status: 200, headers: { get: (n) => (String(n).toLowerCase() === 'creditos-utilizados' ? '12' : null) }, json: async () => body };
    };
    try {
      const proc = { numero_processo: CNJ, sigla_tribunal: 'TJMG' }; // a busca traz pouco; o detalhe completa
      const r = await request(app).post('/api/radar/importar-processos').set('Authorization', `Bearer ${token}`).send({ processos: [proc], oab: '222943', uf: 'MG' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.importados, 1);
      assert.equal(r.body.enriquecidos, 1);

      const row = db.prepare(`SELECT * FROM lawsuits WHERE cnj_number = ?`).get(CNJ);
      assert.ok(row, 'o processo deveria ter sido criado');
      assert.equal(row.action_type, 'Execução Fiscal');
      assert.equal(row.subject, 'ISS');
      assert.equal(row.court_branch, '3ª Vara da Fazenda');
      assert.equal(row.judge_name, 'Dr. Juiz');
      assert.equal(row.distribution_date, '2023-05-01');
      assert.match(row.notes, /Parte contrária: Município de Juiz de Fora/);
      assert.match(row.notes, /Valor da causa: 9000\.00/);

      // o cliente é a parte que o Dr. Jorge representa (detectada pela OAB), não a parte contrária
      const cli = db.prepare(`SELECT full_name FROM clients WHERE id = ?`).get(row.client_id);
      assert.equal(cli.full_name, 'Empresa do Dr. Jorge');
    } finally {
      global.fetch = realFetch;
      delete process.env.ESCAVADOR_API_TOKEN;
    }
  });
});
