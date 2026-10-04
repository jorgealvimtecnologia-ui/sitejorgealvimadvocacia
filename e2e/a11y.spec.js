import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Acessibilidade automática (AUD-19): axe-core nas páginas públicas, regras WCAG 2.0/2.1 A e AA
 * (contraste, nomes de botões e campos, zoom, idioma, estrutura). Zero violações é a regra:
 * qualquer problema novo reprova a CI. Páginas que exigem login/token são cobertas por teste próprio.
 */
const PAGES = [
  ['/', 'Página inicial'], ['/painel', 'Painel (tela de login)'], ['/cliente', 'Portal do cliente'], ['/colaborador', 'Portal do colaborador'],
  ['/blog', 'Blog'], ['/amazon', 'Vitrine'], ['/agendar', 'Agendamento online'], ['/design-system', 'Design system'], ['/teste-pratico', 'Teste prático'],
];

for (const [path, nome] of PAGES) {
  test(`acessibilidade: ${nome} (${path}) sem violações WCAG A/AA`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const resumo = r.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.length} elemento(s), ex.: ${v.nodes[0].html.slice(0, 100)}`);
    expect(resumo, `\n${resumo.join('\n')}`).toEqual([]);
  });
}

test('teclado: dá para percorrer o agendamento só com Tab, com foco sempre visível', async ({ page, playwright, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL });
  const login = await api.post('/api/auth/login', { data: { username: 'jorgealvimtecnologia', password: process.env.E2E_MASTER_PASSWORD } });
  const { token } = await login.json();
  await api.put('/api/booking/settings', { headers: { Authorization: `Bearer ${token}` }, data: { enabled: true, min_notice_hours: 1, max_days_ahead: 30, weekdays: [0, 1, 2, 3, 4, 5, 6] } });

  await page.goto('/agendar');
  await page.locator('.day').first().waitFor();
  const alcancados = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, id: el.id, cls: el.className, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, nome: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30) };
    });
    if (info) {
      alcancados.push(`${info.tag}.${String(info.cls).split(' ')[0]}`);
      expect(info.outline, `sem contorno de foco em ${info.tag} "${info.nome}"`).toBeTruthy();
    }
  }
  expect(alcancados.length).toBeGreaterThan(20);              // links e os dias disponíveis
  expect(alcancados.some((x) => x.endsWith('.day'))).toBe(true); // os dias são alcançáveis pelo teclado
  // escolhe dia e horário só com o teclado
  await page.locator('.day').first().focus();
  await page.keyboard.press('Enter');
  await page.locator('.slot').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#form')).toBeVisible();
});
