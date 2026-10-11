/**
 * Recuperação de senha do painel: não promete envio que não existe.
 * - a resposta informa quais canais o SISTEMA tem ligados (dado global, não revela contas);
 * - o código só conta como entregue por WhatsApp se o gateway aceitou o envio.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-forgot-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.WHATSAPP_GATEWAY_URL;

const { app, db } = await import('../server.js');
const { deliverAccessCode } = await import('../src/shared/access-codes.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

describe('recuperação de senha do painel é honesta', () => {
  it('informa que o WhatsApp não está ativo quando não há gateway', async () => {
    const r = await request(app).post('/api/auth/forgot-password').send({ username: 'jorgealvimtecnologia', channel: 'whatsapp' });
    assert.equal(r.status, 200);
    assert.equal(r.body.channels.whatsapp, false);
  });

  it('a resposta é igual para usuário existente e inexistente (sem revelar contas)', async () => {
    const a = await request(app).post('/api/auth/forgot-password').send({ username: 'jorgealvimtecnologia', channel: 'email' });
    const b = await request(app).post('/api/auth/forgot-password').send({ username: 'usuario.que.nao.existe', channel: 'email' });
    assert.deepEqual(a.body, b.body);
  });

  it('o código NUNCA volta na resposta', async () => {
    const r = await request(app).post('/api/auth/forgot-password').send({ username: 'jorgealvimtecnologia' });
    assert.ok(!/\b\d{6}\b/.test(JSON.stringify(r.body)));
  });

  it('sem gateway, o código NÃO é dado como entregue por WhatsApp', async () => {
    const r = await deliverAccessCode({
      audience: 'painel', name: 'Teste', identifier: 'teste', code: '123456',
      expiresAt: new Date(Date.now() + 60000).toISOString(), resourceId: 'X', channel: 'whatsapp',
    });
    assert.equal(r.deliveredToWhatsApp, false);
    assert.equal(r.whatsappReason, 'not_configured');
    assert.equal(r.deliveredToPanel, true);
  });
});
