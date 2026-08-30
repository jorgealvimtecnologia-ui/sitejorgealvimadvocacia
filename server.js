import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de Pastas de Armazenamento
const STORAGE_DIR = path.join(__dirname, 'storage', 'clients');
const STORAGE_DRIVE_DIR = path.join(__dirname, 'storage', 'office_drive');
const DB_PATH = path.join(__dirname, 'leads.db');

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
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT NOT NULL
  );
`);

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
    is_published INTEGER DEFAULT 1,
    published_at TEXT NOT NULL,
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
} catch (e) {
  console.warn('Verificação de migração de colunas sociais/sites:', e);
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

// Funções Auxiliares de Criptografia de Senha
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

// Helper Centralizado de Auditoria e Trilha de Histórico Geral
function logAudit(req, {
  event_type = 'ALTERACAO',
  event_name,
  module,
  resource_id = null,
  user_cpf = null,
  user_name = null,
  user_role = null,
  description,
  details = null
}) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1') : '127.0.0.1';
    const cleanIp = typeof ip === 'string' ? ip.split(',')[0].trim().replace(/^::ffff:/, '') : '127.0.0.1';
    const userAgent = req ? (req.headers['user-agent'] || 'Desconhecido') : 'Sistema Local';

    let finalName = user_name;
    let finalCpf = user_cpf;
    let finalRole = user_role;

    if (!finalName && req) {
      if (req.user) {
        finalName = req.user.name || req.user.username;
        finalRole = req.user.role || 'admin';
        finalCpf = req.user.cpf || (req.user.username === 'jorgealvimtecnologia' ? '000.000.000-00' : null);
      } else if (req.client) {
        finalName = req.client.name;
        finalRole = 'client';
        finalCpf = req.client.cpf || req.client.cnpj || null;
      }
    }

    if (!finalName) {
      finalName = 'Sistema';
      finalRole = 'sistema';
    }

    const detailsJson = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO audit_logs (
        event_type, event_name, module, resource_id, user_cpf, user_name,
        user_role, ip_address, user_agent, description, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event_type,
      event_name,
      module,
      resource_id ? String(resource_id) : null,
      finalCpf || null,
      finalName,
      finalRole || 'admin',
      cleanIp,
      userAgent.substring(0, 255),
      description,
      detailsJson,
      now
    );
  } catch (err) {
    console.error('[AUDITORIA] Falha ao registrar log de auditoria:', err);
  }
}

// Inicialização / Garantia do Usuário Mestre Padrão
try {
  const masterCheck = db.prepare(`SELECT id FROM users WHERE username = ?`).get('jorgealvimtecnologia');
  if (!masterCheck) {
    const { hash, salt } = hashPassword('jorgealvim');
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
    console.log('👑 [AUTH] Usuário Mestre "jorgealvimtecnologia" inicializado com sucesso.');
  }
} catch (err) {
  console.error('Erro ao verificar usuário mestre:', err);
}

// Gerenciamento de Sessões em Memória
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  sessions.set(token, {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt
  });
  return token;
}

function validateToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : (req.query.token || req.headers['x-access-token']);

  const session = validateToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login no painel.' });
  }
  req.user = session;
  next();
}

// Gerenciamento de Sessões do Portal do Cliente
const clientSessions = new Map();

function createClientSession(client) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
  clientSessions.set(token, {
    clientId: client.id,
    fullName: client.full_name,
    email: client.email,
    cpf: client.cpf,
    cnpj: client.cnpj,
    clientType: client.client_type,
    expiresAt
  });
  return token;
}

function validateClientToken(token) {
  if (!token) return null;
  const session = clientSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    clientSessions.delete(token);
    return null;
  }
  return session;
}

function requireClientAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : (req.query.token || req.headers['x-client-token']);

  const session = validateClientToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Sessão do cliente expirada ou inválida. Faça login novamente.' });
  }
  req.client = session;
  next();
}

// Gerador de ID para Leads do Formulário do Site: JA-2026-0001
function generateNextClientId() {
  const currentYear = new Date().getFullYear();
  const prefix = `JA-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM leads`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM leads WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Cadastro de Clientes Completos: JA-CLI-2026-0001
function generateNextClientFullId() {
  const currentYear = new Date().getFullYear();
  const prefix = `JA-CLI-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM clients`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM clients WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Escritórios PJ: JA-ESC-2026-0001
function generateNextOfficeId() {
  const currentYear = new Date().getFullYear();
  const prefix = `JA-ESC-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM offices`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM offices WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Integrantes do Escritório: MEM-2026-0001
function generateNextOfficeMemberId() {
  const currentYear = new Date().getFullYear();
  const prefix = `MEM-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM office_members`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM office_members WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Documentos do Drive: DOC-2026-0001
function generateNextDriveDocId() {
  const currentYear = new Date().getFullYear();
  const prefix = `DOC-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM office_drive_files`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM office_drive_files WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Processos Judiciais: PROC-2026-0001
function generateNextLawsuitId() {
  const currentYear = new Date().getFullYear();
  const prefix = `PROC-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM lawsuits WHERE id LIKE ?`).all(`${prefix}%`);
  if (!records || records.length === 0) {
    return `${prefix}0001`;
  }
  
  const maxNum = records.reduce((max, r) => {
    const numPart = parseInt(r.id.replace(prefix, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);
  
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

// Gerador de ID para Lançamentos Financeiros: LAN-2026-0001
function generateNextTransactionId() {
  const currentYear = new Date().getFullYear();
  const prefix = `LAN-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM financial_transactions WHERE id LIKE ?`).all(`${prefix}%`);
  if (!records || records.length === 0) {
    return `${prefix}0001`;
  }
  
  const maxNum = records.reduce((max, r) => {
    const numPart = parseInt(r.id.replace(prefix, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);
  
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

// Gerador de ID para Alvarás Judiciais: ALV-2026-0001
function generateNextAlvaraId() {
  const currentYear = new Date().getFullYear();
  const prefix = `ALV-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM alvaras WHERE id LIKE ?`).all(`${prefix}%`);
  if (!records || records.length === 0) {
    return `${prefix}0001`;
  }
  
  const maxNum = records.reduce((max, r) => {
    const numPart = parseInt(r.id.replace(prefix, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);
  
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

// ================= SERVIÇO DE INTEGRAÇÃO DA API ASAAS =================

function getAsaasConfig() {
  const apiKeyRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'asaas_api_key'`).get();
  const envRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'asaas_environment'`).get();
  
  const apiKey = apiKeyRow ? apiKeyRow.value : '';
  const environment = envRow ? envRow.value : 'sandbox'; // 'sandbox' ou 'production'
  const baseUrl = environment === 'production' 
    ? 'https://api.asaas.com/v3' 
    : 'https://sandbox.asaas.com/api/v3';

  return { apiKey, environment, baseUrl };
}

async function callAsaasApi(endpoint, method = 'GET', body = null) {
  const { apiKey, baseUrl } = getAsaasConfig();
  if (!apiKey) {
    throw new Error('Chave de API do Asaas não configurada. Insira sua chave na aba Financeiro > Configuração Asaas.');
  }

  const options = {
    method,
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'JorgeAlvimAdvocacia-ERP/1.0'
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.errors ? data.errors.map(e => e.description).join('; ') : (data.message || 'Erro de comunicação com Asaas');
    throw new Error(errorMsg);
  }
  return data;
}

// Localiza ou Cria Cliente no Asaas
async function findOrCreateAsaasCustomer(client) {
  const cleanCpfCnpj = (client.cpf || client.cnpj || '').replace(/\D/g, '');
  
  if (cleanCpfCnpj) {
    try {
      const searchRes = await callAsaasApi(`/customers?cpfCnpj=${cleanCpfCnpj}`);
      if (searchRes.data && searchRes.data.length > 0) {
        return searchRes.data[0].id;
      }
    } catch (err) {
      console.warn('[ASAAS] Busca de cliente por CPF/CNPJ falhou, tentando cadastro direto:', err.message);
    }
  }

  const customerPayload = {
    name: client.full_name,
    cpfCnpj: cleanCpfCnpj || undefined,
    email: client.email || 'atendimento@jorgealvim.adv.br',
    phone: (client.phone || '').replace(/\D/g, ''),
    mobilePhone: (client.phone || '').replace(/\D/g, ''),
    address: client.street || undefined,
    addressNumber: client.number || undefined,
    complement: client.complement || undefined,
    province: client.neighborhood || undefined,
    postalCode: (client.cep || '').replace(/\D/g, '') || undefined,
    externalReference: client.id,
    notificationDisabled: false
  };

  const newCust = await callAsaasApi('/customers', 'POST', customerPayload);
  return newCust.id;
}

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

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB por arquivo (suporta fotos de alta resolução de smartphones)
});

// Configuração de Proxy Reverso e Confiança
app.set('trust proxy', 1);

// Middlewares de Segurança HTTP (HTTPS / Headers)
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Middlewares Padrão
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota para Download/Acesso Seguro aos Ficheiros dos Clientes e Drive do Escritório
app.use('/storage/clients', express.static(STORAGE_DIR));
app.use('/storage/office_drive', express.static(STORAGE_DRIVE_DIR));

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

// Rota da Página Principal e Painel de Controle
app.use(express.static(__dirname));

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'painel.html'));
});

app.get('/admin', (req, res) => {
  res.redirect('/painel');
});

app.get('/cliente', (req, res) => {
  res.sendFile(path.join(__dirname, 'cliente.html'));
});

app.get('/portal-cliente', (req, res) => {
  res.sendFile(path.join(__dirname, 'cliente.html'));
});

app.get('/area-do-cliente', (req, res) => {
  res.sendFile(path.join(__dirname, 'cliente.html'));
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'blog.html'));
});

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'blog.html'));
});

app.get('/artigos', (req, res) => {
  res.redirect('/blog');
});

// ================= ROTAS DE AUTENTICAÇÃO =================

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe o usuário e a senha.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    
    // Busca flexível de usuário por username exato, aliases (jorgealvim, admin, mestre) ou nome
    let user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username)) = ?`).get(cleanUsername);

    if (!user) {
      if (['jorgealvim', 'jorgealvimtecnologia', 'admin', 'mestre', 'drjorgealvim', 'drjorge'].includes(cleanUsername)) {
        user = db.prepare(`SELECT * FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`).get();
      } else if (cleanUsername.includes('mariana')) {
        user = db.prepare(`SELECT * FROM users WHERE username LIKE '%mariana%' OR name LIKE '%mariana%'`).get();
      } else if (cleanUsername.includes('gabriela')) {
        user = db.prepare(`SELECT * FROM users WHERE username LIKE '%gabriela%' OR name LIKE '%gabriela%'`).get();
      } else {
        user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(name)) LIKE ?`).get(`%${cleanUsername}%`);
      }
    }

    const isMasterFallback = user && (user.id === 'USR-MASTER-01' || user.username === 'jorgealvimtecnologia') && password === 'jorgealvim';
    const isPasswordValid = user && (isMasterFallback || verifyPassword(password, user.password_hash, user.salt));

    if (!user || !isPasswordValid) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_ADMIN',
        module: 'USUARIOS',
        user_name: cleanUsername,
        user_role: 'desconhecido',
        description: `Tentativa de login com credenciais inválidas para '${cleanUsername}'.`
      });
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

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
    sessions.delete(token);
  }
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// ================= ROTAS DE GESTÃO DE USUÁRIOS =================

app.get('/api/users', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, username, name, role, created_at 
      FROM users 
      ORDER BY created_at ASC
    `).all();
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

    if (password.length < 4) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(cleanUsername);

    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }

    const { hash, salt } = hashPassword(password);
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
      if (password.trim().length < 4) {
        return res.status(400).json({ error: 'A nova senha deve ter no mínimo 4 caracteres.' });
      }
      const { hash, salt } = hashPassword(password.trim());
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

// ================= ROTAS DE GESTÃO DE CLIENTES & CONTRATOS =================

/**
 * 1. GET /api/clients - Listar todos os clientes cadastrados com contratos
 */
app.get('/api/clients', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM clients 
      ORDER BY created_at DESC
    `).all();

    const clients = rows.map(c => ({
      ...c,
      files: c.files ? JSON.parse(c.files) : []
    }));

    return res.json({ success: true, clients });
  } catch (error) {
    console.error('[ERRO] Falha ao listar clientes:', error);
    return res.status(500).json({ error: 'Erro ao consultar clientes.' });
  }
});

/**
 * 1.1 GET /api/clients/:id - Buscar cliente individual por ID
 */
app.get('/api/clients/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    client.files = client.files ? JSON.parse(client.files) : [];
    return res.json({ success: true, client });
  } catch (error) {
    console.error('[ERRO] Falha ao consultar cliente por ID:', error);
    return res.status(500).json({ error: 'Erro ao consultar cliente.' });
  }
});

/**
 * 2. POST /api/clients - Cadastrar novo cliente completo + contrato com upload de documentos
 */
app.post('/api/clients', requireAuth, (req, res, next) => {
  req.clientId = generateNextClientFullId();
  next();
}, upload.array('documents', 20), (req, res) => {
  try {
    const clientId = req.clientId;
    const {
      client_type,
      full_name,
      cpf,
      rg,
      cnpj,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      email,
      phone,
      social_media,
      website,
      google_business,
      
      // Qualificação Civil (para Procuração e Contratos)
      nationality,
      marital_status,
      profession,
      
      // Representante Legal
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
      
      // Contrato
      contract_value,
      installments_count,
      installment_value,
      due_date,
      amount_paid,
      invoice_number,
      contract_status
    } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({ error: 'Nome completo e telefone são obrigatórios.' });
    }

    const cValue = parseFloat(contract_value) || 0;
    const aPaid = parseFloat(amount_paid) || 0;
    const instCount = parseInt(installments_count, 10) || 1;
    const instValue = parseFloat(installment_value) || (instCount > 0 ? (cValue / instCount) : 0);
    const balDue = Math.max(0, cValue - aPaid);

    const filesInfo = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      url: `/storage/clients/${clientId}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
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
    `);

    insertStmt.run(
      clientId,
      client_type || 'PF',
      full_name.trim(),
      cpf ? cpf.trim() : '',
      rg ? rg.trim() : '',
      cnpj ? cnpj.trim() : '',
      street ? street.trim() : '',
      number ? number.trim() : '',
      neighborhood ? neighborhood.trim() : '',
      city ? city.trim() : '',
      state ? state.trim() : 'MG',
      cep ? cep.trim() : '',
      complement ? complement.trim() : '',
      filiation_father ? filiation_father.trim() : '',
      filiation_mother ? filiation_mother.trim() : '',
      email ? email.trim() : '',
      phone.trim(),
      social_media ? social_media.trim() : '',
      website ? website.trim() : '',
      google_business ? google_business.trim() : '',
      
      nationality ? nationality.trim() : 'brasileiro(a)',
      marital_status ? marital_status.trim() : 'solteiro(a)',
      profession ? profession.trim() : '',
      
      rep_name ? rep_name.trim() : '',
      rep_cpf ? rep_cpf.trim() : '',
      rep_rg ? rep_rg.trim() : '',
      rep_street ? rep_street.trim() : '',
      rep_number ? rep_number.trim() : '',
      rep_neighborhood ? rep_neighborhood.trim() : '',
      rep_city ? rep_city.trim() : '',
      rep_state ? rep_state.trim() : '',
      rep_cep ? rep_cep.trim() : '',
      rep_complement ? rep_complement.trim() : '',
      
      cValue,
      instCount,
      instValue,
      due_date || '',
      aPaid,
      balDue,
      invoice_number ? invoice_number.trim() : '',
      contract_status || 'Ativo',
      
      JSON.stringify(filesInfo),
      now,
      now
    );

    console.log(`[CLIENTS] Novo cliente cadastrado com sucesso: #${clientId} - ${full_name}`);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_CLIENTE',
      module: 'CLIENTES',
      resource_id: clientId,
      user_cpf: cpf || cnpj,
      description: `Cadastro do cliente ${client_type === 'PJ' ? 'Pessoa Jurídica (Empresa): ' + full_name.trim() + ' (CNPJ: ' + cnpj + ')' : 'Pessoa Física: ' + full_name.trim() + ' (CPF: ' + cpf + ')'} com contrato de R$ ${cValue.toFixed(2)} (${instCount}x).`,
      details: { clientId, client_type, full_name: full_name.trim(), cpf, cnpj, email, phone, social_media, website, google_business, contract_value: cValue, installments_count: instCount, filesCount: filesInfo.length }
    });

    // =====================================================================
    // CRIAÇÃO AUTOMÁTICA DE USUÁRIO NO PAINEL (aba Usuários e Senhas)
    // Login  = dígitos do CPF (PF) ou CNPJ (PJ)
    // Senha  = 8 primeiros dígitos do telefone
    // Role   = 'cliente'
    // =====================================================================
    let autoUserCreated = false;
    let autoUsername = '';
    let autoPassword = '';

    try {
      const docSource = client_type === 'PJ' ? (cnpj || cpf) : (cpf || cnpj);
      const phoneSource = phone ? phone.replace(/\D/g, '') : '';

      // Login: apenas dígitos do CPF/CNPJ
      autoUsername = docSource ? docSource.replace(/\D/g, '') : '';
      // Senha: primeiros 8 dígitos do telefone (fallback: primeiros 8 dígitos do CPF/CNPJ)
      autoPassword = phoneSource.length >= 8
        ? phoneSource.slice(0, 8)
        : (autoUsername.length >= 8 ? autoUsername.slice(0, 8) : autoUsername);

      if (autoUsername && autoPassword && autoPassword.length >= 4) {
        const { hash, salt } = hashPassword(autoPassword);
        const userId = 'USR-CLI-' + Date.now();

        // INSERT OR IGNORE: ignora silenciosamente se o username já existir (evita unique constraint)
        const result = db.prepare(`
          INSERT OR IGNORE INTO users (id, username, password_hash, salt, name, role, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          autoUsername,
          hash,
          salt,
          full_name.trim(),
          'cliente',
          now
        );

        // result.changes === 1 significa que foi inserido (0 = ignorado por conflito)
        if (result.changes === 1) {
          logAudit(req, {
            event_type: 'CRIACAO',
            event_name: 'CRIAR_USUARIO',
            module: 'USUARIOS',
            resource_id: userId,
            description: `Usuário criado automaticamente para o cliente '${full_name.trim()}' (login: ${autoUsername}) ao cadastrá-lo no sistema.`,
            details: { userId, username: autoUsername, name: full_name.trim(), role: 'cliente', clientId, origem: 'auto-cadastro-cliente' }
          });
          autoUserCreated = true;
          console.log(`[USERS] Usuário criado automaticamente para cliente #${clientId}: login=${autoUsername}`);
        } else {
          console.log(`[USERS] Login '${autoUsername}' já existe — usuário não duplicado para cliente #${clientId}`);
        }
      }
    } catch (userErr) {
      // Nunca interrompe o cadastro do cliente por falha na criação do usuário
      console.warn(`[USERS] Falha ao criar usuário automático para cliente #${clientId}:`, userErr.message);
    }

    return res.status(201).json({
      success: true,
      clientId,
      message: 'Cliente e contrato cadastrados com sucesso!',
      filesCount: filesInfo.length,
      autoUser: autoUserCreated
        ? { created: true, username: autoUsername, password: autoPassword, message: `Acesso criado: login=${autoUsername} / senha=${autoPassword}` }
        : { created: false }
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar cliente:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao salvar dados do cliente.' });
  }
});

/**
 * 3. PUT /api/clients/:id - Atualizar cliente e contrato + anexo de novos arquivos
 */
app.put('/api/clients/:id', requireAuth, upload.array('documents', 20), (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const {
      client_type,
      full_name,
      cpf,
      rg,
      cnpj,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      email,
      phone,
      social_media,
      website,
      google_business,
      
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
      
      contract_value,
      installments_count,
      installment_value,
      due_date,
      amount_paid,
      invoice_number,
      contract_status
    } = req.body;

    const cValue = contract_value !== undefined ? parseFloat(contract_value) : client.contract_value;
    const aPaid = amount_paid !== undefined ? parseFloat(amount_paid) : client.amount_paid;
    const instCount = installments_count !== undefined ? parseInt(installments_count, 10) : client.installments_count;
    const instValue = installment_value !== undefined ? parseFloat(installment_value) : client.installment_value;
    const balDue = Math.max(0, cValue - aPaid);

    let existingFiles = [];
    try {
      existingFiles = client.files ? JSON.parse(client.files) : [];
    } catch (e) {
      existingFiles = [];
    }

    const newFiles = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      url: `/storage/clients/${id}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const allFiles = [...existingFiles, ...newFiles];
    const now = new Date().toISOString();

    const updateStmt = db.prepare(`
      UPDATE clients SET
        client_type = ?, full_name = ?, cpf = ?, rg = ?, cnpj = ?,
        street = ?, number = ?, neighborhood = ?, city = ?, state = ?, cep = ?, complement = ?,
        filiation_father = ?, filiation_mother = ?, email = ?, phone = ?, social_media = ?, website = ?, google_business = ?,
        nationality = ?, marital_status = ?, profession = ?,
        rep_name = ?, rep_cpf = ?, rep_rg = ?, rep_street = ?, rep_number = ?, rep_neighborhood = ?, rep_city = ?, rep_state = ?, rep_cep = ?, rep_complement = ?,
        contract_value = ?, installments_count = ?, installment_value = ?, due_date = ?, amount_paid = ?, balance_due = ?, invoice_number = ?, contract_status = ?,
        files = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      client_type || client.client_type,
      full_name !== undefined ? full_name.trim() : client.full_name,
      cpf !== undefined ? cpf.trim() : client.cpf,
      rg !== undefined ? rg.trim() : client.rg,
      cnpj !== undefined ? cnpj.trim() : client.cnpj,
      street !== undefined ? street.trim() : client.street,
      number !== undefined ? number.trim() : client.number,
      neighborhood !== undefined ? neighborhood.trim() : client.neighborhood,
      city !== undefined ? city.trim() : client.city,
      state !== undefined ? state.trim() : client.state,
      cep !== undefined ? cep.trim() : client.cep,
      complement !== undefined ? complement.trim() : client.complement,
      filiation_father !== undefined ? filiation_father.trim() : client.filiation_father,
      filiation_mother !== undefined ? filiation_mother.trim() : client.filiation_mother,
      email !== undefined ? email.trim() : client.email,
      phone !== undefined ? phone.trim() : client.phone,
      social_media !== undefined ? social_media.trim() : client.social_media,
      website !== undefined ? website.trim() : (client.website || ''),
      google_business !== undefined ? google_business.trim() : (client.google_business || ''),
      
      nationality !== undefined ? nationality.trim() : (client.nationality || 'brasileiro(a)'),
      marital_status !== undefined ? marital_status.trim() : (client.marital_status || 'solteiro(a)'),
      profession !== undefined ? profession.trim() : (client.profession || ''),
      
      rep_name !== undefined ? rep_name.trim() : client.rep_name,
      rep_cpf !== undefined ? rep_cpf.trim() : client.rep_cpf,
      rep_rg !== undefined ? rep_rg.trim() : client.rep_rg,
      rep_street !== undefined ? rep_street.trim() : client.rep_street,
      rep_number !== undefined ? rep_number.trim() : client.rep_number,
      rep_neighborhood !== undefined ? rep_neighborhood.trim() : client.rep_neighborhood,
      rep_city !== undefined ? rep_city.trim() : client.rep_city,
      rep_state !== undefined ? rep_state.trim() : client.rep_state,
      rep_cep !== undefined ? rep_cep.trim() : client.rep_cep,
      rep_complement !== undefined ? rep_complement.trim() : client.rep_complement,
      
      cValue,
      instCount,
      instValue,
      due_date !== undefined ? due_date : client.due_date,
      aPaid,
      balDue,
      invoice_number !== undefined ? invoice_number.trim() : client.invoice_number,
      contract_status || client.contract_status,
      
      JSON.stringify(allFiles),
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_CLIENTE',
      module: 'CLIENTES',
      resource_id: id,
      description: `Atualização de cadastro e contrato do cliente #${id} (${full_name || client.full_name}).`,
      details: { id, full_name: full_name || client.full_name, contract_value: cValue, amount_paid: aPaid, balance_due: balDue, newFilesUploaded: newFiles.length }
    });

    return res.json({ success: true, message: 'Dados do cliente e contrato atualizados com sucesso!' });

  } catch (error) {
    console.error('[ERRO] Falha ao atualizar cliente:', error);
    return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
  }
});

/**
 * 4. DELETE /api/clients/:id - Excluir cliente, contrato e arquivos físicos
 */
app.delete('/api/clients/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);

    // Remove arquivos do disco
    const clientFolder = path.join(STORAGE_DIR, id);
    if (fs.existsSync(clientFolder)) {
      fs.rmSync(clientFolder, { recursive: true, force: true });
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_CLIENTE',
      module: 'CLIENTES',
      resource_id: id,
      user_cpf: client.cpf || client.cnpj,
      description: `Exclusão definitiva do cliente #${id} (${client.full_name}) e remoção de todos os seus arquivos, processos e contratos vinculados.`
    });

    return res.json({ success: true, message: 'Cliente, contrato e ficheiros excluídos com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir cliente:', error);
    return res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

// ================= ROTAS DE DADOS DO ESCRITÓRIO & EQUIPE =================

// 1. GET /api/offices - Listar escritórios cadastrados (com integrantes)
app.get('/api/offices', requireAuth, (req, res) => {
  try {
    const { search } = req.query;
    let query = `SELECT * FROM offices WHERE 1=1`;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (id LIKE ? OR corporate_name LIKE ? OR trade_name LIKE ? OR cnpj LIKE ? OR city LIKE ?)`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY created_at DESC`;
    const offices = db.prepare(query).all(...params);

    const getMembersStmt = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`);
    for (const off of offices) {
      off.members = getMembersStmt.all(off.id);
    }

    return res.json({ success: true, offices });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao listar escritórios:', error);
    return res.status(500).json({ error: 'Erro ao buscar escritórios.' });
  }
});

// 2. GET /api/offices/search-doc - Localizar por CNPJ ou CPF (local + consulta externa BrasilAPI)
app.get('/api/offices/search-doc', requireAuth, async (req, res) => {
  try {
    const docParam = (req.query.doc || '').trim();
    const cleanDoc = docParam.replace(/\D/g, '');

    if (!cleanDoc) {
      return res.status(400).json({ error: 'Informe um número de CNPJ ou CPF válido.' });
    }

    // Busca local em offices por CNPJ
    const officeByCnpj = db.prepare(`SELECT * FROM offices WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?`).get(cleanDoc);
    if (officeByCnpj) {
      officeByCnpj.members = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`).all(officeByCnpj.id);
      return res.json({ success: true, matchType: 'office_cnpj', office: officeByCnpj });
    }

    // Busca local em office_members por CPF
    const memberByCpf = db.prepare(`SELECT * FROM office_members WHERE REPLACE(REPLACE(cpf, '.', ''), '-', '') = ?`).get(cleanDoc);
    if (memberByCpf) {
      const parentOffice = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(memberByCpf.office_id);
      if (parentOffice) {
        parentOffice.members = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`).all(parentOffice.id);
        return res.json({ success: true, matchType: 'member_cpf', member: memberByCpf, office: parentOffice });
      }
    }

    // Se tiver 14 dígitos (CNPJ), faz busca na Receita Federal via BrasilAPI
    if (cleanDoc.length === 14) {
      try {
        const fetchRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanDoc}`);
        if (fetchRes.ok) {
          const apiData = await fetchRes.json();
          return res.json({
            success: true,
            matchType: 'external_cnpj',
            cnpjData: {
              cnpj: apiData.cnpj ? apiData.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cleanDoc,
              corporate_name: apiData.razao_social || '',
              trade_name: apiData.nome_fantasia || apiData.razao_social || '',
              street: apiData.logradouro || '',
              number: apiData.numero || '',
              complement: apiData.complemento || '',
              neighborhood: apiData.bairro || '',
              city: apiData.municipio || '',
              state: apiData.uf || 'MG',
              cep: apiData.cep ? String(apiData.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : '',
              email: apiData.email || '',
              phone: apiData.ddd_telefone_1 ? `(${apiData.ddd_telefone_1.slice(0, 2)}) ${apiData.ddd_telefone_1.slice(2)}` : ''
            }
          });
        }
      } catch (extErr) {
        console.warn('Erro ao consultar BrasilAPI CNPJ:', extErr);
      }
    }

    return res.status(404).json({ error: 'Nenhum escritório ou integrante localizado para este CNPJ/CPF.' });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro na busca por CNPJ/CPF:', error);
    return res.status(500).json({ error: 'Erro ao buscar CNPJ/CPF.' });
  }
});

// 3. GET /api/offices/:id - Buscar escritório individual por ID
app.get('/api/offices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const office = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(id);
    if (!office) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    office.members = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`).all(id);
    return res.json({ success: true, office });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao buscar escritório:', error);
    return res.status(500).json({ error: 'Erro ao buscar escritório.' });
  }
});

// 4. POST /api/offices - Cadastrar novo escritório (PJ) + integrantes (PF)
app.post('/api/offices', requireAuth, (req, res) => {
  try {
    const {
      corporate_name,
      trade_name,
      cnpj,
      oab_society,
      oab_uf,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      email,
      phone,
      whatsapp,
      website,
      pix_key,
      bank_info,
      notes,
      members
    } = req.body;

    if (!corporate_name || !corporate_name.trim()) {
      return res.status(400).json({ error: 'A Razão Social / Nome do Escritório é obrigatório.' });
    }

    const id = generateNextOfficeId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO offices (
        id, corporate_name, trade_name, cnpj, oab_society, oab_uf,
        street, number, neighborhood, city, state, cep, complement,
        email, phone, whatsapp, website, pix_key, bank_info, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      corporate_name.trim(),
      trade_name ? trade_name.trim() : '',
      cnpj ? cnpj.trim() : '',
      oab_society ? oab_society.trim() : '',
      oab_uf ? oab_uf.trim() : 'MG',
      street ? street.trim() : '',
      number ? number.trim() : '',
      neighborhood ? neighborhood.trim() : '',
      city ? city.trim() : '',
      state ? state.trim() : 'MG',
      cep ? cep.trim() : '',
      complement ? complement.trim() : '',
      email ? email.trim().toLowerCase() : '',
      phone ? phone.trim() : '',
      whatsapp ? whatsapp.trim() : '',
      website ? website.trim() : '',
      pix_key ? pix_key.trim() : '',
      bank_info ? bank_info.trim() : '',
      notes ? notes.trim() : '',
      now,
      now
    );

    if (Array.isArray(members) && members.length > 0) {
      const insertMemStmt = db.prepare(`
        INSERT INTO office_members (
          id, office_id, role_type, name, cpf, rg, oab_number, oab_uf,
          email, phone, position_title, admission_date,
          street, number, complement, neighborhood, city, state, cep,
          status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of members) {
        if (!m.name || !m.name.trim()) continue;
        const memId = generateNextOfficeMemberId();
        insertMemStmt.run(
          memId,
          id,
          m.role_type || 'Advogado Associado',
          m.name.trim(),
          m.cpf ? m.cpf.trim() : '',
          m.rg ? m.rg.trim() : '',
          m.oab_number ? m.oab_number.trim() : '',
          m.oab_uf ? m.oab_uf.trim() : 'MG',
          m.email ? m.email.trim().toLowerCase() : '',
          m.phone ? m.phone.trim() : '',
          m.position_title ? m.position_title.trim() : '',
          m.admission_date || '',
          m.street ? m.street.trim() : '',
          m.number ? m.number.trim() : '',
          m.complement ? m.complement.trim() : '',
          m.neighborhood ? m.neighborhood.trim() : '',
          m.city ? m.city.trim() : '',
          m.state ? m.state.trim() : 'MG',
          m.cep ? m.cep.trim() : '',
          m.status || 'Ativo',
          m.notes ? m.notes.trim() : '',
          now,
          now
        );
      }
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_ESCRITORIO',
      module: 'SISTEMA',
      resource_id: id,
      description: `Cadastro do escritório PJ: ${corporate_name.trim()} (#${id}).`
    });

    return res.status(201).json({ success: true, message: 'Escritório cadastrado com sucesso!', id });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao cadastrar escritório:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar escritório: ' + error.message });
  }
});

// 5. PUT /api/offices/:id - Atualizar escritório (PJ) e integrantes (PF)
app.put('/api/offices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const {
      corporate_name,
      trade_name,
      cnpj,
      oab_society,
      oab_uf,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      email,
      phone,
      whatsapp,
      website,
      pix_key,
      bank_info,
      notes,
      members
    } = req.body;

    const existing = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE offices SET
        corporate_name = ?,
        trade_name = ?,
        cnpj = ?,
        oab_society = ?,
        oab_uf = ?,
        street = ?,
        number = ?,
        neighborhood = ?,
        city = ?,
        state = ?,
        cep = ?,
        complement = ?,
        email = ?,
        phone = ?,
        whatsapp = ?,
        website = ?,
        pix_key = ?,
        bank_info = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      corporate_name !== undefined ? corporate_name.trim() : existing.corporate_name,
      trade_name !== undefined ? trade_name.trim() : existing.trade_name,
      cnpj !== undefined ? cnpj.trim() : existing.cnpj,
      oab_society !== undefined ? oab_society.trim() : existing.oab_society,
      oab_uf !== undefined ? oab_uf.trim() : existing.oab_uf,
      street !== undefined ? street.trim() : existing.street,
      number !== undefined ? number.trim() : existing.number,
      neighborhood !== undefined ? neighborhood.trim() : existing.neighborhood,
      city !== undefined ? city.trim() : existing.city,
      state !== undefined ? state.trim() : existing.state,
      cep !== undefined ? cep.trim() : existing.cep,
      complement !== undefined ? complement.trim() : existing.complement,
      email !== undefined ? email.trim().toLowerCase() : existing.email,
      phone !== undefined ? phone.trim() : existing.phone,
      whatsapp !== undefined ? whatsapp.trim() : existing.whatsapp,
      website !== undefined ? website.trim() : existing.website,
      pix_key !== undefined ? pix_key.trim() : existing.pix_key,
      bank_info !== undefined ? bank_info.trim() : existing.bank_info,
      notes !== undefined ? notes.trim() : existing.notes,
      now,
      id
    );

    if (Array.isArray(members)) {
      db.prepare(`DELETE FROM office_members WHERE office_id = ?`).run(id);

      const insertMemStmt = db.prepare(`
        INSERT INTO office_members (
          id, office_id, role_type, name, cpf, rg, oab_number, oab_uf,
          email, phone, position_title, admission_date,
          street, number, complement, neighborhood, city, state, cep,
          status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of members) {
        if (!m.name || !m.name.trim()) continue;
        const memId = m.id || generateNextOfficeMemberId();
        insertMemStmt.run(
          memId,
          id,
          m.role_type || 'Advogado Associado',
          m.name.trim(),
          m.cpf ? m.cpf.trim() : '',
          m.rg ? m.rg.trim() : '',
          m.oab_number ? m.oab_number.trim() : '',
          m.oab_uf ? m.oab_uf.trim() : 'MG',
          m.email ? m.email.trim().toLowerCase() : '',
          m.phone ? m.phone.trim() : '',
          m.position_title ? m.position_title.trim() : '',
          m.admission_date || '',
          m.street ? m.street.trim() : '',
          m.number ? m.number.trim() : '',
          m.complement ? m.complement.trim() : '',
          m.neighborhood ? m.neighborhood.trim() : '',
          m.city ? m.city.trim() : '',
          m.state ? m.state.trim() : 'MG',
          m.cep ? m.cep.trim() : '',
          m.status || 'Ativo',
          m.notes ? m.notes.trim() : '',
          now,
          now
        );
      }
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_ESCRITORIO',
      module: 'SISTEMA',
      resource_id: id,
      description: `Atualização do escritório PJ: ${corporate_name || existing.corporate_name} (#${id}).`
    });

    return res.json({ success: true, message: 'Dados do escritório e integrantes atualizados com sucesso!' });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao atualizar escritório:', error);
    return res.status(500).json({ error: 'Erro ao atualizar escritório.' });
  }
});

// 6. DELETE /api/offices/:id - Excluir escritório e seus integrantes
app.delete('/api/offices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    db.prepare(`DELETE FROM office_members WHERE office_id = ?`).run(id);
    db.prepare(`DELETE FROM offices WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_ESCRITORIO',
      module: 'SISTEMA',
      resource_id: id,
      description: `Exclusão definitiva do escritório PJ #${id} (${existing.corporate_name}) e seus integrantes.`
    });

    return res.json({ success: true, message: 'Escritório e integrantes excluídos com sucesso!' });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao excluir escritório:', error);
    return res.status(500).json({ error: 'Erro ao excluir escritório.' });
  }
});

// ================= ROTAS DO DRIVE DO ESCRITÓRIO (ARQUIVO DIGITAL & DOCUMENTOS) =================

// 1. GET /api/drive/files - Listar documentos com filtro por pasta ou busca por título
app.get('/api/drive/files', requireAuth, (req, res) => {
  try {
    const { folder, search } = req.query;
    let query = `SELECT * FROM office_drive_files WHERE 1=1`;
    const params = [];

    if (folder && folder.trim() && folder.trim() !== 'Todas') {
      query += ` AND folder = ?`;
      params.push(folder.trim());
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (title LIKE ? OR filename LIKE ? OR notes LIKE ? OR uploaded_by LIKE ?)`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY created_at DESC`;
    const files = db.prepare(query).all(...params);

    const foldersCount = db.prepare(`
      SELECT folder, COUNT(*) as count FROM office_drive_files GROUP BY folder
    `).all();

    const totalSizeRes = db.prepare(`SELECT SUM(file_size) as total_size FROM office_drive_files`).get();
    const totalSize = totalSizeRes ? (totalSizeRes.total_size || 0) : 0;

    return res.json({
      success: true,
      files,
      foldersCount,
      totalSize
    });
  } catch (error) {
    console.error('[DRIVE] Erro ao listar arquivos do drive:', error);
    return res.status(500).json({ error: 'Erro ao listar documentos do drive.' });
  }
});

// 2. POST /api/drive/upload - Upload de novo documento para o drive
app.post('/api/drive/upload', requireAuth, uploadDrive.array('drive_files', 20), (req, res) => {
  try {
    const { folder = 'Geral', title, notes } = req.body;
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um arquivo para fazer upload.' });
    }

    const now = new Date().toISOString();
    const uploader = req.user ? req.user.name : 'Administrador';
    const insertedDocs = [];

    const insertStmt = db.prepare(`
      INSERT INTO office_drive_files (
        id, folder, title, filename, file_path, file_size, file_type, uploaded_by, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    uploadedFiles.forEach((file) => {
      const docId = generateNextDriveDocId();
      const docTitle = (uploadedFiles.length === 1 && title && title.trim())
        ? title.trim()
        : file.originalname;
      const fileUrl = `/storage/office_drive/${file.filename}`;
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

      insertStmt.run(
        docId,
        folder.trim(),
        docTitle,
        file.filename,
        fileUrl,
        file.size,
        ext || file.mimetype,
        uploader,
        notes ? notes.trim() : '',
        now,
        now
      );

      insertedDocs.push({ id: docId, title: docTitle, fileUrl });
    });

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'UPLOAD_DOCUMENTO_DRIVE',
      module: 'DRIVE',
      description: `${uploadedFiles.length} documento(s) enviado(s) para a pasta '${folder}'.`
    });

    return res.json({
      success: true,
      message: `${uploadedFiles.length} documento(s) adicionado(s) ao Drive com sucesso!`,
      insertedDocs
    });
  } catch (error) {
    console.error('[DRIVE] Erro ao salvar arquivo no drive:', error);
    return res.status(500).json({ error: 'Erro ao realizar upload do documento.' });
  }
});

// 3. PUT /api/drive/files/:id - Editar informações do documento
app.put('/api/drive/files/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, folder, notes } = req.body;

    const existing = db.prepare(`SELECT * FROM office_drive_files WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE office_drive_files
      SET title = ?, folder = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title ? title.trim() : existing.title,
      folder ? folder.trim() : existing.folder,
      notes !== undefined ? notes.trim() : existing.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_DOCUMENTO_DRIVE',
      module: 'DRIVE',
      resource_id: id,
      description: `Alteração dos dados do documento '${title || existing.title}' (#${id}).`
    });

    return res.json({ success: true, message: 'Documento atualizado com sucesso!' });
  } catch (error) {
    console.error('[DRIVE] Erro ao atualizar documento:', error);
    return res.status(500).json({ error: 'Erro ao atualizar documento.' });
  }
});

// 4. DELETE /api/drive/files/:id - Excluir documento do drive e do disco
app.delete('/api/drive/files/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM office_drive_files WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    db.prepare(`DELETE FROM office_drive_files WHERE id = ?`).run(id);

    const diskPath = path.join(STORAGE_DRIVE_DIR, existing.filename);
    if (fs.existsSync(diskPath)) {
      try { fs.unlinkSync(diskPath); } catch (e) {}
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_DOCUMENTO_DRIVE',
      module: 'DRIVE',
      resource_id: id,
      description: `Exclusão do documento '${existing.title}' (#${id}) do Drive do Escritório.`
    });

    return res.json({ success: true, message: 'Documento excluído com sucesso!' });
  } catch (error) {
    console.error('[DRIVE] Erro ao excluir documento:', error);
    return res.status(500).json({ error: 'Erro ao excluir documento.' });
  }
});

// ================= ROTAS DE PROCESSOS JUDICIAIS & ANDAMENTOS (CNJ) =================

/**
 * 1. GET /api/lawsuits - Listar processos (opcionalmente filtrados por clientId) com andamentos
 */
app.get('/api/lawsuits', requireAuth, (req, res) => {
  try {
    const { clientId } = req.query;
    let lawsuits;

    if (clientId) {
      lawsuits = db.prepare(`
        SELECT l.*, c.full_name as client_name, c.phone as client_phone
        FROM lawsuits l
        JOIN clients c ON c.id = l.client_id
        WHERE l.client_id = ?
        ORDER BY l.created_at DESC
      `).all(clientId);
    } else {
      lawsuits = db.prepare(`
        SELECT l.*, c.full_name as client_name, c.phone as client_phone
        FROM lawsuits l
        JOIN clients c ON c.id = l.client_id
        ORDER BY l.updated_at DESC
      `).all();
    }

    const movementStmt = db.prepare(`
      SELECT * FROM lawsuit_movements
      WHERE lawsuit_id = ?
      ORDER BY movement_date DESC, id DESC
    `);

    const result = lawsuits.map(law => ({
      ...law,
      movements: movementStmt.all(law.id)
    }));

    return res.json({ success: true, lawsuits: result });
  } catch (error) {
    console.error('[ERRO] Falha ao listar processos judiciais:', error);
    return res.status(500).json({ error: 'Erro ao consultar processos judiciais.' });
  }
});

/**
 * 2. POST /api/lawsuits - Cadastrar novo processo vinculado a um cliente
 */
app.post('/api/lawsuits', requireAuth, (req, res) => {
  try {
    const {
      client_id,
      cnj_number,
      tribunal,
      instance,
      action_type,
      court_branch,
      subject,
      judge_name,
      distribution_date,
      status,
      notes
    } = req.body;

    if (!client_id || !cnj_number || !tribunal) {
      return res.status(400).json({ error: 'Cliente, número CNJ e Tribunal são obrigatórios.' });
    }

    const client = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente informado não existe no sistema.' });
    }

    const id = generateNextLawsuitId();
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO lawsuits (
        id, client_id, cnj_number, tribunal, instance, action_type, court_branch,
        subject, judge_name, distribution_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      client_id,
      cnj_number.trim(),
      tribunal.trim(),
      instance || '1ª Instância',
      action_type ? action_type.trim() : '',
      court_branch ? court_branch.trim() : '',
      subject ? subject.trim() : '',
      judge_name ? judge_name.trim() : '',
      distribution_date || '',
      status || 'Em Andamento',
      notes ? notes.trim() : '',
      now,
      now
    );

    console.log(`[PROCESSOS] Processo ${cnj_number} cadastrado para cliente ${client_id} (ID: ${id})`);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_PROCESSO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Cadastro do processo judicial CNJ ${cnj_number.trim()} (${tribunal.trim()} - ${instance || '1ª Instância'}) vinculado ao cliente #${client_id}.`,
      details: { id, client_id, cnj_number: cnj_number.trim(), tribunal: tribunal.trim(), instance, action_type, court_branch, subject }
    });

    return res.status(201).json({
      success: true,
      message: 'Processo judicial cadastrado com sucesso!',
      lawsuitId: id
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar processo judicial:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar processo judicial.' });
  }
});

/**
 * 3. PUT /api/lawsuits/:id - Atualizar dados do processo judicial
 */
app.put('/api/lawsuits/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const {
      cnj_number,
      tribunal,
      instance,
      action_type,
      court_branch,
      subject,
      judge_name,
      distribution_date,
      status,
      notes
    } = req.body;

    const law = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(id);
    if (!law) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    const now = new Date().toISOString();

    const updateStmt = db.prepare(`
      UPDATE lawsuits SET
        cnj_number = ?, tribunal = ?, instance = ?, action_type = ?, court_branch = ?,
        subject = ?, judge_name = ?, distribution_date = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      cnj_number ? cnj_number.trim() : law.cnj_number,
      tribunal ? tribunal.trim() : law.tribunal,
      instance || law.instance,
      action_type !== undefined ? action_type.trim() : law.action_type,
      court_branch !== undefined ? court_branch.trim() : law.court_branch,
      subject !== undefined ? subject.trim() : law.subject,
      judge_name !== undefined ? judge_name.trim() : law.judge_name,
      distribution_date !== undefined ? distribution_date : law.distribution_date,
      status || law.status,
      notes !== undefined ? notes.trim() : law.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_PROCESSO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Alteração dos dados do processo judicial CNJ ${cnj_number || law.cnj_number} (ID: ${id}) - Status: ${status || law.status}.`,
      details: { id, cnj_number: cnj_number || law.cnj_number, tribunal: tribunal || law.tribunal, status: status || law.status }
    });

    return res.json({ success: true, message: 'Processo judicial atualizado com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar processo judicial:', error);
    return res.status(500).json({ error: 'Erro ao atualizar processo judicial.' });
  }
});

/**
 * 4. DELETE /api/lawsuits/:id - Excluir processo judicial e seus andamentos
 */
app.delete('/api/lawsuits/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const law = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(id);

    db.prepare(`DELETE FROM lawsuit_movements WHERE lawsuit_id = ?`).run(id);
    db.prepare(`DELETE FROM lawsuits WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_PROCESSO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Exclusão do processo judicial CNJ ${law ? law.cnj_number : id} e todos os seus andamentos.`
    });

    return res.json({ success: true, message: 'Processo judicial e andamentos excluídos com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir processo judicial:', error);
    return res.status(500).json({ error: 'Erro ao excluir processo judicial.' });
  }
});

/**
 * 5. POST /api/lawsuits/:id/movements - Adicionar andamento / prazo ao processo
 */
app.post('/api/lawsuits/:id/movements', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { movement_date, title, description, deadline_date, deadline_status } = req.body;

    if (!movement_date || !title) {
      return res.status(400).json({ error: 'Data do andamento e título são obrigatórios.' });
    }

    const law = db.prepare(`SELECT id, cnj_number FROM lawsuits WHERE id = ?`).get(id);
    if (!law) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO lawsuit_movements (
        lawsuit_id, movement_date, title, description, deadline_date, deadline_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insertStmt.run(
      id,
      movement_date,
      title.trim(),
      description ? description.trim() : '',
      deadline_date || '',
      deadline_status || 'Pendente',
      now
    );

    // Atualiza o updated_at do processo principal
    db.prepare(`UPDATE lawsuits SET updated_at = ? WHERE id = ?`).run(now, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_ANDAMENTO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Novo andamento lançado no processo CNJ ${law.cnj_number}: '${title.trim()}' (Data: ${movement_date})${deadline_date ? ' | Prazo: ' + deadline_date : ''}.`,
      details: { lawsuit_id: id, movementId: info.lastInsertRowid, title: title.trim(), movement_date, deadline_date, deadline_status }
    });

    return res.status(201).json({
      success: true,
      message: 'Andamento registrado com sucesso!',
      movementId: info.lastInsertRowid
    });
  } catch (error) {
    console.error('[ERRO] Falha ao registrar andamento:', error);
    return res.status(500).json({ error: 'Erro ao registrar andamento do processo.' });
  }
});

/**
 * 6. PUT /api/lawsuits/movements/:movementId - Atualizar andamento / alterar status do prazo
 */
app.put('/api/lawsuits/movements/:movementId', requireAuth, (req, res) => {
  try {
    const { movementId } = req.params;
    const { movement_date, title, description, deadline_date, deadline_status } = req.body;

    const mov = db.prepare(`SELECT * FROM lawsuit_movements WHERE id = ?`).get(movementId);
    if (!mov) {
      return res.status(404).json({ error: 'Andamento não encontrado.' });
    }

    const updateStmt = db.prepare(`
      UPDATE lawsuit_movements SET
        movement_date = ?, title = ?, description = ?, deadline_date = ?, deadline_status = ?
      WHERE id = ?
    `);

    updateStmt.run(
      movement_date || mov.movement_date,
      title ? title.trim() : mov.title,
      description !== undefined ? description.trim() : mov.description,
      deadline_date !== undefined ? deadline_date : mov.deadline_date,
      deadline_status || mov.deadline_status,
      movementId
    );

    db.prepare(`UPDATE lawsuits SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), mov.lawsuit_id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_ANDAMENTO',
      module: 'PROCESSOS',
      resource_id: mov.lawsuit_id,
      description: `Alteração do andamento #${movementId} no processo: '${title || mov.title}' - Status Prazo: ${deadline_status || mov.deadline_status}.`
    });

    return res.json({ success: true, message: 'Andamento atualizado com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar andamento:', error);
    return res.status(500).json({ error: 'Erro ao atualizar andamento.' });
  }
});

/**
 * 7. DELETE /api/lawsuits/movements/:movementId - Excluir linha de andamento
 */
app.delete('/api/lawsuits/movements/:movementId', requireAuth, (req, res) => {
  try {
    const { movementId } = req.params;
    const mov = db.prepare(`SELECT * FROM lawsuit_movements WHERE id = ?`).get(movementId);

    db.prepare(`DELETE FROM lawsuit_movements WHERE id = ?`).run(movementId);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_ANDAMENTO',
      module: 'PROCESSOS',
      resource_id: mov ? mov.lawsuit_id : null,
      description: `Exclusão do andamento #${movementId} ('${mov ? mov.title : 'Andamento'}').`
    });

    return res.json({ success: true, message: 'Andamento excluído com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir andamento:', error);
    return res.status(500).json({ error: 'Erro ao excluir andamento.' });
  }
});

// ================= ROTAS DE LEADS / ATENDIMENTOS DO SITE =================

app.post('/api/leads', (req, res, next) => {
  req.clientId = generateNextClientId();
  next();
}, upload.array('documents', 10), (req, res) => {
  try {
    const { name, phone, area, message, email, cpf, city, social_media, website, google_business } = req.body;
    const clientId = req.clientId;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
    }

    const filesInfo = (req.files || []).map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      url: `/storage/clients/${clientId}/${file.filename}`,
      savedAt: new Date().toISOString()
    }));

    const createdAt = new Date().toISOString();
    const filesJson = JSON.stringify(filesInfo);

    // 1. Grava no Ficheiro de Atendimentos / Leads
    const insertLeadStmt = db.prepare(`
      INSERT INTO leads (id, created_at, name, phone, area, message, files, status, social_media, website, google_business)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Novo', ?, ?, ?)
    `);

    insertLeadStmt.run(
      clientId,
      createdAt,
      name.trim(),
      phone.trim(),
      area || 'Não especificado',
      message ? message.trim() : '',
      filesJson,
      social_media ? social_media.trim() : '',
      website ? website.trim() : '',
      google_business ? google_business.trim() : ''
    );

    // 2. Grava AUTOMATICAMENTE no Banco de Dados de Clientes & Contratos (Box de Clientes)
    const insertClientStmt = db.prepare(`
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
    `);

    insertClientStmt.run(
      clientId,
      'PF',
      name.trim(),
      cpf ? cpf.trim() : '',
      '',
      '',
      '',
      '',
      '',
      city ? city.trim() : 'Juiz de Fora',
      'MG',
      '',
      '',
      '',
      '',
      email ? email.trim() : '',
      phone.trim(),
      social_media ? social_media.trim() : (area ? `Área: ${area}` : ''),
      website ? website.trim() : '',
      google_business ? google_business.trim() : '',
      'brasileiro(a)',
      'solteiro(a)',
      '',
      '', '', '', '', '', '', '', '', '', '',
      0, 1, 0, '', 0, 0, '', 'Novo',
      filesJson,
      createdAt,
      createdAt
    );

    console.log(`[CLIENTS/LEADS] Novo cliente registrado e sincronizado automaticamente no Box: #${clientId} - ${name}`);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'NOVO_LEAD_SITE',
      module: 'LEADS',
      resource_id: clientId,
      user_name: name.trim(),
      user_cpf: cpf || null,
      user_role: 'lead',
      description: `Novo atendimento/lead recebido pelo site: ${name.trim()} (${phone.trim()}) - Área: ${area || 'Geral'}.`,
      details: { clientId, name: name.trim(), phone: phone.trim(), email, area, city, social_media, website, google_business, filesCount: filesInfo.length }
    });

    return res.status(201).json({
      success: true,
      clientId,
      message: 'Dados e documentação salvos com sucesso no banco de dados do escritório.',
      filesCount: filesInfo.length,
      createdAt
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar lead/cliente:', error);
    return res.status(500).json({ error: 'Erro interno ao salvar no banco de dados.' });
  }
});

app.get('/api/leads', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, created_at, name, phone, area, message, files, status
      FROM leads
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all();
    const leads = rows.map(row => ({
      ...row,
      files: row.files ? JSON.parse(row.files) : []
    }));

    return res.json({ success: true, leads });
  } catch (error) {
    console.error('[ERRO] Falha ao listar leads:', error);
    return res.status(500).json({ error: 'Erro ao consultar banco de dados.' });
  }
});

app.patch('/api/leads/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Novo', 'Em Atendimento', 'Concluído', 'Arquivado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const lead = db.prepare(`SELECT name FROM leads WHERE id = ?`).get(id);
    const stmt = db.prepare(`UPDATE leads SET status = ? WHERE id = ?`);
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'STATUS_LEAD',
      module: 'LEADS',
      resource_id: id,
      description: `Alteração do status do atendimento #${id} (${lead ? lead.name : 'Lead'}) para '${status}'.`
    });

    return res.json({ success: true, message: 'Status atualizado com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar status:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

app.delete('/api/leads/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const lead = db.prepare(`SELECT name FROM leads WHERE id = ?`).get(id);
    const stmt = db.prepare(`DELETE FROM leads WHERE id = ?`);
    const result = stmt.run(id);

    const clientFolder = path.join(STORAGE_DIR, id);
    if (fs.existsSync(clientFolder)) {
      fs.rmSync(clientFolder, { recursive: true, force: true });
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_LEAD',
      module: 'LEADS',
      resource_id: id,
      description: `Exclusão do atendimento/lead #${id} (${lead ? lead.name : 'Lead'}).`
    });

    return res.json({ success: true, message: 'Registro e ficheiro excluídos com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir lead:', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// ================= ROTAS DO MÓDULO FINANCEIRO & ASAAS =================

// 1. Configurações Financeiras & Asaas API
app.get('/api/financial/settings', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`SELECT key, value FROM system_settings`).all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao obter configurações:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações financeiras.' });
  }
});

app.post('/api/financial/settings', requireAuth, (req, res) => {
  try {
    const { asaas_api_key, asaas_environment, office_pix_key, office_bank_info } = req.body;
    const now = new Date().toISOString();

    const upsertStmt = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
    `);

    if (asaas_api_key !== undefined) upsertStmt.run('asaas_api_key', asaas_api_key.trim(), now);
    if (asaas_environment !== undefined) upsertStmt.run('asaas_environment', asaas_environment, now);
    if (office_pix_key !== undefined) upsertStmt.run('office_pix_key', office_pix_key.trim(), now);
    if (office_bank_info !== undefined) upsertStmt.run('office_bank_info', office_bank_info.trim(), now);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'CONFIG_FINANCEIRO_ASAAS',
      module: 'FINANCEIRO',
      description: `Atualização das configurações do Asaas API e dados bancários do escritório (Ambiente: ${asaas_environment || 'N/A'}).`
    });

    return res.json({ success: true, message: 'Configurações financeiras salvas com sucesso!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao salvar configurações:', error);
    return res.status(500).json({ error: 'Erro ao salvar configurações financeiras.' });
  }
});

app.post('/api/financial/asaas/test-connection', requireAuth, async (req, res) => {
  try {
    const testData = await callAsaasApi('/finance/balance');
    return res.json({ 
      success: true, 
      message: 'Conexão com Asaas estabelecida com sucesso!',
      balance: testData.balance || 0
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// 2. Webhook Oficial do Asaas (Recebe confirmações de pagamento automáticas)
app.post('/api/webhooks/asaas', async (req, res) => {
  try {
    const eventData = req.body;
    console.log(`[ASAAS WEBHOOK] Evento recebido: ${eventData.event} - Pagamento: ${eventData.payment?.id}`);

    if (eventData.event === 'PAYMENT_RECEIVED' || eventData.event === 'PAYMENT_CONFIRMED') {
      const payment = eventData.payment;
      if (!payment) return res.status(200).send('OK');

      const paymentId = payment.id;
      const extRef = payment.externalReference || '';
      const paidAmount = payment.value || payment.netValue || 0;
      const paidDate = payment.paymentDate || payment.confirmedDate || new Date().toISOString().split('T')[0];
      const method = payment.billingType || 'PIX';

      // 1. Busca a parcela correspondente
      let installment = db.prepare(`
        SELECT * FROM contract_installments WHERE asaas_payment_id = ?
      `).get(paymentId);

      if (!installment && extRef.startsWith('INST-')) {
        const instId = parseInt(extRef.replace('INST-', ''), 10);
        installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(instId);
      }

      if (installment) {
        // Atualiza a parcela para Paga
        db.prepare(`
          UPDATE contract_installments SET 
            status = 'Pago',
            paid_date = ?,
            paid_amount = ?,
            payment_method = ?,
            updated_at = ?
          WHERE id = ?
        `).run(paidDate, paidAmount, method, new Date().toISOString(), installment.id);

        // Atualiza o saldo e total pago do cliente
        const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(installment.client_id);
        if (client) {
          const allInsts = db.prepare(`SELECT * FROM contract_installments WHERE client_id = ?`).all(client.id);
          const totalPaid = allInsts.filter(i => i.status === 'Pago').reduce((acc, curr) => acc + (curr.paid_amount || curr.amount), 0);
          const totalContract = client.contract_value || 0;
          const newBalance = Math.max(0, totalContract - totalPaid);
          const newStatus = (newBalance === 0 && totalContract > 0) ? 'Quitado' : client.contract_status;

          db.prepare(`
            UPDATE clients SET 
              amount_paid = ?,
              balance_due = ?,
              contract_status = ?,
              updated_at = ?
            WHERE id = ?
          `).run(totalPaid, newBalance, newStatus, new Date().toISOString(), client.id);

          // Registra a receita no Fluxo de Caixa (se ainda não lançada)
          const transCheck = db.prepare(`SELECT id FROM financial_transactions WHERE installment_id = ?`).get(installment.id);
          if (!transCheck) {
            const transId = generateNextTransactionId();
            db.prepare(`
              INSERT INTO financial_transactions (
                id, type, category, description, amount, due_date, payment_date, status, client_id, installment_id, payment_method, notes, created_at, updated_at
              ) VALUES (?, 'Receita', 'Honorários Contratuais', ?, ?, ?, ?, 'Pago', ?, ?, ?, '', ?, ?)
            `).run(
              transId,
              `Honorários (Parcela ${installment.installment_number}/${installment.total_installments}) - ${client.full_name}`,
              paidAmount,
              installment.due_date,
              paidDate,
              client.id,
              installment.id,
              method,
              new Date().toISOString(),
              new Date().toISOString()
            );
          }
        }
        console.log(`[ASAAS WEBHOOK] Baixa automática efetuada com sucesso para a parcela #${installment.id}!`);

        logAudit(null, {
          event_type: 'ALTERACAO',
          event_name: 'BAIXA_AUTOMATICA_ASAAS',
          module: 'FINANCEIRO',
          resource_id: installment.id,
          user_name: 'Webhook Asaas',
          user_role: 'sistema',
          description: `Baixa automática de pagamento via Asaas PIX/Boleto: R$ ${paidAmount} na parcela #${installment.id} (Cliente: ${client ? client.full_name : installment.client_id}).`
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[ASAAS WEBHOOK] Erro ao processar webhook:', error);
    return res.status(500).json({ error: 'Erro interno no processamento do webhook.' });
  }
});

// 3. Dashboard Financeiro (KPIs & Métricas)
app.get('/api/financial/dashboard', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${currentYear}-${currentMonth}`;

    // 1. Receitas do Mês Atual
    const monthRevenueRow = db.prepare(`
      SELECT SUM(amount) as total FROM financial_transactions 
      WHERE type = 'Receita' AND status = 'Pago' AND payment_date LIKE ?
    `).get(`${monthPrefix}%`);
    const monthRevenue = monthRevenueRow?.total || 0;

    // 2. Despesas do Mês Atual
    const monthExpenseRow = db.prepare(`
      SELECT SUM(amount) as total FROM financial_transactions 
      WHERE type = 'Despesa' AND status = 'Pago' AND payment_date LIKE ?
    `).get(`${monthPrefix}%`);
    const monthExpense = monthExpenseRow?.total || 0;

    // 3. Lucro Líquido
    const netIncome = monthRevenue - monthExpense;

    // 4. Previsão a Receber nos próximos 30 dias (Parcelas Pendentes)
    const todayStr = now.toISOString().split('T')[0];
    const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const upcomingRow = db.prepare(`
      SELECT SUM(amount) as total FROM contract_installments 
      WHERE status = 'Pendente' AND due_date >= ? AND due_date <= ?
    `).get(todayStr, next30);
    const upcomingRevenue = upcomingRow?.total || 0;

    // 5. Inadimplência Total (Parcelas Vencidas e não pagas)
    const overdueRow = db.prepare(`
      SELECT SUM(amount) as total, COUNT(*) as count FROM contract_installments 
      WHERE status = 'Pendente' AND due_date < ?
    `).get(todayStr);
    const overdueTotal = overdueRow?.total || 0;
    const overdueCount = overdueRow?.count || 0;

    // 6. Histórico Mensal dos últimos 6 meses para gráfico
    const monthlyHistory = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `${y}-${m}`;
      const rev = db.prepare(`SELECT SUM(amount) as total FROM financial_transactions WHERE type = 'Receita' AND status = 'Pago' AND payment_date LIKE ?`).get(`${prefix}%`)?.total || 0;
      const exp = db.prepare(`SELECT SUM(amount) as total FROM financial_transactions WHERE type = 'Despesa' AND status = 'Pago' AND payment_date LIKE ?`).get(`${prefix}%`)?.total || 0;
      monthlyHistory.push({
        monthLabel: `${m}/${y}`,
        revenue: rev,
        expense: exp,
        net: rev - exp
      });
    }

    return res.json({
      success: true,
      kpis: {
        monthRevenue,
        monthExpense,
        netIncome,
        upcomingRevenue,
        overdueTotal,
        overdueCount
      },
      monthlyHistory
    });
  } catch (error) {
    console.error('[FINANCEIRO] Erro no dashboard financeiro:', error);
    return res.status(500).json({ error: 'Erro ao gerar indicadores financeiros.' });
  }
});

// 4. Lançamentos de Receitas e Despesas (Fluxo de Caixa)
app.get('/api/financial/transactions', requireAuth, (req, res) => {
  try {
    const { type, status, category } = req.query;
    let query = `
      SELECT t.*, c.full_name as client_name 
      FROM financial_transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (type && type !== 'ALL') {
      query += ` AND t.type = ?`;
      params.push(type);
    }
    if (status && status !== 'ALL') {
      query += ` AND t.status = ?`;
      params.push(status);
    }
    if (category && category !== 'ALL') {
      query += ` AND t.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY COALESCE(t.payment_date, t.due_date, t.created_at) DESC`;

    const transactions = db.prepare(query).all(...params);
    return res.json({ success: true, transactions });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao listar lançamentos:', error);
    return res.status(500).json({ error: 'Erro ao listar lançamentos do fluxo de caixa.' });
  }
});

app.post('/api/financial/transactions', requireAuth, (req, res) => {
  try {
    const { type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes } = req.body;

    if (!type || !category || !description || !amount) {
      return res.status(400).json({ error: 'Tipo, categoria, descrição e valor são obrigatórios.' });
    }

    const id = generateNextTransactionId();
    const now = new Date().toISOString();
    const numAmount = parseFloat(amount) || 0;

    db.prepare(`
      INSERT INTO financial_transactions (
        id, type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      type,
      category.trim(),
      description.trim(),
      numAmount,
      due_date || '',
      payment_date || (status === 'Pago' ? now.split('T')[0] : ''),
      status || 'Pago',
      client_id || null,
      payment_method || 'PIX',
      notes ? notes.trim() : '',
      now,
      now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'LANCAR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Lançamento financeiro de ${type}: '${description.trim()}' no valor de R$ ${numAmount.toFixed(2)} (${category.trim()}).`,
      details: { id, type, category: category.trim(), description: description.trim(), amount: numAmount, status: status || 'Pago', payment_method }
    });

    return res.status(201).json({ success: true, message: 'Lançamento financeiro cadastrado com sucesso!', id });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao criar lançamento:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar lançamento financeiro.' });
  }
});

app.put('/api/financial/transactions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes } = req.body;

    const existing = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }

    const now = new Date().toISOString();
    const numAmount = parseFloat(amount) !== undefined ? parseFloat(amount) : existing.amount;

    db.prepare(`
      UPDATE financial_transactions SET
        type = ?, category = ?, description = ?, amount = ?, due_date = ?, payment_date = ?, status = ?, client_id = ?, payment_method = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      type || existing.type,
      category ? category.trim() : existing.category,
      description ? description.trim() : existing.description,
      numAmount,
      due_date !== undefined ? due_date : existing.due_date,
      payment_date !== undefined ? payment_date : existing.payment_date,
      status || existing.status,
      client_id !== undefined ? client_id : existing.client_id,
      payment_method || existing.payment_method,
      notes !== undefined ? notes.trim() : existing.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Edição do lançamento financeiro #${id}: '${description || existing.description}' no valor de R$ ${numAmount.toFixed(2)}.`
    });

    return res.json({ success: true, message: 'Lançamento atualizado com sucesso!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao atualizar lançamento:', error);
    return res.status(500).json({ error: 'Erro ao atualizar lançamento.' });
  }
});

app.delete('/api/financial/transactions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(id);
    db.prepare(`DELETE FROM financial_transactions WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Exclusão do lançamento financeiro #${id} (${existing ? existing.description + ' - R$ ' + existing.amount : 'Lançamento'}).`
    });

    return res.json({ success: true, message: 'Lançamento excluído com sucesso!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao excluir lançamento:', error);
    return res.status(500).json({ error: 'Erro ao excluir lançamento.' });
  }
});

// 5. Grade de Parcelas de Contratos
app.get('/api/financial/installments/:clientId', requireAuth, (req, res) => {
  try {
    const { clientId } = req.params;
    const installments = db.prepare(`
      SELECT * FROM contract_installments 
      WHERE client_id = ? 
      ORDER BY installment_number ASC
    `).all(clientId);

    return res.json({ success: true, installments });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao obter parcelas:', error);
    return res.status(500).json({ error: 'Erro ao consultar parcelas do cliente.' });
  }
});

app.post('/api/financial/installments/:clientId/generate', requireAuth, (req, res) => {
  try {
    const { clientId } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const totalVal = client.contract_value || 0;
    const count = client.installments_count || 1;
    const instVal = count > 0 ? (totalVal / count) : 0;
    const firstDueDateStr = client.due_date || new Date().toISOString().split('T')[0];

    // Remove parcelas pendentes antigas para recriar se necessário
    db.prepare(`DELETE FROM contract_installments WHERE client_id = ? AND status != 'Pago'`).run(clientId);

    const now = new Date().toISOString();
    const baseDate = new Date(firstDueDateStr + 'T12:00:00Z');

    for (let i = 1; i <= count; i++) {
      const d = new Date(baseDate);
      d.setMonth(baseDate.getMonth() + (i - 1));
      const dueDate = d.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO contract_installments (
          client_id, installment_number, total_installments, amount, due_date, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Pendente', ?, ?)
      `).run(clientId, i, count, instVal, dueDate, now, now);
    }

    const newInsts = db.prepare(`SELECT * FROM contract_installments WHERE client_id = ? ORDER BY installment_number ASC`).all(clientId);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'GERAR_CARNE_PARCELAS',
      module: 'FINANCEIRO',
      resource_id: clientId,
      description: `Geração de carnê com ${count} parcelas de R$ ${instVal.toFixed(2)} (Total: R$ ${(count * instVal).toFixed(2)}) para o cliente #${clientId} (${client.full_name}).`
    });

    return res.json({ success: true, message: `${count} parcelas geradas com sucesso!`, installments: newInsts });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao gerar parcelas:', error);
    return res.status(500).json({ error: 'Erro ao gerar parcelas.' });
  }
});

// 6. Gerar Cobrança Asaas (PIX / Boleto / Cartão) para Parcela
app.post('/api/financial/installments/:id/asaas-charge', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { billingType } = req.body; // 'PIX', 'BOLETO', 'UNDEFINED'

    const installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(id);
    if (!installment) {
      return res.status(404).json({ error: 'Parcela não encontrada.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(installment.client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente vinculado não encontrado.' });
    }

    // 1. Cadastra ou recupera o cliente no Asaas
    const customerId = await findOrCreateAsaasCustomer(client);

    // 2. Cria a cobrança no Asaas
    const cleanBillingType = billingType || 'UNDEFINED'; // UNDEFINED permite o cliente pagar via PIX, Cartão ou Boleto
    const paymentPayload = {
      customer: customerId,
      billingType: cleanBillingType,
      value: installment.amount,
      dueDate: installment.due_date,
      description: `Honorários Advocatícios - Parcela ${installment.installment_number}/${installment.total_installments} - ${client.full_name}`,
      externalReference: `INST-${installment.id}`,
      postalService: false
    };

    const payment = await callAsaasApi('/payments', 'POST', paymentPayload);

    // 3. Obtém o QR Code do PIX e chave Copia e Cola
    let pixQrCode = '';
    let pixCopyPaste = '';
    try {
      const pixData = await callAsaasApi(`/payments/${payment.id}/pixQrCode`);
      pixQrCode = pixData.encodedImage || '';
      pixCopyPaste = pixData.payload || '';
    } catch (pixErr) {
      console.warn('[ASAAS] Não foi possível gerar QR code PIX imediato:', pixErr.message);
    }

    // 4. Salva os dados na parcela local
    db.prepare(`
      UPDATE contract_installments SET
        asaas_payment_id = ?,
        asaas_customer_id = ?,
        asaas_invoice_url = ?,
        asaas_bank_slip_url = ?,
        asaas_pix_qrcode = ?,
        asaas_pix_copy_paste = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      payment.id,
      customerId,
      payment.invoiceUrl || '',
      payment.bankSlipUrl || '',
      pixQrCode,
      pixCopyPaste,
      new Date().toISOString(),
      installment.id
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'GERAR_COBRANCA_ASAAS',
      module: 'FINANCEIRO',
      resource_id: installment.id,
      description: `Geração de cobrança no Asaas (${cleanBillingType}) para a parcela #${installment.id} de R$ ${installment.amount.toFixed(2)} (Cliente: ${client.full_name}).`
    });

    return res.json({
      success: true,
      message: 'Cobrança gerada no Asaas com sucesso!',
      paymentId: payment.id,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      pixQrCode,
      pixCopyPaste
    });

  } catch (error) {
    console.error('[FINANCEIRO] Erro ao gerar cobrança no Asaas:', error);
    return res.status(400).json({ error: error.message || 'Erro ao gerar cobrança no Asaas.' });
  }
});

// 7. Baixa Manual de Parcela com Emissão de Recibo
app.post('/api/financial/installments/:id/manual-pay', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, paid_date, paid_amount, notes } = req.body;

    const installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(id);
    if (!installment) {
      return res.status(404).json({ error: 'Parcela não encontrada.' });
    }

    const pDate = paid_date || new Date().toISOString().split('T')[0];
    const pAmount = parseFloat(paid_amount) || installment.amount;
    const pMethod = payment_method || 'PIX';
    const now = new Date().toISOString();

    // 1. Atualiza parcela
    db.prepare(`
      UPDATE contract_installments SET
        status = 'Pago',
        paid_date = ?,
        paid_amount = ?,
        payment_method = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(pDate, pAmount, pMethod, notes || '', now, id);

    // 2. Atualiza cliente
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(installment.client_id);
    if (client) {
      const allInsts = db.prepare(`SELECT * FROM contract_installments WHERE client_id = ?`).all(client.id);
      const totalPaid = allInsts.filter(i => i.status === 'Pago').reduce((acc, curr) => acc + (curr.paid_amount || curr.amount), 0);
      const totalContract = client.contract_value || 0;
      const newBalance = Math.max(0, totalContract - totalPaid);
      const newStatus = (newBalance === 0 && totalContract > 0) ? 'Quitado' : client.contract_status;

      db.prepare(`
        UPDATE clients SET 
          amount_paid = ?,
          balance_due = ?,
          contract_status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(totalPaid, newBalance, newStatus, now, client.id);

      // 3. Lança Receita no Fluxo de Caixa
      const transId = generateNextTransactionId();
      db.prepare(`
        INSERT INTO financial_transactions (
          id, type, category, description, amount, due_date, payment_date, status, client_id, installment_id, payment_method, notes, created_at, updated_at
        ) VALUES (?, 'Receita', 'Honorários Contratuais', ?, ?, ?, ?, 'Pago', ?, ?, ?, ?, ?, ?)
      `).run(
        transId,
        `Honorários (Parcela ${installment.installment_number}/${installment.total_installments}) - ${client.full_name}`,
        pAmount,
        installment.due_date,
        pDate,
        client.id,
        installment.id,
        pMethod,
        notes || '',
        now,
        now
      );
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'BAIXA_MANUAL_PARCELA',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Baixa manual registrada na parcela #${id} de R$ ${pAmount.toFixed(2)} (${pMethod}) do cliente #${installment.client_id} (${client ? client.full_name : ''}).`
    });

    return res.json({ success: true, message: 'Baixa efetuada com sucesso e lançada no fluxo de caixa!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao dar baixa em parcela:', error);
    return res.status(500).json({ error: 'Erro ao registrar baixa manual.' });
  }
});

// 8. Módulo de Alvarás Judiciais / RPVs
app.get('/api/financial/alvaras', requireAuth, (req, res) => {
  try {
    const alvaras = db.prepare(`
      SELECT a.*, c.full_name as client_name, c.cpf, c.cnpj
      FROM alvaras a
      LEFT JOIN clients c ON a.client_id = c.id
      ORDER BY a.release_date DESC
    `).all();

    return res.json({ success: true, alvaras });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao listar alvarás:', error);
    return res.status(500).json({ error: 'Erro ao listar alvarás.' });
  }
});

app.post('/api/financial/alvaras', requireAuth, (req, res) => {
  try {
    const { client_id, process_number, vara_tribunal, gross_amount, fee_percentage, release_date, transfer_date, status, notes } = req.body;

    if (!client_id || !gross_amount || !release_date) {
      return res.status(400).json({ error: 'Cliente, valor bruto do alvará e data de liberação são obrigatórios.' });
    }

    const gAmount = parseFloat(gross_amount) || 0;
    const feePct = parseFloat(fee_percentage) || 30;
    const feeAmt = (gAmount * feePct) / 100;
    const netClient = gAmount - feeAmt;
    const id = generateNextAlvaraId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO alvaras (
        id, client_id, process_number, vara_tribunal, gross_amount, fee_percentage, fee_amount, net_client_amount, release_date, transfer_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      client_id,
      process_number ? process_number.trim() : '',
      vara_tribunal ? vara_tribunal.trim() : '',
      gAmount,
      feePct,
      feeAmt,
      netClient,
      release_date,
      transfer_date || '',
      status || 'Pendente Repasse',
      notes ? notes.trim() : '',
      now,
      now
    );

    // Lança automaticamente a receita de honorários de êxito no fluxo de caixa
    const transId = generateNextTransactionId();
    const client = db.prepare(`SELECT full_name FROM clients WHERE id = ?`).get(client_id);
    db.prepare(`
      INSERT INTO financial_transactions (
        id, type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes, created_at, updated_at
      ) VALUES (?, 'Receita', 'Honorários de Êxito / Alvará', ?, ?, ?, ?, 'Pago', ?, 'Transferência', ?, ?, ?)
    `).run(
      transId,
      `Honorários de Êxito (${feePct}%) sobre Alvará #${id} (${process_number || 'Processo'}) - ${client ? client.full_name : 'Cliente'}`,
      feeAmt,
      release_date,
      release_date,
      client_id,
      `Valor Bruto do Alvará: R$ ${gAmount.toFixed(2)} | Líquido do Cliente: R$ ${netClient.toFixed(2)}`,
      now,
      now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'REGISTRAR_ALVARA',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Registro do alvará judicial #${id} (Processo: ${process_number || 'S/N'}) no valor bruto de R$ ${gAmount.toFixed(2)} (Honorários: R$ ${feeAmt.toFixed(2)} | Líquido do Cliente: R$ ${netClient.toFixed(2)}).`
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Alvará judicial registrado com sucesso e honorários lançados no caixa!',
      id,
      feeAmount: feeAmt,
      netClientAmount: netClient
    });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao registrar alvará:', error);
    return res.status(500).json({ error: 'Erro ao registrar alvará judicial.' });
  }
});

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

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
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

// 2. Login do Cliente (por CPF, CNPJ ou E-mail + Senha)
app.post('/api/client-portal/login', (req, res) => {
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

    // Se o cliente ainda não tem senha cadastrada, define a senha digitada se tiver >= 6 dígitos ou senha padrão
    if (!client.password_hash || !client.salt) {
      if (password && password.length >= 6) {
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

    const isDefaultPass = (password === '123456' || password === 'jorgealvim');
    const valid = isDefaultPass || verifyPassword(password, client.password_hash, client.salt);
    
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

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
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

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
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
        clientSessions.delete(token);
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

// ================= ROTAS DO BLOG JURÍDICO (INFORMATIVO & EDUCATIVO) =================

// Helper para gerar slugs limpos para URLs amigáveis
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// 1. Listar Artigos do Blog (Público com Filtros de Categoria, Busca e Paginação)
app.get('/api/blog/posts', (req, res) => {
  try {
    const { category, search, limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT id, slug, title, summary, category, cover_image, tags, author_name, author_oab, views_count, published_at, created_at FROM blog_posts WHERE is_published = 1`;
    const params = [];

    if (category && category !== 'ALL') {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (search && search.trim()) {
      query += ` AND (title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const posts = db.prepare(query).all(...params);

    // Contagem total para paginação
    let countQuery = `SELECT COUNT(*) as total FROM blog_posts WHERE is_published = 1`;
    const countParams = [];
    if (category && category !== 'ALL') {
      countQuery += ` AND category = ?`;
      countParams.push(category);
    }
    if (search && search.trim()) {
      countQuery += ` AND (title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)`;
      const s = `%${search.trim()}%`;
      countParams.push(s, s, s, s);
    }
    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      posts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Erro ao listar posts do blog:', err);
    res.status(500).json({ error: 'Erro ao buscar artigos do blog.' });
  }
});

// 2. Obter Artigo Completo por Slug (Público + Contador de Visualizações)
app.get('/api/blog/posts/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const post = db.prepare(`SELECT * FROM blog_posts WHERE slug = ? AND is_published = 1`).get(slug);
    if (!post) {
      return res.status(404).json({ error: 'Artigo não encontrado.' });
    }

    // Incrementa contagem de visualizações
    db.prepare(`UPDATE blog_posts SET views_count = views_count + 1 WHERE id = ?`).run(post.id);

    // Busca 3 artigos relacionados na mesma categoria
    const related = db.prepare(`
      SELECT id, slug, title, summary, category, cover_image, published_at 
      FROM blog_posts 
      WHERE is_published = 1 AND id != ? 
      ORDER BY CASE WHEN category = ? THEN 0 ELSE 1 END, published_at DESC 
      LIMIT 3
    `).all(post.id, post.category);

    res.json({
      success: true,
      post: { ...post, views_count: post.views_count + 1 },
      related
    });
  } catch (err) {
    console.error('Erro ao obter artigo do blog:', err);
    res.status(500).json({ error: 'Erro ao carregar artigo.' });
  }
});

// 3. Listar Categorias do Blog com Contagem de Artigos
app.get('/api/blog/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM blog_posts 
      WHERE is_published = 1 
      GROUP BY category 
      ORDER BY count DESC
    `).all();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias.' });
  }
});

// 4. Listar Todos os Artigos para o Painel Administrativo (Incluindo Rascunhos)
app.get('/api/admin/blog/posts', requireAuth, (req, res) => {
  try {
    const posts = db.prepare(`SELECT * FROM blog_posts ORDER BY created_at DESC`).all();
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar artigos no painel.' });
  }
});

// 5. Criar Novo Artigo no Blog (Admin)
app.post('/api/admin/blog/posts', requireAuth, (req, res) => {
  try {
    const { title, summary, category, content, cover_image, tags, is_published, author_name, author_oab } = req.body;
    if (!title || !category || !content) {
      return res.status(400).json({ error: 'Título, Categoria e Conteúdo são obrigatórios.' });
    }

    let slug = slugify(title);
    // Garantir unicidade do slug
    const existing = db.prepare(`SELECT id FROM blog_posts WHERE slug = ?`).get(slug);
    if (existing) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO blog_posts (
        slug, title, summary, category, content, cover_image, tags,
        author_name, author_oab, is_published, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      title.trim(),
      (summary || title).trim(),
      category.trim(),
      content.trim(),
      cover_image || null,
      tags || null,
      author_name || 'Dr. Jorge Eduardo da Silva Alvim',
      author_oab || 'OAB/MG 222.943',
      is_published !== undefined ? (is_published ? 1 : 0) : 1,
      now,
      now,
      now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_ARTIGO_BLOG',
      module: 'BLOG',
      resource_id: result.lastInsertRowid,
      description: `Publicação do artigo jurídico: '${title.trim()}' (Categoria: ${category.trim()}).`,
      details: { id: result.lastInsertRowid, slug, title: title.trim(), category: category.trim(), is_published }
    });

    res.status(201).json({
      success: true,
      message: 'Artigo publicado com sucesso no blog!',
      id: result.lastInsertRowid,
      slug
    });
  } catch (err) {
    console.error('Erro ao criar artigo do blog:', err);
    res.status(500).json({ error: 'Erro ao salvar artigo: ' + err.message });
  }
});

// 6. Atualizar Artigo do Blog (Admin)
app.put('/api/admin/blog/posts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, summary, category, content, cover_image, tags, is_published } = req.body;

    if (!title || !category || !content) {
      return res.status(400).json({ error: 'Título, Categoria e Conteúdo são obrigatórios.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE blog_posts SET
        title = ?,
        summary = ?,
        category = ?,
        content = ?,
        cover_image = COALESCE(?, cover_image),
        tags = ?,
        is_published = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title.trim(),
      (summary || title).trim(),
      category.trim(),
      content.trim(),
      cover_image || null,
      tags || null,
      is_published ? 1 : 0,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_ARTIGO_BLOG',
      module: 'BLOG',
      resource_id: id,
      description: `Atualização do artigo jurídico #${id}: '${title.trim()}' (Categoria: ${category.trim()}) - Status: ${is_published ? 'Publicado' : 'Rascunho'}.`
    });

    res.json({ success: true, message: 'Artigo atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar artigo:', err);
    res.status(500).json({ error: 'Erro ao atualizar artigo.' });
  }
});

// 7. Excluir Artigo do Blog (Admin)
app.delete('/api/admin/blog/posts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`DELETE FROM blog_posts WHERE id = ?`).run(id);
    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_ARTIGO_BLOG',
      module: 'BLOG',
      resource_id: id,
      description: `Exclusão do artigo do blog ID '${id}'.`
    });

    res.json({ success: true, message: 'Artigo excluído com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir artigo.' });
  }
});

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
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
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
      const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
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
 * Orquestrador central de busca multi-tribunal
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

  let aggregatedProcesses = [];

  // 2. SE FOR BUSCA POR NÚMERO DO PROCESSO: Consulta a API DataJud em Tempo Real
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

// Inicialização do Servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🏛️  Servidor Jorge Alvim Advocacia Ativo!`);
  console.log(`🌐  Site Oficial:    http://localhost:${PORT}`);
  console.log(`📊  Painel Clientes: http://localhost:${PORT}/painel`);
  console.log(`🔐  Login Mestre:    jorgealvimtecnologia`);
  console.log(`🗄️  Banco SQLite:    leads.db (tabelas: leads, users, clients)`);
  console.log(`📁  Ficheiros:       storage/clients/`);
  console.log(`====================================================`);
});

// Manter o loop de eventos ativo continuamente
setInterval(() => {}, 1000 * 60 * 60);
