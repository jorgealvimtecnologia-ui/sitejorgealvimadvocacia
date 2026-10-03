/**
 * Segurança do login Google (verifyGoogleToken e os 4 logins que o usam).
 * Regressão de uma falha crítica: o "token de teste" (mock-google-token:…) era aceito em
 * QUALQUER ambiente, inclusive produção, e permitia entrar como MESTRE sem conta Google.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const TMP_DB = path.join(os.tmpdir(), `jaw-google-sec-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_ALLOWED_AUDIENCES;
delete process.env.ALLOW_MOCK_GOOGLE_TOKEN;

const { app, db } = await import('../server.js');
const { verifyGoogleToken, mockTokensAllowed, allowedAudiences, DEFAULT_GOOGLE_CLIENT_ID } =
  await import('../src/shared/google-auth.js');

after(() => {
  try {
    db?.close?.();
  } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
});

const MOCK = 'mock-google-token:qualquer-id:jorgealvimtecnologia@gmail.com:Atacante';
const quiet =
  (fn) =>
  async (...a) => {
    const w = console.warn;
    console.warn = () => {};
    try {
      return await fn(...a);
    } finally {
      console.warn = w;
    }
  };

/** fetch falso que devolve o que o tokeninfo do Google devolveria e registra as chamadas. */
function fakeFetch(body, { ok = true } = {}) {
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    return { ok, status: ok ? 200 : 400, json: async () => body };
  };
  f.calls = calls;
  return f;
}
const goodBody = (extra = {}) => ({
  aud: DEFAULT_GOOGLE_CLIENT_ID,
  iss: 'https://accounts.google.com',
  email: 'Ana@Exemplo.com',
  email_verified: 'true',
  sub: '123',
  name: 'Ana',
  picture: 'http://x/p.png',
  ...extra,
});
const JWT = 'aaa.bbb.ccc';

describe('token de teste (mock): só em teste', () => {
  it('mockTokensAllowed: produção NUNCA; teste sempre; desenvolvimento só com liberação explícita', () => {
    assert.equal(mockTokensAllowed({ NODE_ENV: 'production' }), false);
    assert.equal(
      mockTokensAllowed({ NODE_ENV: 'production', ALLOW_MOCK_GOOGLE_TOKEN: '1' }),
      false,
      'a liberação não vale em produção'
    );
    assert.equal(mockTokensAllowed({ NODE_ENV: 'test' }), true);
    assert.equal(mockTokensAllowed({ NODE_ENV: 'development' }), false);
    assert.equal(mockTokensAllowed({ NODE_ENV: 'development', ALLOW_MOCK_GOOGLE_TOKEN: '1' }), true);
    assert.equal(mockTokensAllowed({}), false, 'sem NODE_ENV definido: negado por padrão');
    assert.equal(mockTokensAllowed({ ALLOW_MOCK_GOOGLE_TOKEN: '1' }), true, 'sem NODE_ENV e com liberação explícita');
  });

  it(
    'é recusado em produção, sem NODE_ENV e em desenvolvimento; aceito em teste',
    quiet(async () => {
      assert.equal(await verifyGoogleToken(MOCK, { env: { NODE_ENV: 'production' } }), null);
      assert.equal(
        await verifyGoogleToken(MOCK, { env: { NODE_ENV: 'production', ALLOW_MOCK_GOOGLE_TOKEN: '1' } }),
        null
      );
      assert.equal(await verifyGoogleToken(MOCK, { env: {} }), null);
      assert.equal(await verifyGoogleToken(MOCK, { env: { NODE_ENV: 'development' } }), null);
      const ok = await verifyGoogleToken(MOCK, { env: { NODE_ENV: 'test' } });
      assert.equal(ok.email, 'jorgealvimtecnologia@gmail.com');
      assert.equal(ok.email_verified, true);
    })
  );

  it(
    'um token de teste recusado NUNCA cai no caminho oficial (nem faz requisição ao Google)',
    quiet(async () => {
      const f = fakeFetch(goodBody());
      assert.equal(await verifyGoogleToken(MOCK, { env: { NODE_ENV: 'production' }, fetchImpl: f }), null);
      assert.equal(f.calls.length, 0);
    })
  );
});

describe('validação oficial: para quem o token foi emitido, emissor e e-mail verificado', () => {
  const env = { NODE_ENV: 'production' };

  it('token válido do nosso aplicativo: aceito e normalizado', async () => {
    const f = fakeFetch(goodBody());
    const u = await verifyGoogleToken(JWT, { env, fetchImpl: f });
    assert.deepEqual(
      { ...u },
      { sub: '123', email: 'ana@exemplo.com', name: 'Ana', picture: 'http://x/p.png', email_verified: true }
    );
    assert.match(f.calls[0], /tokeninfo\?id_token=/);
  });

  it(
    'token emitido para OUTRO aplicativo (aud diferente) é recusado',
    quiet(async () => {
      assert.equal(
        await verifyGoogleToken(JWT, {
          env,
          fetchImpl: fakeFetch(goodBody({ aud: 'outro-app.apps.googleusercontent.com' })),
        }),
        null
      );
      assert.equal(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ aud: undefined })) }), null);
      assert.equal(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ aud: '' })) }), null);
    })
  );

  it('usa o GOOGLE_CLIENT_ID do ambiente e aceita audiências extras configuradas', async () => {
    const meu = 'meu-id.apps.googleusercontent.com';
    assert.ok(
      await verifyGoogleToken(JWT, {
        env: { ...env, GOOGLE_CLIENT_ID: meu },
        fetchImpl: fakeFetch(goodBody({ aud: meu })),
      })
    );
    assert.equal(
      await verifyGoogleToken(JWT, { env: { ...env, GOOGLE_CLIENT_ID: meu }, fetchImpl: fakeFetch(goodBody()) }),
      null,
      'o id padrão deixa de valer quando outro é configurado'
    );
    assert.ok(
      await verifyGoogleToken(JWT, {
        env: { ...env, GOOGLE_ALLOWED_AUDIENCES: 'a.apps, b.apps' },
        fetchImpl: fakeFetch(goodBody({ aud: 'b.apps' })),
      })
    );
    assert.deepEqual(
      [...allowedAudiences({ GOOGLE_ALLOWED_AUDIENCES: 'a.apps, b.apps' })].sort(),
      [DEFAULT_GOOGLE_CLIENT_ID, 'a.apps', 'b.apps'].sort()
    );
  });

  it(
    'e-mail NÃO verificado é recusado (false, "false", ausente)',
    quiet(async () => {
      for (const v of [false, 'false', undefined, 'FALSE', 0]) {
        assert.equal(
          await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ email_verified: v })) }),
          null,
          `email_verified=${v}`
        );
      }
      assert.ok(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ email_verified: true })) }));
    })
  );

  it(
    'emissor que não é o Google é recusado; sem emissor informado (access token) é aceito',
    quiet(async () => {
      assert.equal(
        await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ iss: 'https://evil.example.com' })) }),
        null
      );
      assert.ok(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ iss: 'accounts.google.com' })) }));
      assert.ok(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ iss: undefined })) }));
    })
  );

  it(
    'sem e-mail ou sem identificador, ou resposta de erro do Google: recusado',
    quiet(async () => {
      assert.equal(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ email: undefined })) }), null);
      assert.equal(await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch(goodBody({ sub: undefined })) }), null);
      assert.equal(
        await verifyGoogleToken(JWT, { env, fetchImpl: fakeFetch({ error: 'invalid_token' }, { ok: false }) }),
        null
      );
    })
  );

  it(
    'falha de rede: recusado, sem lançar erro',
    quiet(async () => {
      assert.equal(
        await verifyGoogleToken(JWT, {
          env,
          fetchImpl: async () => {
            throw new Error('sem rede');
          },
        }),
        null
      );
    })
  );

  it('entrada inválida: recusada', async () => {
    for (const v of [undefined, null, '', 42, {}]) assert.equal(await verifyGoogleToken(v, { env }), null);
  });

  it(
    'access token: valida com tokeninfo e NÃO tem alternativa por /userinfo (que não informa o aud)',
    quiet(async () => {
      const f = fakeFetch({ error: 'x' }, { ok: false });
      assert.equal(await verifyGoogleToken('ya29.token-de-acesso', { env, fetchImpl: f }), null);
      assert.equal(f.calls.length, 1, 'não deve consultar nenhum outro endpoint');
      assert.match(f.calls[0], /tokeninfo\?access_token=/);
      assert.ok(!f.calls.some((c) => /userinfo/.test(c)));
      // com o aud certo, o access token vale
      assert.ok(await verifyGoogleToken('ya29.ok', { env, fetchImpl: fakeFetch(goodBody({ iss: undefined })) }));
    })
  );
});

describe('os 4 logins Google reais recusam o token forjado em produção', () => {
  const ENDPOINTS = [
    ['painel', '/api/auth/google'],
    ['unificado', '/api/auth/unified-google'],
    ['colaborador', '/api/hr/employee/google'],
    ['colaborador (portal)', '/api/hr/portal/auth/google'],
    ['portal do cliente', '/api/client-portal/auth/google'],
  ];

  /** Executa a requisição com NODE_ENV=production (como no servidor Contabo) e restaura em seguida. */
  async function inProduction(fn) {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const warn = console.warn;
    console.warn = () => {};
    try {
      return await fn();
    } finally {
      process.env.NODE_ENV = old;
      console.warn = warn;
    }
  }

  for (const [nome, rota] of ENDPOINTS) {
    it(`${nome} (${rota}): token forjado do e-mail do mestre → recusado, sem sessão`, async () => {
      const r = await inProduction(() =>
        request(app)
          .post(rota)
          .set('X-Forwarded-For', `10.9.${ENDPOINTS.findIndex((e) => e[1] === rota)}.1`)
          .send({ credential: MOCK })
      );
      assert.ok([400, 401, 403].includes(r.status), `${rota} respondeu ${r.status}`);
      assert.ok(!r.body.token && !r.body.success, `${rota} entregou sessão: ${JSON.stringify(r.body).slice(0, 120)}`);
    });
  }

  it('CONTROLE: o mesmo token forjado funciona em ambiente de teste (o portão é o ambiente, não o formato)', async () => {
    assert.equal(process.env.NODE_ENV, 'test');
    const r = await request(app)
      .post('/api/auth/google')
      .set('X-Forwarded-For', '10.9.99.1')
      .send({ credential: MOCK });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'master');
  });

  it('e o acesso que o mestre teria com o token forjado não existe: nenhuma rota sensível abre', async () => {
    const r = await inProduction(() =>
      request(app).post('/api/auth/google').set('X-Forwarded-For', '10.9.98.1').send({ credential: MOCK })
    );
    assert.equal(r.body.token, undefined);
    for (const rota of ['/api/clients', '/api/financial/transactions', '/api/users']) {
      assert.equal((await request(app).get(rota)).status, 401);
    }
  });
});
