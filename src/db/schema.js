/**
 * Esquema do banco (tabelas, índices e ajustes de colunas) — extraído do server.js (AUD-11).
 * Executa ao ser importado (efeito colateral intencional), na MESMA ordem em que rodava no server.js:
 * server.js importa este arquivo por ÚLTIMO entre os módulos, antes de subir as rotas.
 * Tudo é idempotente (IF NOT EXISTS / ALTER em try). Novas mudanças de esquema: ver AUD-09 (migrações).
 */
import crypto from 'node:crypto';
import { db } from '../config/db.js';
import { hashPassword } from '../shared/password-crypto.js';

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
// cérebros").

// SEGURANÇA (LGPD): a coluna `plain_password` guardava a senha em TEXTO PURO.
// Removemos a coluna de vez (users e access_permissions). A autenticação usa
// apenas o hash PBKDF2 — o sistema nunca deve ser capaz de revelar uma senha.
try { db.exec(`ALTER TABLE users DROP COLUMN plain_password;`); } catch (e) {}
try { db.exec(`ALTER TABLE access_permissions DROP COLUMN plain_password;`); } catch (e) {}

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
  if (!cliCols.includes('birth_date')) {
    db.exec(`ALTER TABLE clients ADD COLUMN birth_date TEXT DEFAULT NULL`);
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
  // Gestão de Leads v2: advogado responsável pelo cliente e andamento do cadastro.
  if (!cliCols.includes('responsible_lawyer_id')) {
    db.exec(`ALTER TABLE clients ADD COLUMN responsible_lawyer_id TEXT DEFAULT NULL`);
  }
  if (!cliCols.includes('responsible_lawyer_name')) {
    db.exec(`ALTER TABLE clients ADD COLUMN responsible_lawyer_name TEXT DEFAULT NULL`);
  }
  if (!cliCols.includes('registration_status')) {
    db.exec(`ALTER TABLE clients ADD COLUMN registration_status TEXT DEFAULT 'pendente'`);
  }
} catch (e) {
  console.warn('Verificação de migração de clients:', e);
}

// Gestão de Leads v2: distribuição (responsável/secretária), estágio do cadastro
// e trilha de eventos (linha do tempo) de cada lead até virar cliente.
try {
  const leadCols = db.prepare(`PRAGMA table_info(leads)`).all().map(c => c.name);
  const addLeadCol = (name, ddl) => { if (!leadCols.includes(name)) db.exec(`ALTER TABLE leads ADD COLUMN ${ddl}`); };
  addLeadCol('responsible_lawyer_id', `responsible_lawyer_id TEXT DEFAULT NULL`);
  addLeadCol('responsible_lawyer_name', `responsible_lawyer_name TEXT DEFAULT NULL`);
  addLeadCol('assigned_secretary_id', `assigned_secretary_id TEXT DEFAULT NULL`);
  addLeadCol('assigned_secretary_name', `assigned_secretary_name TEXT DEFAULT NULL`);
  // stage: recebido | distribuido | em_cadastro | falta_documento | falta_dados |
  //        aguardando_assinatura | concluido | desistiu | outros
  addLeadCol('stage', `stage TEXT DEFAULT 'recebido'`);
  addLeadCol('stage_note', `stage_note TEXT DEFAULT NULL`);
  addLeadCol('assigned_at', `assigned_at TEXT DEFAULT NULL`);
  addLeadCol('assigned_by', `assigned_by TEXT DEFAULT NULL`);
  addLeadCol('client_id', `client_id TEXT DEFAULT NULL`);
  // Dados de contato guardados no lead para promover a cliente na conclusão do cadastro.
  addLeadCol('email', `email TEXT DEFAULT NULL`);
  addLeadCol('cpf', `cpf TEXT DEFAULT NULL`);
  addLeadCol('city', `city TEXT DEFAULT NULL`);
} catch (e) {
  console.warn('Verificação de migração de leads (gestão v2):', e);
}

// Trilha de eventos do lead (linha do tempo): recebido, distribuído, mudanças de
// estágio, conclusão de cadastro, etc. Alimenta o histórico expansível na aba Leads.
db.exec(`
  CREATE TABLE IF NOT EXISTS lead_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT,
    performed_by TEXT,
    created_at TEXT NOT NULL
  );
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id)`); } catch (e) {}

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
  if (!usrCols.includes('reset_token')) {
    db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT NULL`);
  }
  if (!usrCols.includes('reset_token_expires')) {
    db.exec(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT DEFAULT NULL`);
  }
} catch (e) {}

try {
  const hrCols = db.prepare(`PRAGMA table_info(hr_employees)`).all().map(c => c.name);
  if (!hrCols.includes('email')) {
    db.exec(`ALTER TABLE hr_employees ADD COLUMN email TEXT DEFAULT NULL`);
  }
  if (!hrCols.includes('google_id')) {
    db.exec(`ALTER TABLE hr_employees ADD COLUMN google_id TEXT DEFAULT NULL`);
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
    deleted_at TEXT,
    deletion_reason TEXT,
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
    deleted_at TEXT,
    deletion_reason TEXT,
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

  -- Contratos adicionais por cliente (item ORD-MUHN47SR-I3Y): além do contrato
  -- principal (embutido na ficha do cliente), permite registrar vários contratos.
  CREATE TABLE IF NOT EXISTS client_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    title TEXT NOT NULL,
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
    email TEXT,
    google_id TEXT,
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

  const hrCols = db.prepare(`PRAGMA table_info(hr_employees)`).all().map(c => c.name);
  if (!hrCols.includes('email')) {
    db.exec(`ALTER TABLE hr_employees ADD COLUMN email TEXT DEFAULT NULL`);
  }
  if (!hrCols.includes('google_id')) {
    db.exec(`ALTER TABLE hr_employees ADD COLUMN google_id TEXT DEFAULT NULL`);
  }

  const lawCols = db.prepare(`PRAGMA table_info(lawsuits)`).all().map(c => c.name);
  if (!lawCols.includes('deleted_at')) db.exec(`ALTER TABLE lawsuits ADD COLUMN deleted_at TEXT DEFAULT NULL`);
  if (!lawCols.includes('deletion_reason')) db.exec(`ALTER TABLE lawsuits ADD COLUMN deletion_reason TEXT DEFAULT NULL`);

  const finCols = db.prepare(`PRAGMA table_info(financial_transactions)`).all().map(c => c.name);
  if (!finCols.includes('deleted_at')) db.exec(`ALTER TABLE financial_transactions ADD COLUMN deleted_at TEXT DEFAULT NULL`);
  if (!finCols.includes('deletion_reason')) db.exec(`ALTER TABLE financial_transactions ADD COLUMN deletion_reason TEXT DEFAULT NULL`);
} catch (e) {
  console.warn('Verificação de migração de colunas sociais/sites/nfse/blog/hr/soft-delete:', e);
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
        slug: 'divorcio-pensao-guarda-juiz-de-fora',
        title: 'Divórcio, Pensão Alimentícia e Guarda de Filhos em Juiz de Fora: Guia Prático',
        summary: 'Entenda como funciona o divórcio consensual e litigioso, fixação de pensão alimentícia e guarda compartilhada de filhos perante as Varas de Família de Juiz de Fora.',
        category: 'Direito de Família',
        cover_image: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=80',
        tags: 'Divórcio, Pensão Alimentícia, Guarda Compartilhada, Direito de Família, Juiz de Fora, União Estável, Partilha de Bens',
        content: `
<h2>Como Funciona o Divórcio em Cartório e Judicial em Juiz de Fora?</h2>
<p>O processo de dissolução conjugal pode ocorrer pela via extrajudicial (em Cartório de Notas) de forma rápida quando há consenso e não há filhos menores ou incapazes, ou pela via judicial (perante as Varas de Família da Comarca de Juiz de Fora no Fórum Benjamin Colucci) quando envolve menores ou litígio.</p>

<h3>Principais Temas no Direito de Família:</h3>
<ul>
  <li><strong>Divórcio Consensual e Litigioso:</strong> Dissolução do casamento com partilha justa de bens adquiridos durante a união;</li>
  <li><strong>Pensão Alimentícia:</strong> Fixação, revisão e execução de alimentos com base no binômio necessidade do alimentando e possibilidade do alimentante;</li>
  <li><strong>Guarda Compartilhada e Convivência:</strong> Definição da residência principal dos filhos e plano equilibrado de convivência familiar priorizando o melhor interesse da criança;</li>
  <li><strong>Reconhecimento e Dissolução de União Estável:</strong> Proteção patrimonial e formalização jurídica dos direitos dos conviventes.</li>
</ul>

<h3>Documentos Comuns Necessários:</h3>
<ol>
  <li>Certidão de casamento atualizada ou certidão de nascimento dos filhos;</li>
  <li>Documentos comprobatórios dos bens a serem partilhados (imóveis, veículos, contas bancárias);</li>
  <li>Comprovantes de rendimentos e despesas para fixação de pensão alimentícia;</li>
  <li>Documentos pessoais (RG, CPF e comprovante de residência atualizado).</li>
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

  // Migração idempotente: converter artigo antigo de Inventário para Direito de Família se existir
  const oldPost = db.prepare(`SELECT id FROM blog_posts WHERE slug = 'inventario-extrajudicial-cartorio-juiz-de-fora'`).get();
  if (oldPost) {
    db.prepare(`
      UPDATE blog_posts SET 
        slug = 'divorcio-pensao-guarda-juiz-de-fora',
        title = 'Divórcio, Pensão Alimentícia e Guarda de Filhos em Juiz de Fora: Guia Prático',
        summary = 'Entenda como funciona o divórcio consensual e litigioso, fixação de pensão alimentícia e guarda compartilhada de filhos perante as Varas de Família de Juiz de Fora.',
        category = 'Direito de Família',
        tags = 'Divórcio, Pensão Alimentícia, Guarda Compartilhada, Direito de Família, Juiz de Fora, União Estável, Partilha de Bens'
      WHERE id = ?
    `).run(oldPost.id);
  }

  // Garantir artigo sobre RDE e FATD (Direito Militar) de forma idempotente
  const fatdPost = db.prepare(`SELECT id FROM blog_posts WHERE slug = 'rde-e-o-fatd-apuracao-transgressoes-justificacao-recurso'`).get();
  if (!fatdPost) {
    const now = new Date().toISOString();
    const fatdContent = `<p class="lead text-lg font-medium text-slate-700 leading-relaxed">
  A manutenção da <strong>hierarquia</strong> e da <strong>disciplina</strong> é a pedra angular das Forças Armadas brasileiras. No âmbito do Exército Brasileiro, essas diretrizes são juridicamente regulamentadas pelo <strong>Decreto nº 4.346/2002</strong>, conhecido como o <strong>Regulamento Disciplinar do Exército (RDE / R-4)</strong>.
</p>

<p>
  Para comandantes, assessores jurídicos e militares em geral, entender como funciona a apuração de uma falta e como preencher corretamente o principal instrumento desse processo — o <strong>FATD (Formulário de Apuração de Transgressão Disciplinar)</strong> — é fundamental para garantir a legalidade do ato. Mas o conhecimento não deve parar na aplicação da sanção: é indispensável dominar as <strong>causas de justificação (Art. 18)</strong> e as vias de recurso administrativo para quando o direito de defesa precisar ser restabelecido com rigor técnico.
</p>

<figure class="my-6">
  <img src="/img/blog/rde-fatd-militar.jpg" alt="Infográfico ilustrativo sobre Transgressão Disciplinar, FATD e Direitos do Militar" class="w-full rounded-xl shadow-md border border-slate-200">
  <figcaption class="text-xs text-slate-500 text-center mt-2">Orientações essenciais para o correto preenchimento do FATD e preservação das garantias defensivas.</figcaption>
</figure>

<h2>1. O que é a Transgressão Disciplinar?</h2>
<p>
  De acordo com o RDE, a transgressão disciplinar é qualquer violação dos deveres e das obrigações militares que não chegue a constituir crime militar ou comum. Elas são classificadas conforme a gravidade em:
</p>
<ul>
  <li><strong>Leves</strong></li>
  <li><strong>Médias</strong></li>
  <li><strong>Graves</strong></li>
</ul>
<p>
  As punições disciplinares são aplicadas em uma escala crescente de severidade: <em>Advertência, Impedimento disciplinar, Repreensão, Detenção, Prisão disciplinar</em> e, em casos extremos, <em>Licenciamento ou Exclusão a bem da disciplina</em>.
</p>

<h2>2. O Processo de Apuração e o Papel do FATD</h2>
<div class="bg-blue-50 border-l-4 border-blue-600 p-4 my-4 rounded-r-lg">
  <p class="font-semibold text-blue-950 m-0">O FATD não é a punição em si!</p>
  <p class="text-sm text-blue-900 mt-1 m-0">Ele é o documento formal que instaura o rito administrativo investigatório, assegurando o contraditório e a ampla defesa constitucional (Art. 5º, LV da CF/88).</p>
</div>
<p>
  Sua finalidade, prevista no Anexo IV do RDE, é padronizar e registrar a apuração do fato. Quando uma suposta falta é reportada por meio de uma <strong>Parte de Transgressão</strong>, a autoridade competente emite o FATD para que o militar possa se manifestar e defender por escrito antes de qualquer tomada de decisão.
</p>
<p>
  <strong>Prazo Regulamentar:</strong> O acusado possui o prazo de <strong>3 (três) dias úteis</strong> para apresentar suas justificativas, arrolar testemunhas, requerer perícias ou pedir para ser ouvido presencialmente.
</p>

<h2>3. O Coração da Defesa: As Causas de Justificação (Art. 18)</h2>
<p>
  O momento em que o militar preenche o campo de <em>"Razões de Defesa"</em> no FATD é crucial. É aqui que devem ser invocadas com precisão as causas de justificação. Se a conduta se enquadrar em qualquer um dos incisos do <strong>Artigo 18 do RDE</strong>, <strong>não haverá punição disciplinar</strong>:
</p>
<ul>
  <li><strong>I - Prática de ação meritória ou no interesse do serviço, da ordem ou da segurança pública:</strong> Quando o ato, embora formalmente previsto como falta, foi praticado para atingir um bem maior ou cumprir uma missão urgente de segurança.</li>
  <li><strong>II - Em legítima defesa, própria ou de outrem:</strong> Quando o militar usa moderadamente dos meios necessários para repelir injusta agressão, atual ou iminente.</li>
  <li><strong>III - Em motivo de força maior ou caso fortuito, plenamente comprovado:</strong> Eventos imprevisíveis ou inevitáveis (como desastres naturais, acidentes graves ou panes mecânicas intransponíveis que impeçam o cumprimento de horário).</li>
  <li><strong>IV - Por imperiosa necessidade de culpar subordinado para evitar mal maior ou preservar a disciplina:</strong> Situações extremas de comando em que a intervenção imediata se faz estritamente necessária.</li>
  <li><strong>V - Em decorrência de cumprimento de ordem superior:</strong> Se o militar agiu estritamente cumprindo ordens diretas de seu superior hierárquico (desde que a ordem não fosse manifestamente criminosa).</li>
</ul>

<div class="bg-amber-50 border-l-4 border-amber-500 p-4 my-4 rounded-r-lg">
  <p class="font-semibold text-amber-950 m-0">⚠️ Atenção Probatória:</p>
  <p class="text-sm text-amber-900 mt-1 m-0">Não basta apenas alegar uma dessas causas. O militar deve, no próprio FATD, indicar as provas (testemunhas, documentos, fotos, laudos médicos ou perícias) que comprovem a existência da justificativa.</p>
</div>

<h2>4. O Direito ao Recurso Disciplinar: Inconformidade com a Punição</h2>
<p>
  Se, mesmo após a apresentação da defesa no FATD, a autoridade julgar a conduta como transgressão e aplicar uma sanção disciplinar, o processo não se encerra de forma definitiva. O RDE garante ao militar o direito de recorrer da decisão através de instrumentos específicos previstos a partir do Artigo 51:
</p>

<h3>A. Pedido de Reconsideração de Ato</h3>
<p>
  Antes de subir para instâncias superiores, o militar deve se dirigir à <strong>própria autoridade que aplicou a punição</strong>. O objetivo é fazer com que o próprio Comandante reavalie sua decisão diante de novos argumentos, provas técnicas ou reconsideração fática.
</p>
<p>
  <strong>Prazo:</strong> Deve ser interposto no prazo de <strong>5 (cinco) dias úteis</strong>, contados a partir do dia imediato ao que o militar tomar ciência oficial da publicação da punição em Boletim Interno (BI).
</p>

<h3>B. Recurso Disciplinar propriamente dito</h3>
<p>
  Caso o Pedido de Reconsideração de Ato seja total ou parcialmente negado, o militar pode então interpor o <strong>Recurso Disciplinar</strong>. Este recurso é encaminhado diretamente à autoridade imediatamente superior àquela que aplicou a punição (ex.: Comandante de Brigada, Comandante Militar de Área).
</p>
<p>
  <strong>Prazo:</strong> Também deve ser apresentado no prazo de <strong>5 (cinco) dias úteis</strong>, contados a partir da ciência oficial da denegação da reconsideração.
</p>

<div class="bg-slate-50 border-l-4 border-slate-600 p-4 my-4 rounded-r-lg">
  <p class="font-semibold text-slate-800 m-0">⚖️ Efeito Suspensivo vs. Efeito Devolutivo:</p>
  <p class="text-sm text-slate-600 mt-1 m-0">Como regra geral no âmbito militar, os recursos disciplinares possuem apenas efeito devolutivo — isto é, o cumprimento da punição não é automaticamente suspenso enquanto o recurso é julgado, a menos que a autoridade conceda o efeito suspensivo de forma excepcional.</p>
</div>

<h2>5. Conclusão: O Impacto Direto na Carreira Militar</h2>
<p>
  Subestimar o FATD ou abrir mão dos prazos de recurso é um erro crítico. Se a apuração resultar em punição definitiva publicada em Boletim Interno, o registro afetará diretamente a <strong>classificação de comportamento militar da praça</strong> (que varia de Mau a Excepcional), prejudicando:
</p>
<ul>
  <li>Promoções por merecimento ou antiguidade;</li>
  <li>Inscrições em cursos de formação, especialização ou aperfeiçoamento;</li>
  <li>Estabilidade e prorrogação de engajamento/reengajamento de militares temporários;</li>
  <li>Seleções para missões institucionais e comissões especiais.</li>
</ul>
<p>
  Portanto, a correta instrução do processo e o uso estratégico dos recursos legais protegem tanto a Administração Militar — mantendo seus atos estritamente imunes a nulidades judiciais — quanto o direito do militar a um julgamento justo, técnico e proporcional.
</p>`;

    db.prepare(`
      INSERT INTO blog_posts (
        slug, title, summary, category, content, cover_image, tags,
        author_name, author_oab, views_count, is_published, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `).run(
      'rde-e-o-fatd-apuracao-transgressoes-justificacao-recurso',
      'RDE e o FATD: Como Funciona a Apuração de Transgressões, as Causas de Justificação e o Direito ao Recurso',
      'A manutenção da hierarquia e da disciplina é a pedra angular das Forças Armadas. Entenda como funciona a apuração disciplinar militar pelo RDE (Decreto 4.346/02), o preenchimento do FATD, as causas de justificação do Art. 18 e o direito ao recurso.',
      'Direito Militar',
      fatdContent.trim(),
      '/img/blog/rde-fatd-militar.jpg',
      'Direito Militar, Exército Brasileiro, RDE, FATD, Transgressão Disciplinar, Recurso Disciplinar',
      'Dr. Jorge Eduardo da Silva Alvim',
      'OAB/MG 222.943',
      now,
      now,
      now
    );
    console.log('📰 [BLOG] Artigo de Direito Militar (FATD / RDE) semeado com sucesso!');
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

// Inicialização / Garantia do Usuário Mestre
// SEGURANÇA: NÃO reescrevemos a senha do mestre a cada boot (antes o hash era
// forçado para 'jorgealvim' sempre, tornando IMPOSSÍVEL trocar a senha — ela
// voltava ao padrão a cada restart). Agora: cria-se o mestre só na 1ª vez (senha
// vinda de MASTER_PASSWORD no .env ou aleatória impressa uma única vez); se já
// existe, apenas garante o papel 'master'. A troca de senha é feita pelo painel
// (PUT /api/users/:id) ou pelo script scripts/set-master-password.js e PERSISTE.
try {
  const masterCheck = db.prepare(`SELECT id FROM users WHERE username = ? OR id = ?`).get('jorgealvimtecnologia', 'USR-MASTER-01');
  if (!masterCheck) {
    const initialPw = (process.env.MASTER_PASSWORD || '').trim() || crypto.randomBytes(9).toString('base64');
    const { hash, salt } = hashPassword(initialPw);
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
    if ((process.env.MASTER_PASSWORD || '').trim()) {
      console.log('👑 [AUTH] Usuário Mestre criado com a senha definida em MASTER_PASSWORD.');
    } else {
      console.log(`👑 [AUTH] Usuário Mestre criado. Senha inicial (TROQUE JÁ): ${initialPw}`);
    }
  } else {
    // Já existe: garante apenas o papel de mestre. NUNCA toca na senha.
    db.prepare(`
      UPDATE users SET role = 'master'
      WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'
    `).run();
  }

  // SEGURANÇA (LGPD): elimina de vez a coluna de senha em texto puro, se ainda existir.
  try { db.exec(`ALTER TABLE users DROP COLUMN plain_password;`); } catch (e) {}
  try { db.exec(`ALTER TABLE access_permissions DROP COLUMN plain_password;`); } catch (e) {}
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

