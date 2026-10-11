/**
 * Radar Judicial HONESTO: só devolve dado real (DataJud, DJEN ou o cadastro do escritório). Quando não acha,
 * devolve lista vazia + o MOTIVO + links do portal oficial. Nunca "processo de enchimento", advogado padrão ou andamento inventado.
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = path.join(os.tmpdir(), `jaw-radar-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.DATAJUD_API_KEY;

const { app, db } = await import('../server.js');
const { FABRICATED_MOVEMENTS_SQL } = await import('../scripts/radar-limpar-fabricados.js');
const { checkRepo } = await import('../scripts/check-env-exposure.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

let token;
const buscar = (query_type, query_term, tribunal = 'all') =>
  request(app).post('/api/judicial/search').set('Authorization', `Bearer ${token}`).send({ query_type, query_term, tribunal }).timeout(60000);
const MARCAS = ['Consulta Direcionada aos Tribunais', 'Dr. Jorge Eduardo da Silva Alvim', 'Processo em Tramitação Regular', 'Conclusos para Despacho Inicial', 'Empresa Requerida / Reclamada', 'Petição Inicial / Distribuição'];

before(async () => {
  token = (await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD })).body.token;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at) VALUES ('CLI-RADAR-1', 'PF', 'Fulana Radar Teste', '529.982.247-25', 'fulana.radar@teste.com', '(32) 99999-0001', 'Ativo', ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at) VALUES ('CLI-RADAR-2', 'PF', 'Beltrano Sem Processo', '111.444.777-35', 'beltrano.radar@teste.com', '(32) 99999-0002', 'Ativo', ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO lawsuits (id, client_id, cnj_number, tribunal, instance, action_type, status, created_at, updated_at) VALUES ('LAW-RADAR-1', 'CLI-RADAR-1', '5009999-11.2026.8.13.0145', 'TJMG', '1ª Instância', 'Ação de Teste', 'Em Andamento', ?, ?)`).run(now, now);
});

describe('Radar Judicial: nada inventado', () => {
  it('cliente SEM processo: lista vazia e aviso (antes inventava um processo "5007788-99…")', async () => {
    const r = await buscar('cpf', '111.444.777-35');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.total, 0);
    assert.deepEqual(r.body.processes, []);
    assert.ok(r.body.notices.some((n) => /Beltrano Sem Processo/.test(n) && /sem processo cadastrado/.test(n)), JSON.stringify(r.body.notices));
    assert.ok(!MARCAS.some((m) => JSON.stringify(r.body).includes(m)));
  });
  it('processo do escritório: só campos reais; o que falta é "não informado"; sem advogado, andamento ou documento inventado', async () => {
    const r = await buscar('number', '5009999-11.2026.8.13.0145');
    assert.equal(r.status, 200);
    const p = r.body.processes.find((x) => x.id === 'LAW-RADAR-1');
    assert.ok(p, JSON.stringify(r.body.processes).slice(0, 300));
    assert.equal(p.origin, 'escritorio');
    assert.deepEqual(p.lawyers, []);
    assert.deepEqual(p.movements, []);
    assert.deepEqual(p.public_documents, []);
    assert.equal(p.court_branch, 'Não informado');
    assert.equal(p.polo_passivo[0].name, 'Não informado');
    assert.ok(!MARCAS.some((m) => JSON.stringify(r.body).includes(m)));
  });
  it('número que não existe: lista vazia (nunca um "card" de processo falso), com fontes e links do portal', async () => {
    const r = await buscar('number', '0000001-02.2020.8.13.0001', 'tjmg');
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
    assert.ok(Array.isArray(r.body.sources) && r.body.sources.length > 0, 'faltam as fontes consultadas');
    assert.ok(r.body.sources.some((s) => /DataJud/.test(s.name) && s.ok === false), 'o motivo da falha do DataJud deveria aparecer: ' + JSON.stringify(r.body.sources));
    assert.ok(r.body.portal_links.some((l) => /^https:\/\//.test(l.url)));
    assert.ok(r.body.notices.some((n) => /NÃO prova/.test(n)));
  });
  it('OAB de terceiro não devolve os processos do escritório', async () => {
    const r = await buscar('oab', '999999');
    assert.equal(r.status, 200);
    assert.ok(!r.body.processes.some((p) => p.id === 'LAW-RADAR-1'));
  });
  it('CPF/CNPJ e nome explicam o limite da busca', async () => {
    const a = await buscar('cpf', '529.982.247-25');
    assert.ok(a.body.notices.some((n) => /CPF\/CNPJ/.test(n)));
    assert.ok(a.body.processes.some((p) => p.id === 'LAW-RADAR-1'), 'o CPF do cliente deveria achar o processo cadastrado');
    const b = await buscar('name', 'ZZZ Nome Inexistente 99137');
    assert.ok(b.body.notices.some((n) => /Diário da Justiça/.test(n)));
  });
});

describe('limpeza dos andamentos inventados', () => {
  const rodar = (...args) =>
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/radar-limpar-fabricados.js'), ...args], { env: { ...process.env, DB_PATH: TMP_DB }, encoding: 'utf8' });
  it('só apaga os textos de enchimento exatos, e só com --aplicar', () => {
    const now = new Date().toISOString();
    const ins = db.prepare(`INSERT INTO lawsuit_movements (lawsuit_id, movement_date, title, description, created_at) VALUES ('LAW-RADAR-1', '2026-08-20', ?, ?, ?)`);
    ins.run('Consulta Direcionada aos Tribunais', 'Acesse o portal oficial', now);
    ins.run('Processo em Tramitação Regular', 'Autos em andamento com prazos vigentes.', now);
    ins.run('Distribuição da Ação Judicial', 'Autos distribuídos perante a comarca.', now);
    ins.run('Conclusos para Despacho Inicial', 'Aguardando manifestação judicial.', now);
    ins.run('Distribuição da Ação', 'Processo distribuído para Vara Cível.', now);
    ins.run('Sentença publicada', 'Julgado procedente (andamento REAL digitado pelo advogado).', now); // legítimo
    ins.run('Distribuição da Ação Judicial', 'Texto digitado por uma pessoa, diferente do enchimento.', now); // legítimo
    const antes = db.prepare(`SELECT COUNT(*) n FROM lawsuit_movements WHERE ${FABRICATED_MOVEMENTS_SQL}`).get().n;
    assert.equal(antes, 5);
    const seco = rodar();
    assert.match(seco, /Nada foi apagado/);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM lawsuit_movements WHERE ${FABRICATED_MOVEMENTS_SQL}`).get().n, 5);
    assert.match(rodar('--aplicar'), /5 andamento\(s\) inventado\(s\) apagado\(s\)/);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM lawsuit_movements`).get().n, 2, 'os 2 andamentos legítimos devem continuar');
  });
});

describe('guardião: chave de API literal também em Python', () => {
  it('reprova uma chave fixa em .py (repositório de teste)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-py-'));
    try {
      const sh = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
      sh('init', '-q');
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.writeFileSync(path.join(dir, 'scripts', 'x.py'), 'KEY = os.environ.get("K", "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==")\n');
      sh('add', '-A');
      assert.ok(checkRepo(dir).violations.some((v) => /Chave de API literal no código \(scripts\/x\.py\)/.test(v)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('o repositório real não tem chave literal (js nem py)', () => {
    assert.deepEqual(checkRepo(ROOT).violations.filter((v) => /Chave de API literal/.test(v)), []);
  });
});
