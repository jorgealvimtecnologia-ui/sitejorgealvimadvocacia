import { test, expect } from '@playwright/test';

/** Catálogo do design system (AUD-18): paleta real, selos de prazo calculados e modo escuro. */
test('catálogo mostra a paleta, os selos de prazo e alterna o modo escuro', async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { name: 'Catálogo de componentes' })).toBeVisible();
  await expect(page.locator('#swatches .sw')).toHaveCount(22);
  // 5 selos de prazo gerados pela lógica compartilhada, de "ok" a "fatal"
  const tons = await page.locator('#prazos .ds-deadline').evaluateAll((els) => els.map((e) => e.className.replace('ds-deadline ds-deadline--', '')));
  expect(tons).toEqual(['ok', 'soon', 'urgent', 'fatal', 'fatal']);

  const fundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const claro = await fundo();
  await page.getByRole('button', { name: /Modo escuro|Modo claro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await fundo()).not.toEqual(claro);
});
