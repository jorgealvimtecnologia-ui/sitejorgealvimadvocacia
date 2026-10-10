/**
 * Backup sem segredos em texto puro (AUD-02).
 * Roda o backup.sh REAL num projeto de mentira com segredos plantados e prova que
 * nenhum deles aparece no pacote final, nem em bytes soltos do banco.
 * Só roda em Linux com bash/tar/sha256sum (é onde o backup roda de verdade: servidor).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scrubBackupDb } from '../scripts/backup-scrub-db.js';
import { SEG, makeFakeProject, readAllBytes } from './helpers/backup-fixture.js';

const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const canRun = process.platform === 'linux' && has('bash') && has('tar') && has('sha256sum');

describe('scrubBackupDb (unidade)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-scrub-test-'));
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('esvazia só segredos, preserva o restante e não deixa o valor em bytes soltos', () => {
    const proj = makeFakeProject();
    try {
      const copia = path.join(tmp, 'copia.db');
      fs.copyFileSync(path.join(proj, 'leads.db'), copia);
      const r = scrubBackupDb(copia);
      assert.equal(r.settingsCleared, 2); // asaas_api_key + meta_system_user_token
      assert.equal(r.ephemeralDeleted, 2); // 1 sessão + 1 link mágico

      const db = new DatabaseSync(copia);
      const get = (t, k) => db.prepare(`SELECT value FROM ${t} WHERE key = ?`).get(k).value;
      assert.equal(get('system_settings', 'asaas_api_key'), '');
      assert.equal(get('meta_api_settings', 'meta_system_user_token'), '');
      assert.equal(get('system_settings', 'asaas_environment'), 'producao'); // não é segredo
      assert.equal(get('system_settings', 'office_pix_key'), 'escritorio@exemplo.com.br'); // chave Pix é pública
      assert.equal(get('meta_api_settings', 'meta_page_id'), '12345');
      assert.equal(db.prepare('SELECT COUNT(*) c FROM auth_sessions').get().c, 0);
      assert.equal(db.prepare('SELECT full_name FROM clients').get().full_name, 'Cliente Preservado');
      db.close();

      const bytes = fs.readFileSync(copia).toString('latin1');
      for (const segredo of [SEG.asaas, SEG.meta, SEG.sessao, SEG.magic]) {
        assert.ok(!bytes.includes(segredo), `segredo ainda recuperável no arquivo: ${segredo}`);
      }
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  it('o banco ORIGINAL nunca é alterado', () => {
    const proj = makeFakeProject();
    try {
      const copia = path.join(tmp, 'copia2.db');
      fs.copyFileSync(path.join(proj, 'leads.db'), copia);
      scrubBackupDb(copia);
      const orig = new DatabaseSync(path.join(proj, 'leads.db'));
      assert.equal(orig.prepare("SELECT value FROM system_settings WHERE key='asaas_api_key'").get().value, SEG.asaas);
      orig.close();
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  it('tolera banco sem as tabelas opcionais', () => {
    const copia = path.join(tmp, 'vazio.db');
    new DatabaseSync(copia).close();
    assert.deepEqual(scrubBackupDb(copia), { settingsCleared: 0, ephemeralDeleted: 0 });
  });
});

describe('backup.sh (integração, Linux)', { skip: !canRun && 'requer Linux com bash, tar e sha256sum' }, () => {
  let proj;
  let extracted;
  let tarball;

  before(() => {
    proj = makeFakeProject();
    execFileSync('bash', ['backup.sh'], { cwd: proj, stdio: 'pipe' });
    const files = fs.readdirSync(path.join(proj, 'backups'));
    tarball = files.find((f) => f.endsWith('.tar.gz'));
    assert.ok(tarball, `nenhum .tar.gz gerado: ${files.join(', ')}`);
    extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-backup-extract-'));
    execFileSync('tar', ['-xzf', path.join(proj, 'backups', tarball), '-C', extracted]);
  });

  after(() => {
    fs.rmSync(proj, { recursive: true, force: true });
    fs.rmSync(extracted, { recursive: true, force: true });
  });

  it('nenhum segredo plantado aparece em qualquer byte do pacote', () => {
    const bytes = readAllBytes(extracted);
    for (const [nome, valor] of Object.entries(SEG)) {
      assert.ok(!bytes.includes(valor), `segredo "${nome}" vazou para o backup`);
    }
  });

  it('não contém .env nem chaves privadas, mas mantém o certificado público', () => {
    const lista = execFileSync('tar', ['-tzf', path.join(proj, 'backups', tarball)]).toString();
    assert.ok(!/\.env(\.|$|\n)/m.test(lista.replace('env-variaveis.txt', '')), `lista do pacote:\n${lista}`);
    assert.ok(!/key|\.pfx|\.p12/i.test(lista.replace(/env-variaveis/g, '')), `chave privada no pacote:\n${lista}`);
    assert.match(lista, /nginx\/ssl\/fullchain\.crt/);
  });

  it('grava só os NOMES das variáveis do .env, sem valores', () => {
    const dir = fs.readdirSync(extracted)[0];
    const nomes = fs
      .readFileSync(path.join(extracted, dir, 'env-variaveis.txt'), 'utf8')
      .trim()
      .split('\n');
    assert.deepEqual(nomes, ['ASAAS_API_KEY', 'PORT', 'SMTP_PASS']);
  });

  it('preserva dados do negócio e documentos de clientes', () => {
    const dir = fs.readdirSync(extracted)[0];
    const db = new DatabaseSync(path.join(extracted, dir, 'leads.db'));
    assert.equal(db.prepare('SELECT full_name FROM clients').get().full_name, 'Cliente Preservado');
    db.close();
    assert.ok(fs.existsSync(path.join(extracted, dir, 'storage', 'clients', 'contrato.txt')));
  });

  it('gera checksum válido e não deixa a pasta temporária em disco', () => {
    const out = spawnSync('sha256sum', ['-c', `${tarball}.sha256`], { cwd: path.join(proj, 'backups') });
    assert.equal(out.status, 0, out.stdout.toString() + out.stderr.toString());
    const sobras = fs
      .readdirSync(path.join(proj, 'backups'))
      .filter((f) => !f.endsWith('.tar.gz') && !f.endsWith('.sha256'));
    assert.deepEqual(sobras, []);
  });

  it('o banco de produção continua intacto depois do backup', () => {
    const db = new DatabaseSync(path.join(proj, 'leads.db'));
    assert.equal(db.prepare("SELECT value FROM system_settings WHERE key='asaas_api_key'").get().value, SEG.asaas);
    db.close();
    assert.ok(fs.existsSync(path.join(proj, '.env')));
  });

  it('se a higienização falhar, o backup aborta e não deixa cópia solta', () => {
    const quebrado = makeFakeProject();
    try {
      fs.writeFileSync(path.join(quebrado, 'scripts', 'backup-scrub-db.js'), 'process.exit(1);');
      const r = spawnSync('bash', ['backup.sh'], { cwd: quebrado });
      assert.notEqual(r.status, 0);
      const itens = fs.existsSync(path.join(quebrado, 'backups')) ? fs.readdirSync(path.join(quebrado, 'backups')) : [];
      assert.deepEqual(itens, [], `restou algo em backups/: ${itens.join(', ')}`);
    } finally {
      fs.rmSync(quebrado, { recursive: true, force: true });
    }
  });
});
