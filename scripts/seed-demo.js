/**
 * ============================================================
 *  SEED DE DADOS FICTÍCIOS — Ambiente de Demonstração/Testes
 * ============================================================
 *  Popula o banco com credenciais conhecidas para todos os
 *  perfis e dados de exemplo nos módulos que estiverem vazios.
 *
 *  Uso:  node scripts/seed-demo.js
 *
 *  Idempotente: pode ser executado várias vezes sem duplicar
 *  (usa upsert por chave natural: username / id / cpf / protocolo).
 *
 *  ⚠️  NÃO rode em produção com dados reais.
 * ============================================================
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'leads.db');
const db = new DatabaseSync(DB_PATH);

const now = () => new Date().toISOString();
const iso = (d) => new Date(d).toISOString();
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}
const colsOf = (t) => {
  try { return db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name); }
  catch { return []; }
};
let okCount = 0, errCount = 0;
function run(label, fn) {
  try { fn(); okCount++; }
  catch (e) { errCount++; console.warn(`  ⚠️  ${label}: ${e.message}`); }
}

console.log('🌱 Semeando dados de demonstração...\n');

// ============================================================
// 1. OPERADORES DO PAINEL (tabela users) + permissões
// ============================================================
const OPERATORS = [
  { id: 'USR-MASTER-01', username: 'jorgealvimtecnologia', password: 'jorgealvim', name: 'Dr. Jorge Alvim (Mestre)', role: 'master', tabs: 'all' },
  { id: 'USR-ADV-01', username: 'mariana.adv', password: 'mariana123', name: 'Dra. Mariana Costa', role: 'admin', tabs: 'all' },
  { id: 'USR-ADV-02', username: 'carlos.adv', password: 'carlos123', name: 'Dr. Carlos Menezes', role: 'admin', tabs: 'all' },
  { id: 'USR-SEC-01', username: 'secretaria', password: 'secretaria123', name: 'Patrícia Ramos (Secretária)', role: 'admin', tabs: ['tab_leads', 'tab_clients', 'tab_calendar', 'tab_publications', 'tab_portal_cliente'] },
  { id: 'USR-FIN-01', username: 'financeiro', password: 'financeiro123', name: 'Roberto Lima (Financeiro)', role: 'admin', tabs: ['tab_financial', 'tab_clients', 'tab_leads'] },
  { id: 'USR-RH-01', username: 'rh', password: 'rh123', name: 'Fernanda Alves (RH)', role: 'admin', tabs: ['tab_hr', 'tab_colaborador'] },
  { id: 'USR-EST-01', username: 'estagiario', password: 'estagiario123', name: 'Lucas Pereira (Estagiário)', role: 'admin', tabs: ['tab_lawsuits', 'tab_publications', 'tab_radar', 'tab_calendar'] },
];

const apCols = colsOf('access_permissions');
const tabCols = apCols.filter(c => c.startsWith('tab_'));

function upsertUser(u) {
  const { hash, salt } = hashPassword(u.password);
  const exists = db.prepare('SELECT id FROM users WHERE id = ? OR username = ?').get(u.id, u.username);
  if (exists) {
    db.prepare('UPDATE users SET username=?, password_hash=?, salt=?, name=?, role=?, plain_password=? WHERE id=?')
      .run(u.username, hash, salt, u.name, u.role, u.password, exists.id);
    u.id = exists.id;
  } else {
    db.prepare('INSERT INTO users (id, username, password_hash, salt, name, role, created_at, plain_password) VALUES (?,?,?,?,?,?,?,?)')
      .run(u.id, u.username, hash, salt, u.name, u.role, now(), u.password);
  }
}

function grantPermissions(u) {
  if (!tabCols.length) return;
  const enabled = u.tabs === 'all' ? tabCols : u.tabs.filter(t => tabCols.includes(t));
  const exists = db.prepare('SELECT id FROM access_permissions WHERE user_id = ?').get(u.id);
  const setPairs = tabCols.map(c => `${c}=${enabled.includes(c) ? 1 : 0}`).join(', ');
  if (exists) {
    db.prepare(`UPDATE access_permissions SET ${setPairs}, is_active=1, user_name=?, role_template=?, updated_at=? WHERE user_id=?`)
      .run(u.name, u.role, now(), u.id);
  } else {
    const base = { user_id: u.id, user_type: 'admin', user_name: u.name, user_identifier: u.username, role_template: u.role, is_active: 1, created_at: now(), updated_at: now(), plain_password: u.password };
    for (const c of tabCols) base[c] = enabled.includes(c) ? 1 : 0;
    const keys = Object.keys(base).filter(k => apCols.includes(k));
    const ph = keys.map(() => '?').join(',');
    db.prepare(`INSERT INTO access_permissions (${keys.join(',')}) VALUES (${ph})`).run(...keys.map(k => base[k]));
  }
}

OPERATORS.forEach(u => {
  run(`operador ${u.username}`, () => { upsertUser(u); grantPermissions(u); });
});
console.log(`👤 Operadores: ${OPERATORS.length} configurados.`);

// ============================================================
// 2. CLIENTES (tabela clients) — portal do cliente
// ============================================================
const CLIENTS = [
  { id: 'CLI-DEMO-01', client_type: 'PF', full_name: 'João da Silva Santos', cpf: '111.444.777-35', email: 'joao.silva@email.com', phone: '(32) 98801-1001', city: 'Juiz de Fora', state: 'MG', password: 'cliente123', contract_value: 6000, installments_count: 6, installment_value: 1000 },
  { id: 'CLI-DEMO-02', client_type: 'PF', full_name: 'Maria Aparecida Souza', cpf: '222.555.888-46', email: 'maria.souza@email.com', phone: '(32) 98802-2002', city: 'Juiz de Fora', state: 'MG', password: 'cliente123', contract_value: 3600, installments_count: 3, installment_value: 1200 },
  { id: 'CLI-DEMO-03', client_type: 'PJ', full_name: 'Tech Solutions Comércio LTDA', cnpj: '11.222.333/0001-81', email: 'contato@techsolutions.com.br', phone: '(32) 98803-3003', city: 'Juiz de Fora', state: 'MG', password: 'cliente123', contract_value: 24000, installments_count: 12, installment_value: 2000 },
];

const clientCols = colsOf('clients');
function upsertClient(c) {
  const { hash, salt } = hashPassword(c.password);
  const data = {
    id: c.id, client_type: c.client_type, full_name: c.full_name,
    cpf: c.cpf || null, cnpj: c.cnpj || null, email: c.email, phone: c.phone,
    city: c.city, state: c.state, contract_value: c.contract_value,
    installments_count: c.installments_count, installment_value: c.installment_value,
    amount_paid: c.installment_value, balance_due: c.contract_value - c.installment_value,
    contract_status: 'Ativo', password_hash: hash, salt: salt,
    created_at: now(), updated_at: now(),
  };
  const keys = Object.keys(data).filter(k => clientCols.includes(k));
  const exists = db.prepare('SELECT id FROM clients WHERE id = ?').get(c.id);
  if (exists) {
    const setPairs = keys.filter(k => k !== 'id').map(k => `${k}=?`).join(', ');
    db.prepare(`UPDATE clients SET ${setPairs} WHERE id=?`).run(...keys.filter(k => k !== 'id').map(k => data[k]), c.id);
  } else {
    const ph = keys.map(() => '?').join(',');
    db.prepare(`INSERT INTO clients (${keys.join(',')}) VALUES (${ph})`).run(...keys.map(k => data[k]));
  }
}
CLIENTS.forEach(c => run(`cliente ${c.full_name}`, () => upsertClient(c)));
console.log(`🧑‍💼 Clientes: ${CLIENTS.length} configurados.`);

// Parcelas do contrato (financeiro do portal do cliente)
const instCols = colsOf('contract_installments');
if (instCols.length) {
  CLIENTS.forEach(c => run(`parcelas ${c.id}`, () => {
    db.prepare('DELETE FROM contract_installments WHERE client_id = ?').run(c.id);
    for (let i = 1; i <= c.installments_count; i++) {
      const status = i === 1 ? 'Pago' : 'Pendente';
      const data = {
        client_id: c.id, installment_number: i, total_installments: c.installments_count,
        amount: c.installment_value, due_date: daysFromNow((i - 1) * 30).slice(0, 10),
        paid_date: i === 1 ? now().slice(0, 10) : null, paid_amount: i === 1 ? c.installment_value : 0,
        status, payment_method: i === 1 ? 'PIX' : null, created_at: now(), updated_at: now(),
      };
      const keys = Object.keys(data).filter(k => instCols.includes(k));
      const ph = keys.map(() => '?').join(',');
      db.prepare(`INSERT INTO contract_installments (${keys.join(',')}) VALUES (${ph})`).run(...keys.map(k => data[k]));
    }
  }));
}

// ============================================================
// 3. COLABORADORES (hr_employees) — portal do colaborador
//    Login: CPF | Senha: CPF (somente números)
// ============================================================
const EMPLOYEES = [
  { id: 'EMP-DEMO-01', name: 'Ana Paula Rezende', cpf: '123.456.789-09', position: 'Recepcionista', department: 'Administrativo', contract_type: 'CLT', base_salary: 1800 },
  { id: 'EMP-DEMO-02', name: 'Bruno Carvalho', cpf: '987.654.321-00', position: 'Assistente Jurídico', department: 'Jurídico', contract_type: 'CLT', base_salary: 2500 },
  { id: 'EMP-DEMO-03', name: 'Carla Nogueira', cpf: '456.789.123-11', position: 'Analista Financeiro', department: 'Financeiro', contract_type: 'CLT', base_salary: 3200 },
];
const empCols = colsOf('hr_employees');
function upsertEmployee(e) {
  const data = {
    id: e.id, name: e.name, cpf: e.cpf, position: e.position, department: e.department,
    contract_type: e.contract_type, base_salary: e.base_salary, status: 'Ativo',
    admission_date: '2024-01-15', work_hours_weekly: 44, daily_hours: 8,
    created_at: now(), updated_at: now(),
  };
  const keys = Object.keys(data).filter(k => empCols.includes(k));
  const exists = db.prepare('SELECT id FROM hr_employees WHERE id = ? OR cpf = ?').get(e.id, e.cpf);
  if (exists) {
    const setPairs = keys.filter(k => k !== 'id').map(k => `${k}=?`).join(', ');
    db.prepare(`UPDATE hr_employees SET ${setPairs} WHERE id=?`).run(...keys.filter(k => k !== 'id').map(k => data[k]), exists.id);
  } else {
    const ph = keys.map(() => '?').join(',');
    db.prepare(`INSERT INTO hr_employees (${keys.join(',')}) VALUES (${ph})`).run(...keys.map(k => data[k]));
  }
}
EMPLOYEES.forEach(e => run(`colaborador ${e.name}`, () => upsertEmployee(e)));
console.log(`👷 Colaboradores: ${EMPLOYEES.length} configurados.`);

// ============================================================
// 4. MÓDULOS NORMALMENTE VAZIOS — Foguetes e NFS-e
// ============================================================
const rocketCols = colsOf('rockets');
const ROCKETS = [
  { protocol_number: 'FGT-DEMO-0001', sender_name: 'Dra. Mariana Costa', sender_role: 'advogado', recipient_name: 'Lucas Pereira (Estagiário)', subject: 'Protocolar petição inicial', message: 'Lucas, protocole a petição inicial do processo 0801234-56.2024 até amanhã às 12h.', message_type: 'tarefa', priority: 'alta', status: 'pendente', deadline: daysFromNow(1) },
  { protocol_number: 'FGT-DEMO-0002', sender_name: 'Patrícia Ramos (Secretária)', sender_role: 'secretaria', recipient_name: 'Dr. Carlos Menezes', subject: 'Cliente aguardando retorno', message: 'O cliente João da Silva ligou pedindo atualização sobre a audiência.', message_type: 'comunicado', priority: 'normal', status: 'pendente', deadline: null },
  { protocol_number: 'FGT-DEMO-0003', sender_name: 'Roberto Lima (Financeiro)', sender_role: 'financeiro', recipient_name: 'Todos', recipient_type: 'grupo', subject: 'Fechamento do mês', message: 'Lembrete: enviar as notas fiscais até o dia 30.', message_type: 'aviso', priority: 'baixa', status: 'lido', deadline: null },
  { protocol_number: 'FGT-DEMO-0004', sender_name: 'Dr. Jorge Alvim (Mestre)', sender_role: 'master', recipient_name: 'Dra. Mariana Costa', subject: 'Reunião de equipe', message: 'Reunião geral sexta-feira às 9h. Confirmar presença.', message_type: 'convocacao', priority: 'alta', status: 'pendente', deadline: daysFromNow(3) },
];
ROCKETS.forEach(r => run(`foguete ${r.protocol_number}`, () => {
  const data = { ...r, recipient_type: r.recipient_type || 'individual', is_archived: 0, created_at: now(), updated_at: now() };
  const keys = Object.keys(data).filter(k => rocketCols.includes(k));
  const ph = keys.map(() => '?').join(',');
  db.prepare(`INSERT OR IGNORE INTO rockets (${keys.join(',')}) VALUES (${ph})`).run(...keys.map(k => data[k]));
  // resposta de exemplo
  const rocket = db.prepare('SELECT id FROM rockets WHERE protocol_number = ?').get(r.protocol_number);
  const replyCols = colsOf('rocket_replies');
  if (rocket && replyCols.length) {
    const exists = db.prepare('SELECT id FROM rocket_replies WHERE rocket_id = ?').get(rocket.id);
    if (!exists) {
      const rd = { rocket_id: rocket.id, author_name: r.recipient_name, author_role: 'advogado', reply_type: 'resposta', message: 'Recebido, já estou providenciando.', created_at: now() };
      const rk = Object.keys(rd).filter(k => replyCols.includes(k));
      db.prepare(`INSERT INTO rocket_replies (${rk.join(',')}) VALUES (${rk.map(() => '?').join(',')})`).run(...rk.map(k => rd[k]));
    }
  }
}));
console.log(`🚀 Foguetes: ${ROCKETS.length} criados.`);

const nfseCols = colsOf('nfse_records');
const NFSE = [
  { client_id: 'CLI-DEMO-01', client_name: 'João da Silva Santos', client_doc: '111.444.777-35', service_code: '17.14', service_description: 'Serviços advocatícios - Ação Trabalhista', service_amount: 1000, iss_rate: 2, iss_amount: 20, rps_number: 'RPS-0001', nfse_number: 'NFSE-2026-0001', status: 'Emitida' },
  { client_id: 'CLI-DEMO-03', client_name: 'Tech Solutions Comércio LTDA', client_doc: '11.222.333/0001-81', service_code: '17.14', service_description: 'Assessoria jurídica empresarial mensal', service_amount: 2000, iss_rate: 2, iss_amount: 40, rps_number: 'RPS-0002', nfse_number: 'NFSE-2026-0002', status: 'Emitida' },
];
NFSE.forEach(n => run(`nfse ${n.rps_number}`, () => {
  const exists = db.prepare('SELECT id FROM nfse_records WHERE rps_number = ?').get(n.rps_number);
  if (exists) return;
  const data = { ...n, issued_at: now(), created_at: now() };
  const keys = Object.keys(data).filter(k => nfseCols.includes(k));
  db.prepare(`INSERT INTO nfse_records (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => data[k]));
}));
console.log(`🧾 NFS-e: ${NFSE.length} criadas.`);

// ============================================================
// 5. LEADS, PROCESSOS, AGENDA e FINANCEIRO ligados aos clientes demo
// ============================================================
const leadCols = colsOf('leads');
const LEADS = [
  { id: 'JA-2026-9001', name: 'Pedro Henrique Dias', phone: '(32) 99911-0001', area: 'Direito Trabalhista', message: 'Fui demitido sem justa causa e não recebi as verbas rescisórias.', status: 'Novo' },
  { id: 'JA-2026-9002', name: 'Luciana Ferreira', phone: '(32) 99911-0002', area: 'Direito de Família', message: 'Preciso de orientação sobre divórcio e pensão.', status: 'Em Atendimento' },
  { id: 'JA-2026-9003', name: 'Empresa ABC Ltda', phone: '(32) 99911-0003', area: 'Direito Empresarial', message: 'Contrato com fornecedor descumprido.', status: 'Convertido' },
];
LEADS.forEach(l => run(`lead ${l.id}`, () => {
  const data = { ...l, created_at: now() };
  const keys = Object.keys(data).filter(k => leadCols.includes(k));
  db.prepare(`INSERT OR REPLACE INTO leads (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => data[k]));
}));
console.log(`📥 Leads: ${LEADS.length} criados.`);

const lawsuitCols = colsOf('lawsuits');
const LAWSUITS = [
  { id: 'PROC-DEMO-9001', client_id: 'CLI-DEMO-01', cnj_number: '0801234-56.2026.8.13.0145', tribunal: 'TJMG', instance: '1ª Instância', action_type: 'Reclamação Trabalhista', subject: 'Verbas rescisórias', status: 'Em Andamento', court_branch: '2ª Vara do Trabalho de Juiz de Fora' },
  { id: 'PROC-DEMO-9002', client_id: 'CLI-DEMO-03', cnj_number: '0805678-90.2026.8.13.0145', tribunal: 'TJMG', instance: '1ª Instância', action_type: 'Ação de Cobrança', subject: 'Descumprimento contratual', status: 'Em Andamento', court_branch: '3ª Vara Cível de Juiz de Fora' },
];
LAWSUITS.forEach(ls => run(`processo ${ls.cnj_number}`, () => {
  const exists = db.prepare('SELECT id FROM lawsuits WHERE cnj_number = ?').get(ls.cnj_number);
  if (exists) return;
  const data = { ...ls, distribution_date: daysFromNow(-60).slice(0, 10), created_at: now(), updated_at: now() };
  const keys = Object.keys(data).filter(k => lawsuitCols.includes(k));
  db.prepare(`INSERT INTO lawsuits (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => data[k]));
  const lawsuit = db.prepare('SELECT id FROM lawsuits WHERE cnj_number = ?').get(ls.cnj_number);
  const histCols = colsOf('lawsuit_history');
  if (lawsuit && histCols.length) {
    const h = { lawsuit_id: lawsuit.id, event_date: daysFromNow(-30).slice(0, 10), description: 'Processo distribuído e citação expedida.', source: 'Manual', created_at: now() };
    const hk = Object.keys(h).filter(k => histCols.includes(k));
    db.prepare(`INSERT INTO lawsuit_history (${hk.join(',')}) VALUES (${hk.map(() => '?').join(',')})`).run(...hk.map(k => h[k]));
  }
}));
console.log(`⚖️  Processos: ${LAWSUITS.length} criados.`);

const calCols = colsOf('calendar_events');
const EVENTS = [
  { title: 'Audiência - João da Silva', event_type: 'Audiência', start_datetime: daysFromNow(5), end_datetime: daysFromNow(5), client_id: 'CLI-DEMO-01', client_name: 'João da Silva Santos', priority: 'Alta', status: 'Pendente' },
  { title: 'Prazo: Contestação Tech Solutions', event_type: 'Prazo', start_datetime: daysFromNow(8), end_datetime: daysFromNow(8), client_id: 'CLI-DEMO-03', client_name: 'Tech Solutions Comércio LTDA', priority: 'Alta', status: 'Pendente' },
  { title: 'Reunião com cliente Maria Souza', event_type: 'Reunião', start_datetime: daysFromNow(2), end_datetime: daysFromNow(2), client_id: 'CLI-DEMO-02', client_name: 'Maria Aparecida Souza', priority: 'Média', status: 'Pendente' },
];
EVENTS.forEach((ev, i) => run(`agenda ${i + 1}`, () => {
  const exists = db.prepare('SELECT id FROM calendar_events WHERE title = ? AND start_datetime = ?').get(ev.title, ev.start_datetime);
  if (exists) return;
  const data = { ...ev, all_day: 0, created_at: now(), updated_at: now() };
  const keys = Object.keys(data).filter(k => calCols.includes(k));
  db.prepare(`INSERT INTO calendar_events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => data[k]));
}));
console.log(`📅 Agenda: ${EVENTS.length} eventos criados.`);

const finCols = colsOf('financial_transactions');
const FINANCE = [
  { type: 'Receita', category: 'Honorários', description: 'Honorários - João da Silva (parcela 1/6)', amount: 1000, due_date: now().slice(0, 10), payment_date: now().slice(0, 10), status: 'Pago', client_id: 'CLI-DEMO-01', payment_method: 'PIX' },
  { type: 'Receita', category: 'Honorários', description: 'Assessoria mensal - Tech Solutions', amount: 2000, due_date: daysFromNow(5).slice(0, 10), status: 'Pendente', client_id: 'CLI-DEMO-03' },
  { type: 'Despesa', category: 'Custas Processuais', description: 'Custas iniciais processo 0801234-56', amount: 350, due_date: daysFromNow(3).slice(0, 10), status: 'Pendente', client_id: 'CLI-DEMO-01' },
  { type: 'Despesa', category: 'Folha de Pagamento', description: 'Salário - Ana Paula Rezende', amount: 1800, due_date: daysFromNow(10).slice(0, 10), status: 'Pendente' },
];
FINANCE.forEach((f, i) => run(`financeiro ${i + 1}`, () => {
  const exists = db.prepare('SELECT id FROM financial_transactions WHERE description = ?').get(f.description);
  if (exists) return;
  const data = { ...f, created_at: now(), updated_at: now() };
  const keys = Object.keys(data).filter(k => finCols.includes(k));
  db.prepare(`INSERT INTO financial_transactions (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => data[k]));
}));
console.log(`💰 Financeiro: ${FINANCE.length} lançamentos criados.`);

console.log(`\n✅ Seed concluído. ${okCount} operações OK, ${errCount} avisos.`);
console.log('   Rode "node server.js" e teste os logins listados em CREDENCIAIS-DEMO.md');
