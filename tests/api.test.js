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

describe('Política de senha (4–12 caracteres)', () => {
  const novo = (senha, sufixo) => auth(request(app).post('/api/users'), masterToken).send({
    username: `pol_${sufixo}`, password: senha, name: `Pol ${sufixo}`, role: 'secretaria',
  });

  it('senha com 3 caracteres → 400', async () => {
    const r = await novo('abc', 'curta');
    assert.equal(r.status, 400);
  });

  it('senha com 13 caracteres → 400', async () => {
    const r = await novo('a'.repeat(13), 'longa');
    assert.equal(r.status, 400);
  });

  it('senha com 4 caracteres (limite mínimo) → 201', async () => {
    const r = await novo('abcd', 'min4');
    assert.equal(r.status, 201);
  });

  it('senha com 12 caracteres (limite máximo) → 201', async () => {
    const r = await novo('a'.repeat(12), 'max12');
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
