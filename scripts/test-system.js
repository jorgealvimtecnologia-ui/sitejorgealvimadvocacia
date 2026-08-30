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

    const tables = ['clients', 'office_members', 'lawsuits', 'office_drive_files', 'audit_logs', 'blog_posts', 'users'];
    let allTablesOk = true;
    const missingTables = [];

    tables.forEach(table => {
      const res = db.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!res || res.count === 0) {
        allTablesOk = false;
        missingTables.push(table);
      }
    });

    logTestResult('Banco de Dados SQLite (leads.db)', allTablesOk, allTablesOk ? 'Todas as 7 tabelas ativas' : `Faltam tabelas: ${missingTables.join(', ')}`);
  } catch (err) {
    logTestResult('Banco de Dados SQLite (leads.db)', false, err.message);
  }

  // 2. Testes de Endpoints HTTP do Servidor
  const baseUrl = 'http://localhost:3000';

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
    const res = await fetch(`http://localhost:3000${endpoint}`);
    const ok = res.status === expectedStatus;
    logTestResult(label, ok, `HTTP Status ${res.status}`);
  } catch (err) {
    logTestResult(label, false, err.message);
  }
}

runTests();
