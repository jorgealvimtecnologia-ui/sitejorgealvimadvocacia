/**
 * Teste de restauração de backup (AUD-03): scripts/backup-restore-test.js.
 * Gera um backup REAL (backup.sh) num projeto de mentira e prova que o verificador
 * aprova o pacote bom e REPROVA cada tipo de defeito que ele promete detectar.
 * Só roda em Linux com bash/tar/sha256sum (onde o backup roda de verdade).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupTimestamp, latestBackup, verifyBackup } from '../scripts/backup-restore-test.js';
import { ROOT, makeFakeProject } from './helpers/backup-fixture.js';

const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const canRun = process.platform === 'linux' && has('bash') && has('tar') && has('sha256sum');
const CLI = path.join(ROOT, 'scripts', 'backup-restore-test.js');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const status = (r, nome) => r.checks.find((c) => c.name === nome)?.status;
const falhas = (r) => r.checks.filter((c) => c.status === 'falha').map((c) => c.name);

describe('teste de restauração de backup', { skip: !canRun && 'requer Linux com bash, tar e sha256sum' }, () => {
  let proj;
  let goodArchive;
  const work = [];

  const tmp = (prefix) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    work.push(d);
    return d;
  };

  /** Reabre o pacote bom, aplica uma mutação na pasta raiz e regrava (opcionalmente refazendo checksum e manifesto). */
  function variant(mutate, { fixManifest = false, fixSha = true } = {}) {
    const out = tmp('jaw-variant-');
    const ex = tmp('jaw-variant-ex-');
    execFileSync('tar', ['-xzf', goodArchive, '-C', ex]);
    const rootName = fs.readdirSync(ex)[0];
    const root = path.join(ex, rootName);
    mutate(root);
    if (fixManifest) {
      const lines = [];
      const walk = (d) =>
        fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name !== 'MANIFEST.sha256')
            lines.push(`${sha(p)}  ./${path.relative(root, p).split(path.sep).join('/')}`);
        });
      walk(root);
      fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), lines.join('\n') + '\n');
    }
    const archive = path.join(out, `${rootName}.tar.gz`);
    execFileSync('tar', ['-czf', archive, '-C', ex, rootName]);
    if (fixSha) fs.writeFileSync(`${archive}.sha256`, `${sha(archive)}  ${rootName}.tar.gz\n`);
    return archive;
  }

  before(() => {
    proj = makeFakeProject();
    work.push(proj);
    execFileSync('bash', ['backup.sh'], { cwd: proj, stdio: 'pipe' });
    const f = fs.readdirSync(path.join(proj, 'backups')).find((n) => n.endsWith('.tar.gz'));
    goodArchive = path.join(proj, 'backups', f);
  });
  after(() => work.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  it('backup novo e íntegro: restauração comprovada, todos os checks OK', () => {
    const r = verifyBackup(goodArchive);
    assert.equal(r.ok, true, JSON.stringify(r.checks, null, 1));
    assert.deepEqual(falhas(r), []);
    for (const nome of [
      'Idade do backup',
      'Checksum do pacote',
      'Extração do pacote',
      'Integridade do banco',
      'Tabelas essenciais',
      'Usuários cadastrados',
      'Manifesto de arquivos',
      'Sem segredos em texto puro',
      'Documentos (storage/)',
    ]) {
      assert.equal(status(r, nome), 'ok', `${nome}: ${r.checks.find((c) => c.name === nome)?.detail}`);
    }
    assert.ok(r.durationMs >= 0);
  });

  it('não toca no banco nem nos arquivos de produção e não deixa pasta temporária', () => {
    const antes = sha(path.join(proj, 'leads.db'));
    const tmpAntes = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('jaw-restore-test-')).length;
    verifyBackup(goodArchive);
    assert.equal(sha(path.join(proj, 'leads.db')), antes);
    assert.equal(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('jaw-restore-test-')).length, tmpAntes);
  });

  it('documento adulterado depois do backup: o manifesto pega (mesmo com checksum do pacote refeito)', () => {
    const a = variant((root) =>
      fs.writeFileSync(path.join(root, 'storage/clients/contrato.txt'), 'CONTEÚDO ADULTERADO')
    );
    const r = verifyBackup(a);
    assert.equal(r.ok, false);
    assert.deepEqual(falhas(r), ['Manifesto de arquivos']);
    assert.match(r.checks.find((c) => c.name === 'Manifesto de arquivos').detail, /contrato\.txt.*conteúdo diferente/);
  });

  it('arquivo removido do pacote: o manifesto acusa ausência', () => {
    const a = variant((root) => fs.rmSync(path.join(root, 'storage/clients/contrato.txt')));
    const r = verifyBackup(a);
    assert.deepEqual(falhas(r), ['Manifesto de arquivos']);
    assert.match(r.checks.find((c) => c.name === 'Manifesto de arquivos').detail, /ausente/);
  });

  it('checksum do pacote diferente: reprovado', () => {
    const a = variant(() => {}, { fixSha: false });
    fs.writeFileSync(`${a}.sha256`, `${'0'.repeat(64)}  x.tar.gz\n`);
    const r = verifyBackup(a);
    assert.equal(r.ok, false);
    assert.ok(falhas(r).includes('Checksum do pacote'));
  });

  it('sem arquivo .sha256: só um aviso (não reprova)', () => {
    const a = variant(() => {}, { fixSha: false });
    const r = verifyBackup(a);
    assert.equal(status(r, 'Checksum do pacote'), 'aviso');
    assert.equal(r.ok, true);
  });

  it('banco corrompido (com manifesto refeito, para isolar o teste de integridade): reprovado', () => {
    const a = variant(
      (root) => {
        const f = path.join(root, 'leads.db');
        const buf = fs.readFileSync(f);
        fs.writeFileSync(f, Buffer.concat([buf.subarray(0, 100), Buffer.alloc(buf.length - 100, 0xab)]));
      },
      { fixManifest: true }
    );
    const r = verifyBackup(a);
    assert.equal(r.ok, false);
    assert.ok(falhas(r).includes('Integridade do banco'), JSON.stringify(r.checks));
    assert.equal(status(r, 'Manifesto de arquivos'), 'ok');
  });

  it('banco que ABRE normalmente mas está inconsistente (índice diverge da tabela): o integrity_check pega', () => {
    const MARCA = 'VALOR-UNICO-DE-TESTE-0123456789';
    const a = variant(
      (root) => {
        const f = path.join(root, 'leads.db');
        const db = new DatabaseSync(f);
        db.exec('CREATE TABLE integridade (a TEXT UNIQUE)');
        db.prepare('INSERT INTO integridade VALUES (?)').run(MARCA);
        db.close();
        // O valor existe duas vezes no arquivo (tabela e índice): troca só a última cópia (o índice).
        const buf = fs.readFileSync(f);
        const i = buf.lastIndexOf(Buffer.from(MARCA));
        assert.ok(i > 0 && i !== buf.indexOf(Buffer.from(MARCA)), 'não achei as duas cópias do valor no arquivo');
        Buffer.from('X'.repeat(MARCA.length)).copy(buf, i);
        fs.writeFileSync(f, buf);
        // Prova de que o banco ainda abre e responde (não é o caminho de exceção):
        const check = new DatabaseSync(f);
        assert.ok(check.prepare('SELECT COUNT(*) c FROM users').get().c >= 1);
        check.close();
      },
      { fixManifest: true }
    );
    const r = verifyBackup(a);
    const c = r.checks.find((x) => x.name === 'Integridade do banco');
    assert.equal(c.status, 'falha');
    assert.match(c.detail, /integrity_check:/, c.detail);
    assert.ok(!/não foi possível abrir/.test(c.detail), 'deveria vir do integrity_check, não de falha ao abrir');
    assert.equal(r.ok, false);
  });

  it('pacote sem o banco: reprovado', () => {
    const a = variant((root) => fs.rmSync(path.join(root, 'leads.db')), { fixManifest: true });
    const r = verifyBackup(a);
    assert.ok(falhas(r).includes('Banco leads.db'));
  });

  it('banco sem tabela essencial: reprovado', () => {
    const a = variant(
      (root) => {
        const db = new DatabaseSync(path.join(root, 'leads.db'));
        db.exec('DROP TABLE lawsuits');
        db.close();
      },
      { fixManifest: true }
    );
    const r = verifyBackup(a);
    assert.ok(falhas(r).includes('Tabelas essenciais'));
    assert.match(r.checks.find((c) => c.name === 'Tabelas essenciais').detail, /lawsuits/);
  });

  it('banco sem usuários: reprovado (não dá para entrar no sistema restaurado)', () => {
    const a = variant(
      (root) => {
        const db = new DatabaseSync(path.join(root, 'leads.db'));
        db.exec('DELETE FROM users');
        db.close();
      },
      { fixManifest: true }
    );
    const r = verifyBackup(a);
    assert.ok(falhas(r).includes('Usuários cadastrados'));
  });

  it('backup velho demais: reprovado, e aprovado se o limite for ampliado', () => {
    const daqui3dias = new Date(Date.now() + 72 * 3600000);
    const r = verifyBackup(goodArchive, { now: daqui3dias });
    assert.equal(r.ok, false);
    assert.deepEqual(falhas(r), ['Idade do backup']);
    assert.match(r.checks[0].detail, /parou de rodar/);
    assert.equal(verifyBackup(goodArchive, { now: daqui3dias, maxAgeHours: 200 }).ok, true);
  });

  it('pacote ANTIGO sem manifesto: aprovado com aviso (não reprova backups legados)', () => {
    const a = variant((root) => fs.rmSync(path.join(root, 'MANIFEST.sha256')));
    const r = verifyBackup(a);
    assert.equal(r.ok, true);
    assert.equal(status(r, 'Manifesto de arquivos'), 'aviso');
  });

  it('pacote NOVO com .env dentro: reprovado (regressão da AUD-02); antigo: só aviso', () => {
    const novo = variant((root) => fs.writeFileSync(path.join(root, '.env.backup'), 'X=1\n'), { fixManifest: true });
    const rn = verifyBackup(novo);
    assert.ok(falhas(rn).includes('Sem segredos em texto puro'));

    const antigo = variant((root) => {
      fs.writeFileSync(path.join(root, '.env.backup'), 'X=1\n');
      fs.rmSync(path.join(root, 'MANIFEST.sha256'));
    });
    const ra = verifyBackup(antigo);
    assert.equal(status(ra, 'Sem segredos em texto puro'), 'aviso');
    assert.match(ra.checks.find((c) => c.name === 'Sem segredos em texto puro').detail, /backup:scrub-old/);
  });

  it('arquivo que não é um pacote: reprovado sem derrubar o processo', () => {
    const lixo = path.join(tmp('jaw-lixo-'), 'backup_jorgealvim_2026-01-01_03-00-00.tar.gz');
    fs.writeFileSync(lixo, 'isto não é um tar.gz');
    const r = verifyBackup(lixo, { maxAgeHours: 1e9 });
    assert.equal(r.ok, false);
    assert.ok(falhas(r).includes('Extração do pacote'));
  });

  it('backupTimestamp e latestBackup', () => {
    assert.equal(backupTimestamp('backup_jorgealvim_2026-10-03_03-00-05.tar.gz').getHours(), 3);
    assert.equal(backupTimestamp('qualquer.tar.gz'), null);
    const d = tmp('jaw-latest-');
    for (const n of [
      'backup_jorgealvim_2026-01-01_03-00-00.tar.gz',
      'backup_jorgealvim_2026-03-01_03-00-00.tar.gz',
      'backup_jorgealvim_2026-02-01_03-00-00.tar.gz',
      'outro.txt',
    ])
      fs.writeFileSync(path.join(d, n), '');
    assert.equal(path.basename(latestBackup(d)), 'backup_jorgealvim_2026-03-01_03-00-00.tar.gz');
    assert.equal(latestBackup(path.join(d, 'nao-existe')), null);
  });

  it('CLI: pasta com backup bom → exit 0, JSON válido e linha no log', () => {
    const log = path.join(tmp('jaw-cli-'), 'restore-test.log');
    const ok = spawnSync(process.execPath, [CLI, path.join(proj, 'backups'), '--json', `--log=${log}`]);
    assert.equal(ok.status, 0, ok.stderr.toString());
    const j = JSON.parse(ok.stdout.toString());
    assert.equal(j.ok, true);
    assert.match(fs.readFileSync(log, 'utf8'), /\| OK \| backup_jorgealvim_.*\.tar\.gz \| \d+\.\ds\n$/);
  });

  it('CLI: texto legível mostra o tempo da restauração e o veredito', () => {
    const r = spawnSync(process.execPath, [CLI, goodArchive]);
    assert.equal(r.status, 0);
    assert.match(r.stdout.toString(), /Tempo da restauração em área isolada: \d+\.\d s/);
    assert.match(r.stdout.toString(), /RESTAURAÇÃO COMPROVADA/);
  });

  it('CLI: pacote ruim → exit 1 e a falha é registrada no log', () => {
    const ruim = variant((root) => fs.writeFileSync(path.join(root, 'storage/clients/contrato.txt'), 'x'));
    const log = path.join(tmp('jaw-cli-'), 'restore-test.log');
    const r = spawnSync(process.execPath, [CLI, ruim, `--log=${log}`, '--max-idade-horas=100000']);
    assert.equal(r.status, 1);
    assert.match(r.stdout.toString(), /FALHA — este backup NÃO é confiável/);
    assert.match(fs.readFileSync(log, 'utf8'), /\| FALHA \| .* \| Manifesto de arquivos/);
  });

  it('CLI: pasta vazia ou inexistente → exit 1 (cron parado/sem backup também é falha)', () => {
    const vazia = tmp('jaw-vazia-');
    assert.equal(spawnSync(process.execPath, [CLI, vazia]).status, 1);
    assert.equal(spawnSync(process.execPath, [CLI, path.join(vazia, 'nao-existe')]).status, 1);
  });

  it('CLI --avisar: em caso de falha tenta avisar o titular e não derruba o processo sem SMTP', () => {
    const env = { ...process.env };
    for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) delete env[k];
    const r = spawnSync(process.execPath, [CLI, tmp('jaw-vazia-'), '--avisar'], { env });
    assert.equal(r.status, 1);
    assert.match(r.stdout.toString(), /Alerta NÃO enviado \(not_configured\)/);
  });

  it('CLI --avisar: backup bom não envia nada', () => {
    const r = spawnSync(process.execPath, [CLI, goodArchive, '--avisar']);
    assert.equal(r.status, 0);
    assert.ok(!/Alerta/.test(r.stdout.toString()));
  });
});
