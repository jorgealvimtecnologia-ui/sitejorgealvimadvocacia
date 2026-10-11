/**
 * Política de senha (AUD-01): 10 a 64 caracteres.
 * - o login NÃO bloqueia senhas antigas, mas avisa para trocar;
 * - criação/troca de senha segue a política única;
 * - os formulários do front não podem divergir da política (campo com maxlength
 *   menor que o permitido impedia digitar senhas longas).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TMP_DB = path.join(os.tmpdir(), `jaw-pwpolicy-test-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');
const { PASSWORD_MIN, PASSWORD_MAX, validatePassword, outdatedPasswordNotice } = await import('../src/shared/password-policy.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

function seedUser(id, username, plainPassword) {
  const pw = hashPassword(plainPassword);
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, username, pw.hash, pw.salt, `Usuário ${username}`, 'admin', new Date().toISOString());
}

describe('outdatedPasswordNotice (unidade)', () => {
  it('não sinaliza senha que atende à política', () => {
    assert.deepEqual(outdatedPasswordNotice('Cavalo-Bateria-Grampo-2026!'), {});
    assert.deepEqual(outdatedPasswordNotice('a'.repeat(PASSWORD_MIN)), {});
  });

  it('sinaliza senha curta, com mensagem que cita o mínimo', () => {
    const n = outdatedPasswordNotice('curta123');
    assert.equal(n.password_policy_outdated, true);
    assert.match(n.password_policy_message, new RegExp(String(PASSWORD_MIN)));
  });
});

describe('Login com senha antiga (integração)', () => {
  seedUser('USR-PW-OLD', 'usuario_senha_antiga', 'antiga123'); // 9 caracteres: anterior à política
  seedUser('USR-PW-NEW', 'usuario_senha_nova', 'SenhaLonga-2026!');

  it('senha antiga continua entrando e vem com o aviso de troca', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'usuario_senha_antiga', password: 'antiga123' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.success, true);
    assert.equal(r.body.password_policy_outdated, true);
    assert.ok(r.body.password_policy_message);
  });

  it('senha dentro da política entra sem aviso', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'usuario_senha_nova', password: 'SenhaLonga-2026!' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.password_policy_outdated, undefined);
  });

  it('o aviso nunca vaza em login com senha errada', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'usuario_senha_antiga', password: 'errada-errada' });
    assert.notEqual(r.status, 200);
    assert.equal(r.body.password_policy_outdated, undefined);
  });
});

describe('Criação de usuário segue a política (integração)', () => {
  async function masterToken() {
    const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: 'SenhaRealDoMestre#2026' });
    assert.equal(r.status, 200);
    return r.body.token;
  }

  it('recusa senha de 9 caracteres e aceita a de 10', async () => {
    const tok = await masterToken();
    const base = { name: 'Teste Política', role: 'secretaria' };
    const curta = await request(app).post('/api/users').set('Authorization', `Bearer ${tok}`)
      .send({ ...base, username: 'pol_curta', password: 'x'.repeat(PASSWORD_MIN - 1) });
    assert.equal(curta.status, 400, JSON.stringify(curta.body));

    const ok = await request(app).post('/api/users').set('Authorization', `Bearer ${tok}`)
      .send({ ...base, username: 'pol_ok', password: 'x'.repeat(PASSWORD_MIN) });
    assert.ok(ok.status === 200 || ok.status === 201, JSON.stringify(ok.body));
  });
});

describe('Front-end alinhado à política (guarda contra divergência)', () => {
  const PAGES = ['index.html', 'cliente.html', 'painel.html', 'colaborador.html'];

  it('campos de senha com minlength/maxlength usam exatamente a política', () => {
    let checked = 0;
    for (const page of PAGES) {
      const tags = read(page).match(/<input\b[^>]*type="password"[^>]*>/g) || [];
      for (const tag of tags) {
        const min = tag.match(/\bminlength="(\d+)"/);
        const max = tag.match(/\bmaxlength="(\d+)"/);
        if (min) { assert.equal(Number(min[1]), PASSWORD_MIN, `${page}: minlength diverge em ${tag.slice(0, 80)}`); checked++; }
        if (max) { assert.equal(Number(max[1]), PASSWORD_MAX, `${page}: maxlength diverge em ${tag.slice(0, 80)}`); checked++; }
      }
    }
    assert.ok(checked >= 8, `Esperava conferir ao menos 8 atributos, conferiu ${checked}`);
  });

  it('nenhum texto ou validação antiga (4 a 12) sobrou no front', () => {
    const files = [...PAGES, 'public/js/painel/painel-1-app.js'];
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /\b4 a 12\b|entre 4 e 12/, `${f} ainda cita a regra antiga`);
      assert.doesNotMatch(src, /new_password\.length\s*<\s*4\b/, `${f} ainda valida o mínimo antigo`);
    }
  });

  it('validações de tamanho em JavaScript batem com a política', () => {
    for (const f of ['index.html', 'public/js/painel/painel-1-app.js']) {
      const m = read(f).match(/new_password\.length\s*<\s*(\d+)\s*\|\|\s*new_password\.length\s*>\s*(\d+)/);
      assert.ok(m, `${f}: validação de tamanho não encontrada`);
      assert.equal(Number(m[1]), PASSWORD_MIN);
      assert.equal(Number(m[2]), PASSWORD_MAX);
    }
  });

  it('política única valida os limites exatos', () => {
    assert.equal(validatePassword('x'.repeat(PASSWORD_MIN - 1)).ok, false);
    assert.equal(validatePassword('x'.repeat(PASSWORD_MIN)).ok, true);
    assert.equal(validatePassword('x'.repeat(PASSWORD_MAX)).ok, true);
    assert.equal(validatePassword('x'.repeat(PASSWORD_MAX + 1)).ok, false);
  });
});
