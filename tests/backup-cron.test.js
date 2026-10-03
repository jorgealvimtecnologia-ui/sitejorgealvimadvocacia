/**
 * Agendamento do backup e do teste de restauração (scripts/setup-backup-cron.sh).
 * Usa um `crontab` de mentira (arquivo) e uma pasta de projeto temporária: nada do
 * cron nem de /var/www é tocado.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canRun = process.platform === 'linux' && spawnSync('sh', ['-c', 'command -v bash']).status === 0;

describe('setup-backup-cron.sh', { skip: !canRun && 'requer Linux com bash' }, () => {
  let work;
  let proj;
  let store;
  let bin;

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-cron-'));
    proj = path.join(work, 'advocacia');
    store = path.join(work, 'crontab.txt');
    bin = path.join(work, 'bin');
    fs.mkdirSync(proj);
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(proj, 'backup.sh'), '#!/bin/bash\n');
    // Como o crontab real: só grava depois de receber TODA a entrada (senão o pipe trunca o arquivo antes de lê-lo).
    fs.writeFileSync(
      path.join(bin, 'crontab'),
      `#!/bin/bash\nif [ "$1" = "-l" ]; then [ -f "${store}" ] && cat "${store}" || exit 1; else data="$(cat)"; printf '%s\\n' "$data" > "${store}"; fi\n`,
      { mode: 0o755 }
    );
  });
  afterEach(() => fs.rmSync(work, { recursive: true, force: true }));

  const run = () =>
    spawnSync('bash', [path.join(ROOT, 'scripts/setup-backup-cron.sh')], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PROJ: proj },
    });
  const lines = () => fs.readFileSync(store, 'utf8').split('\n').filter(Boolean);

  it('agenda o backup diário (03:00) e o teste de restauração semanal (domingo 04:30)', () => {
    const r = run();
    assert.equal(r.status, 0, r.stderr.toString());
    const l = lines();
    assert.equal(l.length, 2);
    assert.match(
      l.find((x) => x.includes('backup.sh')),
      /^0 3 \* \* \* cd .*backup\.sh/
    );
    const verify = l.find((x) => x.includes('backup-restore-test.js'));
    assert.match(verify, /^30 4 \* \* 0 cd /);
    assert.match(verify, /--avisar/);
    assert.match(verify, /--log=backups\/restore-test\.log/);
    assert.match(
      verify,
      /&& \/\S+\/node scripts\/backup-restore-test\.js/,
      `deve usar o caminho absoluto do node (o PATH do cron é mínimo): ${verify}`
    );
  });

  it('servidor SEM crontab algum (crontab -l falha): agenda as duas rotinas (bug antigo: perdia o agendamento em silêncio)', () => {
    assert.equal(fs.existsSync(store), false);
    const r = run();
    assert.equal(r.status, 0, r.stderr.toString());
    assert.equal(lines().length, 2);
    assert.ok(
      lines().some((l) => l.includes('backup.sh')),
      'o backup diário não foi agendado'
    );
  });

  it('é idempotente: rodar de novo não duplica nada', () => {
    run();
    const r = run();
    assert.equal(r.status, 0);
    assert.equal(lines().length, 2);
    assert.match(r.stdout.toString(), /já estava configurado/);
  });

  it('se só o backup diário existia, acrescenta apenas o teste de restauração e preserva outras linhas', () => {
    fs.writeFileSync(store, `0 1 * * * echo outra-tarefa\n0 3 * * * cd ${proj} && /bin/bash backup.sh\n`);
    run();
    const l = lines();
    assert.equal(l.length, 3);
    assert.ok(l.includes('0 1 * * * echo outra-tarefa'));
    assert.equal(l.filter((x) => x.includes('backup.sh')).length, 1);
    assert.equal(l.filter((x) => x.includes('backup-restore-test.js')).length, 1);
  });
});
