import { test, expect } from '@playwright/test';

/**
 * CHECKLIST AUTOMATIZADO DE QUALIDADE EM PRODUÇÃO (PLAYWRIGHT)
 * 
 * Executa auditoria em cada uma das páginas principais do sistema:
 * 1. Resposta HTTP 200
 * 2. Ausência total de erros vermelhos no console (JS Uncaught Exceptions)
 * 3. Ausência de requisições de rede falhas (404/500/Failed)
 * 4. Presença de Title e Meta Viewport
 * 5. Responsividade Mobile (sem overflow horizontal)
 * 6. Barreira de Segurança de Rotas Privadas (401 sem token)
 */

const PAGES_TO_AUDIT = [
  { name: 'Página Inicial (Home)', path: '/', expectedTitle: /Advocacia/i },
  { name: 'Painel de Gestão (CRM/Login)', path: '/painel', expectedTitle: /Painel|Jorge Alvim/i },
  { name: 'Blog Jurídico & Artigos', path: '/blog', expectedTitle: /Blog/i },
  { name: 'Vitrine Parceiro Amazon', path: '/amazon', expectedTitle: /Amazon|Vitrine/i },
  { name: 'Portal do Cliente', path: '/cliente', expectedTitle: /Cliente|Atendimento/i },
  { name: 'Portal do Colaborador', path: '/colaborador', expectedTitle: /Colaborador/i },
  { name: 'Assinatura Eletrônica (Mobile)', path: '/assinar', expectedTitle: /Assinatura/i },
  { name: 'Anexar Documentos (Magic Link)', path: '/anexar', expectedTitle: /Documentos|Envio/i },
  { name: 'Showcase / Teste Prático', path: '/teste-pratico', expectedTitle: /Teste|Prático|Showcase/i },
];

test.describe('Checklist de Produção - Varredura de Páginas', () => {
  for (const pageItem of PAGES_TO_AUDIT) {
    test(`[Checklist] ${pageItem.name} -> ${pageItem.path}`, async ({ page }) => {
      const consoleErrors = [];
      const networkErrors = [];

      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('ERR_INTERNET_DISCONNECTED') && !text.includes('ERR_NAME_NOT_RESOLVED')) {
            consoleErrors.push(text);
          }
        }
      });

      page.on('pageerror', error => {
        consoleErrors.push(error.message);
      });

      page.on('requestfailed', request => {
        const url = request.url();
        const failure = request.failure()?.errorText || '';
        if (
          !failure.includes('net::ERR_ABORTED') &&
          !failure.includes('ERR_INTERNET_DISCONNECTED') &&
          !failure.includes('ERR_NAME_NOT_RESOLVED')
        ) {
          networkErrors.push(`${url} [${failure}]`);
        }
      });

      const response = await page.goto(pageItem.path, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 1. Valida HTTP Status 200
      expect(response?.status(), `HTTP Status não é 200 na rota ${pageItem.path}`).toBe(200);

      // 2. Valida Título da Página
      await expect(page).toHaveTitle(pageItem.expectedTitle);

      // 3. Valida Meta Viewport (Mobile-Ready)
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewport, `Meta tag viewport ausente na página ${pageItem.path}`).toBeTruthy();

      // 4. Valida Zero Erros Críticos de JavaScript no Console
      expect(consoleErrors, `Erros encontrados no console em ${pageItem.path}: ${consoleErrors.join(' | ')}`).toHaveLength(0);

      // 5. Valida Zero Requisições Quebradas
      expect(networkErrors, `Requisições com falha em ${pageItem.path}: ${networkErrors.join(' | ')}`).toHaveLength(0);
    });
  }

  test('[Mobile UX] Validação de Viewport Mobile (375x667) sem overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const scrollWidthHome = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidthHome, 'Home possui overflow horizontal no mobile').toBeLessThanOrEqual(380);

    await page.goto('/blog', { waitUntil: 'domcontentloaded' });
    const scrollWidthBlog = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidthBlog, 'Blog possui overflow horizontal no mobile').toBeLessThanOrEqual(380);

    await page.goto('/amazon', { waitUntil: 'domcontentloaded' });
    const scrollWidthAmazon = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidthAmazon, 'Vitrine Amazon possui overflow horizontal no mobile').toBeLessThanOrEqual(380);
  });

  test('[Segurança de Produção] Rotas de API privadas retornam 401 sem autenticação', async ({ request }) => {
    const resFinancial = await request.get('/api/financial/transactions');
    expect(resFinancial.status()).toBe(401);

    const resUsers = await request.get('/api/users');
    expect(resUsers.status()).toBe(401);

    const resMaintenance = await request.get('/api/admin/maintenance/health');
    expect(resMaintenance.status()).toBe(401);
  });
});
