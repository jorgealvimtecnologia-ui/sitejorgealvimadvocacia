/**
 * Testes Automatizados da Central de Foguetes (Despachos Rápidos)
 * Valida:
 * 1. Painel Pessoal por Usuário (Caixa de Entrada, Saída, Salvos, Isolamento de Privacidade)
 * 2. Painel de Controle de Usuários (Listar, Criar, Excluir e Proteção do Mestre)
 * 3. Gestão de Mensagens (Disparar, Dar Ciência, Salvar/Favoritar, Excluir e Proteção de Exclusão)
 * 4. Gestão de Modelos Salvos (Templates)
 * 5. Integração com Sessão de Colaboradores e KPIs Individuais
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-rockets-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'jorgealvim';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');
const { createEmployeeSession } = await import('../src/middleware/auth.js');

let masterToken = '';
let userBToken = '';
let userBId = '';
let employeeToken = '';
let employeeId = '';

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch {}
  }
});

describe('🚀 Central de Foguetes & Gestão de Usuários e Mensagens', () => {

  before(async () => {
    // 1. Autenticar Mestre
    const resMaster = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'jorgealvimtecnologia', password: 'jorgealvim' });
    assert.equal(resMaster.status, 200);
    masterToken = resMaster.body.token;

    // 2. Criar e autenticar Usuário B (Advogado Associado)
    const pwd = hashPassword('senhaUserB123');
    userBId = `USR-MARIANA-${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, role, name, created_at)
      VALUES (?, 'dra_mariana', ?, ?, 'advogado', 'Dra. Mariana Associada', datetime('now'))
    `).run(userBId, pwd.hash, pwd.salt);

    const resB = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'dra_mariana', password: 'senhaUserB123' });
    assert.equal(resB.status, 200);
    userBToken = resB.body.token;

    // 3. Criar Colaborador (RH) e logar
    const cpfEmp = '11122233344';
    employeeId = `EMP-CARLOS-${Date.now()}`;
    db.prepare(`
      INSERT INTO hr_employees (id, name, cpf, position, department, contract_type, admission_date, status, created_at, updated_at)
      VALUES (?, 'Carlos Estagiário', ?, 'Estagiário', 'Jurídico', 'ESTAGIO', '2025-01-01', 'Ativo', datetime('now'), datetime('now'))
    `).run(employeeId, cpfEmp);

    const resColab = await request(app)
      .post('/api/auth/login')
      .send({ identifier: cpfEmp, password: cpfEmp });
    assert.equal(resColab.status, 200);
    employeeToken = resColab.body.token;
  });

  // =========================================================================
  // GRUPO 1: CONTROLE DE USUÁRIOS DO FOGUETE
  // =========================================================================
  describe('👥 Painel de Controle de Usuários do Foguete', () => {

    it('1. GET /api/rockets/users -> Lista participantes do canal de foguetes com estatísticas', async () => {
      const res = await request(app)
        .get('/api/rockets/users')
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.users));
      assert.ok(res.body.users.length >= 2);
      const masterUser = res.body.users.find(u => u.username === 'jorgealvimtecnologia');
      assert.ok(masterUser, 'Mestre deve estar na lista');
      assert.equal(masterUser.is_master, true);
    });

    it('2. POST /api/rockets/users -> Cria novo usuário com senha criptografada', async () => {
      const res = await request(app)
        .post('/api/rockets/users')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({
          name: 'Lucas Estagiário Novo',
          username: 'lucas_estagio',
          password: 'SenhaForte123!',
          role: 'estagiario'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.username, 'lucas_estagio');
      assert.equal(res.body.user.name, 'Lucas Estagiário Novo');

      // Verifica no banco se a senha está criptografada
      const dbRow = db.prepare('SELECT password_hash, salt FROM users WHERE username = ?').get('lucas_estagio');
      assert.ok(dbRow);
      assert.notEqual(dbRow.password_hash, 'SenhaForte123!');
    });

    it('3. POST /api/rockets/users -> Rejeita criação com dados duplicados ou faltantes', async () => {
      const resDup = await request(app)
        .post('/api/rockets/users')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({
          name: 'Outro Lucas',
          username: 'lucas_estagio',
          password: 'OutraSenha123!',
          role: 'estagiario'
        });
      assert.equal(resDup.status, 400);

      const resMissing = await request(app)
        .post('/api/rockets/users')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({ name: 'Sem Campos' });
      assert.equal(resMissing.status, 400);
    });

    it('4. DELETE /api/rockets/users/:id -> Impede exclusão do Usuário Mestre (Blindagem)', async () => {
      const masterRow = db.prepare('SELECT id FROM users WHERE username = ?').get('jorgealvimtecnologia');
      const res = await request(app)
        .delete(`/api/rockets/users/${masterRow.id}`)
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 403);
      assert.match(res.body.error, /mestre.*exclu[ií]do/i);
    });

    it('5. DELETE /api/rockets/users/:id -> Remove/desativa usuário comum criado', async () => {
      const lucasRow = db.prepare('SELECT id FROM users WHERE username = ?').get('lucas_estagio');
      const res = await request(app)
        .delete(`/api/rockets/users/${lucasRow.id}`)
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Usuário não deve mais existir na tabela users
      const checkRow = db.prepare('SELECT id FROM users WHERE id = ?').get(lucasRow.id);
      assert.equal(checkRow, undefined);
    });
  });

  // =========================================================================
  // GRUPO 2: GESTÃO DE MODELOS DE MENSAGEM (TEMPLATES)
  // =========================================================================
  describe('💾 Modelos Salvos (Templates) de Foguetes', () => {
    let createdTemplateId = 0;

    it('1. POST /api/rockets/templates -> Salva novo modelo frequente', async () => {
      const res = await request(app)
        .post('/api/rockets/templates')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({
          title: 'Aviso de Prazo Urgente 24h',
          subject: 'Petição urgente em 24h',
          priority: 'urgente',
          message_type: 'execucao',
          message: 'Favor juntar aos autos a procuração e documentos complementares em 24h improrrogáveis.'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.template.id);
      createdTemplateId = res.body.template.id;
    });

    it('2. GET /api/rockets/templates -> Lista modelos disponíveis', async () => {
      const res = await request(app)
        .get('/api/rockets/templates')
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.templates));
      const tpl = res.body.templates.find(t => t.id === createdTemplateId);
      assert.ok(tpl);
      assert.equal(tpl.title, 'Aviso de Prazo Urgente 24h');
    });

    it('3. DELETE /api/rockets/templates/:id -> Exclui modelo', async () => {
      const res = await request(app)
        .delete(`/api/rockets/templates/${createdTemplateId}`)
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });
  });

  // =========================================================================
  // GRUPO 3: PAINEL PESSOAL & ISOLAMENTO DE MENSAGENS
  // =========================================================================
  describe('📥 Isolamento de Painel Pessoal & Ciclo de Vida do Despacho', () => {
    let rocketIdPrivate = 0;

    it('1. Disparo de Foguete: Mestre envia mensagem DIRETA e PRIVADA para Dra. Mariana', async () => {
      const res = await request(app)
        .post('/api/rockets')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({
          title: 'Revisão da Contestação TJMG',
          message: 'Dra. Mariana, favor revisar a minuta antes das 17h.',
          priority: 'urgente',
          message_type: 'execucao',
          recipient_type: 'individual',
          recipient_id: userBId,
          recipient_name: 'Dra. Mariana Associada',
          deadline: '2026-09-20 17:00:00'
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.rocket && res.body.rocket.id);
      rocketIdPrivate = res.body.rocket.id;
    });

    it('2. Caixa de Entrada da Dra. Mariana (box=inbox) contém o foguete recebido', async () => {
      const res = await request(app)
        .get('/api/rockets?box=inbox')
        .set('Authorization', `Bearer ${userBToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.rockets));
      const found = res.body.rockets.find(r => r.id === rocketIdPrivate);
      assert.ok(found, 'Dra. Mariana deve ver o despacho em sua Inbox');
      assert.equal(found.subject, 'Revisão da Contestação TJMG');
    });

    it('3. Caixa de Saída do Mestre (box=outbox) contém o foguete enviado', async () => {
      const res = await request(app)
        .get('/api/rockets?box=outbox')
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.rockets));
      const found = res.body.rockets.find(r => r.id === rocketIdPrivate);
      assert.ok(found, 'Mestre deve ver o despacho em sua Outbox');
    });

    it('4. ISOLAMENTO E PRIVACIDADE: Colaborador Carlos NÃO visualiza despacho privado alheio', async () => {
      const res = await request(app)
        .get('/api/rockets?box=inbox')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-employee-token', employeeToken);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.rockets));
      const leak = res.body.rockets.find(r => r.id === rocketIdPrivate);
      assert.equal(leak, undefined, 'Carlos NÃO deve ver despacho destinado exclusivamente à Dra. Mariana!');
    });

    it('5. Dra. Mariana salva mensagem nos Favoritos (PATCH /api/rockets/:id/save)', async () => {
      const resSave = await request(app)
        .patch(`/api/rockets/${rocketIdPrivate}/save`)
        .set('Authorization', `Bearer ${userBToken}`);

      assert.equal(resSave.status, 200);
      assert.equal(resSave.body.is_saved, true);

      // Verifica se aparece em box=saved
      const resSavedList = await request(app)
        .get('/api/rockets?box=saved')
        .set('Authorization', `Bearer ${userBToken}`);

      assert.equal(resSavedList.status, 200);
      assert.ok(resSavedList.body.success);
      assert.ok(Array.isArray(resSavedList.body.rockets));
      const found = resSavedList.body.rockets.find(r => r.id === rocketIdPrivate);
      assert.ok(found, 'Deve aparecer na pasta de Salvos da Dra. Mariana');
    });

    it('6. Dra. Mariana dá ciência (POST /api/rockets/:id/reply com reply_type=ciente)', async () => {
      const res = await request(app)
        .post(`/api/rockets/${rocketIdPrivate}/reply`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          reply_type: 'ciente',
          message: 'Ciente, já iniciei a revisão.'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    it('7. KPIs Pessoais (/api/rockets/stats) refletem ciências e pendências do usuário', async () => {
      const resB = await request(app)
        .get('/api/rockets/stats')
        .set('Authorization', `Bearer ${userBToken}`);

      assert.equal(resB.status, 200);
      assert.ok(resB.body.success);
      const ps = resB.body.personal_stats;
      assert.ok(ps);
      assert.equal(ps.saved_count, 1, 'Tem 1 mensagem salva');
    });

    it('8. Tentativa de exclusão por usuário não autorizado é rejeitada com 403', async () => {
      // Carlos tenta excluir o foguete do Mestre para Dra. Mariana
      const res = await request(app)
        .delete(`/api/rockets/${rocketIdPrivate}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-employee-token', employeeToken);

      assert.equal(res.status, 403);
      assert.match(res.body.error, /autor.*mestre/i);
    });

    it('9. Autor do despacho (Mestre) exclui o despacho com sucesso (DELETE /api/rockets/:id)', async () => {
      const res = await request(app)
        .delete(`/api/rockets/${rocketIdPrivate}`)
        .set('Authorization', `Bearer ${masterToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verifica se sumiu
      const check = await request(app)
        .get(`/api/rockets/${rocketIdPrivate}`)
        .set('Authorization', `Bearer ${masterToken}`);
      assert.equal(check.status, 404);
    });
  });

  // =========================================================================
  // GRUPO 4: DISPARO COLETIVO ('all') E COLABORADOR
  // =========================================================================
  describe('🌐 Disparos Coletivos para Toda a Equipe', () => {
    let collectiveRocketId = 0;

    it('1. Mestre envia despacho para Toda a Equipe (recipient_type=all)', async () => {
      const res = await request(app)
        .post('/api/rockets')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({
          title: 'Comunicado Geral: Reunião Semanal',
          message: 'Todos devem comparecer à sala de reuniões às 09h.',
          priority: 'normal',
          message_type: 'conhecimento',
          recipient_type: 'all',
          recipient_name: 'Toda a Equipe'
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.rocket && res.body.rocket.id);
      collectiveRocketId = res.body.rocket.id;
    });

    it('2. Colaborador Carlos visualiza o despacho coletivo na Caixa de Entrada', async () => {
      const res = await request(app)
        .get('/api/rockets?box=inbox')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-employee-token', employeeToken);

      assert.equal(res.status, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.rockets));
      const found = res.body.rockets.find(r => r.id === collectiveRocketId);
      assert.ok(found, 'Colaborador deve receber mensagens destinadas a toda a equipe');
    });

    it('3. Colaborador Carlos responde ao despacho coletivo', async () => {
      const res = await request(app)
        .post(`/api/rockets/${collectiveRocketId}/reply`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-employee-token', employeeToken)
        .send({
          message: 'Confirmado, estarei presente.'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verifica thread
      const detail = await request(app)
        .get(`/api/rockets/${collectiveRocketId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-employee-token', employeeToken);

      assert.equal(detail.status, 200);
      assert.ok(detail.body.rocket && detail.body.replies);
      assert.ok(detail.body.replies.some(rep => rep.author_name === 'Carlos Estagiário'));
    });
  });

});
