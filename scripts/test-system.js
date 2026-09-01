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

    const tables = ['clients', 'office_members', 'lawsuits', 'office_drive_files', 'audit_logs', 'blog_posts', 'users', 'calendar_events', 'court_publications', 'court_holidays', 'hr_employees', 'hr_contracts', 'hr_medical_exams', 'hr_time_clock', 'hr_payrolls', 'hr_vacations', 'hr_thirteenth_salary'];
    let allTablesOk = true;
    const missingTables = [];

    tables.forEach(table => {
      const res = db.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!res || res.count === 0) {
        allTablesOk = false;
        missingTables.push(table);
      }
    });

    logTestResult('Banco de Dados SQLite (leads.db)', allTablesOk, allTablesOk ? 'Todas as 17 tabelas ativas (incluindo as 7 tabelas do Módulo de Gestão de Pessoal RH/DP)' : `Faltam tabelas: ${missingTables.join(', ')}`);
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

  // 2.3.1 Portal do Colaborador
  await checkUrl('/colaborador', 200, 'Portal do Colaborador (/colaborador)');

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

      // ================= MÓDULO DE GESTÃO DE PESSOAL (RH / DP) =================
      // 1. Dashboard RH
      const hrDashRes = await fetch(`${baseUrl}/api/hr/dashboard`, { headers });
      const hrDashData = await hrDashRes.json();
      logTestResult('API RH - Dashboard (/api/hr/dashboard)', hrDashRes.status === 200 && hrDashData.success, `${hrDashData.dashboard?.total_employees || 0} colaboradores ativos | Folha Líquida: R$ ${hrDashData.dashboard?.total_net_payroll?.toFixed(2)}`);

      // 2. Colaboradores & Fichas CTPS
      const hrEmpRes = await fetch(`${baseUrl}/api/hr/employees`, { headers });
      const hrEmpData = await hrEmpRes.json();
      logTestResult('API RH - Colaboradores (/api/hr/employees)', hrEmpRes.status === 200 && hrEmpData.success, `${hrEmpData.employees?.length || 0} colaboradores cadastrados (CLT, Estágio, Associados)`);

      // 3. Ponto Eletrônico & Assinatura Digital (Portaria 671)
      const hrTimeRes = await fetch(`${baseUrl}/api/hr/time-clock?month=2026-08&employee_id=${hrEmpData.employees?.[0]?.id || 1}`, { headers });
      const hrTimeData = await hrTimeRes.json();
      logTestResult('API RH - Ponto Eletrônico (/api/hr/time-clock)', hrTimeRes.status === 200 && hrTimeData.success, `${hrTimeData.records?.length || 0} marcações com cálculo de horas e horas extras 50%`);

      // 4. Assinatura Eletrônica de Ponto com Hash SHA-256
      const hrSignRes = await fetch(`${baseUrl}/api/hr/time-clock/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          employee_id: hrEmpData.employees?.[0]?.id || 1,
          month: '2026-08',
          password: 'jorgealvim',
          signed_by_name: 'Dr. Jorge Alvim'
        })
      });
      const hrSignData = await hrSignRes.json();
      logTestResult('API RH - Assinatura Eletrônica com Hash SHA-256 (/api/hr/time-clock/sign)', hrSignRes.status === 200 && hrSignData.success, `Carimbo Criptográfico: ${hrSignData.signature_hash ? hrSignData.signature_hash.substring(0, 16) + '...' : 'OK'}`);

      // 5. Folha de Pagamento & Holerites CLT
      const hrPayRes = await fetch(`${baseUrl}/api/hr/payroll?month=2026-08`, { headers });
      const hrPayData = await hrPayRes.json();
      logTestResult('API RH - Folha de Pagamento & Holerites (/api/hr/payroll)', hrPayRes.status === 200 && hrPayData.success, `${hrPayData.payrolls?.length || 0} holerites com INSS progressivo, IRRF, VT 6% e FGTS 8%`);

      // 6. Férias & 1/3 Constitucional (Art. 7º, XVII CF/88)
      const hrVacRes = await fetch(`${baseUrl}/api/hr/vacations`, { headers });
      const hrVacData = await hrVacRes.json();
      logTestResult('API RH - Férias & 1/3 Constitucional (/api/hr/vacations)', hrVacRes.status === 200 && hrVacData.success, `${hrVacData.vacations?.length || 0} período(s) de férias calculados e programados`);

      // 7. 13º Salário (Lei 4.090/62)
      const hr13Res = await fetch(`${baseUrl}/api/hr/thirteenth?year=2026`, { headers });
      const hr13Data = await hr13Res.json();
      logTestResult('API RH - 13º Salário (/api/hr/thirteenth)', hr13Res.status === 200 && hr13Data.success, `${hr13Data.records?.length || 0} parcelas (1ª e 2ª) gerenciadas`);

      // 8. ASO & Exames Ocupacionais (NR-7)
      const hrExamRes = await fetch(`${baseUrl}/api/hr/exams`, { headers });
      const hrExamData = await hrExamRes.json();
      logTestResult('API RH - ASO & Exames Ocupacionais (/api/hr/exams)', hrExamRes.status === 200 && hrExamData.success, `${hrExamData.exams?.length || 0} ASOs (Admissional, Periódico, Demissional)`);

      // 9. Benefícios (VT e Alimentação)
      const hrBenRes = await fetch(`${baseUrl}/api/hr/benefits`, { headers });
      const hrBenData = await hrBenRes.json();
      logTestResult('API RH - Benefícios VT & VA (/api/hr/benefits)', hrBenRes.status === 200 && hrBenData.success, `Total VT: R$ ${hrBenData.benefits?.total_vt_cost?.toFixed(2)} | Total VA: R$ ${hrBenData.benefits?.total_va_amount?.toFixed(2)}`);

      // 10. Login do Colaborador / Autoatendimento
      const empLoginRes = await fetch(`${baseUrl}/api/hr/employee/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '321.654.987-33', password: '32165498733' })
      });
      const empLoginData = await empLoginRes.json();
      logTestResult('API RH - Login do Colaborador (/api/hr/employee/login)', empLoginRes.status === 200 && empLoginData.success, `Token gerado para ${empLoginData.employee?.name || 'Colaborador'}`);

      // 11. Perfil e Autoatendimento do Colaborador Logado
      let empTokenHeader = { 'Authorization': `Bearer ${empLoginData.token || ''}`, 'x-employee-token': empLoginData.token || '' };
      const empMeRes = await fetch(`${baseUrl}/api/hr/employee/me`, { headers: empTokenHeader });
      const empMeData = await empMeRes.json();
      logTestResult('API RH - Autoatendimento do Trabalhador (/api/hr/employee/me)', empMeRes.status === 200 && empMeData.success, `Ficha, Contratos (${empMeData.contracts?.length || 0}), Holerites (${empMeData.payrolls?.length || 0}) e Pontos carregados`);

      // 12. Ficha Financeira Resumo Anual Individual
      const targetEmpId = hrEmpData.employees?.[0]?.id || 'EMP-2026-0001';
      const annualEmpRes = await fetch(`${baseUrl}/api/hr/reports/annual-financial/employee/${targetEmpId}?year=2026`, { headers });
      const annualEmpData = await annualEmpRes.json();
      logTestResult('API RH - Ficha Financeira Anual Individual (/api/hr/reports/annual-financial/employee/:id)', annualEmpRes.status === 200 && annualEmpData.success, `${annualEmpData.employee?.name}: Bruto Anual R$ ${annualEmpData.totals?.annual_gross_total?.toFixed(2)} | Líquido R$ ${annualEmpData.totals?.annual_net_total?.toFixed(2)}`);

      // 13. Ficha Financeira Geral Consolidada do Escritório
      const annualOfficeRes = await fetch(`${baseUrl}/api/hr/reports/annual-financial/office?year=2026`, { headers });
      const annualOfficeData = await annualOfficeRes.json();
      logTestResult('API RH - Ficha Financeira Geral Consolidada do Escritório (/api/hr/reports/annual-financial/office)', annualOfficeRes.status === 200 && annualOfficeData.success, `${annualOfficeData.summary?.total_active_employees} colaboradores | Custo Global Anual: R$ ${annualOfficeData.summary?.total_annual_personnel_global_cost?.toFixed(2)}`);

      // ================= MÓDULO DE MATRIZ DE CONTROLE DE ACESSO (RBAC / ABAC) =================
      // 14. Matriz de Controle de Acesso Geral (Unificada)
      const matrixRes = await fetch(`${baseUrl}/api/access-control/matrix`, { headers });
      const matrixData = await matrixRes.json();
      logTestResult('API RBAC/ABAC - Matriz de Permissões Granulares (/api/access-control/matrix)', matrixRes.status === 200 && matrixData.success, `${matrixData.matrix?.length || 0} cadastrados mapeados (${matrixData.stats?.masters || 0} mestres/sócios, ${matrixData.stats?.lawyers || 0} advogados, ${matrixData.stats?.staff || 0} equipe/apoio, ${matrixData.stats?.clients || 0} clientes)`);

      // 15. Alternância Granular de Aba via Switch (Toggle)
      const targetUser = matrixData.matrix?.find(m => !m.is_master) || matrixData.matrix?.[1];
      if (targetUser) {
        const toggleRes = await fetch(`${baseUrl}/api/access-control/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ user_id: targetUser.user_id, tab_key: 'tab_lawsuits', enabled: true })
        });
        const toggleData = await toggleRes.json();
        logTestResult('API RBAC/ABAC - Alternância Granular de Switch (/api/access-control/toggle)', toggleRes.status === 200 && toggleData.success, `Aba Processos habilitada com sucesso para ${targetUser.user_name}`);
      }

      // 16. Proteção de Acesso Mestre (God Mode do Dr. Jorge Alvim)
      const masterUser = matrixData.matrix?.find(m => m.is_master);
      if (masterUser) {
        const godModeRes = await fetch(`${baseUrl}/api/access-control/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ user_id: masterUser.user_id, tab_key: 'tab_financial', enabled: false })
        });
        const godModeData = await godModeRes.json();
        const isGodProtected = godModeRes.status === 403 && godModeData.error?.includes('👑');
        logTestResult('API RBAC/ABAC - Blindagem God Mode Dr. Jorge Alvim (/api/access-control/toggle)', isGodProtected, 'Acesso Mestre Irrestrito garantido contra revogação');
      }

      // 17. Aplicação de Template / Perfil de Cargo em 1 Clique
      if (targetUser) {
        const tplRes = await fetch(`${baseUrl}/api/access-control/apply-template`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ user_id: targetUser.user_id, template_key: 'advogado' })
        });
        const tplData = await tplRes.json();
        logTestResult('API RBAC/ABAC - Aplicação de Perfil Modelo em 1-Clique (/api/access-control/apply-template)', tplRes.status === 200 && tplData.success, `Perfil Advogado(a) Associado(a) aplicado para ${targetUser.user_name}`);
      }

      // 18. Consulta de Permissões da Sessão Atual
      const myPermsRes = await fetch(`${baseUrl}/api/access-control/my-permissions`, { headers });
      const myPermsData = await myPermsRes.json();
      logTestResult('API RBAC/ABAC - Permissões da Sessão Ativa (/api/access-control/my-permissions)', myPermsRes.status === 200 && myPermsData.success, `Sessão Mestre: ${myPermsData.is_master ? 'SIM (Acesso Pleno)' : 'NÃO'}`);
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
