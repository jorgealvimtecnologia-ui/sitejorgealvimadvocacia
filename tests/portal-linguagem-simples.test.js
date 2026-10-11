/**
 * AUD-16: portal do cliente em linguagem simples — o advogado controla o que aparece, nada interno vaza,
 * e cada processo mostra situação, linha do tempo explicada e "o que preciso fazer".
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { explainMovement, explainSituation, buildClientLawsuitView, GLOSSARY } from '../src/shared/plain-language.js';

const TMP_DB = path.join(os.tmpdir(), `jaw-portal-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { createClientSession } = await import('../src/middleware/auth.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

describe('explicação em linguagem simples', () => {
  it('traduz tipos comuns de andamento', () => {
    assert.match(explainMovement('Conclusos para sentença'), /juiz/i);
    assert.match(explainMovement('Citação realizada'), /avisada oficialmente/);
    assert.match(explainMovement('Juntada de petição'), /anexado/);
    assert.match(explainMovement('Trânsito em julgado'), /definitiva/);
  });
  it('termos específicos vencem os genéricos (sem afirmar o que não aconteceu)', () => {
    assert.match(explainMovement('Audiência de instrução e julgamento designada'), /audiência/i);
    assert.doesNotMatch(explainMovement('Audiência de instrução e julgamento designada'), /decidiu o caso/);
    assert.match(explainMovement('Cumprimento de sentença iniciado'), /fazer valer/);
    assert.doesNotMatch(explainMovement('Cumprimento de sentença iniciado'), /decidiu o caso/);
  });
  it('andamento desconhecido recebe frase neutra, sem inventar fato', () => {
    assert.match(explainMovement('Xyzzy 123'), /movimentação no processo/);
  });
  it('situação: o texto do advogado vence; senão vem do status', () => {
    assert.deepEqual(explainSituation({ client_summary: 'Estamos aguardando a sentença.', status: 'Arquivado' }), { text: 'Estamos aguardando a sentença.', source: 'advogado' });
    assert.match(explainSituation({ status: 'Arquivado' }).text, /encerrado/);
    assert.match(explainSituation({ status: 'Em Andamento' }).text, /em andamento/i);
    assert.equal(explainSituation({ status: 'Em Andamento' }).source, 'automatico');
  });
  it('glossário cobre os termos do dia a dia', () => {
    for (const t of ['Citação', 'Intimação', 'Sentença', 'Recurso', 'Audiência', 'Alvará']) assert.ok(GLOSSARY.some((g) => g.term === t), t);
    assert.ok(GLOSSARY.every((g) => g.meaning.length > 15));
  });
  it('visão do cliente: só andamentos publicados, com explicação, sem nada interno', () => {
    const v = buildClientLawsuitView(
      { id: 'L1', cnj_number: '0001', status: 'Em Andamento', notes: 'SEGREDO INTERNO', judge_name: 'Juiz X', client_next_action: '  ', updated_at: '2026-01-01' },
      [{ id: 1, movement_date: '2026-01-02', title: 'Conclusos', client_visible: 1, client_text: '' }, { id: 2, movement_date: '2026-01-03', title: 'Oculto', client_visible: 0 }]
    );
    assert.equal(v.timeline.length, 1);
    assert.equal(v.timeline[0].source, 'automatico');
    assert.equal(v.action_needed, false);
    assert.match(v.next_action, /Nada a fazer agora/);
    assert.ok(!JSON.stringify(v).includes('SEGREDO') && !JSON.stringify(v).includes('Juiz X'));
  });
});

describe('API: o que o cliente vê e o que o advogado controla', () => {
  let h, ch, lawId, movVisible, movHidden;
  const CLIENT = { id: 'CLI-PORTAL-1', full_name: 'Cliente Portal Teste' };

  it('prepara cliente, processo e andamentos', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD });
    h = { Authorization: `Bearer ${r.body.token}` };
    db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at) VALUES (?, 'PF', ?, '52998224725', 'c@exemplo.com.br', '32999990000', 'ATIVO', 'x', 'x')`).run(CLIENT.id, CLIENT.full_name);
    const l = await request(app).post('/api/lawsuits').set(h).send({ client_id: CLIENT.id, cnj_number: '5001234-56.2026.8.13.0145', tribunal: 'TJMG', action_type: 'Trabalhista', notes: 'NOTA INTERNA CONFIDENCIAL' });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    lawId = l.body.lawsuit?.id || l.body.id || l.body.lawsuitId;
    assert.ok(lawId, JSON.stringify(l.body));
    db.prepare(`UPDATE lawsuits SET judge_name = 'JUIZ SIGILOSO' WHERE id = ?`).run(lawId);
    const m1 = await request(app).post(`/api/lawsuits/${lawId}/movements`).set(h).send({ movement_date: '2026-09-01', title: 'Citação realizada', description: 'DESCRICAO INTERNA ESTRATEGICA' });
    const m2 = await request(app).post(`/api/lawsuits/${lawId}/movements`).set(h).send({ movement_date: '2026-09-10', title: 'Audiência designada', description: 'outra nota interna', client_visible: true, client_text: 'Sua audiência será no dia 20/10. Chegue 30 minutos antes.' });
    movHidden = m1.body.movementId; movVisible = m2.body.movementId;
    ch = { Authorization: `Bearer ${createClientSession(CLIENT)}` };
  });

  it('padrão: andamento novo fica OCULTO; só o publicado aparece, com a explicação do advogado', async () => {
    const r = await request(app).get('/api/client-portal/me').set(ch);
    assert.equal(r.status, 200);
    const l = r.body.lawsuits.find((x) => x.id === lawId);
    assert.ok(l);
    assert.deepEqual(l.timeline.map((t) => t.id), [movVisible]);
    assert.equal(l.timeline[0].simple, 'Sua audiência será no dia 20/10. Chegue 30 minutos antes.');
    assert.equal(l.timeline[0].source, 'advogado');
  });

  it('NADA interno vaza: notas, juiz, descrições dos andamentos', async () => {
    const txt = JSON.stringify((await request(app).get('/api/client-portal/me').set(ch)).body);
    for (const segredo of ['NOTA INTERNA CONFIDENCIAL', 'JUIZ SIGILOSO', 'DESCRICAO INTERNA ESTRATEGICA', 'outra nota interna']) assert.ok(!txt.includes(segredo), `vazou: ${segredo}`);
  });

  it('o advogado publica um andamento e a explicação automática aparece', async () => {
    const r = await request(app).put(`/api/lawsuits/movements/${movHidden}`).set(h).send({ client_visible: true });
    assert.equal(r.status, 200);
    const l = (await request(app).get('/api/client-portal/me').set(ch)).body.lawsuits.find((x) => x.id === lawId);
    const t = l.timeline.find((x) => x.id === movHidden);
    assert.equal(t.source, 'automatico');
    assert.match(t.simple, /avisada oficialmente/);
  });

  it('situação e "o que preciso fazer" definidos pelo advogado, com destaque quando há ação', async () => {
    const antes = (await request(app).get('/api/client-portal/me').set(ch)).body.lawsuits.find((x) => x.id === lawId);
    assert.equal(antes.action_needed, false);
    assert.match(antes.next_action, /Nada a fazer agora/);
    const r = await request(app).put(`/api/lawsuits/${lawId}`).set(h).send({ client_summary: 'Aguardamos a audiência.', client_next_action: 'Envie seu comprovante de residência até sexta-feira.', client_action_needed: true });
    assert.equal(r.status, 200);
    const l = (await request(app).get('/api/client-portal/me').set(ch)).body.lawsuits.find((x) => x.id === lawId);
    assert.equal(l.situation, 'Aguardamos a audiência.');
    assert.equal(l.action_needed, true);
    assert.equal(l.next_action, 'Envie seu comprovante de residência até sexta-feira.');
  });

  it('o advogado vê o preview idêntico ao do cliente e publica/oculta tudo de uma vez', async () => {
    const pv = await request(app).get(`/api/lawsuits/${lawId}/portal-preview`).set(h);
    const cl = (await request(app).get('/api/client-portal/me').set(ch)).body.lawsuits.find((x) => x.id === lawId);
    assert.deepEqual(pv.body.view, cl);
    const all = await request(app).post(`/api/lawsuits/${lawId}/portal/publish-all`).set(h).send({ visible: true });
    assert.equal(all.body.changed, 2);
    const off = await request(app).post(`/api/lawsuits/${lawId}/portal/publish-all`).set(h).send({ visible: false });
    assert.equal(off.body.changed, 2);
    assert.deepEqual((await request(app).get('/api/client-portal/me').set(ch)).body.lawsuits.find((x) => x.id === lawId).timeline, []);
  });

  it('o advogado pode esconder o processo inteiro', async () => {
    await request(app).put(`/api/lawsuits/${lawId}`).set(h).send({ client_visible: false });
    assert.ok(!(await request(app).get('/api/client-portal/me').set(ch)).body.lawsuits.some((x) => x.id === lawId));
    await request(app).put(`/api/lawsuits/${lawId}`).set(h).send({ client_visible: true });
  });

  it('o glossário vai junto e só o painel mexe na visibilidade', async () => {
    const r = await request(app).get('/api/client-portal/me').set(ch);
    assert.ok(r.body.glossary.length >= 20);
    assert.equal((await request(app).put(`/api/lawsuits/${lawId}`).set(ch).send({ client_visible: true })).status, 403); // cliente não edita
    assert.equal((await request(app).get(`/api/lawsuits/${lawId}/portal-preview`).set(ch)).status, 403);
  });

  it('outro cliente não vê o processo', async () => {
    const outro = { Authorization: `Bearer ${createClientSession({ id: 'CLI-OUTRO', full_name: 'Outro' })}` };
    db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, contract_status, created_at, updated_at) VALUES ('CLI-OUTRO', 'PF', 'Outro', '11144477735', 'o@exemplo.com.br', '32999990001', 'ATIVO', 'x', 'x')`).run();
    const r = await request(app).get('/api/client-portal/me').set(outro);
    assert.ok(!(r.body.lawsuits || []).some((x) => x.id === lawId));
  });
});
