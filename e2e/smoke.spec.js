import { test, expect } from '@playwright/test';

/**
 * Smoke E2E dos fluxos críticos, num navegador real.
 * O servidor é iniciado pelo playwright.config.js (webServer) com banco temporário.
 */

test('site institucional carrega', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Advocacia/i);
});

test('login do painel com o usuário mestre entra no sistema', async ({ page }) => {
  await page.goto('/painel');

  // A tela de login vem pré-preenchida com o usuário mestre; garantimos os valores.
  await page.fill('#login-username', 'jorgealvimtecnologia');
  await page.fill('#login-password', 'jorgealvim');
  await page.click('#login-form button[type="submit"]');

  // Após autenticar, o painel aparece e o nome do usuário é exibido.
  await expect(page.locator('#panel-view')).toBeVisible();
  await expect(page.locator('#current-user-display')).toContainText(/Jorge Alvim/i);
});

test('login com senha errada mostra erro e não entra', async ({ page }) => {
  await page.goto('/painel');
  await page.fill('#login-username', 'jorgealvimtecnologia');
  await page.fill('#login-password', 'senha-invalida-xyz');
  await page.click('#login-form button[type="submit"]');

  await expect(page.locator('#login-error-msg')).toBeVisible();
  await expect(page.locator('#panel-view')).toBeHidden();
});
