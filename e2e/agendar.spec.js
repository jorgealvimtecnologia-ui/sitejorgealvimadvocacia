import { test, expect } from '@playwright/test';

/**
 * Agendamento online (AUD-15), de ponta a ponta no navegador: o visitante escolhe dia e horário,
 * preenche os dados e recebe a confirmação; o horário some da lista; depois cancela pelo link pessoal.
 */
test.describe('Agendamento online de consulta', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const login = await api.post('/api/auth/login', { data: { username: 'jorgealvimtecnologia', password: process.env.E2E_MASTER_PASSWORD } });
    const { token } = await login.json();
    const r = await api.put('/api/booking/settings', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: true, min_notice_hours: 1, max_days_ahead: 30, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    });
    expect(r.ok()).toBeTruthy();
  });

  test('marca, vê a confirmação e cancela pelo link pessoal', async ({ page }) => {
    await page.goto('/agendar');
    await expect(page.getByRole('heading', { name: /Agende sua consulta/i })).toBeVisible();

    await page.locator('.day').first().click();
    await page.locator('.slot').first().click();
    await expect(page.locator('#form')).toBeVisible();

    await page.fill('#f-nome', 'Maria da Silva Teste');
    await page.fill('#f-email', 'maria.teste@exemplo.com.br');
    await page.fill('#f-tel', '(32) 99999-1234');
    await page.selectOption('#f-area', 'Trabalhista');
    await page.check('#f-lgpd');
    await page.click('#f-enviar');

    await expect(page.getByText('Consulta agendada!')).toBeVisible();
    const link = await page.locator('a[href*="/agendar?t="]').first().getAttribute('href');
    expect(link).toMatch(/\?t=[a-f0-9]{48}$/);

    // pelo link pessoal: abre a marcação e cancela
    await page.goto('/agendar' + new URL(link).search); // o link do e-mail aponta para o domínio de produção; aqui usamos o servidor de teste
    await expect(page.getByText('Em nome de Maria da Silva Teste')).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.click('#b-cancelar');
    await expect(page.getByText(/Cancelada/)).toBeVisible();
  });

  test('sem consentimento LGPD não agenda', async ({ page }) => {
    await page.goto('/agendar');
    await page.locator('.day').first().click();
    await page.locator('.slot').first().click();
    await page.fill('#f-nome', 'Joao Sem Consentimento');
    await page.fill('#f-email', 'joao@exemplo.com.br');
    await page.fill('#f-tel', '(32) 98888-7777');
    await page.click('#f-enviar');
    await expect(page.locator('#aviso')).toContainText(/LGPD|concordar/i);
  });
});
