/**
 * Testes de integração da API — test runner NATIVO do Node (`node --test`) + Supertest.
 *
 * Usamos o runner nativo (e não o Vitest) de propósito: o server.js importa o builtin
 * `node:sqlite`, que o bundler do Vite ainda não resolve. O runner nativo roda o mesmo
 * ESM do runtime, sem transformação — casando exatamente com produção.
 *
 * Rodam contra o `app` do server.js importado em memória (sem abrir porta, graças a
 * NODE_ENV=test) e contra um banco SQLite TEMPORÁRIO e isolado (DB_PATH), criado e
 * apagado a cada execução — o leads.db real NUNCA é tocado.
 *
 * Cobrem os fluxos críticos: login, autenticação, RBAC (perfil restrito → 403),
 * CRUD de clientes, validação do Kanban e o health check.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// IMPORTANTE: definir o ambiente ANTES de importar o server (o import dispara a
// inicialização do banco). Por isso usamos import() dinâmico logo abaixo.
const TMP_DB = path.join(os.tmpdir(), `jaw-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
// A senha do mestre não é mais hardcoded no boot: definimos a senha inicial do
// banco de teste por MASTER_PASSWORD (o mesmo mecanismo do .env em produção).
process.env.MASTER_PASSWORD = 'jorgealvim';

const { app, db } = await import('../server.js');

const MASTER = { username: 'jorgealvimtecnologia', password: 'jorgealvim' };
let masterToken = '';

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

before(async () => {
  const r = await request(app).post('/api/auth/login').send(MASTER);
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.ok(r.body.token);
  masterToken = r.body.token;
});

after(() => {
  try { db?.close?.(); } catch { /* node:sqlite pode não expor close; ignorar */ }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch { /* arquivo pode não existir */ }
  }
});

describe('Health check', () => {
  it('GET /health responde ok', async () => {
    const r = await request(app).get('/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });
});

describe('Autenticação', () => {
  it('login mestre válido devolve token e papel master', async () => {
    const r = await request(app).post('/api/auth/login').send(MASTER);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'master');
  });

  it('login sem campos → 400', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: '' });
    assert.equal(r.status, 400);
  });

  it('login com senha errada → 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: MASTER.username, password: 'senha-errada' });
    assert.equal(r.status, 401);
  });

  it('rota protegida sem token → 401', async () => {
    const r = await request(app).get('/api/auth/me');
    assert.equal(r.status, 401);
  });

  it('GET /api/auth/me com token válido devolve o usuário', async () => {
    const r = await auth(request(app).get('/api/auth/me'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.user);
  });

  it('logout invalida o token', async () => {
    const login = await request(app).post('/api/auth/login').send(MASTER);
    const tk = login.body.token;
    const out = await auth(request(app).post('/api/auth/logout'), tk);
    assert.equal(out.status, 200);
    const after = await auth(request(app).get('/api/auth/me'), tk);
    assert.equal(after.status, 401);
  });
});

describe('Portal do Cliente (módulo extraído)', () => {
  it('login sem identificador → 400', async () => {
    const r = await request(app).post('/api/client-portal/login').send({ password: 'x' });
    assert.equal(r.status, 400);
  });
  it('/me sem token → 401', async () => {
    const r = await request(app).get('/api/client-portal/me');
    assert.equal(r.status, 401);
  });
  it('reset-password sem código → 400', async () => {
    const r = await request(app).post('/api/client-portal/reset-password').send({ login: 'x' });
    assert.equal(r.status, 400);
  });
});

describe('Admin (módulo extraído)', () => {
  it('GET /api/admin/audit-logs com token → 200', async () => {
    const r = await auth(request(app).get('/api/admin/audit-logs'), masterToken);
    assert.equal(r.status, 200);
  });
  it('GET /api/admin/visits com token → 200', async () => {
    const r = await auth(request(app).get('/api/admin/visits'), masterToken);
    assert.equal(r.status, 200);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/admin/audit-logs');
    assert.equal(r.status, 401);
  });
});

describe('CRUD de Clientes (mestre)', () => {
  let createdId = '';

  it('cria cliente com nome e telefone → 201', async () => {
    const r = await auth(request(app).post('/api/clients'), masterToken)
      .send({ full_name: 'Cliente de Teste Automatizado', phone: '32999990000', client_type: 'fisica' });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
    assert.ok(r.body.clientId);
    createdId = r.body.clientId;
  });

  it('cria cliente sem telefone → 400', async () => {
    const r = await auth(request(app).post('/api/clients'), masterToken).send({ full_name: 'Sem Telefone' });
    assert.equal(r.status, 400);
  });

  it('lista clientes e encontra o criado', async () => {
    const r = await auth(request(app).get('/api/clients'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.clients));
    assert.ok(r.body.clients.some((c) => c.id === createdId));
  });

  it('exclui o cliente criado', async () => {
    const r = await auth(request(app).delete(`/api/clients/${createdId}`), masterToken);
    assert.equal(r.status, 200);
    const list = await auth(request(app).get('/api/clients'), masterToken);
    assert.equal(list.body.clients.some((c) => c.id === createdId), false);
  });
});

describe('Usuários & Acesso (módulo extraído)', () => {
  it('GET /api/users com token → 200', async () => {
    const r = await auth(request(app).get('/api/users'), masterToken);
    assert.equal(r.status, 200);
  });
  it('GET /api/access-control/matrix com token → 200', async () => {
    const r = await auth(request(app).get('/api/access-control/matrix'), masterToken);
    assert.equal(r.status, 200);
  });
  it('GET /api/access-control/my-permissions com token → 200', async () => {
    const r = await auth(request(app).get('/api/access-control/my-permissions'), masterToken);
    assert.equal(r.status, 200);
  });
});

describe('RBAC — perfil restrito', () => {
  let secToken = '';

  before(async () => {
    // Cria uma "secretária" (perfil restrito) e sua matriz de permissões:
    // PODE clientes, NÃO PODE financeiro.
    const created = await auth(request(app).post('/api/users'), masterToken)
      .send({ username: 'secretaria_test', password: 'senha1234', name: 'Secretária Teste', role: 'secretaria' });
    assert.equal(created.status, 201);

    const u = db.prepare('SELECT id FROM users WHERE username = ?').get('secretaria_test');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO access_permissions
      (id, user_id, user_type, user_name, role_template, tab_clients, tab_financial, is_active, data_scope, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(`AP-TEST-${Date.now()}`, u.id, 'admin', 'Secretária Teste', 'secretaria', 1, 0, 1, 'assigned', now, now);

    const rl = await request(app).post('/api/auth/login').send({ username: 'secretaria_test', password: 'senha1234' });
    assert.equal(rl.status, 200);
    secToken = rl.body.token;
  });

  it('secretária SEM permissão de financeiro → 403 em /api/financial', async () => {
    const r = await auth(request(app).get('/api/financial/transactions'), secToken);
    assert.equal(r.status, 403);
  });

  it('secretária COM permissão de clientes → acessa /api/clients (não 403)', async () => {
    const r = await auth(request(app).get('/api/clients'), secToken);
    assert.notEqual(r.status, 403);
    assert.equal(r.status, 200);
  });

  it('mestre acessa /api/financial normalmente (bypass)', async () => {
    const r = await auth(request(app).get('/api/financial/transactions'), masterToken);
    assert.notEqual(r.status, 403);
  });
});

describe('Política de senha (8–64 caracteres)', () => {
  const novo = (senha, sufixo) => auth(request(app).post('/api/users'), masterToken).send({
    username: `pol_${sufixo}`, password: senha, name: `Pol ${sufixo}`, role: 'secretaria',
  });

  it('senha com 3 caracteres → 400', async () => {
    const r = await novo('abc', 'curta');
    assert.equal(r.status, 400);
  });

  it('senha com 7 caracteres (abaixo do mínimo) → 400', async () => {
    const r = await novo('abc1234', 'sub8');
    assert.equal(r.status, 400);
  });

  it('senha com 65 caracteres (acima do máximo) → 400', async () => {
    const r = await novo('a'.repeat(65), 'longa');
    assert.equal(r.status, 400);
  });

  it('senha com 8 caracteres (limite mínimo) → 201', async () => {
    const r = await novo('abcd1234', 'min8');
    assert.equal(r.status, 201);
  });

  it('senha com 64 caracteres (limite máximo) → 201', async () => {
    const r = await novo('a'.repeat(64), 'max64');
    assert.equal(r.status, 201);
  });
});

describe('Bloqueio progressivo de login (defesa em profundidade)', () => {
  it('5ª falha consecutiva entra em cooldown (429 + Retry-After)', async () => {
    const alvo = { username: 'bruteforce_test_user', password: 'senha-errada' };
    // Falhas 1–4: credenciais inválidas → 401 (ainda sem punição).
    for (let i = 1; i <= 4; i++) {
      const r = await request(app).post('/api/auth/login').send(alvo);
      assert.equal(r.status, 401, `tentativa ${i} deveria ser 401`);
    }
    // 5ª falha: dispara o cooldown progressivo → 429 com Retry-After.
    const r5 = await request(app).post('/api/auth/login').send(alvo);
    assert.equal(r5.status, 429);
    assert.ok(Number(r5.headers['retry-after']) > 0, 'deve informar Retry-After em segundos');
  });
});

describe('Leads (módulo extraído)', () => {
  it('POST /api/leads (público) cria atendimento → 201', async () => {
    const r = await request(app).post('/api/leads').send({ name: 'Lead Teste', phone: '32988887777', area: 'Civil' });
    assert.equal(r.status, 201);
  });
  it('GET /api/leads sem token → 401', async () => {
    const r = await request(app).get('/api/leads');
    assert.equal(r.status, 401);
  });
});

describe('Financeiro/Financial (módulo extraído)', () => {
  it('GET /api/financial/transactions com token → 200', async () => {
    const r = await auth(request(app).get('/api/financial/transactions'), masterToken);
    assert.equal(r.status, 200);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/financial/transactions');
    assert.equal(r.status, 401);
  });
});

describe('RH/HR (módulo extraído)', () => {
  it('GET /api/hr/dashboard com token → 200', async () => {
    const r = await auth(request(app).get('/api/hr/dashboard'), masterToken);
    assert.equal(r.status, 200);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/hr/employees');
    assert.equal(r.status, 401);
  });
});

describe('Agenda/Calendar (módulo extraído)', () => {
  it('GET /api/calendar/events com token → 200', async () => {
    const r = await auth(request(app).get('/api/calendar/events'), masterToken);
    assert.equal(r.status, 200);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/calendar/events');
    assert.equal(r.status, 401);
  });
});

describe('Drive (módulo extraído)', () => {
  it('GET /api/drive/files com token → 200', async () => {
    const r = await auth(request(app).get('/api/drive/files'), masterToken);
    assert.equal(r.status, 200);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/drive/files');
    assert.equal(r.status, 401);
  });
});

describe('Escritórios/Offices (módulo extraído)', () => {
  it('GET /api/offices com token → 200', async () => {
    const r = await auth(request(app).get('/api/offices'), masterToken);
    assert.equal(r.status, 200);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/offices');
    assert.equal(r.status, 401);
  });
});

describe('Explorer (módulo extraído)', () => {
  it('GET /api/explorer/list com token → 200', async () => {
    const r = await auth(request(app).get('/api/explorer/list?path='), masterToken);
    assert.equal(r.status, 200);
  });
  it('path traversal bloqueado (../) → 400', async () => {
    const r = await auth(request(app).get('/api/explorer/list?path=../..'), masterToken);
    assert.equal(r.status, 400);
  });
  it('sem token → 401', async () => {
    const r = await request(app).get('/api/explorer/list?path=');
    assert.equal(r.status, 401);
  });
});

describe('Processos/Lawsuits (módulo extraído)', () => {
  it('GET /api/lawsuits com token → 200 e lista', async () => {
    const r = await auth(request(app).get('/api/lawsuits'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.lawsuits) || r.body.success);
  });

  it('GET /api/lawsuits sem token → 401', async () => {
    const r = await request(app).get('/api/lawsuits');
    assert.equal(r.status, 401);
  });

  it('GET /api/lawsuits/movements/:id/preview-whatsapp sem token → 401', async () => {
    const r = await request(app).get('/api/lawsuits/movements/999/preview-whatsapp');
    assert.equal(r.status, 401);
  });

  it('POST /api/lawsuits/movements/:id/authorize-whatsapp sem token → 401', async () => {
    const r = await request(app).post('/api/lawsuits/movements/999/authorize-whatsapp').send({ phone: '32999999999' });
    assert.equal(r.status, 401);
  });
});

describe('Blog (módulo extraído)', () => {
  it('GET /api/blog/posts (público) responde lista', async () => {
    const r = await request(app).get('/api/blog/posts');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.posts) || Array.isArray(r.body.articles) || r.body.success);
  });

  it('GET /api/blog/categories responde', async () => {
    const r = await request(app).get('/api/blog/categories');
    assert.equal(r.status, 200);
  });

  it('rota admin de blog exige autenticação (401 sem token)', async () => {
    const r = await request(app).get('/api/admin/blog/comments');
    assert.equal(r.status, 401);
  });
});

describe('Validação do Kanban', () => {
  it('criar cartão sem título → 400', async () => {
    const r = await auth(request(app).post('/api/kanban'), masterToken).send({ column_key: 'todo' });
    assert.equal(r.status, 400);
  });

  it('criar cartão válido → success e listar', async () => {
    const r = await auth(request(app).post('/api/kanban'), masterToken)
      .send({ title: 'Tarefa de teste', column_key: 'todo', priority: 'alta' });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);

    const list = await auth(request(app).get('/api/kanban'), masterToken);
    assert.equal(list.status, 200);
    assert.ok(list.body.cards.some((c) => c.title === 'Tarefa de teste'));
  });
});

describe('Manutenção & Saúde do Sistema (Fase 5)', () => {
  it('GET /api/admin/maintenance/health sem token → 401', async () => {
    const r = await request(app).get('/api/admin/maintenance/health');
    assert.equal(r.status, 401);
  });

  it('GET /api/admin/maintenance/health com masterToken → 200 e métricas', async () => {
    const r = await auth(request(app).get('/api/admin/maintenance/health'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.server);
    assert.ok(r.body.memory);
    assert.ok(r.body.sqlite);
  });

  it('POST /api/admin/maintenance/db/integrity → 200 e isOk true', async () => {
    const r = await auth(request(app).post('/api/admin/maintenance/db/integrity'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.isOk, true);
  });

  it('POST /api/admin/maintenance/db/vacuum → 200', async () => {
    const r = await auth(request(app).post('/api/admin/maintenance/db/vacuum'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  it('POST /api/admin/maintenance/db/checkpoint → 200', async () => {
    const r = await auth(request(app).post('/api/admin/maintenance/db/checkpoint'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  it('POST /api/admin/maintenance/db/reindex → 200', async () => {
    const r = await auth(request(app).post('/api/admin/maintenance/db/reindex'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  it('GET /api/admin/maintenance/backups → 200 e lista', async () => {
    const r = await auth(request(app).get('/api/admin/maintenance/backups'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.backups));
  });

  it('POST /api/admin/maintenance/backups/create → 200 e snapshot gerado', async () => {
    const r = await auth(request(app).post('/api/admin/maintenance/backups/create'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.backup?.filename);
  });

  it('GET /api/admin/maintenance/sessions → 200', async () => {
    const r = await auth(request(app).get('/api/admin/maintenance/sessions'), masterToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.sessions));
  });

  it('GET e POST /api/admin/maintenance/mode → alterna modo manutenção', async () => {
    const on = await auth(request(app).post('/api/admin/maintenance/mode'), masterToken).send({ active: true });
    assert.equal(on.status, 200);
    assert.equal(on.body.active, true);

    const off = await auth(request(app).post('/api/admin/maintenance/mode'), masterToken).send({ active: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.active, false);
  });
});

describe('LegalTech & Inovações Tecnológicas (Fase 4)', () => {
  let createdReqId = null;

  it('POST /api/legaltech/field-requests sem token → 401', async () => {
    const r = await request(app).post('/api/legaltech/field-requests').send({ target_module: 'Clientes', field_label: 'NB' });
    assert.equal(r.status, 401);
  });

  it('POST /api/legaltech/field-requests sem campos obrigatórios → 400', async () => {
    const r = await auth(request(app).post('/api/legaltech/field-requests'), masterToken).send({});
    assert.equal(r.status, 400);
  });

  it('POST /api/legaltech/field-requests cria pedido de novo campo → 201', async () => {
    const r = await auth(request(app).post('/api/legaltech/field-requests'), masterToken).send({
      target_module: 'Clientes & Contratos',
      field_label: 'Número do Benefício INSS (NB)',
      field_type: 'NUMERO',
      is_required: 1,
      business_justification: 'Ações previdenciárias requerem o NB do cliente.'
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
    assert.ok(r.body.request.id);
    assert.equal(r.body.request.status, 'PENDENTE');
    createdReqId = r.body.request.id;
  });

  it('GET /api/legaltech/field-requests lista solicitações → 200', async () => {
    const r = await auth(request(app).get('/api/legaltech/field-requests'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(Array.isArray(r.body.requests));
    const found = r.body.requests.find(x => x.id === createdReqId);
    assert.ok(found);
    assert.equal(found.field_label, 'Número do Benefício INSS (NB)');
  });

  it('PATCH /api/legaltech/field-requests/:id/status atualiza status → 200', async () => {
    const r = await auth(request(app).patch(`/api/legaltech/field-requests/${createdReqId}/status`), masterToken).send({
      status: 'EM_ANALISE',
      admin_notes: 'Em fila técnica para a sprint atual.'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  it('GET /api/legaltech/check-conflict busca homônimos na base → 200', async () => {
    const r = await auth(request(app).get('/api/legaltech/check-conflict?name=Cliente'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(typeof r.body.hasConflict, 'boolean');
  });

  it('GET /api/legaltech/check-workday valida sábado e calcula próximo dia útil → 200', async () => {
    // 2026-09-12 é um sábado
    const r = await auth(request(app).get('/api/legaltech/check-workday?date=2026-09-12'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.isWorkday, false);
    assert.equal(r.body.reason, 'Sábado');
    assert.equal(r.body.nextWorkdayDate, '2026-09-14'); // Segunda-feira
  });
});

describe('Fase 2: Cockpit Matinal & Controle de Prazos', () => {
  it('GET /api/dashboard/meu-dia-hoje retorna estrutura consolidada → 200', async () => {
    const r = await auth(request(app).get('/api/dashboard/meu-dia-hoje'), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.data_hoje);
    assert.ok(r.body.prazos);
    assert.ok(Array.isArray(r.body.prazos.hoje));
    assert.ok(Array.isArray(r.body.prazos.amanha));
    assert.ok(Array.isArray(r.body.prazos.semana));
    assert.ok(Array.isArray(r.body.audiencias));
    assert.ok(Array.isArray(r.body.intimacoes));
  });

  it('POST /api/legaltech/calculate-deadline calcula prazo de 15 dias CPC → 200', async () => {
    const r = await auth(request(app).post('/api/legaltech/calculate-deadline'), masterToken).send({
      start_date: '2026-09-01',
      days: 15,
      regime: 'cpc'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.prazo_dias, 15);
    assert.equal(r.body.tipo_dias, 'Úteis');
    assert.ok(r.body.data_fatal);
    assert.ok(Array.isArray(r.body.memoria_calculo));
  });

  it('POST /api/court/deadline/calculate sem data inicial → 400', async () => {
    const r = await auth(request(app).post('/api/court/deadline/calculate'), masterToken).send({});
    assert.equal(r.status, 400);
  });

  it('POST /api/juridico/publications/:id/triage processa ciente → 200 ou 404 se inexistente', async () => {
    const r = await auth(request(app).post('/api/juridico/publications/fake-id-123/triage'), masterToken).send({
      action: 'ciente'
    });
    // Como fake-id-123 não existe no banco limpo de teste, deve retornar 404
    assert.equal(r.status, 404);
  });
});

describe('Fase 3: Agilidade Comercial, Contratos & Experiência do Cliente', () => {
  let phase3ClientId = '';
  let magicToken = '';
  let alvaraId = '';

  before(async () => {
    const r = await auth(request(app).post('/api/clients'), masterToken).send({
      full_name: 'Ana Paula Ferreira Silveira',
      phone: '31988887777',
      cpf: '12345678901',
      client_type: 'fisica',
      street: 'Av. Afonso Pena',
      number: '1500',
      neighborhood: 'Funcionários',
      city: 'Belo Horizonte',
      state: 'MG',
      cep: '30130-005',
      contract_value: 5000,
      balance_due: 2500
    });
    assert.equal(r.status, 201);
    phase3ClientId = r.body.clientId;
  });

  it('GET /api/legal-docs/kit/:clientId gera Kit Inicial (Procuração, Contrato, Hipossuficiência) → 200', async () => {
    const r = await auth(request(app).get(`/api/legal-docs/kit/${phase3ClientId}`), masterToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.client);
    assert.equal(r.body.client.full_name, 'Ana Paula Ferreira Silveira');
    assert.ok(r.body.advogado);
    assert.equal(r.body.advogado.oab, 'OAB/MG 222.943');
    assert.ok(r.body.docs.procuracao);
    assert.ok(r.body.docs.contrato);
    assert.ok(r.body.docs.hipossuficiencia);
    assert.ok(r.body.docs.procuracao.html.includes('PROCURAÇÃO'));
    assert.ok(r.body.docs.contrato.html.includes('HONORÁRIOS'));
  });

  it('GET /api/legal-docs/render/:clientId/procuracao gera folha A4 timbrada de impressão → 200', async () => {
    const r = await auth(request(app).get(`/api/legal-docs/render/${phase3ClientId}/procuracao`), masterToken);
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('PROCURAÇÃO'));
    assert.ok(r.text.includes('Ana Paula Ferreira Silveira'));
    assert.ok(r.text.includes('OAB/MG 222.943'));
  });

  let testSignToken = null;
  let testSignReqId = null;

  it('POST /api/legal-docs/dispatch-kit dispara solicitação de assinatura eletrônica mobile → 201', async () => {
    const r = await auth(request(app).post('/api/legal-docs/dispatch-kit'), masterToken).send({
      clientId: phase3ClientId,
      docTypes: ['procuracao', 'contrato', 'hipossuficiencia']
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
    assert.ok(r.body.whatsapp_link);
    assert.ok(Array.isArray(r.body.requests));
    assert.equal(r.body.requests.length, 3);
    testSignToken = r.body.requests[0].token;
    testSignReqId = r.body.requests[0].id;
  });

  it('POST /api/legal-docs/dispatch-kit com seleção individual (Fase 2) → 201 com apenas 2 docs', async () => {
    const r = await auth(request(app).post('/api/legal-docs/dispatch-kit'), masterToken).send({
      clientId: phase3ClientId,
      docTypes: ['procuracao', 'contrato']
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
    assert.equal(r.body.requests.length, 2);
  });

  it('POST /api/esign/public/:token/sign assina e arquiva via chancelada em tempo real (Fase 1) → 200', async () => {
    const r = await request(app).post(`/api/esign/public/${testSignToken}/sign`).send({
      signer_name_confirm: 'Ana Paula Ferreira Silveira',
      signature_type: 'digitada',
      signature_data: 'Ana Paula Ferreira Silveira',
      agree: true,
      geo: '-21.7642,-43.3503'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.evidence_hash);
    assert.ok(r.body.chancelled_url);

    // Confere que a via chancelada foi gravada em client_documents
    const docRow = db.prepare(`SELECT * FROM client_documents WHERE client_id = ? AND original_name LIKE '%Chancelado%'`).get(phase3ClientId);
    assert.ok(docRow, 'Documento chancelado deve existir na tabela client_documents');
    assert.ok(docRow.file_name.includes('.html'));
  });

  it('GET /api/esign/requests/:id/chancelado renderiza folha timbrada chancelada com hash SHA-256 → 200', async () => {
    const r = await request(app).get(`/api/esign/requests/${testSignReqId}/chancelado`);
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('CHANCELA DE ASSINATURA ELETRÔNICA'));
    assert.ok(r.text.includes('OAB/MG 222.943'));
    assert.ok(r.text.includes('Ana Paula Ferreira Silveira'));
  });

  it('POST /api/client-portal/magic-link gera link de upload sem senha com validade de 72h → 201', async () => {
    const r = await auth(request(app).post('/api/client-portal/magic-link'), masterToken).send({
      clientId: phase3ClientId
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
    assert.ok(r.body.upload_url);
    assert.ok(r.body.token);
    assert.ok(r.body.whatsapp_link);
    magicToken = r.body.token;
  });

  it('GET /api/client-portal/magic-info/:token valida token público sem requerer login → 200', async () => {
    const r = await request(app).get(`/api/client-portal/magic-info/${magicToken}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.valid, true);
    assert.equal(r.body.client_name, 'Ana Paula Ferreira Silveira');
  });

  it('GET /api/client-portal/magic-info/:token com token falso devolve 404', async () => {
    const r = await request(app).get('/api/client-portal/magic-info/token-invalido-xyz');
    assert.equal(r.status, 404);
    assert.equal(r.body.valid, false);
  });

  it('POST /api/financial/alvaras e GET /api/financial/alvaras/:id/receipt emite prestação de contas com extenso → 200', async () => {
    const createRes = await auth(request(app).post('/api/financial/alvaras'), masterToken).send({
      client_id: phase3ClientId,
      process_number: '5001234-55.2026.8.13.0024',
      vara_tribunal: '2ª Vara Cível de Belo Horizonte',
      gross_amount: 10000.00,
      fee_percentage: 30.00,
      release_date: '2026-09-06',
      notes: 'Alvará expedido pelo TJMG'
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    alvaraId = createRes.body.id;

    // 1. Testa Prestação de Contas em JSON
    const receiptJsonRes = await auth(request(app).get(`/api/financial/alvaras/${alvaraId}/receipt?format=json`), masterToken);
    assert.equal(receiptJsonRes.status, 200);
    assert.equal(receiptJsonRes.body.success, true);
    assert.equal(receiptJsonRes.body.statement.gross_amount, 10000);
    assert.equal(receiptJsonRes.body.statement.fee_amount, 3000);
    assert.equal(receiptJsonRes.body.statement.net_client_amount, 7000);
    assert.ok(receiptJsonRes.body.statement.net_client_amount_extenso.includes('sete mil reais'));

    // 2. Testa Prestação de Contas em HTML timbrado (A4 para impressão e recibo de quitação)
    const receiptHtmlRes = await auth(request(app).get(`/api/financial/alvaras/${alvaraId}/receipt`), masterToken);
    assert.equal(receiptHtmlRes.status, 200);
    assert.ok(receiptHtmlRes.text.includes('PRESTAÇÃO DE CONTAS & RECIBO DE QUITAÇÃO'));
    assert.ok(receiptHtmlRes.text.includes('Ana Paula Ferreira Silveira'));
    assert.ok(receiptHtmlRes.text.includes('7.000,00'));
    assert.ok(receiptHtmlRes.text.includes('sete mil reais'));
  });
});

describe('Meta Ads & Marketing (Hub de Criativos e Rascunhos)', () => {
  it('GET /api/meta-ads/config sem token → 401', async () => {
    const res = await request(app).get('/api/meta-ads/config');
    assert.equal(res.status, 401);
  });

  it('GET /api/meta-ads/config com token → 200 e status de conexão', async () => {
    const res = await auth(request(app).get('/api/meta-ads/config'), masterToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.isConfigured, 'boolean');
  });

  it('POST /api/meta-ads/config atualiza credenciais com sucesso', async () => {
    const res = await auth(request(app).post('/api/meta-ads/config'), masterToken).send({
      systemUserToken: 'EAATestToken123456',
      adAccountId: 'act_998877665544',
      pageId: '10987654321',
      instagramAccountId: '178999888777'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it('POST /api/meta-ads/compliance-check detecta infração ética OAB', async () => {
    const res = await auth(request(app).post('/api/meta-ads/compliance-check'), masterToken).send({
      title: 'Causa ganha garantida',
      message: 'Honorários grátis e o melhor advogado da cidade'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.compliant, false);
    assert.ok(res.body.warnings.length >= 2);
  });

  let createdPostId = '';

  it('POST /api/meta-ads/posts cria rascunho de anúncio com sucesso', async () => {
    const res = await auth(request(app).post('/api/meta-ads/posts'), masterToken)
      .field('title', 'Direito do Consumidor: Cobranças Indevidas')
      .field('message', 'Artigo informativo sobre devolução em dobro do valor pago indevidamente.')
      .field('link_url', 'https://jorgealvimadvocacia.com.br/artigos/consumidor')
      .field('call_to_action', 'LEARN_MORE')
      .field('destination_type', 'AD_DRAFT_PAUSED')
      .field('daily_budget', '35.00')
      .field('campaign_goal', 'OUTCOME_LEADS')
      .field('target_city', 'Juiz de Fora')
      .field('target_radius_km', '40')
      .field('target_age_min', '25')
      .field('target_age_max', '60')
      .field('target_gender', 'ALL')
      .field('target_interests', JSON.stringify(['Direito do Consumidor', 'Bancário']));

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.post.id);
    assert.ok(res.body.post.meta_ad_id);
    assert.equal(res.body.post.daily_budget_cents, 3500);
    assert.equal(res.body.post.target_city, 'Juiz de Fora');
    assert.equal(res.body.post.campaign_goal, 'OUTCOME_LEADS');
    createdPostId = res.body.post.id;
  });

  it('GET /api/meta-ads/posts lista os criativos cadastrados', async () => {
    const res = await auth(request(app).get('/api/meta-ads/posts'), masterToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.posts));
    const found = res.body.posts.find(p => p.id === createdPostId);
    assert.ok(found);
    assert.equal(found.daily_budget_cents, 3500);
    assert.equal(found.target_city, 'Juiz de Fora');
  });

  it('DELETE /api/meta-ads/posts/:id exclui o rascunho com sucesso', async () => {
    const res = await auth(request(app).delete(`/api/meta-ads/posts/${createdPostId}`), masterToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('Google Identity Services (Auth & Cadastro)', () => {
  it('GET /api/auth/google-config → 200 e retorna configuração pública', async () => {
    const res = await request(app).get('/api/auth/google-config');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.clientId, 'string');
    assert.equal(typeof res.body.enabled, 'boolean');
  });

  it('POST /api/auth/google sem credencial → 400', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/google com token inválido → 401', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'token-invalido-xyz' });
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/google com conta autorizada → 200 e sessão de admin', async () => {
    const mockToken = 'mock-google-token:sub-master:jorgealvimtecnologia@gmail.com:Dr. Jorge Alvim';
    const res = await request(app).post('/api/auth/google').send({ credential: mockToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, 'jorgealvimtecnologia');
  });

  it('POST /api/auth/google com conta não autorizada (sem permissão RBAC) → 403', async () => {
    const mockToken = 'mock-google-token:sub-unauth:desconhecido.alvim@gmail.com:Outro Usuario';
    const res = await request(app).post('/api/auth/google').send({ credential: mockToken });
    assert.equal(res.status, 403);
    assert.ok(res.body.error);
    assert.ok(res.body.error.includes('RBAC'));
  });

  it('POST /api/auth/google com conta de cliente tentando entrar no painel → 403', async () => {
    // Registra cliente com google email
    const clientEmail = `cliente.teste.rbac.${Date.now()}@gmail.com`;
    const mockTokenClient = `mock-google-token:sub-client-rbac:${clientEmail}:Cliente Teste RBAC`;
    await request(app).post('/api/client-portal/auth/google').send({ credential: mockTokenClient });

    // Tenta acessar o painel de admin com a conta do cliente
    const res = await request(app).post('/api/auth/google').send({ credential: mockTokenClient });
    assert.equal(res.status, 403);
    assert.ok(res.body.error);
    assert.ok(res.body.error.includes('CLIENTE'));
  });

  it('POST /api/client-portal/auth/google sem credencial → 400', async () => {
    const res = await request(app).post('/api/client-portal/auth/google').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/client-portal/auth/google com novo cliente → 200 e cadastro automático', async () => {
    const uniqueEmail = `cliente.google.${Date.now()}@gmail.com`;
    const mockToken = `mock-google-token:sub-new-${Date.now()}:${uniqueEmail}:Cliente Novo Google`;
    const res = await request(app).post('/api/client-portal/auth/google').send({ credential: mockToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.is_new_client, true);
    assert.ok(res.body.token);
    assert.equal(res.body.client.email, uniqueEmail);
    assert.ok(res.body.client.id.startsWith('JA-CLI-'));
  });

  it('POST /api/client-portal/auth/google com cliente existente → 200 e login', async () => {
    const existingEmail = `cliente.existente.${Date.now()}@gmail.com`;
    const mockToken1 = `mock-google-token:sub-exist-${Date.now()}:${existingEmail}:Cliente Existente`;
    await request(app).post('/api/client-portal/auth/google').send({ credential: mockToken1 });
    const res2 = await request(app).post('/api/client-portal/auth/google').send({ credential: mockToken1 });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.success, true);
    assert.equal(res2.body.is_new_client, false);
    assert.ok(res2.body.token);
    assert.equal(res2.body.client.email, existingEmail);
  });

  it('POST /api/auth/google com access_token de admin → 200', async () => {
    const mockToken = 'mock-google-token:sub-master:jorgealvimtecnologia@gmail.com:Dr. Jorge Alvim';
    const res = await request(app).post('/api/auth/google').send({ access_token: mockToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
  });

  it('POST /api/client-portal/auth/google com access_token → 200', async () => {
    const uniqueEmail = `cliente.token.${Date.now()}@gmail.com`;
    const mockToken = `mock-google-token:sub-tok-${Date.now()}:${uniqueEmail}:Cliente Token`;
    const res = await request(app).post('/api/client-portal/auth/google').send({ access_token: mockToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
  });
});

describe('Soft Delete & Barreira Ética OAB (LGPD Art. 16, I)', () => {
  const testCpf = '111.222.333-44';
  const testPhone = '32988887777';
  const testPass = 'Senha123';
  let testClientId = '';
  let clientPortalToken = '';

  before(async () => {
    // 1. Cadastra cliente para teste
    const reg = await request(app).post('/api/client-portal/register').send({
      full_name: 'Cliente Protegido OAB',
      cpf: testCpf,
      phone: testPhone,
      password: testPass,
      email: `oab.lgpd.${Date.now()}@teste.com`
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.client?.id);
    testClientId = reg.body.client.id;

    // 2. Faz login no portal para obter token de sessão
    const login = await request(app).post('/api/client-portal/login').send({
      login: testCpf,
      password: testPass
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);
    clientPortalToken = login.body.token;

    // 3. Insere um processo judicial ATIVO vinculado a esse cliente
    db.prepare(`
      INSERT INTO lawsuits (
        id, client_id, cnj_number, tribunal, instance, action_type, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `LAW-TEST-${Date.now()}`,
      testClientId,
      '5001234-88.2026.8.13.0145',
      'TJMG',
      '1ª Instância',
      'Ação de Cobrança c/c Indenizatória',
      'Em Andamento',
      new Date().toISOString(),
      new Date().toISOString()
    );
  });

  it('bloqueia exclusão de conta no Portal com 409 quando há processo ativo (Art. 16, I LGPD)', async () => {
    const res = await request(app)
      .delete('/api/client-portal/account')
      .set('Authorization', `Bearer ${clientPortalToken}`)
      .send({ password: testPass });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ACTIVE_LAWSUITS_BARRIER');
    assert.ok(res.body.error.includes('Estatuto da OAB') || res.body.error.includes('Art. 16, I'));
    assert.ok(Array.isArray(res.body.active_lawsuits));
    assert.equal(res.body.active_lawsuits.length, 1);

    // Garante que o cliente permanece ativo no banco de dados
    const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(testClientId);
    assert.ok(row);
    assert.equal(row.deleted_at, null);
    assert.equal(row.status, 'ativo');
  });

  it('bloqueia desativação no painel admin com 409 sem flag force=true quando há processo ativo', async () => {
    const res = await auth(request(app).delete(`/api/clients/${testClientId}`), masterToken);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ACTIVE_LAWSUITS_BARRIER');
    assert.ok(Array.isArray(res.body.active_lawsuits));
  });

  it('permite soft delete no Portal após arquivamento do processo (200 OK)', async () => {
    // Arquiva o processo judicial
    db.prepare(`UPDATE lawsuits SET status = 'Arquivado' WHERE client_id = ?`).run(testClientId);

    const res = await request(app)
      .delete('/api/client-portal/account')
      .set('Authorization', `Bearer ${clientPortalToken}`)
      .send({ password: testPass });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // O registro NÃO pode ter sido deletado fisicamente (Hard Delete proibido)
    const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(testClientId);
    assert.ok(row, 'Cliente deve existir no banco de dados após soft delete');
    assert.equal(row.status, 'inativo_lgpd');
    assert.equal(row.contract_status, 'Inativo');
    assert.ok(row.deleted_at, 'deleted_at deve estar preenchido com timestamp ISO');
    assert.equal(row.deletion_reason, 'SOLICITACAO_TITULAR_LGPD');
  });

  it('bloqueia login no Portal com 403 para conta com soft delete', async () => {
    const res = await request(app).post('/api/client-portal/login').send({
      login: testCpf,
      password: testPass
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_DEACTIVATED_LGPD');
    assert.ok(res.body.error.includes('desativada'));
  });

  it('listagem admin /api/clients oculta soft deleted por padrão e exibe com ?include_deleted=true', async () => {
    // Listagem padrão: não deve conter o cliente
    const def = await auth(request(app).get('/api/clients'), masterToken);
    assert.equal(def.status, 200);
    assert.equal(def.body.clients.some((c) => c.id === testClientId), false);

    // Listagem com include_deleted=true: deve conter com flag is_deleted
    const all = await auth(request(app).get('/api/clients?include_deleted=true'), masterToken);
    assert.equal(all.status, 200);
    const found = all.body.clients.find((c) => c.id === testClientId);
    assert.ok(found);
    assert.equal(found.is_deleted, true);
    assert.equal(found.status, 'inativo_lgpd');
  });

  it('permite soft delete no painel admin com flag force=true mesmo com processo', async () => {
    // Cria um segundo cliente com processo ativo
    const reg = await request(app).post('/api/client-portal/register').send({
      full_name: 'Cliente Forcado Admin',
      cpf: '999.888.777-66',
      phone: '32977776666',
      password: testPass,
      email: `admin.force.${Date.now()}@teste.com`
    });
    const cId = reg.body.client.id;

    db.prepare(`
      INSERT INTO lawsuits (
        id, client_id, cnj_number, tribunal, instance, action_type, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `LAW-FORCE-${Date.now()}`,
      cId,
      '5009999-11.2026.8.13.0145',
      'TJMG',
      '1ª Instância',
      'Reclamação Trabalhista',
      'Em Andamento',
      new Date().toISOString(),
      new Date().toISOString()
    );

    const res = await auth(request(app).delete(`/api/clients/${cId}?force=true`), masterToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(cId);
    assert.ok(row);
    assert.equal(row.status, 'inativo_lgpd');
    assert.ok(row.deleted_at);
  });
});

describe('Conteúdo do Site & Hub do Blog (Áreas de Atuação e Uploads)', () => {
  it('GET /api/site/practice-areas retorna os 6 boxes oficiais para a Home', async () => {
    const res = await request(app).get('/api/site/practice-areas');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 6);
    assert.equal(res.body[0].box_order, 1);
    assert.ok(res.body[0].title.includes('Transportes'));
    assert.ok(Array.isArray(res.body[0].items));
  });

  it('GET /api/admin/site/practice-areas requer autenticação e lista boxes', async () => {
    const unauth = await request(app).get('/api/admin/site/practice-areas');
    assert.equal(unauth.status, 401);

    const authRes = await auth(request(app).get('/api/admin/site/practice-areas'), masterToken);
    assert.equal(authRes.status, 200);
    assert.ok(Array.isArray(authRes.body));
    assert.equal(authRes.body.length, 6);
  });

  it('PUT /api/admin/site/practice-areas/:id atualiza dados de um box com sucesso', async () => {
    const listRes = await auth(request(app).get('/api/admin/site/practice-areas'), masterToken);
    const firstBox = listRes.body[0];

    const updateRes = await auth(
      request(app)
        .put(`/api/admin/site/practice-areas/${firstBox.id}`)
        .send({
          title: 'Direito dos Transportes, Trânsito & CNH',
          description: 'Defesa especializada atualizada para motoristas e transportadores.',
          items: ['Defesa em processos de CNH', 'Recursos CETRAN e JARI', 'Indenizações de trânsito'],
          image_url: firstBox.image_url,
          badge: 'Especialidade Ouro',
          action_label: 'Consultar Especialista',
          action_link: '#contato'
        }),
      masterToken
    );

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);

    const checkRes = await request(app).get('/api/site/practice-areas');
    const updated = checkRes.body.find(b => b.id === firstBox.id);
    assert.equal(updated.title, 'Direito dos Transportes, Trânsito & CNH');
    assert.equal(updated.badge, 'Especialidade Ouro');
  });

  it('POST /api/admin/blog/upload rejeita requisição sem arquivo', async () => {
    const res = await auth(request(app).post('/api/admin/blog/upload'), masterToken);
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/admin/blog/upload aceita campo "image" e retorna url pública', async () => {
    const buffer = Buffer.from('fake image content for test');
    const res = await auth(
      request(app)
        .post('/api/admin/blog/upload')
        .attach('image', buffer, 'test-capa.jpg'),
      masterToken
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.url.startsWith('/img/blog/'));
  });

  it('POST /api/admin/blog/upload aceita campo "media" e retorna url pública', async () => {
    const buffer = Buffer.from('fake image content for test');
    const res = await auth(
      request(app)
        .post('/api/admin/blog/upload')
        .attach('media', buffer, 'test-infografico.png'),
      masterToken
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.url.startsWith('/img/blog/'));
  });
});

describe('Módulo FAQ & SEO Local (Conteúdo & Compliance)', () => {
  it('GET /api/site/faqs retorna FAQs ativos e sem menção a inventário', async () => {
    const res = await request(app).get('/api/site/faqs');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.faqs));
    assert.ok(res.body.faqs.length >= 6);

    const familiaFaq = res.body.faqs.find(f => f.category === 'familia');
    assert.ok(familiaFaq, 'Deveria existir FAQ na categoria familia');
    assert.ok(familiaFaq.question.includes('Divórcio'), 'Pergunta de família deve abordar divórcio');
    assert.ok(!familiaFaq.question.toLowerCase().includes('inventário'), 'Pergunta não pode conter inventário');
    assert.ok(!familiaFaq.answer.toLowerCase().includes('inventário'), 'Resposta não pode conter inventário');
  });

  it('GET /api/admin/site/faqs requer autenticação de administrador', async () => {
    const unauthRes = await request(app).get('/api/admin/site/faqs');
    assert.equal(unauthRes.status, 401);

    const authRes = await auth(request(app).get('/api/admin/site/faqs'), masterToken);
    assert.equal(authRes.status, 200);
    assert.equal(authRes.body.success, true);
    assert.ok(Array.isArray(authRes.body.faqs));
  });

  it('POST /api/admin/site/faqs cadastra nova pergunta com auditoria', async () => {
    const newFaq = {
      faq_order: 99,
      category: 'familia',
      category_label: 'Direito de Família • Pensão & Guarda',
      question: 'Como é calculada a pensão alimentícia para autônomos e empresários?',
      answer: 'O juiz de família avalia os sinais exteriores de riqueza, extratos e padrão de vida para fixar a verba.',
      highlight_note: '👨‍👩‍👧 Cálculo fundamentado em prova documental e faturamento real.',
      is_active: 1
    };

    const res = await auth(
      request(app).post('/api/admin/site/faqs').send(newFaq),
      masterToken
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.faq.id);
    const createdId = res.body.faq.id;

    // Atualizar
    const updateRes = await auth(
      request(app).put(`/api/admin/site/faqs/${createdId}`).send({
        question: 'Como é calculada a pensão alimentícia para autônomos em JF?',
        answer: 'Atualizada para teste.',
        is_active: 0
      }),
      masterToken
    );
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.faq.question, 'Como é calculada a pensão alimentícia para autônomos em JF?');
    assert.equal(updateRes.body.faq.is_active, 0);

    // Deletar
    const delRes = await auth(
      request(app).delete(`/api/admin/site/faqs/${createdId}`),
      masterToken
    );
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.success, true);
  });
});

describe('Recuperação de Senha do Administrador & Google Colaborador', () => {
  it('POST /api/auth/forgot-password sem usuário → 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/forgot-password com usuário inexistente → 404', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ username: 'usuario_inexistente_xyz_123' });
    assert.equal(res.status, 404);
  });

  it('POST /api/auth/forgot-password com usuário válido → 200 e gera código no banco', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ username: 'jorgealvimtecnologia' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const usr = db.prepare(`SELECT reset_token, reset_token_expires FROM users WHERE username = 'jorgealvimtecnologia'`).get();
    assert.ok(usr.reset_token);
    assert.equal(usr.reset_token.length, 6);
  });

  it('POST /api/auth/reset-password com código inválido → 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      username: 'jorgealvimtecnologia',
      code: '000000',
      new_password: 'novasenha123'
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Código de segurança inválido'));
  });

  it('POST /api/auth/reset-password com senha fora da política (menos de 8 ou mais de 64) → 400', async () => {
    const usr = db.prepare(`SELECT reset_token FROM users WHERE username = 'jorgealvimtecnologia'`).get();
    const resShort = await request(app).post('/api/auth/reset-password').send({
      username: 'jorgealvimtecnologia',
      code: usr.reset_token,
      new_password: '12'
    });
    assert.equal(resShort.status, 400);

    const resLong = await request(app).post('/api/auth/reset-password').send({
      username: 'jorgealvimtecnologia',
      code: usr.reset_token,
      new_password: 'a'.repeat(65)
    });
    assert.equal(resLong.status, 400);
  });

  it('POST /api/auth/reset-password com código válido e senha válida (>=8) → 200 e redefine senha', async () => {
    const usr = db.prepare(`SELECT reset_token FROM users WHERE username = 'jorgealvimtecnologia'`).get();
    const res = await request(app).post('/api/auth/reset-password').send({
      username: 'jorgealvimtecnologia',
      code: usr.reset_token,
      new_password: 'novasenha1'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Consegue logar com a nova senha
    const loginRes = await request(app).post('/api/auth/login').send({
      username: 'jorgealvimtecnologia',
      password: 'novasenha1'
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);

    // Restaura a senha mestre padrão para outros testes
    const resetBack = await request(app).post('/api/auth/forgot-password').send({ username: 'jorgealvimtecnologia' });
    const codeBack = db.prepare(`SELECT reset_token FROM users WHERE username = 'jorgealvimtecnologia'`).get().reset_token;
    await request(app).post('/api/auth/reset-password').send({
      username: 'jorgealvimtecnologia',
      code: codeBack,
      new_password: 'jorgealvim'
    });
  });

  it('POST /api/hr/portal/auth/google sem credencial → 400', async () => {
    const res = await request(app).post('/api/hr/portal/auth/google').send({});
    assert.equal(res.status, 400);
  });

  it('POST /api/hr/portal/auth/google com email mestre → 200 e sessão de colaborador', async () => {
    const mockToken = 'mock-google-token:sub-master-google:jorgealvimtecnologia@gmail.com:Dr. Jorge Alvim';
    const res = await request(app).post('/api/hr/portal/auth/google').send({ credential: mockToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.employee.id, 'EMP-MASTER-01');
  });

  it('POST /api/hr/portal/auth/google com colaborador cadastrado no RH → 200', async () => {
    // Insere ou atualiza um colaborador de teste com email
    const testEmail = 'patricia.teste.rh@gmail.com';
    db.prepare(`
      INSERT OR REPLACE INTO hr_employees (id, name, cpf, position, contract_type, status, email, admission_date, created_at, updated_at)
      VALUES ('EMP-TEST-RH-01', 'Patricia Teste RH', '111.222.333-44', 'Secretária', 'CLT', 'Ativo', ?, '2025-01-01', datetime('now'), datetime('now'))
    `).run(testEmail);

    const mockToken = `mock-google-token:sub-patricia-123:${testEmail}:Patricia Teste RH`;
    const res = await request(app).post('/api/hr/portal/auth/google').send({ credential: mockToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.employee.name, 'Patricia Teste RH');
  });

  it('POST /api/hr/portal/auth/google com conta não vinculada → 403', async () => {
    const mockToken = 'mock-google-token:sub-desconhecido:estranho@gmail.com:Usuario Desconhecido';
    const res = await request(app).post('/api/hr/portal/auth/google').send({ credential: mockToken });
    assert.equal(res.status, 403);
    assert.ok(res.body.error);
  });
});




