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

});
