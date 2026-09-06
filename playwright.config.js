import { defineConfig, devices } from '@playwright/test';

/**
 * Testes E2E (ponta a ponta) dos fluxos críticos, rodando um navegador real
 * contra uma instância do servidor iniciada automaticamente em porta de teste,
 * com banco SQLite temporário (via DB_PATH). NÃO toca o leads.db real.
 *
 * Rodar localmente:  npm run test:e2e   (após: npx playwright install chromium)
 */
const PORT = process.env.E2E_PORT || 3100;
const DB = process.env.E2E_DB || 'e2e-temp.db';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node server.js',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      PORT: String(PORT),
      DB_PATH: DB,
      NODE_ENV: 'development',
    },
  },
});
