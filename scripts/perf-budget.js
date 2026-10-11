#!/usr/bin/env node
/**
 * Orçamento de peso por página (AUD-19) — mede o que o visitante baixa de NOSSO servidor (HTML + CSS/JS locais,
 * comprimidos em gzip, como na rede) e reprova se passar do orçamento de docs/perf-budget.json.
 * O orçamento nasce da medição atual + folga pequena ("catraca"): a página pode melhorar, não pode engordar.
 *
 *   node scripts/perf-budget.js              confere (usado na CI e em npm test)
 *   node scripts/perf-budget.js --atualizar  regrava o orçamento com a medição atual (decisão consciente, vai no commit)
 *
 * Fora da conta: scripts e fontes de terceiros (Google Fonts, Chart.js, Google Identity), que não passam pelo nosso servidor.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGES = {
  '/': 'index.html', '/painel': 'painel.html', '/cliente': 'cliente.html', '/colaborador': 'colaborador.html',
  '/blog': 'blog.html', '/amazon': 'amazon-colaborador.html', '/agendar': 'agendar.html', '/design-system': 'design-system.html',
};
export const BUDGET_FILE = path.join(ROOT, 'docs', 'perf-budget.json');
const SLACK = 1.05; // 5% de folga sobre a medição ao gravar o orçamento
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const kb = (n) => Math.round((n / 1024) * 10) / 10;

/** Arquivo local de uma URL do HTML (/js/x.js -> public/js/x.js), ou null se for de terceiros/inexistente. */
export function localFile(url, root = ROOT) {
  const clean = String(url).split('?')[0].split('#')[0];
  if (/^(https?:)?\/\//.test(clean) || clean.startsWith('data:')) return null;
  const rel = clean.replace(/^\.\//, '/').replace(/^\//, '');
  const candidates = [rel, `public/${rel}`, rel.replace(/^js\//, 'public/js/')];
  for (const c of candidates) {
    const f = path.join(root, c);
    if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

export function measurePage(file, root = ROOT) {
  const html = fs.readFileSync(path.join(root, file));
  const text = html.toString('utf8');
  const urls = new Set();
  for (const [, u] of text.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) urls.add(u);
  for (const [, u] of text.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)) urls.add(u);
  for (const [, u] of text.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/g)) urls.add(u);
  let assets = 0;
  const files = [];
  for (const u of urls) {
    const f = localFile(u, root);
    if (!f) continue;
    const size = gz(fs.readFileSync(f));
    assets += size;
    files.push({ file: path.relative(root, f), gz_kb: kb(size) });
  }
  const htmlGz = gz(html);
  return { html_raw_kb: kb(html.length), html_gz_kb: kb(htmlGz), assets_gz_kb: kb(assets), total_gz_kb: kb(htmlGz + assets), assets: files.sort((a, b) => b.gz_kb - a.gz_kb).slice(0, 5) };
}

export function measureAll(root = ROOT) {
  return Object.fromEntries(Object.entries(PAGES).filter(([, f]) => fs.existsSync(path.join(root, f))).map(([p, f]) => [p, measurePage(f, root)]));
}

export function checkBudget(measured, budget) {
  const over = [];
  for (const [page, limit] of Object.entries(budget.pages || {})) {
    const m = measured[page];
    if (!m) continue;
    if (m.total_gz_kb > limit.total_gz_kb) over.push(`${page}: ${m.total_gz_kb} KB (gzip) passou do orçamento de ${limit.total_gz_kb} KB`);
  }
  const missing = Object.keys(measured).filter((p) => !(budget.pages || {})[p]);
  return { over, missing };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measured = measureAll();
  if (process.argv.includes('--atualizar')) {
    const pages = Object.fromEntries(Object.entries(measured).map(([p, m]) => [p, { total_gz_kb: Math.ceil(m.total_gz_kb * SLACK), medido_em_kb: m.total_gz_kb }]));
    fs.writeFileSync(BUDGET_FILE, JSON.stringify({
      nota: 'Orçamento = medição + 5%. A página pode emagrecer, não engordar. Metas finais de projeto em docs/DESIGN-SYSTEM.md e docs/INFRA.md (desempenho). Regravar só por decisão consciente: node scripts/perf-budget.js --atualizar',
      metas_lighthouse: { desempenho: 85, acessibilidade: 95, boas_praticas: 90, seo: 90 },
      pages,
    }, null, 2) + '\n');
    console.log('✓ docs/perf-budget.json atualizado.');
  }
  const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  console.log('\nOrçamento de peso (gzip, só o que vem do nosso servidor)');
  for (const [p, m] of Object.entries(measured)) {
    const lim = budget.pages[p]?.total_gz_kb;
    console.log(`  ${p.padEnd(15)} ${String(m.total_gz_kb).padStart(7)} KB  (HTML ${m.html_gz_kb} + CSS/JS ${m.assets_gz_kb})  limite ${lim ?? '—'} KB`);
  }
  const { over, missing } = checkBudget(measured, budget);
  if (missing.length) console.log(`\n⚠️ Páginas sem orçamento: ${missing.join(', ')} (rode --atualizar)`);
  if (over.length) { console.error(`\n✖ ${over.join('\n✖ ')}`); process.exit(1); }
  console.log('\n✅ Todas as páginas dentro do orçamento.');
}
