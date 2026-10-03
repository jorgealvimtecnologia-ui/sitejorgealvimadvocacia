/**
 * Guardião do .env (scripts/check-env-exposure.js): o .env nunca fica exposto no
 * GitHub, na imagem Docker nem no servidor. Cobre o modo repositório (git real),
 * o modo servidor, o site ao vivo, o guardião completo, o Express e o deploy.
 */
import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { MIN_KEY_LENGTH, encryptEnv } from '../src/shared/env-vault.js';
import { checkRepo, checkServer, checkUrl, SENSITIVE_URL_PATHS } from '../scripts/check-env-exposure.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'k'.repeat(MIN_KEY_LENGTH + 8);
const posix = process.platform !== 'win32';
const hasBash = spawnSync('sh', ['-c', 'command -v bash']).status === 0;
const git = (cwd, ...a) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, stdio: 'pipe' });

/** Repositório git limpo e válido para as regras do guardião. */
function makeRepo(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-repo-'));
  const files = {
    '.gitignore': 'node_modules\n.env\n.env.*\n!.env.example\n',
    '.dockerignore': 'node_modules\n.env\n.env.*\n!.env.example\n',
    '.env.example': 'PORT=3000\nASAAS_API_KEY=\nSMTP_PASS=\n',
    'server.js': "import './src/config/load-env.js';\nimport express from 'express';\n",
    'backup.sh': '#!/bin/bash\n# cp .env nunca\ncp -r storage dest/\n',
    'nginx/default.conf': 'server {\n  location ~ /\\.(?!well-known) {\n    deny all;\n    return 404;\n  }\n}\n',
    'deploy.sh': '#!/bin/bash\nscp -r src public server:/var/www/\n',
    ...extra,
  };
  git(dir, 'init', '-q');
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  git(dir, 'add', '-A', '-f');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}
const track = (dir, f, content) => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), content);
  git(dir, 'add', '-f', f);
};
const msgs = (r) => r.violations.join('\n');

describe('checkRepo (GitHub, Docker, scripts, nginx)', () => {
  let dir;
  beforeEach(() => {
    dir = makeRepo();
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('repositório correto não tem violações', () => {
    assert.deepEqual(checkRepo(dir).violations, []);
  });

  it('o repositório REAL deste projeto passa', () => {
    assert.deepEqual(checkRepo(ROOT).violations, []);
  });

  it('.env em texto puro versionado é violação (e variantes também)', () => {
    track(dir, '.env', 'ASAAS_API_KEY=abc\n');
    track(dir, 'config/.env.production', 'X=1\n');
    track(dir, 'prod.env', 'X=1\n');
    const m = msgs(checkRepo(dir));
    assert.match(m, /"\.env" está versionado/);
    assert.match(m, /config\/\.env\.production/);
    assert.match(m, /prod\.env/);
  });

  it('.env.enc criptografado versionado é permitido (com aviso sobre a chave)', () => {
    track(dir, '.env.enc', encryptEnv('A_API_KEY=1\n', KEY));
    const r = checkRepo(dir);
    assert.deepEqual(r.violations, []);
    assert.match(r.warnings.join('\n'), /CHAVE do cofre nunca pode entrar/);
  });

  it('.env.enc que na verdade é texto puro é violação (não basta o nome)', () => {
    track(dir, '.env.enc', 'ASAAS_API_KEY=abc\n');
    assert.match(msgs(checkRepo(dir)), /\.env\.enc" está versionado .* TEXTO PURO/);
  });

  it('chave privada ou chave do cofre versionada é violação', () => {
    track(dir, 'nginx/ssl/key.pem', 'x');
    track(dir, 'segredos/env.key', 'x');
    track(dir, 'deploy/id_ed25519', 'x');
    const m = msgs(checkRepo(dir));
    assert.match(m, /key\.pem/);
    assert.match(m, /env\.key/);
    assert.match(m, /id_ed25519/);
  });

  it('.env.example com valor em variável secreta é violação', () => {
    track(dir, '.env.example', 'PORT=3000\nASAAS_API_KEY=valor-real-vazado\n');
    assert.match(msgs(checkRepo(dir)), /\.env\.example tem VALOR preenchido .*ASAAS_API_KEY/);
  });

  it('.gitignore sem .env é violação', () => {
    track(dir, '.gitignore', 'node_modules\n');
    assert.match(msgs(checkRepo(dir)), /\.gitignore precisa conter/);
  });

  it('.dockerignore sem .env é violação (o COPY . . embutiria o .env na imagem)', () => {
    track(dir, '.dockerignore', 'node_modules\n');
    assert.match(msgs(checkRepo(dir)), /\.dockerignore precisa excluir .*imagem/);
  });

  it('script que envia o .env em texto puro é violação; .env.enc, .env.example e comentários não', () => {
    track(dir, 'enviar.sh', '#!/bin/bash\nscp .env server:/var/www/app/.env\n');
    track(dir, 'ok.sh', '#!/bin/bash\n# scp .env comentado\nscp .env.enc server:/x\nscp .env.example server:/y\n');
    track(dir, 'Dockerfile', 'FROM node\nCOPY .env /app/.env\n');
    track(dir, 'win.bat', 'REM scp .env\nrsync -av .env host:/x\n');
    const m = msgs(checkRepo(dir));
    assert.match(m, /enviar\.sh:2/);
    assert.ok(!/ok\.sh/.test(m), 'ok.sh não deveria ser acusado');
    assert.match(m, /Dockerfile:2/);
    assert.match(m, /win\.bat:2/);
  });

  it('scripts que apenas EDITAM o .env no servidor por ssh não são acusados', () => {
    track(dir, 'ativar.sh', 'ssh host "sed -i \'s/^A=.*/A=1/\' /var/www/advocacia/.env"\n');
    assert.deepEqual(checkRepo(dir).violations, []);
  });

  it('nginx sem bloqueio de arquivos ocultos é violação', () => {
    track(dir, 'nginx/default.conf', 'server {\n  location / { proxy_pass http://x; }\n}\n');
    assert.match(msgs(checkRepo(dir)), /nginx\/default\.conf não bloqueia arquivos ocultos/);
  });

  it('backup.sh que copia o .env é violação', () => {
    track(dir, 'backup.sh', '#!/bin/bash\ncp .env "${DEST}/.env.backup"\n');
    assert.match(msgs(checkRepo(dir)), /backup\.sh copia o \.env/);
  });

  it('server.js sem load-env como PRIMEIRO import é violação', () => {
    track(dir, 'server.js', "import express from 'express';\nimport './src/config/load-env.js';\n");
    assert.match(msgs(checkRepo(dir)), /PRIMEIRO import/);
  });
});

describe('guardião completo (check-architecture.js)', () => {
  it('REPROVA (exit 1) um repositório com .env versionado e APROVA o limpo', () => {
    const dir = makeRepo();
    try {
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.mkdirSync(path.join(dir, 'src/shared'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'src/modules'), { recursive: true }); // pastas que o guardião de arquitetura exige
      fs.mkdirSync(path.join(dir, 'public/js/tabs'), { recursive: true });
      for (let i = 1; i <= 10; i++) fs.writeFileSync(path.join(dir, `public/js/tabs/tab-${i}.js`), '');
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      for (const f of ['check-architecture.js', 'check-env-exposure.js'])
        fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
      fs.copyFileSync(path.join(ROOT, 'src/shared/env-vault.js'), path.join(dir, 'src/shared/env-vault.js'));
      const run = () => spawnSync(process.execPath, ['scripts/check-architecture.js'], { cwd: dir });

      const limpo = run();
      assert.equal(limpo.status, 0, limpo.stdout.toString() + limpo.stderr.toString());

      track(dir, '.env', 'ASAAS_API_KEY=abc\n');
      const sujo = run();
      assert.equal(sujo.status, 1);
      assert.match(sujo.stdout.toString(), /\.ENV EXPOSTO.*"\.env" está versionado/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('checkServer (pasta do projeto no Contabo)', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-srv-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = (extra = {}) => ({ ENV_VAULT_KEY_FILE: path.join(os.tmpdir(), `nao-existe-${process.pid}`), ...extra });

  it('.env só com configuração pública + cofre .env.enc: aprovado', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\nGA_MEASUREMENT_ID=G-X\n', { mode: 0o600 });
    fs.writeFileSync(path.join(dir, '.env.enc'), encryptEnv('ASAAS_API_KEY=1\n', KEY), { mode: 0o600 });
    assert.deepEqual(checkServer(dir, { env: env() }).violations, []);
  });

  it('.env com segredo em texto puro: reprovado, e o valor nunca aparece na mensagem', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'ASAAS_API_KEY=VALOR-QUE-NAO-PODE-APARECER\nPORT=3000\n', { mode: 0o600 });
    const m = msgs(checkServer(dir, { env: env() }));
    assert.match(m, /SEGREDOS EM TEXTO PURO: ASAAS_API_KEY/);
    assert.ok(!m.includes('VALOR-QUE-NAO-PODE-APARECER'));
  });

  it('permissão aberta é reprovada, e com --corrigir-permissoes é corrigida', { skip: !posix }, () => {
    const f = path.join(dir, '.env');
    fs.writeFileSync(f, 'PORT=3000\n');
    fs.chmodSync(f, 0o644);
    assert.match(msgs(checkServer(dir, { env: env() })), /legível por outros/);
    const r = checkServer(dir, { env: env(), fix: true });
    assert.deepEqual(r.violations, []);
    assert.equal(fs.statSync(f).mode & 0o777, 0o600);
    assert.ok(r.fixed.length === 1);
  });

  it('cópias soltas do .env (no projeto e em backups/) são reprovadas', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\n', { mode: 0o600 });
    fs.writeFileSync(path.join(dir, '.env.backup'), 'X=1\n');
    fs.mkdirSync(path.join(dir, 'backups/predeploy-1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backups/predeploy-1/.env.bak'), 'X=1\n');
    fs.writeFileSync(path.join(dir, 'backups/.env.old'), 'X=1\n');
    const m = msgs(checkServer(dir, { env: env() }));
    assert.match(m, /Cópia solta do \.env no servidor: \.env\.backup/);
    assert.match(m, /backups\/predeploy-1\/\.env\.bak/);
    assert.match(m, /backups\/\.env\.old/);
  });

  it('a chave do cofre dentro do projeto é reprovada', () => {
    fs.writeFileSync(path.join(dir, 'env.key'), KEY, { mode: 0o600 });
    assert.match(msgs(checkServer(dir, { env: env() })), /Arquivo de chave do cofre dentro do projeto/);
    const dentro = path.join(dir, 'segredos', 'chave.txt');
    assert.match(msgs(checkServer(dir, { env: env({ ENV_VAULT_KEY_FILE: dentro }) })), /DENTRO da pasta do projeto/);
  });

  it('com --backups, pacote antigo que contém o .env é reprovado', { skip: !hasBash }, () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-pk-'));
    try {
      fs.mkdirSync(path.join(work, 'backup_jorgealvim_X'));
      fs.writeFileSync(path.join(work, 'backup_jorgealvim_X', '.env.backup'), 'A=1\n');
      fs.writeFileSync(path.join(work, 'backup_jorgealvim_X', 'env-variaveis.txt'), 'A\n');
      fs.mkdirSync(path.join(dir, 'backups'));
      execFileSync('tar', [
        '-czf',
        path.join(dir, 'backups/backup_jorgealvim_X.tar.gz'),
        '-C',
        work,
        'backup_jorgealvim_X',
      ]);
      assert.deepEqual(checkServer(dir, { env: env() }).violations, [], 'sem --backups não lista pacotes');
      assert.match(msgs(checkServer(dir, { env: env(), backups: true })), /Pacote de backup antigo com o \.env dentro/);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it('pacote novo (só env-variaveis.txt) não é acusado', { skip: !hasBash }, () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-pk-'));
    try {
      fs.mkdirSync(path.join(work, 'backup_jorgealvim_Y'));
      fs.writeFileSync(path.join(work, 'backup_jorgealvim_Y', 'env-variaveis.txt'), 'A\n');
      fs.mkdirSync(path.join(dir, 'backups'));
      execFileSync('tar', [
        '-czf',
        path.join(dir, 'backups/backup_jorgealvim_Y.tar.gz'),
        '-C',
        work,
        'backup_jorgealvim_Y',
      ]);
      assert.deepEqual(checkServer(dir, { env: env(), backups: true }).violations, []);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('checkUrl (site ao vivo)', () => {
  const fake = (statusPorPath) => async (url) => ({ status: statusPorPath(new URL(url).pathname) });

  it('tudo 404/403/301: aprovado', async () => {
    const r = await checkUrl('https://exemplo.com.br/', {
      fetchImpl: fake((p) => ({ '/.env': 404, '/.git/config': 403 })[p] ?? 301),
    });
    assert.deepEqual(r.violations, []);
  });

  it('/.env respondendo 200: reprovado', async () => {
    const r = await checkUrl('https://exemplo.com.br', { fetchImpl: fake((p) => (p === '/.env' ? 200 : 404)) });
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0], /exemplo\.com\.br\/\.env respondeu 200/);
  });

  it('consulta todos os caminhos sensíveis e tolera falha de rede com aviso', async () => {
    const vistos = [];
    const r = await checkUrl('https://x.com', {
      fetchImpl: async (u) => {
        vistos.push(new URL(u).pathname);
        throw new Error('sem rede');
      },
    });
    assert.deepEqual(vistos, SENSITIVE_URL_PATHS);
    assert.equal(r.violations.length, 0);
    assert.equal(r.warnings.length, SENSITIVE_URL_PATHS.length);
  });
});

describe('o Express não serve arquivos ocultos nem de código/dados', () => {
  const TMP_DB = path.join(os.tmpdir(), `jaw-expose-test-${Date.now()}.db`);
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = TMP_DB;
  process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
  let app;
  let db;
  it('carrega o app', async () => {
    ({ app, db } = await import('../server.js'));
  });
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

  for (const p of SENSITIVE_URL_PATHS) {
    it(`GET ${p} não responde 200 com conteúdo do arquivo`, async () => {
      const r = await request(app).get(p);
      const corpo = String(r.text || '');
      const ehArquivoReal = r.status === 200 && !/<html|<!doctype/i.test(corpo);
      assert.ok(!ehArquivoReal, `${p} respondeu ${r.status} com conteúdo de arquivo`);
      assert.ok(!/ASAAS_API_KEY|SMTP_PASS|MASTER_PASSWORD|"scripts"\s*:/.test(corpo), `${p} vazou conteúdo sensível`);
    });
  }
});

describe(
  'deploy-remote.sh recusa deploy com .env exposto',
  { skip: !(posix && hasBash) && 'requer Linux com bash' },
  () => {
    let work;
    let remote;
    let log;

    /** Servidor simulado + systemctl/curl falsos que registram as chamadas. */
    function setup({ envText, mode = 0o600 }) {
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-deploy-'));
      remote = path.join(work, 'advocacia');
      log = path.join(work, 'chamadas.log');
      const bin = path.join(work, 'bin');
      fs.mkdirSync(bin);
      fs.writeFileSync(
        path.join(bin, 'systemctl'),
        `#!/bin/bash\necho "systemctl $*" >> "${log}"\nif [ "$1" = "is-active" ]; then echo active; fi\nexit 0\n`,
        { mode: 0o755 }
      );
      fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/bash\necho 200\n', { mode: 0o755 });
      fs.writeFileSync(path.join(bin, 'chown'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });

      for (const d of [
        'scripts',
        'src/shared',
        'src/config',
        'public',
        'backups/predeploy-1/src',
        'backups/predeploy-1/public',
      ])
        fs.mkdirSync(path.join(remote, d), { recursive: true });
      fs.copyFileSync(
        path.join(ROOT, 'scripts/check-env-exposure.js'),
        path.join(remote, 'scripts/check-env-exposure.js')
      );
      fs.copyFileSync(path.join(ROOT, 'src/shared/env-vault.js'), path.join(remote, 'src/shared/env-vault.js'));
      fs.writeFileSync(path.join(remote, 'package.json'), JSON.stringify({ type: 'module' }));
      fs.writeFileSync(path.join(remote, 'server.js'), 'NOVO');
      fs.writeFileSync(path.join(remote, 'backups/predeploy-1/server.js'), 'ANTIGO');
      fs.writeFileSync(path.join(remote, 'backups/predeploy-1/index.html'), '<html></html>');
      fs.writeFileSync(path.join(remote, 'backups/LAST'), path.join(remote, 'backups/predeploy-1'));
      fs.writeFileSync(path.join(remote, '.env'), envText, { mode });
      fs.chmodSync(path.join(remote, '.env'), mode);
      return bin;
    }
    const deploy = (bin, extraEnv = {}) =>
      spawnSync('bash', [path.join(ROOT, 'scripts/deploy-remote.sh'), remote, 'svc-teste', '3000', 'abc123'], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          ENV_VAULT_KEY_FILE: path.join(work, 'sem-chave'),
          ...extraEnv,
        },
      });
    const chamadas = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
    const out = (r) => r.stdout.toString() + r.stderr.toString();
    afterEach(() => fs.rmSync(work, { recursive: true, force: true }));

    it('segredo em texto puro: RECUSA (exit 4), restaura os arquivos antigos e NÃO reinicia o serviço', () => {
      const bin = setup({ envText: 'PORT=3000\nASAAS_API_KEY=abc123\n' });
      const r = deploy(bin);
      assert.equal(r.status, 4, out(r));
      assert.match(out(r), /DEPLOY RECUSADO/);
      assert.equal(fs.readFileSync(path.join(remote, 'server.js'), 'utf8'), 'ANTIGO');
      assert.ok(!/restart/.test(chamadas()), `o serviço foi reiniciado:\n${chamadas()}`);
    });

    it('.env só com configuração pública: segue e reinicia normalmente', () => {
      const bin = setup({ envText: 'PORT=3000\n' });
      const r = deploy(bin);
      assert.equal(r.status, 0, out(r));
      assert.match(out(r), /DEPLOY OK/);
      assert.match(chamadas(), /restart svc-teste/);
      assert.equal(fs.readFileSync(path.join(remote, 'server.js'), 'utf8'), 'NOVO');
    });

    it('liberação de uso único (arquivo-bandeira): deploya, avisa para migrar e apaga a bandeira', () => {
      const bin = setup({ envText: 'ASAAS_API_KEY=abc123\n' });
      fs.writeFileSync(path.join(remote, '.deploy-permite-env-texto-puro'), '');
      const r = deploy(bin);
      assert.equal(r.status, 0, out(r));
      assert.match(out(r), /LIBERADO \(uso único\)/);
      assert.match(out(r), /env-vault\.js migrate/);
      assert.equal(
        fs.existsSync(path.join(remote, '.deploy-permite-env-texto-puro')),
        false,
        'a bandeira deve ser consumida'
      );
      // a próxima tentativa, sem bandeira, é recusada de novo
      const r2 = deploy(bin);
      assert.equal(r2.status, 4, out(r2));
    });

    it('permissão aberta no .env é corrigida automaticamente e não impede o deploy', () => {
      const bin = setup({ envText: 'PORT=3000\n', mode: 0o644 });
      const r = deploy(bin);
      assert.equal(r.status, 0, out(r));
      assert.equal(fs.statSync(path.join(remote, '.env')).mode & 0o777, 0o600);
    });

    it('cópia solta do .env no servidor: recusa', () => {
      const bin = setup({ envText: 'PORT=3000\n' });
      fs.writeFileSync(path.join(remote, '.env.backup'), 'X=1\n');
      const r = deploy(bin);
      assert.equal(r.status, 4, out(r));
      assert.match(out(r), /Cópia solta do \.env/);
    });
  }
);
