#!/usr/bin/env node
/**
 * ==============================================================================
 * GUARDIÃO DO .env — o .env nunca fica exposto (GitHub, imagem Docker, servidor)
 * ==============================================================================
 * Regra do projeto: segredos do .env NÃO ficam em texto puro no GitHub nem no
 * servidor Contabo. Se o .env precisa existir lá, os segredos ficam CRIPTOGRAFADOS
 * em .env.enc (ver scripts/env-vault.js). Este verificador falha (exit 1) quando:
 *
 *  MODO REPOSITÓRIO (roda no guardião, no `npm test` e na CI):
 *   - um .env (ou variante) em texto puro está versionado no git;
 *   - uma chave privada / chave do cofre está versionada;
 *   - o .gitignore não protege o .env, ou o .dockerignore deixaria o .env entrar na imagem;
 *   - um script envia o .env em texto puro (scp/rsync/docker cp...);
 *   - o nginx do repositório não bloqueia arquivos ocultos (/.env pela web);
 *   - o backup.sh volta a copiar o .env;
 *   - o server.js deixa de carregar o ambiente (load-env) como PRIMEIRO import.
 *
 *  MODO SERVIDOR (--servidor=DIR; roda no deploy, no Contabo):
 *   - o .env tem segredos em texto puro;
 *   - .env / .env.enc legíveis por outros usuários (corrigível: --corrigir-permissoes);
 *   - a chave do cofre está dentro da pasta do projeto (deve ficar fora);
 *   - há cópias soltas do .env (.env.backup, .env.bak...) no projeto ou em backups/;
 *   - (--backups) pacotes de backup antigos que contêm o .env.
 *
 * Uso:  node scripts/check-env-exposure.js [--repo] [--servidor=DIR] [--backups] [--corrigir-permissoes] [--url=https://site]
 *   --url: bate no site AO VIVO e falha se /.env, /.git/config, /leads.db etc. responderem 200.
 * ==============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_KEY_FILE, findPlainSecrets, isVaultContent } from '../src/shared/env-vault.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '🚨 [.ENV EXPOSTO]';

const ENV_NAME_RE = /^\.env(\..+)?$|\.env$/;
const ALLOWED_ENV_FILES = new Set(['.env.example']);
const AUX_ENV_FILES = new Set([
  '.env',
  '.env.enc',
  '.env.example',
  '.env.estado.json',
  '.env.historico.log',
  '.env.enc.novo',
  '.env.novo',
]);
const KEY_FILE_RE = /(^|\/)(env\.key|[^/]*\.(key|pem|pfx|p12)|id_(rsa|dsa|ecdsa|ed25519))$/i;
const TRANSFER_RE = /\b(scp|rsync|docker\s+cp|aws\s+s3\s+(cp|sync)|gsutil\s+cp|curl\b[^\n]*\s-T)\b/;

const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');

function listTracked(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    }).toString();
    return out.split('\0').filter(Boolean);
  } catch {
    return null; // não é repositório git (ou git indisponível)
  }
}

/** Verificações sobre o repositório. @returns {{violations:string[], warnings:string[]}} */
export function checkRepo(root = ROOT_DIR) {
  const violations = [];
  const warnings = [];
  const tracked = listTracked(root);
  const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null);

  if (tracked === null) {
    warnings.push(
      '⚠️  [.ENV] Não foi possível listar os arquivos versionados (git indisponível): verificação do GitHub foi pulada.'
    );
  } else {
    for (const f of tracked) {
      const base = path.posix.basename(f);
      if (ENV_NAME_RE.test(base) && !ALLOWED_ENV_FILES.has(base) && fs.existsSync(path.join(root, f))) {
        const content = fs.readFileSync(path.join(root, f), 'utf8');
        if (isVaultContent(content)) {
          warnings.push(
            `⚠️  [.ENV] Cofre criptografado versionado em ${f}: permitido, mas a CHAVE do cofre nunca pode entrar no repositório.`
          );
        } else {
          violations.push(
            `${TAG} "${f}" está versionado no git em TEXTO PURO. Remova com "git rm --cached ${f}", GIRE todas as chaves que estavam nele (já podem ter vazado) e, se precisar versioná-lo, criptografe com scripts/env-vault.js.`
          );
        }
      }
      if (KEY_FILE_RE.test(f)) {
        violations.push(
          `${TAG} Chave privada/credencial versionada no git: "${f}". Remova do repositório e gire a chave.`
        );
      }
    }
    const example = tracked.includes('.env.example') ? read('.env.example') : null;
    if (example) {
      const preenchidos = findPlainSecrets(example);
      if (preenchidos.length)
        violations.push(
          `${TAG} .env.example tem VALOR preenchido em variável secreta (${preenchidos.join(', ')}). O exemplo deve ter só os nomes.`
        );
    }
  }

  const gitignore = read('.gitignore') || '';
  if (!/^\s*\.env\s*$/m.test(gitignore) || !/^\s*\.env\.\*\s*$/m.test(gitignore)) {
    violations.push(
      `${TAG} .gitignore precisa conter as linhas ".env" e ".env.*" (com "!.env.example") para o .env nunca ser versionado.`
    );
  }

  const dockerignore = read('.dockerignore') || '';
  if (!/^\s*\.env(\.\*|\*)\s*$/m.test(dockerignore)) {
    violations.push(
      `${TAG} .dockerignore precisa excluir ".env.*" (com "!.env.example"): sem isso o "COPY . ." do Dockerfile embute o .env dentro da imagem.`
    );
  }

  // Scripts que enviam o .env em texto puro.
  const scriptFiles = (tracked || []).filter(
    (f) => /\.(sh|bat|cmd|ps1|ya?ml)$/i.test(f) || /(^|\/)Dockerfile$/.test(f)
  );
  for (const f of scriptFiles) {
    const lines = (read(f) || '').split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/^\s*(#|REM\b|::)/i, '\u0000');
      if (code.startsWith('\u0000')) return; // comentário
      const envRef = /(^|[\s"'/\\:])\.env(?![.\w-])/.test(line);
      const dockerCopyEnv = /^\s*(COPY|ADD)\b/i.test(line) && /(^|\s)\.env(?![.\w-])/.test(line);
      if ((TRANSFER_RE.test(line) && envRef) || dockerCopyEnv) {
        violations.push(
          `${TAG} ${f}:${i + 1} envia o .env em TEXTO PURO. Use o cofre criptografado (.env.enc) ou configure o segredo direto no servidor.`
        );
      }
    });
  }

  // nginx do repositório: arquivos ocultos (.env, .git) nunca podem ser servidos.
  const nginx = read('nginx/default.conf');
  if (nginx !== null && !/location\s+~\s+\/\\\.[^{]*\{[^}]*deny\s+all/s.test(nginx)) {
    violations.push(
      `${TAG} nginx/default.conf não bloqueia arquivos ocultos. Acrescente: location ~ /\\.(?!well-known) { deny all; return 404; } (e faça o mesmo no nginx do servidor Contabo).`
    );
  }

  // backup.sh não pode voltar a copiar o .env.
  const backup = read('backup.sh');
  if (backup !== null && backup.split('\n').some((l) => !/^\s*#/.test(l) && /\bcp\b[^\n]*\.env\b(?![.\w-])/.test(l))) {
    violations.push(`${TAG} backup.sh copia o .env para o pacote de backup. O backup nunca leva segredos (AUD-02).`);
  }

  // server.js: o ambiente precisa carregar antes de qualquer outro módulo.
  const server = read('server.js');
  if (server !== null) {
    const first = server.split('\n').find((l) => l.startsWith('import '));
    if (!first || !/import '\.\/src\/config\/load-env\.js'/.test(first)) {
      violations.push(
        `${TAG} server.js deve ter "import './src/config/load-env.js'" como PRIMEIRO import (carrega .env e o cofre antes dos demais módulos).`
      );
    }
  }
  return { violations, warnings };
}

function modeOf(file) {
  return fs.statSync(file).mode & 0o777;
}

/** Verificações no servidor (pasta do projeto em produção). */
export function checkServer(
  dir,
  { fix = false, backups = false, env = process.env, platform = process.platform } = {}
) {
  const violations = [];
  const warnings = [];
  const fixed = [];
  if (!fs.existsSync(dir)) return { violations: [`${TAG} Pasta do servidor não encontrada: ${dir}`], warnings, fixed };

  const plainFile = path.join(dir, '.env');
  if (fs.existsSync(plainFile)) {
    const secrets = findPlainSecrets(fs.readFileSync(plainFile, 'utf8'));
    if (secrets.length) {
      violations.push(
        `${TAG} O .env do servidor tem SEGREDOS EM TEXTO PURO: ${secrets.join(', ')}. Migre para o cofre criptografado: node scripts/env-vault.js migrate --gerar-chave`
      );
    }
  }

  if (platform !== 'win32') {
    for (const name of ['.env', '.env.enc', '.env.estado.json', '.env.historico.log']) {
      const f = path.join(dir, name);
      if (fs.existsSync(f) && modeOf(f) & 0o077) {
        if (fix) {
          fs.chmodSync(f, 0o600);
          fixed.push(`${name}: permissão corrigida de ${modeOf(f).toString(8)}... para 600`);
        } else {
          violations.push(
            `${TAG} ${name} legível por outros usuários (permissão ${modeOf(f).toString(8)}). Corrija: chmod 600 ${f}`
          );
        }
      }
    }
  }

  // A chave do cofre não pode ficar dentro do projeto (iria junto com backups e cópias).
  const keyFile = env.ENV_VAULT_KEY_FILE || DEFAULT_KEY_FILE;
  const resolvedKey = path.resolve(keyFile);
  if (resolvedKey.startsWith(path.resolve(dir) + path.sep)) {
    violations.push(
      `${TAG} A chave do cofre (${keyFile}) está DENTRO da pasta do projeto. Mantenha fora (padrão ${DEFAULT_KEY_FILE}).`
    );
  }
  for (const f of fs.readdirSync(dir)) {
    if (/^env\.key$|\.env\.key$/i.test(f))
      violations.push(`${TAG} Arquivo de chave do cofre dentro do projeto: ${f}. Mova para fora da pasta.`);
  }
  if (fs.existsSync(resolvedKey) && platform !== 'win32' && modeOf(resolvedKey) & 0o077) {
    violations.push(`${TAG} A chave do cofre (${keyFile}) está legível por outros. Corrija: chmod 600 ${keyFile}`);
  }

  // Cópias soltas do .env no projeto e em backups/ (até 3 níveis).
  const stray = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < 3 && !['node_modules', '.git', 'storage'].includes(e.name)) walk(p, depth + 1);
      } else if (/^\.env/.test(e.name) && !AUX_ENV_FILES.has(e.name)) {
        stray.push(rel(dir, p));
      } else if (/^env[-.]?backup|\.env\.(bak|old|orig|save)$|\.env~$/i.test(e.name)) {
        stray.push(rel(dir, p));
      }
    }
  };
  walk(dir, 0);
  for (const s of stray)
    violations.push(
      `${TAG} Cópia solta do .env no servidor: ${s}. Apague (e gire as chaves se ela já foi copiada para fora).`
    );

  if (backups) {
    const bdir = path.join(dir, 'backups');
    if (fs.existsSync(bdir)) {
      for (const f of fs.readdirSync(bdir).filter((n) => /^backup_jorgealvim_.*\.tar\.gz$/.test(n))) {
        try {
          const list = execFileSync('tar', ['-tzf', path.join(bdir, f)], { maxBuffer: 256 * 1024 * 1024 }).toString();
          if (/(^|\/)\.env(\.[^/\n]*)?$/m.test(list.replace(/env-variaveis\.txt/g, ''))) {
            violations.push(
              `${TAG} Pacote de backup antigo com o .env dentro: backups/${f}. Rode: node scripts/backup-scrub-old.js backups --aplicar`
            );
          }
        } catch (e) {
          warnings.push(`⚠️  [.ENV] Não consegui listar backups/${f}: ${e.message.split('\n')[0]}`);
        }
      }
    }
  }
  return { violations, warnings, fixed };
}

/** Caminhos que NUNCA podem responder 200 num site público. */
export const SENSITIVE_URL_PATHS = [
  '/.env',
  '/.env.enc',
  '/.env.backup',
  '/.env.estado.json',
  '/.git/config',
  '/.git/HEAD',
  '/leads.db',
  '/server.js',
  '/package.json',
  '/backups/',
  '/storage/',
];

/**
 * Confere o site AO VIVO (ex.: o servidor Contabo): nenhum caminho sensível pode
 * responder 200. Redirecionamentos (301/302) e erros (403/404) são aceitos.
 */
export async function checkUrl(baseUrl, { fetchImpl = fetch, paths = SENSITIVE_URL_PATHS } = {}) {
  const violations = [];
  const warnings = [];
  const base = String(baseUrl).replace(/\/+$/, '');
  for (const p of paths) {
    try {
      const res = await fetchImpl(base + p, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (res.status === 200)
        violations.push(
          `${TAG} ${base}${p} respondeu 200: o arquivo está acessível pela internet. Bloqueie no nginx (location ~ /\\.(?!well-known) { deny all; }) e gire as chaves.`
        );
    } catch (e) {
      warnings.push(`⚠️  [.ENV] Não consegui consultar ${base}${p}: ${e.message}`);
    }
  }
  return { violations, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  const serverArg = flag('servidor');
  const urlArg = flag('url');
  const doRepo = !!flag('repo') || (!serverArg && !urlArg);
  const results = [];
  if (doRepo) results.push(['repositório', checkRepo(ROOT_DIR)]);
  if (serverArg) {
    const dir = path.resolve(serverArg.includes('=') ? serverArg.split('=').slice(1).join('=') : ROOT_DIR);
    results.push([
      `servidor (${dir})`,
      checkServer(dir, { fix: !!flag('corrigir-permissoes'), backups: !!flag('backups') }),
    ]);
  }
  if (urlArg) {
    const url = urlArg.split('=').slice(1).join('=');
    results.push([`site ao vivo (${url})`, await checkUrl(url)]);
  }
  let bad = 0;
  for (const [nome, r] of results) {
    console.log(`\nGuardião do .env — ${nome}`);
    (r.fixed || []).forEach((f) => console.log(`  🔧 ${f}`));
    r.warnings.forEach((w) => console.log(`  ${w}`));
    if (r.violations.length) {
      r.violations.forEach((v) => console.log(`  ${v}`));
      bad += r.violations.length;
    } else {
      console.log('  ✅ nenhuma exposição encontrada');
    }
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}
