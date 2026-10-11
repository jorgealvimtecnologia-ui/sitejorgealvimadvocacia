#!/usr/bin/env node
/**
 * ==============================================================================
 * LIMPA SEGREDOS DE BACKUPS ANTIGOS (.tar.gz gerados antes da higienização)
 * ==============================================================================
 * Backups feitos antes do AUD-02 levam o .env (.env.backup), chaves privadas TLS e
 * um banco com chaves de API/tokens em texto puro. Esta ferramenta revisa cada
 * backup_jorgealvim_*.tar.gz de uma pasta e, se pedido, regrava o pacote sem isso.
 *
 *   node scripts/backup-scrub-old.js [pasta]            # só RELATA (padrão ./backups)
 *   node scripts/backup-scrub-old.js [pasta] --aplicar  # regrava os pacotes
 *
 * Seguro por padrão: sem --aplicar nada é alterado. Com --aplicar cada pacote novo
 * é conferido antes de substituir o original, e o .sha256 é regerado. Precisa do
 * comando `tar` e de espaço livre para extrair um pacote por vez. Rode também na
 * cópia do HD externo (passe a pasta dele).
 *
 * ATENÇÃO: se alguma cópia antiga já saiu do seu controle (HD perdido, enviado a
 * terceiros), limpar o arquivo NÃO desfaz a exposição: gire (troque) as chaves
 * Asaas, SMTP e Meta e as demais que estavam no .env.
 * ==============================================================================
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scrubBackupDb, countBackupDbSecrets } from './backup-scrub-db.js';

export const ARCHIVE_RE = /^backup_jorgealvim_.*\.tar\.gz$/;
const isEnvFile = (name) => name === '.env' || name.startsWith('.env.');
const isKeyFile = (name) => /key|\.pfx$|\.p12$/i.test(name);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Revisa (e, com apply=true, limpa) UM pacote de backup.
 * @returns {{ archive: string, findings: string[], cleaned: boolean }}
 */
export function reviewArchive(archive, { apply = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-scrub-old-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'pipe' });
    const tops = fs.readdirSync(tmp);
    if (tops.length !== 1) throw new Error(`estrutura inesperada no pacote (${tops.length} itens na raiz)`);
    const root = path.join(tmp, tops[0]);
    const files = walk(root);

    const envFiles = files.filter((f) => isEnvFile(path.basename(f)));
    const keyFiles = files.filter((f) => f.includes(`${path.sep}ssl${path.sep}`) && isKeyFile(path.basename(f)));
    const dbFile = files.find((f) => f === path.join(root, 'leads.db'));
    const db = dbFile ? countBackupDbSecrets(dbFile) : { secrets: 0, ephemeral: 0 };

    const findings = [];
    if (envFiles.length) findings.push(`arquivo(s) .env: ${envFiles.map((f) => path.basename(f)).join(', ')}`);
    if (keyFiles.length) findings.push(`chave(s) privada(s) TLS: ${keyFiles.map((f) => path.basename(f)).join(', ')}`);
    if (db.secrets) findings.push(`${db.secrets} chave(s)/token(s) de API em texto puro no banco`);
    if (db.ephemeral) findings.push(`${db.ephemeral} sessão(ões)/link(s) temporário(s) no banco`);
    if (!findings.length || !apply) return { archive, findings, cleaned: false };

    // Guarda só os NOMES das variáveis (sem valores), como o backup.sh novo faz.
    const envBackup = envFiles.find((f) => path.basename(f) === '.env.backup') || envFiles[0];
    if (envBackup) {
      const names = fs
        .readFileSync(envBackup, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
        .filter(Boolean);
      fs.writeFileSync(path.join(root, 'env-variaveis.txt'), [...new Set(names)].sort().join('\n') + '\n');
    }
    for (const f of [...envFiles, ...keyFiles]) fs.rmSync(f, { force: true });
    if (dbFile) scrubBackupDb(dbFile);

    const novo = `${archive}.novo`;
    execFileSync('tar', ['-czf', novo, '-C', tmp, tops[0]], { stdio: 'pipe' });
    execFileSync('tar', ['-tzf', novo], { stdio: 'pipe' }); // confere que o pacote novo abre
    fs.renameSync(novo, archive);
    fs.writeFileSync(`${archive}.sha256`, `${sha256File(archive)}  ${path.basename(archive)}\n`);
    return { archive, findings, cleaned: true };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Revisa todos os pacotes de uma pasta. */
export function reviewFolder(dir, opts = {}) {
  if (!fs.existsSync(dir)) throw new Error(`Pasta não encontrada: ${dir}`);
  return fs
    .readdirSync(dir)
    .filter((f) => ARCHIVE_RE.test(f))
    .sort()
    .map((f) => {
      try {
        return reviewArchive(path.join(dir, f), opts);
      } catch (e) {
        return { archive: path.join(dir, f), findings: [], cleaned: false, error: e.message };
      }
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes('--aplicar');
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || 'backups');
  let results;
  try {
    results = reviewFolder(dir, { apply });
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
  console.log(`\n${apply ? 'LIMPANDO' : 'REVISÃO (nada será alterado) —'} ${results.length} pacote(s) em ${dir}\n`);
  let sujos = 0,
    limpos = 0,
    erros = 0;
  for (const r of results) {
    const nome = path.basename(r.archive);
    if (r.error) {
      console.log(`  ✖ ${nome}: ${r.error}`);
      erros++;
      continue;
    }
    if (!r.findings.length) {
      console.log(`  ✓ ${nome}: sem segredos`);
      continue;
    }
    sujos++;
    console.log(`  ⚠ ${nome}: ${r.findings.join(' | ')}${r.cleaned ? '  → LIMPO' : ''}`);
    if (r.cleaned) limpos++;
  }
  console.log(`\nResumo: ${sujos} com segredos, ${limpos} limpo(s), ${erros} erro(s).`);
  if (sujos && !apply)
    console.log(
      'Rode de novo com --aplicar para limpar. Antes, leia o aviso sobre girar as chaves no topo deste arquivo.\n'
    );
  process.exit(erros ? 1 : 0);
}
