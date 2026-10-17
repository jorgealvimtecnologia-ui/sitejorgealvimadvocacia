/**
 * Testes Automatizados: Módulo de Importação de Contatos (Google Contacts, CSV, XLS)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-contacts-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');

let masterToken = '';

before(async () => {
  const r = await request(app)
    .post('/api/auth/login')
    .send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
  assert.equal(r.status, 200);
  masterToken = r.body.token;
});

after(() => {
  try { db?.close?.(); } catch { /* ignore */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

describe('Módulo de Integração de Contatos (Google, Celular, CSV/XLS)', () => {
  it('GET /api/contacts/google-config retorna clientId e escopos do Google People API', async () => {
    const res = await request(app)
      .get('/api/contacts/google-config')
      .set('Authorization', `Bearer ${masterToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.clientId);
    assert.equal(res.body.scope, 'https://www.googleapis.com/auth/contacts.readonly');
  });

  it('POST /api/contacts/check-duplicates identifica telefones e emails cadastrados', async () => {
    // 1. Cadastra um cliente base
    await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${masterToken}`)
      .field('full_name', 'Contato Existente Teste')
      .field('phone', '(32) 99111-2222')
      .field('email', 'existente@teste.com');

    // 2. Consulta duplicatas com variações de formatação
    const checkRes = await request(app)
      .post('/api/contacts/check-duplicates')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        phones: ['(32) 99111-2222', '32991112222', '32988880000'],
        emails: ['existente@teste.com', 'novo@teste.com']
      });

    assert.equal(checkRes.status, 200);
    assert.equal(checkRes.body.success, true);
    assert.ok(checkRes.body.existingPhones.includes('(32) 99111-2222'));
    assert.ok(checkRes.body.existingEmails.includes('existente@teste.com'));
    assert.ok(!checkRes.body.existingPhones.includes('32988880000'));
    assert.ok(!checkRes.body.existingEmails.includes('novo@teste.com'));
  });

  it('POST /api/contacts/import-batch importa contatos em lote para Clientes', async () => {
    const batch = [
      {
        name: 'Dr. Roberto Mendes',
        phone: '32987654321',
        email: 'roberto@mendes.adv.br',
        city: 'Juiz de Fora',
        organization: 'Mendes Consultoria',
        notes: 'Contato importado do Gmail'
      },
      {
        name: 'Ana Paula Ferreira',
        phone: '(32) 99988-7766',
        email: 'ana.ferreira@gmail.com',
        city: 'Juiz de Fora',
        organization: 'Autônoma',
        notes: 'Celular sincronizado'
      }
    ];

    const res = await request(app)
      .post('/api/contacts/import-batch')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        target: 'clients',
        contacts: batch,
        skipDuplicates: true,
        sourceTag: 'Google Contacts'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.imported, 2);

    // Confere no banco se os clientes foram criados
    const cli1 = db.prepare(`SELECT * FROM clients WHERE full_name = ?`).get('Dr. Roberto Mendes');
    assert.ok(cli1);
    assert.equal(cli1.phone, '(32) 98765-4321');
    assert.equal(cli1.contract_status, 'Ativo');

    const cli2 = db.prepare(`SELECT * FROM clients WHERE full_name = ?`).get('Ana Paula Ferreira');
    assert.ok(cli2);
    assert.equal(cli2.email, 'ana.ferreira@gmail.com');
  });

  it('POST /api/contacts/import-batch importa contatos em lote para Leads', async () => {
    const leadsBatch = [
      {
        name: 'Carlos Eduardo Lead',
        phone: '(32) 98444-5555',
        email: 'carlos@empresa.com.br',
        city: 'Juiz de Fora',
        organization: 'Tech Indústria',
        notes: 'Lead prospecção comercial'
      }
    ];

    const res = await request(app)
      .post('/api/contacts/import-batch')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        target: 'leads',
        contacts: leadsBatch,
        skipDuplicates: true,
        sourceTag: 'Importação XLS'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.imported, 1);

    const lead = db.prepare(`SELECT * FROM leads WHERE name = ?`).get('Carlos Eduardo Lead');
    assert.ok(lead);
    assert.equal(lead.phone, '(32) 98444-5555');
    assert.equal(lead.origin, 'Importação Contatos');
  });

  it('POST /api/contacts/import-batch ignora contatos duplicados se skipDuplicates for true', async () => {
    // Tenta importar novamente o mesmo telefone do Dr. Roberto Mendes
    const dupBatch = [
      {
        name: 'Dr. Roberto Mendes Duplicado',
        phone: '(32) 98765-4321',
        email: 'roberto@mendes.adv.br'
      },
      {
        name: 'Contato Realmente Novo',
        phone: '(32) 97777-8888',
        email: 'novo@gmail.com'
      }
    ];

    const res = await request(app)
      .post('/api/contacts/import-batch')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        target: 'clients',
        contacts: dupBatch,
        skipDuplicates: true,
        sourceTag: 'Teste Duplicidade'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.imported, 1);
    assert.equal(res.body.skipped, 1);
  });
});
