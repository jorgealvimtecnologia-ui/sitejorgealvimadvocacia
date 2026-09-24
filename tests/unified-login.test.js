/**
 * Testes automatizados da ENTRADA UNIFICADA (Universal Identity-First Login).
 * Valida a resolução automática de perfis:
 * 1. Operador/Advogado -> /painel
 * 2. Cliente -> /cliente
 * 3. Colaborador -> /colaborador
 * 4. Google Auth Universal
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-unified-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'jorgealvim';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch {}
  }
});

describe('Entrada Unificada (Identity-First Login)', () => {

  it('1. Login de Operador / Mestre via /api/auth/login -> redireciona para /painel', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'jorgealvimtecnologia', password: 'jorgealvim' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.authType, 'admin');
    assert.equal(res.body.redirectTo, '/painel');
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'master');
  });

  it('2. Login de Cliente (por CPF) via /api/auth/login -> redireciona para /cliente', async () => {
    const cpfTest = '333.444.555-66';
    const pwdHash = hashPassword('cliente123');
    const clientId = `CLI-UNIFIED-${Date.now()}`;

    db.prepare(`
      INSERT INTO clients (id, client_type, full_name, cpf, email, phone, password_hash, salt, contract_status, created_at, updated_at)
      VALUES (?, 'PF', 'Cliente Unificado Teste', ?, 'cliente.unificado@teste.com', '(32) 99999-0000', ?, ?, 'Ativo', datetime('now'), datetime('now'))
    `).run(clientId, cpfTest, pwdHash.hash, pwdHash.salt);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: cpfTest, password: 'cliente123' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.authType, 'client');
    assert.equal(res.body.redirectTo, '/cliente');
    assert.ok(res.body.token);
    assert.equal(res.body.client.id, clientId);
  });

  it('3. Login de Colaborador do RH (por CPF) via /api/auth/login -> redireciona para /colaborador', async () => {
    const cpfEmp = '77788899900';
    const empId = `EMP-UNIFIED-${Date.now()}`;

    db.prepare(`
      INSERT INTO hr_employees (id, name, cpf, position, department, contract_type, admission_date, created_at, updated_at)
      VALUES (?, 'Colaborador Unificado Teste', ?, 'Assistente Jurídico', 'Jurídico', 'CLT', '2024-01-01', datetime('now'), datetime('now'))
    `).run(empId, cpfEmp);

    // No 1º acesso, a senha é o próprio CPF
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: cpfEmp, password: cpfEmp });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.authType, 'employee');
    assert.equal(res.body.redirectTo, '/colaborador');
    assert.ok(res.body.token);
    assert.equal(res.body.employee.id, empId);
  });

  it('4. Credenciais inválidas em /api/auth/login -> retorna 401 com mensagem amigável', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'usuario.fantasma', password: 'senha-errada' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Usuário ou senha incorretos.');
  });

  it('5. Login Google Unificado (/api/auth/unified-google) com conta de Operador -> /painel', async () => {
    const opEmail = 'jorgealvimtecnologia@gmail.com';
    const mockToken = `mock-google-token:sub-master-unified:${opEmail}:Dr. Jorge Alvim`;

    const res = await request(app)
      .post('/api/auth/unified-google')
      .send({ credential: mockToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.authType, 'admin');
    assert.equal(res.body.redirectTo, '/painel');
    assert.ok(res.body.token);
  });

  it('6. Login Google Unificado (/api/auth/unified-google) com conta de Cliente -> /cliente', async () => {
    const clientGoogleEmail = `cliente.google.${Date.now()}@gmail.com`;
    const mockToken = `mock-google-token:sub-client-unified:${clientGoogleEmail}:Cliente Google Auto`;

    const res = await request(app)
      .post('/api/auth/unified-google')
      .send({ credential: mockToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.authType, 'client');
    assert.equal(res.body.redirectTo, '/cliente');
    assert.ok(res.body.token);
  });

  it('7. Login de Motorista/Colaborador pelo username via /api/auth/login -> gera token, employeeToken e redireciona /colaborador', async () => {
    const userId = `USR-TEST-${Date.now()}`;
    const empId = `EMP-TEST-${Date.now()}`;
    const pwdHash = hashPassword('carlos123');

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, 'carlos.motorista.test', ?, ?, 'Carlos Motorista Teste', 'motorista', datetime('now'))
    `).run(userId, pwdHash.hash, pwdHash.salt);

    db.prepare(`
      INSERT INTO hr_employees (id, name, cpf, position, department, contract_type, admission_date, created_at, updated_at)
      VALUES (?, 'Carlos Motorista Teste', '999.888.777-66', 'Motorista', 'Operacional', 'CLT', '2024-01-01', datetime('now'), datetime('now'))
    `).run(empId);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'carlos.motorista.test', password: 'carlos123' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.authType, 'employee');
    assert.equal(res.body.redirectTo, '/colaborador');
    assert.ok(res.body.token, 'Token de sessão do sistema');
    assert.ok(res.body.employeeToken, 'Token do colaborador para autoatendimento');
    assert.equal(res.body.user.username, 'carlos.motorista.test');
    assert.equal(res.body.employee.id, empId);
  });

  it('8. Login de Colaborador via /api/hr/employee/login aceitando username -> retorna token e adminToken', async () => {
    const res = await request(app)
      .post('/api/hr/employee/login')
      .send({ identifier: 'carlos.motorista.test', password: 'carlos123' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, 'Token do portal do colaborador');
    assert.ok(res.body.adminToken, 'Token do painel administrativo gerado transparentemente');
    assert.equal(res.body.employee.name, 'Carlos Motorista Teste');
  });

  it('9. Acesso a /api/hr/employee/me usando o token gerado pelo login unificado -> retorna dados pessoais, contratos e ponto', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'carlos.motorista.test', password: 'carlos123' });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.employeeToken || loginRes.body.token;

    const meRes = await request(app)
      .get('/api/hr/employee/me')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.employee.name, 'Carlos Motorista Teste');
    assert.equal(meRes.body.employee.position, 'Motorista');
  });

  it('10. Mestre (Dr. Jorge Alvim) via login unificado -> recebe permissão irrestrita para TODAS as abas (is_master: true)', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'jorgealvimtecnologia', password: 'jorgealvim' });

    assert.equal(loginRes.status, 200);
    const permRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permRes.status, 200);
    assert.equal(permRes.body.is_master, true, 'Mestre tem is_master: true');
    const p = permRes.body.permissions;
    assert.equal(p.tab_leads, 1, 'Mestre acessa Leads');
    assert.equal(p.tab_clients, 1, 'Mestre acessa Clientes');
    assert.equal(p.tab_lawsuits, 1, 'Mestre acessa Processos');
    assert.equal(p.tab_radar, 1, 'Mestre acessa Radar');
    assert.equal(p.tab_financial, 1, 'Mestre acessa Financeiro');
    assert.equal(p.tab_hr, 1, 'Mestre acessa RH');
    assert.equal(p.tab_users, 1, 'Mestre acessa Usuários');
    assert.equal(p.tab_settings, 1, 'Mestre acessa Configurações');
  });

  it('11. Advogado Associado via login unificado -> abre apenas abas jurídicas e BLOQUEIA financeiro, RH e usuários', async () => {
    const advId = `USR-ADV-${Date.now()}`;
    const pwd = hashPassword('adv12345');

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, 'advogado.associado', ?, ?, 'Dr. Advogado Associado', 'advogado', datetime('now'))
    `).run(advId, pwd.hash, pwd.salt);

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Dr. Advogado Associado', 'advogado.associado', '', '',
        'advogado', 0, 1, 1, 1, 1,
        1, 1, 1, 0, 0, 1,
        0, 0, 0, 1, 'assigned', datetime('now'), datetime('now')
      )
    `).run(`PERM-${advId}`, advId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'advogado.associado', password: 'adv12345' });

    assert.equal(loginRes.status, 200);

    const permRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permRes.status, 200);
    assert.equal(permRes.body.is_master, false);
    const p = permRes.body.permissions;

    // Permitidas
    assert.equal(p.tab_clients, 1, 'Advogado pode acessar Clientes');
    assert.equal(p.tab_lawsuits, 1, 'Advogado pode acessar Processos');
    assert.equal(p.tab_radar, 1, 'Advogado pode acessar Radar');
    assert.equal(p.tab_calendar, 1, 'Advogado pode acessar Agenda');
    assert.equal(p.tab_drive, 1, 'Advogado pode acessar Drive');

    // Bloqueadas por RBAC
    assert.equal(p.tab_leads, 0, 'Advogado NÃO pode acessar Leads');
    assert.equal(p.tab_financial, 0, 'Advogado NÃO pode acessar Financeiro');
    assert.equal(p.tab_hr, 0, 'Advogado NÃO pode acessar RH');
    assert.equal(p.tab_users, 0, 'Advogado NÃO pode gerenciar Usuários');
    assert.equal(p.tab_settings, 0, 'Advogado NÃO pode acessar Configurações');
  });

  it('12. Estagiário via login unificado -> abre apenas processos, radar, drive e agenda; BLOQUEIA clientes e financeiro', async () => {
    const estagId = `USR-ESTAG-${Date.now()}`;
    const pwd = hashPassword('estag123');

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, 'estagiario.direito', ?, ?, 'Estagiário Lucas', 'estagiario', datetime('now'))
    `).run(estagId, pwd.hash, pwd.salt);

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Estagiário Lucas', 'estagiario.direito', '', '',
        'estagiario', 0, 0, 1, 1, 0,
        1, 1, 1, 0, 0, 1,
        0, 0, 0, 1, 'assigned', datetime('now'), datetime('now')
      )
    `).run(`PERM-${estagId}`, estagId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'estagiario.direito', password: 'estag123' });

    assert.equal(loginRes.status, 200);

    const permRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permRes.status, 200);
    const p = permRes.body.permissions;

    // Permitidas
    assert.equal(p.tab_lawsuits, 1, 'Estagiário acessa Processos');
    assert.equal(p.tab_radar, 1, 'Estagiário acessa Radar');
    assert.equal(p.tab_calendar, 1, 'Estagiário acessa Agenda');
    assert.equal(p.tab_drive, 1, 'Estagiário acessa Drive');

    // Bloqueadas
    assert.equal(p.tab_clients, 0, 'Estagiário NÃO acessa Clientes');
    assert.equal(p.tab_financial, 0, 'Estagiário NÃO acessa Financeiro');
    assert.equal(p.tab_hr, 0, 'Estagiário NÃO acessa RH');
    assert.equal(p.tab_users, 0, 'Estagiário NÃO acessa Usuários');
  });

  it('13. Secretária via login unificado -> abre leads, clientes e agenda; BLOQUEIA processos e financeiro', async () => {
    const secId = `USR-SEC-${Date.now()}`;
    const pwd = hashPassword('sec12345');

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, 'secretaria.atendimento', ?, ?, 'Patrícia Secretária', 'secretaria', datetime('now'))
    `).run(secId, pwd.hash, pwd.salt);

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Patrícia Secretária', 'secretaria.atendimento', '', '',
        'secretaria', 1, 1, 0, 0, 0,
        0, 1, 0, 0, 0, 1,
        0, 0, 0, 1, 'office', datetime('now'), datetime('now')
      )
    `).run(`PERM-${secId}`, secId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'secretaria.atendimento', password: 'sec12345' });

    assert.equal(loginRes.status, 200);

    const permRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permRes.status, 200);
    const p = permRes.body.permissions;

    // Permitidas
    assert.equal(p.tab_leads, 1, 'Secretária acessa Leads');
    assert.equal(p.tab_clients, 1, 'Secretária acessa Clientes');
    assert.equal(p.tab_calendar, 1, 'Secretária acessa Agenda');

    // Bloqueadas
    assert.equal(p.tab_lawsuits, 0, 'Secretária NÃO acessa Processos');
    assert.equal(p.tab_financial, 0, 'Secretária NÃO acessa Financeiro');
    assert.equal(p.tab_hr, 0, 'Secretária NÃO acessa RH');
    assert.equal(p.tab_users, 0, 'Secretária NÃO acessa Usuários');
  });

  it('14. Motorista via login unificado -> tem acesso à agenda e ao portal do colaborador; BLOQUEADO de processos e financeiro', async () => {
    const motId = `USR-MOT-${Date.now()}`;
    const pwd = hashPassword('mot12345');

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, 'carlos.motorista.unit', ?, ?, 'Carlos Motorista', 'motorista', datetime('now'))
    `).run(motId, pwd.hash, pwd.salt);

    db.prepare(`
      INSERT INTO hr_employees (id, name, cpf, position, department, contract_type, admission_date, created_at, updated_at)
      VALUES (?, 'Carlos Motorista', '123.456.789-00', 'Motorista', 'Logística', 'CLT', '2024-01-01', datetime('now'), datetime('now'))
    `).run(`EMP-${motId}`);

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'motorista', 'Carlos Motorista', 'carlos.motorista.unit', '', '',
        'motorista', 0, 0, 0, 0, 0,
        0, 1, 0, 0, 0, 1,
        0, 0, 0, 1, 'assigned', datetime('now'), datetime('now')
      )
    `).run(`PERM-${motId}`, motId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'carlos.motorista.unit', password: 'mot12345' });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.authType, 'employee');
    assert.equal(loginRes.body.redirectTo, '/colaborador');

    const permRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permRes.status, 200);
    const p = permRes.body.permissions;

    assert.equal(p.tab_calendar, 1, 'Motorista acessa sua Agenda de viagens');
    assert.equal(p.tab_colaborador, 1, 'Motorista acessa Portal do Colaborador');
    assert.equal(p.tab_leads, 0, 'Motorista BLOQUEADO de Leads');
    assert.equal(p.tab_clients, 0, 'Motorista BLOQUEADO de Clientes');
    assert.equal(p.tab_lawsuits, 0, 'Motorista BLOQUEADO de Processos');
    assert.equal(p.tab_financial, 0, 'Motorista BLOQUEADO de Financeiro');
    assert.equal(p.tab_hr, 0, 'Motorista BLOQUEADO de RH');
    assert.equal(p.tab_users, 0, 'Motorista BLOQUEADO de Usuários');
  });

  it('15. Operador suspenso na Matriz RBAC (is_active = 0) -> BLOQUEADO com 403', async () => {
    const susId = `USR-SUS-${Date.now()}`;
    const pwd = hashPassword('sus12345');

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, 'operador.suspenso', ?, ?, 'Operador Desativado', 'advogado', datetime('now'))
    `).run(susId, pwd.hash, pwd.salt);

    db.prepare(`
      INSERT INTO access_permissions (
        id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
        role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
        tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
        tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, created_at, updated_at
      ) VALUES (
        ?, ?, 'admin', 'Operador Desativado', 'operador.suspenso', '', '',
        'advogado', 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 'assigned', datetime('now'), datetime('now')
      )
    `).run(`PERM-${susId}`, susId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'operador.suspenso', password: 'sus12345' });

    assert.equal(loginRes.status, 200);

    const permRes = await request(app)
      .get('/api/access-control/my-permissions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.equal(permRes.status, 403, 'Operador suspenso deve ser bloqueado com 403');
    assert.match(permRes.body.error, /desativado/i);
  });

  it('16. Cliente autenticado -> BLOQUEADO de rotas administrativas do painel com 401', async () => {
    const cliId = `CLI-TEST-${Date.now()}`;
    const pwd = hashPassword('cli12345');

    db.prepare(`
      INSERT INTO clients (id, client_type, full_name, cpf, email, phone, password_hash, salt, contract_status, created_at, updated_at)
      VALUES (?, 'PF', 'Cliente Sem Acesso Painel', '111.222.333-44', 'cli@teste.com', '(32) 90000-0000', ?, ?, 'Ativo', datetime('now'), datetime('now'))
    `).run(cliId, pwd.hash, pwd.salt);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: '111.222.333-44', password: 'cli12345' });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.authType, 'client');
    assert.equal(loginRes.body.redirectTo, '/cliente');

    const adminCheck = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    assert.ok([401, 403].includes(adminCheck.status), `Token de cliente bloqueado na API de gestão (recebeu ${adminCheck.status})`);
  });

});
