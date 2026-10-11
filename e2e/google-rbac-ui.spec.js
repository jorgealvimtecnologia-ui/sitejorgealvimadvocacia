/**
 * O login com Google segue as MESMAS permissões do login por senha (RBAC):
 * a secretária não pode ver, depois do Google, abas que a senha dela não mostra.
 * Regressão: após o Google o painel não aplicava as permissões e mostrava abas a mais
 * (e disparava chamadas de API que o servidor negava).
 *
 * O token de teste do Google só é aceito neste servidor de desenvolvimento
 * (playwright.config.js liga ALLOW_MOCK_GOOGLE_TOKEN); em produção ele é recusado.
 */
/* global submitAdminGooglePayload -- função global do painel, executada dentro do navegador (page.evaluate) */
import { test, expect } from '@playwright/test';

const EMAIL = 'maria.google.e2e@exemplo.com';
const SENHA = 'SenhaSecretaria#2026';
const PROIBIDAS = ['finance', 'hr', 'users', 'lawsuits', 'offices', 'nfse', 'publications'];

async function visibleTabs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[id^="tab-btn-"]')]
      .filter((b) => getComputedStyle(b).display !== 'none' && !/(^|\s)!?hidden(\s|$)/.test(b.className))
      .map((b) => b.id.replace('tab-btn-', ''))
      .sort()
  );
}

test.describe('Login Google obedece o RBAC por usuário', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const login = await api.post('/api/auth/login', {
      data: { username: 'jorgealvimtecnologia', password: process.env.E2E_MASTER_PASSWORD },
    });
    expect(login.ok(), 'login do mestre para preparar o teste').toBeTruthy();
    const { token } = await login.json();
    const auth = { Authorization: `Bearer ${token}` };
    // O e-mail do Google é o próprio login do usuário (assim o servidor o encontra sem mexer no banco).
    await api.post('/api/users', {
      headers: auth,
      data: { username: EMAIL, password: SENHA, name: 'Maria Google E2E', role: 'secretaria' },
    });
    // A linha de permissão do usuário novo nasce na sincronização da matriz de acesso.
    await api.get('/api/access-control/matrix', { headers: auth });
    const users = await (await api.get('/api/users', { headers: auth })).json();
    const u = (users.users || users).find((x) => x.username === EMAIL);
    expect(u, 'usuário de teste criado').toBeTruthy();
    const apply = await api.post('/api/access-control/apply-template', {
      headers: auth,
      data: { user_id: u.id, template_key: 'secretaria' },
    });
    expect(apply.ok()).toBeTruthy();
    await api.dispose();
  });

  async function loginSenha(page) {
    await page.goto('/painel', { waitUntil: 'domcontentloaded' });
    await page.fill('#login-username', EMAIL);
    await page.click('#login-password');
    await page.fill('#login-password', SENHA);
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#panel-view:not(.hidden)', { timeout: 20000 });
    await page.waitForTimeout(2500);
  }

  async function loginGoogle(page) {
    await page.goto('/painel', { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      (mail) => submitAdminGooglePayload({ credential: `mock-google-token:sub-e2e:${mail}:Maria` }),
      EMAIL
    );
    await page.waitForSelector('#panel-view:not(.hidden)', { timeout: 20000 });
    await page.waitForTimeout(2500);
  }

  test('a secretária vê as MESMAS abas por senha e por Google, e nenhuma aba proibida', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await loginSenha(pageA);
    const porSenha = await visibleTabs(pageA);
    await ctxA.close();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const negadas = [];
    pageB.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() === 403) negadas.push(r.url());
    });
    await loginGoogle(pageB);
    const porGoogle = await visibleTabs(pageB);
    await ctxB.close();

    expect(porSenha.length).toBeGreaterThan(0);
    expect(porGoogle).toEqual(porSenha);
    for (const aba of PROIBIDAS) expect(porGoogle, `aba proibida visível após o Google: ${aba}`).not.toContain(aba);
    expect(negadas, `o painel pediu dados que a função não pode ver: ${negadas.join(', ')}`).toEqual([]);
  });
});
