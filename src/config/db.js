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

// ============================================================================
//  NOTA DE ARQUITETURA
//  As tabelas de domínio (leads, clients, lawsuits, calendar_events,
//  blog_posts, financial_transactions, offices, hr_*, site_visits, etc.)
//  são criadas de forma AUTORITATIVA no server.js. Antes, este arquivo as
//  recriava com um schema antigo/divergente e, por rodar antes do server.js,
//  "vencia" via CREATE TABLE IF NOT EXISTS — quebrando bancos novos
//  (ex.: blog_posts sem coluna `tags`, calendar_events sem `start_datetime`).
//  Aqui mantemos APENAS: as tabelas exclusivas deste módulo (documentos,
//  foguetes) e as tabelas de autenticação necessárias para semear o usuário
//  mestre logo na importação. Fonte única da verdade para o restante: server.js.
// ============================================================================

// Tabela de Usuários e Administradores do Painel
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

// Documentos de Clientes (tabela própria deste módulo)
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

// Histórico de Andamentos Processuais (tabela própria deste módulo)
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

// Documentos e Petições de Processos (tabela própria deste módulo)
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

// NFS-e Emitidas (tabela própria deste módulo)
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

// Folha de Pagamento (tabela própria deste módulo)
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

// Rescisões (tabela própria deste módulo)
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

// Foguetes e Despachos Rápidos (tabela própria — usada pelo módulo rockets)
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

// NOTA: a tabela `access_permissions` e seu preenchimento são criados/geridos
// pelo server.js (esquema atual com role_template + tab_*). Este módulo apenas
// garante a existência do usuário mestre; as permissões são semeadas depois,
// por syncAllAccessPermissions() no server.js.

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

  console.log('👑 [AUTH] Usuário mestre garantido. Permissões serão semeadas pelo server.js.');
} catch (err) {
  console.error('[CONFIG] Erro na inicialização do Usuário Mestre:', err);
}
