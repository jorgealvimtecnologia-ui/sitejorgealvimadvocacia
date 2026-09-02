import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { DB_PATH } from './constants.js';

// Inicialização do Banco de Dados SQLite Local com WAL Mode
export const db = new DatabaseSync(DB_PATH);
try {
  db.exec(`PRAGMA journal_mode = WAL;`);
} catch (e) {}

// Funções Auxiliares de Criptografia de Senha
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

// 1. Tabela de Leads / Atendimentos do Site
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    area TEXT NOT NULL,
    message TEXT,
    files TEXT,
    status TEXT DEFAULT 'Novo'
  );
`);

// 2. Tabela de Usuários e Administradores do Painel
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT NOT NULL,
    plain_password TEXT
  );
`);

try { db.exec(`ALTER TABLE users ADD COLUMN plain_password TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE access_permissions ADD COLUMN plain_password TEXT;`); } catch (e) {}

// 3. Tabela de Clientes
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    client_type TEXT NOT NULL DEFAULT 'PF',
    full_name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    cnpj TEXT,
    street TEXT,
    number TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    cep TEXT,
    complement TEXT,
    filiation_father TEXT,
    filiation_mother TEXT,
    email TEXT,
    phone TEXT NOT NULL,
    social_media TEXT,
    rep_name TEXT,
    rep_cpf TEXT,
    rep_rg TEXT,
    rep_street TEXT,
    rep_number TEXT,
    rep_neighborhood TEXT,
    rep_city TEXT,
    rep_state TEXT,
    rep_cep TEXT,
    rep_complement TEXT,
    contract_value REAL DEFAULT 0,
    installments_count INTEGER DEFAULT 1,
    installment_value REAL DEFAULT 0,
    due_date TEXT,
    amount_paid REAL DEFAULT 0,
    balance_due REAL DEFAULT 0,
    invoice_number TEXT,
    contract_status TEXT DEFAULT 'Ativo',
    notes TEXT,
    created_at TEXT NOT NULL,
    password_hash TEXT,
    salt TEXT,
    first_access INTEGER DEFAULT 1,
    last_login TEXT,
    reset_token TEXT,
    reset_token_expires TEXT
  );
`);

// 3.1 Documentos de Clientes
db.exec(`
  CREATE TABLE IF NOT EXISTS client_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
`);

// 4. Tabela de Processos Judiciais
db.exec(`
  CREATE TABLE IF NOT EXISTS lawsuits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    cnj_number TEXT UNIQUE NOT NULL,
    tribunal TEXT NOT NULL,
    instance TEXT DEFAULT '1ª Instância',
    court_branch TEXT,
    action_type TEXT NOT NULL,
    distribution_date TEXT,
    judge_name TEXT,
    status TEXT DEFAULT 'Em Andamento',
    notes TEXT,
    last_sync_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
`);

// 4.1 Histórico de Andamentos Processuais
db.exec(`
  CREATE TABLE IF NOT EXISTS lawsuit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lawsuit_id INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    description TEXT NOT NULL,
    source TEXT DEFAULT 'Manual',
    created_at TEXT NOT NULL,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE CASCADE
  );
`);

// 4.2 Documentos e Petições de Processos
db.exec(`
  CREATE TABLE IF NOT EXISTS lawsuit_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lawsuit_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE CASCADE
  );
`);

// 5. Eventos do Calendário, Prazos e Rascunhos
db.exec(`
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    start_time TEXT,
    end_date TEXT,
    end_time TEXT,
    all_day INTEGER DEFAULT 0,
    client_id TEXT,
    lawsuit_id INTEGER,
    assigned_to TEXT,
    priority TEXT DEFAULT 'Media',
    status TEXT DEFAULT 'Pendente',
    alert_minutes INTEGER DEFAULT 60,
    location TEXT,
    description TEXT,
    is_draft INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// 5.1 Publicações Judiciais
db.exec(`
  CREATE TABLE IF NOT EXISTS court_publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_journal TEXT NOT NULL,
    edition_number TEXT,
    publication_date TEXT NOT NULL,
    cnj_number TEXT,
    lawsuit_id INTEGER,
    client_id TEXT,
    recipient_lawyer TEXT NOT NULL,
    content TEXT NOT NULL,
    deadline_days INTEGER,
    fatal_deadline TEXT,
    status TEXT DEFAULT 'Nao Lida',
    created_at TEXT NOT NULL
  );
`);

// 6. Transações Financeiras e Livro Caixa
db.exec(`
  CREATE TABLE IF NOT EXISTS financial_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    payment_date TEXT,
    status TEXT DEFAULT 'Pendente',
    payment_method TEXT,
    account TEXT DEFAULT 'Conta Principal',
    client_id TEXT,
    lawsuit_id INTEGER,
    document_number TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// 6.1 NFS-e Emitidas
db.exec(`
  CREATE TABLE IF NOT EXISTS nfse_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    client_id TEXT,
    client_name TEXT NOT NULL,
    client_doc TEXT NOT NULL,
    service_code TEXT NOT NULL,
    service_description TEXT NOT NULL,
    service_amount REAL NOT NULL,
    iss_rate REAL DEFAULT 2.0,
    iss_amount REAL DEFAULT 0,
    rps_number TEXT,
    nfse_number TEXT,
    verification_code TEXT,
    status TEXT DEFAULT 'Emitida',
    pdf_url TEXT,
    xml_content TEXT,
    issued_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  );
`);

// 7. Blog e Moderação
db.exec(`
  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT DEFAULT 'Advogado(a)',
    cover_image TEXT,
    read_time_minutes INTEGER DEFAULT 5,
    status TEXT DEFAULT 'published',
    views_count INTEGER DEFAULT 0,
    published_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blog_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    author_city TEXT,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    ip_address TEXT,
    user_agent TEXT,
    moderated_by TEXT,
    moderated_at TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
  );
`);

// 7.1 Escritórios e Sociedades
db.exec(`
  CREATE TABLE IF NOT EXISTS offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    corporate_name TEXT NOT NULL,
    trade_name TEXT,
    cnpj TEXT UNIQUE,
    oab_society_number TEXT,
    oab_uf TEXT DEFAULT 'MG',
    street TEXT,
    number TEXT,
    complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT DEFAULT 'MG',
    cep TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    is_headquarters INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS office_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    office_id INTEGER NOT NULL,
    member_type TEXT NOT NULL,
    name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    oab_number TEXT,
    oab_uf TEXT DEFAULT 'MG',
    role TEXT NOT NULL,
    share_percentage REAL DEFAULT 0,
    email TEXT,
    phone TEXT,
    is_active INTEGER DEFAULT 1,
    admission_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
  );
`);

// 7.2 Drive do Escritório
db.exec(`
  CREATE TABLE IF NOT EXISTS office_drive_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_category TEXT NOT NULL,
    file_title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    is_confidential INTEGER DEFAULT 0,
    tags TEXT,
    description TEXT,
    created_at TEXT NOT NULL
  );
`);

// 7.3 RH e Colaboradores
db.exec(`
  CREATE TABLE IF NOT EXISTS hr_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    rg TEXT,
    pis_pasep TEXT,
    ctps_number TEXT,
    ctps_series TEXT,
    birth_date TEXT,
    gender TEXT,
    marital_status TEXT,
    education_level TEXT,
    street TEXT,
    number TEXT,
    complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT DEFAULT 'MG',
    cep TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    contract_type TEXT NOT NULL,
    admission_date TEXT NOT NULL,
    termination_date TEXT,
    department TEXT NOT NULL,
    position TEXT NOT NULL,
    cbo_code TEXT,
    base_salary REAL NOT NULL,
    work_regime TEXT DEFAULT 'Presencial',
    weekly_hours REAL DEFAULT 44,
    bank_name TEXT,
    bank_agency TEXT,
    bank_account TEXT,
    pix_key TEXT,
    transport_voucher INTEGER DEFAULT 1,
    meal_voucher INTEGER DEFAULT 1,
    health_insurance INTEGER DEFAULT 0,
    dependents_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS hr_time_clock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    record_date TEXT NOT NULL,
    entry_time TEXT,
    interval_start TEXT,
    interval_end TEXT,
    exit_time TEXT,
    total_hours REAL DEFAULT 0,
    extra_hours REAL DEFAULT 0,
    delay_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Normal',
    origin TEXT DEFAULT 'Painel',
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS hr_payroll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    base_salary REAL NOT NULL,
    inss_deduction REAL NOT NULL,
    irrf_deduction REAL NOT NULL,
    transport_deduction REAL DEFAULT 0,
    other_additions REAL DEFAULT 0,
    other_discounts REAL DEFAULT 0,
    gross_total REAL NOT NULL,
    total_deductions REAL NOT NULL,
    net_total REAL NOT NULL,
    status TEXT DEFAULT 'Gerada',
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS hr_terminations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    notice_type TEXT NOT NULL,
    termination_date TEXT NOT NULL,
    base_salary REAL NOT NULL,
    balance_salary REAL NOT NULL,
    prior_notice_val REAL DEFAULT 0,
    thirteenth_val REAL NOT NULL,
    vacation_val REAL NOT NULL,
    vacation_bonus_val REAL NOT NULL,
    fgts_fine_val REAL DEFAULT 0,
    inss_deduction REAL NOT NULL,
    irrf_deduction REAL NOT NULL,
    other_discounts REAL DEFAULT 0,
    gross_total REAL NOT NULL,
    total_deductions REAL NOT NULL,
    net_total REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );
`);

// 7.6 Foguetes e Despachos Rápidos
db.exec(`
  CREATE TABLE IF NOT EXISTS rockets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_number TEXT UNIQUE NOT NULL,
    sender_id TEXT,
    sender_name TEXT NOT NULL,
    sender_role TEXT,
    recipient_id TEXT,
    recipient_name TEXT NOT NULL,
    recipient_type TEXT DEFAULT 'individual',
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    deadline TEXT,
    status TEXT DEFAULT 'pendente',
    is_archived INTEGER DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS rocket_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rocket_id INTEGER NOT NULL,
    author_id TEXT,
    author_name TEXT NOT NULL,
    author_role TEXT,
    reply_type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (rocket_id) REFERENCES rockets(id) ON DELETE CASCADE
  );
`);

// 8. Trilha de Auditoria e Logs LGPD
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    event_name TEXT NOT NULL,
    module TEXT NOT NULL,
    resource_id TEXT,
    user_cpf TEXT,
    user_name TEXT NOT NULL,
    user_role TEXT,
    ip_address TEXT,
    user_agent TEXT,
    description TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );
`);

// 9. Visitas e Rastreamento de Tráfego
db.exec(`
  CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    referer TEXT,
    page_url TEXT,
    path TEXT,
    visit_date TEXT NOT NULL,
    visit_year INTEGER NOT NULL,
    visit_month INTEGER NOT NULL,
    visit_day INTEGER NOT NULL,
    visit_hour INTEGER NOT NULL,
    city TEXT,
    region TEXT,
    country TEXT,
    latitude REAL,
    longitude REAL,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    converted_lead_id TEXT,
    converted_client_id TEXT,
    status TEXT DEFAULT 'Visitante',
    created_at TEXT NOT NULL
  );
`);

// 10. Matriz de Permissões RBAC/ABAC
db.exec(`
  CREATE TABLE IF NOT EXISTS access_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    can_access_leads INTEGER DEFAULT 1,
    can_access_clients INTEGER DEFAULT 1,
    can_access_lawsuits INTEGER DEFAULT 1,
    can_access_calendar INTEGER DEFAULT 1,
    can_access_publications INTEGER DEFAULT 1,
    can_access_docs INTEGER DEFAULT 1,
    can_access_finance INTEGER DEFAULT 0,
    can_access_nfse INTEGER DEFAULT 0,
    can_access_blog INTEGER DEFAULT 1,
    can_access_audit INTEGER DEFAULT 0,
    can_access_pre_clients INTEGER DEFAULT 1,
    can_access_judicial INTEGER DEFAULT 1,
    can_access_offices INTEGER DEFAULT 0,
    can_access_drive INTEGER DEFAULT 1,
    can_access_users INTEGER DEFAULT 0,
    can_access_hr INTEGER DEFAULT 0,
    can_access_rockets INTEGER DEFAULT 1,
    can_export_data INTEGER DEFAULT 0,
    can_delete_records INTEGER DEFAULT 0,
    can_view_financial_reports INTEGER DEFAULT 0,
    plain_password TEXT,
    updated_at TEXT NOT NULL
  );
`);

// Sincronização e Garantia do Usuário Mestre Dr. Jorge Alvim
try {
  const { hash, salt } = hashPassword('jorgealvim');
  const masterCheck = db.prepare(`SELECT id FROM users WHERE username = ? OR id = ?`).get('jorgealvimtecnologia', 'USR-MASTER-01');
  if (!masterCheck) {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at, plain_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'USR-MASTER-01',
      'jorgealvimtecnologia',
      hash,
      salt,
      'Dr. Jorge Alvim (Mestre)',
      'master',
      new Date().toISOString(),
      'jorgealvim'
    );
    console.log('👑 [AUTH] Usuário Mestre "jorgealvimtecnologia" criado com sucesso.');
  } else {
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, salt = ?, role = 'master', plain_password = 'jorgealvim' 
      WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'
    `).run(hash, salt);
    console.log('👑 [AUTH] Credenciais do Usuário Mestre "jorgealvimtecnologia" sincronizadas com sucesso.');
  }

  // Preenche senhas legíveis para os operadores cadastrados para fins de desenvolvimento / testes
  db.exec(`
    UPDATE users SET plain_password = 'jorgealvim' WHERE username = 'jorgealvimtecnologia' OR id = 'USR-MASTER-01' OR username LIKE '%jorge%';
    UPDATE users SET plain_password = '123' WHERE plain_password IS NULL;
  `);

  // Sincroniza Matriz de Controle de Acesso
  const allUsers = db.prepare(`SELECT * FROM users`).all();
  allUsers.forEach(u => {
    const isMaster = u.role === 'master' || u.username === 'jorgealvimtecnologia';
    const isAdv = u.role === 'advogado' || u.role === 'admin';
    const existing = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(u.id);

    if (!existing) {
      db.prepare(`
        INSERT INTO access_permissions (
          user_id, username, user_name, user_role,
          can_access_leads, can_access_clients, can_access_lawsuits, can_access_calendar,
          can_access_publications, can_access_docs, can_access_finance, can_access_nfse,
          can_access_blog, can_access_audit, can_access_pre_clients, can_access_judicial,
          can_access_offices, can_access_drive, can_access_users, can_access_hr,
          can_access_rockets, can_export_data, can_delete_records, can_view_financial_reports,
          plain_password, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          1, 1, 1, 1,
          1, 1, ?, ?,
          1, ?, 1, 1,
          ?, 1, ?, ?,
          1, ?, ?, ?,
          ?, ?
        )
      `).run(
        u.id, u.username, u.name, u.role || 'admin',
        isMaster ? 1 : 0, isMaster ? 1 : 0,
        isMaster ? 1 : 0,
        isMaster ? 1 : 0, isMaster ? 1 : 0, isMaster ? 1 : 0,
        isMaster ? 1 : 0, isMaster ? 1 : 0, isMaster ? 1 : 0,
        u.plain_password || '123',
        new Date().toISOString()
      );
    }
  });

  console.log('🛡️ [RBAC/ABAC] Sincronização de Matriz de Controle de Acesso concluída com sucesso!');
} catch (err) {
  console.error('[CONFIG] Erro na inicialização do Usuário Mestre:', err);
}
