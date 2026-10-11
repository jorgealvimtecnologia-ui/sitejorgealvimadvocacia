/**
 * AUD-18: design system — contraste (WCAG AA), tokens completos nos dois modos, componentes sem cor solta,
 * catálogo cobrindo todos os componentes e a lógica de cor dos prazos.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const TOKENS = read('public/css/tokens.css');
const COMPONENTS = read('public/css/components.css');
const CATALOG = read('design-system.html');

/** Variáveis de um bloco: devolve { '--ds-x': valor }. Resolve var(--ds-y) com o mapa dado. */
function varsOf(css, startMarker) {
  const i = css.indexOf(startMarker);
  const open = css.indexOf('{', i);
  let depth = 0, end = open;
  for (let k = open; k < css.length; k++) { if (css[k] === '{') depth++; if (css[k] === '}') { depth--; if (depth === 0) { end = k; break; } } }
  const block = css.slice(open + 1, end);
  const out = {};
  for (const [, k, v] of block.matchAll(/(--ds-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[k] = v.trim();
  return out;
}
const resolve = (vars, base = {}) => {
  const all = { ...base, ...vars };
  const get = (k, depth = 0) => {
    const v = all[k];
    const m = /^var\((--ds-[a-z0-9-]+)\)$/.exec(v || '');
    return m && depth < 5 ? get(m[1], depth + 1) : v;
  };
  return Object.fromEntries(Object.keys(all).map((k) => [k, get(k)]));
};

const light = resolve(varsOf(TOKENS, ':root {'));
const dark = resolve(varsOf(TOKENS, ':root[data-theme="dark"]'), light);

function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [texto, fundo]: tudo o que o sistema coloca sobre o quê
const PAIRS = [
  ['--ds-text', '--ds-bg'], ['--ds-text', '--ds-surface'], ['--ds-text', '--ds-surface-2'],
  ['--ds-text-muted', '--ds-bg'], ['--ds-text-muted', '--ds-surface'], ['--ds-text-muted', '--ds-surface-2'],
  ['--ds-accent-text', '--ds-bg'], ['--ds-accent-text', '--ds-surface'],
  ['--ds-on-primary', '--ds-primary'], ['--ds-on-accent', '--ds-accent'],
  ['--ds-success', '--ds-success-bg'], ['--ds-warning', '--ds-warning-bg'], ['--ds-danger', '--ds-danger-bg'], ['--ds-info', '--ds-info-bg'],
];

describe('tokens', () => {
  const required = ['--ds-bg', '--ds-surface', '--ds-text', '--ds-text-muted', '--ds-border', '--ds-primary', '--ds-accent', '--ds-accent-text', '--ds-focus',
    '--ds-success', '--ds-warning', '--ds-danger', '--ds-info', '--ds-font-serif', '--ds-font-sans', '--ds-radius-md', '--ds-space-4', '--ds-tap'];
  it('todos os tokens obrigatórios existem no modo claro e no escuro', () => {
    for (const k of required) { assert.ok(light[k], `claro sem ${k}`); assert.ok(dark[k], `escuro sem ${k}`); }
  });
  it('o modo escuro por preferência do aparelho repete exatamente o escuro forçado', () => {
    const auto = resolve(varsOf(TOKENS, ':root:not([data-theme="light"])'), light);
    for (const [k, v] of Object.entries(varsOf(TOKENS, ':root[data-theme="dark"]'))) {
      assert.equal(resolve({ [k]: v }, light)[k], auto[k], `${k} difere entre o escuro automático e o forçado`);
    }
  });
  for (const [modo, vars] of [['claro', light], ['escuro', dark]]) {
    it(`contraste mínimo 4,5:1 em todos os pares (${modo})`, () => {
      const ruins = [];
      for (const [fg, bg] of PAIRS) {
        const r = ratio(vars[fg], vars[bg]);
        if (r < 4.5) ruins.push(`${fg} sobre ${bg}: ${r.toFixed(2)}`);
      }
      assert.deepEqual(ruins, []);
    });
  }
  it('o dourado "600" não é usado como texto (não passa no contraste)', () => {
    assert.ok(ratio(light['--ds-gold-600'], light['--ds-surface']) < 4.5); // documenta o motivo do --ds-accent-text
    assert.notEqual(light['--ds-accent-text'], light['--ds-gold-600']);
  });
  it('texto branco sobre o selo de prazo fatal passa no contraste', () => {
    assert.ok(ratio(light['--ds-surface'], light['--ds-danger']) >= 4.5);
  });
});

describe('componentes', () => {
  it('não têm nenhuma cor solta: só tokens', () => {
    const semComentarios = COMPONENTS.replace(/\/\*[\s\S]*?\*\//g, '');
    const hex = semComentarios.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    // exceção única e deliberada: o véu escuro atrás da janela (rgba), que não é cor de marca
    assert.deepEqual(hex, []);
  });
  it('todo componente .ds-* tem exemplo no catálogo', () => {
    const classes = new Set([...COMPONENTS.matchAll(/\.(ds-[a-z0-9_-]+)/g)].map((m) => m[1]));
    const ignorar = new Set(['ds-scope']);
    const faltam = [...classes].filter((c) => !ignorar.has(c) && !CATALOG.includes(c));
    assert.deepEqual(faltam, [], `sem exemplo no catálogo: ${faltam.join(', ')}`);
  });
  it('alvos de toque e foco visível definidos', () => {
    assert.match(COMPONENTS, /min-height: var\(--ds-tap\)/);
    assert.match(COMPONENTS, /:focus-visible/);
  });
});

describe('lógica de prazo (DS)', () => {
  const ctx = { window: undefined };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/core/ds.js'), ctx);
  const DS = ctx.DS;
  it('dias até a data e cores por urgência', () => {
    assert.equal(DS.daysUntil('2026-10-10', '2026-10-04'), 6);
    assert.equal(DS.daysUntil('2026-10-04', '2026-10-04'), 0);
    assert.equal(DS.daysUntil('2026-10-01', '2026-10-04'), -3);
    assert.equal(DS.daysUntil('lixo', '2026-10-04'), null);
    assert.deepEqual([30, 8, 7, 4, 3, 1, 0, -1].map(DS.deadlineTone), ['ok', 'ok', 'soon', 'soon', 'urgent', 'urgent', 'fatal', 'fatal']);
  });
  it('rótulos em português claro', () => {
    assert.equal(DS.deadlineLabel(0), 'Vence hoje');
    assert.equal(DS.deadlineLabel(1), 'Vence amanhã');
    assert.equal(DS.deadlineLabel(5), 'Vence em 5 dias');
    assert.equal(DS.deadlineLabel(-1), 'Vencido há 1 dia');
    assert.equal(DS.deadlineLabel(-4), 'Vencido há 4 dias');
  });
  it('o selo usa a classe certa e escapa o texto', () => {
    assert.match(DS.deadlineBadge('2026-10-05', '2026-10-04'), /ds-deadline--urgent/);
    assert.match(DS.deadlineBadge('2026-10-04', '2026-10-04'), /ds-deadline--fatal/);
  });
});
