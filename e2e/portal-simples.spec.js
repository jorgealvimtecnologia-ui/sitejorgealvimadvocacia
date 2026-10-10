import { test, expect } from '@playwright/test';

/**
 * Portal do cliente em linguagem simples (AUD-16), no navegador: situação em uma frase,
 * "o que você precisa fazer", linha do tempo explicada, termos explicados ao toque e texto escapado.
 */
const GLOSSARY = [{ term: 'Citação', meaning: 'Aviso oficial à outra parte de que existe um processo contra ela.' }];
const LAWSUITS = [{
  id: 'L1', cnj_number: '5001234-56.2026.8.13.0145', tribunal: 'TJMG', instance: '1ª Instância', action_type: 'Trabalhista', status: 'Em Andamento',
  situation: 'Estamos aguardando a audiência. <img src=x onerror="window.__xss=1">', situation_source: 'advogado',
  action_needed: true, next_action: 'Envie seu comprovante de residência até sexta-feira.', updated_at: '2026-10-04T10:00:00',
  timeline: [{ id: 1, date: '2026-09-01', title: 'Citação realizada', simple: 'A outra parte foi avisada oficialmente: Citação concluída.', source: 'automatico' }],
}, {
  id: 'L2', cnj_number: '5009999-00.2026.8.13.0145', tribunal: 'TJMG', instance: '1ª Instância', status: 'Em Andamento',
  situation: 'O processo está em andamento normalmente.', situation_source: 'automatico', action_needed: false,
  next_action: 'Nada a fazer agora. Nosso escritório acompanha o processo para você.', updated_at: '2026-10-01T10:00:00', timeline: [],
}];

test('o cliente vê situação, ação, novidades e dicionário em linguagem simples', async ({ page }) => {
  await page.goto('/cliente');
  await page.evaluate(([laws, gloss]) => {
    window.__glossary = gloss;
    // sem fazer login: só mostra a área do portal para podermos olhar o resultado do desenho
    for (let el = document.getElementById('portal-lawsuits-list'); el; el = el.parentElement) el.classList.remove('hidden');
    window.renderPortalLawsuits(laws);
  }, [LAWSUITS, GLOSSARY]);

  const lista = page.locator('#portal-lawsuits-list');
  await expect(lista.getByText('Como está o seu processo').first()).toBeVisible();
  await expect(lista.getByText('Estamos aguardando a audiência.')).toBeVisible();
  // ação pendente em destaque e processo sem ação com "nada a fazer"
  await expect(lista.locator('[role="alert"]')).toContainText('Envie seu comprovante de residência');
  await expect(lista.getByText('Nada a fazer agora.')).toBeVisible();
  // texto do escritório é escapado: nada de HTML injetado
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  // linha do tempo explicada, com a marca de explicação automática
  await expect(lista.getByText('A outra parte foi avisada oficialmente')).toBeVisible();
  await expect(lista.getByText('explicação geral automática')).toBeVisible();
  // termo explicado ao toque (teclado e clique)
  const termo = lista.locator('.term-link', { hasText: 'Citação' }).first();
  await termo.click();
  await expect(lista.locator('.term-meaning').first()).toContainText('Aviso oficial');
  await expect(termo).toHaveAttribute('aria-expanded', 'true');
  await termo.click();
  await expect(lista.locator('.term-meaning')).toHaveCount(0);
  // dicionário no fim
  await expect(lista.getByText('Dicionário: o que significam')).toBeVisible();
});

test('sem processos liberados, mostra mensagem acolhedora', async ({ page }) => {
  await page.goto('/cliente');
  await page.evaluate(() => {
    for (let el = document.getElementById('portal-lawsuits-list'); el; el = el.parentElement) el.classList.remove('hidden');
    window.renderPortalLawsuits([]);
  });
  await expect(page.locator('#portal-lawsuits-list')).toContainText('Nenhum processo para mostrar por enquanto');
});

test('painel: o advogado tem os controles do portal do cliente', async ({ page }) => {
  await page.goto('/painel');
  await page.fill('#login-username', 'jorgealvimtecnologia');
  await page.click('#login-password');
  await page.fill('#login-password', process.env.E2E_MASTER_PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await expect(page.locator('#panel-view')).toBeVisible();
  for (const id of ['lawsuit-client-visible', 'lawsuit-client-summary', 'lawsuit-client-action', 'lawsuit-client-action-needed', 'movement-client-visible', 'movement-client-text']) {
    await expect(page.locator(`#${id}`), id).toHaveCount(1);
  }
  const funcoes = await page.evaluate(() => ['previewClientPortal', 'publishAllToClient', 'toggleMovementClientVisible'].map((f) => typeof window[f]));
  expect(funcoes).toEqual(['function', 'function', 'function']);
});
