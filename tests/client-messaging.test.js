/**
 * MENSAGENS CLIENTE ↔ ESCRITÓRIO ("o cliente no foguete", pela aba do portal).
 *
 * Cobre:
 *  - cliente envia mensagem pelo portal → escritório é avisado no sino (notificação direcionada);
 *  - escritório lê a conversa → mensagens do cliente ficam marcadas como lidas (selo zera);
 *  - escritório responde → a resposta aparece para o cliente;
 *  - validações (mensagem vazia, cliente inexistente);
 *  - escopo "somente responsável/dono/secretária" (clienteVisivel);
 *  - resolução de destinatários (responsável + dono + secretária, deduplicado).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-client-msg-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { clienteVisivel } = await import('../src/middleware/data-scope.js');
const { destinatariosEscritorio } = await import('../src/shared/client-messaging.js');

let masterToken = '';
let masterUserId = '';
let clientToken = '';
let clientId = '';

before(async () => {
  const login = await request(app).post('/api/auth/login')
    .send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(login.status, 200);
  masterToken = login.body.token;
  const mu = db.prepare(`SELECT id FROM users WHERE username = 'jorgealvimtecnologia'`).get();
  masterUserId = mu && mu.id;

  // Cliente registra-se no portal (rota pública) e já recebe um token de sessão.
  const reg = await request(app).post('/api/client-portal/register').send({
    client_type: 'PF',
    full_name: 'Cliente Conversa Teste',
    cpf: '529.982.247-25',
    email: 'cliente.conversa@example.com',
    phone: '32911112222',
    password: 'ClienteForte#2026'
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  clientToken = reg.body.token;
  clientId = reg.body.clientId || reg.body.client?.id;
  if (!clientId) {
    const row = db.prepare(`SELECT id FROM clients WHERE LOWER(email) = ?`).get('cliente.conversa@example.com');
    clientId = row && row.id;
  }
  assert.ok(clientId, 'cliente deve ter id');

  // Torna o mestre o advogado responsável, para o aviso do sino ter alvo concreto.
  db.prepare(`UPDATE clients SET responsible_lawyer_id = ?, responsible_lawyer_name = 'Dr. Jorge Alvim' WHERE id = ?`)
    .run(masterUserId, clientId);
});

after(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
});

const office = (req) => req.set('Authorization', `Bearer ${masterToken}`);
const asClient = (req) => req.set('Authorization', `Bearer ${clientToken}`);

describe('Mensagens cliente ↔ escritório', () => {
  it('cliente envia mensagem e o escritório recebe aviso no sino', async () => {
    const r = await asClient(request(app).post('/api/client-portal/messages'))
      .send({ subject: 'Dúvida sobre meu processo', message: 'Doutor, houve alguma novidade?' });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const bell = db.prepare(
      `SELECT * FROM notifications WHERE resource_type = 'client_message' AND resource_id = ? AND target_user_id = ?`
    ).get(String(clientId), masterUserId);
    assert.ok(bell, 'deve existir sino direcionado ao advogado responsável');
    assert.match(bell.title, /Nova mensagem/i);
    assert.equal(bell.link, '#tab:clients');
  });

  it('o resumo de não lidas mostra a conversa do cliente', async () => {
    const r = await office(request(app).get('/api/clients/messages/unread'));
    assert.equal(r.status, 200);
    assert.ok(r.body.total >= 1);
    assert.ok(r.body.conversas.some(c => c.client_id === clientId), 'cliente deve aparecer nas não lidas');
  });

  it('abrir a conversa marca as mensagens do cliente como lidas', async () => {
    const r = await office(request(app).get(`/api/clients/${clientId}/messages`));
    assert.equal(r.status, 200);
    assert.ok(r.body.messages.length >= 1);
    assert.ok(r.body.messages.some(m => m.sender === 'client'), 'a conversa deve conter a mensagem do cliente');

    const after = await office(request(app).get('/api/clients/messages/unread'));
    assert.ok(!after.body.conversas.some(c => c.client_id === clientId), 'conversa não deve mais constar como não lida');
  });

  it('escritório responde e o cliente passa a ver a resposta', async () => {
    const reply = await office(request(app).post(`/api/clients/${clientId}/messages`))
      .send({ message: 'Olá! Sim, protocolamos a petição hoje.' });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.data.sender, 'office');

    const me = await asClient(request(app).get('/api/client-portal/me'));
    assert.equal(me.status, 200);
    const temResposta = (me.body.messages || []).some(m => m.sender === 'office' && /protocolamos a petição/i.test(m.message));
    assert.ok(temResposta, 'cliente deve ver a resposta do escritório');
  });

  it('rejeita resposta vazia (400)', async () => {
    const r = await office(request(app).post(`/api/clients/${clientId}/messages`)).send({ message: '   ' });
    assert.equal(r.status, 400);
  });

  it('cliente inexistente devolve 404', async () => {
    const r = await office(request(app).post('/api/clients/CLI-NAO-EXISTE/messages')).send({ message: 'oi' });
    assert.equal(r.status, 404);
  });
});

describe('Escopo: só responsável, dono e secretária conversam', () => {
  const clientePool = { id: 'CLI-X', responsible_lawyer_id: null };
  const clienteDoFulano = { id: 'CLI-Y', responsible_lawyer_id: 'USR-FULANO' };

  it('escopo amplo (all/office) vê qualquer cliente', () => {
    assert.equal(clienteVisivel({ role: 'master' }, clienteDoFulano), true);
    assert.equal(clienteVisivel({ userId: 'USR-SECRETARIA', username: 'sec' }, clientePool), true); // sem row => assigned, mas pool é visível
  });

  it('advogado restrito vê só o próprio cliente e o pool, não o de outro', () => {
    const sessaoFulano = { userId: 'USR-FULANO', username: 'fulano', role: 'advogado' };
    const sessaoBeltrano = { userId: 'USR-BELTRANO', username: 'beltrano', role: 'advogado' };
    assert.equal(clienteVisivel(sessaoFulano, clienteDoFulano), true, 'responsável vê o seu cliente');
    assert.equal(clienteVisivel(sessaoFulano, clientePool), true, 'qualquer um vê o pool sem dono');
    assert.equal(clienteVisivel(sessaoBeltrano, clienteDoFulano), false, 'advogado não responsável NÃO vê o cliente de outro');
  });
});

describe('Destinatários do escritório', () => {
  it('inclui o advogado responsável, o dono/mestre e deduplica; traz os e-mails mestres', () => {
    const client = { id: clientId, full_name: 'Cliente Conversa Teste', responsible_lawyer_id: masterUserId };
    const dests = destinatariosEscritorio(client);
    assert.ok(Array.isArray(dests) && dests.length >= 1);
    // E-mail mestre oficial sempre presente para aviso por e-mail.
    assert.ok(dests.some(d => d.email === 'jorgealvimtecnologia@gmail.com'), 'deve incluir o e-mail mestre');
    // Sem duplicar o mesmo user_id.
    const ids = dests.map(d => d.user_id).filter(Boolean);
    assert.equal(ids.length, new Set(ids).size, 'não pode haver user_id duplicado');
  });
});
