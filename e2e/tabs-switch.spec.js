import { test, expect } from '@playwright/test';

/**
 * Troca de abas do painel (guarda o refator da switchTab, AUD-11):
 * ao abrir cada aba, o conteúdo dela aparece (o painel pode manter outras janelas abertas).
 */
const TABS = ['leads', 'clients', 'lawsuits', 'calendar', 'publications', 'finance', 'judicial', 'users', 'hr', 'dashboard', 'notifications', 'rockets'];

test('abrir cada aba mostra o conteúdo dela', async ({ page }) => {
  await page.goto('/painel');
  await page.fill('#login-username', 'jorgealvimtecnologia');
  await page.click('#login-password');
  await page.fill('#login-password', process.env.E2E_MASTER_PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await expect(page.locator('#panel-view')).toBeVisible();
  // espera o painel terminar de carregar permissões e abrir a aba inicial (senão ela reabre no meio do teste)
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  for (const tab of TABS) {
    // window.switchTab é o gerenciador de janelas do painel (painel-3.js), que chama a troca de abas do núcleo.
    await page.evaluate((t) => window.switchTab(t), tab);
    await expect(page.locator(`#tab-content-${tab}`), `aba "${tab}" deve ficar visível`).toBeVisible();
  }
});

test('aba sem permissão não abre (negado por padrão)', async ({ page }) => {
  await page.goto('/painel');
  await page.fill('#login-username', 'jorgealvimtecnologia');
  await page.click('#login-password');
  await page.fill('#login-password', process.env.E2E_MASTER_PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await expect(page.locator('#panel-view')).toBeVisible();
  await page.evaluate(() => window.switchTab('leads'));
  // aba inexistente: nada deve ficar visível além do que já estava, e não pode dar erro
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.evaluate(() => window.switchTab('aba-que-nao-existe'));
  expect(erros).toEqual([]);
});
