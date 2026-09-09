/**
 * Testes Automatizados: Autenticação Google & Matriz de Controle de Acesso (RBAC)
 * 
 * Valida se os logins via Google respeitam a segregação de abas e perfis de acesso:
 * 1. Mestre (Dr. Jorge Alvim) -> Acesso irrestrito a todas as 16 abas
 * 2. Advogado Associado -> Acesso a processos, clientes e agenda; bloqueado em financeiro, RH e usuários
 * 3. Estagiário -> Acesso restrito a processos, radar, agenda e drive; bloqueado em clientes, financeiro e RH
 * 4. Secretária -> Acesso a leads, clientes e agenda; bloqueado em processos e financeiro
 * 5. Cliente -> Bloqueado de acessar o painel administrativo (/api/auth/google -> 403)
 * 6. Proteção de rotas -> 401 para requisições não autenticadas
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-google-rbac-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;

const { app, db } = await import('../server.js');

after(() => {
  try {
    if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
    if (fs.existsSync(TMP_DB + '-wal')) fs.unlinkSync(TMP_DB + '-wal');
    if (fs.existsSync(TMP_DB + '-shm')) fs.unlinkSync(TMP_DB + '-shm');
  } catch (e) {}
});

describe('🔐 Auditoria de Senhas Google & Abertura de Abas via RBAC', () => {

  it('1. Login Google Mestre (Dr. Jorge Alvim) → Abre todas as abas (is_master: true)', async () => {
    const masterEmail = 'jorgealvimtecnologia@gmail.com';
    const mockToken = `mock-google-token:sub-master-1:${masterEmail}:Dr. Jorge Alvim`;

    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ credential: mockToken });

    assert.equal(loginRes.status, 200, 'Login Google Mestre deve retornar 200');
    assert.ok(loginRes.body.token, 'Deve retornar token de sessão');
    assert.equal(loginRes.body.user.role, 'master', 'Perfil deve ser master');

    // Consultar permissões de abas da sessão ativa
    const permsRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permsRes.status, 200);
    assert.equal(permsRes.body.is_master, true, 'Mestre deve ter flag is_master: true');
    assert.equal(permsRes.body.permissions.tab_leads, 1, 'Aba Leads permitida');
    assert.equal(permsRes.body.permissions.tab_clients, 1, 'Aba Clientes permitida');
    assert.equal(permsRes.body.permissions.tab_lawsuits, 1, 'Aba Processos permitida');
    assert.equal(permsRes.body.permissions.tab_financial, 1, 'Aba Financeiro permitida');
    assert.equal(permsRes.body.permissions.tab_hr, 1, 'Aba RH permitida');
    assert.equal(permsRes.body.permissions.tab_users, 1, 'Aba Usuários permitida');
    assert.equal(permsRes.body.permissions.tab_settings, 1, 'Aba Configurações permitida');
  });

  it('2. Login Google Advogado Associado → Abre abas jurídicas e BLOQUEIA financeiro/RH/usuários', async () => {
    const lawyerEmail = `advogado.${Date.now()}@jorgealvimadvocacia.com.br`;
    const lawyerId = `USR-ADV-${Date.now()}`;

    // Cadastrar operador advogado na tabela users e access_permissions
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, google_email, created_at)
      VALUES (?, ?, 'hash', 'salt', 'Dr. Advogado Associado', 'advogado', ?, ?)
    `).run(lawyerId, lawyerEmail, lawyerEmail, new Date().toISOString());

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Dr. Advogado Associado', ?, ?,
        'advogado', 0, 1, 1, 1, 1,
        1, 1, 1, 0, 0, 1,
        0, 0, 0, 1, 'assigned', ?, ?
      )
    `).run(`PERM-${lawyerId}`, lawyerId, lawyerEmail, lawyerEmail, new Date().toISOString(), new Date().toISOString());

    const mockToken = `mock-google-token:sub-adv-1:${lawyerEmail}:Dr. Advogado Associado`;

    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ credential: mockToken });

    assert.equal(loginRes.status, 200, 'Login Google Advogado deve retornar 200');
    assert.equal(loginRes.body.user.role, 'advogado');

    // Verificar permissões de abas
    const permsRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permsRes.status, 200);
    assert.equal(permsRes.body.is_master, false, 'Advogado NÃO é master');
    assert.equal(permsRes.body.role_name, 'advogado');

    // Abas Permitidas
    assert.equal(permsRes.body.permissions.tab_clients, 1, 'Clientes: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_lawsuits, 1, 'Processos: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_radar, 1, 'Radar Judicial: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_calendar, 1, 'Agenda: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_drive, 1, 'Drive: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_publications, 1, 'Publicações: PERMITIDO');

    // Abas Restritas / Bloqueadas por RBAC
    assert.equal(permsRes.body.permissions.tab_leads, 0, 'Leads/Comercial: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_financial, 0, 'Financeiro/Caixa: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_hr, 0, 'RH & Pessoal: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_users, 0, 'Usuários & Senhas: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_settings, 0, 'Auditoria & Configurações: BLOQUEADO');
  });

  it('3. Login Google Estagiário → Abre apenas processos, radar, drive e agenda; BLOQUEIA clientes e financeiro', async () => {
    const internEmail = `estagiario.${Date.now()}@jorgealvimadvocacia.com.br`;
    const internId = `USR-ESTAG-${Date.now()}`;

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, google_email, created_at)
      VALUES (?, ?, 'hash', 'salt', 'Estagiário Acadêmico', 'estagiario', ?, ?)
    `).run(internId, internEmail, internEmail, new Date().toISOString());

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Estagiário Acadêmico', ?, ?,
        'estagiario', 0, 0, 1, 1, 0,
        1, 1, 1, 0, 0, 1,
        0, 0, 0, 1, 'assigned', ?, ?
      )
    `).run(`PERM-${internId}`, internId, internEmail, internEmail, new Date().toISOString(), new Date().toISOString());

    const mockToken = `mock-google-token:sub-estag-1:${internEmail}:Estagiário Acadêmico`;

    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ credential: mockToken });

    assert.equal(loginRes.status, 200);

    const permsRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permsRes.status, 200);
    assert.equal(permsRes.body.is_master, false);
    assert.equal(permsRes.body.role_name, 'estagiario');

    // Permitidas
    assert.equal(permsRes.body.permissions.tab_lawsuits, 1, 'Processos: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_radar, 1, 'Radar: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_drive, 1, 'Drive: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_calendar, 1, 'Agenda: PERMITIDO');

    // Bloqueadas
    assert.equal(permsRes.body.permissions.tab_leads, 0, 'Leads: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_clients, 0, 'Clientes: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_offices, 0, 'Escritórios: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_financial, 0, 'Financeiro: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_hr, 0, 'RH: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_users, 0, 'Usuários: BLOQUEADO');
  });

  it('4. Login Google Secretária → Abre leads, clientes e agenda; BLOQUEIA processos e financeiro', async () => {
    const secEmail = `secretaria.${Date.now()}@jorgealvimadvocacia.com.br`;
    const secId = `USR-SEC-${Date.now()}`;

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, google_email, created_at)
      VALUES (?, ?, 'hash', 'salt', 'Secretária Atendimento', 'secretaria', ?, ?)
    `).run(secId, secEmail, secEmail, new Date().toISOString());

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Secretária Atendimento', ?, ?,
        'secretaria', 1, 1, 0, 0, 0,
        0, 1, 0, 0, 0, 1,
        0, 0, 0, 1, 'office', ?, ?
      )
    `).run(`PERM-${secId}`, secId, secEmail, secEmail, new Date().toISOString(), new Date().toISOString());

    const mockToken = `mock-google-token:sub-sec-1:${secEmail}:Secretária Atendimento`;

    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ credential: mockToken });

    assert.equal(loginRes.status, 200);

    const permsRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permsRes.status, 200);
    assert.equal(permsRes.body.is_master, false);
    assert.equal(permsRes.body.role_name, 'secretaria');

    // Permitidas
    assert.equal(permsRes.body.permissions.tab_leads, 1, 'Leads: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_clients, 1, 'Clientes: PERMITIDO');
    assert.equal(permsRes.body.permissions.tab_calendar, 1, 'Agenda: PERMITIDO');

    // Bloqueadas
    assert.equal(permsRes.body.permissions.tab_lawsuits, 0, 'Processos: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_radar, 0, 'Radar: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_financial, 0, 'Financeiro: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_hr, 0, 'RH: BLOQUEADO');
    assert.equal(permsRes.body.permissions.tab_users, 0, 'Usuários: BLOQUEADO');
  });

  it('5. Login Google de CLIENTE tentando acessar o Painel Admin → BARRADO com 403 Forbidden', async () => {
    const clientEmail = `cliente.seguro.${Date.now()}@gmail.com`;

    // Cadastrar como cliente
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO clients (id, full_name, email, phone, client_type, created_at, updated_at)
      VALUES (?, 'Cliente Particular', ?, '32999998888', 'PF', ?, ?)
    `).run(`CLI-${Date.now()}`, clientEmail, nowIso, nowIso);

    const mockToken = `mock-google-token:sub-cli-barr:${clientEmail}:Cliente Particular`;

    // Tentativa de login no /api/auth/google (painel de controle dos advogados)
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ credential: mockToken });

    assert.equal(loginRes.status, 403, 'Cliente tentando entrar no painel deve receber 403 Forbidden');
    assert.match(loginRes.body.error, /CLIENTE/, 'Mensagem de erro deve alertar sobre perfil de cliente');
    assert.match(loginRes.body.error, /Portal do Cliente/, 'Deve orientar para /cliente');
  });

  it('6. Operador desativado na Matriz RBAC (is_active = 0) → BARRADO com 403', async () => {
    const blockedEmail = `ex.funcionario.${Date.now()}@jorgealvimadvocacia.com.br`;
    const blockedId = `USR-BLOCKED-${Date.now()}`;

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, google_email, created_at)
      VALUES (?, ?, 'hash', 'salt', 'Ex-Operador Bloqueado', 'advogado', ?, ?)
    `).run(blockedId, blockedEmail, blockedEmail, new Date().toISOString());

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email,
        role_template, is_active, created_at, updated_at
      ) VALUES (?, ?, 'admin', 'Ex-Operador Bloqueado', ?, ?, 'advogado', 0, ?, ?)
    `).run(`PERM-${blockedId}`, blockedId, blockedEmail, blockedEmail, new Date().toISOString(), new Date().toISOString());

    const mockToken = `mock-google-token:sub-blocked-1:${blockedEmail}:Ex-Operador Bloqueado`;

    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ credential: mockToken });

    assert.equal(loginRes.status, 403, 'Operador com is_active: 0 deve ser barrado com 403');
    assert.match(loginRes.body.error, /desativado/, 'Mensagem deve indicar perfil desativado');
  });

  it('7. Acesso anônimo a /api/access-control/my-permissions → BARRADO com 401', async () => {
    const res = await request(app).get('/api/access-control/my-permissions');
    assert.equal(res.status, 401, 'Requisição sem token deve retornar 401 Unauthorized');
  });
});
