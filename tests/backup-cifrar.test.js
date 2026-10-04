/**
 * AUD-12: backup externo CIFRADO com chave pública (a privada fica fora do servidor).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPair, encryptPackage, decryptPackage, sha256File } from '../scripts/backup-cifrar.js';
import { verifyBackup } from '../scripts/backup-restore-test.js';
import { ROOT, makeFakeProject } from './helpers/backup-fixture.js';

const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const canRun = process.platform === 'linux' && has('bash') && has('tar') && has('sha256sum');
const work = [];
const tmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); work.push(d); return d; };
after(() => work.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('cifrar e abrir o pacote', () => {
  let keys, other, dir;
  before(() => {
    dir = tmp('jaw-cifrar-');
    keys = generateKeyPair(path.join(dir, 'k1'), 2048);
    other = generateKeyPair(path.join(dir, 'k2'), 2048);
  });

  for (const [nome, n] of [['vazio', 0], ['pequeno', 100], ['grande', 2 * 1024 * 1024 + 5]]) {
    it(`volta idêntico ao original (${nome})`, async () => {
      const f = path.join(dir, `pacote-${nome}.tar.gz`);
      const plain = crypto.randomBytes(n);
      fs.writeFileSync(f, plain);
      const { out, sha256 } = await encryptPackage(f, fs.readFileSync(keys.pub, 'utf8'));
      assert.equal(sha256, await sha256File(out));
      const back = path.join(dir, `volta-${nome}`);
      await decryptPackage(out, fs.readFileSync(keys.priv, 'utf8'), back);
      assert.ok(fs.readFileSync(back).equals(plain));
    });
  }

  it('o servidor (só com a chave pública) NÃO consegue abrir', async () => {
    const f = path.join(dir, 'so-publica.tar.gz');
    fs.writeFileSync(f, 'dados sigilosos');
    const { out } = await encryptPackage(f, fs.readFileSync(keys.pub, 'utf8'));
    await assert.rejects(() => decryptPackage(out, fs.readFileSync(keys.pub, 'utf8'), null));
    assert.ok(!fs.readFileSync(out).includes('sigilosos'));
  });

  it('chave privada de outro par não abre', async () => {
    const f = path.join(dir, 'par-errado.tar.gz');
    fs.writeFileSync(f, 'x'.repeat(1000));
    const { out } = await encryptPackage(f, fs.readFileSync(keys.pub, 'utf8'));
    await assert.rejects(() => decryptPackage(out, fs.readFileSync(other.priv, 'utf8'), null));
  });

  it('arquivo adulterado é detectado', async () => {
    const f = path.join(dir, 'adulterado.tar.gz');
    fs.writeFileSync(f, crypto.randomBytes(5000));
    const { out } = await encryptPackage(f, fs.readFileSync(keys.pub, 'utf8'));
    const b = fs.readFileSync(out); b[b.length - 100] ^= 0xff; fs.writeFileSync(out, b);
    await assert.rejects(() => decryptPackage(out, fs.readFileSync(keys.priv, 'utf8'), null));
  });

  it('a linha de comando confere o SHA-256 antes de abrir', async () => {
    const f = path.join(dir, 'cli.tar.gz');
    fs.writeFileSync(f, crypto.randomBytes(3000));
    const { out } = await encryptPackage(f, fs.readFileSync(keys.pub, 'utf8'));
    const cli = path.join(ROOT, 'scripts', 'backup-cifrar.js');
    assert.equal(spawnSync('node', [cli, 'verificar', out, `--priv=${keys.priv}`]).status, 0);
    const b = fs.readFileSync(out); b[b.length - 40] ^= 1; fs.writeFileSync(out, b);
    const r = spawnSync('node', [cli, 'verificar', out, `--priv=${keys.priv}`], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /NÃO confere|inválid|Unsupported|bad/i);
  });
});

describe('backup.sh gera a cópia cifrada e o teste de restauração a confere', { skip: !canRun && 'requer Linux com bash, tar e sha256sum' }, () => {
  let proj, keys, archive;
  before(() => {
    proj = makeFakeProject(); work.push(proj);
    keys = generateKeyPair(tmp('jaw-bk-keys-'), 2048);
    execFileSync('bash', ['backup.sh'], { cwd: proj, stdio: 'pipe', env: { ...process.env, BACKUP_PUBLIC_KEY: keys.pub } });
    archive = path.join(proj, 'backups', fs.readdirSync(path.join(proj, 'backups')).find((n) => n.endsWith('.tar.gz')));
  });
  const st = (r) => r.checks.find((c) => c.name === 'Cópia externa cifrada')?.status;

  it('cria o .enc e o .sha256, e a cópia abre com a chave privada e é idêntica ao pacote', async () => {
    assert.ok(fs.existsSync(`${archive}.enc`) && fs.existsSync(`${archive}.enc.sha256`));
    const back = path.join(tmp('jaw-bk-out-'), 'pacote.tar.gz');
    await decryptPackage(`${archive}.enc`, fs.readFileSync(keys.priv, 'utf8'), back);
    assert.ok(fs.readFileSync(back).equals(fs.readFileSync(archive)));
  });
  it('o teste de restauração aprova a cópia cifrada íntegra', () => {
    assert.equal(st(verifyBackup(archive)), 'ok');
  });
  it('e reprova a cópia cifrada corrompida', () => {
    const f = `${archive}.enc`;
    const original = fs.readFileSync(f);
    const b = Buffer.from(original); b[b.length - 30] ^= 0xff; fs.writeFileSync(f, b);
    assert.equal(st(verifyBackup(archive)), 'falha');
    fs.writeFileSync(f, original);
  });
  it('sem chave pública configurada, o backup segue normal e o teste só avisa', () => {
    const p2 = makeFakeProject(); work.push(p2);
    execFileSync('bash', ['backup.sh'], { cwd: p2, stdio: 'pipe', env: { ...process.env, BACKUP_PUBLIC_KEY: '/nao/existe.pem' } });
    const a2 = path.join(p2, 'backups', fs.readdirSync(path.join(p2, 'backups')).find((n) => n.endsWith('.tar.gz')));
    assert.ok(!fs.existsSync(`${a2}.enc`));
    assert.equal(st(verifyBackup(a2)), 'aviso');
  });
});
