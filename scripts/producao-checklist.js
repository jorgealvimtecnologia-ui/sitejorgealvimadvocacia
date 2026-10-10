#!/usr/bin/env node
/**
 * Verificação periódica da PRODUÇÃO (AUD-20). Confere, de fora, o que importa para o site não falhar em silêncio:
 * site no ar e saudável (/health), certificado HTTPS com validade folgada, backup diário recente e testado,
 * backup externo cifrado presente, versão publicada e disco. Reprova (código 1) se algo estiver em estado de perigo.
 *
 *   node scripts/producao-checklist.js --url=https://jorgealvimadvocacia.com.br            (de qualquer lugar; só o que é público)
 *   node scripts/producao-checklist.js --url=... --servidor=/var/www/advocacia             (no servidor: também backups/versão)
 *   node scripts/producao-checklist.js --json
 *
 * Feito para rodar por cron no servidor (semanal) e avisar o titular por e-mail — ver scripts/setup-backup-cron.sh.
 */
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Roda a verificação e devolve { url, ok, checks }. Reutilizável (CLI e testes).
 * @param {{url:string, servidor?:string, certMinDias?:number, backupMaxHoras?:number}} opts
 */
export async function runChecklist({ url, servidor = '', certMinDias = 15, backupMaxHoras = 36 } = {}) {
  const checks = [];
  const add = (nome, estado, detalhe) => checks.push({ nome, estado, detalhe }); // 'ok' | 'aviso' | 'falha'

  function resumoHealth(b) {
    const parado = Object.entries(b.jobs || {}).filter(([, s]) => s === 'stale').map(([j]) => j);
    return [b.db !== 'ok' ? `banco ${b.db}` : null, b.disk !== 'ok' && b.disk !== undefined ? `disco ${b.disk}` : null, parado.length ? `paradas: ${parado.join(', ')}` : null].filter(Boolean).join('; ') || 'ver /health';
  }

  async function httpHealth() {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'JorgeAlvimChecklist/1.0' } });
      let body = {};
      try { body = await res.json(); } catch { /* corpo não-JSON */ }
      if (res.status === 200 && body.status === 'ok') add('Site no ar e saudável', 'ok', `/health respondeu 200 (uptime ${body.uptime_s ?? '?'}s)`);
      else if (res.status === 200 && body.status === 'degraded') add('Site no ar', 'aviso', `/health = "degraded": ${resumoHealth(body)}`);
      else if (res.status === 503) add('Site no ar', 'falha', `/health = 503 (banco fora?): ${resumoHealth(body)}`);
      else add('Site no ar', 'falha', `/health respondeu ${res.status}`);
      if (body && body.disk === 'critical') add('Disco do servidor', 'falha', `${body.disk_free_percent}% livre`);
      else if (body && body.disk === 'low') add('Disco do servidor', 'aviso', `${body.disk_free_percent}% livre`);
      else if (body && body.disk_free_percent != null) add('Disco do servidor', 'ok', `${body.disk_free_percent}% livre`);
      for (const [job, st] of Object.entries(body.jobs || {})) if (st === 'stale') add(`Tarefa automática: ${job}`, 'falha', 'parada (não roda no intervalo esperado)');
    } catch (e) {
      add('Site no ar', 'falha', `não respondeu: ${e.message}`);
    }
  }

  function certValidade() {
    return new Promise((resolve) => {
      let u;
      try { u = new URL(url); } catch { add('Certificado HTTPS', 'aviso', 'URL inválida'); return resolve(); }
      if (u.protocol !== 'https:') { add('Certificado HTTPS', 'aviso', 'URL sem HTTPS — verificação do certificado ignorada'); return resolve(); }
      const host = u.hostname;
      const sock = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
        const cert = sock.getPeerCertificate();
        sock.end();
        if (!cert || !cert.valid_to) { add('Certificado HTTPS', 'aviso', 'não foi possível ler a validade'); return resolve(); }
        const dias = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
        if (dias < 0) add('Certificado HTTPS', 'falha', `VENCIDO há ${-dias} dia(s)`);
        else if (dias <= 5) add('Certificado HTTPS', 'falha', `vence em ${dias} dia(s)`);
        else if (dias <= certMinDias) add('Certificado HTTPS', 'aviso', `vence em ${dias} dia(s)`);
        else add('Certificado HTTPS', 'ok', `válido por mais ${dias} dia(s)`);
        resolve();
      });
      sock.on('error', (e) => { add('Certificado HTTPS', 'falha', `erro TLS: ${e.message}`); resolve(); });
      sock.on('timeout', () => { sock.destroy(); add('Certificado HTTPS', 'aviso', 'tempo esgotado ao conectar'); resolve(); });
    });
  }

  function backupsNoServidor() {
    const dir = path.join(servidor, 'backups');
    if (!fs.existsSync(dir)) { add('Backup diário', 'falha', `pasta ${dir} não existe`); return; }
    const pacotes = fs.readdirSync(dir).filter((f) => /^backup_jorgealvim_.*\.tar\.gz$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!pacotes.length) { add('Backup diário', 'falha', 'nenhum pacote encontrado'); return; }
    const horas = (Date.now() - pacotes[0].t) / 3600000;
    add('Backup diário', horas > backupMaxHoras ? 'falha' : 'ok', `mais recente há ${horas.toFixed(1)}h (${pacotes[0].f})`);
    const temEnc = fs.existsSync(path.join(dir, `${pacotes[0].f}.enc`));
    add('Cópia externa cifrada', temEnc ? 'ok' : 'aviso', temEnc ? 'presente (.enc)' : 'sem .enc (configure a chave pública — AUD-12)');
    const logTeste = path.join(dir, 'restore-test.log');
    if (fs.existsSync(logTeste)) {
      const ult = fs.readFileSync(logTeste, 'utf8').trim().split('\n').pop() || '';
      add('Teste de restauração', /falha|FAIL|✖/i.test(ult) ? 'falha' : 'ok', ult.slice(0, 120) || 'sem registro');
    } else add('Teste de restauração', 'aviso', 'ainda não rodou (domingo 04:30)');
    try {
      const cron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
      const ok = /backup\.sh/.test(cron) && /backup-restore-test/.test(cron);
      add('Agendamentos (cron)', ok ? 'ok' : 'aviso', ok ? 'backup e teste agendados' : 'falta configurar (scripts/setup-backup-cron.sh)');
    } catch { /* sem crontab acessível */ }
  }

  function versaoPublicada() {
    try {
      const git = execSync(`git -C ${JSON.stringify(servidor)} log -1 --format=%h\\ %cd\\ %s --date=short 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (git) add('Versão publicada', 'ok', git.slice(0, 90));
    } catch { /* nem sempre é um checkout git */ }
  }

  await httpHealth();
  await certValidade();
  if (servidor) { backupsNoServidor(); versaoPublicada(); }
  return { url, ok: checks.every((c) => c.estado !== 'falha'), checks };
}

const ICON = { ok: '✓', aviso: '⚠', falha: '✖' };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n, d = '') => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').slice(1).join('=');
  const has = (n) => process.argv.includes(`--${n}`);
  const r = await runChecklist({
    url: arg('url', process.env.PROD_URL || 'https://jorgealvimadvocacia.com.br'),
    servidor: arg('servidor', ''),
    certMinDias: Number(arg('cert-min', '15')),
    backupMaxHoras: Number(arg('backup-max', '36')),
  });
  const falhas = r.checks.filter((c) => c.estado === 'falha');
  const avisos = r.checks.filter((c) => c.estado === 'aviso');
  if (has('json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`\nVerificação de produção — ${r.url}\n`);
    for (const c of r.checks) console.log(`  ${ICON[c.estado]} ${c.nome}: ${c.detalhe}`);
    console.log(falhas.length ? `\n✖ ${falhas.length} problema(s) grave(s)${avisos.length ? ` e ${avisos.length} aviso(s)` : ''}.` : (avisos.length ? `\n⚠ Sem problemas graves, ${avisos.length} aviso(s) a acompanhar.` : '\n✅ Tudo certo na produção.'));
  }
  process.exit(r.ok ? 0 : 1);
}
