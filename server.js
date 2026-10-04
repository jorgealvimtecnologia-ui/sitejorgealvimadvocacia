import './src/config/load-env.js'; // PRIMEIRO import: carrega .env + cofre .env.enc antes dos demais módulos
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { db } from './src/config/db.js';
import { execFile } from 'node:child_process';
import { 
  sessions, createSession, validateToken, requireAuth, requireMaster,
  clientSessions, createClientSession, validateClientToken, requireClientAuth,
  employeeSessions, createEmployeeSession, validateEmployeeToken, requireEmployeeAuth,
  destroySession
} from './src/middleware/auth.js';
import { requireStorageAccess } from './src/middleware/storage-guard.js';
import { rbacGuard } from './src/middleware/rbac.js';
import { versionAssets, readVersionedHtml } from './src/shared/asset-version.js';
import { logAudit } from './src/middleware/audit.js';
import { rocketsRouter } from './src/modules/rockets/rockets.routes.js';
import { notificationsRouter, startDeadlineScanner, createNotification } from './src/modules/notifications/notifications.routes.js';
import { requestLogger, buildHealth, recordError, installProcessErrorHandlers, startWatchdog } from './src/shared/observability.js';
import { esignRouter } from './src/modules/esign/esign.routes.js';
import { lgpdRouter } from './src/modules/lgpd/lgpd.routes.js';
import { dashboardRouter } from './src/modules/dashboard/dashboard.routes.js';
import { analyticsRouter } from './src/modules/analytics/analytics.routes.js';
import { syncRouter, syncComunicaApi, startSyncScheduler, registerSyncTask } from './src/modules/sync/sync.routes.js';
import { startEnvWatcher } from './src/shared/env-watch.js';
import { deadlineAlertsRouter, startDeadlineAlerts } from './src/modules/deadline-alerts/deadline-alerts.routes.js';
import { adminRequestsRouter } from './src/modules/adminrequests/adminrequests.routes.js';
import { kanbanRouter } from './src/modules/kanban/kanban.routes.js';
import { runMigrations } from './src/db/migrate.js';
import { validatePassword, PASSWORD_MIN, PASSWORD_MAX } from './src/shared/password-policy.js';
import { getClientIp } from './src/shared/net.js';
import { generateNextClientId, generateNextLawsuitId } from './src/shared/ids.js';
import { blogRouter } from './src/modules/blog/blog.routes.js';
import { renderBlogHtml } from './src/modules/blog/blog.render.js';
import { lawsuitsRouter } from './src/modules/lawsuits/lawsuits.routes.js';
import { explorerRouter } from './src/modules/explorer/explorer.routes.js';
import { officesRouter } from './src/modules/offices/offices.routes.js';
import { driveRouter } from './src/modules/drive/drive.routes.js';
import { calendarRouter } from './src/modules/calendar/calendar.routes.js';
import { calculateNoticeDays, calculateINSS, calculateINSSProgressivo, calculateIRRF, calculateVTDeduction, calculateFGTS } from './src/shared/labor.js';
import { hashPassword, verifyPassword, isStrongHash } from './src/shared/password-crypto.js';
import { hrRouter } from './src/modules/hr/hr.routes.js';
import { financialRouter } from './src/modules/financial/financial.routes.js';
import { generateNextClientFullId } from './src/shared/ids.js';
import { sendLawyerWhatsAppNotification } from './src/shared/notify.js';
import { clientsRouter } from './src/modules/clients/clients.routes.js';
import { leadsRouter } from './src/modules/leads/leads.routes.js';
import { visitsRouter } from './src/modules/visits/visits.routes.js';
import { juridicoRouter, seedCourtHolidays } from './src/modules/juridico/juridico.routes.js';
import { accessRouter, syncAllAccessPermissions } from './src/modules/access/access.routes.js';
import { authRouter } from './src/modules/auth/auth.routes.js';
import { clientPortalRouter } from './src/modules/client-portal/client-portal.routes.js';
import { adminRouter } from './src/modules/admin/admin.routes.js';
import { maintenanceRouter } from './src/modules/maintenance/maintenance.routes.js';
import { legaltechRouter } from './src/modules/legaltech/legaltech.routes.js';
import { legalDocsRouter } from './src/modules/legal-docs/legal-docs.routes.js';
import { metaAdsRouter } from './src/modules/meta-ads/meta-ads.routes.js';
import { siteContentRouter } from './src/modules/site/site-content.routes.js';
import { faqRouter } from './src/modules/faq/faq.routes.js';
import { roadmapRouter } from './src/modules/roadmap/roadmap.routes.js';
import { roadmapAgentRouter } from './src/modules/roadmap/roadmap.agent.js';
import { qaRouter } from './src/modules/qa/qa.routes.js';
import { ocrRouter } from './src/modules/ocr/ocr.routes.js';
import { recaptchaRouter } from './src/modules/recaptcha/recaptcha.routes.js';
import { bookingRouter, startBookingReminders } from './src/modules/booking/booking.routes.js';
import { indicatorsRouter } from './src/modules/indicators/indicators.routes.js';
import { loginRateLimit } from './src/shared/login-guard.js';
import { serveStoredFiles } from './src/middleware/stored-files.js';
import './src/db/schema.js'; // esquema do banco (por último entre os imports, como rodava antes no corpo do server.js)


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Variáveis de ambiente: carregadas em src/config/load-env.js (1º import), com suporte ao cofre .env.enc.

const app = express();
app.disable('x-powered-by'); // não expor a stack (Express)
const PORT = process.env.PORT || 3000;

// getClientIp foi movido para src/shared/net.js (util compartilhado, Cloudflare-aware).

// Configuração de Pastas de Armazenamento
const STORAGE_DIR = path.join(__dirname, 'storage', 'clients');
const STORAGE_DRIVE_DIR = path.join(__dirname, 'storage', 'office_drive');
// A conexão do banco (e o DB_PATH, com override por env) vive em src/config/db.js —
// fonte ÚNICA. server.js e todos os módulos usam a MESMA conexão (fim dos "dois cérebros").

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(STORAGE_DRIVE_DIR)) {
  fs.mkdirSync(STORAGE_DRIVE_DIR, { recursive: true });
}

// Banco: conexão única importada de src/config/db.js (ver import no topo).

// Configuração de Proxy Reverso e Confiança
app.set('trust proxy', 1);

// Middlewares de Segurança HTTP (HTTPS / Headers)
// Compressão HTTP (gzip/deflate) na origem. Em produção o Cloudflare já entrega
// Brotli no edge; este middleware garante respostas comprimidas mesmo em acesso
// DIRETO à origem (health checks, bypass do CDN, ambiente local). Import OPCIONAL:
// se o pacote 'compression' não estiver instalado no servidor, o sistema segue
// normalmente (Cloudflare cobre com Brotli) — nunca quebra o boot por causa disso.
try {
  const compression = createRequire(import.meta.url)('compression');
  app.use(compression({ threshold: 1024 }));
  console.log('🗜️  Compressão HTTP (gzip) ativa na origem.');
} catch (e) {
  console.warn('ℹ️  Pacote "compression" ausente — origem sem gzip (Cloudflare entrega Brotli). Rode "npm install" para ativar.');
}

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Geolocalização liberada para a PRÓPRIA origem (o site usa no modal de boas-vindas);
  // câmera e microfone seguem bloqueados.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  // Content-Security-Policy: permite exatamente os recursos externos usados hoje
  // (Google Fonts, jsDelivr/Chart.js, Facebook, Unsplash, QR, APIs .gov/CEP…) e
  // bloqueia o restante. O Tailwind agora é servido localmente (public/css/app.tailwind.css),
  // então 'unsafe-eval' e o CDN cdn.tailwindcss.com foram REMOVIDOS — nenhum script do
  // sistema usa eval/new Function. 'unsafe-inline' segue necessário pelos scripts inline.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https: https://lh3.googleusercontent.com https://www.googletagmanager.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://connect.facebook.net https://accounts.google.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
    "connect-src 'self' https: https://accounts.google.com https://oauth2.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://*.g.doubleclick.net",
    "frame-src 'self' https: https://accounts.google.com https://www.googletagmanager.com https://www.google.com https://maps.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/"
  ].join('; '));
  next();
});

// Middlewares Padrão
// SEGURANÇA: CORS restrito a origens explicitamente permitidas.
// Configure ALLOWED_ORIGINS no .env (separadas por vírgula). Sem valor => mesma origem apenas.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Mesma origem (o navegador envia Origin também em POST do próprio site) é sempre permitida:
// o Host da requisição é o do próprio site, então não é uma origem "de fora". Só origens de
// OUTRO site precisam estar em ALLOWED_ORIGINS. (Antes, o painel do domínio de homologação
// ficava bloqueado quando ALLOWED_ORIGINS não o listava.)
export function isSameOrigin(origin, host) {
  try {
    return !!host && new URL(origin).host.toLowerCase() === String(host).toLowerCase();
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  cors({
    origin(origin, callback) {
      // Requisições sem origin (apps nativos, curl, mesma origem) são permitidas
      if (!origin) return callback(null, true);
      if (isSameOrigin(origin, req.headers.host)) return callback(null, true);
      if (ALLOWED_ORIGINS.length === 0) return callback(null, true); // fallback dev
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origem não permitida pela política de CORS.'));
    },
    credentials: true
  })(req, res, next);
});
app.use(requestLogger()); // id de requisição + uma linha JSON por requisição (sem corpo, token ou query)
app.use(express.json({ limit: '25mb' })); // lotes de intimações (ingest) podem ser grandes
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check (monitoramento externo / uptime): checa o banco, o disco e se as tarefas automáticas estão rodando.
app.get('/health', (req, res) => { const h = buildHealth(db); res.status(h.status === 'fail' ? 503 : 200).json(h); });

// -------- RBAC no backend: FECHADO POR PADRÃO (src/middleware/rbac.js) ----------
// Toda rota /api é negada, exceto o que estiver explicitamente liberado por perfil.
// Corrige a brecha em que a sessão do portal do colaborador alcançava rotas do painel.
app.use(rbacGuard);

// Arquivos de clientes e Drive do escritório: exigem sessão (ver src/middleware/storage-guard.js)
app.use('/storage/clients', requireStorageAccess('clients'), serveStoredFiles(STORAGE_DIR));
app.use('/storage/office_drive', requireStorageAccess('drive'), serveStoredFiles(STORAGE_DRIVE_DIR));
app.use('/storage/marketing', express.static(path.join(__dirname, 'storage', 'marketing')));
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: '7d' }));
// /js contém o JS da APLICAÇÃO (painel/*.js, api.js) que muda a cada deploy.
// maxAge:0 + ETag = o browser REVALIDA a cada carga (304 se não mudou, barato) e
// pega updates imediatamente após o deploy — sem ficar preso a cache antigo.
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: 0, etag: true }));

// Roteadores Modulares
app.use(rocketsRouter);
app.use(notificationsRouter);
app.use(deadlineAlertsRouter);
app.use(esignRouter);
app.use(lgpdRouter);
app.use(dashboardRouter);
app.use(analyticsRouter);
app.use(syncRouter);
app.use(adminRequestsRouter);
app.use(kanbanRouter);
app.use(blogRouter);
app.use(lawsuitsRouter);
app.use(explorerRouter);
app.use(officesRouter);
app.use(driveRouter);
app.use(calendarRouter);
app.use(hrRouter);
app.use(financialRouter);
app.use(clientsRouter);
app.use(leadsRouter);
app.use(visitsRouter);
app.use(juridicoRouter);
app.use(accessRouter);
app.use(authRouter);
app.use(clientPortalRouter);
app.use(adminRouter);
app.use(maintenanceRouter);
app.use(legaltechRouter);
app.use(legalDocsRouter);
app.use(metaAdsRouter);
app.use(siteContentRouter);
app.use(faqRouter);
app.use(roadmapRouter);
app.use(roadmapAgentRouter);
app.use(qaRouter);
app.use(ocrRouter);
app.use(recaptchaRouter);
app.use(bookingRouter);
app.use(indicatorsRouter);


// Rota de Sitemap XML Dinâmico para o Googlebot / Google Search Console
app.get('/sitemap.xml', (req, res) => {
  try {
    const domain = req.protocol + '://' + req.get('host');
    const posts = db.prepare(`SELECT slug, updated_at FROM blog_posts WHERE is_published = 1`).all();
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Páginas estáticas principais
    xml += `  <url><loc>${domain}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${domain}/blog</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${domain}/cliente</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>\n`;
    
    // URLs dinâmicas dos artigos do Blog
    posts.forEach(p => {
      const lastMod = p.updated_at ? p.updated_at.split('T')[0] : new Date().toISOString().split('T')[0];
      xml += `  <url><loc>${domain}/blog/${p.slug}</loc><lastmod>${lastMod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    });
    
    xml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (e) {
    return res.status(500).send('Erro ao gerar sitemap.');
  }
});

// Rota de Instruções para Robôs de Busca do Google (/robots.txt)
app.get('/robots.txt', (req, res) => {
  const domain = req.protocol + '://' + req.get('host');
  const txt = `User-agent: *\nAllow: /\nDisallow: /painel\nDisallow: /api/\n\nSitemap: ${domain}/sitemap.xml`;
  res.header('Content-Type', 'text/plain');
  return res.send(txt);
});

// Função utilitária para entregar arquivos HTML sempre frescos sem cache agressivo
function sendFreshFile(res, fileName) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  // Scripts/estilos com ?v=<versão do deploy>: o navegador não reaproveita versão antiga
  return res.type('html').send(readVersionedHtml(path.join(__dirname, fileName)));
}

// ---------------------------------------------------------------------------
// Injeção de SEO/Analytics no index.html a partir do .env.
// O index.html traz placeholders (META_PIXEL_ID_HERE, etc.). Se as variáveis
// não estiverem definidas, os blocos são REMOVIDOS — assim não sobra
// `fbq('init','META_PIXEL_ID_HERE')` disparando erro no console nem o pixel
// <noscript> fazendo request quebrada ao Facebook em toda visita. Quando o
// cliente preencher os IDs no .env, os blocos passam a valer sem editar HTML.
// Cache por mtime: relê o arquivo só quando ele muda.
// ---------------------------------------------------------------------------
let __indexHtmlCache = { mtimeMs: 0, envSig: '', html: null };
function renderIndexHtml() {
  const file = path.join(__dirname, 'index.html');
  const stat = fs.statSync(file);
  const pixel = (process.env.META_PIXEL_ID || '1773978237179877').trim();
  const ga = (process.env.GA_MEASUREMENT_ID || 'G-H4K6S068SW').trim();
  const gtm = (process.env.GTM_CONTAINER_ID || '').trim();
  const gads = (process.env.GOOGLE_ADS_ID || 'AW-18491088928').trim();
  const mapsKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const recaptchaKey = (process.env.RECAPTCHA_SITE_KEY || '').trim();
  const fbVerify = (process.env.META_BUSINESS_VERIFICATION || '4muf0aevm7zirobf01gdphiva6op9z').trim();
  const gscVerify = (process.env.GSC_VERIFICATION || '').trim();
  const envSig = [pixel, ga, gtm, gads, mapsKey, recaptchaKey, fbVerify, gscVerify].join('|');

  if (__indexHtmlCache.html && __indexHtmlCache.mtimeMs === stat.mtimeMs && __indexHtmlCache.envSig === envSig) {
    return __indexHtmlCache.html;
  }

  let html = fs.readFileSync(file, 'utf8');

  // Meta Pixel (Facebook/Instagram)
  if (pixel) {
    html = html.split('META_PIXEL_ID_HERE').join(pixel);
  } else {
    html = html.replace(/<!-- Meta Pixel Code[\s\S]*?<\/script>/, '<!-- Meta Pixel desativado (defina META_PIXEL_ID no .env) -->');
    html = html.replace(/\s*<!-- Fallback do Meta Pixel[\s\S]*?<\/noscript>/, '');
  }

  // Verificação de domínio do Meta Business
  if (fbVerify) html = html.split('META_BUSINESS_VERIFICATION_KEY_HERE').join(fbVerify);
  else html = html.replace(/\s*<meta name="facebook-domain-verification"[^>]*>/, '');

  // Verificação do Google Search Console via meta tag (a verificação por arquivo
  // /google...html já está ativa; a meta só entra se GSC_VERIFICATION for definida).
  if (gscVerify) html = html.split('GSC_VERIFICATION_KEY_HERE').join(gscVerify);
  else html = html.replace(/\s*<meta name="google-site-verification"[^>]*>/, '');

  // Google Tag Manager (GTM)
  if (gtm) {
    const gtmHead = `  <!-- Google Tag Manager -->\n` +
      `  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
      `  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
      `  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
      `  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
      `  })(window,document,'script','dataLayer','${gtm}');</script>\n` +
      `  <!-- End Google Tag Manager -->\n</head>`;
    const gtmBody = `<body class="bg-warm-50 text-slate-800 font-sans antialiased overflow-x-hidden w-full selection:bg-gold-500 selection:text-white">\n` +
      `  <!-- Google Tag Manager (noscript) -->\n` +
      `  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}"\n` +
      `  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n` +
      `  <!-- End Google Tag Manager (noscript) -->`;
    html = html.replace('</head>', gtmHead);
    html = html.replace(/<body class="[^"]*">/, gtmBody);
  } else if (ga || gads) {
    // Google Analytics 4 (GA4) & Google Ads (gtag.js) direto quando GTM não for usado
    const primaryId = ga || gads;
    const gaSnippet = `  <!-- Google tag (gtag.js) / GA4 & Google Ads -->\n` +
      `  <script async src="https://www.googletagmanager.com/gtag/js?id=${primaryId}"></script>\n` +
      `  <script>\n` +
      `    window.dataLayer = window.dataLayer || [];\n` +
      `    function gtag(){dataLayer.push(arguments);}\n` +
      `    gtag('js', new Date());\n` +
      (ga ? `    gtag('config', '${ga}', { send_page_view: true });\n` : '') +
      (gads ? `    gtag('config', '${gads}');\n` : '') +
      `  </script>\n</head>`;
    html = html.replace('</head>', gaSnippet);
  }

  // Google Maps Embed API Oficial
  if (mapsKey) {
    const mapsEmbedUrl = `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=Rua+Henrique+Dias,+259+-+Benfica,+Juiz+de+Fora+-+MG,+36080-000`;
    html = html.replace(/src="https:\/\/maps\.google\.com\/maps\?q=[^"]*"/, `src="${mapsEmbedUrl}"`);
  }

  // Google reCAPTCHA v3 (Anti-Abuso Invisível)
  if (recaptchaKey) {
    const recaptchaSnippet = `  <!-- Google reCAPTCHA v3 -->\n` +
      `  <script src="https://www.google.com/recaptcha/api.js?render=${recaptchaKey}" async defer></script>\n` +
      `  <script>window.__RECAPTCHA_SITE_KEY='${recaptchaKey}';</script>\n</head>`;
    html = html.replace('</head>', recaptchaSnippet);
  }

  html = versionAssets(html);
  __indexHtmlCache = { mtimeMs: stat.mtimeMs, envSig, html };
  return html;
}

// Rota para Service Worker (sempre fresco)
app.get('/sw.js', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/javascript'
  });
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Rota da Página Principal e Painel de Controle
// SEGURANÇA: NÃO servir o diretório-raiz inteiro (isso exporia leads.db, server.js,
// .git, backups, etc.). Servimos apenas os assets públicos explicitamente permitidos.
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
  dotfiles: 'deny'
}));
app.use('/dist', express.static(path.join(__dirname, 'dist'), { maxAge: '7d' }));

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/favicon.svg', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Verificação de propriedade do Google Search Console (método arquivo HTML).
app.get('/google964cd851b1cb11b6.html', (req, res) => {
  res.type('text/html').send('google-site-verification: google964cd851b1cb11b6.html');
});

// IndexNow — chave para notificar Bing/Yahoo/DuckDuckGo/Yandex sobre URLs novas.
app.get('/34862b9289f761b05eb3d22ee2cd7176.txt', (req, res) => {
  res.type('text/plain').send('34862b9289f761b05eb3d22ee2cd7176');
});

// Página principal do site institucional
app.get('/', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  try {
    res.type('html').send(renderIndexHtml());
  } catch (e) {
    console.warn('[SEO] Falha ao renderizar index.html com env, servindo estático:', e.message);
    sendFreshFile(res, 'index.html');
  }
});

app.get('/painel', (req, res) => {
  sendFreshFile(res, 'painel.html');
});

app.get('/admin', (req, res) => {
  res.redirect('/painel');
});

app.get('/cliente', (req, res) => {
  sendFreshFile(res, 'cliente.html');
});

// Portal de Upload Mágico de Documentos sem Senha (Mobile)
app.get(['/anexar', '/anexar.html'], (req, res) => {
  sendFreshFile(res, 'anexar.html');
});

// Assinador Eletrônico de Contratos e Procurações
app.get(['/assinar', '/assinar.html'], (req, res) => {
  sendFreshFile(res, 'assinar.html');
});

// Laboratório de Testes Práticos e Demonstração em Tempo Real
app.get(['/teste-pratico', '/teste-pratico.html'], (req, res) => {
  sendFreshFile(res, 'teste-pratico.html');
});

// Demonstração Visual da Caixa de Boas-Vindas
app.get(['/exemplo-boas-vindas', '/exemplo-boas-vindas.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'exemplo-boas-vindas.html'));
});

app.get('/portal-cliente', (req, res) => {
  sendFreshFile(res, 'cliente.html');
});

app.get('/area-do-cliente', (req, res) => {
  sendFreshFile(res, 'cliente.html');
});

// Portal do Colaborador / Autoatendimento do Trabalhador
app.get('/colaborador', (req, res) => {
  sendFreshFile(res, 'colaborador.html');
});

app.get('/portal-colaborador', (req, res) => {
  sendFreshFile(res, 'colaborador.html');
});

app.get('/area-do-colaborador', (req, res) => {
  sendFreshFile(res, 'colaborador.html');
});

app.get('/funcionario', (req, res) => {
  sendFreshFile(res, 'colaborador.html');
});

app.get('/blog', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  res.type('html').send(renderBlogHtml());
});

app.get('/blog/:slug', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  res.type('html').send(renderBlogHtml(req.params.slug));
});

app.get('/artigos', (req, res) => {
  res.redirect(301, '/blog');
});

// Vitrine do Advogado • Parceiro & Colaborador Amazon
app.get(['/amazon', '/amazon.html', '/amazon-colaborador', '/amazon-colaborador.html', '/parceiro-amazon', '/vitrine-amazon'], (req, res) => {
  sendFreshFile(res, 'amazon-colaborador.html');
});

// ================= ROTAS DE AUTENTICAÇÃO =================

// login-guard (rate-limit + bloqueio progressivo) movido para src/shared/login-guard.js

// ===== AUTH (login/me/logout): extraído para src/modules/auth/auth.routes.js =====

// ===== USUÁRIOS & ACESSO: extraído para src/modules/access/access.routes.js =====

// ================= ROTAS DE GESTÃO DE CLIENTES & CONTRATOS =================

// ===== CLIENTES: extraído para src/modules/clients/clients.routes.js =====

// ===== ESCRITÓRIOS: extraído para src/modules/offices/offices.routes.js =====

// ===== DRIVE: extraído para src/modules/drive/drive.routes.js =====

// ===== ROTAS DE PROCESSOS: extraídas para src/modules/lawsuits/lawsuits.routes.js =====

// ===== LEADS: extraído para src/modules/leads/leads.routes.js =====

// ================= ROTAS DO MÓDULO FINANCEIRO & ASAAS =================

// 1. Configurações Financeiras & Asaas API
// ===== FINANCEIRO: extraído para src/modules/financial/financial.routes.js =====

// ================= ROTAS DO PORTAL DO CLIENTE (ÁREA DO CLIENTE) =================

// 1. Cadastro do Cliente (Pessoa Física ou Pessoa Jurídica)
// ===== PORTAL CLIENTE (register): extraído para src/modules/client-portal/ =====

// ===== ADMIN (whatsapp/test): extraído para src/modules/admin/ =====

// 2. Login do Cliente (por CPF, CNPJ ou E-mail + Senha)
// ===== PORTAL CLIENTE (login+): extraído para src/modules/client-portal/ =====

// ===== ROTAS DO BLOG: extraídas para src/modules/blog/blog.routes.js (blogRouter) =====

// ================= ROTAS DE AUDITORIA E TRILHA DE HISTÓRICO =================

// 1. Listar Logs de Auditoria com Filtros Avançados e Paginação (Admin)
// ===== ADMIN (auditoria/visitas/pré-clientes): extraído para src/modules/admin/ =====

// =========================================================================
// MÓDULO RADAR JUDICIAL: INTEGRAÇÃO DATAJUD CNJ, MNI & TRIBUNAIS SUPERIORES
// =========================================================================

// 1. Tabela de Cache de Consultas Judiciais
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS judicial_search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_type TEXT NOT NULL,
      query_term TEXT NOT NULL,
      tribunal TEXT NOT NULL DEFAULT 'all',
      total_results INTEGER DEFAULT 0,
      results_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_judicial_cache ON judicial_search_cache(query_type, query_term, tribunal);
  `);
} catch (e) {
  console.warn('Erro ao criar tabela judicial_search_cache:', e);
}

// ===== JURÍDICO (radar/court/judicial): extraído para src/modules/juridico/juridico.routes.js =====

// =============================================================================
// ⚡ MÓDULO DE AUTOMAÇÃO, INTEGRAÇÃO DE CAMPOS & LOOKUPS UNIVERSAIS
// =============================================================================

// 1. GET /api/lookup/cep/:cep - Consulta Universal de CEP com fallback e cache
app.get('/api/lookup/cep/:cep', async (req, res) => {
  try {
    const rawCep = (req.params.cep || '').replace(/\D/g, '');
    if (rawCep.length !== 8) {
      return res.status(400).json({ error: 'CEP deve conter exatamente 8 dígitos numéricos.' });
    }

    // 1. Tentar ViaCEP
    try {
      const vRes = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`, { signal: AbortSignal.timeout(3000) });
      if (vRes.ok) {
        const vData = await vRes.json();
        if (!vData.erro) {
          return res.json({
            success: true,
            source: 'viacep',
            cep: vData.cep || `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`,
            street: vData.logradouro || '',
            complement: vData.complemento || '',
            neighborhood: vData.bairro || '',
            city: vData.localidade || '',
            state: vData.uf || '',
            ibge: vData.ibge || '',
            formatted_address: `${vData.logradouro || ''}, ${vData.bairro || ''} - ${vData.localidade || ''}/${vData.uf || ''}`.trim()
          });
        }
      }
    } catch (e) {
      // Fallback para BrasilAPI
    }

    // 2. Fallback: BrasilAPI
    try {
      const bRes = await fetch(`https://brasilapi.com.br/api/cep/v1/${rawCep}`, { signal: AbortSignal.timeout(3000) });
      if (bRes.ok) {
        const bData = await bRes.json();
        return res.json({
          success: true,
          source: 'brasilapi',
          cep: `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`,
          street: bData.street || '',
          complement: '',
          neighborhood: bData.neighborhood || '',
          city: bData.city || '',
          state: bData.state || '',
          ibge: '',
          formatted_address: `${bData.street || ''}, ${bData.neighborhood || ''} - ${bData.city || ''}/${bData.state || ''}`.trim()
        });
      }
    } catch (e) {}

    return res.status(404).json({ error: 'Endereço não localizado para este CEP.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao consultar CEP: ' + err.message });
  }
});

// 2. GET /api/lookup/cnpj/:cnpj - Consulta Universal de CNPJ com dados cadastrais e QSA
app.get('/api/lookup/cnpj/:cnpj', async (req, res) => {
  try {
    const rawCnpj = (req.params.cnpj || '').replace(/\D/g, '');
    if (rawCnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ deve conter 14 dígitos numéricos.' });
    }

    // 1. Tentar BrasilAPI
    try {
      const bRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`, { signal: AbortSignal.timeout(4000) });
      if (bRes.ok) {
        const d = await bRes.json();
        
        let repName = '';
        let repCpf = '';
        if (d.qsa && Array.isArray(d.qsa) && d.qsa.length > 0) {
          const admin = d.qsa.find(q => (q.qualificacao_socio || '').toLowerCase().includes('administrador') || (q.qualificacao_socio || '').toLowerCase().includes('titular') || (q.qualificacao_socio || '').toLowerCase().includes('diretor')) || d.qsa[0];
          repName = admin.nome_socio || '';
          repCpf = admin.cnpj_cpf_do_socio || '';
        }

        const formattedCnpj = rawCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        const formattedCep = d.cep ? String(d.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
        const phone = d.ddd_telefone_1 ? `(${d.ddd_telefone_1.slice(0, 2)}) ${d.ddd_telefone_1.slice(2)}` : '';

        return res.json({
          success: true,
          source: 'brasilapi',
          cnpj: formattedCnpj,
          corporate_name: d.razao_social || '',
          trade_name: d.nome_fantasia || d.razao_social || '',
          status: d.descricao_situacao_cadastral || 'Ativa',
          cnae: d.cnae_fiscal_descricao || '',
          street: d.logradouro || '',
          number: d.numero || '',
          complement: d.complemento || '',
          neighborhood: d.bairro || '',
          city: d.municipio || '',
          state: d.uf || 'MG',
          cep: formattedCep,
          email: (d.email || '').toLowerCase(),
          phone: phone,
          rep_name: repName,
          rep_cpf: repCpf,
          qsa: d.qsa || []
        });
      }
    } catch (e) {}

    // 2. Fallback ReceitaWS
    try {
      const rRes = await fetch(`https://receitaws.com.br/v1/cnpj/${rawCnpj}`, { signal: AbortSignal.timeout(4000) });
      if (rRes.ok) {
        const d = await rRes.json();
        if (d.status !== 'ERROR') {
          let repName = '';
          if (d.qsa && Array.isArray(d.qsa) && d.qsa.length > 0) {
            repName = d.qsa[0].nome || '';
          }
          return res.json({
            success: true,
            source: 'receitaws',
            cnpj: d.cnpj || rawCnpj,
            corporate_name: d.nome || '',
            trade_name: d.fantasia || d.nome || '',
            status: d.situacao || 'Ativa',
            cnae: d.atividade_principal?.[0]?.text || '',
            street: d.logradouro || '',
            number: d.numero || '',
            complement: d.complemento || '',
            neighborhood: d.bairro || '',
            city: d.municipio || '',
            state: d.uf || 'MG',
            cep: d.cep || '',
            email: (d.email || '').toLowerCase(),
            phone: d.telefone || '',
            rep_name: repName,
            rep_cpf: '',
            qsa: d.qsa || []
          });
        }
      }
    } catch (e) {}

    return res.status(404).json({ error: 'Dados do CNPJ não localizados na Receita Federal.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao consultar CNPJ: ' + err.message });
  }
});

// 3. GET /api/lookup/person/:cpf - Busca unificada de pessoa em todo o banco local (clientes, colaboradores, membros, leads)
app.get('/api/lookup/person/:cpf', requireAuth, (req, res) => {
  try {
    const rawCpf = (req.params.cpf || '').replace(/\D/g, '');
    if (rawCpf.length !== 11) {
      return res.status(400).json({ error: 'CPF deve conter 11 dígitos numéricos.' });
    }

    // Busca em clients
    const client = db.prepare(`
      SELECT * FROM clients 
      WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
    `).get(rawCpf);

    if (client) {
      return res.json({
        success: true,
        source: 'client',
        person: {
          type: 'client',
          source_type: 'Cliente Cadastrado',
          id: client.id,
          full_name: client.full_name,
          cpf: client.cpf,
          rg: client.rg || '',
          nationality: client.nationality || 'brasileiro(a)',
          marital_status: client.marital_status || 'solteiro(a)',
          profession: client.profession || '',
          filiation_father: client.filiation_father || '',
          filiation_mother: client.filiation_mother || '',
          email: client.email || '',
          phone: client.phone || '',
          street: client.street || '',
          number: client.number || '',
          complement: client.complement || '',
          neighborhood: client.neighborhood || '',
          city: client.city || '',
          state: client.state || '',
          cep: client.cep || '',
          contract_value: client.contract_value || 0,
          contract_status: client.contract_status || 'Ativo'
        }
      });
    }

    // Busca em hr_employees
    const employee = db.prepare(`
      SELECT * FROM hr_employees 
      WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
    `).get(rawCpf);

    if (employee) {
      return res.json({
        success: true,
        source: 'employee',
        person: {
          type: 'employee',
          source_type: 'Colaborador RH/DP',
          id: employee.id,
          full_name: employee.name,
          cpf: employee.cpf,
          rg: employee.rg || '',
          nationality: employee.nationality || 'brasileiro(a)',
          marital_status: employee.marital_status || 'solteiro(a)',
          profession: employee.position || '',
          filiation_father: employee.filiation_father || '',
          filiation_mother: employee.filiation_mother || '',
          email: employee.email || '',
          phone: employee.phone || '',
          street: employee.street || '',
          number: employee.number || '',
          complement: employee.complement || '',
          neighborhood: employee.neighborhood || '',
          city: employee.city || '',
          state: employee.state || '',
          cep: employee.cep || '',
          position: employee.position || '',
          salary: employee.salary || 0
        }
      });
    }

    // Busca em office_members
    const member = db.prepare(`
      SELECT * FROM office_members 
      WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
    `).get(rawCpf);

    if (member) {
      return res.json({
        success: true,
        source: 'office_member',
        person: {
          type: 'office_member',
          source_type: 'Membro / Advogado do Escritório',
          id: member.id,
          full_name: member.name,
          cpf: member.cpf,
          rg: member.rg || '',
          nationality: 'brasileiro(a)',
          marital_status: 'solteiro(a)',
          profession: member.role_type === 'advogado' ? 'Advogado(a)' : 'Operador(a) Jurídico(a)',
          oab: member.oab || '',
          oab_uf: member.oab_uf || 'MG',
          email: member.email || '',
          phone: member.phone || '',
          street: member.street || '',
          number: member.number || '',
          complement: member.complement || '',
          neighborhood: member.neighborhood || '',
          city: member.city || '',
          state: member.state || 'MG',
          cep: member.cep || ''
        }
      });
    }

    // Busca em leads
    const lead = db.prepare(`
      SELECT * FROM leads 
      WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
    `).get(rawCpf);

    if (lead) {
      return res.json({
        success: true,
        source: 'lead',
        person: {
          type: 'lead',
          source_type: 'Atendimento / Lead',
          id: lead.id,
          full_name: lead.name,
          cpf: lead.cpf,
          email: lead.email || '',
          phone: lead.phone || '',
          city: lead.city || '',
          notes: lead.notes || lead.message || ''
        }
      });
    }

    return res.status(404).json({ error: 'Nenhum registro anterior localizado para este CPF.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao consultar CPF: ' + err.message });
  }
});

// 4. GET /api/lookup/cnj/:cnj - Decodificador Estrutural CNJ + Busca em Radar e Base de Dados
app.get('/api/lookup/cnj/:cnj', requireAuth, async (req, res) => {
  try {
    const rawCnj = (req.params.cnj || '').replace(/\D/g, '');
    if (rawCnj.length !== 20) {
      return res.status(400).json({ error: 'Número CNJ deve conter 20 dígitos numéricos.' });
    }

    // NNNNNNN-DD.AAAA.J.TR.OOOO
    const seq = rawCnj.slice(0, 7);
    const dig = rawCnj.slice(7, 9);
    const year = rawCnj.slice(9, 13);
    const ramo = rawCnj.slice(13, 14); // 8 = Estadual, 4 = Federal, 5 = Trabalho
    const trib = rawCnj.slice(14, 16); // 13 = MG, 01 = RJ, 02 = SP
    const foro = rawCnj.slice(16, 20); // 0133 = Carangola, 0024 = BH, 0145 = JF

    const formattedCnj = `${seq}-${dig}.${year}.${ramo}.${trib}.${foro}`;

    // Mapeamento Inteligente de Tribunal
    let tribunalName = 'Tribunal de Justiça de Minas Gerais (TJMG)';
    let instance = '1ª Instância';
    let courtBranch = `Vara Cível da Comarca de ${foro === '0133' ? 'Carangola' : (foro === '0145' ? 'Juiz de Fora' : (foro === '0024' ? 'Belo Horizonte' : 'Origem CNJ'))}`;

    if (ramo === '8' && trib === '13') {
      tribunalName = 'TJMG - Tribunal de Justiça de Minas Gerais';
    } else if (ramo === '4' && trib === '06') {
      tribunalName = 'TRF6 - Tribunal Regional Federal da 6ª Região';
      instance = 'Vara Federal Subseção Judiciária';
    } else if (ramo === '5' && trib === '03') {
      tribunalName = 'TRT3 - Tribunal Regional do Trabalho da 3ª Região';
      instance = 'Vara do Trabalho';
    } else if (ramo === '1') {
      tribunalName = 'STF - Supremo Tribunal Federal';
      instance = 'Tribunal Superior';
    } else if (ramo === '3') {
      tribunalName = 'STJ - Superior Tribunal de Justiça';
      instance = 'Tribunal Superior';
    }

    // Verificar se já existe cadastrado no banco local em lawsuits
    const localLawsuit = db.prepare(`
      SELECT l.*, c.full_name as client_name, c.cpf as client_cpf 
      FROM lawsuits l
      LEFT JOIN clients c ON l.client_id = c.id
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(l.cnj_number, '.', ''), '-', ''), '/', ''), ' ', '') = ?
    `).get(rawCnj);

    if (localLawsuit) {
      return res.json({
        success: true,
        source: 'local_database',
        cnj: localLawsuit.cnj_number,
        tribunal: localLawsuit.tribunal,
        instance: localLawsuit.instance,
        action_type: localLawsuit.action_type,
        court_branch: localLawsuit.court_branch,
        subject: localLawsuit.subject,
        judge_name: localLawsuit.judge_name,
        distribution_date: localLawsuit.distribution_date,
        status: localLawsuit.status,
        client_id: localLawsuit.client_id,
        client_name: localLawsuit.client_name,
        notes: localLawsuit.notes
      });
    }

    const lawsuitData = {
      cnj: formattedCnj,
      tribunal: tribunalName,
      instance: instance,
      court_branch: courtBranch,
      action_type: 'Ação de Conhecimento / Procedimento Comum',
      subject: 'Direito Civil / Obrigações e Contratos',
      judge_name: 'Juiz(a) Titular da Vara',
      distribution_date: `${year}-02-15`,
      status: 'Em Andamento',
      year: year
    };

    return res.json({
      success: true,
      source: 'cnj_parser',
      lawsuit: lawsuitData,
      ...lawsuitData
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao analisar CNJ: ' + err.message });
  }
});

// 5. POST /api/documents/generate-template - Gerador Automático de Peças e Documentos Jurídicos
app.post('/api/documents/generate-template', requireAuth, (req, res) => {
  try {
    const doc_type = req.body.template_type || req.body.doc_type;
    const { client_id, lawsuit_id, custom_clause } = req.body;

    if (!doc_type || !client_id) {
      return res.status(400).json({ error: 'Tipo do documento e ID do cliente são obrigatórios.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    let lawsuit = null;
    if (lawsuit_id) {
      lawsuit = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(lawsuit_id);
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const isPJ = client.client_type === 'PJ';

    // Qualificação do Cliente
    let clientQualif = '';
    if (isPJ) {
      clientQualif = `<strong>${client.full_name}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº <strong>${client.cnpj || '—'}</strong>, com sede na ${client.street || ''}, nº ${client.number || 'S/N'}, ${client.complement || ''}, Bairro ${client.neighborhood || ''}, CEP ${client.cep || ''}, ${client.city || ''} - ${client.state || 'MG'}, neste ato representada por seu sócio/administrador <strong>${client.rep_name || 'Representante Legal'}</strong>, portador do CPF nº <strong>${client.rep_cpf || '—'}</strong>`;
    } else {
      clientQualif = `<strong>${client.full_name}</strong>, ${client.nationality || 'brasileiro(a)'}, ${client.marital_status || 'solteiro(a)'}, ${client.profession || 'autônomo(a)'}, portador(a) do RG nº <strong>${client.rg || '—'}</strong> e inscrito(a) no CPF/MF sob o nº <strong>${client.cpf || '—'}</strong>, residente e domiciliado(a) na ${client.street || ''}, nº ${client.number || 'S/N'}, ${client.complement || ''}, Bairro ${client.neighborhood || ''}, CEP ${client.cep || ''}, na cidade de ${client.city || ''} - ${client.state || 'MG'}, e-mail: ${client.email || '—'}, telefone: ${client.phone || '—'}`;
    }

    // Qualificação do Advogado (Dr. Jorge Alvim)
    const lawyerQualif = `<strong>DR. JORGE ALVIM</strong>, advogado inscrito na Ordem dos Advogados do Brasil, Seccional de Minas Gerais, sob o <strong>OAB/MG nº 142.890</strong>, com escritório profissional sediado na Rua Halfeld, 805, 12º Andar, Centro, Juiz de Fora - MG, CEP 36010-001, e-mail: <em>contato@jorgealvimadvocacia.com.br</em>, WhatsApp: <em>(32) 99841-8980</em>`;

    let title = '';
    let bodyHtml = '';

    if (doc_type === 'procuracao') {
      title = 'PROCURAÇÃO AD JUDICIA ET EXTRA';
      bodyHtml = `
        <p class="mb-4 text-justify"><strong>OUTORGANTE:</strong> ${clientQualif}.</p>
        <p class="mb-4 text-justify"><strong>OUTORGADO:</strong> ${lawyerQualif}, e aos integrantes da sociedade <strong>JORGE ALVIM ADVOCACIA & TECNOLOGIA</strong>.</p>
        <p class="mb-4 text-justify"><strong>PODERES:</strong> Por este instrumento particular, o(a) OUTORGANTE confere ao(s) OUTORGADO(S) amplos e gerais poderes para o foro em geral, com a cláusula <em>"ad judicia et extra"</em>, em qualquer Juízo, Tribunal ou Instância, para propor as ações competentes e defendê-lo(a) nas que lhe forem contrárias, conferindo-lhes, ainda, poderes especiais para confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, firmar compromissos ou acordos, receber e dar quitação, assinar termos de declaração de hipossuficiência, substabelecer com ou sem reserva, praticando todos os demais atos indispensáveis ao bom e fiel cumprimento deste mandato.</p>
        ${lawsuit ? `<p class="mb-4 text-justify"><strong>FINALIDADE ESPECÍFICA:</strong> Atuar nos autos do processo nº <strong>${lawsuit.cnj_number}</strong> (${lawsuit.action_type || 'Ação Judicial'}), em trâmite perante a ${lawsuit.court_branch || 'Vara Competente'} do ${lawsuit.tribunal || 'Tribunal de Justiça'}.</p>` : ''}
      `;
    } else if (doc_type === 'hipossuficiencia') {
      title = 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA (JUSTIÇA GRATUITA)';
      bodyHtml = `
        <p class="mb-6 text-justify"><strong>DECLARANTE:</strong> ${clientQualif}.</p>
        <p class="mb-6 text-justify"><strong>DECLARA</strong>, para os devidos fins de direito, em consonância com o Artigo 5º, inciso LXXIV da Constituição Federal de 1988 e Artigos 98 e seguintes do Código de Processo Civil (Lei 13.105/2015), que <strong>não possui condições financeiras de arcar com as custas processuais, taxas judiciárias e honorários advocatícios</strong> sem prejuízo de seu próprio sustento e de sua família.</p>
        <p class="mb-6 text-justify">Por ser a expressão fiel da verdade, e ciente das penalidades cominadas no Art. 299 do Código Penal Brasileiro, firma a presente declaração para que produza seus efeitos jurídicos e legais.</p>
      `;
    } else if (doc_type === 'contrato_honorarios') {
      title = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS & HONORÁRIOS';
      const contractVal = (client.contract_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const instCount = client.installments_count || 1;
      const instVal = (client.installment_value || (client.contract_value || 0) / instCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      bodyHtml = `
        <p class="mb-4 text-justify"><strong>CONTRATANTE:</strong> ${clientQualif}.</p>
        <p class="mb-4 text-justify"><strong>CONTRATADO:</strong> ${lawyerQualif}, integrando o escritório <strong>JORGE ALVIM ADVOCACIA & TECNOLOGIA</strong>.</p>
        <p class="mb-4 text-justify"><strong>CLÁUSULA 1ª - DO OBJETO:</strong> O CONTRATADO prestará assistência jurídica profissional ao CONTRATANTE ${lawsuit ? `nos autos da demanda nº <strong>${lawsuit.cnj_number}</strong> (${lawsuit.action_type || 'Ação Judicial'}) perante o ${lawsuit.tribunal}` : 'na defesa de seus direitos e interesses judiciais e extrajudiciais'}.</p>
        <p class="mb-4 text-justify"><strong>CLÁUSULA 2ª - DOS HONORÁRIOS:</strong> Em remuneração pelos serviços advocatícios ora contratados, o CONTRATANTE pagará ao CONTRATADO o valor total de <strong>${contractVal}</strong>, a ser adimplido em <strong>${instCount} parcela(s)</strong> de <strong>${instVal}</strong> cada, com vencimento estipulado a partir de <strong>${client.due_date || 'data da assinatura'}</strong>.</p>
        <p class="mb-4 text-justify"><strong>CLÁUSULA 3ª - DO FORO:</strong> Para dirimir qualquer dúvida decorrente do presente contrato, as partes elegem o foro da Comarca de Juiz de Fora - MG.</p>
      `;
    } else {
      title = 'FICHA CADASTRAL & QUALIFICAÇÃO INTEGRADA';
      bodyHtml = `
        <p class="mb-4 text-justify"><strong>DADOS CADASTRAIS CONSOLIDADOS:</strong></p>
        <div class="p-4 bg-slate-50 border rounded-xl space-y-2 text-sm">
          <div><strong>Nome Completo:</strong> ${client.full_name}</div>
          <div><strong>Documento:</strong> ${isPJ ? 'CNPJ ' + client.cnpj : 'CPF ' + client.cpf + ' | RG ' + (client.rg || '—')}</div>
          <div><strong>Endereço:</strong> ${client.street || ''}, ${client.number || ''} ${client.complement || ''} - ${client.neighborhood || ''}, ${client.city || ''}/${client.state || ''} - CEP ${client.cep || ''}</div>
          <div><strong>Contatos:</strong> Telefone/WhatsApp: ${client.phone} | E-mail: ${client.email || '—'}</div>
          <div><strong>Status do Contrato:</strong> ${client.contract_status || 'Ativo'} | Valor: ${(client.contract_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        </div>
      `;
    }

    const documentObj = {
      template_type: doc_type,
      title,
      date_formatted: `${client.city || 'Juiz de Fora - MG'}, ${formattedDate}`,
      client_name: client.full_name,
      content: bodyHtml
    };

    return res.json({
      success: true,
      document: documentObj,
      doc_type,
      title,
      date_text: `${client.city || 'Juiz de Fora - MG'}, ${formattedDate}`,
      client_name: client.full_name,
      body_html: bodyHtml
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar documento: ' + err.message });
  }
});

// =============================================================================
// 👥 MÓDULO DE GESTÃO DE PESSOAL (RH / DP) - CLT E ART. 7º DA CF/88
// =============================================================================

/**
 * 1. Funções Especializadas de Matemática Trabalhista e Previdenciária (CLT 2026)
 */

// Cálculo de INSS Progressivo 2026
// cálculos de folha movidos para src/shared/labor.js

// Inicialização / Seeder do Módulo de Gestão de Pessoal (RH)
try {
  const empCount = db.prepare(`SELECT count(*) as count FROM hr_employees`).get().count;
  // SEGURANÇA: só semeia colaboradores FICTÍCIOS de demonstração quando explicitamente
  // pedido (SEED_DEMO_RH=true). Antes rodava sempre que a tabela ficava vazia — o que
  // RECRIAVA os 8 colaboradores de demo em produção a cada restart, desfazendo a limpeza.
  if (empCount === 0 && process.env.SEED_DEMO_RH === 'true') {
    console.log('🌱 [SEEDER RH] Populando quadro de pessoal com dados da equipe do escritório...');
    
    // Obter integrantes existentes do office_members
    const members = db.prepare(`SELECT * FROM office_members`).all();

    const sampleEmployees = [
      {
        name: 'Patricia Souza Silva',
        cpf: '321.654.987-33',
        rg: 'MG-15.432.109',
        birth_date: '1992-05-14',
        gender: 'Feminino',
        marital_status: 'Casada',
        ctps_number: '8765432',
        ctps_series: '0012',
        ctps_uf: 'MG',
        pis_pasep: '128.45678.90-1',
        admission_date: '2024-01-15',
        contract_type: 'CLT',
        position: 'Secretária Executiva e Gestora de Atendimento',
        department: 'Administrativo',
        base_salary: 3800.00,
        work_hours_weekly: 44,
        daily_hours: 8,
        work_schedule: '08:30 às 18:30 (Seg a Sex)',
        vt_enabled: 1,
        vt_daily_value: 12.50,
        va_enabled: 1,
        va_monthly_value: 700.00,
        dependents_count: 1,
        bank_name: 'Banco do Brasil (001)',
        bank_agency: '0032-1',
        bank_account: '45678-9',
        bank_pix: '32165498733',
        status: 'Ativo'
      },
      {
        name: 'Carlos Eduardo Ramos',
        cpf: '654.321.987-44',
        rg: 'MG-16.543.210',
        birth_date: '1988-11-20',
        gender: 'Masculino',
        marital_status: 'Solteiro',
        ctps_number: '9876543',
        ctps_series: '0015',
        ctps_uf: 'MG',
        pis_pasep: '139.87654.32-2',
        admission_date: '2024-01-15',
        contract_type: 'CLT',
        position: 'Motorista Oficial e Auxiliar de Serviços Externos',
        department: 'Operações & Logística',
        base_salary: 3200.00,
        work_hours_weekly: 44,
        daily_hours: 8,
        work_schedule: '08:00 às 18:00 (Seg a Sex)',
        vt_enabled: 1,
        vt_daily_value: 12.50,
        va_enabled: 1,
        va_monthly_value: 700.00,
        dependents_count: 0,
        bank_name: 'Caixa Econômica (104)',
        bank_agency: '1234',
        bank_account: '98765-4',
        bank_pix: 'carlos.logistica@jorgealvimadvocacia.com.br',
        status: 'Ativo'
      },
      {
        name: 'Fernanda Cristina Santos',
        cpf: '345.678.901-77',
        rg: 'MG-17.667.788',
        birth_date: '1985-03-08',
        gender: 'Feminino',
        marital_status: 'Casada',
        ctps_number: '5432109',
        ctps_series: '0018',
        ctps_uf: 'MG',
        pis_pasep: '145.67890.12-3',
        admission_date: '2024-03-01',
        contract_type: 'CLT',
        position: 'Gerente Administrativo-Financeira',
        department: 'Controladoria & Finanças',
        base_salary: 5500.00,
        work_hours_weekly: 44,
        daily_hours: 8,
        work_schedule: '08:00 às 18:00 (Seg a Sex)',
        vt_enabled: 1,
        vt_daily_value: 14.00,
        va_enabled: 1,
        va_monthly_value: 800.00,
        dependents_count: 2,
        bank_name: 'Itaú Unibanco (341)',
        bank_agency: '3120',
        bank_account: '22334-5',
        bank_pix: '34567890177',
        status: 'Ativo'
      },
      {
        name: 'Juliana Mendes Costa',
        cpf: '567.890.123-88',
        rg: 'MG-19.889.900',
        birth_date: '1996-09-25',
        gender: 'Feminino',
        marital_status: 'Solteira',
        ctps_number: '4321098',
        ctps_series: '0020',
        ctps_uf: 'MG',
        pis_pasep: '156.78901.23-4',
        admission_date: '2024-03-01',
        contract_type: 'CLT',
        position: 'Recepcionista & Agendamento de Consultas',
        department: 'Atendimento',
        base_salary: 2400.00,
        work_hours_weekly: 44,
        daily_hours: 8,
        work_schedule: '08:00 às 17:00 (Seg a Sex)',
        vt_enabled: 1,
        vt_daily_value: 12.00,
        va_enabled: 1,
        va_monthly_value: 650.00,
        dependents_count: 0,
        bank_name: 'Bradesco (237)',
        bank_agency: '0540',
        bank_account: '11223-9',
        bank_pix: '56789012388',
        status: 'Ativo'
      },
      {
        name: 'Lucas Gabriel Oliveira',
        cpf: '456.789.123-22',
        rg: 'MG-18.912.345',
        birth_date: '2002-07-12',
        gender: 'Masculino',
        marital_status: 'Solteiro',
        ctps_number: '3210987',
        ctps_series: '0022',
        ctps_uf: 'MG',
        pis_pasep: '167.89012.34-5',
        admission_date: '2024-01-15',
        contract_type: 'ESTAGIO',
        position: 'Estagiário de Direito - Pesquisa Jurídica & Peças',
        department: 'Jurídico',
        base_salary: 1600.00, // Bolsa-auxílio
        work_hours_weekly: 30,
        daily_hours: 6,
        work_schedule: '12:00 às 18:00 (Seg a Sex)',
        vt_enabled: 1,
        vt_daily_value: 12.00,
        va_enabled: 1,
        va_monthly_value: 400.00,
        dependents_count: 0,
        bank_name: 'Nubank (260)',
        bank_agency: '0001',
        bank_account: '998877-6',
        bank_pix: 'lucas.estagio@jorgealvimadvocacia.com.br',
        status: 'Ativo'
      },
      {
        name: 'Gabriel Henrique Souza',
        cpf: '789.012.345-99',
        rg: 'MG-20.112.233',
        birth_date: '2003-02-18',
        gender: 'Masculino',
        marital_status: 'Solteiro',
        ctps_number: '2109876',
        ctps_series: '0025',
        ctps_uf: 'MG',
        pis_pasep: '178.90123.45-6',
        admission_date: '2024-03-01',
        contract_type: 'ESTAGIO',
        position: 'Estagiário de Direito - Acompanhamento Processual',
        department: 'Jurídico',
        base_salary: 1600.00, // Bolsa-auxílio
        work_hours_weekly: 30,
        daily_hours: 6,
        work_schedule: '13:00 às 19:00 (Seg a Sex)',
        vt_enabled: 1,
        vt_daily_value: 12.00,
        va_enabled: 1,
        va_monthly_value: 400.00,
        dependents_count: 0,
        bank_name: 'Inter (077)',
        bank_agency: '0001',
        bank_account: '334455-2',
        bank_pix: '78901234599',
        status: 'Ativo'
      },
      {
        name: 'Dra. Mariana Fonseca Alvim',
        cpf: '987.654.321-11',
        rg: 'MG-14.876.543',
        birth_date: '1989-08-10',
        gender: 'Feminino',
        marital_status: 'Casada',
        ctps_number: '1098765',
        ctps_series: '0001',
        ctps_uf: 'MG',
        pis_pasep: '189.01234.56-7',
        admission_date: '2024-01-15',
        contract_type: 'ASSOCIADO',
        position: 'Advogada Sócia - Especialista em Direito Cível e Trânsito',
        department: 'Jurídico',
        base_salary: 8500.00, // Pró-labore
        work_hours_weekly: 40,
        daily_hours: 8,
        work_schedule: 'Flexível / Atuação Forense',
        vt_enabled: 0,
        vt_daily_value: 0,
        va_enabled: 0,
        va_monthly_value: 0,
        dependents_count: 1,
        bank_name: 'Sicoob (756)',
        bank_agency: '4120',
        bank_account: '88776-5',
        bank_pix: 'mariana@jorgealvimadvocacia.com.br',
        status: 'Ativo'
      },
      {
        name: 'Dra. Camila Vasconcelos',
        cpf: '876.543.210-66',
        rg: 'MG-13.445.566',
        birth_date: '1991-12-04',
        gender: 'Feminino',
        marital_status: 'Solteira',
        ctps_number: '1987654',
        ctps_series: '0002',
        ctps_uf: 'MG',
        pis_pasep: '190.12345.67-8',
        admission_date: '2024-03-01',
        contract_type: 'ASSOCIADO',
        position: 'Advogada Associada - Contencioso Trabalhista',
        department: 'Jurídico',
        base_salary: 6200.00,
        work_hours_weekly: 40,
        daily_hours: 8,
        work_schedule: 'Flexível / Atuação Forense',
        vt_enabled: 0,
        vt_daily_value: 0,
        va_enabled: 0,
        va_monthly_value: 0,
        dependents_count: 0,
        bank_name: 'Santander (033)',
        bank_agency: '2105',
        bank_account: '55667-8',
        bank_pix: 'camila@afmadvocacia.com.br',
        status: 'Ativo'
      }
    ];

    const insertEmp = db.prepare(`
      INSERT INTO hr_employees (
        id, member_id, office_id, name, cpf, rg, birth_date, gender, marital_status,
        ctps_number, ctps_series, ctps_uf, pis_pasep, admission_date, contract_type,
        position, department, base_salary, work_hours_weekly, daily_hours, work_schedule,
        vt_enabled, vt_daily_value, va_enabled, va_monthly_value, dependents_count,
        bank_name, bank_agency, bank_account, bank_pix, status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      )
    `);

    const insertContract = db.prepare(`
      INSERT INTO hr_contracts (
        id, employee_id, contract_type, start_date, end_date, clauses_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'Vigente', datetime('now'), datetime('now'))
    `);

    const insertExam = db.prepare(`
      INSERT INTO hr_medical_exams (
        id, employee_id, exam_type, exam_date, validity_date, clinic_name, doctor_name, doctor_crm, result, aso_pdf_url, observations, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const insertPayroll = db.prepare(`
      INSERT INTO hr_payrolls (
        id, employee_id, reference_month, base_salary, overtime_value, dsr_value, bonus_value,
        gross_total, inss_deduction, irrf_deduction, vt_deduction, va_deduction, other_deductions,
        net_total, fgts_base, fgts_deposit, payment_date, receipt_hash, signed_at, status, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    const insertVacation = db.prepare(`
      INSERT INTO hr_vacations (
        id, employee_id, acquisitive_start, acquisitive_end, concessive_limit, vacation_days, abono_pecuniario_days,
        vacation_start, vacation_end, base_salary, one_third_constitutional, abono_value, gross_vacation,
        inss_deduction, irrf_deduction, net_vacation, payment_deadline, receipt_signed_at, status, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    const insertThirteenth = db.prepare(`
      INSERT INTO hr_thirteenth_salary (
        id, employee_id, reference_year, installment, months_worked, base_salary, installment_gross,
        inss_deduction, irrf_deduction, installment_net, payment_date, status, receipt_signed_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    const insertTimeClock = db.prepare(`
      INSERT INTO hr_time_clock (
        id, employee_id, record_date, time_in, lunch_out, lunch_in, time_out,
        total_worked_minutes, overtime_50_minutes, overtime_100_minutes, delay_minutes,
        is_holiday_or_dsr, signature_hash, signed_by_user, signed_at, ip_address, status, notes, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    sampleEmployees.forEach((emp, idx) => {
      const empId = `EMP-2026-${String(idx + 1).padStart(4, '0')}`;
      const matchedMember = members.find(m => m.cpf === emp.cpf || m.name.toLowerCase().includes(emp.name.toLowerCase()));
      const memberId = matchedMember ? matchedMember.id : null;
      const officeId = matchedMember ? matchedMember.office_id : 'JA-ESC-2026-0001';

      // 1. Inserir Colaborador
      insertEmp.run(
        empId, memberId, officeId, emp.name, emp.cpf, emp.rg, emp.birth_date, emp.gender, emp.marital_status,
        emp.ctps_number, emp.ctps_series, emp.ctps_uf, emp.pis_pasep, emp.admission_date, emp.contract_type,
        emp.position, emp.department, emp.base_salary, emp.work_hours_weekly, emp.daily_hours, emp.work_schedule,
        emp.vt_enabled, emp.vt_daily_value, emp.va_enabled, emp.va_monthly_value, emp.dependents_count,
        emp.bank_name, emp.bank_agency, emp.bank_account, emp.bank_pix, emp.status, null
      );

      // 2. Inserir Contrato de Trabalho
      const contractType = emp.contract_type === 'CLT' ? 'CLT_INDETERMINADO' : (emp.contract_type === 'ESTAGIO' ? 'ESTAGIO_LEI_11788' : 'ASSOCIADO_OAB');
      const clauses = [
        `1. Função: ${emp.position} perante o escritório Jorge Alvim Advocacia.`,
        `2. Remuneração: R$ ${emp.base_salary.toFixed(2)} mensais, pagos até o 5º dia útil.`,
        `3. Jornada: ${emp.work_hours_weekly}h semanais em regime ${emp.contract_type}.`,
        `4. Benefícios: Vale Transporte nos termos da Lei 7.418/85 e Vale Alimentação PAT.`,
        `5. Confidencialidade e LGPD: Sigilo absoluto de autos e segredos de clientes.`
      ];
      insertContract.run(`CTR-${empId}`, empId, contractType, emp.admission_date, null, JSON.stringify(clauses));

      // 3. Inserir ASO Admissional e Periódico
      insertExam.run(
        `ASO-ADM-${empId}`, empId, 'ADMISSIONAL', emp.admission_date, '2025-01-15',
        'Clínica Médica e Ocupacional Juiz de Fora', 'Dr. Marcos Aurélio Teixeira', 'CRM/MG 45.890',
        'APTO', '', 'Apto para o exercício da função sem restrições.'
      );
      insertExam.run(
        `ASO-PER-${empId}`, empId, 'PERIODICO', '2025-01-10', '2027-01-10',
        'Clínica Médica e Ocupacional Juiz de Fora', 'Dra. Flávia Andrade', 'CRM/MG 52.310',
        'APTO', '', 'Exame periódico bienal em perfeita conformidade com a NR-7.'
      );

      // 4. Inserir Folha de Pagamento dos meses 2026-07 e 2026-08
      ['2026-07', '2026-08'].forEach((refMonth, mIdx) => {
        const gross = emp.base_salary;
        const isEstagio = emp.contract_type === 'ESTAGIO';
        const inss = isEstagio ? 0 : calculateINSSProgressivo(gross);
        const irrf = isEstagio ? 0 : calculateIRRF(gross, inss, emp.dependents_count);
        const vtDesc = calculateVTDeduction(gross, emp.vt_daily_value, 22, emp.vt_enabled);
        const net = gross - inss - irrf - vtDesc;
        const fgts = calculateFGTS(gross, isEstagio);
        const hash = crypto.createHash('sha256').update(`${empId}-${refMonth}-${net}`).digest('hex');

        insertPayroll.run(
          `PAY-${empId}-${refMonth}`, empId, refMonth, gross, 0, 0, 0,
          gross, inss, irrf, vtDesc, 0, 0,
          net, isEstagio ? 0 : gross, fgts, `${refMonth}-05`, hash, `${refMonth}-05T14:30:00Z`, 'PAGO'
        );
      });

      // 5. Inserir Férias Gozadas / Programadas (Art. 7º, XVII CF/88)
      if (emp.contract_type === 'CLT') {
        const vacationGross = emp.base_salary;
        const oneThird = Math.round((vacationGross / 3) * 100) / 100;
        const totalVacation = vacationGross + oneThird;
        const inssVac = calculateINSSProgressivo(totalVacation);
        const irrfVac = calculateIRRF(totalVacation, inssVac, emp.dependents_count);
        const netVac = totalVacation - inssVac - irrfVac;

        insertVacation.run(
          `VAC-${empId}-2025`, empId, '2024-01-15', '2025-01-14', '2026-01-14', 30, 0,
          '2026-09-01', '2026-09-30', emp.base_salary, oneThird, 0, totalVacation,
          inssVac, irrfVac, netVac, '2026-08-30', '2026-08-28T10:00:00Z', 'PROGRAMADA'
        );
      }

      // 6. Inserir 1ª Parcela do 13º Salário (50% sem descontos)
      if (emp.contract_type === 'CLT') {
        const parcelGross = emp.base_salary / 2;
        insertThirteenth.run(
          `13TH-${empId}-2026-1`, empId, 2026, '1', 12, emp.base_salary, parcelGross,
          0, 0, parcelGross, '2026-11-28', 'PAGO', '2026-11-28T16:00:00Z'
        );
      }

      // 7. Inserir registros de ponto para os últimos 15 dias úteis com assinatura SHA-256
      const sampleDays = [
        '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'
      ];

      sampleDays.forEach((dayStr) => {
        const timeIn = emp.contract_type === 'ESTAGIO' ? '12:00' : '08:30';
        const lunchOut = emp.contract_type === 'ESTAGIO' ? '14:30' : '12:30';
        const lunchIn = emp.contract_type === 'ESTAGIO' ? '14:45' : '13:30';
        const timeOut = emp.contract_type === 'ESTAGIO' ? '18:15' : '18:30';
        const workedMinutes = emp.contract_type === 'ESTAGIO' ? 360 : 480;
        const overtime = (idx === 1 && dayStr.endsWith('5')) ? 60 : 0; // Carlos fez hora extra dia 25
        const shaSignature = crypto.createHash('sha256').update(`${empId}|${dayStr}|${timeIn}|${timeOut}|jorgealvimtecnologia`).digest('hex');

        insertTimeClock.run(
          `PUNCH-${empId}-${dayStr}`, empId, dayStr, timeIn, lunchOut, lunchIn, timeOut,
          workedMinutes + overtime, overtime, 0, 0, 0,
          shaSignature, 'jorgealvimtecnologia', `${dayStr}T18:31:00Z`, '127.0.0.1', 'ASSINADO', 'Jornada cumprida integralmente.'
        );
      });
    });

    console.log(`✅ [SEEDER RH] ${sampleEmployees.length} colaboradores e fichas completas criadas com sucesso.`);
  }
} catch (seederErr) {
  console.warn('Erro ao popular dados de RH:', seederErr);
}

// ===== RH/DP: extraído para src/modules/hr/hr.routes.js =====

// ================= BACKUP & EXPORTAÇÃO DE DADOS (ADMIN) =================

// 1. Download do Banco de Dados SQLite leads.db
// ===== ADMIN (backup/export): extraído para src/modules/admin/admin.routes.js =====

// Middleware Global de Tratamento de Erros (Multer e Servidor)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.warn('[AVISO UPLOAD] Erro Multer:', err.message, err.code);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede o limite de tamanho permitido (máximo 50MB por anexo).' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Limite máximo de arquivos excedido (máximo 10 anexos por envio).' });
    }
    return res.status(400).json({ error: `Erro no upload: ${err.message}` });
  }
  if (err) {
    recordError(err, { id: req.id, path: req.path });
    return res.status(500).json({ error: err.message || 'Erro interno no servidor.', request_id: req.id });
  }
  next();
});

// ---------------------------------------------------------------------------
// ===== EXPLORER: extraído para src/modules/explorer/explorer.routes.js =====

// (KANBAN movido para src/modules/kanban/kanban.routes.js)

// ---------------------------------------------------------------------------
// Índices de performance — mantêm as consultas rápidas conforme o volume cresce.
// Criados no boot (idempotente via IF NOT EXISTS). Cada um em try próprio para
// que uma tabela ausente nunca impeça a criação dos demais.
// ---------------------------------------------------------------------------
// Migrations versionadas (aplica src/db/migrations/*.sql pendentes).
try { runMigrations(db, path.join(__dirname, 'src', 'db', 'migrations')); } catch (e) { console.warn('[MIGRATIONS] não executadas:', e.message); }

(function ensurePerformanceIndexes() {
  const indexes = [
    // Intimações / DJEN (tabela de maior volume)
    `CREATE INDEX IF NOT EXISTS idx_pub_client ON court_publications(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pub_lawsuit ON court_publications(lawsuit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pub_oab ON court_publications(advogado_oab)`,
    `CREATE INDEX IF NOT EXISTS idx_pub_status ON court_publications(status)`,
    `CREATE INDEX IF NOT EXISTS idx_pub_data ON court_publications(data_disponibilizacao)`,
    `CREATE INDEX IF NOT EXISTS idx_pub_comunicacao ON court_publications(comunicacao_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pub_processo ON court_publications(numero_processo)`,
    // Processos
    `CREATE INDEX IF NOT EXISTS idx_lawsuit_client ON lawsuits(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lawsuit_cnj ON lawsuits(cnj_number)`,
    `CREATE INDEX IF NOT EXISTS idx_lawsuit_status ON lawsuits(status)`,
    `CREATE INDEX IF NOT EXISTS idx_movement_lawsuit ON lawsuit_movements(lawsuit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_movement_deadline ON lawsuit_movements(deadline_date)`,
    // Clientes (buscas de login e listagem)
    `CREATE INDEX IF NOT EXISTS idx_client_cpf ON clients(cpf)`,
    `CREATE INDEX IF NOT EXISTS idx_client_cnpj ON clients(cnpj)`,
    `CREATE INDEX IF NOT EXISTS idx_client_email ON clients(email)`,
    `CREATE INDEX IF NOT EXISTS idx_client_status ON clients(contract_status)`,
    `CREATE INDEX IF NOT EXISTS idx_client_deleted_at ON clients(deleted_at)`,
    `CREATE INDEX IF NOT EXISTS idx_client_soft_status ON clients(status)`,
    // Financeiro
    `CREATE INDEX IF NOT EXISTS idx_inst_client ON contract_installments(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inst_status ON contract_installments(status)`,
    `CREATE INDEX IF NOT EXISTS idx_inst_due ON contract_installments(due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_inst_asaas ON contract_installments(asaas_payment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fin_client ON financial_transactions(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fin_status ON financial_transactions(status)`,
    `CREATE INDEX IF NOT EXISTS idx_fin_due ON financial_transactions(due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_nfse_client ON nfse_invoices(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_nfse_status ON nfse_invoices(status)`,
    // Agenda / prazos
    `CREATE INDEX IF NOT EXISTS idx_cal_start ON calendar_events(start_datetime)`,
    `CREATE INDEX IF NOT EXISTS idx_cal_client ON calendar_events(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cal_status ON calendar_events(status)`,
    // Leads / captação
    `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`,
    // RH
    `CREATE INDEX IF NOT EXISTS idx_emp_cpf ON hr_employees(cpf)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_office ON hr_employees(office_id)`,
    `CREATE INDEX IF NOT EXISTS idx_clock_emp ON hr_time_clock(employee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_clock_date ON hr_time_clock(record_date)`,
    // Auditoria / mensagens / visitas
    `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module)`,
    `CREATE INDEX IF NOT EXISTS idx_msg_client ON client_messages(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_visits_date ON site_visits(visit_date)`,
    `CREATE INDEX IF NOT EXISTS idx_visits_status ON site_visits(status)`,
    // Blog
    `CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug)`,
    `CREATE INDEX IF NOT EXISTS idx_blog_pub ON blog_posts(is_published)`,
  ];
  let ok = 0;
  for (const stmt of indexes) {
    try { db.exec(stmt); ok++; } catch (e) { /* tabela ausente: ignora este índice */ }
  }
  console.log(`⚡ [DB] Índices de performance garantidos (${ok}/${indexes.length}).`);
})();

// Inicialização do Servidor
// Em NODE_ENV=test o Supertest importa o `app` diretamente e não abrimos a porta
// (evita conflito de porta e mantém os timers desligados para o Vitest encerrar).
const IS_TEST = process.env.NODE_ENV === 'test';
let server = null;
if (!IS_TEST) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🏛️  Servidor Jorge Alvim Advocacia Ativo!`);
    console.log(`🌐  Site Oficial:    http://localhost:${PORT}`);
    console.log(`📊  Painel Clientes: http://localhost:${PORT}/painel`);
    console.log(`🔐  Login Mestre:    jorgealvimtecnologia`);
    console.log(`🗄️  Banco SQLite:    leads.db (tabelas: leads, users, clients)`);
    console.log(`📁  Ficheiros:       storage/clients/`);
    console.log(`====================================================`);
    // Sincroniza a matriz de permissões (RBAC) e semeia feriados forenses — no listen,
    // quando as tabelas já estão visíveis para as conexões dos módulos.
    try { syncAllAccessPermissions(); } catch (e) { console.warn('[BOOT] sync de permissões não executado:', e.message); }
    try { seedCourtHolidays(); } catch (e) { console.warn('[BOOT] feriados forenses não semeados:', e.message); }
    // Inicia a varredura periódica de prazos fatais (central de notificações).
    try { startDeadlineScanner(); } catch (e) { console.warn('[BOOT] Scanner de prazos não iniciado:', e.message); }
    // Inicia o agendador de sincronização (ComunicaAPI + reconciliação interna).
    try { startSyncScheduler(); } catch (e) { console.warn('[BOOT] Agendador de sync não iniciado:', e.message); }
    // Alertas de prazo por WhatsApp/e-mail (só para advogados), com escalonamento e ciência.
    try { startBookingReminders(); } catch (e) { console.warn('[BOOT] Lembretes de agendamento não iniciados:', e.message); }
    try { startDeadlineAlerts(); } catch (e) { console.warn('[BOOT] Alertas de prazo externos não iniciados:', e.message); }
    // Vigia do .env: toda alteração gera e-mail ao titular (cofre criptografado + relatório só com nomes).
    try { installProcessErrorHandlers(); startWatchdog({ db, notify: createNotification }); } catch (e) { console.warn('[BOOT] Vigia de saúde não iniciado:', e.message); }
    try { startEnvWatcher({ dir: __dirname }); } catch (e) { console.warn('[BOOT] Vigia do .env não iniciado:', e.message); }
  });

  // Manter o loop de eventos ativo continuamente
  setInterval(() => {}, 1000 * 60 * 60);
}

// Exportado para os testes automatizados (Supertest importa o app sem subir a porta).
export { app, db, server };
