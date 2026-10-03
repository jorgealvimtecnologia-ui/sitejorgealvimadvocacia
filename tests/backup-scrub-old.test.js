/**
 * Limpeza de backups antigos (AUD-02): scripts/backup-scrub-old.js.
 * Monta pacotes "no formato antigo" (com .env.backup, chave TLS e banco com segredos)
 * e confere que o relatório não altera nada e que --aplicar remove os segredos
 * preservando os dados do negócio.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewArchive, reviewFolder } from '../scripts/backup-scrub-old.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canRun = spawnSync('tar', ['--version']).status === 0;
const SEGREDOS = [
  'ASAAS-ANTIGA-111111',
  'META-ANTIGA-222222',
  'SESSAO-ANTIGA-333333',
  'ENV-ANTIGO-444444',
  'TLS-ANTIGA-555555',
];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** Cria um pacote no formato antigo (tudo dentro de uma pasta raiz backup_jorgealvim_*). */
function makeOldArchive(dir, stamp, { comSegredos = true } = {}) {
  const name = `backup_jorgealvim_${stamp}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-old-src-'));
  const root = path.join(work, name);
  fs.mkdirSync(path.join(root, 'storage', 'clients'), { recursive: true });
  fs.mkdirSync(path.join(root, 'nginx', 'ssl'), { recursive: true });
  fs.writeFileSync(path.join(root, 'storage', 'clients', 'doc.txt'), 'documento do cliente');
  fs.writeFileSync(path.join(root, 'nginx', 'ssl', 'fullchain.crt'), 'CERTIFICADO PUBLICO');

  const db = new DatabaseSync(path.join(root, 'leads.db'));
  db.exec(`
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE meta_api_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE auth_sessions (token TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE clients (id TEXT PRIMARY KEY, full_name TEXT);
  `);
  db.prepare('INSERT INTO clients VALUES (?,?)').run('C1', 'Cliente Preservado');
  if (comSegredos) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO system_settings VALUES (?,?,?)').run('asaas_api_key', SEGREDOS[0], now);
    db.prepare('INSERT INTO meta_api_settings VALUES (?,?,?)').run('meta_system_user_token', SEGREDOS[1], now);
    db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(SEGREDOS[2], 'admin', '{}', Date.now() + 1e6);
    fs.writeFileSync(path.join(root, '.env.backup'), `PORT=3000\nASAAS_API_KEY=${SEGREDOS[3]}\n`);
    fs.writeFileSync(path.join(root, 'nginx', 'ssl', 'privkey.pem'), SEGREDOS[4]);
  }
  db.close();

  const archive = path.join(dir, `${name}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', work, name]);
  fs.writeFileSync(`${archive}.sha256`, `${sha(archive)}  ${name}.tar.gz\n`);
  fs.rmSync(work, { recursive: true, force: true });
  return archive;
}

function extract(archive) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-old-out-'));
  execFileSync('tar', ['-xzf', archive, '-C', out]);
  return out;
}

function allBytes(dir) {
  let s = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    s += e.isDirectory() ? allBytes(p) : `\n[[${e.name}]]\n` + fs.readFileSync(p).toString('latin1');
  }
  return s;
}

describe('backup-scrub-old', { skip: !canRun && 'requer o comando tar' }, () => {
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-old-backups-'));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('relatório (sem --aplicar) acusa os segredos e NÃO altera o pacote', () => {
    const a = makeOldArchive(dir, '2026-01-01_03-00-00');
    const antes = sha(a);
    const r = reviewArchive(a, { apply: false });
    assert.equal(r.cleaned, false);
    const texto = r.findings.join(' | ');
    assert.match(texto, /\.env\.backup/);
    assert.match(texto, /privkey\.pem/);
    assert.match(texto, /chave\(s\)\/token\(s\) de API/);
    assert.match(texto, /sessão/);
    assert.equal(sha(a), antes, 'o relatório modificou o pacote');
  });

  it('--aplicar remove os segredos, mantém os dados e regera o checksum', () => {
    const a = makeOldArchive(dir, '2026-01-02_03-00-00');
    const r = reviewArchive(a, { apply: true });
    assert.equal(r.cleaned, true);

    const out = extract(a);
    try {
      const bytes = allBytes(out);
      for (const seg of SEGREDOS) assert.ok(!bytes.includes(seg), `segredo ainda no pacote: ${seg}`);

      const raiz = path.join(out, fs.readdirSync(out)[0]);
      assert.ok(!fs.existsSync(path.join(raiz, '.env.backup')));
      assert.ok(!fs.existsSync(path.join(raiz, 'nginx', 'ssl', 'privkey.pem')));
      assert.ok(fs.existsSync(path.join(raiz, 'nginx', 'ssl', 'fullchain.crt')), 'certificado público deve ficar');
      assert.deepEqual(fs.readFileSync(path.join(raiz, 'env-variaveis.txt'), 'utf8').trim().split('\n'), [
        'ASAAS_API_KEY',
        'PORT',
      ]);
      assert.ok(fs.existsSync(path.join(raiz, 'storage', 'clients', 'doc.txt')));
      const db = new DatabaseSync(path.join(raiz, 'leads.db'));
      assert.equal(db.prepare('SELECT full_name FROM clients').get().full_name, 'Cliente Preservado');
      db.close();
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }

    const [hash, nome] = fs.readFileSync(`${a}.sha256`, 'utf8').trim().split(/\s+/);
    assert.equal(hash, sha(a), 'checksum regerado não confere');
    assert.equal(nome, path.basename(a));
    assert.equal(fs.existsSync(`${a}.novo`), false, 'sobrou arquivo temporário');
    assert.deepEqual(reviewArchive(a, { apply: false }).findings, [], 'depois de limpo ainda acusa segredos');
  });

  it('pacote que já está limpo não é tocado', () => {
    const a = makeOldArchive(dir, '2026-01-03_03-00-00', { comSegredos: false });
    const antes = sha(a);
    const r = reviewArchive(a, { apply: true });
    assert.deepEqual(r.findings, []);
    assert.equal(r.cleaned, false);
    assert.equal(sha(a), antes);
  });

  it('um pacote corrompido vira erro isolado e não derruba os demais', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-old-mix-'));
    try {
      makeOldArchive(pasta, '2026-02-01_03-00-00');
      fs.writeFileSync(path.join(pasta, 'backup_jorgealvim_2026-02-02_03-00-00.tar.gz'), 'isto não é um tar');
      fs.writeFileSync(path.join(pasta, 'outro-arquivo.txt'), 'ignorado');
      const rs = reviewFolder(pasta, { apply: false });
      assert.equal(rs.length, 2);
      assert.equal(rs.filter((r) => r.error).length, 1);
      assert.equal(rs.filter((r) => r.findings.length).length, 1);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('CLI: sem --aplicar só relata (exit 0) e pasta inexistente falha', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-old-cli-'));
    try {
      const a = makeOldArchive(pasta, '2026-03-01_03-00-00');
      const antes = sha(a);
      const ok = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup-scrub-old.js'), pasta]);
      assert.equal(ok.status, 0, ok.stderr.toString());
      assert.match(ok.stdout.toString(), /1 com segredos, 0 limpo/);
      assert.equal(sha(a), antes);
      const ruim = spawnSync(process.execPath, [
        path.join(ROOT, 'scripts', 'backup-scrub-old.js'),
        path.join(pasta, 'nao-existe'),
      ]);
      assert.notEqual(ruim.status, 0);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });
});
