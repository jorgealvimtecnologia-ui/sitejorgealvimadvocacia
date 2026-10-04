#!/usr/bin/env node
/**
 * ==============================================================================
 * TESTE DE RESTAURAÇÃO DE BACKUP (em área isolada)
 * ==============================================================================
 * Backup que nunca foi restaurado é só uma esperança. Este teste pega o pacote mais
 * recente (ou o informado), RESTAURA-O numa pasta temporária isolada (nunca toca o
 * banco nem os arquivos de produção) e confere:
 *   1. idade do backup (o cron diário parou?);
 *   2. checksum SHA-256 do pacote (.sha256);
 *   3. extração do pacote;
 *   4. presença do banco leads.db;
 *   5. integridade do banco (PRAGMA integrity_check);
 *   6. tabelas essenciais e pelo menos 1 usuário;
 *   7. cada arquivo contra o MANIFEST.sha256 (corrupção ou adulteração);
 *   8. ausência de segredos em texto puro (AUD-02);
 *   9. documentos (storage/) presentes.
 * E MEDE quanto tempo a restauração leva: dado real para a meta de RTO.
 *
 *   node scripts/backup-restore-test.js [pacote.tar.gz|pasta] [opções]
 *     --max-idade-horas=36   idade máxima aceita do backup (padrão 36 h)
 *     --json                 saída em JSON
 *     --log=ARQUIVO          acrescenta uma linha de resultado ao arquivo
 *     --avisar               se FALHAR, envia e-mail ao titular (precisa de SMTP configurado)
 *
 * Código de saída: 0 = restauração comprovada · 1 = falha (ou nenhum backup encontrado).
 * Agendado no servidor por scripts/setup-backup-cron.sh (todo domingo 04:30).
 * ==============================================================================
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { countBackupDbSecrets } from './backup-scrub-db.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARCHIVE_RE = /^backup_jorgealvim_.*\.tar\.gz$/;
export const REQUIRED_TABLES = ['users', 'clients', 'leads', 'lawsuits', 'audit_logs'];
export const DEFAULT_MAX_AGE_HOURS = 36;
const PUBLIC_KEY_FILE = process.env.BACKUP_PUBLIC_KEY || '/etc/advocacia/backup-public.pem';

function sha256Sync(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}
const NAME_TS = /backup_jorgealvim_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/;

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Data/hora do backup a partir do nome (hora local do servidor, como o backup.sh grava). */
export function backupTimestamp(name) {
  const m = path.basename(name).match(NAME_TS);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

/** Pacote mais recente de uma pasta (pelo nome, que carrega a data), ou null. */
export function latestBackup(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => ARCHIVE_RE.test(f))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Restaura e verifica UM pacote, em área isolada.
 * @returns {{ archive:string, ok:boolean, durationMs:number, checks:{name:string,status:'ok'|'falha'|'aviso',detail:string}[] }}
 */
export function verifyBackup(archive, { now = new Date(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const started = Date.now();
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });

  // 1) idade
  const ts = backupTimestamp(archive);
  if (!ts) {
    add('Idade do backup', 'aviso', 'não foi possível ler a data no nome do arquivo');
  } else {
    const hours = (now.getTime() - ts.getTime()) / 3600000;
    add(
      'Idade do backup',
      hours > maxAgeHours ? 'falha' : 'ok',
      `${hours.toFixed(1)} h (máximo ${maxAgeHours} h)${hours > maxAgeHours ? ' — o backup diário parou de rodar?' : ''}`
    );
  }

  // 2) checksum do pacote
  const shaFile = `${archive}.sha256`;
  if (!fs.existsSync(shaFile)) {
    add('Checksum do pacote', 'aviso', 'arquivo .sha256 ausente');
  } else {
    const esperado = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
    const real = sha256File(archive);
    add(
      'Checksum do pacote',
      esperado === real ? 'ok' : 'falha',
      esperado === real ? 'SHA-256 confere' : 'SHA-256 DIFERENTE: pacote corrompido ou adulterado'
    );
  }

  // 3) extração em área isolada
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-restore-test-'));
  try {
    try {
      execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'pipe' });
    } catch (e) {
      add(
        'Extração do pacote',
        'falha',
        `tar falhou: ${
          String(e.stderr || e.message)
            .trim()
            .split('\n')[0]
        }`
      );
      return { archive, ok: false, durationMs: Date.now() - started, checks };
    }
    const tops = fs.readdirSync(tmp);
    if (tops.length !== 1) {
      add('Extração do pacote', 'falha', `estrutura inesperada (${tops.length} itens na raiz)`);
      return { archive, ok: false, durationMs: Date.now() - started, checks };
    }
    const root = path.join(tmp, tops[0]);
    const files = walk(root);
    add('Extração do pacote', 'ok', `${files.length} arquivo(s) restaurado(s) em área isolada`);

    // 4–6) banco
    const dbFile = path.join(root, 'leads.db');
    if (!fs.existsSync(dbFile)) {
      add('Banco leads.db', 'falha', 'ausente no pacote');
    } else {
      let db;
      try {
        db = new DatabaseSync(dbFile);
        const rows = db.prepare('PRAGMA integrity_check').all();
        const msgs = rows.map((r) => Object.values(r)[0]);
        add(
          'Integridade do banco',
          msgs.length === 1 && msgs[0] === 'ok' ? 'ok' : 'falha',
          msgs.length === 1 && msgs[0] === 'ok'
            ? 'PRAGMA integrity_check = ok'
            : `PRAGMA integrity_check: ${msgs.slice(0, 3).join(' | ')}`
        );
        const tables = new Set(
          db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all()
            .map((r) => r.name)
        );
        const faltam = REQUIRED_TABLES.filter((t) => !tables.has(t));
        add(
          'Tabelas essenciais',
          faltam.length ? 'falha' : 'ok',
          faltam.length
            ? `ausentes: ${faltam.join(', ')}`
            : `${REQUIRED_TABLES.length} tabelas presentes (${tables.size} no total)`
        );
        if (tables.has('users')) {
          const n = db.prepare('SELECT COUNT(*) c FROM users').get().c;
          add(
            'Usuários cadastrados',
            n >= 1 ? 'ok' : 'falha',
            n >= 1 ? `${n} usuário(s)` : 'banco SEM usuários: não dá para entrar no sistema'
          );
        }
      } catch (e) {
        add('Integridade do banco', 'falha', `não foi possível abrir o banco: ${e.message}`);
      } finally {
        try {
          db?.close();
        } catch {
          /* já fechado */
        }
      }
    }

    // 7) manifesto
    const manifest = path.join(root, 'MANIFEST.sha256');
    const hasManifest = fs.existsSync(manifest);
    if (!hasManifest) {
      add(
        'Manifesto de arquivos',
        'aviso',
        'MANIFEST.sha256 ausente (pacote anterior ao teste de restauração): arquivos não puderam ser conferidos um a um'
      );
    } else {
      const bad = [];
      let total = 0;
      for (const line of fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean)) {
        const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
        if (!m) continue;
        total++;
        const f = path.join(root, m[2]);
        if (!fs.existsSync(f)) bad.push(`${m[2]} (ausente)`);
        else if (sha256File(f) !== m[1]) bad.push(`${m[2]} (conteúdo diferente)`);
      }
      add(
        'Manifesto de arquivos',
        bad.length ? 'falha' : 'ok',
        bad.length
          ? `${bad.length} problema(s): ${bad.slice(0, 5).join('; ')}`
          : `${total} arquivo(s) conferidos contra o manifesto`
      );
    }

    // 8) segredos (falha em pacote novo; aviso em pacote antigo)
    const envFiles = files.filter((f) => /^\.env(\.|$)/.test(path.basename(f)));
    let dbSecrets = 0;
    if (fs.existsSync(dbFile)) {
      try {
        dbSecrets = countBackupDbSecrets(dbFile).secrets;
      } catch {
        /* banco ilegível: já reportado */
      }
    }
    const achados = [];
    if (envFiles.length) achados.push(`.env no pacote (${envFiles.map((f) => path.basename(f)).join(', ')})`);
    if (dbSecrets) achados.push(`${dbSecrets} chave(s)/token(s) de API em texto puro no banco`);
    if (!achados.length) add('Sem segredos em texto puro', 'ok', 'nenhum segredo encontrado');
    else
      add(
        'Sem segredos em texto puro',
        hasManifest ? 'falha' : 'aviso',
        `${achados.join('; ')}${hasManifest ? '' : ' — pacote antigo: rode npm run backup:scrub-old'}`
      );

    // 9) documentos
    const docs = files.filter((f) => f.includes(`${path.sep}storage${path.sep}`)).length;
    add(
      'Documentos (storage/)',
      docs ? 'ok' : 'aviso',
      docs ? `${docs} arquivo(s)` : 'nenhum documento no pacote (esperado só se não houver anexos)'
    );

    // 10) cópia externa CIFRADA (AUD-12): existe, confere com o SHA-256 registrado e tem o cabeçalho certo.
    // (A leitura completa só é possível com a chave PRIVADA, que fica com o Dr. Jorge: rode no notebook
    //  `node scripts/backup-cifrar.js verificar <arquivo.enc> --priv=...`.)
    const encFile = `${archive}.enc`;
    const pubConfigurada = fs.existsSync(PUBLIC_KEY_FILE);
    if (!fs.existsSync(encFile)) {
      add(
        'Cópia externa cifrada',
        pubConfigurada ? 'falha' : 'aviso',
        pubConfigurada ? 'a chave pública está configurada, mas este pacote não tem a versão cifrada (.enc)' : 'não configurada (veja AUD-12 em docs/INFRA.md)'
      );
    } else {
      const encShaFile = `${encFile}.sha256`;
      const head = Buffer.alloc(8);
      const fd = fs.openSync(encFile, 'r');
      try { fs.readSync(fd, head, 0, 8, 0); } finally { fs.closeSync(fd); }
      const headerOk = head.toString('latin1') === 'JAWBKP1\0';
      const registrado = fs.existsSync(encShaFile) ? fs.readFileSync(encShaFile, 'utf8').split(/\s+/)[0] : '';
      const real = sha256Sync(encFile);
      if (!headerOk) add('Cópia externa cifrada', 'falha', 'cabeçalho do arquivo .enc inválido');
      else if (!registrado) add('Cópia externa cifrada', 'aviso', 'arquivo .enc sem .sha256');
      else if (registrado !== real) add('Cópia externa cifrada', 'falha', 'o .enc não confere com o SHA-256 registrado (corrompido ou adulterado)');
      else add('Cópia externa cifrada', 'ok', `${(fs.statSync(encFile).size / 1048576).toFixed(1)} MB, íntegra (SHA-256 confere)`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { archive, ok: !checks.some((c) => c.status === 'falha'), durationMs: Date.now() - started, checks };
}

const ICON = { ok: '✓', falha: '✖', aviso: '⚠' };

function formatReport(r) {
  const lines = [
    `Pacote: ${path.basename(r.archive)}`,
    ...r.checks.map((c) => `  ${ICON[c.status]} ${c.name}: ${c.detail}`),
  ];
  lines.push(`Tempo da restauração em área isolada: ${(r.durationMs / 1000).toFixed(1)} s`);
  lines.push(r.ok ? 'RESULTADO: RESTAURAÇÃO COMPROVADA' : 'RESULTADO: FALHA — este backup NÃO é confiável');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(
    args
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, ...v] = a.slice(2).split('=');
        return [k, v.length ? v.join('=') : true];
      })
  );
  const target = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(ROOT_DIR, 'backups'));
  const maxAgeHours = Number(flags['max-idade-horas']) || DEFAULT_MAX_AGE_HOURS;

  const archive = fs.existsSync(target) && fs.statSync(target).isFile() ? target : latestBackup(target);
  let result;
  if (!archive) {
    result = {
      archive: target,
      ok: false,
      durationMs: 0,
      checks: [
        { name: 'Backup encontrado', status: 'falha', detail: `nenhum backup_jorgealvim_*.tar.gz em ${target}` },
      ],
    };
  } else {
    result = verifyBackup(archive, { maxAgeHours });
  }

  const report = formatReport(result);
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`\nTESTE DE RESTAURAÇÃO DE BACKUP\n${report}\n`);

  if (flags.log && flags.log !== true) {
    const falhas = result.checks
      .filter((c) => c.status === 'falha')
      .map((c) => c.name)
      .join(', ');
    fs.appendFileSync(
      path.resolve(flags.log),
      `${new Date().toISOString()} | ${result.ok ? 'OK' : 'FALHA'} | ${path.basename(result.archive)} | ${(result.durationMs / 1000).toFixed(1)}s${falhas ? ` | ${falhas}` : ''}\n`
    );
  }

  if (!result.ok && flags.avisar) {
    // Carrega .env + cofre ANTES de importar o e-mail (ele lê o SMTP ao ser importado).
    const { loadEnvironment } = await import('../src/shared/env-vault.js');
    try {
      loadEnvironment({ dir: ROOT_DIR });
    } catch (e) {
      console.error(`⚠ ambiente não carregado: ${e.message}`);
    }
    const { sendEmail } = await import('../src/shared/email.js');
    const to = process.env.BACKUP_ALERT_TO || process.env.ENV_CHANGE_NOTIFY_TO || 'jorgealvimtecnologia@gmail.com';
    const sent = await sendEmail({
      to,
      subject: `[Jorge Alvim Advocacia] ⚠ FALHA no teste de restauração do backup — ${os.hostname()}`,
      text: `${report}\n\nO backup mais recente NÃO passou no teste de restauração. Corrija antes de depender dele.\nVeja docs/INFRA.md (Backup de dados) e rode: node scripts/backup-restore-test.js\n`,
    });
    console.log(sent.sent ? `✉️  Alerta enviado para ${to}.` : `✉️  Alerta NÃO enviado (${sent.reason || 'erro'}).`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}
