import express from 'express';
import multer from 'multer';
import cors from 'cors';
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
import { logAudit } from './src/middleware/audit.js';
import { rocketsRouter } from './src/modules/rockets/rockets.routes.js';
import { notificationsRouter, startDeadlineScanner } from './src/modules/notifications/notifications.routes.js';
import { esignRouter } from './src/modules/esign/esign.routes.js';
import { lgpdRouter } from './src/modules/lgpd/lgpd.routes.js';
import { dashboardRouter } from './src/modules/dashboard/dashboard.routes.js';
import { analyticsRouter } from './src/modules/analytics/analytics.routes.js';
import { syncRouter, syncComunicaApi, startSyncScheduler, registerSyncTask } from './src/modules/sync/sync.routes.js';
import { adminRequestsRouter } from './src/modules/adminrequests/adminrequests.routes.js';
import { kanbanRouter } from './src/modules/kanban/kanban.routes.js';
import { runMigrations } from './src/db/migrate.js';
import { validatePassword, PASSWORD_MIN, PASSWORD_MAX } from './src/shared/password-policy.js';
import { getClientIp } from './src/shared/net.js';
import { generateNextClientId, generateNextLawsuitId } from './src/shared/ids.js';
import { blogRouter } from './src/modules/blog/blog.routes.js';
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
import { loginRateLimit } from './src/shared/login-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis de ambiente do arquivo .env (carregador nativo do Node >= 20.12/22).
// Segredos (chaves Asaas, origens CORS, etc.) devem ficar no .env, nunca no código.
try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(path.join(__dirname, '.env'))) {
    process.loadEnvFile(path.join(__dirname, '.env'));
  }
} catch (e) {
  console.warn('[ENV] Não foi possível carregar .env:', e.message);
}

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

// Configuração do Multer para o Drive do Escritório (Até 100MB por anexo)
const driveStorageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_DRIVE_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  }
});

const uploadDrive = multer({
  storage: driveStorageEngine,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Banco: conexão única importada de src/config/db.js (ver import no topo).

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
// CONSOLIDAÇÃO DE SCHEMA: a tabela `users` é criada de forma AUTORITATIVA em
// src/config/db.js, que roda no import (antes do corpo deste arquivo) para semear
// o usuário mestre. Não a recriamos aqui — evita a fonte dupla de verdade ("dois
// cérebros"). Mantemos apenas os ALTER idempotentes abaixo como rede de segurança
// para bancos antigos que não tinham a coluna plain_password.

try {
  db.exec(`ALTER TABLE users ADD COLUMN plain_password TEXT;`);
} catch (e) {}

try {
  db.exec(`ALTER TABLE access_permissions ADD COLUMN plain_password TEXT;`);
} catch (e) {}

// 3. Tabela Completa de Gestão de Clientes e Contratos
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
    
    -- Dados do Representante Legal (para Empresas / PJ)
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
    
    -- Box de Gestão de Contrato
    contract_value REAL DEFAULT 0,
    installments_count INTEGER DEFAULT 1,
    installment_value REAL DEFAULT 0,
    due_date TEXT,
    amount_paid REAL DEFAULT 0,
    balance_due REAL DEFAULT 0,
    invoice_number TEXT,
    contract_status TEXT DEFAULT 'Ativo',
    
    nationality TEXT DEFAULT 'brasileiro(a)',
    marital_status TEXT DEFAULT 'solteiro(a)',
    profession TEXT,
    
    -- Soft Delete & LGPD
    status TEXT DEFAULT 'ativo',
    deleted_at TEXT,
    deletion_reason TEXT,
    
    files TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Migração segura para colunas de qualificação civil e Soft Delete em clients existentes
try {
  const cliCols = db.prepare(`PRAGMA table_info(clients)`).all().map(c => c.name);
  if (!cliCols.includes('nationality')) {
    db.exec(`ALTER TABLE clients ADD COLUMN nationality TEXT DEFAULT 'brasileiro(a)'`);
  }
  if (!cliCols.includes('marital_status')) {
    db.exec(`ALTER TABLE clients ADD COLUMN marital_status TEXT DEFAULT 'solteiro(a)'`);
  }
  if (!cliCols.includes('profession')) {
    db.exec(`ALTER TABLE clients ADD COLUMN profession TEXT DEFAULT ''`);
  }
  if (!cliCols.includes('google_id')) {
    db.exec(`ALTER TABLE clients ADD COLUMN google_id TEXT DEFAULT NULL`);
  }
  if (!cliCols.includes('avatar_url')) {
    db.exec(`ALTER TABLE clients ADD COLUMN avatar_url TEXT DEFAULT NULL`);
  }
  if (!cliCols.includes('status')) {
    db.exec(`ALTER TABLE clients ADD COLUMN status TEXT DEFAULT 'ativo'`);
  }
  if (!cliCols.includes('deleted_at')) {
    db.exec(`ALTER TABLE clients ADD COLUMN deleted_at TEXT DEFAULT NULL`);
  }
  if (!cliCols.includes('deletion_reason')) {
    db.exec(`ALTER TABLE clients ADD COLUMN deletion_reason TEXT DEFAULT NULL`);
  }
} catch (e) {
  console.warn('Verificação de migração de clients:', e);
}

try {
  const usrCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!usrCols.includes('google_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT NULL`);
  }
  if (!usrCols.includes('google_email')) {
    db.exec(`ALTER TABLE users ADD COLUMN google_email TEXT DEFAULT NULL`);
  }
  if (!usrCols.includes('avatar_url')) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL`);
  }
} catch (e) {}

// 3.1 Tabela de Gestão de Escritórios (Pessoa Jurídica)
db.exec(`
  CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    corporate_name TEXT NOT NULL,
    trade_name TEXT,
    cnpj TEXT,
    oab_society TEXT,
    oab_uf TEXT DEFAULT 'MG',
    street TEXT,
    number TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    cep TEXT,
    complement TEXT,
    email TEXT,
    phone TEXT,
    whatsapp TEXT,
    website TEXT,
    pix_key TEXT,
    bank_info TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// 3.2 Tabela de Integrantes / Pessoas Físicas do Escritório (Empresário, Advogados, Adm, Estagiários)
db.exec(`
  CREATE TABLE IF NOT EXISTS office_members (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL,
    role_type TEXT NOT NULL,
    name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    oab_number TEXT,
    oab_uf TEXT DEFAULT 'MG',
    email TEXT,
    phone TEXT,
    position_title TEXT,
    admission_date TEXT,
    street TEXT,
    number TEXT,
    complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT DEFAULT 'MG',
    cep TEXT,
    status TEXT DEFAULT 'Ativo',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

try {
  const memCols = db.prepare(`PRAGMA table_info(office_members)`).all().map(c => c.name);
  if (!memCols.includes('street')) db.exec(`ALTER TABLE office_members ADD COLUMN street TEXT DEFAULT ''`);
  if (!memCols.includes('number')) db.exec(`ALTER TABLE office_members ADD COLUMN number TEXT DEFAULT ''`);
  if (!memCols.includes('complement')) db.exec(`ALTER TABLE office_members ADD COLUMN complement TEXT DEFAULT ''`);
  if (!memCols.includes('neighborhood')) db.exec(`ALTER TABLE office_members ADD COLUMN neighborhood TEXT DEFAULT ''`);
  if (!memCols.includes('city')) db.exec(`ALTER TABLE office_members ADD COLUMN city TEXT DEFAULT ''`);
  if (!memCols.includes('state')) db.exec(`ALTER TABLE office_members ADD COLUMN state TEXT DEFAULT 'MG'`);
  if (!memCols.includes('cep')) db.exec(`ALTER TABLE office_members ADD COLUMN cep TEXT DEFAULT ''`);
} catch (e) {
  console.warn('Verificação de migração de office_members:', e);
}

// 3.1. Tabela do Drive do Escritório (Arquivo Digital & Documentos)
db.exec(`
  CREATE TABLE IF NOT EXISTS office_drive_files (
    id TEXT PRIMARY KEY,
    folder TEXT NOT NULL DEFAULT 'Geral',
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    file_type TEXT,
    uploaded_by TEXT DEFAULT 'Administrador',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// 3.2. Tabela de Matriz de Controle de Acessos & Permissões Granulares (RBAC/ABAC)
db.exec(`
  CREATE TABLE IF NOT EXISTS access_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    user_type TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_identifier TEXT,
    user_email TEXT,
    user_phone TEXT,
    role_template TEXT NOT NULL DEFAULT 'advogado',
    tab_leads INTEGER DEFAULT 0,
    tab_clients INTEGER DEFAULT 0,
    tab_lawsuits INTEGER DEFAULT 0,
    tab_radar INTEGER DEFAULT 0,
    tab_offices INTEGER DEFAULT 0,
    tab_drive INTEGER DEFAULT 0,
    tab_calendar INTEGER DEFAULT 0,
    tab_publications INTEGER DEFAULT 0,
    tab_hr INTEGER DEFAULT 0,
    tab_financial INTEGER DEFAULT 0,
    tab_colaborador INTEGER DEFAULT 0,
    tab_portal_cliente INTEGER DEFAULT 0,
    tab_users INTEGER DEFAULT 0,
    tab_settings INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    data_scope TEXT DEFAULT 'assigned',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// 4. Tabelas de Processos Judiciais, Tribunais, Instâncias e Andamentos (CNJ)
db.exec(`
  CREATE TABLE IF NOT EXISTS lawsuits (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    cnj_number TEXT NOT NULL,
    tribunal TEXT NOT NULL,
    instance TEXT NOT NULL DEFAULT '1ª Instância',
    action_type TEXT,
    court_branch TEXT,
    subject TEXT,
    judge_name TEXT,
    distribution_date TEXT,
    status TEXT DEFAULT 'Em Andamento',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lawsuit_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lawsuit_id TEXT NOT NULL,
    movement_date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    deadline_date TEXT,
    deadline_status TEXT DEFAULT 'Pendente',
    created_at TEXT NOT NULL,
    FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE CASCADE
  );

  -- 5. Tabelas do Módulo Financeiro (ERP Jurídico) & Integração Asaas
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financial_transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'Receita' ou 'Despesa'
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT,
    payment_date TEXT,
    status TEXT NOT NULL DEFAULT 'Pago', -- 'Pago', 'Pendente', 'Cancelado'
    client_id TEXT,
    installment_id INTEGER,
    payment_method TEXT DEFAULT 'PIX',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contract_installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    total_installments INTEGER NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    paid_date TEXT,
    paid_amount REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pendente', -- 'Pendente', 'Pago', 'Vencido', 'Cancelado'
    payment_method TEXT,
    asaas_payment_id TEXT,
    asaas_customer_id TEXT,
    asaas_invoice_url TEXT,
    asaas_bank_slip_url TEXT,
    asaas_pix_qrcode TEXT,
    asaas_pix_copy_paste TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS alvaras (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    process_number TEXT,
    vara_tribunal TEXT,
    gross_amount REAL NOT NULL,
    fee_percentage REAL NOT NULL DEFAULT 30,
    fee_amount REAL NOT NULL,
    net_client_amount REAL NOT NULL,
    release_date TEXT NOT NULL,
    transfer_date TEXT,
    status TEXT DEFAULT 'Pendente Repasse', -- 'Pendente Repasse', 'Repassado ao Cliente'
    receipt_signed TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  -- 5.1 Tabela de Notas Fiscais Eletrônicas (NFS-e Asaas) & Recibos/RPS Timbrados OAB
  CREATE TABLE IF NOT EXISTS nfse_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    installment_id INTEGER,
    lawsuit_id TEXT,
    invoice_type TEXT DEFAULT 'NFSE_ASAAS', -- 'NFSE_ASAAS' ou 'RECIBO_OAB_RPS'
    invoice_number TEXT,
    status TEXT DEFAULT 'Emitida', -- 'Emitida', 'Pendente', 'Processando', 'Cancelada', 'Erro'
    value REAL NOT NULL,
    deductions REAL DEFAULT 0,
    net_value REAL,
    iss_rate REAL DEFAULT 2.0,
    iss_value REAL DEFAULT 0,
    irrf_value REAL DEFAULT 0,
    pis_value REAL DEFAULT 0,
    cofins_value REAL DEFAULT 0,
    csll_value REAL DEFAULT 0,
    service_code TEXT DEFAULT '17.01',
    service_description TEXT,
    issue_date TEXT NOT NULL,
    competence_date TEXT,
    asaas_invoice_id TEXT,
    asaas_payment_id TEXT,
    asaas_status TEXT,
    pdf_url TEXT,
    xml_url TEXT,
    verification_code TEXT,
    hash_signature TEXT UNIQUE,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  -- 6. Tabela de Mensagens do Portal do Cliente (Comunicação Cliente <-> Escritório)
  CREATE TABLE IF NOT EXISTS client_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    sender TEXT NOT NULL, -- 'client' ou 'office'
    sender_name TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_status INTEGER DEFAULT 0,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  -- 7. Tabela de Artigos e Informativos Jurídicos (Blog / Informativo & Educativo)
  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    cover_image TEXT,
    tags TEXT,
    author_name TEXT DEFAULT 'Dr. Jorge Eduardo da Silva Alvim',
    author_oab TEXT DEFAULT 'OAB/MG 222.943',
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    is_published INTEGER DEFAULT 1,
    published_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 7.1 Tabela de Comentários do Blog (com Moderação)
  CREATE TABLE IF NOT EXISTS blog_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    post_slug TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    author_phone TEXT,
    comment_text TEXT NOT NULL,
    is_hidden INTEGER DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 7.2 Tabela de Curtidas do Blog
  CREATE TABLE IF NOT EXISTS blog_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    post_slug TEXT NOT NULL,
    user_identifier TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );

  -- 7.3 Tabela de Compartilhamentos do Blog
  CREATE TABLE IF NOT EXISTS blog_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    post_slug TEXT NOT NULL,
    platform TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );

  -- 7.4 Tabela de Rascunhos de Atividades e Despachos (Agenda & Prazos)
  CREATE TABLE IF NOT EXISTS activity_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lawyer_name TEXT,
    lawyer_id TEXT,
    client_name TEXT,
    client_id TEXT,
    defendant_name TEXT,
    lawsuit_number TEXT,
    tribunal TEXT,
    court_branch TEXT,
    activity_title TEXT NOT NULL,
    deadline_date TEXT,
    notes TEXT,
    status TEXT DEFAULT 'rascunho',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 7.5 Tabela de Rescisões Contratuais Trabalhistas (CLT)
  CREATE TABLE IF NOT EXISTS labor_terminations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_name TEXT NOT NULL,
    employee_id TEXT,
    client_name TEXT,
    client_id TEXT,
    lawsuit_number TEXT,
    admission_date TEXT NOT NULL,
    dismissal_date TEXT NOT NULL,
    dismissal_type TEXT NOT NULL,
    base_salary REAL NOT NULL,
    notice_type TEXT DEFAULT 'indenizado',
    notice_value REAL DEFAULT 0,
    salary_balance REAL DEFAULT 0,
    thirteenth_salary REAL DEFAULT 0,
    vacation_value REAL DEFAULT 0,
    fgts_fine REAL DEFAULT 0,
    other_credits REAL DEFAULT 0,
    inss_discount REAL DEFAULT 0,
    irrf_discount REAL DEFAULT 0,
    other_discounts REAL DEFAULT 0,
    gross_total REAL NOT NULL,
    total_deductions REAL NOT NULL,
    net_total REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 8. Tabela de Auditoria e Trilha de Histórico Geral (Compliance, LGPD e Segurança)
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,       -- 'CRIACAO', 'ALTERACAO', 'EXCLUSAO', 'AUTENTICACAO', 'GERACAO_DOC', 'ACESSO'
    event_name TEXT NOT NULL,       -- 'CRIAR_CLIENTE', 'EDITAR_PROCESSO', 'GERAR_PROCURACAO', etc.
    module TEXT NOT NULL,           -- 'CLIENTES', 'PROCESSOS', 'FINANCEIRO', 'DOCUMENTOS', 'PORTAL_CLIENTE', 'BLOG', 'USUARIOS', 'LEADS', 'VISITANTES'
    resource_id TEXT,               -- ID do cliente, processo, parcela, documento, visita, etc.
    user_cpf TEXT,                  -- CPF do operador ou do cliente
    user_name TEXT NOT NULL,        -- Nome do operador ou cliente
    user_role TEXT,                 -- 'admin', 'master', 'client', 'sistema'
    ip_address TEXT,                -- IP de origem
    user_agent TEXT,                -- Navegador / Dispositivo
    description TEXT NOT NULL,      -- Descrição em linguagem clara
    details TEXT,                   -- JSON com detalhes / payload / dados anteriores e novos
    created_at TEXT NOT NULL        -- Data e hora ISO
  );

  -- 9. Tabela de Visitas ao Site, Auditoria de Tráfego e Pré-Clientes
  CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    referer TEXT,
    page_url TEXT,
    path TEXT,
    
    -- Decomposição de Data e Hora para Índices e Consultas por Dia, Mês, Ano e Hora
    visit_date TEXT NOT NULL,       -- YYYY-MM-DD
    visit_year INTEGER NOT NULL,    -- YYYY
    visit_month INTEGER NOT NULL,   -- 1 a 12
    visit_day INTEGER NOT NULL,     -- 1 a 31
    visit_hour INTEGER NOT NULL,    -- 0 a 23
    visit_time TEXT NOT NULL,       -- HH:MM:SS
    created_at TEXT NOT NULL,
    
    -- Localização Estimada do IP
    ip_city TEXT,
    ip_region TEXT,
    ip_country TEXT DEFAULT 'Brasil',
    ip_isp TEXT,
    
    -- Localização Precisa do Visitante (Consentida via GPS / Geolocation)
    shared_location INTEGER DEFAULT 0,
    geo_latitude REAL,
    geo_longitude REAL,
    geo_accuracy REAL,
    geo_city TEXT,
    geo_state TEXT,
    geo_address TEXT,
    
    -- Informações de Identificação e Redes Sociais / Empresas (Pré-Cliente)
    visitor_name TEXT,
    visitor_phone TEXT,
    visitor_email TEXT,
    social_media TEXT,             -- Instagram, Facebook, LinkedIn, TikTok, etc.
    google_business TEXT,          -- Google Meu Negócio / Perfil Comercial
    website TEXT,                  -- Site do visitante / empresa
    
    -- Detalhes de Origem & Interesse
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    interest_area TEXT,
    is_pre_client INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Visitante', -- 'Visitante', 'Localização Compartilhada', 'Pré-Cliente', 'Convertido em Lead', 'Convertido em Cliente'
    converted_lead_id TEXT,
    converted_client_id TEXT,
    notes TEXT
  );

  -- 10. Tabela de Agenda do Escritório, Prazos Judiciais e Calendário dos Advogados
  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,       -- 'audiencia', 'prazo_fatal', 'consulta', 'reuniao', 'diligencia', 'outro'
    start_datetime TEXT NOT NULL,   -- Formato ISO: YYYY-MM-DDTHH:mm ou YYYY-MM-DD
    end_datetime TEXT,              -- Formato ISO: YYYY-MM-DDTHH:mm ou YYYY-MM-DD
    all_day INTEGER DEFAULT 0,      -- 1 para dia inteiro (prazos), 0 para horário fixo
    location TEXT,                  -- Foro, Vara, Endereço ou Sala
    meeting_url TEXT,               -- Link TJMG, Zoom, Teams, Google Meet
    lawyer_id TEXT,                 -- ID do office_members ou users (NULL = escritório geral)
    lawyer_name TEXT,               -- Nome do advogado responsável
    client_id TEXT,                 -- ID do client
    client_name TEXT,               -- Nome do cliente
    lawsuit_id TEXT,                -- ID do lawsuit
    lawsuit_number TEXT,            -- Número CNJ do processo
    priority TEXT DEFAULT 'normal', -- 'baixa', 'normal', 'alta', 'fatal'
    status TEXT DEFAULT 'agendado', -- 'agendado', 'concluido', 'cancelado', 'remarcado'
    color TEXT,                     -- Cor customizada hex
    ical_uid TEXT,                  -- UID único para feed iCal
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 11. Tabela de Intimações e Publicações Judiciais (ComunicaAPI / DJEN / DataJud)
  CREATE TABLE IF NOT EXISTS court_publications (
    id TEXT PRIMARY KEY,
    comunicacao_id INTEGER UNIQUE,   -- ID único retornado pela ComunicaAPI
    numero_processo TEXT,            -- Número sem máscara
    numeroprocessocommascara TEXT,   -- Número formatado CNJ
    sigla_tribunal TEXT,             -- Ex: TJMG, TRT3, TRF6, STJ
    nome_orgao TEXT,                 -- Vara / Turma / Câmara
    tipo_comunicacao TEXT,           -- 'Intimação', 'Citação', 'Edital', 'Aviso'
    data_disponibilizacao TEXT,      -- YYYY-MM-DD
    data_publicacao TEXT,            -- YYYY-MM-DD (1º dia útil seguinte)
    texto TEXT,                      -- Inteiro teor da publicação
    nome_classe TEXT,                -- Ex: Apelação Cível, Procedimento Comum
    destinatarios_json TEXT,         -- Lista de partes JSON
    advogado_oab TEXT,               -- OAB pesquisada
    advogado_nome TEXT,              -- Nome do advogado destinatário
    lawyer_id TEXT,                  -- ID interno do advogado
    client_id TEXT,                  -- Vínculo com cliente
    lawsuit_id TEXT,                 -- Vínculo com processo
    deadline_date TEXT,              -- Data fatal calculada (se houver)
    status TEXT DEFAULT 'nao_lido',  -- 'nao_lido', 'lido', 'prazo_lancado', 'arquivado'
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 12. Tabela de Feriados Forenses e Nacionais (para Calculadora de Prazos)
  CREATE TABLE IF NOT EXISTS court_holidays (
    id TEXT PRIMARY KEY,
    holiday_date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
    name TEXT NOT NULL,
    jurisdiction TEXT DEFAULT 'nacional', -- 'nacional', 'MG', 'federal'
    is_forensic_recess INTEGER DEFAULT 0  -- 1 se for recesso forense (20/dez - 20/jan)
  );

  -- 13. MÓDULO DE GESTÃO DE PESSOAL (RH / DP) CONFORME CLT E ART. 7º DA CF/88
  -- 13.1 Tabela de Registro de Empregados & Colaboradores
  CREATE TABLE IF NOT EXISTS hr_employees (
    id TEXT PRIMARY KEY,
    member_id TEXT,                    -- Vínculo opcional com office_members
    office_id TEXT,                    -- Vínculo com offices
    name TEXT NOT NULL,
    cpf TEXT NOT NULL,
    rg TEXT,
    birth_date TEXT,
    gender TEXT,
    marital_status TEXT,
    ctps_number TEXT,
    ctps_series TEXT,
    ctps_uf TEXT DEFAULT 'MG',
    pis_pasep TEXT,
    admission_date TEXT NOT NULL,
    resignation_date TEXT,
    contract_type TEXT NOT NULL DEFAULT 'CLT', -- 'CLT', 'ESTAGIO', 'PJ', 'ASSOCIADO', 'AUTONOMO'
    position TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'Jurídico',
    base_salary REAL NOT NULL DEFAULT 0,
    work_hours_weekly INTEGER DEFAULT 44,
    daily_hours REAL DEFAULT 8,
    work_schedule TEXT DEFAULT '08:00 às 18:00 (Seg a Sex)',
    vt_enabled INTEGER DEFAULT 1,
    vt_daily_value REAL DEFAULT 12.00,
    va_enabled INTEGER DEFAULT 1,
    va_monthly_value REAL DEFAULT 650.00,
    dependents_count INTEGER DEFAULT 0,
    bank_name TEXT,
    bank_agency TEXT,
    bank_account TEXT,
    bank_pix TEXT,
    status TEXT DEFAULT 'Ativo',       -- 'Ativo', 'Férias', 'Afastado', 'Demitido'
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 13.2 Tabela de Contratos de Trabalho (CLT, Experiência, Estágio Lei 11.788, Associado)
  CREATE TABLE IF NOT EXISTS hr_contracts (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    contract_type TEXT NOT NULL,       -- 'CLT_INDETERMINADO', 'CLT_EXPERIENCIA', 'ESTAGIO_LEI_11788', 'ASSOCIADO_OAB'
    start_date TEXT NOT NULL,
    end_date TEXT,
    clauses_json TEXT,
    status TEXT DEFAULT 'Vigente',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );

  -- 13.3 Tabela de Exames Ocupacionais / PCMSO (ASO Admissional, Periódico, Demissional)
  CREATE TABLE IF NOT EXISTS hr_medical_exams (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    exam_type TEXT NOT NULL,           -- 'ADMISSIONAL', 'PERIODICO', 'RETORNO', 'MUDANCA_FUNCAO', 'DEMISSIONAL'
    exam_date TEXT NOT NULL,
    validity_date TEXT NOT NULL,
    clinic_name TEXT,
    doctor_name TEXT,
    doctor_crm TEXT,
    result TEXT DEFAULT 'APTO',        -- 'APTO', 'INAPTO'
    aso_pdf_url TEXT,
    observations TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );

  -- 13.4 Tabela de Ponto Eletrônico & Controle de Jornada (Portaria MTP 671 e Art. 74 CLT)
  CREATE TABLE IF NOT EXISTS hr_time_clock (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    record_date TEXT NOT NULL,         -- YYYY-MM-DD
    time_in TEXT,                      -- HH:mm
    lunch_out TEXT,                    -- HH:mm
    lunch_in TEXT,                     -- HH:mm
    time_out TEXT,                     -- HH:mm
    total_worked_minutes INTEGER DEFAULT 0,
    overtime_50_minutes INTEGER DEFAULT 0,
    overtime_100_minutes INTEGER DEFAULT 0,
    delay_minutes INTEGER DEFAULT 0,
    is_holiday_or_dsr INTEGER DEFAULT 0,
    signature_hash TEXT,               -- Hash SHA-256 da assinatura digital por login e senha
    signed_by_user TEXT,
    signed_at TEXT,
    ip_address TEXT,
    status TEXT DEFAULT 'PENDENTE',    -- 'PENDENTE', 'ASSINADO', 'AJUSTADO'
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );

  -- 13.5 Tabela de Folha de Pagamento & Contracheques (Holerites)
  CREATE TABLE IF NOT EXISTS hr_payrolls (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    reference_month TEXT NOT NULL,     -- YYYY-MM
    base_salary REAL NOT NULL,
    overtime_value REAL DEFAULT 0,
    dsr_value REAL DEFAULT 0,
    bonus_value REAL DEFAULT 0,
    gross_total REAL NOT NULL,
    inss_deduction REAL DEFAULT 0,
    irrf_deduction REAL DEFAULT 0,
    vt_deduction REAL DEFAULT 0,
    va_deduction REAL DEFAULT 0,
    other_deductions REAL DEFAULT 0,
    net_total REAL NOT NULL,
    fgts_base REAL NOT NULL,
    fgts_deposit REAL NOT NULL,        -- 8%
    payment_date TEXT,
    receipt_hash TEXT,
    signed_at TEXT,
    status TEXT DEFAULT 'GERADO',      -- 'GERADO', 'PAGO', 'ASSINADO'
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );

  -- 13.6 Tabela de Férias & 1/3 Constitucional (Art. 7º, XVII CF/88 e CLT)
  CREATE TABLE IF NOT EXISTS hr_vacations (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    acquisitive_start TEXT NOT NULL,
    acquisitive_end TEXT NOT NULL,
    concessive_limit TEXT NOT NULL,
    vacation_days INTEGER DEFAULT 30,
    abono_pecuniario_days INTEGER DEFAULT 0,
    vacation_start TEXT NOT NULL,
    vacation_end TEXT NOT NULL,
    base_salary REAL NOT NULL,
    one_third_constitutional REAL NOT NULL,
    abono_value REAL DEFAULT 0,
    gross_vacation REAL NOT NULL,
    inss_deduction REAL DEFAULT 0,
    irrf_deduction REAL DEFAULT 0,
    net_vacation REAL NOT NULL,
    payment_deadline TEXT NOT NULL,
    receipt_signed_at TEXT,
    status TEXT DEFAULT 'PROGRAMADA',  -- 'PROGRAMADA', 'GOZADA', 'PAGA'
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );

  -- 13.7 Tabela de Décimo Terceiro Salário (Lei 4.090/62 e Art. 7º, VIII CF/88)
  CREATE TABLE IF NOT EXISTS hr_thirteenth_salary (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    reference_year INTEGER NOT NULL,
    installment TEXT NOT NULL,         -- '1', '2', 'INTEGRAL'
    months_worked INTEGER DEFAULT 12,
    base_salary REAL NOT NULL,
    installment_gross REAL NOT NULL,
    inss_deduction REAL DEFAULT 0,
    irrf_deduction REAL DEFAULT 0,
    installment_net REAL NOT NULL,
    payment_date TEXT NOT NULL,
    status TEXT DEFAULT 'PAGO',
    receipt_signed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
  );
`);

// Migração segura para colunas de redes sociais, website e google_business em clients e leads
try {
  const cliCols = db.prepare(`PRAGMA table_info(clients)`).all().map(c => c.name);
  if (!cliCols.includes('website')) {
    db.exec(`ALTER TABLE clients ADD COLUMN website TEXT DEFAULT ''`);
  }
  if (!cliCols.includes('google_business')) {
    db.exec(`ALTER TABLE clients ADD COLUMN google_business TEXT DEFAULT ''`);
  }
  if (!cliCols.includes('social_media')) {
    db.exec(`ALTER TABLE clients ADD COLUMN social_media TEXT DEFAULT ''`);
  }

  const leadCols = db.prepare(`PRAGMA table_info(leads)`).all().map(c => c.name);
  if (!leadCols.includes('website')) {
    db.exec(`ALTER TABLE leads ADD COLUMN website TEXT DEFAULT ''`);
  }
  if (!leadCols.includes('google_business')) {
    db.exec(`ALTER TABLE leads ADD COLUMN google_business TEXT DEFAULT ''`);
  }
  if (!leadCols.includes('social_media')) {
    db.exec(`ALTER TABLE leads ADD COLUMN social_media TEXT DEFAULT ''`);
  }

  const instCols = db.prepare(`PRAGMA table_info(contract_installments)`).all().map(c => c.name);
  if (!instCols.includes('nfse_id')) {
    db.exec(`ALTER TABLE contract_installments ADD COLUMN nfse_id INTEGER`);
  }
  if (!instCols.includes('nfse_status')) {
    db.exec(`ALTER TABLE contract_installments ADD COLUMN nfse_status TEXT DEFAULT 'Nao_Emitida'`);
  }
  if (!instCols.includes('nfse_number')) {
    db.exec(`ALTER TABLE contract_installments ADD COLUMN nfse_number TEXT`);
  }
  if (!instCols.includes('nfse_url')) {
    db.exec(`ALTER TABLE contract_installments ADD COLUMN nfse_url TEXT`);
  }

  const postCols = db.prepare(`PRAGMA table_info(blog_posts)`).all().map(c => c.name);
  if (!postCols.includes('likes_count')) {
    db.exec(`ALTER TABLE blog_posts ADD COLUMN likes_count INTEGER DEFAULT 0`);
  }
  if (!postCols.includes('shares_count')) {
    db.exec(`ALTER TABLE blog_posts ADD COLUMN shares_count INTEGER DEFAULT 0`);
  }
} catch (e) {
  console.warn('Verificação de migração de colunas sociais/sites/nfse/blog:', e);
}

// Inicialização / Seeder de Artigos do Blog Jurídico para SEO em Juiz de Fora e Região
try {
  const postCount = db.prepare(`SELECT COUNT(*) as count FROM blog_posts`).get().count;
  if (postCount === 0) {
    const now = new Date().toISOString();
    const seedArticles = [
      {
        slug: 'como-funciona-defesa-cnh-juiz-de-fora',
        title: 'Como Funciona o Processo de Defesa contra Suspensão e Cassação de CNH em Juiz de Fora e MG',
        summary: 'Entenda os prazos legais, instâncias recursais (JARI e CETRAN/MG) e como garantir o efeito suspensivo para continuar dirigindo enquanto seu recurso é julgado.',
        category: 'Direito de Trânsito & CNH',
        cover_image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80',
        tags: 'CNH, Suspensão de CNH, Recurso de Multa, Trânsito, Juiz de Fora, CETRAN, DETRAN-MG, Bafômetro',
        content: `
<h2>Entendendo a Notificação de Suspensão do Direito de Dirigir</h2>
<p>Receber uma notificação de instauração de processo administrativo para suspensão da Carteira Nacional de Habilitação (CNH) gera muitas dúvidas e apreensão para condutores e motoristas profissionais em Juiz de Fora e em todo o estado de Minas Gerais. O primeiro ponto fundamental a saber é que <strong>a suspensão nunca é automática</strong>: todo condutor tem direito constitucional à ampla defesa e ao contraditório.</p>

<h3>Quais são as principais causas de Suspensão de CNH?</h3>
<ul>
  <li><strong>Por pontos acumulados no período de 12 meses:</strong> 20 pontos (se houver 2 ou mais infrações gravíssimas), 30 pontos (se houver 1 infração gravíssima) ou 40 pontos (se não houver nenhuma infração gravíssima ou para motoristas com EAR na CNH);</li>
  <li><strong>Por infrações autossuspensivas (mandatórias):</strong> Como a recusa ao teste do etilômetro (bafômetro - Art. 165-A do CTB), dirigir sob influência de álcool, transitar em velocidade superior a 50% da máxima permitida, pilotar motocicleta sem capacete, entre outras.</li>
</ul>

<h3>As 3 Fases de Defesa e Recurso Administrativo</h3>
<ol>
  <li><strong>Defesa Prévia:</strong> Apresentada logo após a primeira notificação perante o órgão autuador ou DETRAN-MG, focando em vícios formais do auto de infração, erros de preenchimento, aferição metrológica de radares e tempestividade;</li>
  <li><strong>Recurso à JARI (Junta Administrativa de Recursos de Infrações):</strong> Caso a defesa prévia não seja acolhida, interpõe-se recurso de 1ª instância administrativa onde se discute o mérito legal e a legalidade da penalidade;</li>
  <li><strong>Recurso ao CETRAN/MG (Conselho Estadual de Trânsito de Minas Gerais):</strong> 2ª e última instância administrativa estadual, avaliando decisões colegiadas e precedentes normativos.</li>
</ol>

<blockquote>
  <p><strong>Dica Jurídica Importante:</strong> Enquanto o processo administrativo de suspensão estiver em fase de recurso, o motorista tem garantido o <em>efeito suspensivo</em> e pode continuar dirigindo legalmente sem bloqueio no prontuário até o julgamento final definitivo.</p>
</blockquote>

<h3>Quando recorrer à via Judicial?</h3>
<p>Se as instâncias administrativas mantiverem arbitrariedades ou irregularidades formais no processo (como falta de notificação válida por edital, decadência de prazos ou cerceamento de defesa), é perfeitamente cabível ajuizar uma <strong>Ação Anulatória de Ato Administrativo com Pedido de Liminar</strong> perante a Vara da Fazenda Pública da Comarca de Juiz de Fora, garantindo o restabelecimento imediato do direito de dirigir.</p>
        `
      },
      {
        slug: 'direitos-consumidor-voos-transportes-indenizacao',
        title: 'Direitos do Consumidor em Transportes: Indenizações por Voo Cancelado, Atrasos e Bagagem Extraviada',
        summary: 'Conheça seus direitos conforme o Código de Defesa do Consumidor e a Resolução 400 da ANAC para voos no Aeroporto da Zona da Mata (IZA), Rio e conexões.',
        category: 'Direito do Consumidor',
        cover_image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
        tags: 'Direito do Consumidor, Voo Cancelado, Extravio de Bagagem, Companhia Aérea, Indenização, Dano Moral, Zona da Mata',
        content: `
<h2>Problemas em Viagens Aéreas e Terrestres: O que a Lei Garante?</h2>
<p>O atraso excessivo ou cancelamento inesperado de voos, perda de conexões internacionais e o extravio temporário ou definitivo de bagagens são problemas frequentes enfrentados por passageiros na região de Juiz de Fora, especialmente em voos com conexão no Aeroporto Regional da Zona da Mata (IZA), Galeão e Santos Dumont. O Código de Defesa do Consumidor (CDC) e as normas da ANAC protegem o passageiro e preveem reparações financeiras significativas.</p>

<h3>Direito à Assistência Material Obrigatória da Companhia Aérea:</h3>
<ul>
  <li><strong>A partir de 1 hora de atraso:</strong> Acesso gratuito a meios de comunicação (internet, ligações telefônicas);</li>
  <li><strong>A partir de 2 horas de atraso:</strong> Fornecimento de alimentação adequada (voucher para refeição, lanche e bebidas);</li>
  <li><strong>A partir de 4 horas de atraso ou cancelamento:</strong> Acomodação em hotel, traslado de ida e volta, ou reacomodação imediata no primeiro voo disponível (inclusive de outra companhia aérea) ou reembolso integral imediato da passagem.</li>
</ul>

<h3>Quando cabe Indenização por Danos Morais e Materiais?</h3>
<p>Quando o atraso ultrapassa 4 horas ou decorre em perda de compromissos profissionais relevantes, casamentos, viagens de férias planejadas, noites de sono perdidas no saguão do aeroporto ou quando a bagagem é extraviada contendo pertences de uso pessoal, a jurisprudência dos Tribunais de Justiça de Minas Gerais (TJMG) e do Rio de Janeiro reconhece o direito à <strong>indenização por danos morais</strong> (geralmente fixada entre R$ 5.000,00 e R$ 15.000,00 por passageiro), além do ressarcimento de todos os gastos comprovados (danos materiais).</p>

<blockquote>
  <p><strong>Documentos Essenciais para Guardar:</strong> Cartão de embarque, fotos do painel do aeroporto indicando o atraso/cancelamento, declaração de contingência fornecida pela companhia aérea, protocolos de atendimento, RIB (Relatório de Irregularidade de Bagagem) e notas fiscais de gastos adicionais com transporte e hospedagem.</p>
</blockquote>
        `
      },
      {
        slug: 'juros-abusivos-financiamento-revisao-contrato',
        title: 'Ação Revisional de Financiamento de Veículos e Empréstimos: Como Identificar Juros Abusivos',
        summary: 'Descubra como saber se o banco cobrou juros acima da taxa média de mercado do Banco Central e como recalcular as parcelas para restituir valores indevidos.',
        category: 'Direito Civil & Bancário',
        cover_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80',
        tags: 'Revisão de Contrato, Juros Abusivos, Financiamento de Veículo, Empréstimo, Banco Central, CDC, Juiz de Fora',
        content: `
<h2>O que é a Ação Revisional de Contrato Bancário?</h2>
<p>Muitos consumidores em Juiz de Fora contratam financiamentos para aquisição de veículos, crédito pessoal ou empréstimos consignados sem perceber que as taxas de juros remuneratórios e encargos embutidos nas parcelas superam drasticamente os limites legais e a taxa média apurada pelo Banco Central do Brasil (BACEN) para o mesmo período e modalidade de operação.</p>

<h3>Principais Abusividades Encontradas em Contratos Bancários:</h3>
<ul>
  <li><strong>Juros Remuneratórios Acima da Taxa Média do BACEN:</strong> Cobrança de taxas exorbitantes que desequilibram a relação contratual;</li>
  <li><strong>Venda Casada de Seguros (Seguro Prestamista):</strong> Inclusão compulsória de seguros sem que o consumidor tenha tido a opção de contratar ou escolher a seguradora (prática vedada pelo Art. 39, I do CDC);</li>
  <li><strong>Tarifas Ilegítimas:</strong> Cobrança indevida de Taxa de Emissão de Carnê (TEC), Taxa de Abertura de Crédito (TAC), Tarifa de Avaliação do Bem e Serviços de Terceiros sem comprovação de prestação efetiva;</li>
  <li><strong>Capitalização Diária de Juros sem Previsão Contratual Expressa.</strong></li>
</ul>

<h3>Como é feito o Recálculo e o que se pode Recuperar?</h3>
<p>Por meio de uma perícia contábil preliminar, confronta-se o contrato assinado com as tabelas históricas do Banco Central. Havendo abusividade, ajuíza-se a Ação Revisional requerendo a redução do valor da parcela mensal e a <strong>repetição de indébito (devolução dos valores pagos a mais em dobro ou abatimento do saldo devedor)</strong>, trazendo grande alívio financeiro para o contratante.</p>
        `
      },
      {
        slug: 'inventario-extrajudicial-cartorio-juiz-de-fora',
        title: 'Inventário em Cartório em Juiz de Fora: Passo a Passo, Custas, ITCD e Documentos Necessários',
        summary: 'Guia completo sobre como fazer inventário extrajudicial com rapidez e economia de custas quando todos os herdeiros são maiores e concordam com a partilha.',
        category: 'Direito de Família & Sucessões',
        cover_image: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=1200&q=80',
        tags: 'Inventário, Cartório, Extrajudicial, Sucessões, ITCD, Herança, Juiz de Fora, Partilha de Bens, Família',
        content: `
<h2>O que é o Inventário Extrajudicial e por que ele é mais Rápido?</h2>
<p>Instituído pela Lei nº 11.441/2007 e aprimorado pelas normas do CNJ, o <strong>Inventário Extrajudicial</strong> é realizado diretamente em qualquer Cartório de Notas (Tabelionato de Notas) por meio de Escritura Pública, sem necessidade de tramitação judicial morosa perante as Varas de Família e Sucessões. Enquanto um inventário judicial litigioso pode durar anos, o inventário em cartório costuma ser concluído em poucos dias ou semanas.</p>

<h3>Requisitos Obrigatórios para o Inventário em Cartório:</h3>
<ul>
  <li>Todos os herdeiros devem ser <strong>maiores de 18 anos e plenamente capazes</strong>;</li>
  <li>Deve haver <strong>consenso e acordo unânime</strong> entre todos os herdeiros sobre a divisão e partilha dos bens;</li>
  <li>Inexistência de testamento válido deixado pelo falecido (ou autorização judicial prévia para lavratura em cartório);</li>
  <li>Participação obrigatória de um <strong>advogado devidamente inscrito na OAB</strong>, que pode representar todos os herdeiros conjuntamente ou individualmente.</li>
</ul>

<h3>Etapas do Inventário Extrajudicial:</h3>
<ol>
  <li><strong>Levantamento Patrimonial e Documental:</strong> Certidões de óbito, certidões negativas de débitos federais, estaduais e municipais, e matrículas atualizadas dos imóveis nos Cartórios de Registro de Imóveis de Juiz de Fora;</li>
  <li><strong>Declaração do ITCD perante a SEF/MG:</strong> Elaboração da Declaração de Bens e Direitos (DDBD) junto à Secretaria de Estado de Fazenda de Minas Gerais para cálculo e recolhimento do imposto de transmissão (ITCD);</li>
  <li><strong>Minuta da Escritura Pública de Inventário e Partilha:</strong> Redigida pelo advogado e enviada ao Tabelião de Notas;</li>
  <li><strong>Assinatura da Escritura e Registro:</strong> Lavratura da escritura pública e posterior apresentação nos cartórios de imóveis e bancos para transferência dos bens e liberação de saldos e contas.</li>
</ol>
        `
      }
    ];

    for (const art of seedArticles) {
      db.prepare(`
        INSERT INTO blog_posts (
          slug, title, summary, category, content, cover_image, tags,
          author_name, author_oab, views_count, is_published, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
      `).run(
        art.slug,
        art.title,
        art.summary,
        art.category,
        art.content.trim(),
        art.cover_image,
        art.tags,
        'Dr. Jorge Eduardo da Silva Alvim',
        'OAB/MG 222.943',
        now,
        now,
        now
      );
    }
    console.log('📰 [BLOG] 4 artigos informativos jurídicos iniciais semeados com sucesso para SEO!');
  }
} catch (e) {
  console.warn('Erro ao inicializar artigos do blog:', e);
}

// Inicialização / Seeder de Compromissos e Prazos da Agenda Jurídica
try {
  const eventCount = db.prepare(`SELECT COUNT(*) as count FROM calendar_events`).get().count;
  if (eventCount === 0) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = now.getDate();
    
    // Data para hoje, amanhã e próximos dias
    const todayStr = `${y}-${m}-${pad(d)}T14:00`;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 2);
    const tomStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T10:00`;
    
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 5);
    const nextWeekStr = `${nextWeek.getFullYear()}-${pad(nextWeek.getMonth() + 1)}-${pad(nextWeek.getDate())}T18:00`;

    const seedEvents = [
      {
        id: 'EVT-' + Date.now() + '-1',
        title: 'Audiência de Instrução e Julgamento - TJMG',
        description: 'Audiência de instrução com oitiva de testemunhas na 2ª Vara Cível de Juiz de Fora. Levar documentos originais e carteira da OAB.',
        event_type: 'audiencia',
        start_datetime: todayStr,
        end_datetime: `${y}-${m}-${pad(d)}T15:30`,
        all_day: 0,
        location: 'Fórum Benjamin Colucci - 2ª Vara Cível (Sala 204)',
        meeting_url: 'https://tjmg.jus.br/audiencias-virtuais',
        lawyer_id: 'dr-jorge-alvim',
        lawyer_name: 'Dr. Jorge Alvim',
        client_name: 'Carlos Eduardo Oliveira',
        lawsuit_number: '5001428-92.2026.8.13.0145',
        priority: 'alta',
        status: 'agendado',
        color: '#dc2626',
        ical_uid: 'evt-instrucao-tjmg@jorgealvimadvocacia.com.br'
      },
      {
        id: 'EVT-' + Date.now() + '-2',
        title: 'Prazo Fatal: Apelação Cível em Ação Revisional',
        description: 'Interposição de recurso de apelação cível perante a 1ª Câmara Cível do TJMG. Verificar comprovação de custas recursais.',
        event_type: 'prazo_fatal',
        start_datetime: tomStr,
        end_datetime: tomStr,
        all_day: 1,
        location: 'PJe TJMG - 1ª Instância',
        meeting_url: '',
        lawyer_id: 'dr-jorge-alvim',
        lawyer_name: 'Dr. Jorge Alvim',
        client_name: 'Mariana Ferreira Silva',
        lawsuit_number: '0024190-77.2026.8.13.0145',
        priority: 'fatal',
        status: 'agendado',
        color: '#ea580c',
        ical_uid: 'evt-prazo-apelacao@jorgealvimadvocacia.com.br'
      },
      {
        id: 'EVT-' + Date.now() + '-3',
        title: 'Atendimento Inicial / Consulta: Direito Militar',
        description: 'Consulta presencial no escritório com militar da reserva para análise de incorporação de gratificação de habilitação.',
        event_type: 'consulta',
        start_datetime: nextWeekStr,
        end_datetime: `${nextWeek.getFullYear()}-${pad(nextWeek.getMonth() + 1)}-${pad(nextWeek.getDate())}T19:00`,
        all_day: 0,
        location: 'Escritório Benfica - Sala Principal',
        meeting_url: '',
        lawyer_id: 'dr-jorge-alvim',
        lawyer_name: 'Dr. Jorge Alvim',
        client_name: 'Sgt. Roberto Mendes',
        lawsuit_number: '',
        priority: 'normal',
        status: 'agendado',
        color: '#2563eb',
        ical_uid: 'evt-consulta-militar@jorgealvimadvocacia.com.br'
      }
    ];

    const insertEvtStmt = db.prepare(`
      INSERT INTO calendar_events (
        id, title, description, event_type, start_datetime, end_datetime,
        all_day, location, meeting_url, lawyer_id, lawyer_name,
        client_id, client_name, lawsuit_id, lawsuit_number,
        priority, status, color, ical_uid, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const evt of seedEvents) {
      insertEvtStmt.run(
        evt.id, evt.title, evt.description, evt.event_type, evt.start_datetime, evt.end_datetime,
        evt.all_day, evt.location, evt.meeting_url, evt.lawyer_id, evt.lawyer_name,
        null, evt.client_name, null, evt.lawsuit_number,
        evt.priority, evt.status, evt.color, evt.ical_uid, '', now.toISOString(), now.toISOString()
      );
    }
    console.log('📅 [AGENDA] 3 compromissos e audiências de demonstração semeados com sucesso!');
  }
} catch (e) {
  console.warn('Erro ao inicializar eventos do calendário:', e);
}

// Migração segura para colunas de login e segurança na tabela clients
try {
  const cliCols = db.prepare(`PRAGMA table_info(clients)`).all().map(c => c.name);
  if (!cliCols.includes('password_hash')) {
    db.exec(`ALTER TABLE clients ADD COLUMN password_hash TEXT`);
  }
  if (!cliCols.includes('salt')) {
    db.exec(`ALTER TABLE clients ADD COLUMN salt TEXT`);
  }
  if (!cliCols.includes('email_notifications')) {
    db.exec(`ALTER TABLE clients ADD COLUMN email_notifications INTEGER DEFAULT 1`);
  }
  if (!cliCols.includes('reset_token')) {
    db.exec(`ALTER TABLE clients ADD COLUMN reset_token TEXT`);
  }
  if (!cliCols.includes('reset_token_expires')) {
    db.exec(`ALTER TABLE clients ADD COLUMN reset_token_expires TEXT`);
  }
} catch (e) {
  console.warn('Verificação de migração de login em clients:', e);
}

// hashPassword/verifyPassword/isStrongHash movidos para src/shared/password-crypto.js

// Inicialização / Garantia do Usuário Mestre Padrão
try {
  const { hash, salt } = hashPassword('jorgealvim');
  const masterCheck = db.prepare(`SELECT id FROM users WHERE username = ? OR id = ?`).get('jorgealvimtecnologia', 'USR-MASTER-01');
  if (!masterCheck) {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'USR-MASTER-01',
      'jorgealvimtecnologia',
      hash,
      salt,
      'Dr. Jorge Alvim (Mestre)',
      'master',
      new Date().toISOString()
    );
    console.log('👑 [AUTH] Usuário Mestre "jorgealvimtecnologia" criado com sucesso.');
  } else {
    // Sincroniza papel de mestre e credenciais padrão solicitadas pelo Dr. Jorge Alvim
    db.prepare(`
      UPDATE users SET role = 'master', password_hash = ?, salt = ?
      WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'
    `).run(hash, salt);
    console.log('👑 [AUTH] Credenciais e Papel do Usuário Mestre "jorgealvimtecnologia" sincronizados.');
  }

  // SEGURANÇA: senhas nunca são guardadas em texto puro. Limpa qualquer valor
  // legado remanescente na coluna plain_password (users e access_permissions).
  try { db.exec(`UPDATE users SET plain_password = NULL WHERE plain_password IS NOT NULL;`); } catch (e) {}
  try { db.exec(`UPDATE access_permissions SET plain_password = NULL WHERE plain_password IS NOT NULL;`); } catch (e) {}
} catch (err) {
  console.error('Erro ao verificar usuário mestre:', err);
}

// Gerador de ID para Leads do Formulário do Site: JA-2026-0001
// generateNextClientId foi movido para src/shared/ids.js (util compartilhado).

// generateNextClientFullId movido para src/shared/ids.js

// generateNextOfficeId/MemberId movidos para src/modules/offices/offices.routes.js

// notificação WhatsApp movida para src/shared/notify.js

// generateNextDriveDocId movido para src/modules/drive/drive.routes.js

// Gerador de ID para Processos Judiciais: PROC-2026-0001
// generateNextLawsuitId foi movido para src/shared/ids.js (util compartilhado).

// Helpers financeiros (IDs, Asaas) -> src/modules/financial/financial.routes.js

// Configuração do Multer para armazenamento de ficheiros
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetId = req.clientId || req.params.id || 'temp';
    const clientFolder = path.join(STORAGE_DIR, targetId);
    if (!fs.existsSync(clientFolder)) {
      fs.mkdirSync(clientFolder, { recursive: true });
    }
    cb(null, clientFolder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'doc';
    const timestamp = Date.now();
    const randHex = crypto.randomBytes(3).toString('hex');
    cb(null, `${timestamp}_${randHex}_${baseName}${ext}`);
  }
});

// Bloqueia tipos executáveis/scripts que poderiam ser servidos e executados no navegador.
const BLOCKED_UPLOAD_EXT = /\.(html?|xhtml|svg|js|mjs|php[0-9]?|phtml|phar|exe|bat|cmd|sh|com|scr|jar|msi|dll|htaccess)$/i;
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB por arquivo (suporta fotos de alta resolução de smartphones)
  fileFilter(req, file, cb) {
    if (BLOCKED_UPLOAD_EXT.test(file.originalname || '')) {
      return cb(new Error('Tipo de arquivo não permitido por segurança.'));
    }
    cb(null, true);
  },
});

// Configuração de Proxy Reverso e Confiança
app.set('trust proxy', 1);

// Middlewares de Segurança HTTP (HTTPS / Headers)
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Geolocalização liberada para a PRÓPRIA origem (o site usa no modal de boas-vindas);
  // câmera e microfone seguem bloqueados.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  // Content-Security-Policy: permite exatamente os recursos externos usados hoje
  // (Tailwind CDN, Google Fonts, jsDelivr, Facebook, Unsplash, QR, APIs .gov/CEP…)
  // e bloqueia o restante. 'unsafe-inline'/'unsafe-eval' são necessários enquanto o
  // Tailwind roda via CDN e há scripts inline nas páginas.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https: https://lh3.googleusercontent.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com https://accounts.google.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://connect.facebook.net https://accounts.google.com",
    "connect-src 'self' https: https://accounts.google.com https://oauth2.googleapis.com",
    "frame-src 'self' https: https://accounts.google.com"
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

app.use(cors({
  origin(origin, callback) {
    // Requisições sem origin (apps nativos, curl, mesma origem) são permitidas
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0) return callback(null, true); // fallback dev
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pela política de CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '25mb' })); // lotes de intimações (ingest) podem ser grandes
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check (monitoramento externo / uptime)
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), uptime_s: Math.round(process.uptime()) }));

// -------- RBAC no backend: gate por perfil (defesa em profundidade) ----------
// O MESTRE sempre passa (produção só tem o mestre → sem impacto). Perfis restritos
// com matriz de acesso são barrados nas rotas dos módulos que não têm afinidade.
const PATH_PERMS = [
  [/^\/api\/clients/, 'tab_clients'], [/^\/api\/leads/, 'tab_leads'],
  [/^\/api\/lawsuits/, 'tab_lawsuits'], [/^\/api\/court/, 'tab_publications'],
  [/^\/api\/calendar/, 'tab_calendar'], [/^\/api\/financial/, 'tab_financial'],
  [/^\/api\/nfse/, 'tab_financial'], [/^\/api\/esign/, 'tab_financial'],
  [/^\/api\/hr\/employee\/login/, null], [/^\/api\/hr/, 'tab_hr'],
  [/^\/api\/drive/, 'tab_drive'], [/^\/api\/offices/, 'tab_offices'],
  [/^\/api\/users/, 'tab_users'], [/^\/api\/judicial/, 'tab_radar'],
  [/^\/api\/lgpd/, 'tab_settings'], [/^\/api\/admin-requests/, 'tab_lawsuits'],
  [/^\/api\/explorer/, 'tab_settings']
];
app.use((req, res, next) => {
  try {
    if (!req.path.startsWith('/api/')) return next();
    if (/^\/api\/(auth|access-control|client-portal|visits|blog|dashboard|notifications|kanban)/.test(req.path)) return next();
    const rule = PATH_PERMS.find(p => p[0].test(req.path));
    if (!rule || rule[1] === null) return next();
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token || req.headers['x-access-token']);
    const s = validateToken(token);
    if (!s) return next(); // sem sessão: o requireAuth da rota devolve 401
    const isMaster = s.userId === 'USR-MASTER-01' || s.username === 'jorgealvimtecnologia' || s.role === 'master' || (s.name || '').toLowerCase().includes('jorge alvim');
    if (isMaster) return next();
    let perm = null; try { perm = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(s.userId); } catch (e) {}
    if (!perm) return next(); // sem matriz: mantém comportamento permissivo (não quebra)
    if (perm[rule[1]]) return next();
    return res.status(403).json({ error: 'Acesso negado: seu perfil não tem permissão para este módulo.' });
  } catch (e) { return next(); }
});

// Rota para Download/Acesso Seguro aos Ficheiros dos Clientes e Drive do Escritório
app.use('/storage/clients', express.static(STORAGE_DIR));
app.use('/storage/office_drive', express.static(STORAGE_DRIVE_DIR));
app.use('/storage/marketing', express.static(path.join(__dirname, 'storage', 'marketing')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: '7d' }));

// Roteadores Modulares
app.use(rocketsRouter);
app.use(notificationsRouter);
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
  return res.sendFile(path.join(__dirname, fileName));
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
  const pixel = (process.env.META_PIXEL_ID || '').trim();
  const ga = (process.env.GA_MEASUREMENT_ID || '').trim();
  const fbVerify = (process.env.META_BUSINESS_VERIFICATION || '').trim();
  const gscVerify = (process.env.GSC_VERIFICATION || '').trim();
  const envSig = [pixel, ga, fbVerify, gscVerify].join('|');

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

  // Google Analytics 4 (injetado só quando GA_MEASUREMENT_ID for definido)
  if (ga) {
    const gaSnippet = `  <!-- Google Analytics 4 -->\n` +
      `  <script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>\n` +
      `  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');</script>\n</head>`;
    html = html.replace('</head>', gaSnippet);
  }

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
  sendFreshFile(res, 'blog.html');
});

app.get('/blog/:slug', (req, res) => {
  sendFreshFile(res, 'blog.html');
});

app.get('/artigos', (req, res) => {
  res.redirect('/blog');
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
  if (empCount === 0) {
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
    console.error('[ERRO NÃO TRATADO]', err);
    return res.status(500).json({ error: err.message || 'Erro interno no servidor.' });
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
  });

  // Manter o loop de eventos ativo continuamente
  setInterval(() => {}, 1000 * 60 * 60);
}

// Exportado para os testes automatizados (Supertest importa o app sem subir a porta).
export { app, db, server };
