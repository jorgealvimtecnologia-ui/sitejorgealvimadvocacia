/**
 * Vigia do .env (src/shared/env-watch.js): toda alteração gera e-mail ao titular,
 * com relatório SÓ com nomes e o cofre CRIPTOGRAFADO — nunca valores em texto puro.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MIN_KEY_LENGTH, encryptEnv, serializeEnv } from '../src/shared/env-vault.js';
import {
  checkEnvChange,
  startEnvWatcher,
  STATE_FILE,
  HISTORY_FILE,
  DEFAULT_NOTIFY_TO,
} from '../src/shared/env-watch.js';

const KEY = 'k'.repeat(MIN_KEY_LENGTH + 8);
const ENV = { ENV_VAULT_KEY: KEY, NODE_ENV: 'production' };
const SEGREDOS = [
  'ASAAS-VALOR-SECRETO-111',
  'SMTP-VALOR-SECRETO-222',
  'NOVO-VALOR-SECRETO-333',
  'TROCADO-VALOR-SECRETO-444',
];
const posix = process.platform !== 'win32';

function mailer({ fail = false } = {}) {
  const sent = [];
  const fn = async (msg) => {
    sent.push(msg);
    return fail ? { sent: false, reason: 'send_failed' } : { sent: true };
  };
  fn.sent = sent;
  return fn;
}
const writeVault = (dir, vars) => fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv(serializeEnv(vars), KEY));
const writePlain = (dir, vars) => fs.writeFileSync(path.join(dir, '.env'), serializeEnv(vars));
const run = (dir, sender, extra = {}) =>
  checkEnvChange({ dir, env: ENV, sender, log: { log() {}, warn() {}, error() {} }, ...extra });
/** Tudo o que sairia por e-mail, em texto: assunto, corpo e anexos de relatório. */
const visibleText = (msg) =>
  [msg.subject, msg.text, ...msg.attachments.filter((a) => a.filename.endsWith('.txt')).map((a) => a.content)].join(
    '\n'
  );

describe('vigia do .env', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-watch-'));
    writePlain(dir, { PORT: '3000', GA_MEASUREMENT_ID: 'G-TESTE' });
    writeVault(dir, { ASAAS_API_KEY: SEGREDOS[0], SMTP_PASS: SEGREDOS[1] });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('primeira execução registra a linha de base e envia o cofre criptografado', async () => {
    const m = mailer();
    const r = await run(dir, m);
    assert.equal(r.status, 'baseline');
    assert.equal(m.sent.length, 1);
    assert.equal(m.sent[0].to, DEFAULT_NOTIFY_TO);
    assert.equal(DEFAULT_NOTIFY_TO, 'jorgealvimtecnologia@gmail.com');
    assert.match(m.sent[0].subject, /Monitoramento do \.env ativado/);
    const nomes = m.sent[0].attachments.map((a) => a.filename);
    assert.ok(
      nomes.some((n) => /^env-alteracao-.*\.txt$/.test(n)),
      nomes.join()
    );
    assert.ok(
      nomes.some((n) => /^env-cofre-.*\.enc$/.test(n)),
      nomes.join()
    );
    assert.ok(fs.existsSync(path.join(dir, STATE_FILE)));
    assert.match(fs.readFileSync(path.join(dir, HISTORY_FILE), 'utf8'), /linha-de-base/);
  });

  it('sem alteração, não envia nada', async () => {
    const m = mailer();
    await run(dir, m);
    const r = await run(dir, m);
    assert.equal(r.status, 'sem-alteracao');
    assert.equal(m.sent.length, 1);
  });

  it('variável adicionada, alterada e removida: relata os NOMES, jamais os valores', async () => {
    const m = mailer();
    await run(dir, m);
    writeVault(dir, { ASAAS_API_KEY: SEGREDOS[3], NOVA_API_KEY: SEGREDOS[2] }); // alterou ASAAS, adicionou NOVA, removeu SMTP_PASS
    writePlain(dir, { PORT: '3000', GA_MEASUREMENT_ID: 'G-TESTE' });
    const r = await run(dir, m);
    assert.equal(r.status, 'notificado');
    assert.deepEqual(
      [r.change.added, r.change.removed, r.change.modified],
      [['NOVA_API_KEY'], ['SMTP_PASS'], ['ASAAS_API_KEY']]
    );
    const texto = visibleText(m.sent[1]);
    assert.match(texto, /Adicionadas \(1\):\n\s+- NOVA_API_KEY \[secreta\]/);
    assert.match(texto, /Removidas \(1\):\n\s+- SMTP_PASS/);
    assert.match(texto, /Alteradas \(1\):\n\s+- ASAAS_API_KEY .*valor alterado/);
    for (const seg of SEGREDOS) assert.ok(!texto.includes(seg), `valor secreto vazou no texto: ${seg}`);
  });

  it('o anexo do cofre é criptografado: nenhum valor secreto em nenhum byte do e-mail', async () => {
    const m = mailer();
    await run(dir, m);
    const tudo = JSON.stringify(m.sent);
    for (const seg of SEGREDOS.slice(0, 2)) assert.ok(!tudo.includes(seg), `vazou: ${seg}`);
    assert.ok(!tudo.includes('ASAAS_API_KEY=')); // nem o formato NOME=valor
    const cofre = m.sent[0].attachments.find((a) => a.filename.endsWith('.enc'));
    assert.ok(cofre.content.startsWith('JAWENV1\n'));
  });

  it('a chave do cofre nunca vai no e-mail', async () => {
    const m = mailer();
    await run(dir, m);
    assert.ok(!JSON.stringify(m.sent).includes(KEY));
  });

  it('arquivo regravado sem mudar variáveis também é avisado', async () => {
    const m = mailer();
    await run(dir, m);
    writeVault(dir, { ASAAS_API_KEY: SEGREDOS[0], SMTP_PASS: SEGREDOS[1] }); // mesmo conteúdo, novo IV
    const r = await run(dir, m);
    assert.equal(r.status, 'notificado');
    assert.match(visibleText(m.sent[1]), /regravados sem mudar nenhuma variável/);
  });

  it('se o e-mail falhar, a alteração fica pendente e é reenviada na próxima varredura', async () => {
    await run(dir, mailer());
    writePlain(dir, { PORT: '3001', GA_MEASUREMENT_ID: 'G-TESTE' });
    const falha = mailer({ fail: true });
    assert.equal((await run(dir, falha)).status, 'falha-envio');
    const ok = mailer();
    const r = await run(dir, ok);
    assert.equal(r.status, 'notificado');
    assert.deepEqual(r.change.modified, ['PORT']);
    assert.equal((await run(dir, ok)).status, 'sem-alteracao');
  });

  it('sem cofre: não anexa .env em texto puro e alerta sobre segredos expostos', async () => {
    fs.rmSync(path.join(dir, '.env.enc'));
    writePlain(dir, { PORT: '3000', ASAAS_API_KEY: SEGREDOS[0] });
    const m = mailer();
    await run(dir, m);
    assert.deepEqual(
      m.sent[0].attachments.map((a) => a.filename.split('.').pop()),
      ['txt']
    );
    const texto = visibleText(m.sent[0]);
    assert.match(texto, /SEGREDOS EM TEXTO PURO/);
    assert.match(texto, /NÃO ativo/);
    assert.ok(!texto.includes(SEGREDOS[0]), 'o valor do segredo vazou no relatório');
    assert.ok(!JSON.stringify(m.sent).includes(SEGREDOS[0]));
  });

  it('destinatário pode ser trocado por ENV_CHANGE_NOTIFY_TO', async () => {
    const m = mailer();
    await run(dir, m, { env: { ...ENV, ENV_CHANGE_NOTIFY_TO: 'outro@exemplo.com' } });
    assert.equal(m.sent[0].to, 'outro@exemplo.com');
  });

  it('cofre sem chave: retorna erro, não derruba o processo e não envia', async () => {
    const m = mailer();
    const r = await run(dir, m, { env: { NODE_ENV: 'production', ENV_VAULT_KEY_FILE: path.join(dir, 'nao-existe') } });
    assert.equal(r.status, 'erro');
    assert.equal(m.sent.length, 0);
  });

  it('o arquivo de estado tem permissão 600 e não guarda valores', { skip: !posix }, async () => {
    await run(dir, mailer());
    const f = path.join(dir, STATE_FILE);
    assert.equal(fs.statSync(f).mode & 0o777, 0o600);
    const conteudo = fs.readFileSync(f, 'utf8');
    for (const seg of SEGREDOS) assert.ok(!conteudo.includes(seg));
    assert.ok(!conteudo.includes('G-TESTE'));
  });

  it('o vigia não inicia em ambiente de teste nem quando desativado', () => {
    assert.equal(startEnvWatcher({ dir, env: { NODE_ENV: 'test' } }), false);
    assert.equal(startEnvWatcher({ dir, env: { NODE_ENV: 'production', ENV_WATCH_DISABLED: '1' } }), false);
  });
});
