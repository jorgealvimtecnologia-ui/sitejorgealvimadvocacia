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
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Opcional: usar um Chromium já instalado (ex.: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome).
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox'] } }
          : {}),
      },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node server.js',
        url: `http://localhost:${PORT}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
        env: {
          PORT: String(PORT),
          DB_PATH: DB,
          NODE_ENV: 'development',
          // Banco de teste novo a cada execução: a senha inicial do mestre vem desta variável (só neste banco temporário).
          MASTER_PASSWORD: 'jorgealvim',
          // O token de teste do Google só vale em teste/desenvolvimento (NUNCA em produção): usado em e2e/google-rbac-ui.spec.js.
          ALLOW_MOCK_GOOGLE_TOKEN: '1',
          ENV_WATCH_DISABLED: '1',
          DEADLINE_ALERTS_DISABLED: '1',
        },
      },
});
