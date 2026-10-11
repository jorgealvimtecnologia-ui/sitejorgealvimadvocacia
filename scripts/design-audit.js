#!/usr/bin/env node
/**
 * Auditoria visual (AUD-18): mede o que as páginas realmente usam — paletas, cores soltas, fontes e variações de botão —
 * para o design system partir de dados, não de opinião.
 *
 *   node scripts/design-audit.js            mostra o resumo
 *   node scripts/design-audit.js --escrever grava docs/DESIGN-AUDIT.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'painel.html', 'cliente.html', 'colaborador.html', 'blog.html', 'agendar.html', 'assinar.html', 'anexar.html'];
const CSS = ['public/css/painel.css', 'public/css/enhance.css'];

const read = (f) => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

/** Cores de uma escala do tailwind.config embutido (navy/gold/warm): { '950': '#...' } */
function scale(html, name) {
  const m = html.match(new RegExp(`${name}\\s*:\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const out = {};
  for (const [, k, v] of m[1].matchAll(/['"]?(\d{2,3})['"]?\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/g)) out[k] = v.toUpperCase();
  return Object.keys(out).length ? out : null;
}

export function audit() {
  const pages = [];
  const hexAll = new Map();
  const fonts = new Map();
  const buttons = new Map();
  for (const f of PAGES) {
    const html = read(f);
    if (!html) continue;
    for (const [, h] of html.matchAll(/(#[0-9a-fA-F]{6})\b/g)) bump(hexAll, h.toUpperCase());
    for (const [, fam] of html.matchAll(/font-family\s*:\s*([^;}"]+)/g)) bump(fonts, fam.trim().split(',')[0].replace(/["']/g, ''));
    for (const [, cls] of html.matchAll(/<button[^>]*class="([^"]+)"/g)) {
      const g = cls.match(/(from-[a-z]+-\d+(?: via-[a-z]+-\d+)? to-[a-z]+-\d+)/);
      if (g) bump(buttons, g[1]);
    }
    pages.push({ file: f, lines: html.split('\n').length, navy: scale(html, 'navy'), gold: scale(html, 'gold') });
  }
  for (const f of CSS) for (const [, h] of read(f).matchAll(/(#[0-9a-fA-F]{6})\b/g)) bump(hexAll, h.toUpperCase());
  const navy950 = new Set(pages.filter((p) => p.navy && p.navy['950']).map((p) => `${p.file}: ${p.navy['950']}`));
  const distinctNavy950 = new Set(pages.filter((p) => p.navy && p.navy['950']).map((p) => p.navy['950']));
  return { pages, topHex: top(hexAll, 12), distinctHex: hexAll.size, fonts: top(fonts, 6), buttonCombos: top(buttons, 10), distinctButtonCombos: buttons.size, navy950: [...navy950], paletteDivergence: distinctNavy950.size };
}

export function toMarkdown(a) {
  const L = [];
  L.push('# Auditoria visual (AUD-18)', '', `Gerada por \`node scripts/design-audit.js --escrever\` em ${new Date().toISOString().slice(0, 10)}. Mede o que as páginas realmente usam.`, '');
  L.push('## O que a medição mostrou', '');
  L.push(`- **${a.distinctHex} cores diferentes** (hexadecimais) espalhadas em páginas e CSS; as mais usadas: ${a.topHex.map(([h, n]) => `\`${h}\` (${n})`).join(', ')}.`);
  L.push(`- **${a.paletteDivergence} versões do "azul-marinho 950"** entre as páginas — a marca deveria ter uma só: ${a.navy950.map((x) => `\`${x}\``).join(' · ') || 'n/d'}.`);
  L.push(`- **${a.distinctButtonCombos} combinações de degradê em botões** (cada tela inventa a sua): ${a.buttonCombos.slice(0, 6).map(([c, n]) => `\`${c}\` ×${n}`).join(', ') || 'n/d'}.`);
  L.push(`- Fontes declaradas em CSS: ${a.fonts.map(([f, n]) => `${f} (${n})`).join(', ') || 'n/d'}.`, '');
  L.push('## Por página', '', '| Página | Linhas | Navy 950 | Gold 600 |', '| --- | ---: | --- | --- |');
  for (const p of a.pages) L.push(`| ${p.file} | ${p.lines} | ${p.navy?.['950'] || '—'} | ${p.gold?.['600'] || '—'} |`);
  L.push('', '## O que fazer com isso', '', 'Ver `docs/DESIGN-SYSTEM.md`: tokens únicos (`public/css/tokens.css`), componentes-base (`public/css/components.css`) e a página-catálogo `/design-system`.', '');
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = audit();
  const md = toMarkdown(a);
  if (process.argv.includes('--escrever')) { fs.writeFileSync(path.join(ROOT, 'docs', 'DESIGN-AUDIT.md'), md); console.log('✓ docs/DESIGN-AUDIT.md gravado.'); }
  console.log(md);
}
