/**
 * AUD-10: a MESMA versão do Node em todos os lugares (CI, Dockerfile, .nvmrc, README e engines),
 * e a CI bloqueia a entrega (build, lint, testes, arquitetura e audit sem "continue-on-error").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MAJOR = read('.nvmrc').trim();

describe('versão do Node alinhada', () => {
  it('.nvmrc define a versão de referência', () => {
    assert.match(MAJOR, /^\d+$/);
  });
  it('Dockerfile usa a mesma versão', () => {
    assert.match(read('Dockerfile'), new RegExp(`FROM node:${MAJOR}-`));
  });
  it('package.json (engines) exige a mesma versão', () => {
    const eng = JSON.parse(read('package.json')).engines?.node || '';
    assert.ok(eng.includes(MAJOR), `engines.node = "${eng}"`);
  });
  it('README cita a mesma versão', () => {
    assert.match(read('README.md'), new RegExp(`Node\\.js \\*{0,2}${MAJOR}`));
  });
  it('todos os fluxos do GitHub usam a mesma versão', () => {
    for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows')).filter((x) => x.endsWith('.yml'))) {
      const versions = [...read(`.github/workflows/${f}`).matchAll(/node-version:\s*'?(\d+)'?/g)].map((m) => m[1]);
      for (const v of versions) assert.equal(v, MAJOR, `${f} usa Node ${v}`);
    }
  });
});

describe('CI estrita', () => {
  const ci = read('.github/workflows/ci.yml');
  it('nenhuma etapa da CI principal é "informativa" (continue-on-error)', () => {
    assert.ok(!/continue-on-error:\s*true/.test(ci));
  });
  it('a CI roda arquitetura, lint, testes, audit e build', () => {
    for (const cmd of ['npm run check:architecture', 'npm run lint', 'npm test', 'npm run audit', 'npm run build']) {
      assert.ok(ci.includes(cmd), `falta "${cmd}" na CI`);
    }
  });
});
