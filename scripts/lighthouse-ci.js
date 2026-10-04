#!/usr/bin/env node
/**
 * Lighthouse na CI (AUD-19): sobe o servidor num banco temporário, audita as páginas públicas e reprova se alguma
 * nota ficar abaixo da meta de docs/perf-budget.json (metas_lighthouse). Páginas que não devem aparecer no Google
 * (painel, catálogo) ficam fora da meta de SEO de propósito.
 *
 *   CHROME_PATH=/caminho/do/chrome node scripts/lighthouse-ci.js [--paginas=/,/agendar]
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'perf-budget.json'), 'utf8'));
const METAS = budget.metas_lighthouse || { desempenho: 85, acessibilidade: 95, boas_praticas: 90, seo: 90 };
const SEM_SEO = new Set(['/painel', '/design-system']); // noindex intencional
const arg = process.argv.find((a) => a.startsWith('--paginas='));
const PAGINAS = arg ? arg.slice(10).split(',') : ['/', '/agendar', '/cliente', '/colaborador', '/blog', '/painel'];

const PORT = 3200 + Math.floor(Math.random() * 500);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-ci-'));
// Na CI o Chrome vem do Playwright: se CHROME_PATH não existir, tenta localizar o do @playwright/test.
if (!process.env.CHROME_PATH || !fs.existsSync(process.env.CHROME_PATH)) {
  try {
    const { chromium } = await import('playwright');
    process.env.CHROME_PATH = chromium.executablePath();
  } catch { /* segue; o lighthouse tenta o Chrome do sistema */ }
}

const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'lh.db'), NODE_ENV: 'development', ENV_WATCH_DISABLED: '1', DEADLINE_ALERTS_DISABLED: '1' }, stdio: 'ignore' });

async function aguardar() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return true; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function auditar(p) {
  const out = path.join(tmp, `r${p.replace(/\W/g, '_')}.json`);
  execFileSync(path.join(ROOT, 'node_modules', '.bin', 'lighthouse'), [`http://localhost:${PORT}${p}`, '--output=json', `--output-path=${out}`,
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage', '--preset=desktop', '--quiet'], { stdio: 'ignore', timeout: 180000 });
  const c = JSON.parse(fs.readFileSync(out, 'utf8')).categories;
  const n = (k) => Math.round((c[k]?.score || 0) * 100);
  return { desempenho: n('performance'), acessibilidade: n('accessibility'), boas_praticas: n('best-practices'), seo: n('seo') };
}

let falhas = 0;
try {
  if (!(await aguardar())) throw new Error('servidor não subiu');
  console.log('\nLighthouse (metas: desempenho %d • acessibilidade %d • boas práticas %d • SEO %d)\n', METAS.desempenho, METAS.acessibilidade, METAS.boas_praticas, METAS.seo);
  for (const p of PAGINAS) {
    const r = auditar(p);
    const ruins = Object.entries(METAS).filter(([k, meta]) => !(k === 'seo' && SEM_SEO.has(p)) && r[k] < meta).map(([k, meta]) => `${k} ${r[k]} < ${meta}`);
    console.log(`${ruins.length ? '✖' : '✓'} ${p.padEnd(14)} desempenho ${r.desempenho} • acessib. ${r.acessibilidade} • boas práticas ${r.boas_praticas} • SEO ${r.seo}${ruins.length ? `   ← ${ruins.join(', ')}` : ''}`);
    if (ruins.length) falhas++;
  }
} catch (e) {
  console.error(`✖ ${e.message}`);
  falhas++;
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
