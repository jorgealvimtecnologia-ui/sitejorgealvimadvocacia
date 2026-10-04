import { test, expect } from '@playwright/test';

/** Indicadores do dono (AUD-17): abre pelo Financeiro e mostra as seções, com a conferência do livro caixa. */
test('o dono abre os indicadores e vê as seções e a conferência', async ({ page }) => {
  await page.goto('/painel');
  await page.fill('#login-username', 'jorgealvimtecnologia');
  await page.click('#login-password');
  await page.fill('#login-password', process.env.E2E_MASTER_PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await expect(page.locator('#panel-view')).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.evaluate(() => window.switchTab('finance'));
  await expect(page.locator('#tab-content-finance')).toBeVisible();
  await page.getByRole('button', { name: /Indicadores do dono/ }).click();

  const modal = page.locator('#owner-indicators-modal');
  await expect(modal.getByRole('heading', { name: /Indicadores do dono/ })).toBeVisible();
  for (const titulo of ['Receita e margem por área do direito', 'Inadimplência', /Previsão de caixa/, 'De onde vêm os clientes', 'Dinheiro de terceiros (alvarás)']) {
    await expect(modal.getByRole('heading', { name: titulo })).toBeVisible();
  }
  await expect(modal.getByText(/Conferência: a soma por área bate com o livro caixa/)).toBeVisible();
  // muda a previsão para 3 meses
  await modal.locator('#oi-horizon').selectOption('3');
  await expect(modal.getByRole('heading', { name: /próximos 3 meses/ })).toBeVisible();
});
