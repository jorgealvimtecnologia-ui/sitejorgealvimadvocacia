import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('\n================================================================');
console.log('🧪 SISTEMA DE AUDITORIA & TESTE DE INTEGRIDADE (HEALTH CHECK)');
console.log('   Jorge Alvim Advocacia & Tecnologia - Teste Automatizado');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function logTestResult(name, success, details = '') {
  if (success) {
    passCount++;
    console.log(` ✅ [PASSOU] ${name} ${details ? '-> ' + details : ''}`);
  } else {
    failCount++;
    console.log(` ❌ [FALHOU] ${name} ${details ? '-> ' + details : ''}`);
  }
}

async function runTests() {
  // 1. Teste de Banco de Dados SQLite (Estrutura e Tabelas)
  try {
    const dbPath = path.join(projectRoot, 'leads.db');
    const db = new DatabaseSync(dbPath);

    const tables = ['clients', 'office_members', 'lawsuits', 'office_drive_files', 'audit_logs', 'blog_posts', 'users', 'calendar_events', 'court_publications', 'court_holidays'];
    let allTablesOk = true;
    const missingTables = [];

    tables.forEach(table => {
      const res = db.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!res || res.count === 0) {
        allTablesOk = false;
        missingTables.push(table);
      }
    });

    logTestResult('Banco de Dados SQLite (leads.db)', allTablesOk, allTablesOk ? 'Todas as 10 tabelas principais ativas (incluindo court_publications e court_holidays)' : `Faltam tabelas: ${missingTables.join(', ')}`);
  } catch (err) {
    logTestResult('Banco de Dados SQLite (leads.db)', false, err.message);
  }

  // 2. Testes de Endpoints HTTP do Servidor
  const baseUrl = 'http://127.0.0.1:3000';

  // 2.1 Página Inicial
  await checkUrl('/', 200, 'Página Inicial (Home / Website Público)');

  // 2.2 Painel
  await checkUrl('/painel', 200, 'Painel Administrativo (/painel)');

  // 2.3 Portal do Cliente
  await checkUrl('/cliente', 200, 'Portal do Cliente (/cliente)');

  // 2.4 Google Sitemap XML
  await checkUrl('/sitemap.xml', 200, 'Google Sitemap XML (/sitemap.xml)');

  // 2.5 Robots.txt
  await checkUrl('/robots.txt', 200, 'Robots.txt (/robots.txt)');

  // 2.6 Feed iCalendar (.ics) Público para Google Calendar e Celular
  try {
    const icsRes = await fetch(`${baseUrl}/api/calendar/feed/office.ics`);
    const icsText = await icsRes.text();
    const isIcsValid = icsRes.status === 200 && icsText.includes('BEGIN:VCALENDAR') && icsText.includes('END:VCALENDAR');
    logTestResult('Feed iCalendar RFC 5545 (/api/calendar/feed/office.ics)', isIcsValid, isIcsValid ? 'Arquivo .ics gerado com sucesso para Google Agenda & Apple Calendar' : 'Falha na geração do iCal');
  } catch (err) {
    logTestResult('Feed iCalendar RFC 5545 (/api/calendar/feed/office.ics)', false, err.message);
  }

  // 3. Teste de Autenticação JWT e Rotas Protegidas da API REST
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'jorgealvimtecnologia', password: 'jorgealvim' })
    });

    const loginData = await loginRes.json();
    const loginOk = loginRes.status === 200 && loginData.success && loginData.token;
    logTestResult('Autenticação API (/api/auth/login)', loginOk, loginOk ? 'JWT Token gerado com sucesso' : 'Falha na autenticação');

    if (loginOk) {
      const token = loginData.token;
      const headers = { 'Authorization': `Bearer ${token}` };

      // API Drive
      const driveRes = await fetch(`${baseUrl}/api/drive/files`, { headers });
      const driveData = await driveRes.json();
      logTestResult('API Drive do Escritório (/api/drive/files)', driveRes.status === 200 && driveData.success, `${driveData.files ? driveData.files.length : 0} arquivo(s) mapeados`);

      // API Clientes
      const clientsRes = await fetch(`${baseUrl}/api/clients`, { headers });
      const clientsData = await clientsRes.json();
      logTestResult('API Gestão de Clientes (/api/clients)', clientsRes.status === 200 && clientsData.success, `${clientsData.clients ? clientsData.clients.length : 0} cliente(s) registrados`);

      // API Processos Judiciais
      const lawsuitsRes = await fetch(`${baseUrl}/api/lawsuits`, { headers });
      const lawsuitsData = await lawsuitsRes.json();
      logTestResult('API Processos Judiciais (/api/lawsuits)', lawsuitsRes.status === 200 && lawsuitsData.success, `${lawsuitsData.lawsuits ? lawsuitsData.lawsuits.length : 0} processo(s) cadastrados`);

      // API Escritórios PJ
      const officesRes = await fetch(`${baseUrl}/api/offices`, { headers });
      const officesData = await officesRes.json();
      logTestResult('API Escritórios PJ (/api/offices)', officesRes.status === 200 && officesData.success, `${officesData.offices ? officesData.offices.length : 0} escritório(s) ativos`);

      // API Agenda & Prazos
      const calRes = await fetch(`${baseUrl}/api/calendar/events`, { headers });
      const calData = await calRes.json();
      logTestResult('API Agenda & Prazos (/api/calendar/events)', calRes.status === 200 && calData.success, `${calData.events ? calData.events.length : 0} compromisso(s) carregados`);

      // API Resumo da Agenda
      const sumRes = await fetch(`${baseUrl}/api/calendar/summary`, { headers });
      const sumData = await sumRes.json();
      logTestResult('API Resumo / Pauta da Agenda (/api/calendar/summary)', sumRes.status === 200 && sumData.success, `${sumData.today_events ? sumData.today_events.length : 0} evento(s) hoje`);

      // API Advogados da Agenda
      const lawRes = await fetch(`${baseUrl}/api/calendar/lawyers`, { headers });
      const lawData = await lawRes.json();
      logTestResult('API Advogados da Agenda (/api/calendar/lawyers)', lawRes.status === 200 && lawData.success, `${lawData.lawyers ? lawData.lawyers.length : 0} advogado(s) listados`);

      // API Calculadora de Prazos Judiciais (CPC/15)
      const calcRes = await fetch(`${baseUrl}/api/court/deadline/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ start_date: '2026-08-31', days: 15, regime: 'cpc' })
      });
      const calcData = await calcRes.json();
      const isCalcOk = calcRes.status === 200 && calcData.success && calcData.data_fatal === '2026-09-23';
      logTestResult('API Calculadora de Prazos Judiciais (/api/court/deadline/calculate)', isCalcOk, `D0 31/08 -> Fatal ${calcData.data_fatal ? calcData.data_fatal.split('-').reverse().join('/') : 'Erro'} (15 dias úteis CPC com compensações)`);

      // API Publicações DJEN / ComunicaAPI
      const pubRes = await fetch(`${baseUrl}/api/court/publications`, { headers });
      const pubData = await pubRes.json();
      logTestResult('API Central de Intimações & DJEN (/api/court/publications)', pubRes.status === 200 && pubData.success, `${pubData.publications ? pubData.publications.length : 0} intimações listadas (${pubData.stats ? pubData.stats.unread : 0} não lidas)`);

      // API Feriados Judiciais Forenses
      const holRes = await fetch(`${baseUrl}/api/court/holidays`, { headers });
      const holData = await holRes.json();
      logTestResult('API Feriados Forenses (/api/court/holidays)', holRes.status === 200 && holData.success, `${holData.holidays ? holData.holidays.length : 0} feriados cadastrados`);

      // API Radar Judicial com Motor Python (DataJud + DJEN)
      const radRes = await fetch(`${baseUrl}/api/judicial/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ query_type: 'number', query_term: '0001423-78.2022.8.13.0133' })
      });
      const radData = await radRes.json();
      const isRadOk = radRes.status === 200 && radData.success && radData.total > 0;
      logTestResult('API Radar Judicial com Motor Python (/api/judicial/search)', isRadOk, `${radData.total} processo(s) localizado(s) via ${radData.engine || radData.source}`);
    }
  } catch (err) {
    logTestResult('Teste de APIs do Servidor', false, err.message);
  }

  console.log('\n================================================================');
  console.log(`📊 RESUMO DA AUDITORIA: ${passCount} Testes APROVADOS | ${failCount} Testes FALHADOS`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

async function checkUrl(endpoint, expectedStatus, label) {
  try {
    const res = await fetch(`http://127.0.0.1:3000${endpoint}`);
    const ok = res.status === expectedStatus;
    logTestResult(label, ok, `HTTP Status ${res.status}`);
  } catch (err) {
    logTestResult(label, false, err.message);
  }
}

runTests();
