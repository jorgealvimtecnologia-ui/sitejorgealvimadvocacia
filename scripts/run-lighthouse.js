import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// 1. Detectar binário do Chrome (Playwright ou Sistema)
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const homeDir = process.env.HOME || '/home/jorgealvim';
  const pwCache = path.join(homeDir, '.cache/ms-playwright');
  if (fs.existsSync(pwCache)) {
    try {
      const dirs = fs.readdirSync(pwCache);
      const chromDir = dirs.find(d => d.startsWith('chromium-') && !d.includes('shell'));
      if (chromDir) {
        const candidate = path.join(pwCache, chromDir, 'chrome-linux64/chrome');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {}
  }

  const systemCandidates = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const cmd of systemCandidates) {
    try {
      const out = execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch {}
  }

  return null;
}

// 2. Garantir servidor local ativo se testar localhost
async function ensureServerRunning(url) {
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) return null;

  try {
    const res = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(1000) });
    if (res.ok) return null;
  } catch {}

  console.log('🚀 Servidor local não detectado na porta 3000. Iniciando automaticamente...');
  const serverProc = spawn('node', ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: '3000', NODE_ENV: 'development' },
    stdio: 'ignore'
  });

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        console.log('✅ Servidor local pronto para auditoria.');
        return serverProc;
      }
    } catch {}
  }

  return serverProc;
}

async function main() {
  const isProd = process.argv.includes('--prod');
  const customUrlArg = process.argv.find(arg => arg.startsWith('http://') || arg.startsWith('https://'));
  const targetUrl = customUrlArg || (isProd ? 'https://jorgealvimadvocacia.com.br' : 'http://localhost:3000');

  console.log('\n================================================================');
  console.log('⚡ AUDITORIA GOOGLE LIGHTHOUSE');
  console.log('   Jorge Alvim Advocacia & Tecnologia');
  console.log('================================================================\n');
  console.log(`🎯 URL Alvo: ${targetUrl}`);

  const chromePath = findChrome();
  if (!chromePath) {
    console.error('❌ Erro: Não foi possível localizar o navegador Chrome/Chromium.');
    console.error('   Execute: npx playwright install chromium');
    process.exit(1);
  }
  console.log(`🧭 Navegador: ${chromePath}`);

  const serverProc = await ensureServerRunning(targetUrl);

  const reportsDir = path.join(projectRoot, 'lighthouse-reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const urlSlug = targetUrl.includes('localhost') ? 'local' : 'producao';
  const reportPrefix = path.join(reportsDir, `lighthouse-${urlSlug}-${timestamp}`);
  const reportHtmlPath = `${reportPrefix}.report.html`;
  const reportJsonPath = `${reportPrefix}.report.json`;

  const lighthouseBin = path.join(projectRoot, 'node_modules/.bin/lighthouse');

  const args = [
    targetUrl,
    `--output=html,json`,
    `--output-path=${reportPrefix}`,
    `--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage`,
    `--preset=desktop`,
    `--no-enable-error-reporting`,
    `--quiet`
  ];

  console.log('\n⏳ Coletando métricas (Performance, SEO, Acessibilidade, Boas Práticas)...');

  const proc = spawn(lighthouseBin, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      CHROME_PATH: chromePath
    },
    stdio: 'inherit'
  });

  proc.on('close', code => {
    if (serverProc) {
      serverProc.kill();
    }

    const htmlExists = fs.existsSync(reportHtmlPath) || fs.existsSync(`${reportPrefix}.html`);
    const finalHtml = fs.existsSync(reportHtmlPath) ? reportHtmlPath : `${reportPrefix}.html`;
    const finalJson = fs.existsSync(reportJsonPath) ? reportJsonPath : `${reportPrefix}.json`;

    if (code === 0 || htmlExists) {
      console.log('\n================================================================');
      console.log('✨ [SUCESSO] Auditoria concluída com sucesso!');
      console.log('================================================================\n');

      try {
        if (fs.existsSync(finalJson)) {
          const report = JSON.parse(fs.readFileSync(finalJson, 'utf-8'));
          const cats = report.categories;

          const perf = Math.round((cats.performance?.score || 0) * 100);
          const a11y = Math.round((cats.accessibility?.score || 0) * 100);
          const best = Math.round((cats['best-practices']?.score || 0) * 100);
          const seo = Math.round((cats.seo?.score || 0) * 100);

          function badge(score) {
            if (score >= 90) return `🟢 ${score}/100 (Excelente)`;
            if (score >= 50) return `🟡 ${score}/100 (Atenção)`;
            return `🔴 ${score}/100 (Crítico)`;
          }

          console.log(` ⚡ Desempenho (Performance):     ${badge(perf)}`);
          console.log(` ♿ Acessibilidade (A11y):        ${badge(a11y)}`);
          console.log(` 🛡️  Boas Práticas:                ${badge(best)}`);
          console.log(` 🔍 SEO:                           ${badge(seo)}`);
          console.log('\n----------------------------------------------------------------');
        }
      } catch (e) {
        console.log('Detalhes salvos no relatório.');
      }

      console.log(`📄 Relatório visual completo salvo em:\n   ${finalHtml}\n`);
      process.exit(0);
    } else {
      console.error(`\n⚠️ O Lighthouse finalizou com erro (código: ${code}).`);
      process.exit(code);
    }
  });
}

main().catch(err => {
  console.error('Erro na execução do Lighthouse:', err);
  process.exit(1);
});
