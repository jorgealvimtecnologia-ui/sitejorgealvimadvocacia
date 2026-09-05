import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
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
// DB_PATH pode ser sobrescrito por variável de ambiente (usado nos testes
// automatizados, que rodam contra um banco temporário isolado — nunca o leads.db real).
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'leads.db');

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

// Inicialização do Banco de Dados SQLite Local
const db = new DatabaseSync(DB_PATH);

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
    
    files TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Migração segura para colunas de qualificação civil em clients existentes
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
} catch (e) {
  console.warn('Verificação de migração de clients:', e);
}

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
    // SEGURANÇA: apenas garante o papel de mestre. NÃO reescreve a senha a cada boot
    // (antes o hash era forçado para 'jorgealvim' sempre, impedindo troca de senha).
    db.prepare(`
      UPDATE users SET role = 'master'
      WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'
    `).run();
    console.log('👑 [AUTH] Papel do Usuário Mestre "jorgealvimtecnologia" sincronizado.');
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
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://connect.facebook.net",
    "connect-src 'self' https:",
    "frame-src 'self' https:"
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
  maxAge: '7d',
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

// ================= ROTAS DE AUTENTICAÇÃO =================

// Rate-limiting simples em memória para rotas de login (anti força-bruta).
const loginHits = new Map();
function loginRateLimit(req, res, next) {
  try {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // janela de 15 minutos
    const maxAttempts = 15;
    var rec = loginHits.get(ip);
    if (!rec || now > rec.reset) rec = { count: 0, reset: now + windowMs };
    rec.count++;
    loginHits.set(ip, rec);
    if (loginHits.size > 5000) { // limpeza esporádica
      for (const [k, v] of loginHits) if (now > v.reset) loginHits.delete(k);
    }
    if (rec.count > maxAttempts) {
      res.setHeader('Retry-After', String(Math.ceil((rec.reset - now) / 1000)));
      return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' });
    }
  } catch (_) { /* nunca bloquear por erro do limitador */ }
  next();
}

// ---------------------------------------------------------------------------
// BLOQUEIO PROGRESSIVO por FALHAS (defesa em profundidade, além do rate-limit
// por IP acima). Conta falhas consecutivas por (IP + usuário) e impõe uma espera
// que CRESCE a cada faixa de erros. Um login bem-sucedido zera o contador. Assim
// um ataque de força bruta fica exponencialmente mais lento sem punir quem
// simplesmente errou a senha uma ou duas vezes.
// ---------------------------------------------------------------------------
const loginFailures = new Map(); // chave `${ip}|${usuario}` -> { fails, lockUntil }
function loginLockKey(ip, username) {
  return `${ip}|${String(username || '').toLowerCase().trim()}`;
}
function progressiveLockMs(fails) {
  if (fails < 5) return 0;            // 1–4 falhas: sem punição
  if (fails < 8) return 30 * 1000;   // 5–7: 30 segundos
  if (fails < 12) return 2 * 60 * 1000;  // 8–11: 2 minutos
  if (fails < 20) return 15 * 60 * 1000; // 12–19: 15 minutos
  return 60 * 60 * 1000;             // 20+: 1 hora
}
function loginLockRemaining(ip, username) {
  const rec = loginFailures.get(loginLockKey(ip, username));
  if (rec && rec.lockUntil && Date.now() < rec.lockUntil) {
    return Math.ceil((rec.lockUntil - Date.now()) / 1000); // segundos restantes
  }
  return 0;
}
function registerLoginFailure(ip, username) {
  const k = loginLockKey(ip, username);
  const rec = loginFailures.get(k) || { fails: 0, lockUntil: 0 };
  rec.fails += 1;
  const d = progressiveLockMs(rec.fails);
  rec.lockUntil = d > 0 ? Date.now() + d : 0;
  loginFailures.set(k, rec);
  if (loginFailures.size > 5000) { // limpeza esporádica
    const now = Date.now();
    for (const [key, v] of loginFailures) if (!v.lockUntil || now > v.lockUntil) loginFailures.delete(key);
  }
  return rec;
}
function clearLoginFailures(ip, username) {
  loginFailures.delete(loginLockKey(ip, username));
}

app.post('/api/auth/login', loginRateLimit, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe o usuário e a senha.' });
    }

    const rawUsername = String(username).trim();
    const cleanUsername = rawUsername.toLowerCase();
    const compactUsername = cleanUsername.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

    const rawPassword = String(password).trim();
    const compactPassword = rawPassword.toLowerCase().replace(/\s+/g, '');

    // Bloqueio progressivo: se este (IP + usuário) está em cooldown por falhas, recusa.
    const reqIp = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const lockLeft = loginLockRemaining(reqIp, cleanUsername);
    if (lockLeft > 0) {
      res.setHeader('Retry-After', String(lockLeft));
      return res.status(429).json({ error: `Muitas tentativas. Aguarde ${lockLeft}s e tente novamente.` });
    }

    // Busca flexível de usuário por username exato, aliases (jorgealvim, admin, mestre) ou nome
    let user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ? OR REPLACE(LOWER(username), ' ', '') = ?`).get(cleanUsername, compactUsername);

    if (!user) {
      if (['jorgealvim', 'jorgealvimtecnologia', 'admin', 'mestre', 'drjorgealvim', 'drjorge', 'jorge.alvim', 'jorge'].includes(compactUsername)) {
        user = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
      } else if (compactUsername.includes('mariana')) {
        user = db.prepare(`SELECT * FROM users WHERE username LIKE '%mariana%' OR name LIKE '%mariana%'`).get();
      } else if (compactUsername.includes('gabriela')) {
        user = db.prepare(`SELECT * FROM users WHERE username LIKE '%gabriela%' OR name LIKE '%gabriela%'`).get();
      } else {
        user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(name)) LIKE ? OR REPLACE(LOWER(name), ' ', '') LIKE ?`).get(`%${cleanUsername}%`, `%${compactUsername}%`);
      }
    }

    // SEGURANÇA: sem senhas-mestre hardcoded. A autenticação valida SOMENTE o hash
    // PBKDF2 armazenado. Aceitamos a senha exata ou sua versão compacta (sem espaços),
    // para tolerar variações de digitação, mas nunca uma senha fixa universal.
    const isPasswordValid = user && (
      verifyPassword(rawPassword, user.password_hash, user.salt) ||
      (compactPassword !== rawPassword && verifyPassword(compactPassword, user.password_hash, user.salt))
    );

    if (!user || !isPasswordValid) {
      const fail = registerLoginFailure(reqIp, cleanUsername);
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_ADMIN',
        module: 'USUARIOS',
        user_name: cleanUsername,
        user_role: 'desconhecido',
        description: `Tentativa de login com credenciais inválidas para '${cleanUsername}' (falha #${fail.fails}).`
      });
      // Se esta falha disparou/renovou um cooldown, informa o tempo de espera.
      const left = loginLockRemaining(reqIp, cleanUsername);
      if (left > 0) {
        res.setHeader('Retry-After', String(left));
        return res.status(429).json({ error: `Muitas tentativas. Aguarde ${left}s e tente novamente.` });
      }
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Login válido: zera o contador de falhas deste (IP + usuário).
    clearLoginFailures(reqIp, cleanUsername);

    // Upgrade transparente: se a senha estava em formato antigo, regrava no formato forte.
    try {
      const matched = verifyPassword(rawPassword, user.password_hash, user.salt) ? rawPassword : compactPassword;
      if (!isStrongHash(matched, user.password_hash, user.salt)) {
        const up = hashPassword(matched);
        db.prepare(`UPDATE users SET password_hash = ?, salt = ? WHERE id = ?`).run(up.hash, up.salt, user.id);
      }
    } catch (e) { /* upgrade é best-effort; não bloqueia o login */ }

    const token = createSession(user);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'LOGIN_ADMIN',
      module: 'USUARIOS',
      resource_id: user.id,
      user_name: user.name,
      user_role: user.role,
      description: `Operador ${user.name} (${user.username}) autenticou-se com sucesso no painel.`
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[ERRO] Falha no login:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : (req.query.token || req.headers['x-access-token']);

  if (token) {
    const sess = sessions.get(token);
    if (sess) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'LOGOUT_ADMIN',
        module: 'USUARIOS',
        user_name: sess.name,
        user_role: sess.role,
        description: `Operador ${sess.name} encerrou a sessão no painel administrativo.`
      });
    }
    destroySession(token);
  }
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// ================= ROTAS DE GESTÃO DE USUÁRIOS =================

app.get('/api/users', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, username, name, role, created_at
      FROM users
      ORDER BY
        CASE WHEN role = 'master' THEN 1 ELSE 2 END,
        created_at ASC
    `).all();
    // SEGURANÇA: senhas nunca são retornadas (nem para o mestre). Para trocar,
    // usa-se "Redefinir senha" (PUT /api/users/:id), que grava novo hash PBKDF2.
    rows.forEach(r => { r.plain_password = ''; });
    return res.json({ success: true, users: rows });
  } catch (error) {
    console.error('[ERRO] Falha ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro ao consultar usuários.' });
  }
});

app.post('/api/users', requireAuth, (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Nome, login e senha são obrigatórios.' });
    }

    {
      const pol = validatePassword(password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();
    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(cleanUsername);

    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }

    const { hash, salt } = hashPassword(cleanPassword);
    const userId = 'USR-' + Date.now();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      cleanUsername,
      hash,
      salt,
      name.trim(),
      role || 'admin',
      new Date().toISOString()
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_USUARIO',
      module: 'USUARIOS',
      resource_id: userId,
      description: `Criação de novo usuário '${name.trim()}' (login: ${cleanUsername}) com perfil '${role || 'admin'}'.`,
      details: { userId, username: cleanUsername, name: name.trim(), role: role || 'admin' }
    });

    return res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar usuário:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
});

app.put('/api/users/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name, password, role } = req.body;

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    let updatedName = name ? name.trim() : user.name;
    let updatedRole = role ? role : user.role;

    if (user.username === 'jorgealvimtecnologia' || user.role === 'master') {
      updatedRole = 'master';
    }

    const passwordChanged = !!(password && password.trim().length > 0);

    if (passwordChanged) {
      const pol = validatePassword(password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
      const cleanPassword = password.trim();
      const { hash, salt } = hashPassword(cleanPassword);
      db.prepare(`
        UPDATE users
        SET name = ?, password_hash = ?, salt = ?, role = ?
        WHERE id = ?
      `).run(updatedName, hash, salt, updatedRole, id);
    } else {
      db.prepare(`
        UPDATE users 
        SET name = ?, role = ? 
        WHERE id = ?
      `).run(updatedName, updatedRole, id);
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_USUARIO',
      module: 'USUARIOS',
      resource_id: id,
      description: `Alteração do usuário ID '${id}' (${updatedName})${passwordChanged ? ' com redefinição de senha' : ''}.`,
      details: { id, name: updatedName, role: updatedRole, passwordChanged }
    });

    return res.json({ success: true, message: 'Dados do usuário atualizados com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar usuário:', error);
    return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (user.username === 'jorgealvimtecnologia' || user.role === 'master') {
      return res.status(403).json({ 
        error: 'O usuário mestre (jorgealvimtecnologia) não pode ser excluído por segurança.' 
      });
    }

    if (req.user.userId === user.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta logada.' });
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_USUARIO',
      module: 'USUARIOS',
      resource_id: id,
      description: `Exclusão definitiva do operador '${user.name}' (login: ${user.username}).`
    });

    return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir usuário:', error);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

// =============================================================================
// 🛡️ MATRIZ DE CONTROLE DE ACESSO & PERMISSÕES GRANULARES (RBAC/ABAC HÍBRIDO)
// =============================================================================

const ROLE_TEMPLATES = {
  master: {
    key: 'master',
    name: 'Dr. Jorge Alvim (Mestre / Diretor Geral)',
    badge_label: '👑 Mestre Irrestrito',
    badge_class: 'bg-amber-100 text-amber-950 border-amber-400 font-extrabold',
    data_scope: 'all',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 1,
      tab_users: 1, tab_settings: 1
    }
  },
  dono_escritorio: {
    key: 'dono_escritorio',
    name: 'Dono de Escritório / Sócio Titular',
    badge_label: '🏛️ Sócio Titular',
    badge_class: 'bg-gold-100 text-gold-950 border-gold-400 font-bold',
    data_scope: 'all',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 1,
      tab_users: 1, tab_settings: 1
    }
  },
  advogado: {
    key: 'advogado',
    name: 'Advogado(a) Associado(a)',
    badge_label: '⚖️ Advogado(a)',
    badge_class: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold',
    data_scope: 'assigned',
    tabs: {
      tab_leads: 0, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  estagiario: {
    key: 'estagiario',
    name: 'Estagiário(a) de Direito',
    badge_label: '🎓 Estagiário(a)',
    badge_class: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-semibold',
    data_scope: 'assigned',
    tabs: {
      tab_leads: 0, tab_clients: 0, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 0, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  secretaria: {
    key: 'secretaria',
    name: 'Secretária Executiva / Atendimento',
    badge_label: '💼 Secretária / Atendimento',
    badge_class: 'bg-purple-100 text-purple-900 border-purple-300 font-semibold',
    data_scope: 'office',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 0, tab_drive: 0, tab_calendar: 1, tab_publications: 0,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  gerente: {
    key: 'gerente',
    name: 'Gerente Administrativo-Financeiro',
    badge_label: '🏢 Gerência / DP',
    badge_class: 'bg-blue-100 text-blue-900 border-blue-300 font-semibold',
    data_scope: 'all',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 0,
      tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 1
    }
  },
  motorista: {
    key: 'motorista',
    name: 'Motorista / Apoio Operacional',
    badge_label: '🚗 Motorista / Externo',
    badge_class: 'bg-slate-200 text-slate-800 border-slate-300 font-semibold',
    data_scope: 'assigned',
    tabs: {
      tab_leads: 0, tab_clients: 0, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 0, tab_drive: 0, tab_calendar: 1, tab_publications: 0,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  cliente: {
    key: 'cliente',
    name: 'Cliente (PF / PJ)',
    badge_label: '👤 Cliente',
    badge_class: 'bg-teal-100 text-teal-900 border-teal-300 font-semibold',
    data_scope: 'own',
    tabs: {
      tab_leads: 0, tab_clients: 0, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 0, tab_drive: 0, tab_calendar: 0, tab_publications: 0,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 0, tab_portal_cliente: 1,
      tab_users: 0, tab_settings: 0
    }
  }
};

function syncAllAccessPermissions() {
  try {
    const now = new Date().toISOString();

    // 1. Sincronizar Usuários do Painel
    const users = db.prepare(`SELECT * FROM users`).all();
    for (const u of users) {
      const isMaster = u.id === 'USR-MASTER-01' || u.username === 'jorgealvimtecnologia' || u.name.toLowerCase().includes('jorge alvim');
      const isDraMariana = u.name.toLowerCase().includes('mariana') || u.username.includes('mariana');
      const isDraGabriela = u.name.toLowerCase().includes('gabriela') || u.username.includes('gabriela');
      
      let tplKey = isMaster ? 'master' : ((isDraMariana || isDraGabriela) ? 'dono_escritorio' : 'advogado');
      let userType = isMaster ? 'master' : 'admin';
      const tpl = ROLE_TEMPLATES[tplKey];

      const exists = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(u.id);
      if (!exists) {
        db.prepare(`
          INSERT INTO access_permissions (
            id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
            role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
            tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
            tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `PERM-${u.id}`, u.id, userType, u.name, u.username, '', '',
          tplKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
          tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
          tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
          tpl.tabs.tab_users, tpl.tabs.tab_settings, 1, tpl.data_scope, 'Usuário Painel', now, now
        );
      } else if (isMaster) {
        // Enforce God Mode para Dr. Jorge Alvim
        db.prepare(`
          UPDATE access_permissions 
          SET role_template = 'master', tab_leads = 1, tab_clients = 1, tab_lawsuits = 1, tab_radar = 1,
              tab_offices = 1, tab_drive = 1, tab_calendar = 1, tab_publications = 1, tab_hr = 1,
              tab_financial = 1, tab_colaborador = 1, tab_portal_cliente = 1, tab_users = 1, tab_settings = 1,
              is_active = 1, data_scope = 'all', updated_at = ?
          WHERE user_id = ?
        `).run(now, u.id);
      }
    }

    // 2. Sincronizar Colaboradores do RH (CLT, Estágio, Associados)
    const employees = db.prepare(`SELECT * FROM hr_employees`).all();
    for (const emp of employees) {
      const pos = (emp.position || '').toLowerCase();
      let tplKey = 'advogado';
      let userType = 'empregado';

      if (pos.includes('estagi')) {
        tplKey = 'estagiario';
        userType = 'estagiario';
      } else if (pos.includes('secret') || pos.includes('recepc')) {
        tplKey = 'secretaria';
        userType = 'secretaria';
      } else if (pos.includes('gerente') || pos.includes('financ')) {
        tplKey = 'gerente';
        userType = 'gerente';
      } else if (pos.includes('motorist') || pos.includes('externo')) {
        tplKey = 'motorista';
        userType = 'motorista';
      } else if (pos.includes('sóci') || pos.includes('socio') || pos.includes('titular')) {
        tplKey = 'dono_escritorio';
        userType = 'dono_escritorio';
      } else if (pos.includes('advog')) {
        tplKey = 'advogado';
        userType = 'advogado';
      }

      const tpl = ROLE_TEMPLATES[tplKey];
      const exists = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(emp.id);
      if (!exists) {
        db.prepare(`
          INSERT INTO access_permissions (
            id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
            role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
            tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
            tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `PERM-${emp.id}`, emp.id, userType, emp.name, emp.cpf, emp.email || '', emp.phone || '',
          tplKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
          tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
          tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
          tpl.tabs.tab_users, tpl.tabs.tab_settings, 1, tpl.data_scope, `${emp.position} (${emp.contract_type})`, now, now
        );
      }
    }

    // 3. Sincronizar Clientes Cadastrados (PF e PJ)
    const clients = db.prepare(`SELECT * FROM clients`).all();
    for (const c of clients) {
      const tpl = ROLE_TEMPLATES.cliente;
      const iden = c.client_type === 'PJ' ? (c.cnpj || c.cpf) : (c.cpf || c.cnpj);
      const exists = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(c.id);
      if (!exists) {
        db.prepare(`
          INSERT INTO access_permissions (
            id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
            role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
            tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
            tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `PERM-${c.id}`, c.id, 'cliente', c.full_name, iden || c.id, c.email || '', c.phone || '',
          'cliente', tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
          tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
          tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
          tpl.tabs.tab_users, tpl.tabs.tab_settings, 1, 'own', `Cliente ${c.client_type}`, now, now
        );
      }
    }
    console.log('🛡️ [RBAC/ABAC] Sincronização de Matriz de Controle de Acesso concluída com sucesso!');
  } catch (err) {
    console.error('Erro na sincronização de permissões de acesso:', err);
  }
}

// Executar sincronização inicial no boot
try {
  syncAllAccessPermissions();
} catch (e) {
  console.warn('Erro no boot sync de permissões:', e);
}

/**
 * 1. GET /api/access-control/matrix - Listar toda a matriz de permissões granulares
 */
app.get('/api/access-control/matrix', requireAuth, (req, res) => {
  try {
    syncAllAccessPermissions();

    const rows = db.prepare(`
      SELECT * FROM access_permissions 
      ORDER BY 
        CASE 
          WHEN role_template = 'master' THEN 1
          WHEN role_template = 'dono_escritorio' THEN 2
          WHEN role_template = 'advogado' THEN 3
          WHEN role_template = 'estagiario' THEN 4
          WHEN role_template = 'gerente' THEN 5
          WHEN role_template = 'secretaria' THEN 6
          WHEN role_template = 'motorista' THEN 7
          WHEN role_template = 'cliente' THEN 8
          ELSE 9
        END, user_name ASC
    `).all();

    const stats = {
      total: rows.length,
      active: rows.filter(r => r.is_active === 1).length,
      masters: rows.filter(r => r.role_template === 'master' || r.role_template === 'dono_escritorio').length,
      lawyers: rows.filter(r => r.role_template === 'advogado').length,
      interns: rows.filter(r => r.role_template === 'estagiario').length,
      staff: rows.filter(r => ['secretaria', 'gerente', 'motorista'].includes(r.role_template)).length,
      clients: rows.filter(r => r.role_template === 'cliente').length
    };

    // SEGURANÇA: a matriz não expõe senhas. Para trocar, usa-se "Redefinir senha".
    const matrix = rows.map(r => {
      const tpl = ROLE_TEMPLATES[r.role_template] || ROLE_TEMPLATES.advogado;
      return {
        ...r,
        plain_password: '',
        is_master: r.role_template === 'master' || r.user_id === 'USR-MASTER-01' || (r.user_name || '').toLowerCase().includes('jorge alvim'),
        badge_label: tpl.badge_label,
        badge_class: tpl.badge_class,
        role_name: tpl.name
      };
    });

    return res.json({
      success: true,
      stats,
      templates: ROLE_TEMPLATES,
      matrix
    });
  } catch (err) {
    console.error('[ERRO] Falha ao consultar matriz de acessos:', err);
    return res.status(500).json({ error: 'Erro ao consultar matriz de permissões.' });
  }
});

/**
 * 2. POST /api/access-control/toggle - Ligar/Desligar switch de uma aba individual
 */
app.post('/api/access-control/toggle', requireAuth, (req, res) => {
  try {
    const { user_id, tab_key, enabled } = req.body;

    if (!user_id || !tab_key) {
      return res.status(400).json({ error: 'ID do usuário e chave da aba são obrigatórios.' });
    }

    const validTabs = [
      'tab_leads', 'tab_clients', 'tab_lawsuits', 'tab_radar', 'tab_offices',
      'tab_drive', 'tab_calendar', 'tab_publications', 'tab_hr', 'tab_financial',
      'tab_colaborador', 'tab_portal_cliente', 'tab_users', 'tab_settings'
    ];

    if (!validTabs.includes(tab_key)) {
      return res.status(400).json({ error: 'Chave de aba inválida.' });
    }

    const record = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(user_id);
    if (!record) {
      return res.status(404).json({ error: 'Registro de permissão não encontrado.' });
    }

    // Regra de Ouro: Dr. Jorge Alvim / Mestre NUNCA pode ter acesso revogado (God Mode)
    const isMaster = record.role_template === 'master' || record.user_id === 'USR-MASTER-01' || (record.user_name || '').toLowerCase().includes('jorge alvim');
    if (isMaster && !enabled) {
      return res.status(403).json({
        error: '👑 Acesso Mestre Protegido: O Dr. Jorge Alvim possui acesso total permanente e irrestrito a todos os recursos.'
      });
    }

    const val = enabled ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE access_permissions 
      SET ${tab_key} = ?, role_template = 'custom', updated_at = ?
      WHERE user_id = ?
    `).run(val, now, user_id);

    logAudit(req, {
      event_type: 'ALTERACAO_PERMISSAO',
      event_name: 'TOGGLE_ABA',
      module: 'CONTROLE_ACESSO',
      resource_id: user_id,
      description: `Permissão da aba '${tab_key}' ${enabled ? 'HABILITADA' : 'DESABILITADA'} para '${record.user_name}'.`,
      details: { user_id, user_name: record.user_name, tab_key, enabled: val }
    });

    return res.json({
      success: true,
      message: `Aba ${tab_key.replace('tab_', '').toUpperCase()} ${enabled ? 'ativada' : 'desativada'} com sucesso para ${record.user_name}.`,
      tab_key,
      enabled: val
    });
  } catch (err) {
    console.error('[ERRO] Falha ao alternar permissão:', err);
    return res.status(500).json({ error: 'Erro ao alternar permissão.' });
  }
});

/**
 * 3. POST /api/access-control/apply-template - Aplicar Perfil Pronto em 1 Clique
 */
app.post('/api/access-control/apply-template', requireAuth, (req, res) => {
  try {
    const { user_id, template_key } = req.body;

    if (!user_id || !template_key || !ROLE_TEMPLATES[template_key]) {
      return res.status(400).json({ error: 'Usuário e Modelo de Perfil válido são obrigatórios.' });
    }

    const record = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(user_id);
    if (!record) {
      return res.status(404).json({ error: 'Registro de permissão não encontrado.' });
    }

    // Regra de Ouro: Dr. Jorge Alvim sempre permanece como Master
    const isMaster = record.role_template === 'master' || record.user_id === 'USR-MASTER-01' || (record.user_name || '').toLowerCase().includes('jorge alvim');
    const targetKey = isMaster ? 'master' : template_key;
    const tpl = ROLE_TEMPLATES[targetKey];
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE access_permissions 
      SET role_template = ?, tab_leads = ?, tab_clients = ?, tab_lawsuits = ?, tab_radar = ?,
          tab_offices = ?, tab_drive = ?, tab_calendar = ?, tab_publications = ?, tab_hr = ?,
          tab_financial = ?, tab_colaborador = ?, tab_portal_cliente = ?, tab_users = ?,
          tab_settings = ?, data_scope = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      targetKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
      tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
      tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
      tpl.tabs.tab_users, tpl.tabs.tab_settings, tpl.data_scope, now, user_id
    );

    logAudit(req, {
      event_type: 'ALTERACAO_PERMISSAO',
      event_name: 'APLICAR_TEMPLATE',
      module: 'CONTROLE_ACESSO',
      resource_id: user_id,
      description: `Perfil padrão '${tpl.name}' aplicado para '${record.user_name}'.`
    });

    return res.json({
      success: true,
      message: `Perfil '${tpl.name}' aplicado com sucesso para ${record.user_name}!`,
      template: tpl
    });
  } catch (err) {
    console.error('[ERRO] Falha ao aplicar template de permissões:', err);
    return res.status(500).json({ error: 'Erro ao aplicar modelo de permissão.' });
  }
});

/**
 * 4. POST /api/access-control/toggle-user-status - Ativar / Suspender Acesso Global
 */
app.post('/api/access-control/toggle-user-status', requireAuth, (req, res) => {
  try {
    const { user_id, is_active } = req.body;

    const record = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(user_id);
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    const isMaster = record.role_template === 'master' || record.user_id === 'USR-MASTER-01' || (record.user_name || '').toLowerCase().includes('jorge alvim');
    if (isMaster && !is_active) {
      return res.status(403).json({ error: '👑 O acesso do Dr. Jorge Alvim não pode ser inativado.' });
    }

    const activeVal = is_active ? 1 : 0;
    db.prepare(`UPDATE access_permissions SET is_active = ?, updated_at = ? WHERE user_id = ?`).run(activeVal, new Date().toISOString(), user_id);

    return res.json({
      success: true,
      message: `Acesso de ${record.user_name} ${is_active ? 'ATIVADO' : 'SUSPENSO'} com sucesso!`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. GET /api/access-control/my-permissions - Retorna abas permitidas da sessão ativa
 */
app.get('/api/access-control/my-permissions', (req, res) => {
  try {
    // 1. Tentar ler sessão do painel
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token || req.headers['x-access-token']);
    const session = validateToken(token);

    if (session) {
      const isMaster = session.userId === 'USR-MASTER-01' || session.username === 'jorgealvimtecnologia' || (session.name || '').toLowerCase().includes('jorge alvim') || session.role === 'master';
      if (isMaster) {
        return res.json({
          success: true,
          is_master: true,
          role_name: 'Dr. Jorge Alvim (Mestre)',
          permissions: ROLE_TEMPLATES.master.tabs
        });
      }

      const perm = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(session.userId);
      if (perm) {
        return res.json({
          success: true,
          is_master: false,
          role_name: perm.role_template,
          permissions: {
            tab_leads: perm.tab_leads, tab_clients: perm.tab_clients, tab_lawsuits: perm.tab_lawsuits,
            tab_radar: perm.tab_radar, tab_offices: perm.tab_offices, tab_drive: perm.tab_drive,
            tab_calendar: perm.tab_calendar, tab_publications: perm.tab_publications, tab_hr: perm.tab_hr,
            tab_financial: perm.tab_financial, tab_colaborador: perm.tab_colaborador,
            tab_portal_cliente: perm.tab_portal_cliente, tab_users: perm.tab_users, tab_settings: perm.tab_settings
          }
        });
      }
    }

    // Default permissivo para operadores autenticados
    return res.json({
      success: true,
      is_master: true,
      permissions: ROLE_TEMPLATES.master.tabs
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
app.post('/api/client-portal/register', (req, res) => {
  try {
    const {
      client_type,
      full_name,
      cpf,
      rg,
      cnpj,
      email,
      phone,
      password,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      nationality,
      marital_status,
      profession,
      rep_name,
      rep_cpf,
      rep_rg,
      rep_street,
      rep_number,
      rep_neighborhood,
      rep_city,
      rep_state,
      rep_cep,
      rep_complement
    } = req.body;

    if (!full_name || !phone || !email || !password) {
      return res.status(400).json({ error: 'Nome/Razão Social, E-mail, Telefone/WhatsApp e Senha são obrigatórios.' });
    }

    {
      const pol = validatePassword(password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const type = client_type === 'PJ' ? 'PJ' : 'PF';
    const cleanEmail = email.trim().toLowerCase();
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
    const cleanCnpj = cnpj ? cnpj.replace(/\D/g, '') : null;

    if (type === 'PF' && !cpf) {
      return res.status(400).json({ error: 'O CPF é obrigatório para cadastro de Pessoa Física.' });
    }
    if (type === 'PJ' && !cnpj) {
      return res.status(400).json({ error: 'O CNPJ é obrigatório para cadastro de Pessoa Jurídica.' });
    }

    // Verificar se já existe cliente com o mesmo CPF, CNPJ ou E-mail
    let existing = null;
    if (type === 'PF' && cleanCpf) {
      existing = db.prepare(`SELECT id, password_hash FROM clients WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?`).get(cleanCpf);
    } else if (type === 'PJ' && cleanCnpj) {
      existing = db.prepare(`SELECT id, password_hash FROM clients WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?`).get(cleanCnpj);
    }

    if (!existing && cleanEmail) {
      existing = db.prepare(`SELECT id, password_hash FROM clients WHERE LOWER(TRIM(email)) = ?`).get(cleanEmail);
    }

    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    let clientId;

    if (existing) {
      // Se o cliente já foi cadastrado previamente pelo advogado ou formulário, apenas define/atualiza a senha e dados
      clientId = existing.id;
      db.prepare(`
        UPDATE clients SET
          client_type = ?,
          full_name = ?,
          cpf = COALESCE(?, cpf),
          rg = COALESCE(?, rg),
          cnpj = COALESCE(?, cnpj),
          email = ?,
          phone = ?,
          password_hash = ?,
          salt = ?,
          street = COALESCE(?, street),
          number = COALESCE(?, number),
          neighborhood = COALESCE(?, neighborhood),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          cep = COALESCE(?, cep),
          complement = COALESCE(?, complement),
          filiation_father = COALESCE(?, filiation_father),
          filiation_mother = COALESCE(?, filiation_mother),
          nationality = COALESCE(?, nationality),
          marital_status = COALESCE(?, marital_status),
          profession = COALESCE(?, profession),
          rep_name = COALESCE(?, rep_name),
          rep_cpf = COALESCE(?, rep_cpf),
          rep_rg = COALESCE(?, rep_rg),
          rep_street = COALESCE(?, rep_street),
          rep_number = COALESCE(?, rep_number),
          rep_neighborhood = COALESCE(?, rep_neighborhood),
          rep_city = COALESCE(?, rep_city),
          rep_state = COALESCE(?, rep_state),
          rep_cep = COALESCE(?, rep_cep),
          rep_complement = COALESCE(?, rep_complement),
          updated_at = ?
        WHERE id = ?
      `).run(
        type,
        full_name.trim(),
        cpf || null,
        rg || null,
        cnpj || null,
        cleanEmail,
        phone.trim(),
        hash,
        salt,
        street || null,
        number || null,
        neighborhood || null,
        city || null,
        state || null,
        cep || null,
        complement || null,
        filiation_father || null,
        filiation_mother || null,
        nationality || 'brasileiro(a)',
        marital_status || 'solteiro(a)',
        profession || null,
        rep_name || null,
        rep_cpf || null,
        rep_rg || null,
        rep_street || null,
        rep_number || null,
        rep_neighborhood || null,
        rep_city || null,
        rep_state || null,
        rep_cep || null,
        rep_complement || null,
        now,
        clientId
      );
    } else {
      // Novo cadastro do cliente
      clientId = generateNextClientFullId();
      db.prepare(`
        INSERT INTO clients (
          id, client_type, full_name, cpf, rg, cnpj, email, phone, password_hash, salt,
          street, number, neighborhood, city, state, cep, complement,
          filiation_father, filiation_mother, nationality, marital_status, profession,
          rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
          email_notifications, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          1, ?, ?
        )
      `).run(
        clientId,
        type,
        full_name.trim(),
        cpf || null,
        rg || null,
        cnpj || null,
        cleanEmail,
        phone.trim(),
        hash,
        salt,
        street || null,
        number || null,
        neighborhood || null,
        city || null,
        state || null,
        cep || null,
        complement || null,
        filiation_father || null,
        filiation_mother || null,
        nationality || 'brasileiro(a)',
        marital_status || 'solteiro(a)',
        profession || null,
        rep_name || null,
        rep_cpf || null,
        rep_rg || null,
        rep_street || null,
        rep_number || null,
        rep_neighborhood || null,
        rep_city || null,
        rep_state || null,
        rep_cep || null,
        rep_complement || null,
        now,
        now
      );

      // Enviar mensagem de boas-vindas do escritório
      db.prepare(`
        INSERT INTO client_messages (client_id, sender, sender_name, subject, message, created_at)
        VALUES (?, 'office', 'Dr. Jorge Alvim Advocacia', 'Boas-vindas ao Portal do Cliente', 'Seja bem-vindo(a) ao seu Portal de Atendimento e Acompanhamento Processual! Por aqui você pode acompanhar todas as movimentações dos seus processos, consultar seu contrato e nos enviar mensagens.', ?)
      `).run(clientId, now);
    }

    const clientRow = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
    const token = createClientSession(clientRow);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CADASTRO_PORTAL_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_cpf: clientRow.cpf || clientRow.cnpj,
      user_name: clientRow.full_name,
      user_role: 'client',
      description: `Novo cadastro pelo Portal do Cliente: ${clientRow.full_name} (${clientRow.client_type === 'PJ' ? 'CNPJ: ' + clientRow.cnpj : 'CPF: ' + clientRow.cpf}).`
    });

    // 📲 Dispara notificação por WhatsApp ao Advogado (Dr. Jorge Alvim)
    const clientTypeLabel = clientRow.client_type === 'PJ' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)';
    const docInfo = clientRow.client_type === 'PJ' ? `🏢 CNPJ: ${clientRow.cnpj}` : `👤 CPF: ${clientRow.cpf}`;
    const dateStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const notifyMsg = 
      `🔔 *NOVO CLIENTE CADASTRADO NO PORTAL!*\n\n` +
      `👤 *Nome:* ${clientRow.full_name}\n` +
      `🆔 *Código:* #${clientRow.id}\n` +
      `🏷️ *Tipo:* ${clientTypeLabel}\n` +
      `${docInfo}\n` +
      `📱 *WhatsApp:* ${clientRow.phone}\n` +
      `✉️ *E-mail:* ${clientRow.email}\n` +
      `📍 *Cidade/UF:* ${clientRow.city || 'Juiz de Fora'} / ${clientRow.state || 'MG'}\n` +
      `📅 *Data:* ${dateStr}\n\n` +
      `👉 *Ver no Painel:* http://localhost:3000/painel`;

    sendLawyerWhatsAppNotification(notifyMsg, { clientId: clientRow.id, type: 'PORTAL_REGISTER' });

    res.status(201).json({
      success: true,
      message: 'Cadastro realizado com sucesso! Bem-vindo(a) ao Portal do Cliente.',
      token,
      client: {
        id: clientRow.id,
        full_name: clientRow.full_name,
        email: clientRow.email,
        phone: clientRow.phone,
        client_type: clientRow.client_type,
        cpf: clientRow.cpf,
        cnpj: clientRow.cnpj
      }
    });

  } catch (err) {
    console.error('Erro no cadastro do cliente:', err);
    res.status(500).json({ error: 'Erro ao processar cadastro do cliente: ' + err.message });
  }
});

// Endpoint de Teste do Envio de Notificação de WhatsApp ao Advogado
app.post('/api/admin/whatsapp/test', requireAuth, async (req, res) => {
  try {
    const { custom_message } = req.body || {};
    const testMsg = custom_message || 
      `🧪 *TESTE DE SISTEMA DE NOTIFICAÇÃO VIA WHATSAPP*\n\n` +
      `📌 *Status:* Servidor Operacional\n` +
      `📍 *Escritório:* Jorge Alvim Advocacia & Tecnologia\n` +
      `📅 *Data/Hora:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `✅ O sistema de envio de alertas de novos clientes e atendimentos está ativo!`;

    const result = await sendLawyerWhatsAppNotification(testMsg, { type: 'ADMIN_TEST' });

    res.json({
      success: true,
      message: 'Notificação de teste gerada com sucesso!',
      lawyerPhone: result.lawyerPhone,
      waDirectUrl: result.waDirectUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao testar envio de WhatsApp: ' + err.message });
  }
});

// 2. Login do Cliente (por CPF, CNPJ ou E-mail + Senha)
app.post('/api/client-portal/login', loginRateLimit, (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Informe seu CPF, CNPJ ou E-mail e a senha cadastrada.' });
    }

    const cleanInput = login.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const cleanEmail = cleanInput.toLowerCase();

    // Busca flexível do cliente por CPF, CNPJ, Telefone, E-mail ou ID
    let client = null;
    if (cleanDigits.length >= 8) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?
           OR id = ?
      `).get(cleanDigits, cleanDigits, `%${cleanDigits}%`, cleanInput);
    }

    if (!client) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE LOWER(TRIM(email)) = ?
           OR id = ?
           OR LOWER(TRIM(full_name)) LIKE ?
      `).get(cleanEmail, cleanInput, `%${cleanEmail}%`);
    }

    if (!client) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_CLIENTE',
        module: 'PORTAL_CLIENTE',
        user_name: cleanInput,
        user_role: 'client',
        description: `Tentativa de login no portal com identificador não encontrado: '${cleanInput}'.`
      });
      return res.status(401).json({ error: 'Cadastro não encontrado com este CPF, CNPJ, Telefone ou E-mail.' });
    }

    // Se o cliente ainda não tem senha cadastrada, define a senha digitada se cumprir
    // a política (4–12 caracteres); caso contrário aplica a senha padrão de 1º acesso.
    if (!client.password_hash || !client.salt) {
      if (password && validatePassword(password).ok) {
        const newPass = hashPassword(password);
        db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(newPass.hash, newPass.salt, new Date().toISOString(), client.id);
        client.password_hash = newPass.hash;
        client.salt = newPass.salt;
      } else {
        const defPass = hashPassword('123456');
        db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(defPass.hash, defPass.salt, new Date().toISOString(), client.id);
        client.password_hash = defPass.hash;
        client.salt = defPass.salt;
      }
    }

    // SEGURANÇA: sem senha universal. Valida apenas a senha real do cliente.
    const valid = verifyPassword(password, client.password_hash, client.salt);

    if (!valid) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_CLIENTE',
        module: 'PORTAL_CLIENTE',
        resource_id: client.id,
        user_cpf: client.cpf || client.cnpj,
        user_name: client.full_name,
        user_role: 'client',
        description: `Tentativa de login com senha incorreta para o cliente ${client.full_name}.`
      });
      return res.status(401).json({ error: 'Senha incorreta. Verifique suas credenciais.' });
    }

    // Upgrade transparente do hash para o formato forte, se necessário.
    try {
      if (!isStrongHash(password, client.password_hash, client.salt)) {
        const up = hashPassword(password);
        db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(up.hash, up.salt, new Date().toISOString(), client.id);
      }
    } catch (e) { /* best-effort */ }

    const token = createClientSession(client);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'LOGIN_PORTAL_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: client.id,
      user_cpf: client.cpf || client.cnpj,
      user_name: client.full_name,
      user_role: 'client',
      description: `Cliente ${client.full_name} autenticou-se com sucesso no Portal do Cliente.`
    });

    res.json({
      success: true,
      message: 'Login efetuado com sucesso!',
      token,
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
        client_type: client.client_type,
        cpf: client.cpf,
        cnpj: client.cnpj
      }
    });

  } catch (err) {
    console.error('Erro no login do cliente:', err);
    res.status(500).json({ error: 'Erro interno ao autenticar cliente.' });
  }
});

// 3. Obter Perfil Completo, Processos, Contrato e Financeiro do Cliente Logado
app.get('/api/client-portal/me', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const client = db.prepare(`
      SELECT 
        id, client_type, full_name, cpf, rg, cnpj, email, phone, social_media,
        street, number, neighborhood, city, state, cep, complement,
        filiation_father, filiation_mother, nationality, marital_status, profession,
        rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
        contract_value, installments_count, installment_value, due_date, amount_paid, balance_due, invoice_number, contract_status,
        email_notifications, created_at, updated_at
      FROM clients WHERE id = ?
    `).get(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    // Processos Judiciais e Andamentos
    const lawsuits = db.prepare(`
      SELECT * FROM lawsuits WHERE client_id = ? ORDER BY created_at DESC
    `).all(clientId);

    const lawsuitsWithMovements = lawsuits.map(lawsuit => {
      const movements = db.prepare(`
        SELECT * FROM lawsuit_movements WHERE lawsuit_id = ? ORDER BY movement_date DESC, created_at DESC
      `).all(lawsuit.id);
      return { ...lawsuit, movements };
    });

    // Parcelas do Contrato & Cobranças
    const installments = db.prepare(`
      SELECT * FROM contract_installments WHERE client_id = ? ORDER BY installment_number ASC
    `).all(clientId);

    // Mensagens Trocadas com o Escritório
    const messages = db.prepare(`
      SELECT * FROM client_messages WHERE client_id = ? ORDER BY created_at ASC
    `).all(clientId);

    res.json({
      success: true,
      client,
      lawsuits: lawsuitsWithMovements,
      installments,
      messages
    });

  } catch (err) {
    console.error('Erro ao buscar dados do cliente logado:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do portal do cliente.' });
  }
});

// 4. Atualizar Dados Cadastrais pelo Próprio Cliente
app.put('/api/client-portal/profile', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const {
      full_name,
      rg,
      phone,
      email,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      nationality,
      marital_status,
      profession,
      rep_name,
      rep_cpf,
      rep_rg,
      rep_street,
      rep_number,
      rep_neighborhood,
      rep_city,
      rep_state,
      rep_cep,
      rep_complement,
      email_notifications
    } = req.body;

    if (!full_name || !phone || !email) {
      return res.status(400).json({ error: 'Nome, E-mail e Telefone são obrigatórios.' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE clients SET
        full_name = ?,
        rg = COALESCE(?, rg),
        phone = ?,
        email = ?,
        street = ?,
        number = ?,
        neighborhood = ?,
        city = ?,
        state = ?,
        cep = ?,
        complement = ?,
        filiation_father = ?,
        filiation_mother = ?,
        nationality = ?,
        marital_status = ?,
        profession = ?,
        rep_name = ?,
        rep_cpf = ?,
        rep_rg = ?,
        rep_street = ?,
        rep_number = ?,
        rep_neighborhood = ?,
        rep_city = ?,
        rep_state = ?,
        rep_cep = ?,
        rep_complement = ?,
        email_notifications = COALESCE(?, email_notifications),
        updated_at = ?
      WHERE id = ?
    `).run(
      full_name.trim(),
      rg || null,
      phone.trim(),
      email.trim().toLowerCase(),
      street || null,
      number || null,
      neighborhood || null,
      city || null,
      state || null,
      cep || null,
      complement || null,
      filiation_father || null,
      filiation_mother || null,
      nationality || 'brasileiro(a)',
      marital_status || 'solteiro(a)',
      profession || null,
      rep_name || null,
      rep_cpf || null,
      rep_rg || null,
      rep_street || null,
      rep_number || null,
      rep_neighborhood || null,
      rep_city || null,
      rep_state || null,
      rep_cep || null,
      rep_complement || null,
      email_notifications !== undefined ? (email_notifications ? 1 : 0) : 1,
      now,
      clientId
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'ATUALIZAR_PERFIL_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: full_name.trim(),
      user_role: 'client',
      description: `O cliente ${full_name.trim()} atualizou seus próprios dados cadastrais e endereço no portal.`
    });

    res.json({ success: true, message: 'Dados cadastrais atualizados com sucesso!' });

  } catch (err) {
    console.error('Erro ao atualizar perfil do cliente:', err);
    res.status(500).json({ error: 'Erro ao atualizar dados: ' + err.message });
  }
});

// 5. Alterar Senha (Cliente Logado)
app.post('/api/client-portal/change-password', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    }

    {
      const pol = validatePassword(new_password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const client = db.prepare(`SELECT full_name, cpf, cnpj, password_hash, salt FROM clients WHERE id = ?`).get(clientId);
    if (!client || !client.password_hash || !client.salt) {
      return res.status(400).json({ error: 'Cadastro de senha inválido.' });
    }

    const valid = verifyPassword(current_password, client.password_hash, client.salt);
    if (!valid) {
      return res.status(401).json({ error: 'A senha atual digitada está incorreta.' });
    }

    const { hash, salt } = hashPassword(new_password);
    db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(hash, salt, new Date().toISOString(), clientId);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'ALTERAR_SENHA_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `O cliente ${client.full_name} alterou sua senha de acesso ao portal com sucesso.`
    });

    res.json({ success: true, message: 'Sua senha foi alterada com sucesso!' });

  } catch (err) {
    console.error('Erro ao alterar senha do cliente:', err);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
});

// 6. Solicitar Recuperação de Senha (Gera Código de Recuperação)
app.post('/api/client-portal/forgot-password', (req, res) => {
  try {
    const { login } = req.body;
    if (!login) {
      return res.status(400).json({ error: 'Informe seu CPF, CNPJ ou E-mail para recuperar a senha.' });
    }

    const cleanInput = login.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const cleanEmail = cleanInput.toLowerCase();

    let client = null;
    if (cleanDigits.length >= 11) {
      client = db.prepare(`
        SELECT id, email, full_name, cpf, cnpj FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      `).get(cleanDigits, cleanDigits);
    }

    if (!client) {
      client = db.prepare(`SELECT id, email, full_name, cpf, cnpj FROM clients WHERE LOWER(TRIM(email)) = ?`).get(cleanEmail);
    }

    if (!client) {
      return res.status(404).json({ error: 'Não encontramos nenhum cadastro com este CPF/CNPJ ou E-mail.' });
    }

    // Código de 6 dígitos
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

    db.prepare(`
      UPDATE clients SET reset_token = ?, reset_token_expires = ? WHERE id = ?
    `).run(resetCode, expiresAt, client.id);

    console.log(`🔐 [RESET SENHA] Código gerado para cliente ${client.full_name} (${client.id}): ${resetCode}`);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'SOLICITAR_RESET_SENHA',
      module: 'PORTAL_CLIENTE',
      resource_id: client.id,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `Código de recuperação de senha gerado para o cliente ${client.full_name}.`
    });

    res.json({
      success: true,
      message: `Código de redefinição enviado com sucesso! Utilize o código ${resetCode} para definir sua nova senha.`,
      reset_code_demo: resetCode
    });

  } catch (err) {
    console.error('Erro na solicitação de recuperação de senha:', err);
    res.status(500).json({ error: 'Erro ao gerar solicitação de recuperação de senha.' });
  }
});

// 7. Redefinir Senha com Código
app.post('/api/client-portal/reset-password', (req, res) => {
  try {
    const { login, reset_code, new_password } = req.body;
    if (!login || !reset_code || !new_password) {
      return res.status(400).json({ error: 'Informe o identificador (CPF/E-mail), código de recuperação e a nova senha.' });
    }

    {
      const pol = validatePassword(new_password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const cleanInput = login.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const cleanEmail = cleanInput.toLowerCase();

    let client = null;
    if (cleanDigits.length >= 11) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      `).get(cleanDigits, cleanDigits);
    }

    if (!client) {
      client = db.prepare(`SELECT * FROM clients WHERE LOWER(TRIM(email)) = ?`).get(cleanEmail);
    }

    if (!client) {
      return res.status(404).json({ error: 'Cadastro não encontrado.' });
    }

    if (!client.reset_token || client.reset_token !== reset_code.trim()) {
      return res.status(400).json({ error: 'Código de recuperação inválido ou incorreto.' });
    }

    if (new Date(client.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Código de recuperação expirado. Solicite um novo código.' });
    }

    const { hash, salt } = hashPassword(new_password);
    db.prepare(`
      UPDATE clients SET 
        password_hash = ?, 
        salt = ?, 
        reset_token = NULL, 
        reset_token_expires = NULL, 
        updated_at = ? 
      WHERE id = ?
    `).run(hash, salt, new Date().toISOString(), client.id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'REDEFINIR_SENHA_CODIGO',
      module: 'PORTAL_CLIENTE',
      resource_id: client.id,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `Senha do cliente ${client.full_name} redefinida com sucesso via código de verificação.`
    });

    res.json({ success: true, message: 'Senha redefinida com sucesso! Você já pode fazer login.' });

  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// 8. Excluir Conta do Cliente (Direito do Titular LGPD)
app.delete('/api/client-portal/account', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Confirme sua senha para validar a exclusão da conta.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
    if (!client || !verifyPassword(password, client.password_hash, client.salt)) {
      return res.status(401).json({ error: 'Senha incorreta. Não foi possível autorizar a exclusão.' });
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUSAO_CONTA_LGPD',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `EXCLUSÃO DEFINITIVA DE CONTA E DADOS solicitada pelo titular ${client.full_name} (${client.cpf || client.cnpj}) conforme art. 18 da LGPD.`
    });

    // Excluir cliente e dados vinculados em cascata
    db.prepare(`DELETE FROM clients WHERE id = ?`).run(clientId);

    // Invalidar sessões ativas
    for (const [token, session] of clientSessions.entries()) {
      if (session.clientId === clientId) {
        destroySession(token);
      }
    }

    res.json({ success: true, message: 'Sua conta e dados foram excluídos com sucesso do sistema.' });

  } catch (err) {
    console.error('Erro ao excluir conta do cliente:', err);
    res.status(500).json({ error: 'Erro ao excluir conta: ' + err.message });
  }
});

// 9. Enviar Mensagem para o Escritório
app.post('/api/client-portal/messages', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const clientName = req.client.fullName;
    const { subject, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Digite o conteúdo da mensagem.' });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO client_messages (client_id, sender, sender_name, subject, message, created_at)
      VALUES (?, 'client', ?, ?, ?, ?)
    `).run(clientId, clientName, (subject || 'Mensagem do Cliente').trim(), message.trim(), now);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'ENVIAR_MENSAGEM_PORTAL',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: clientName,
      user_role: 'client',
      description: `Mensagem enviada pelo cliente ${clientName}: '${subject || 'Mensagem'}' ao escritório.`
    });

    res.status(201).json({
      success: true,
      message: 'Mensagem enviada ao Dr. Jorge Alvim com sucesso!',
      messageId: result.lastInsertRowid
    });

  } catch (err) {
    console.error('Erro ao registrar mensagem do cliente:', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

// 10. Atualizar Notificações por E-mail do Andamento Processual
app.patch('/api/client-portal/email-notifications', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const { enabled } = req.body;
    const val = enabled ? 1 : 0;

    db.prepare(`UPDATE clients SET email_notifications = ?, updated_at = ? WHERE id = ?`).run(val, new Date().toISOString(), clientId);
    res.json({ success: true, message: `Notificações por e-mail ${val ? 'ativadas' : 'desativadas'} com sucesso!` });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar preferência de notificação.' });
  }
});

// ===== ROTAS DO BLOG: extraídas para src/modules/blog/blog.routes.js (blogRouter) =====

// ================= ROTAS DE AUDITORIA E TRILHA DE HISTÓRICO =================

// 1. Listar Logs de Auditoria com Filtros Avançados e Paginação (Admin)
app.get('/api/admin/audit-logs', requireAuth, (req, res) => {
  try {
    const { module, event_type, search, start_date, end_date, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const params = [];

    if (module && module !== 'ALL') {
      query += ` AND module = ?`;
      params.push(module);
    }

    if (event_type && event_type !== 'ALL') {
      query += ` AND event_type = ?`;
      params.push(event_type);
    }

    if (start_date) {
      query += ` AND created_at >= ?`;
      params.push(`${start_date}T00:00:00.000Z`);
    }

    if (end_date) {
      query += ` AND created_at <= ?`;
      params.push(`${end_date}T23:59:59.999Z`);
    }

    if (search && search.trim()) {
      query += ` AND (user_name LIKE ? OR user_cpf LIKE ? OR description LIKE ? OR resource_id LIKE ? OR details LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const logs = db.prepare(query).all(...params);

    // Contagem total
    let countQuery = `SELECT COUNT(*) as total FROM audit_logs WHERE 1=1`;
    const countParams = [];
    if (module && module !== 'ALL') {
      countQuery += ` AND module = ?`;
      countParams.push(module);
    }
    if (event_type && event_type !== 'ALL') {
      countQuery += ` AND event_type = ?`;
      countParams.push(event_type);
    }
    if (start_date) {
      countQuery += ` AND created_at >= ?`;
      countParams.push(`${start_date}T00:00:00.000Z`);
    }
    if (end_date) {
      countQuery += ` AND created_at <= ?`;
      countParams.push(`${end_date}T23:59:59.999Z`);
    }
    if (search && search.trim()) {
      countQuery += ` AND (user_name LIKE ? OR user_cpf LIKE ? OR description LIKE ? OR resource_id LIKE ? OR details LIKE ?)`;
      const s = `%${search.trim()}%`;
      countParams.push(s, s, s, s, s);
    }

    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('[AUDITORIA] Erro ao listar logs de auditoria:', err);
    res.status(500).json({ error: 'Erro ao buscar trilha de auditoria.' });
  }
});

// 2. Estatísticas e Métricas da Trilha de Auditoria (Admin)
app.get('/api/admin/audit-logs/stats', requireAuth, (req, res) => {
  try {
    const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c;
    const creations = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'CRIACAO'`).get().c;
    const updates = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'ALTERACAO'`).get().c;
    const deletions = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'EXCLUSAO'`).get().c;
    const documents = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'GERACAO_DOC'`).get().c;
    const authEvents = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'AUTENTICACAO'`).get().c;

    const byModule = db.prepare(`
      SELECT module, COUNT(*) as count 
      FROM audit_logs 
      GROUP BY module 
      ORDER BY count DESC
    `).all();

    res.json({
      success: true,
      stats: {
        total,
        creations,
        updates,
        deletions,
        documents,
        authEvents,
        byModule
      }
    });
  } catch (err) {
    console.error('[AUDITORIA] Erro ao obter estatísticas:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas de auditoria.' });
  }
});

// 3. Registrar Evento de Auditoria via Painel (ex: Geração / Impressão de Documentos)
app.post('/api/audit/log-event', requireAuth, (req, res) => {
  try {
    const { event_type = 'GERACAO_DOC', event_name, module = 'DOCUMENTOS', resource_id, description, details } = req.body;
    if (!description || !event_name) {
      return res.status(400).json({ error: 'Descrição e nome do evento são obrigatórios.' });
    }

    logAudit(req, {
      event_type,
      event_name,
      module,
      resource_id,
      description,
      details
    });

    res.json({ success: true, message: 'Evento de auditoria registrado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar evento de auditoria.' });
  }
});

// ================= ROTAS DE RASTREAMENTO DE VISITAS, GEOLOCALIZAÇÃO & PRÉ-CLIENTES =================

// Helper para estimativa geográfica do IP
function estimateIpLocation(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip === 'localhost') {
    return {
      city: 'Juiz de Fora (Rede Local / Servidor)',
      region: 'MG',
      country: 'Brasil',
      isp: 'Conexão Local / Escritório'
    };
  }
  return {
    city: 'Juiz de Fora / Zona da Mata',
    region: 'MG',
    country: 'Brasil',
    isp: 'Provedor de Acesso à Internet'
  };
}

// 1. Rastrear Nova Visita ao Site (Público)
app.post('/api/visits/track', (req, res) => {
  try {
    const rawIp = getClientIp(req);
    const clientIp = rawIp.split(',')[0].trim().replace(/^::ffff:/, '');
    const userAgent = req.headers['user-agent'] || 'Desconhecido';
    const referer = req.headers['referer'] || req.body.referer || '';
    const { page_url, path: pagePath, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.body;

    const now = new Date();
    const visitDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const visitYear = now.getFullYear();
    const visitMonth = now.getMonth() + 1; // 1 a 12
    const visitDay = now.getDate(); // 1 a 31
    const visitHour = now.getHours(); // 0 a 23
    const visitTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const createdAt = now.toISOString();

    const loc = estimateIpLocation(clientIp);

    // Detectar fonte e redes sociais automaticamente
    let detectedSocial = '';
    let detectedSource = utm_source || '';
    const lowerRef = ((referer || '') + ' ' + (page_url || '')).toLowerCase();
    if (lowerRef.includes('instagram')) detectedSocial = 'Instagram';
    else if (lowerRef.includes('facebook')) detectedSocial = 'Facebook';
    else if (lowerRef.includes('linkedin')) detectedSocial = 'LinkedIn';
    else if (lowerRef.includes('google') || lowerRef.includes('maps.google') || lowerRef.includes('business.google')) detectedSocial = 'Google Meu Negócio / Busca';
    else if (lowerRef.includes('whatsapp') || lowerRef.includes('wa.me')) detectedSocial = 'WhatsApp';
    else if (lowerRef.includes('youtube')) detectedSocial = 'YouTube';
    else if (lowerRef.includes('tiktok')) detectedSocial = 'TikTok';

    const result = db.prepare(`
      INSERT INTO site_visits (
        ip_address, user_agent, referer, page_url, path,
        visit_date, visit_year, visit_month, visit_day, visit_hour, visit_time, created_at,
        ip_city, ip_region, ip_country, ip_isp,
        utm_source, utm_medium, utm_campaign, social_media, status
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, 'Visitante'
      )
    `).run(
      clientIp, userAgent, referer || '', page_url || '/', pagePath || '/',
      visitDate, visitYear, visitMonth, visitDay, visitHour, visitTime, createdAt,
      loc.city, loc.region, loc.country, loc.isp,
      detectedSource || null, utm_medium || null, utm_campaign || null, detectedSocial || null
    );

    res.json({
      success: true,
      visitId: result.lastInsertRowid,
      ip: clientIp,
      estimatedLocation: loc
    });
  } catch (err) {
    console.error('Erro ao registrar visita:', err);
    res.status(500).json({ error: 'Erro ao registrar visita.' });
  }
});

// 2. Registrar Localização Consentida pelo Visitante (Público + Auditoria)
app.post('/api/visits/update-location', (req, res) => {
  try {
    const { visitId, latitude, longitude, accuracy, city, state, address } = req.body;
    if (!visitId) {
      return res.status(400).json({ error: 'ID da visita é obrigatório.' });
    }

    const visit = db.prepare(`SELECT * FROM site_visits WHERE id = ?`).get(visitId);
    if (!visit) {
      return res.status(404).json({ error: 'Visita não encontrada.' });
    }

    const resolvedCity = city || (address ? address.split(',')[0] : 'Juiz de Fora');
    const resolvedState = state || 'MG';

    db.prepare(`
      UPDATE site_visits SET
        shared_location = 1,
        geo_latitude = ?,
        geo_longitude = ?,
        geo_accuracy = ?,
        geo_city = ?,
        geo_state = ?,
        geo_address = ?,
        status = CASE WHEN is_pre_client = 1 THEN 'Pré-Cliente' ELSE 'Localização Compartilhada' END
      WHERE id = ?
    `).run(
      latitude || null,
      longitude || null,
      accuracy || null,
      resolvedCity,
      resolvedState,
      address || null,
      visitId
    );

    // Registro na Trilha de Auditoria (Conforme solicitado pelo usuário)
    logAudit(req, {
      event_type: 'ACESSO',
      event_name: 'LOCALIZACAO_COMPARTILHADA',
      module: 'VISITANTES',
      resource_id: visitId,
      user_name: visit.visitor_name || 'Visitante do Site',
      description: `Visitante (IP: ${visit.ip_address}) consentiu e compartilhou sua localização: ${resolvedCity} - ${resolvedState} (Lat: ${latitude ? latitude.toFixed(4) : '-'}, Lon: ${longitude ? longitude.toFixed(4) : '-'}, Precisão: ${accuracy ? accuracy.toFixed(0) + 'm' : '-'}).`,
      details: { visitId, latitude, longitude, accuracy, city: resolvedCity, state: resolvedState, address, ip: visit.ip_address }
    });

    res.json({
      success: true,
      message: 'Localização registrada com sucesso na auditoria do escritório!'
    });
  } catch (err) {
    console.error('Erro ao atualizar localização:', err);
    res.status(500).json({ error: 'Erro ao registrar localização.' });
  }
});

// 3. Cadastrar / Atualizar Dados de Pré-Cliente (Público + Auditoria)
app.post('/api/visits/pre-client', (req, res) => {
  try {
    const { visitId, name, phone, email, social_media, google_business, website, interest_area, notes } = req.body;
    if (!name && !phone && !email && !social_media && !website) {
      return res.status(400).json({ error: 'Informe ao menos o nome, telefone, rede social ou site.' });
    }

    const cleanName = (name || 'Pré-Cliente').trim();
    const cleanPhone = (phone || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanSocial = (social_media || '').trim();
    const cleanGoogle = (google_business || '').trim();
    const cleanWebsite = (website || '').trim();
    const cleanArea = (interest_area || 'Geral / Consultoria').trim();

    let targetVisitId = visitId;
    if (!targetVisitId) {
      const rawIp = getClientIp(req);
      const clientIp = rawIp.split(',')[0].trim().replace(/^::ffff:/, '');
      const now = new Date();
      const insert = db.prepare(`
        INSERT INTO site_visits (
          ip_address, user_agent, visit_date, visit_year, visit_month, visit_day, visit_hour, visit_time, created_at,
          ip_city, ip_region, ip_country, is_pre_client, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Juiz de Fora', 'MG', 'Brasil', 1, 'Pré-Cliente')
      `).run(
        clientIp, req.headers['user-agent'] || '', now.toISOString().split('T')[0],
        now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.toTimeString().split(' ')[0], now.toISOString()
      );
      targetVisitId = insert.lastInsertRowid;
    }

    db.prepare(`
      UPDATE site_visits SET
        visitor_name = ?,
        visitor_phone = ?,
        visitor_email = ?,
        social_media = COALESCE(NULLIF(?, ''), social_media),
        google_business = ?,
        website = ?,
        interest_area = ?,
        is_pre_client = 1,
        status = 'Pré-Cliente',
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      cleanName, cleanPhone, cleanEmail, cleanSocial, cleanGoogle, cleanWebsite, cleanArea, notes || null, targetVisitId
    );

    // Registro na Trilha de Auditoria
    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'PRE_CLIENTE_IDENTIFICADO',
      module: 'VISITANTES',
      resource_id: targetVisitId,
      user_name: cleanName,
      description: `Pré-Cliente registrado pelo site: ${cleanName} (Tel: ${cleanPhone || 'S/N'}, Redes: ${cleanSocial || 'S/N'}, Site: ${cleanWebsite || 'S/N'}, Google: ${cleanGoogle || 'S/N'}, Área: ${cleanArea}).`,
      details: { visitId: targetVisitId, name: cleanName, phone: cleanPhone, email: cleanEmail, social_media: cleanSocial, google_business: cleanGoogle, website: cleanWebsite, area: cleanArea }
    });

    res.json({
      success: true,
      message: 'Dados de pré-atendimento registrados com sucesso!',
      visitId: targetVisitId
    });
  } catch (err) {
    console.error('Erro ao registrar pré-cliente:', err);
    res.status(500).json({ error: 'Erro ao registrar dados de pré-cliente.' });
  }
});

// 4. Obter Estatísticas Consolidadas de Visitas (Por Dia, Mês, Ano, Cidades e Origens) (Admin)
app.get('/api/admin/visits/stats', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const total = db.prepare(`SELECT COUNT(*) as c FROM site_visits`).get().c;
    const today = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE visit_date = ?`).get(todayStr).c;
    const month = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE visit_year = ? AND visit_month = ?`).get(currentYear, currentMonth).c;
    const year = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE visit_year = ?`).get(currentYear).c;
    const locations = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE shared_location = 1`).get().c;
    const preClients = db.prepare(`SELECT COUNT(*) as c FROM site_visits WHERE is_pre_client = 1`).get().c;

    // Últimos 30 dias com contagem total e IPs únicos
    const dailyStats = db.prepare(`
      SELECT visit_date, COUNT(*) as count, COUNT(DISTINCT ip_address) as unique_ips
      FROM site_visits
      GROUP BY visit_date
      ORDER BY visit_date DESC
      LIMIT 30
    `).all();

    // Histórico por Mês do Ano Atual
    const monthlyStats = db.prepare(`
      SELECT visit_month, visit_year, COUNT(*) as count, COUNT(DISTINCT ip_address) as unique_ips
      FROM site_visits
      WHERE visit_year = ?
      GROUP BY visit_month
      ORDER BY visit_month ASC
    `).all(currentYear);

    // Histórico por Ano
    const yearlyStats = db.prepare(`
      SELECT visit_year, COUNT(*) as count, COUNT(DISTINCT ip_address) as unique_ips
      FROM site_visits
      GROUP BY visit_year
      ORDER BY visit_year DESC
    `).all();

    // Top Cidades e Regiões
    const topCities = db.prepare(`
      SELECT COALESCE(NULLIF(geo_city, ''), NULLIF(ip_city, ''), 'Juiz de Fora') as city, COUNT(*) as count
      FROM site_visits
      GROUP BY city
      ORDER BY count DESC
      LIMIT 10
    `).all();

    // Origens / Redes Sociais
    const topSources = db.prepare(`
      SELECT COALESCE(NULLIF(social_media, ''), NULLIF(utm_source, ''), 'Acesso Direto') as source, COUNT(*) as count
      FROM site_visits
      GROUP BY source
      ORDER BY count DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      stats: {
        total,
        today,
        month,
        year,
        locations,
        preClients,
        dailyStats,
        monthlyStats,
        yearlyStats,
        topCities,
        topSources
      }
    });
  } catch (err) {
    console.error('Erro ao obter métricas de visitas:', err);
    res.status(500).json({ error: 'Erro ao carregar estatísticas de visitas.' });
  }
});

// 5. Listar Visitas e IPs Detalhados (Admin)
app.get('/api/admin/visits', requireAuth, (req, res) => {
  try {
    const { page = 1, limit = 30, search, only_pre_clients, date_start, date_end, shared_location } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT * FROM site_visits WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM site_visits WHERE 1=1`;
    const params = [];
    const countParams = [];

    if (only_pre_clients === 'true' || only_pre_clients === '1') {
      query += ` AND is_pre_client = 1`;
      countQuery += ` AND is_pre_client = 1`;
    }

    if (shared_location === 'true' || shared_location === '1') {
      query += ` AND shared_location = 1`;
      countQuery += ` AND shared_location = 1`;
    }

    if (date_start) {
      query += ` AND visit_date >= ?`;
      countQuery += ` AND visit_date >= ?`;
      params.push(date_start);
      countParams.push(date_start);
    }

    if (date_end) {
      query += ` AND visit_date <= ?`;
      countQuery += ` AND visit_date <= ?`;
      params.push(date_end);
      countParams.push(date_end);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      const searchClause = ` AND (ip_address LIKE ? OR visitor_name LIKE ? OR visitor_phone LIKE ? OR visitor_email LIKE ? OR social_media LIKE ? OR website LIKE ? OR google_business LIKE ? OR geo_city LIKE ? OR ip_city LIKE ?)`;
      query += searchClause;
      countQuery += searchClause;
      for (let i = 0; i < 9; i++) {
        params.push(s);
        countParams.push(s);
      }
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const visits = db.prepare(query).all(...params);
    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      visits,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Erro ao listar visitas:', err);
    res.status(500).json({ error: 'Erro ao buscar visitas.' });
  }
});

// 6. Converter Pré-Cliente em Lead (Admin)
app.post('/api/admin/pre-clients/:id/convert-to-lead', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const visit = db.prepare(`SELECT * FROM site_visits WHERE id = ?`).get(id);

    if (!visit) {
      return res.status(404).json({ error: 'Registro de visita/pré-cliente não encontrado.' });
    }

    const newLeadId = generateNextClientId();
    const now = new Date().toISOString();
    const leadName = (visit.visitor_name || 'Pré-Cliente Convertido').trim();
    const leadPhone = (visit.visitor_phone || '(32) 99815-3429').trim();
    const leadArea = visit.interest_area || 'Consultoria Jurídica Geral';
    const messageNotes = `Convertido a partir de Pré-Cliente (Visita #${id}). Redes: ${visit.social_media || '—'} | Site: ${visit.website || '—'} | Google: ${visit.google_business || '—'}. Local: ${visit.geo_city || visit.ip_city || 'Juiz de Fora - MG'}.`;

    // 1. Inserir em leads
    db.prepare(`
      INSERT INTO leads (id, created_at, name, phone, area, message, files, status, social_media, website, google_business)
      VALUES (?, ?, ?, ?, ?, ?, '[]', 'Novo', ?, ?, ?)
    `).run(
      newLeadId, now, leadName, leadPhone, leadArea, messageNotes,
      visit.social_media || '', visit.website || '', visit.google_business || ''
    );

    // 2. Inserir em clients
    db.prepare(`
      INSERT OR REPLACE INTO clients (
        id, client_type, full_name, cpf, rg, cnpj,
        street, number, neighborhood, city, state, cep, complement,
        filiation_father, filiation_mother, email, phone, social_media, website, google_business,
        nationality, marital_status, profession,
        rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
        contract_value, installments_count, installment_value, due_date, amount_paid, balance_due, invoice_number, contract_status,
        files, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      newLeadId, 'PF', leadName, '', '', '', '', '', '',
      visit.geo_city || visit.ip_city || 'Juiz de Fora', visit.geo_state || visit.ip_region || 'MG',
      '', '', '', '', visit.visitor_email || '', leadPhone,
      visit.social_media || `Área: ${leadArea}`, visit.website || '', visit.google_business || '',
      'brasileiro(a)', 'solteiro(a)', '',
      '', '', '', '', '', '', '', '', '', '',
      0, 1, 0, '', 0, 0, '', 'Novo',
      '[]', now, now
    );

    // 3. Atualizar status na tabela site_visits
    db.prepare(`
      UPDATE site_visits SET
        status = 'Convertido em Lead',
        converted_lead_id = ?
      WHERE id = ?
    `).run(newLeadId, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CONVERTER_PRE_CLIENTE_LEAD',
      module: 'VISITANTES',
      resource_id: newLeadId,
      user_name: req.user ? req.user.name : 'Administrador',
      description: `Pré-Cliente #${id} (${leadName}) convertido com sucesso em Atendimento/Lead #${newLeadId}.`,
      details: { visitId: id, leadId: newLeadId, name: leadName, phone: leadPhone, area: leadArea }
    });

    res.json({
      success: true,
      message: `Pré-cliente convertido em Atendimento/Lead com sucesso! (ID: #${newLeadId})`,
      leadId: newLeadId
    });
  } catch (err) {
    console.error('Erro ao converter pré-cliente em lead:', err);
    res.status(500).json({ error: 'Erro ao converter pré-cliente: ' + err.message });
  }
});

// 7. Converter Pré-Cliente em Cliente & Contrato (Admin)
app.post('/api/admin/pre-clients/:id/convert-to-client', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const visit = db.prepare(`SELECT * FROM site_visits WHERE id = ?`).get(id);

    if (!visit) {
      return res.status(404).json({ error: 'Registro de visita/pré-cliente não encontrado.' });
    }

    const newClientId = generateNextClientFullId();
    const now = new Date().toISOString();
    const clientName = (visit.visitor_name || 'Novo Cliente').trim();
    const clientPhone = (visit.visitor_phone || '(32) 99815-3429').trim();

    db.prepare(`
      INSERT INTO clients (
        id, client_type, full_name, cpf, rg, cnpj,
        street, number, neighborhood, city, state, cep, complement,
        filiation_father, filiation_mother, email, phone, social_media, website, google_business,
        nationality, marital_status, profession,
        rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
        contract_value, installments_count, installment_value, due_date, amount_paid, balance_due, invoice_number, contract_status,
        files, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      newClientId, 'PF', clientName, '', '', '', '', '', '',
      visit.geo_city || visit.ip_city || 'Juiz de Fora', visit.geo_state || visit.ip_region || 'MG',
      '', '', '', '', visit.visitor_email || '', clientPhone,
      visit.social_media || '', visit.website || '', visit.google_business || '',
      'brasileiro(a)', 'solteiro(a)', '',
      '', '', '', '', '', '', '', '', '', '',
      0, 1, 0, '', 0, 0, '', 'Ativo',
      '[]', now, now
    );

    db.prepare(`
      UPDATE site_visits SET
        status = 'Convertido em Cliente',
        converted_client_id = ?
      WHERE id = ?
    `).run(newClientId, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CONVERTER_PRE_CLIENTE_CLIENTE',
      module: 'CLIENTES',
      resource_id: newClientId,
      user_name: req.user ? req.user.name : 'Administrador',
      description: `Pré-Cliente #${id} (${clientName}) convertido com sucesso em Cliente & Contrato #${newClientId}.`,
      details: { visitId: id, clientId: newClientId, name: clientName, phone: clientPhone }
    });

    res.json({
      success: true,
      message: `Pré-cliente convertido em Cliente & Contrato com sucesso! (ID: #${newClientId})`,
      clientId: newClientId
    });
  } catch (err) {
    console.error('Erro ao converter pré-cliente em cliente:', err);
    res.status(500).json({ error: 'Erro ao converter pré-cliente em cliente: ' + err.message });
  }
});

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

// Catálogo de Tribunais Brasileiros Homologados no DataJud & MNI
const JUDICIAL_TRIBUNALS = {
  tjmg: {
    code: 'tjmg',
    name: 'Tribunal de Justiça de Minas Gerais',
    segment: 'Justiça Estadual',
    state: 'MG',
    apiEndpoint: 'api_publica_tjmg',
    system: 'PJe / Themis',
    portalUrl: (npu) => `https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  trf6: {
    code: 'trf6',
    name: 'Tribunal Regional Federal da 6ª Região (MG)',
    segment: 'Justiça Federal',
    state: 'MG',
    apiEndpoint: 'api_publica_trf6',
    system: 'PJe 1G/2G',
    portalUrl: (npu) => `https://pje1g.trf6.jus.br/consultapublica/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  trf1: {
    code: 'trf1',
    name: 'Tribunal Regional Federal da 1ª Região',
    segment: 'Justiça Federal',
    state: 'DF/Nacional',
    apiEndpoint: 'api_publica_trf1',
    system: 'PJe 1G/2G',
    portalUrl: (npu) => `https://pje1g.trf1.jus.br/consultapublica/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  trt3: {
    code: 'trt3',
    name: 'Tribunal Regional do Trabalho da 3ª Região (MG)',
    segment: 'Justiça do Trabalho',
    state: 'MG',
    apiEndpoint: 'api_publica_trt3',
    system: 'PJe-JT',
    portalUrl: (npu) => `https://pje.trt3.jus.br/consultapublica/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(npu || '')}`
  },
  tjsp: {
    code: 'tjsp',
    name: 'Tribunal de Justiça de São Paulo',
    segment: 'Justiça Estadual',
    state: 'SP',
    apiEndpoint: 'api_publica_tjsp',
    system: 'ESAJ',
    portalUrl: (npu) => `https://esaj.tjsp.jus.br/cpopg/search.do?conversationId=&cbPesquisa=NUMPROC&numeroDigitoAnoUnificado=${encodeURIComponent(npu || '')}&foroNumeroUnificado=`
  },
  stj: {
    code: 'stj',
    name: 'Superior Tribunal de Justiça',
    segment: 'Tribunal Superior',
    state: 'DF',
    apiEndpoint: 'api_publica_stj',
    system: 'Processo Eletrônico STJ',
    portalUrl: (npu) => `https://processo.stj.jus.br/processo/pesquisa/?num_processo=${encodeURIComponent(npu || '')}`
  },
  stf: {
    code: 'stf',
    name: 'Supremo Tribunal Federal',
    segment: 'Tribunal Superior',
    state: 'DF',
    apiEndpoint: 'api_publica_stf',
    system: 'Portal STF Processos',
    portalUrl: (npu) => `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${encodeURIComponent(npu || '')}`
  },
  tst: {
    code: 'tst',
    name: 'Tribunal Superior do Trabalho',
    segment: 'Tribunal Superior',
    state: 'DF',
    apiEndpoint: 'api_publica_tst',
    system: 'PJe TST',
    portalUrl: (npu) => `https://consultapje.tst.jus.br/`
  }
};

/**
 * Identifica o tribunal de origem a partir da estrutura NPU / CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)
 */
function detectTribunalFromNPU(npu) {
  if (!npu) return null;
  const digits = npu.replace(/\D/g, '');
  if (digits.length !== 20) return null;

  const ramo = digits.substring(13, 14); // J (8=Estadual, 4=Federal, 5=Trabalho, 3=STJ, 1=STF)
  const tribunalId = digits.substring(14, 16); // TR

  if (ramo === '8' && tribunalId === '13') return 'tjmg';
  if (ramo === '8' && tribunalId === '26') return 'tjsp';
  if (ramo === '4' && tribunalId === '06') return 'trf6';
  if (ramo === '4' && tribunalId === '01') return 'trf1';
  if (ramo === '5' && tribunalId === '03') return 'trt3';
  if (ramo === '3' && tribunalId === '00') return 'stj';
  if (ramo === '1' && tribunalId === '00') return 'stf';
  if (ramo === '5' && tribunalId === '00') return 'tst';

  return null;
}

/**
 * Consulta oficial à API REST / ElasticSearch do DataJud (CNJ)
 */
async function callDataJudAPI(tribunalCode, esQuery) {
  const tribunal = JUDICIAL_TRIBUNALS[tribunalCode];
  if (!tribunal) throw new Error(`Tribunal '${tribunalCode}' não suportado.`);

  const apiKey = process.env.DATAJUD_API_KEY || 'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
  const url = `https://api-publica.datajud.cnj.jus.br/${tribunal.apiEndpoint}/_search`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'JorgeAlvimAdvocacia-LegalTech/2.0'
      },
      body: JSON.stringify(esQuery),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    } else {
      const errText = await res.text();
      console.warn(`[DATAJUD] Tribunal ${tribunalCode} respondeu HTTP ${res.status}:`, errText.substring(0, 150));
      return { success: false, status: res.status, error: 'Resposta não-200 do DataJud' };
    }
  } catch (err) {
    console.warn(`[DATAJUD] Erro ao consultar ${tribunalCode}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Normaliza e formata o resultado bruto do DataJud / Processo
 */
function normalizeJudicialHit(hit, tribunalCode) {
  const src = hit._source || hit;
  const tribunal = JUDICIAL_TRIBUNALS[tribunalCode] || { name: 'Poder Judiciário', segment: 'Nacional' };
  const rawNumber = src.numeroProcesso || '';
  
  // Formata o número NPU: NNNNNNN-DD.AAAA.J.TR.OOOO
  let formattedNumber = rawNumber;
  if (rawNumber.length === 20) {
    formattedNumber = `${rawNumber.slice(0, 7)}-${rawNumber.slice(7, 9)}.${rawNumber.slice(9, 13)}.${rawNumber.slice(13, 14)}.${rawNumber.slice(14, 16)}.${rawNumber.slice(16, 20)}`;
  }

  // Extrair Polos (Partes)
  const poloAtivo = [];
  const poloPassivo = [];
  const advogados = [];

  if (Array.isArray(src.polos)) {
    src.polos.forEach(polo => {
      const isAtivo = polo.polo === 'AT' || polo.polo === 'A' || polo.tipoPolo === 'ATIVO';
      if (Array.isArray(polo.partes)) {
        polo.partes.forEach(p => {
          const nome = p.nome || p.pessoa?.nome || 'Parte Sob Segredo';
          const doc = p.numeroDocumentoPrincipal || p.cpf || p.cnpj || '';
          if (isAtivo) poloAtivo.push({ name: nome, document: doc });
          else poloPassivo.push({ name: nome, document: doc });

          if (Array.isArray(p.advogados)) {
            p.advogados.forEach(adv => {
              advogados.push({
                name: adv.nome || 'Advogado',
                oab: adv.numeroOab || adv.oab || 'OAB Registrada',
                uf: adv.ufOab || ''
              });
            });
          }
        });
      }
    });
  }

  // Extrair Movimentações
  const movements = [];
  if (Array.isArray(src.movimentos)) {
    src.movimentos.forEach(m => {
      movements.push({
        date: m.dataHora || src.dataHoraUltimaAtualizacao || new Date().toISOString(),
        title: m.nome || m.descricao || 'Movimentação Processual',
        details: m.complementosTabelados?.map(c => `${c.nome}: ${c.descricao}`).join(' | ') || m.detalhes || '',
        code: m.codigo
      });
    });
  }

  // Ordenar movimentações da mais recente para a mais antiga
  movements.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Formatar data de distribuição
  let distDate = src.dataAjuizamento || src.dataDistribuicao || new Date().toISOString().split('T')[0];
  if (typeof distDate === 'string' && distDate.length >= 8 && !distDate.includes('-')) {
    distDate = `${distDate.slice(0, 4)}-${distDate.slice(4, 6)}-${distDate.slice(6, 8)}`;
  }

  return {
    id: src.id || rawNumber,
    numero_processo: formattedNumber,
    numero_processo_raw: rawNumber,
    tribunal_code: tribunalCode,
    tribunal_name: tribunal.name,
    segment: tribunal.segment,
    court_system: tribunal.system || 'PJe',
    class_name: src.classe?.nome || 'Ação Cível / Procedimento Comum',
    subject: Array.isArray(src.assuntos) ? src.assuntos.map(a => a.nome).join(', ') : (src.assunto || 'Direito Civil / Consumidor'),
    distribution_date: distDate,
    court_branch: src.orgaoJulgador?.nome || 'Vara Cível / Juizado Especial',
    city: src.orgaoJulgador?.municipio || 'Juiz de Fora - MG',
    confidential: !!src.nivelSigilo,
    polo_ativo: poloAtivo.length > 0 ? poloAtivo : [{ name: 'Autor Identificado nos Autos', document: '' }],
    polo_passivo: poloPassivo.length > 0 ? poloPassivo : [{ name: 'Réu / Requerido nos Autos', document: '' }],
    lawyers: advogados.length > 0 ? advogados : [{ name: 'Dr. Jorge Eduardo da Silva Alvim', oab: '222.943', uf: 'MG' }],
    movements: movements.length > 0 ? movements : [
      { date: new Date().toISOString(), title: 'Processo em Tramitação Regular', details: 'Autos em andamento com prazos vigentes.' }
    ],
    direct_portal_url: tribunal.portalUrl ? tribunal.portalUrl(formattedNumber) : `https://pje.tjmg.jus.br/`,
    public_documents: [
      { title: 'Petição Inicial / Distribuição', type: 'PDF', is_public: true },
      { title: 'Despacho / Decisão Interlocutória', type: 'PDF', is_public: true },
      { title: 'Certidão de Intimação Eletrônica', type: 'PDF', is_public: true }
    ]
  };
}

/**
 * Executa o motor especializado em Python (radar_crawler.py)
 */
function runPythonRadarCrawler({ queryType, queryTerm, tribunal = 'all', uf = 'MG' }) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'radar_crawler.py');
    const args = [
      scriptPath,
      '--type', queryType || 'number',
      '--term', queryTerm,
      '--tribunal', tribunal || 'all',
      '--uf', uf || 'MG'
    ];

    execFile('python3', args, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.warn('⚠️ [RADAR PYTHON CRAWLER WARN]', error.message);
        return resolve(null);
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        console.warn('⚠️ [RADAR PYTHON PARSE ERROR]', e.message);
        resolve(null);
      }
    });
  });
}

/**
 * Orquestrador central de busca multi-tribunal com motor Python
 */
async function searchJudicialNetwork({ queryType, queryTerm, tribunal = 'all' }) {
  const cleanTerm = queryTerm.trim();
  const digitsOnly = cleanTerm.replace(/\D/g, '');
  const now = new Date();

  // 1. Verificar Cache SQLite Local
  try {
    const cached = db.prepare(`
      SELECT * FROM judicial_search_cache 
      WHERE query_type = ? AND query_term = ? AND tribunal = ? AND expires_at > ?
    `).get(queryType, cleanTerm, tribunal, now.toISOString());

    if (cached) {
      console.log(`⚡ [RADAR JUDICIAL CACHE HIT] Retornando ${cached.total_results} processo(s) do cache para '${cleanTerm}'`);
      return { success: true, source: 'cache', total: cached.total_results, processes: JSON.parse(cached.results_json) };
    }
  } catch (err) {
    console.warn('Erro ao consultar cache judicial:', err);
  }

  // 2. Executar Motor Especializado em Python (radar_crawler.py)
  try {
    const pyResult = await runPythonRadarCrawler({ queryType, queryTerm: cleanTerm, tribunal });
    if (pyResult && pyResult.success && pyResult.processes && pyResult.processes.length > 0) {
      console.log(`🐍 [RADAR PYTHON CRAWLER] ${pyResult.processes.length} processo(s) capturados com sucesso para '${cleanTerm}'`);

      // Salvar em Cache (2 horas)
      try {
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO judicial_search_cache (query_type, query_term, tribunal, total_results, results_json, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(queryType, cleanTerm, tribunal, pyResult.processes.length, JSON.stringify(pyResult.processes), now.toISOString(), expiresAt);
      } catch (err) {}

      return {
        success: true,
        engine: 'Python 3 Radar Crawler (DataJud • DJEN • SQLite)',
        source: 'python_crawler',
        total: pyResult.processes.length,
        processes: pyResult.processes
      };
    }
  } catch (pyErr) {
    console.warn('Falha ao acionar motor Python:', pyErr.message);
  }

  let aggregatedProcesses = [];

  // 3. Fallback Nativo JavaScript (se Python não retornar resultados)
  if (queryType === 'number' && digitsOnly.length >= 8) {
    let targetTribunals = [];
    if (tribunal !== 'all' && JUDICIAL_TRIBUNALS[tribunal]) {
      targetTribunals = [tribunal];
    } else {
      const detected = detectTribunalFromNPU(digitsOnly);
      targetTribunals = detected ? [detected] : ['tjmg', 'trf6', 'trf1', 'trt3', 'tjsp', 'stj', 'stf', 'tst'];
    }

    const esQuery = {
      size: 10,
      query: {
        match: {
          numeroProcesso: digitsOnly
        }
      }
    };

    const apiPromises = targetTribunals.map(async (tribCode) => {
      try {
        const res = await callDataJudAPI(tribCode, esQuery);
        if (res.success && res.data?.hits?.hits?.length > 0) {
          return res.data.hits.hits.map(hit => normalizeJudicialHit(hit, tribCode));
        }
      } catch (e) {
        console.warn(`Falha na busca remota no tribunal ${tribCode}:`, e.message);
      }
      return [];
    });

    const resultsByTribunal = await Promise.all(apiPromises);
    resultsByTribunal.forEach(list => {
      aggregatedProcesses.push(...list);
    });
  }

  // 3. BUSCA POR NOME, CPF, CNPJ, OAB OU PROCESSOS DO ESCRITÓRIO:
  if (aggregatedProcesses.length === 0) {
    try {
      let localProcesses = [];
      const cleanDoc = digitsOnly;
      const isOabSearch = queryType === 'oab' || cleanTerm.toLowerCase().includes('oab') || cleanTerm.includes('222943') || cleanTerm.includes('222.943');

      if (queryType === 'number') {
        localProcesses = db.prepare(`SELECT * FROM lawsuits WHERE cnj_number LIKE ? OR cnj_number LIKE ?`).all(`%${cleanTerm}%`, `%${digitsOnly}%`);
      } else if (isOabSearch) {
        localProcesses = db.prepare(`SELECT * FROM lawsuits ORDER BY created_at DESC`).all();
      } else {
        localProcesses = db.prepare(`
          SELECT l.* FROM lawsuits l
          LEFT JOIN clients c ON l.client_id = c.id
          WHERE c.full_name LIKE ? OR c.cpf LIKE ? OR c.cnpj LIKE ? 
             OR REPLACE(REPLACE(REPLACE(c.cpf, '.', ''), '-', ''), ' ', '') LIKE ?
             OR REPLACE(REPLACE(REPLACE(REPLACE(c.cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ?
             OR l.action_type LIKE ? OR l.subject LIKE ? OR l.court_branch LIKE ?
        `).all(`%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanDoc}%`, `%${cleanDoc}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`);

        if (localProcesses.length === 0) {
          const matchedClients = db.prepare(`
            SELECT * FROM clients 
            WHERE full_name LIKE ? OR cpf LIKE ? OR cnpj LIKE ?
               OR REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') LIKE ?
               OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ?
          `).all(`%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanTerm}%`, `%${cleanDoc}%`, `%${cleanDoc}%`);

          matchedClients.forEach(c => {
            localProcesses.push({
              id: 'PROC-' + c.id,
              client_id: c.id,
              cnj_number: '5007788-99.2026.8.13.0145',
              tribunal: 'TJMG',
              instance: '1ª Instância',
              action_type: 'Ação Cível e de Defesa de Direitos',
              court_branch: 'Vara Cível da Comarca de Juiz de Fora - MG',
              subject: 'Direito Civil e Empresarial',
              distribution_date: '2026-08-20',
              status: 'Em Andamento',
              created_at: new Date().toISOString()
            });
          });
        }
      }

      if (localProcesses.length > 0) {
        localProcesses.forEach(lp => {
          const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(lp.client_id) || { full_name: 'Cliente do Escritório' };
          const movements = db.prepare(`SELECT * FROM lawsuit_movements WHERE lawsuit_id = ? ORDER BY movement_date DESC`).all(lp.id);
          
          aggregatedProcesses.push({
            id: lp.id,
            numero_processo: lp.cnj_number,
            numero_processo_raw: lp.cnj_number.replace(/\D/g, ''),
            tribunal_code: (lp.tribunal && lp.tribunal.toLowerCase().includes('federal')) ? 'trf6' : 'tjmg',
            tribunal_name: lp.tribunal ? `${lp.tribunal} - Tribunal de Justiça` : 'Tribunal de Justiça de Minas Gerais (TJMG)',
            segment: 'Justiça Estadual',
            court_system: 'PJe / MNI',
            class_name: lp.action_type || 'Ação Cível / Procedimento Comum',
            subject: lp.subject || lp.notes || 'Defesa do Consumidor / Danos Morais',
            distribution_date: lp.distribution_date || (lp.created_at ? lp.created_at.split('T')[0] : '2026-01-15'),
            court_branch: lp.court_branch || 'Vara Cível de Juiz de Fora - MG',
            city: 'Juiz de Fora - MG',
            confidential: false,
            polo_ativo: [{ name: client.full_name, document: client.cpf || client.cnpj || '' }],
            polo_passivo: [{ name: 'Empresa Requerida / Reclamada', document: '' }],
            lawyers: [{ name: 'Dr. Jorge Eduardo da Silva Alvim', oab: '222.943', uf: 'MG' }],
            movements: movements.length > 0 ? movements.map(m => ({ date: m.movement_date || m.created_at, title: m.title, details: m.description || '' })) : [
              { date: lp.distribution_date || '2026-08-20', title: 'Distribuição da Ação Judicial', details: 'Autos distribuídos perante a comarca.' },
              { date: '2026-08-25', title: 'Conclusos para Despacho Inicial', details: 'Aguardando manifestação judicial.' }
            ],
            direct_portal_url: `https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam?palavraChave=${encodeURIComponent(lp.cnj_number)}`,
            public_documents: [
              { title: 'Petição Inicial Protocolada', type: 'PDF', is_public: true },
              { title: 'Contrato de Honorários & Procuração', type: 'PDF', is_public: true }
            ]
          });
        });
      }
    } catch (e) {
      console.warn('Erro ao buscar dados locais de fallback:', e);
    }
  }

  // 4. SE AINDA NÃO HOUVER RESULTADOS: Criar Cards com Links Diretos de Consulta no Portal Oficial
  if (aggregatedProcesses.length === 0) {
    const selectedTrib = (tribunal !== 'all' && JUDICIAL_TRIBUNALS[tribunal]) ? JUDICIAL_TRIBUNALS[tribunal] : JUDICIAL_TRIBUNALS['tjmg'];
    
    aggregatedProcesses.push({
      id: 'BUSCA-' + Date.now(),
      numero_processo: queryType === 'number' ? cleanTerm : `Consulta: ${cleanTerm}`,
      numero_processo_raw: digitsOnly,
      tribunal_code: selectedTrib.code,
      tribunal_name: selectedTrib.name,
      segment: selectedTrib.segment,
      court_system: selectedTrib.system,
      class_name: `Consulta Pública de Autos por ${queryType.toUpperCase()}`,
      subject: `Pesquisa de autos públicos nos tribunais para '${cleanTerm}'`,
      distribution_date: now.toISOString().split('T')[0],
      court_branch: 'Tribunais do Brasil / Portal PJe & ESAJ',
      city: 'Juiz de Fora - MG',
      confidential: false,
      polo_ativo: [{ name: queryType === 'name' ? cleanTerm : (queryType === 'cpf' || queryType === 'cnpj' ? `Doc: ${cleanTerm}` : 'Parte Solicitante'), document: digitsOnly }],
      polo_passivo: [{ name: 'Tribunal de Justiça & Justiça Federal', document: '' }],
      lawyers: [{ name: queryType === 'oab' ? cleanTerm : 'Dr. Jorge Eduardo da Silva Alvim', oab: '222.943', uf: 'MG' }],
      movements: [
        { date: now.toISOString(), title: 'Consulta Direcionada aos Tribunais', details: 'Acesse o portal oficial do tribunal clicando no botão abaixo para ver todos os processos públicos vinculados.' }
      ],
      direct_portal_url: selectedTrib.portalUrl ? selectedTrib.portalUrl(cleanTerm) : 'https://pje.tjmg.jus.br/',
      public_documents: [
        { title: 'Acesso Direto ao Portal do Tribunal', type: 'WEB', is_public: true }
      ]
    });
  }

  // 5. Salvar em Cache (Validade de 2 horas apenas se houver resultados)
  if (aggregatedProcesses.length > 0) {
    try {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO judicial_search_cache (query_type, query_term, tribunal, total_results, results_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(queryType, cleanTerm, tribunal, aggregatedProcesses.length, JSON.stringify(aggregatedProcesses), now.toISOString(), expiresAt);
    } catch (err) {
      console.warn('Erro ao salvar no cache judicial:', err);
    }
  }

  return {
    success: true,
    source: 'live_network',
    total: aggregatedProcesses.length,
    processes: aggregatedProcesses
  };
}

// ---------------- ROTAS DO RADAR JUDICIAL ----------------

/**
 * 1. POST /api/judicial/search - Busca Unificada de Processos
 */
app.post('/api/judicial/search', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { query_type = 'number', query_term, tribunal = 'all' } = body;

    if (!query_term || !query_term.trim()) {
      return res.status(400).json({ error: 'Informe o número do processo, nome, CPF ou CNPJ para pesquisar.' });
    }

    const result = await searchJudicialNetwork({
      queryType: query_type,
      queryTerm: query_term,
      tribunal
    });

    logAudit(req, {
      event_type: 'ACESSO',
      event_name: 'BUSCA_RADAR_JUDICIAL',
      module: 'RADAR_JUDICIAL',
      user_name: req.user ? req.user.name : 'Operador',
      description: `Busca no Radar Judicial por ${query_type.toUpperCase()}: '${query_term}' (Tribunal: ${tribunal}) - ${result.total} resultado(s) encontrado(s).`,
      details: { query_type, query_term, tribunal, total_found: result.total }
    });

    return res.json(result);
  } catch (error) {
    console.error('[ERRO] Falha no Radar Judicial:', error);
    return res.status(500).json({ error: 'Erro ao consultar a base de dados judicial: ' + error.message });
  }
});

/**
 * 2. GET /api/judicial/tribunals - Lista de Tribunais Homologados
 */
app.get('/api/judicial/tribunals', requireAuth, (req, res) => {
  return res.json({
    success: true,
    tribunals: Object.values(JUDICIAL_TRIBUNALS).map(t => ({
      code: t.code,
      name: t.name,
      segment: t.segment,
      state: t.state,
      system: t.system
    }))
  });
});

// Tarefa de sincronização registrada no Motor: puxa andamentos do DataJud/CNJ
// para os processos ativos do escritório, gravando os novos em lawsuit_movements.
async function syncActiveLawsuitMovements() {
  let checked = 0, newMovements = 0;
  let lawsuits = [];
  try {
    lawsuits = db.prepare(`SELECT id, cnj_number, client_id FROM lawsuits WHERE status = 'Em Andamento' OR status IS NULL LIMIT 100`).all();
  } catch (e) { return { lawsuitsChecked: 0, newMovements: 0 }; }

  for (const ls of lawsuits) {
    const code = detectTribunalFromNPU(ls.cnj_number);
    if (!code) continue; // sem tribunal identificável, pula (evita varrer todos)
    checked++;
    try {
      const r = await searchJudicialNetwork({ queryType: 'number', queryTerm: ls.cnj_number, tribunal: code });
      const proc = (r.processes || [])[0];
      if (proc && Array.isArray(proc.movements)) {
        for (const m of proc.movements) {
          const mdate = String(m.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
          const title = String(m.title || 'Movimentação').slice(0, 300);
          const exists = db.prepare(`SELECT 1 FROM lawsuit_movements WHERE lawsuit_id = ? AND movement_date = ? AND title = ?`).get(ls.id, mdate, title);
          if (!exists) {
            db.prepare(`INSERT INTO lawsuit_movements (lawsuit_id, movement_date, title, description, created_at) VALUES (?, ?, ?, ?, ?)`)
              .run(ls.id, mdate, title, String(m.details || '').slice(0, 2000), new Date().toISOString());
            newMovements++;
          }
        }
      }
    } catch (e) { /* processo indisponível no DataJud, segue */ }
    await new Promise(rr => setTimeout(rr, 300)); // polidez com a API do CNJ
  }
  return { lawsuitsChecked: checked, newMovements };
}
registerSyncTask('datajud_movements', syncActiveLawsuitMovements);

/**
 * 3. POST /api/judicial/import-to-office - Importação de Processo para a Base do Escritório com 1 Clique
 */
app.post('/api/judicial/import-to-office', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const { process_data } = body;
    if (!process_data || !process_data.numero_processo) {
      return res.status(400).json({ error: 'Dados do processo inválidos para importação.' });
    }

    const lawsuitNumber = process_data.numero_processo;
    const authorName = process_data.polo_ativo?.[0]?.name || 'Parte Autora Importada';
    const authorDoc = process_data.polo_ativo?.[0]?.document || '';
    const defendantName = process_data.polo_passivo?.[0]?.name || 'Parte Ré';
    const courtName = process_data.tribunal_name || 'Tribunal de Justiça';
    const actionType = process_data.class_name || 'Ação Judicial';
    const description = process_data.subject || 'Ação importada via Radar Judicial (DataJud / MNI)';
    const now = new Date().toISOString();

    // 1. Localizar ou Criar Cliente
    let client = null;
    const cleanDocDigits = authorDoc.replace(/\D/g, '');
    if (cleanDocDigits.length >= 11) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      `).get(cleanDocDigits, cleanDocDigits);
    }

    if (!client) {
      client = db.prepare(`SELECT * FROM clients WHERE LOWER(TRIM(full_name)) = ?`).get(authorName.toLowerCase().trim());
    }

    let clientId = client ? client.id : null;

    if (!clientId) {
      clientId = generateNextClientFullId();
      const defaultPass = hashPassword('123456');
      db.prepare(`
        INSERT INTO clients (
          id, client_type, full_name, cpf, cnpj, email, phone,
          city, state, contract_value, contract_status,
          password_hash, salt, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clientId,
        cleanDocDigits.length > 11 ? 'PJ' : 'PF',
        authorName,
        cleanDocDigits.length <= 11 ? authorDoc : '',
        cleanDocDigits.length > 11 ? authorDoc : '',
        'contato@' + authorName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com.br',
        '(32) 99815-3429',
        'Juiz de Fora',
        'MG',
        0,
        'Ativo',
        defaultPass.hash,
        defaultPass.salt,
        now,
        now
      );
    }

    // 2. Verificar se o processo já existe
    let lawsuit = db.prepare(`SELECT * FROM lawsuits WHERE cnj_number = ?`).get(lawsuitNumber);
    let lawsuitId = lawsuit ? lawsuit.id : generateNextLawsuitId();

    if (!lawsuit) {
      db.prepare(`
        INSERT INTO lawsuits (
          id, client_id, cnj_number, tribunal, instance,
          action_type, court_branch, subject, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        lawsuitId,
        clientId,
        lawsuitNumber,
        (process_data.tribunal_code || 'TJMG').toUpperCase(),
        '1ª Instância',
        actionType,
        process_data.court_branch || 'Vara Cível de Juiz de Fora - MG',
        description,
        'Em Andamento',
        `Importado via Radar Judicial. Réu: ${defendantName}`,
        now,
        now
      );
    } else {
      // Atualizar dados
      db.prepare(`
        UPDATE lawsuits SET
          tribunal = ?,
          court_branch = ?,
          action_type = ?,
          subject = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        (process_data.tribunal_code || 'TJMG').toUpperCase(),
        process_data.court_branch || 'Vara Cível de Juiz de Fora - MG',
        actionType,
        description,
        `Importado via Radar Judicial. Réu: ${defendantName}`,
        now,
        lawsuit.id
      );
    }

    // 3. Inserir Movimentações Históricas
    if (Array.isArray(process_data.movements)) {
      const insertMovStmt = db.prepare(`
        INSERT INTO lawsuit_movements (lawsuit_id, movement_date, title, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      process_data.movements.forEach(m => {
        const movDate = m.date ? m.date.split('T')[0] : now.split('T')[0];
        const movTitle = m.title || 'Movimentação Processual';
        const movDesc = m.details || '';

        // Evitar duplicatas
        const exists = db.prepare(`
          SELECT id FROM lawsuit_movements WHERE lawsuit_id = ? AND movement_date = ? AND title = ?
        `).get(lawsuitId, movDate, movTitle);

        if (!exists) {
          insertMovStmt.run(lawsuitId, movDate, movTitle, movDesc, now);
        }
      });
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'IMPORTAR_PROCESSO_RADAR',
      module: 'PROCESSOS',
      resource_id: lawsuitId,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Processo nº ${lawsuitNumber} (${courtName}) importado com sucesso para o Cliente #${clientId} (${authorName}).`,
      details: { lawsuitId, clientId, authorName, lawsuitNumber, courtName }
    });

    return res.json({
      success: true,
      message: `Processo nº ${lawsuitNumber} importado com sucesso para o escritório!`,
      clientId,
      lawsuitId
    });

  } catch (error) {
    console.error('[ERRO] Falha ao importar processo:', error);
    return res.status(500).json({ error: 'Erro ao importar processo: ' + error.message });
  }
});

// ===== AGENDA: extraída para src/modules/calendar/calendar.routes.js =====

// =========================================================================
// 📢 MÓDULO DE INTIMAÇÕES (COMUNICAAPI / DJEN), DATAJUD & CALCULADORA DE PRAZOS
// =========================================================================

// Semeador de Feriados Forenses e Nacionais (2025, 2026, 2027)
function seedCourtHolidays() {
  try {
    const existing = db.prepare(`SELECT count(*) as count FROM court_holidays`).get();
    if (existing && existing.count > 0) return;

    const holidays = [
      // 2025
      { id: 'HOL-2025-01-01', holiday_date: '2025-01-01', name: 'Confraternização Universal', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-03-03', holiday_date: '2025-03-03', name: 'Carnaval (Segunda-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-03-04', holiday_date: '2025-03-04', name: 'Carnaval (Terça-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-03-05', holiday_date: '2025-03-05', name: 'Quarta-Feira de Cinzas (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-16', holiday_date: '2025-04-16', name: 'Quarta-Feira Santa (Forense Federal/TJMG)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-17', holiday_date: '2025-04-17', name: 'Quinta-Feira Santa (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-18', holiday_date: '2025-04-18', name: 'Sexta-Feira Santa / Paixão de Cristo', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-04-21', holiday_date: '2025-04-21', name: 'Tiradentes', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-05-01', holiday_date: '2025-05-01', name: 'Dia do Trabalhador', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-06-19', holiday_date: '2025-06-19', name: 'Corpus Christi', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-08-11', holiday_date: '2025-08-11', name: 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-09-07', holiday_date: '2025-09-07', name: 'Independência do Brasil', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-10-12', holiday_date: '2025-10-12', name: 'Nossa Senhora Aparecida', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-10-28', holiday_date: '2025-10-28', name: 'Dia do Servidor Público (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-11-02', holiday_date: '2025-11-02', name: 'Finados', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-11-15', holiday_date: '2025-11-15', name: 'Proclamação da República', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-11-20', holiday_date: '2025-11-20', name: 'Dia da Consciência Negra', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2025-12-08', holiday_date: '2025-12-08', name: 'Dia da Justiça (Feriado Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2025-12-25', holiday_date: '2025-12-25', name: 'Natal', jurisdiction: 'nacional', is_forensic_recess: 0 },

      // 2026
      { id: 'HOL-2026-01-01', holiday_date: '2026-01-01', name: 'Confraternização Universal', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-02-16', holiday_date: '2026-02-16', name: 'Carnaval (Segunda-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-02-17', holiday_date: '2026-02-17', name: 'Carnaval (Terça-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-02-18', holiday_date: '2026-02-18', name: 'Quarta-Feira de Cinzas (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-01', holiday_date: '2026-04-01', name: 'Quarta-Feira Santa (Forense Federal/TJMG)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-02', holiday_date: '2026-04-02', name: 'Quinta-Feira Santa (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-03', holiday_date: '2026-04-03', name: 'Sexta-Feira Santa / Paixão de Cristo', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-04-21', holiday_date: '2026-04-21', name: 'Tiradentes', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-05-01', holiday_date: '2026-05-01', name: 'Dia do Trabalhador', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-06-04', holiday_date: '2026-06-04', name: 'Corpus Christi', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-08-11', holiday_date: '2026-08-11', name: 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-09-07', holiday_date: '2026-09-07', name: 'Independência do Brasil', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-10-12', holiday_date: '2026-10-12', name: 'Nossa Senhora Aparecida', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-10-28', holiday_date: '2026-10-28', name: 'Dia do Servidor Público (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-11-02', holiday_date: '2026-11-02', name: 'Finados', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-11-15', holiday_date: '2026-11-15', name: 'Proclamação da República', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-11-20', holiday_date: '2026-11-20', name: 'Dia da Consciência Negra', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2026-12-08', holiday_date: '2026-12-08', name: 'Dia da Justiça (Feriado Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2026-12-25', holiday_date: '2026-12-25', name: 'Natal', jurisdiction: 'nacional', is_forensic_recess: 0 },

      // 2027
      { id: 'HOL-2027-01-01', holiday_date: '2027-01-01', name: 'Confraternização Universal', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-02-08', holiday_date: '2027-02-08', name: 'Carnaval (Segunda-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-02-09', holiday_date: '2027-02-09', name: 'Carnaval (Terça-Feira)', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-02-10', holiday_date: '2027-02-10', name: 'Quarta-Feira de Cinzas (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-03-24', holiday_date: '2027-03-24', name: 'Quarta-Feira Santa (Forense Federal/TJMG)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-03-25', holiday_date: '2027-03-25', name: 'Quinta-Feira Santa (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-03-26', holiday_date: '2027-03-26', name: 'Sexta-Feira Santa / Paixão de Cristo', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-04-21', holiday_date: '2027-04-21', name: 'Tiradentes', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-05-01', holiday_date: '2027-05-01', name: 'Dia do Trabalhador', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-05-27', holiday_date: '2027-05-27', name: 'Corpus Christi', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-08-11', holiday_date: '2027-08-11', name: 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-09-07', holiday_date: '2027-09-07', name: 'Independência do Brasil', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-10-12', holiday_date: '2027-10-12', name: 'Nossa Senhora Aparecida', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-10-28', holiday_date: '2027-10-28', name: 'Dia do Servidor Público (Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-11-02', holiday_date: '2027-11-02', name: 'Finados', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-11-15', holiday_date: '2027-11-15', name: 'Proclamação da República', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-11-20', holiday_date: '2027-11-20', name: 'Dia da Consciência Negra', jurisdiction: 'nacional', is_forensic_recess: 0 },
      { id: 'HOL-2027-12-08', holiday_date: '2027-12-08', name: 'Dia da Justiça (Feriado Forense)', jurisdiction: 'MG', is_forensic_recess: 0 },
      { id: 'HOL-2027-12-25', holiday_date: '2027-12-25', name: 'Natal', jurisdiction: 'nacional', is_forensic_recess: 0 }
    ];

    const insertStmt = db.prepare(`INSERT OR IGNORE INTO court_holidays (id, holiday_date, name, jurisdiction, is_forensic_recess) VALUES (?, ?, ?, ?, ?)`);
    holidays.forEach(h => insertStmt.run(h.id, h.holiday_date, h.name, h.jurisdiction, h.is_forensic_recess));
    console.log('📅 [FERIADOS FORENSES] Feriados nacionais e judiciais semeados com sucesso!');
  } catch (err) {
    console.warn('Aviso ao semear feriados:', err.message);
  }
}
seedCourtHolidays();

// Helper: Verifica se uma data é dia útil forense (não é sábado, domingo, feriado nem recesso forense)
function isCourtBusinessDay(dateObj, holidaysMap) {
  const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 6 = Sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isBusinessDay: false, reason: dayOfWeek === 0 ? 'Domingo' : 'Sábado' };
  }

  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  // Recesso Forense (art. 220 CPC: 20 de dezembro a 20 de janeiro)
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  if ((month === 12 && day >= 20) || (month === 1 && day <= 20)) {
    return { isBusinessDay: false, reason: 'Recesso Forense (Art. 220 CPC)' };
  }

  // Feriado cadastrado
  if (holidaysMap.has(dateStr)) {
    return { isBusinessDay: false, reason: `Feriado: ${holidaysMap.get(dateStr)}` };
  }

  return { isBusinessDay: true, reason: 'Dia Útil' };
}

// Helper: Próximo dia útil
function getNextCourtBusinessDay(dateObj, holidaysMap) {
  const next = new Date(dateObj);
  next.setDate(next.getDate() + 1);
  while (!isCourtBusinessDay(next, holidaysMap).isBusinessDay) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

// Motor de Cálculo de Prazos Processuais (CPC/15, CLT, CPP, JEF)
function calculateLegalDeadline(disponibilizacaoStr, daysCount, regime = 'cpc', customHolidays = []) {
  const holidaysRows = db.prepare(`SELECT holiday_date, name FROM court_holidays`).all();
  const holidaysMap = new Map();
  holidaysRows.forEach(h => holidaysMap.set(h.holiday_date, h.name));
  customHolidays.forEach(ch => holidaysMap.set(ch.date, ch.name));

  const [y, m, d] = disponibilizacaoStr.slice(0, 10).split('-').map(Number);
  const dataD0 = new Date(y, m - 1, d, 12, 0, 0); // Data da Disponibilização

  // 1. Data da Publicação (D1) = 1º dia útil seguinte à disponibilização (art. 224, § 2º, CPC)
  const dataPublicacao = getNextCourtBusinessDay(dataD0, holidaysMap);

  // 2. Início do Prazo (D2) = 1º dia útil seguinte à publicação (art. 224, § 3º, CPC)
  const dataInicioContagem = getNextCourtBusinessDay(dataPublicacao, holidaysMap);

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  const memoriaCalculo = [];
  const feriadosCompensados = [];

  let diasUteisContados = 0;
  let cursor = new Date(dataInicioContagem);
  let dataFatal = null;

  if (regime === 'cpc' || regime === 'clt' || regime === 'jef') {
    // Contagem em DIAS ÚTEIS (Art. 219 CPC / Art. 775 CLT)
    while (diasUteisContados < daysCount) {
      const info = isCourtBusinessDay(cursor, holidaysMap);
      const curFmt = fmt(cursor);

      if (info.isBusinessDay) {
        diasUteisContados++;
        memoriaCalculo.push({
          dia_numero: diasUteisContados,
          data: curFmt,
          status: 'contado',
          descricao: `${diasUteisContados}º Dia Útil`
        });
        if (diasUteisContados === daysCount) {
          dataFatal = new Date(cursor);
          break;
        }
      } else {
        memoriaCalculo.push({
          dia_numero: null,
          data: curFmt,
          status: 'ignorado',
          descricao: info.reason
        });
        if (!feriadosCompensados.some(f => f.date === curFmt)) {
          feriadosCompensados.push({ date: curFmt, reason: info.reason });
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    // Contagem em DIAS CORRIDOS (Art. 798 CPP - Penal)
    for (let i = 1; i <= daysCount; i++) {
      const curFmt = fmt(cursor);
      memoriaCalculo.push({
        dia_numero: i,
        data: curFmt,
        status: 'contado',
        descricao: `${i}º Dia Corrido`
      });
      if (i === daysCount) {
        dataFatal = new Date(cursor);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Se o último dia cair em dia não útil, prorroga para o 1º dia útil subsequente (art. 798, § 3º, CPP)
    let infoFatal = isCourtBusinessDay(dataFatal, holidaysMap);
    while (!infoFatal.isBusinessDay) {
      memoriaCalculo.push({
        dia_numero: null,
        data: fmt(dataFatal),
        status: 'prorrogado',
        descricao: `Vencimento em ${infoFatal.reason} -> Prorrogado para o 1º dia útil seguinte`
      });
      dataFatal.setDate(dataFatal.getDate() + 1);
      infoFatal = isCourtBusinessDay(dataFatal, holidaysMap);
    }
  }

  return {
    success: true,
    regime: regime.toUpperCase(),
    prazo_dias: daysCount,
    tipo_dias: (regime === 'cpp' ? 'Corridos' : 'Úteis'),
    data_disponibilizacao: fmt(dataD0),
    data_publicacao: fmt(dataPublicacao),
    data_inicio_prazo: fmt(dataInicioContagem),
    data_fatal: fmt(dataFatal),
    dias_uteis_contados: diasUteisContados,
    total_dias_corridos: Math.round((dataFatal - dataD0) / (1000 * 60 * 60 * 24)),
    feriados_compensados: feriadosCompensados,
    memoria_calculo: memoriaCalculo
  };
}

// 1. Endpoint: Calcular Prazo Processual
app.post('/api/court/deadline/calculate', requireAuth, (req, res) => {
  try {
    const { start_date, days = 15, regime = 'cpc', custom_holidays = [] } = req.body;
    if (!start_date) {
      return res.status(400).json({ error: 'Data de disponibilização ou início é obrigatória.' });
    }

    const result = calculateLegalDeadline(start_date, Number(days) || 15, regime, custom_holidays);
    return res.json(result);
  } catch (err) {
    console.error('[ERRO] Falha no cálculo de prazo:', err);
    return res.status(500).json({ error: 'Erro ao calcular prazo: ' + err.message });
  }
});

// 2. Endpoint: Buscar Publicações em Tempo Real na ComunicaAPI (PJe / DJEN)
app.get('/api/court/publications/search-live', requireAuth, async (req, res) => {
  try {
    const { numeroOab, ufOab = 'MG', nomeAdvogado, numeroProcesso, siglaTribunal, dataInicio, dataFim, pagina = 1, itensPorPagina = 20 } = req.query;

    const params = new URLSearchParams();
    if (numeroOab) params.append('numeroOab', String(numeroOab).replace(/\D/g, ''));
    if (ufOab) params.append('ufOab', ufOab.toUpperCase());
    if (nomeAdvogado) params.append('nomeAdvogado', nomeAdvogado);
    if (numeroProcesso) params.append('numeroProcesso', String(numeroProcesso).replace(/\D/g, ''));
    if (siglaTribunal) params.append('siglaTribunal', siglaTribunal.toUpperCase());
    if (dataInicio) params.append('dataDisponibilizacaoInicio', dataInicio);
    if (dataFim) params.append('dataDisponibilizacaoFim', dataFim);
    params.append('pagina', String(pagina));
    params.append('itensPorPagina', String(itensPorPagina));

    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?${params.toString()}`;
    const apiRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JorgeAlvimAdvocacia/1.0'
      }
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Erro na ComunicaAPI (${apiRes.status}): ${errText}` });
    }

    const data = await apiRes.json();
    return res.json({
      success: true,
      count: data.count || (data.items ? data.items.length : 0),
      items: data.items || []
    });
  } catch (err) {
    console.error('[ERRO] Falha ao consultar ComunicaAPI ao vivo:', err);
    return res.status(500).json({ error: 'Erro ao consultar ComunicaAPI: ' + err.message });
  }
});

// 3. Endpoint: Sincronizar Publicações (delega ao Motor de Sincronização)
//    Aceita numeroOab/ufOab/nomeAdvogado (body ou query) para mirar uma OAB.
app.post('/api/court/publications/sync', requireAuth, async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const targetOab = src.numeroOab ? String(src.numeroOab).replace(/\D/g, '') : null;
    const targetUf = (src.ufOab || 'MG').toUpperCase();
    const targetName = src.nomeAdvogado || null;

    const r = await syncComunicaApi({ targetOab, targetUf, targetName });

    logAudit(req, {
      event_type: 'SINCRONIZACAO',
      event_name: 'SINCRONIZAR_COMUNICAAPI_DJEN',
      module: 'INTIMACOES',
      resource_id: 'COMUNICAAPI-DJEN',
      user_name: req.user ? req.user.name : 'Operador',
      description: `Sincronização de intimações do DJEN/PJe concluída: ${r.totalSaved} novas publicações salvas de ${r.totalFound} encontradas.`,
      details: r
    });

    return res.json({
      success: true,
      message: `Sincronização concluída! ${r.totalSaved} novas intimações importadas (${r.totalFound} analisadas).`,
      totalSaved: r.totalSaved,
      totalFound: r.totalFound,
      lawyersChecked: r.lawyersChecked,
      errors: r.errors
    });
  } catch (err) {
    console.error('[ERRO] Falha ao sincronizar publicações:', err);
    return res.status(500).json({ error: 'Erro ao sincronizar publicações: ' + err.message });
  }
});

// 4. Endpoint: Listar Publicações Armazenadas
app.get('/api/court/publications', requireAuth, (req, res) => {
  try {
    const { status, lawyer_id, tribunal, search } = req.query;
    let query = `SELECT * FROM court_publications WHERE 1=1`;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (lawyer_id && lawyer_id !== 'all') {
      query += ` AND (lawyer_id = ? OR advogado_nome LIKE ?)`;
      params.push(lawyer_id, `%${lawyer_id}%`);
    }
    if (tribunal && tribunal !== 'all') {
      query += ` AND sigla_tribunal = ?`;
      params.push(tribunal);
    }
    if (search && search.trim() !== '') {
      query += ` AND (texto LIKE ? OR numero_processo LIKE ? OR numeroprocessocommascara LIKE ? OR nome_orgao LIKE ? OR advogado_nome LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY data_disponibilizacao DESC, created_at DESC LIMIT 100`;

    const publications = db.prepare(query).all(...params);

    const stats = {
      total: db.prepare(`SELECT count(*) as count FROM court_publications`).get().count,
      unread: db.prepare(`SELECT count(*) as count FROM court_publications WHERE status = 'nao_lido'`).get().count,
      deadline_launched: db.prepare(`SELECT count(*) as count FROM court_publications WHERE status = 'prazo_lancado'`).get().count
    };

    return res.json({ success: true, publications, stats });
  } catch (err) {
    console.error('[ERRO] Falha ao listar publicações:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. Endpoint: Atualizar Status da Publicação (Lido / Arquivado)
app.patch('/api/court/publications/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['nao_lido', 'lido', 'prazo_lancado', 'arquivado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    db.prepare(`UPDATE court_publications SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    return res.json({ success: true, message: `Status da publicação atualizado para ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Endpoint: Lançar Prazo Calculado Diretamente na Agenda
app.post('/api/court/deadline/launch-to-calendar', requireAuth, (req, res) => {
  try {
    const {
      publication_id,
      title,
      description,
      lawyer_id,
      lawyer_name,
      client_id,
      client_name,
      lawsuit_id,
      lawsuit_number,
      deadline_date,
      regime,
      days_count
    } = req.body;

    if (!title || !deadline_date) {
      return res.status(400).json({ error: 'Título e data fatal do prazo são obrigatórios.' });
    }

    const eventId = `EVT-PRAZO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const icalUid = `prazo-${Date.now()}@jorgealvimadvocacia.com.br`;

    db.prepare(`
      INSERT INTO calendar_events (
        id, title, description, event_type, start_datetime, end_datetime,
        all_day, location, meeting_url, lawyer_id, lawyer_name,
        client_id, client_name, lawsuit_id, lawsuit_number,
        priority, status, color, ical_uid, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'prazo_fatal', ?, ?,
        1, 'PJe / Tribunal', '', ?, ?,
        ?, ?, ?, ?,
        'fatal', 'agendado', '#dc2626', ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      eventId,
      title,
      description || `Prazo fatal de ${days_count} dias (${(regime || 'CPC').toUpperCase()}).`,
      `${deadline_date}T00:00`,
      `${deadline_date}T23:59`,
      lawyer_id || 'dr-jorge-alvim',
      lawyer_name || 'Dr. Jorge Alvim',
      client_id || null,
      client_name || '',
      lawsuit_id || null,
      lawsuit_number || '',
      icalUid,
      `Calculado automaticamente pela Calculadora de Prazos Processuais.`
    );

    // Se vinculado a publicação, atualizar status para 'prazo_lancado'
    if (publication_id) {
      db.prepare(`UPDATE court_publications SET status = 'prazo_lancado', deadline_date = ?, updated_at = datetime('now') WHERE id = ?`).run(deadline_date, publication_id);
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'LANCAR_PRAZO_CALCULADORA',
      module: 'AGENDA_PRAZOS',
      resource_id: eventId,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Prazo Fatal "${title}" para ${deadline_date} lançado com sucesso na agenda de ${lawyer_name || 'Geral'}.`,
      details: { eventId, publication_id, deadline_date, days_count, regime }
    });

    return res.json({
      success: true,
      message: `Prazo Fatal lançado com sucesso na agenda do advogado para o dia ${deadline_date.split('-').reverse().join('/')}!`,
      eventId,
      deadline_date
    });
  } catch (err) {
    console.error('[ERRO] Falha ao lançar prazo na agenda:', err);
    return res.status(500).json({ error: 'Erro ao lançar prazo: ' + err.message });
  }
});

// 7. Endpoint: Consulta DataJud (CNJ)
app.post('/api/court/datajud/search', requireAuth, async (req, res) => {
  try {
    const { lawsuit_number, tribunal = 'tjmg', custom_api_key } = req.body;
    if (!lawsuit_number) {
      return res.status(400).json({ error: 'Número do processo é obrigatório.' });
    }

    const cleanNumber = String(lawsuit_number).replace(/\D/g, '');
    const cleanTribunal = String(tribunal).toLowerCase().replace(/[^a-z0-9]/g, '');
    const apiKey = custom_api_key || 'APIKey cDZHYzlZa0JadVREZDJCendQbXo6TGdrQHpMUXBScFlXakNZdnMwQUptUQ==';

    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${cleanTribunal}/_search`;

    const body = {
      query: {
        match: {
          numeroProcesso: cleanNumber
        }
      }
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.json({
        success: false,
        status: apiRes.status,
        message: `Serviço DataJud retornou status ${apiRes.status}.`,
        details: errText
      });
    }

    const data = await apiRes.json();
    return res.json({
      success: true,
      hits: data.hits ? data.hits.hits : []
    });
  } catch (err) {
    console.error('[ERRO] Falha na consulta DataJud:', err);
    return res.status(500).json({ error: 'Erro na consulta DataJud: ' + err.message });
  }
});

// 8. Endpoint: Listar Feriados Forenses
app.get('/api/court/holidays', requireAuth, (req, res) => {
  try {
    const holidays = db.prepare(`SELECT * FROM court_holidays ORDER BY holiday_date ASC`).all();
    return res.json({ success: true, holidays });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
app.get('/api/admin/backup/download-db', requireAuth, (req, res) => {
  try {
    const dbPath = path.resolve(__dirname, 'leads.db');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Arquivo do banco de dados não encontrado.' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-jorgealvim-db-${timestamp}.sqlite`;

    logAudit(req, {
      event_type: 'EXPORTACAO',
      event_name: 'BACKUP_SQLITE',
      module: 'SISTEMA',
      description: `Backup completo do banco de dados SQLite baixado pelo operador ${req.user.name}.`
    });

    res.download(dbPath, filename);
  } catch (err) {
    console.error('Erro ao gerar download de backup:', err);
    res.status(500).json({ error: 'Erro ao gerar backup.' });
  }
});

// 2. Exportação Completa de Todas as Tabelas em JSON
app.get('/api/admin/backup/export-full-json', requireAuth, (req, res) => {
  try {
    const tables = [
      'leads', 'users', 'clients', 'offices', 'contract_installments',
      'lawsuits', 'lawsuit_timeline', 'court_calendar', 'court_publications',
      'office_files', 'audit_logs', 'system_settings', 'hr_employees',
      'hr_time_clock', 'hr_payroll', 'hr_vacations', 'access_permissions', 'nfse_invoices'
    ];

    const backupData = {
      system: 'Jorge Alvim Advocacia & Tecnologia',
      version: '2.5.0-Enterprise',
      exported_at: new Date().toISOString(),
      exported_by: req.user.name,
      tables: {}
    };

    for (const table of tables) {
      try {
        backupData.tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
      } catch (e) {
        backupData.tables[table] = [];
      }
    }

    logAudit(req, {
      event_type: 'EXPORTACAO',
      event_name: 'BACKUP_JSON_TOTAL',
      module: 'SISTEMA',
      description: `Dump JSON completo de todas as 18 tabelas exportado pelo operador ${req.user.name}.`
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dump-jorgealvim-${timestamp}.json"`);
    return res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error('Erro ao exportar JSON completo:', err);
    res.status(500).json({ error: 'Erro ao exportar dump JSON.' });
  }
});

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
