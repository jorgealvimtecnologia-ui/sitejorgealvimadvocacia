/**
 * AUD-19: orçamento de peso por página. Mede o que vem do nosso servidor (gzip) e reprova se passar do limite.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { measureAll, checkBudget, measurePage, localFile, BUDGET_FILE } from '../scripts/perf-budget.js';

describe('orçamento de peso (AUD-19)', () => {
  const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  const measured = measureAll();

  it('nenhuma página passou do orçamento', () => {
    const { over } = checkBudget(measured, budget);
    assert.deepEqual(over, [], `\n${over.join('\n')}`);
  });
  it('toda página medida tem um orçamento definido', () => {
    const { missing } = checkBudget(measured, budget);
    assert.deepEqual(missing, [], `sem orçamento: ${missing.join(', ')} (rode node scripts/perf-budget.js --atualizar)`);
  });
  it('só conta arquivos locais (terceiros ficam de fora)', () => {
    assert.equal(localFile('https://cdn.jsdelivr.net/x.js'), null);
    assert.equal(localFile('https://fonts.googleapis.com/css2'), null);
    assert.ok(localFile('/js/core/ds.js'));
  });
  it('o agendamento é leve (menos de 15 KB gzip)', () => {
    assert.ok(measurePage('agendar.html').total_gz_kb < 15);
  });
  it('as metas Lighthouse estão registradas', () => {
    assert.ok(budget.metas_lighthouse.acessibilidade >= 95);
    assert.ok(budget.metas_lighthouse.desempenho >= 80);
  });
});
