/**
 * Controle de tentativas de login em TODAS as entradas (ordem ORD-MUFQQEGJ-BYT):
 * 1. Portal do cliente e portal do colaborador bloqueiam após falhas seguidas (antes: sem bloqueio)
 * 2. Bloqueio por conta vale mesmo trocando de IP e avisa o mestre no painel
 * 3. Mensagem única no portal do cliente (não revela quem é cliente)
 * 4. Código de acesso chega ao mestre como notificação e só ele a vê
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-login-guard-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { createEmployeeSession } = await import('../src/middleware/auth.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch {}
  }
});

const now = new Date().toISOString();
const pw = hashPassword('SenhaDoCliente#1');
db.prepare(`INSERT INTO clients (id, client_type, full_name, cpf, email, phone, password_hash, salt, created_at, updated_at)
            VALUES ('CLI-GUARD-1', 'PF', 'Cliente Guard', '111.222.333-96', 'guard@teste.com', '(32) 91234-0000', ?, ?, ?, ?)`)
  .run(pw.hash, pw.salt, now, now);

let ipSeq = 10;
const fromIp = (req, ip) => req.set('X-Forwarded-For', ip || `10.0.0.${ipSeq++}`);

async function masterToken() {
  const r = await fromIp(request(app).post('/api/auth/login'), '10.9.9.9').send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(r.status, 200);
  return r.body.token;
}

describe('Portal do cliente', () => {
  it('mesma mensagem para CPF inexistente e senha errada', async () => {
    const ghost = await fromIp(request(app).post('/api/client-portal/login'), '10.1.1.1').send({ login: '999.888.777-66', password: 'x1234567' });
    const wrong = await fromIp(request(app).post('/api/client-portal/login'), '10.1.1.2').send({ login: '111.222.333-96', password: 'x1234567' });
    assert.equal(ghost.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(ghost.body.error, wrong.body.error);
  });

  it('bloqueia (429) após 5 senhas erradas seguidas do mesmo IP', async () => {
    let last;
    for (let i = 0; i < 5; i++) {
      last = await fromIp(request(app).post('/api/client-portal/login'), '10.2.2.2').send({ login: '111.222.333-96', password: 'errada' + i });
    }
    assert.equal(last.status, 429);
    // mesmo com a senha certa, continua bloqueado durante a espera
    const ok = await fromIp(request(app).post('/api/client-portal/login'), '10.2.2.2').send({ login: '111.222.333-96', password: 'SenhaDoCliente#1' });
    assert.equal(ok.status, 429);
    // outro IP entra normalmente com a senha certa
    const other = await fromIp(request(app).post('/api/client-portal/login'), '10.2.2.3').send({ login: '111.222.333-96', password: 'SenhaDoCliente#1' });
    assert.equal(other.status, 200);
  });
});

describe('Portal do colaborador', () => {
  it('bloqueia (429) após 5 tentativas erradas (antes não havia controle)', async () => {
    let last;
    for (let i = 0; i < 5; i++) {
      last = await fromIp(request(app).post('/api/hr/employee/login'), '10.3.3.3').send({ identifier: 'ninguem.inexistente', password: 'errada' + i });
    }
    assert.equal(last.status, 429);
  });
});

describe('Bloqueio por conta (ataque vindo de vários IPs)', () => {
  it('30 falhas na mesma conta, cada uma de um IP, bloqueiam a conta e avisam o mestre', async () => {
    for (let i = 0; i < 30; i++) {
      await fromIp(request(app).post('/api/auth/login'), `172.16.${Math.floor(i / 200)}.${(i % 200) + 1}`)
        .send({ username: 'usuario_alvo_teste', password: 'tentativa' + i });
    }
    const blocked = await fromIp(request(app).post('/api/auth/login'), '192.168.50.50').send({ username: 'usuario_alvo_teste', password: 'mais-uma' });
    assert.equal(blocked.status, 429);

    const alert = db.prepare(`SELECT * FROM notifications WHERE resource_type = 'login_lock' AND resource_id = 'usuario_alvo_teste'`).get();
    assert.ok(alert, 'o mestre deve receber o aviso no painel');
    assert.equal(alert.target_user_id, 'USR-MASTER-01');
  });

  it('o bloqueio de uma conta não afeta outras contas', async () => {
    assert.ok(await masterToken());
  });
});

describe('Códigos de acesso e visibilidade das notificações', () => {
  it('código de 1º acesso vai para o mestre no painel; colaborador não enxerga', async () => {
    const r = await fromIp(request(app).post('/api/client-portal/forgot-password'), '10.4.4.4').send({ login: '111.222.333-96' });
    assert.equal(r.status, 200);
    const code = db.prepare(`SELECT reset_token FROM clients WHERE id = 'CLI-GUARD-1'`).get().reset_token;
    assert.ok(code);
    assert.ok(!JSON.stringify(r.body).includes(code));

    const t = await masterToken();
    const mine = await request(app).get('/api/notifications?limit=200').set('Authorization', `Bearer ${t}`);
    assert.ok(mine.body.notifications.some(n => n.resource_type === 'client_access_code' && n.message.includes(code)));

    const emp = createEmployeeSession({ id: 'EMP-GUARD-1', name: 'Colaborador Guard', cpf: '000' });
    const theirs = await request(app).get('/api/notifications?limit=200').set('Authorization', `Bearer ${emp}`);
    assert.ok(!theirs.body.notifications.some(n => n.resource_type === 'client_access_code'));
    assert.ok(!JSON.stringify(theirs.body).includes(code));

    // e não consegue apagar a notificação do mestre
    const target = db.prepare(`SELECT id FROM notifications WHERE resource_type = 'client_access_code' LIMIT 1`).get();
    await request(app).delete(`/api/notifications/${target.id}`).set('Authorization', `Bearer ${emp}`);
    assert.ok(db.prepare(`SELECT id FROM notifications WHERE id = ?`).get(target.id));
  });
});
