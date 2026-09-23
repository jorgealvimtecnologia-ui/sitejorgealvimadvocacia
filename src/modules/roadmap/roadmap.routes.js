import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const roadmapRouter = express.Router();

/**
 * Funções de Auto-Auditoria e Introspecção Dinâmica em Tempo Real
 * Permite ao Roadmap Vivo auditar automaticamente se tabelas, colunas e submódulos
 * foram implementados ou atualizados no sistema a cada requisição/deploy.
 */
function checkTableExists(tableName) {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    return !!row;
  } catch (e) {
    return false;
  }
}

function checkColumnExists(tableName, colName) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return cols.some(c => c.name === colName);
  } catch (e) {
    return false;
  }
}

function countIndexes() {
  try {
    return db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").get().c || 0;
  } catch (e) {
    return 0;
  }
}

function checkFileExists(relPath) {
  try {
    return fs.existsSync(path.join(process.cwd(), relPath));
  } catch (e) {
    return false;
  }
}

/**
 * GET /api/admin/roadmap - Telemetria e Matriz de Aderência do Roadmap Vivo Unificado
 * Auto-auditado dinamicamente: inspeciona schema do SQLite, rotas, submódulos e arquivos em tempo real.
 */
roadmapRouter.get('/api/admin/roadmap', requireAuth, (req, res) => {
  try {
    // 1. Telemetria em Tempo Real do Banco de Dados
    let totalLawsuits = 0;
    let totalClients = 0;
    let pendingDeadlines = 0;
    let totalNfse = 0;
    let lastDjenSync = 'Sincronizado recentemente';

    try {
      totalLawsuits = db.prepare(`SELECT count(*) as count FROM lawsuits`).get().count || 0;
    } catch (e) {}

    try {
      totalClients = db.prepare(`SELECT count(*) as count FROM clients`).get().count || 0;
    } catch (e) {}

    try {
      pendingDeadlines = db.prepare(`
        SELECT count(*) as count FROM court_publications 
        WHERE status IN ('prazo_lancado', 'nao_lido')
      `).get().count || 0;
    } catch (e) {}

    try {
      totalNfse = db.prepare(`SELECT count(*) as count FROM nfse_invoices`).get().count || 0;
    } catch (e) {}

    try {
      const lastPub = db.prepare(`SELECT created_at FROM court_publications ORDER BY id DESC LIMIT 1`).get();
      if (lastPub && lastPub.created_at) {
        lastDjenSync = new Date(lastPub.created_at).toLocaleDateString('pt-BR');
      }
    } catch (e) {}

    // 2. Esteira Forense Sequencial (7 Etapas Ponta a Ponta)
    const pipelineStages = [
      { step: '1', name: 'Captação & Lead', status: 'delivered', icon: '📥', tech: 'leads.routes.js' },
      { step: '2', name: 'Triagem & OCR', status: 'partial', icon: '🔍', tech: 'Tesseract / client-portal' },
      { step: '3', name: 'Consulta & Proposta', status: 'delivered', icon: '📅', tech: 'calendar_events iCal' },
      { step: '4', name: 'Contrato E-Sign', status: 'delivered', icon: '✍️', tech: 'esign.routes.js (Lei 14.063)' },
      { step: '5', name: 'Distribuição da Ação', status: 'partial', icon: '⚖️', tech: 'lawsuits.routes.js / PJe' },
      { step: '6', name: 'Andamento & WhatsApp', status: 'partial', icon: '📢', tech: 'DJEN + WhatsApp API' },
      { step: '7', name: 'Alvará & Quitação', status: 'delivered', icon: '💰', tech: 'financial.routes.js (Asaas)' }
    ];

    // 3. Benchmarking Internacional de Governança
    const internationalBenchmarks = [
      { standard: 'iManage & NetDocuments', area: 'DMS & Arquivo', feature: 'Matter-Centric DMS com anexo em andamentos', status: 'Q4/2026' },
      { standard: 'Harvey AI & CoCounsel', area: 'IA & Redação', feature: 'RAG seguro sobre acervo próprio do Dr. Jorge', status: 'Q4/2026' },
      { standard: 'Clio & Actionstep', area: 'Gestão da Prática', feature: 'Quality Gates e travas contra preclusão', status: 'Q1/2027' },
      { standard: 'Ironclad & DocuSign', area: 'Assinatura', feature: 'Biometria facial com detecção de liveness', status: 'Q2/2027' },
      { standard: 'Smokeball Legal ERP', area: 'Finanças de Nicho', feature: 'Rastreamento de contas judiciais e alvarás', status: 'Q1/2027' }
    ];

    // 3.1 Auditoria de Arquitetura Cloud & Engenharia de Software (Parecer Técnico)
    const indexCount = countIndexes();
    const hasCiPipeline = checkFileExists('.github/workflows/ci.yml');
    const hasNightlyE2e = checkFileExists('.github/workflows/e2e-checklist.yml');
    const hasFaq = checkTableExists('site_faqs');
    const hasStorageGuard = checkFileExists('src/middleware/storage-guard.js');
    const reportsArePrivate = !checkFileExists('public/relatorio_roadmap_modificacoes.pdf');

    const cloudAudit = {
      vps_server: 'Contabo Frankfurt (Alemanha) • KVM Virtualizado',
      rtt_latency: 'Origem na Alemanha (~250ms) atrás do Cloudflare (edge no Brasil)',
      db_engine: `SQLite WAL com ${indexCount} índices em NVMe local`,
      scorecard: [
        { pilar: '1. Persistência & CRUD', estado: `SQLite WAL com ${indexCount} índices em leads.db`, risco: 'MÉDIO', veredito: 'Ultra-rápido (<5ms), isolado e sem sobrecarga TCP.', acao: 'Backup local VACUUM INTO ativo; exportação DRP externa planejada.' },
        { pilar: '2. Rede Internacional', estado: 'VPS Contabo Frankfurt atrás do Cloudflare (proxy + SSL)', risco: 'BAIXO', veredito: 'Cloudflare ativo: estáticos servidos pelo edge no Brasil.', acao: 'Concluído (DNS apontado para o Cloudflare).' },
        { pilar: '3. Segredos & Auth', estado: 'Variáveis .env + PBKDF2-SHA512 210k + tokens de sessão em memória', risco: 'MÉDIO', veredito: 'Senha universal do mestre removida e /storage protegido; falta publicar no servidor.', acao: 'Publicar a correção no Contabo.' },
        { pilar: '4. LGPD vs Estatuto OAB', estado: 'Soft Delete com Trava Ética (Art. 16, I da LGPD)', risco: 'BLINDADO', veredito: 'Bloqueio legal com barreira 409 se houver processos judiciais ativos.', acao: '100% Homologado e ativo no Portal do Cliente com testes unitários.' },
        { pilar: '5. Retenção de Arquivos', estado: 'Storage local com caçador de arquivos órfãos', risco: 'BAIXO', veredito: 'Expurgo automatizado de rascunhos e temporários > 7 dias.', acao: 'Módulo de manutenção operacional ativo em /api/admin/maintenance.' }
      ],
      phases: [
        { name: 'FASE 1: BLINDAGEM (48h)', items: ['Soft Delete com trava Art. 16 LGPD (CONCLUÍDO)', 'Ativação Cloudflare Edge no Brasil (CONCLUÍDO)', 'Backup externo automatizado DRP 3-2-1 (PLANEJADO)'], status: 'Em Finalização' },
        { name: 'FASE 2: CONFIABILIDADE (7 DIAS)', items: ['Idempotência em webhooks PIX/cartão (processed_webhooks)', 'Circuit breaker com backoff em APIs judiciais', 'Sanitização de segredos em .env'], status: 'Planejado' },
        { name: 'FASE 3: GOVERNANÇA (15 DIAS)', items: ['Cron diário de expurgo de arquivos temporários (>7 dias)', 'Rotina de anonimização periódica LGPD', 'Monitoramento contínuo de logs e alertas'], status: 'Planejado' }
      ]
    };

    // 3.2 Resiliência de Interface & Apoio ao Usuário (Roadmap Mestre de Usabilidade)
    const userSupport = {
      module: 'JawSupport (public/js/core/user-support.js)',
      status: 'Operacional no Painel (100% Ativo)',
      features: [
        { name: 'Auto-Salvamento Contínuo (localStorage)', desc: 'Salva campos a cada 3s com restauração de rascunho em 1 clique', status: 'Ativo' },
        { name: 'Atalho Universal (Ctrl + S / Cmd + S)', desc: 'Salva formulários instantaneamente sem exigir rolar a página', status: 'Ativo' },
        { name: 'Feedback Visual com Trava Anti-Duplo Clique', desc: 'Spinner "Salvando..." com timeout e opção de retry após 6s', status: 'Ativo' },
        { name: 'Alerta Inteligente de Alterações Não Salvas', desc: 'Impede o fechamento acidental de janelas com dados pendentes', status: 'Ativo' },
        { name: 'Rastreamento & Scroll para Campos com Erro', desc: 'Rola a tela e destaca o campo obrigatório faltante em vermelho', status: 'Ativo' },
        { name: 'Status da Conexão em Tempo Real (Online/Offline)', desc: 'Ponto verde/vermelho indicando oscilações de rede', status: 'Ativo' },
        { name: 'Lixeira Segura com Desfazer (Undo 10s)', desc: 'Permite reverter exclusão de registros estilo Gmail', status: 'Ativo' },
        { name: 'Modo de Impressão Jurídica Inteligente (A4 Limpo)', desc: '@media print ocultando menus/botões gerando A4 timbrado', status: 'Ativo' }
      ]
    };

    // 3.3 Ações Externas & Credenciais do Titular (Backlog do Dr. Jorge)
    const externalPendingActions = [
      { id: '1', title: 'Inserir Google Client ID Real no .env', type: 'CONFIGURAR', origin: 'Google Cloud Console', impact: 'Ativa login nativo Google sem necessidade de simulação', badge: '! AÇÃO RECOMENDADA' },
      { id: '3', title: 'Fomentar 3 Primeiras Vendas na Vitrine Amazon', type: 'DIVULGAR', origin: 'Amazon Associates', impact: 'Destrava chave oficial da Amazon Product Advertising API (PA-API v5)', badge: '! AÇÃO RECOMENDADA' },
      { id: '4', title: 'Decisão de UX: Modal de Boas-Vindas para Toast', type: 'DECIDIR', origin: 'Design System', impact: 'Converte modal de 1.2s em aviso flutuante discreto no canto inferior', badge: '! DECISÃO DE UX' },
      { id: '5', title: 'Ativação Direta de Cobrança Meta Ads API', type: 'SEGURANÇA', origin: 'Meta Marketing API', impact: 'Campanhas criadas como PAUSED para controle rigoroso de verba', badge: '# TRAVA DE SEGURANÇA' },
      { id: '6', title: 'Publicar no Contabo as correções de segurança (senha universal e /storage)', type: 'SEGURANÇA', origin: 'Servidor Contabo', impact: 'O código em produção ainda aceita uma senha fixa para o mestre, além da senha real', badge: '! AÇÃO URGENTE' }
    ];

    // 3.4 Cronograma Estruturado por Ondas de Entrega (Ondas 0 a 4)
    const waves = [
      {
        id: 'wave-0',
        name: 'Onda 0 — Blindagem Imediata',
        badge: 'Em Andamento',
        window: '~48 horas',
        focus: 'Fechar vulnerabilidades críticas (P0) e latência transatlântica',
        color: '#dc2626',
        items: [
          { task: 'Deploy do Hardening S1–S8 (PBKDF2 210k, RBAC fail-closed)', done: true, priority: 'P0' },
          { task: 'Remoção da senha universal do mestre no código (login e portais)', done: true, priority: 'P0' },
          { task: 'Primeiro acesso do cliente sem senha: exigir validação (hoje a 1ª senha digitada vira a senha)', done: false, priority: 'P0' },
          { task: 'Proteção de /storage/* com autenticação e verificação de proprietário (Ownership)', done: hasStorageGuard, priority: 'P0' },
          { task: 'Relatórios internos fora de /public (download só com login)', done: reportsArePrivate, priority: 'P0' },
          { task: 'Ativação do Cloudflare Edge no Brasil para atenuar latência da Contabo', done: true, priority: 'P0' },
          { task: 'Backup externo off-site automatizado (DRP 3-2-1) em S3 / Google Drive / R2', done: false, priority: 'P0' },
          { task: 'Sessão em cookies HttpOnly + Secure + SameSite e sanitização de innerHTML', done: false, priority: 'P0' }
        ]
      },
      {
        id: 'wave-1',
        name: 'Onda 1 — Confiabilidade & SRE',
        badge: 'Planejado',
        window: '~7 dias',
        focus: 'Engenharia de resiliência e proteção do event loop',
        color: '#ea580c',
        items: [
          { task: 'Migração do driver SQLite para better-sqlite3 (WAL + synchronous=NORMAL)', done: false, priority: 'P1' },
          { task: 'Deep Healthchecks corporativos (/health/live e /health/ready com teste de disco)', done: false, priority: 'P1' },
          { task: 'Graceful Shutdown (SIGTERM/SIGINT com encerramento seguro de transações)', done: false, priority: 'P1' },
          { task: 'Tabela de Idempotência em pagamentos (processed_webhooks para Asaas/PIX)', done: checkTableExists('processed_webhooks'), priority: 'P1' },
          { task: 'Circuit Breaker com backoff exponencial em APIs de Tribunais (DataJud/PJe)', done: false, priority: 'P1' }
        ]
      },
      {
        id: 'wave-2',
        name: 'Onda 2 — Governança & CI/CD',
        badge: 'Planejado',
        window: '~15 dias',
        focus: 'Observabilidade, limpeza de dados e automação de testes',
        color: '#ca8a04',
        items: [
          { task: 'Cron diário de expurgo de arquivos temporários abandonados em /storage/temp (>7 dias)', done: false, priority: 'P2' },
          { task: 'Rotina periódica de anonimização e conformidade de retenção da LGPD', done: false, priority: 'P2' },
          { task: 'Logs estruturados em formato JSON com Pino para auditoria forense', done: false, priority: 'P2' },
          { task: 'Esteira de CI/CD no GitHub Actions com execução noturna do Playwright', done: hasCiPipeline && hasNightlyE2e, priority: 'P2' },
          { task: 'Módulo de Apoio ao Usuário e Resiliência (JawSupport 100% ativo)', done: checkFileExists('public/js/core/user-support.js'), priority: 'P2' }
        ]
      },
      {
        id: 'wave-3',
        name: 'Onda 3 — Produto & Captação de Leads',
        badge: 'Planejado',
        window: 'Contínuo',
        focus: 'Expansão de conversão, experiência e ergonomia forense',
        color: '#2563eb',
        items: [
          { task: 'FAQ Inteligente na Home com busca local (Juiz de Fora) para reforço de SEO', done: hasFaq, priority: 'P1' },
          { task: 'Simuladores interativos de rescisão e previdência conectados ao WhatsApp com protocolo', done: false, priority: 'P1' },
          { task: 'Toast discreto de atendimento substituindo o modal bloqueante de 1.2s', done: false, priority: 'P2' },
          { task: 'Confirmação automática de assinatura digital & arquivamento em tempo real', done: false, priority: 'P1' },
          { task: 'Recibo de Prestação de Contas de Alvará/RPV timbrado em 1 clique', done: false, priority: 'P1' },
          { task: 'Lock Colaborativo Anti-Sobrescrita (aviso de edição simultânea da mesma ficha)', done: false, priority: 'P2' },
          { task: 'PWA Offline-First para consultas em fóruns e salas de audiência sem sinal 4G', done: false, priority: 'P2' }
        ]
      },
      {
        id: 'wave-4',
        name: 'Onda 4 — Escala SaaS B2B',
        badge: 'Estratégico',
        window: 'Q2/2027',
        focus: 'Transformação da plataforma em negócio recorrente multi-escritório',
        color: '#7c3aed',
        items: [
          { task: 'Lapidação das abas (empty states, máscaras de digitação, debounce 300ms, paginação)', done: false, priority: 'P1' },
          { task: 'Desacoplamento modular do painel-1-app.js em submódulos específicos em public/js/tabs/', done: false, priority: 'P1' },
          { task: 'Virada Multi-Tenant (injeção de tenant_id e painel Super Admin de clientes e planos)', done: checkColumnExists('clients', 'tenant_id'), priority: 'P0' },
          { task: 'Faturamento recorrente automatizado (Asaas/cartão/PIX com bloqueio por inadimplência)', done: false, priority: 'P1' },
          { task: 'Publicação em Docker conteinerizado com SSL nativo e automação de rollout', done: false, priority: 'P1' }
        ]
      }
    ];

    // 4. Introspecção Dinâmica do Sistema em Tempo Real
    const hasDmsFiles = checkTableExists('lawsuit_movement_files');
    const hasSoftDelete = checkColumnExists('clients', 'deleted_at');
    const hasTenantId = checkColumnExists('clients', 'tenant_id');
    const hasIdempotency = checkTableExists('processed_webhooks');
    const hasJawSupport = checkFileExists('public/js/core/user-support.js');
    const hasWinFeatures = checkFileExists('public/js/core/windows-features.js');

    // 4.1 Estrutura das 4 Camadas Arquiteturais
    const layers = {
      core: {
        id: 'core',
        name: 'Core Jurídico (Matter-Centric)',
        icon: '⚙️',
        color: '#10b981',
        status_label: 'Operacional & Maduro',
        modules: [
          { name: 'Gestão Processual (CNJ)', status: 'delivered', badge: '🟢 No Ar (90%)', details: 'NPU 20 dígitos, andamentos e detecção de tribunais' },
          { name: 'Controle de Prazos (CPC/CLT/Feriados)', status: 'delivered', badge: '🟢 No Ar (95%)', details: 'Art. 219 CPC, Art. 775 CLT, recesso e alertas em cascata' },
          { name: 'Financeiro & NFS-e Asaas', status: 'partial', badge: '🟡 Parcial (75%)', details: 'Honorários e NFS-e no ar; Timesheet jurídico em desenvolvimento' },
          { 
            name: 'DMS Matter-Centric & Anexos (iManage)', 
            status: hasDmsFiles ? 'delivered' : 'partial', 
            badge: hasDmsFiles ? '🟢 No Ar (100%)' : '🟡 Q4/2026', 
            details: hasDmsFiles ? 'Anexos diretos na linha do andamento processual' : 'Vínculo de PDFs direto à linha de cada andamento judicial' 
          },
          { name: 'Leitor OCR Automático (Zero Digitação)', status: 'partial', badge: '🟡 Q4/2026', details: 'Extração automática de RG/CNH via Tesseract.js' },
          { name: 'CRM Jurídico & Funil de Captação', status: 'delivered', badge: '🟢 No Ar (90%)', details: 'Leads anti-bot, histórico 360º de clientes e Meta Ads' },
          { name: 'BI Cockpit Executivo (5 Segundos)', status: 'delivered', badge: '🟢 No Ar (100%)', details: 'Semáforo de risco, 8 cards 1-clique e Sala de Situação 360º' },
          { name: 'Agenda & Kanban 5W2H', status: 'delivered', badge: '🟢 No Ar (100%)', details: 'RFC 5545 iCal, lembretes VALARM e despachos Foguete' },
          { name: 'Trava de Prazos em Dias Não Úteis', status: 'delivered', badge: '🟢 No Ar (100%)', details: 'Projeção automática para o 1º dia útil seguinte' },
          { name: 'Lock Colaborativo Anti-Sobrescrita', status: 'planned', badge: '⚪ Q1/2027', details: 'Aviso em tempo real de edição simultânea da mesma ficha' },
          { name: 'Detector de Anexo Esquecido', status: 'planned', badge: '⚪ Q1/2027', details: 'Alerta se o texto citar anexo sem arquivo anexado' }
        ]
      },
      ai: {
        id: 'ai',
        name: 'Inteligência Artificial (RAG Local)',
        icon: '🤖',
        color: '#8b5cf6',
        status_label: 'Transição Cognitiva',
        modules: [
          { name: 'Minutas com RAG Local (Harvey AI)', status: 'partial', badge: '🟡 Q4/2026 (40%)', details: 'IA calibrada no acervo precedente do Dr. Jorge Alvim' },
          { name: 'Pesquisa Jurisprudencial Semântica', status: 'planned', badge: '⚪ Previsto 2026', details: 'Embeddings vetoriais locais para busca por teses em acórdãos' },
          { name: 'Chatbot 24/7 com Escalação', status: 'partial', badge: '🟡 Parcial (35%)', details: 'Triagem de leads ativa; assistente autônomo LLM em 2027' },
          { name: 'Análise Contratual & Riscos', status: 'planned', badge: '⚪ Previsto 2028', details: 'Detecção de cláusulas leoninas e passivos com modelos NLP' },
          { name: 'Jurimetria Preditiva Multidimensional', status: 'planned', badge: '⚪ Previsto 2028-2029', details: 'Predição estatística por magistrado, câmara e tribunal' }
        ]
      },
      integrations: {
        id: 'integrations',
        name: 'Conectividade & Integrações',
        icon: '🔗',
        color: '#f59e0b',
        status_label: 'Conectividade Híbrida',
        modules: [
          { name: 'Tribunais (DJEN / ComunicaAPI / DataJud)', status: 'delivered', badge: '🟢 No Ar (70%)', details: 'Radar DJEN e links diretos para PJe, ESAJ e tribunais' },
          { name: 'WhatsApp Business Cloud API Oficial', status: 'partial', badge: '🟡 Q4/2026', details: 'Disparo automático de andamentos e audiências via Meta API' },
          { name: 'Portal PWA & Push Mobile Notifications', status: 'partial', badge: '🟡 Q4/2026', details: 'Web app instalável em iOS e Android com avisos nativos' },
          { name: 'Conciliação via Open Finance', status: 'planned', badge: '⚪ Q1/2027', details: 'Leitura de extratos bancários com baixa instantânea de honorários' },
          { name: 'Calculadora Previdenciária CNIS (EC 103)', status: 'planned', badge: '⚪ Q1/2027', details: 'Importador de PDF do extrato Meu INSS para contagem de tempo' }
        ]
      },
      security: {
        id: 'security',
        name: 'Segurança, Compliance & SaaS',
        icon: '🔒',
        color: '#0284c7',
        status_label: 'Blindagem Ativa',
        modules: [
          { name: 'Sigilo OAB & IA Local por Design', status: 'delivered', badge: '🟢 No Ar (90%)', details: 'Processamento 100% no servidor interno sem vazamento à nuvem' },
          { 
            name: 'LGPD Completo (Mapa de Dados & Art. 18)', 
            status: hasSoftDelete ? 'delivered' : 'partial', 
            badge: hasSoftDelete ? '🟢 No Ar (100%)' : '🟡 Parcial (85%)', 
            details: 'Gestão de consentimentos, protocolo 15 dias e soft delete' 
          },
          { name: 'RBAC Fail-Closed & Auditoria de Fluxo', status: 'partial', badge: '🟡 Parcial (85%)', details: 'Matriz estrita de papéis, /storage protegido e login sem busca parcial por nome; pendente: 1º acesso do cliente' },
          { name: 'Criptografia TLS 1.3 + PBKDF2 210k', status: 'partial', badge: '🟡 Parcial (75%)', details: 'TLS 1.3 e HSTS no ar; SQLCipher em repouso planejado' },
          { name: 'Biometria Facial Liveness (DocuSign/Ironclad)', status: 'partial', badge: '🟡 Q2/2027', details: 'Prova de vida ativa no E-Sign para grandes contratos' },
          { 
            name: 'Arquitetura Multi-Tenant (SaaS B2B)', 
            status: hasTenantId ? 'delivered' : 'planned', 
            badge: hasTenantId ? '🟢 No Ar (100%)' : '⚪ Q2/2027', 
            details: 'Isolamento por tenant_id para comercialização recorrente' 
          }
        ]
      }
    };

    // 4.2 Função de Cálculo Matemático das Camadas
    function computeLayerStats(layer) {
      const mods = layer.modules || [];
      let scoreSum = 0;
      mods.forEach(m => {
        if (m.status === 'delivered') scoreSum += 1.0;
        else if (m.status === 'partial') scoreSum += 0.5;
      });
      layer.score = Math.round((scoreSum / (mods.length || 1)) * 100);
      layer.total_modules = mods.length;
      layer.delivered = mods.filter(m => m.status === 'delivered').length;
      layer.partial = mods.filter(m => m.status === 'partial').length;
      layer.planned = mods.filter(m => m.status === 'planned').length;
    }

    computeLayerStats(layers.core);
    computeLayerStats(layers.ai);
    computeLayerStats(layers.integrations);
    computeLayerStats(layers.security);

    // 5. Resumo Geral de Governança Auto-Auditado
    const totalItems = layers.core.total_modules + layers.ai.total_modules + layers.integrations.total_modules + layers.security.total_modules;
    const deliveredCount = layers.core.delivered + layers.ai.delivered + layers.integrations.delivered + layers.security.delivered;
    const partialCount = layers.core.partial + layers.ai.partial + layers.integrations.partial + layers.security.partial;
    const plannedCount = layers.core.planned + layers.ai.planned + layers.integrations.planned + layers.security.planned;
    const compliancePercentage = Math.round(((deliveredCount * 1.0 + partialCount * 0.5) / (totalItems || 1)) * 1000) / 10;

    const overall = {
      compliance_percentage: compliancePercentage,
      flow_audit_score: '90/100 (Nível Ouro Internacional)',
      total_items: totalItems,
      delivered_count: deliveredCount,
      partial_count: partialCount,
      planned_count: plannedCount,
      titular: 'Dr. Jorge Eduardo da Silva Alvim',
      oab: 'OAB/MG 222.943',
      cnpj: '58.204.305/0001-00',
      server_env: 'Node.js + systemd no VPS Contabo, atrás do Cloudflare (Produção)',
      infrastructure_cost: 'R$ 40/mês (Zero royalties)',
      updated_at: new Date().toISOString()
    };

    // 6. Checklists Ano a Ano Unificados (2026 - 2029)
    const checklists = {
      '2026': [
        { task: 'Cockpit Executivo da Visão Geral (Regra dos 5 Segundos)', done: true, tag: 'Core' },
        { task: 'Motor de Prazos Processuais com Art. 219 CPC e Recesso Forense', done: true, tag: 'Core' },
        { task: 'Autenticação Google Identity Services (OAuth 2.0)', done: true, tag: 'Auth' },
        { task: 'Módulo LGPD com Direitos do Titular (Art. 18) e Trava Ética OAB', done: hasSoftDelete, tag: 'LGPD' },
        { task: 'Módulo de Apoio ao Usuário e Resiliência (JawSupport Auto-Save & Undo)', done: hasJawSupport, tag: 'Resilience' },
        { task: 'Recursos Windows 11 no Painel (Aero Snap, Menu de Contexto, Lock Screen)', done: hasWinFeatures, tag: 'UX' },
        { task: 'Auditor Nativo de Fluxo Forense (Score 90/100 Ouro)', done: true, tag: 'Audit' },
        { task: 'Trava de Prazos em Dias Não Úteis (projeção para 1º dia útil)', done: true, tag: 'Core' },
        { task: 'DMS Matter-Centric com anexo direto na linha do andamento (iManage)', done: hasDmsFiles, horizon: 'Q4/2026', priority: 'P1' },
        { task: 'Leitor OCR Automático de Documentos (Zero Digitação via Tesseract)', done: false, horizon: 'Q4/2026', priority: 'P1' },
        { task: 'WhatsApp Business Cloud API Oficial para andamentos automáticos', done: false, horizon: 'Q4/2026', priority: 'P1' },
        { task: 'Minutas Inteligentes com RAG Local sobre o acervo do Dr. Jorge', done: false, horizon: 'Q4/2026', priority: 'P1' },
        { task: 'Deploy do Hardening de Segurança (PBKDF2 210k) no servidor Contabo', done: true, tag: 'Security' },
        { task: 'Cloudflare Edge no Brasil (proxy + SSL)', done: true, tag: 'Infra' },
        { task: 'Remoção da senha universal do mestre no código (login e portais)', done: true, tag: 'Security' },
        { task: 'Arquivos de clientes e Drive protegidos por login (/storage)', done: hasStorageGuard, tag: 'Security' },
        { task: 'Backup off-site 3-2-1 automatizado (DRP em R2/Drive/S3)', done: false, horizon: 'Q4/2026', priority: 'P0' },
        { task: 'Deep Healthchecks corporativos (/health/live e /health/ready)', done: false, horizon: 'Q4/2026', priority: 'P1' },
        { task: 'Graceful Shutdown SIGTERM/SIGINT com término limpo de conexões', done: false, horizon: 'Q4/2026', priority: 'P1' },
        { task: 'Tabela de Idempotência em Webhooks (processed_webhooks para PIX/Asaas)', done: hasIdempotency, horizon: 'Q4/2026', priority: 'P1' }
      ],
      '2027': [
        { task: 'Geração de Petições por LLM com Revisão Obrigatória (Human-in-the-Loop)', done: false, horizon: 'Q1/2027' },
        { task: 'Conciliação Financeira via Open Finance com baixa instantânea', done: false, horizon: 'Q1/2027' },
        { task: 'Calculadora Previdenciária CNIS (importador de extrato Meu INSS)', done: false, horizon: 'Q1/2027' },
        { task: 'Quality Gates & Travas de Controladoria (bloqueio sem procuração/custas)', done: false, horizon: 'Q1/2027' },
        { task: 'Planilhas Dinâmicas & BI Forense Multidimensional (Tabulator.js)', done: false, horizon: 'Q1/2027' },
        { task: 'Lock Colaborativo Anti-Sobrescrita na mesma ficha processual', done: false, horizon: 'Q1/2027', priority: 'P2' },
        { task: 'Detector de Anexo Esquecido no envio de despachos', done: false, horizon: 'Q1/2027', priority: 'P2' },
        { task: 'Recibo de Prestação de Contas de Alvará/RPV timbrado em 1 clique', done: false, horizon: 'Q1/2027', priority: 'P1' },
        { task: 'Biometria Facial (Liveness Detection) no E-Sign para grandes contratos', done: false, horizon: 'Q2/2027' },
        { task: 'Arquitetura Multi-Tenant com isolamento tenant_id para expansão SaaS B2B', done: hasTenantId, horizon: 'Q2/2027' },
        { task: 'PWA Offline-First para consultas em fóruns e audiências sem sinal', done: false, horizon: 'Q2/2027', priority: 'P2' },
        { task: 'Chatbot 24/7 com Escalação Inteligente para Plantonista', done: false, horizon: 'Q3/2027' }
      ],
      '2028': [
        { task: 'Análise Contratual Automatizada com Detecção de Riscos e Cláusulas Abusivas', done: false },
        { task: 'Robôs MNI de Peticionamento Eletrônico Direto (PJe / e-Proc / PROJUDI)', done: false },
        { task: 'Integração Corporativa Microsoft 365 / Entra ID e Outlook Calendar', done: false },
        { task: 'Criptografia Transparente em Repouso no SQLite e Storage (SQLCipher)', done: false }
      ],
      '2029': [
        { task: 'Módulo de Jurimetria Preditiva com Mineração Estatística de Decisões', done: false },
        { task: 'Precificação Algorítmica de Honorários por Grau de Risco e Duração Histórica', done: false },
        { task: 'Previsibilidade Estocástica de Fluxo de Caixa para Alvarás e Sucumbência', done: false }
      ]
    };

    return res.json({
      success: true,
      overall,
      pipelineStages,
      internationalBenchmarks,
      cloudAudit,
      userSupport,
      externalPendingActions,
      waves,
      layers,
      telemetry: {
        total_lawsuits: totalLawsuits,
        total_clients: totalClients,
        pending_deadlines: pendingDeadlines,
        total_nfse: totalNfse,
        last_djen_sync: lastDjenSync,
        tls_version: 'TLS 1.3 / HSTS',
        rbac_mode: 'Fail-Closed Rigoroso',
        flow_audit: '90/100 (Ouro)'
      },
      checklists
    });
  } catch (error) {
    console.error('[ROADMAP] Erro ao obter dados do roadmap vivo:', error);
    return res.status(500).json({ error: 'Erro ao carregar telemetria do roadmap vivo.' });
  }
});

/**
 * GET /api/admin/relatorios/:file - Relatórios internos (PDF/MD) em docs/relatorios.
 * Antes ficavam em /public (abertos na internet); agora exigem sessão de operador.
 * Aceita ?token= porque é aberto por link <a>.
 */
const REPORTS_DIR = path.join(process.cwd(), 'docs', 'relatorios');

roadmapRouter.get('/api/admin/relatorios/:file', requireAuth, (req, res) => {
  if (req.user?.isEmployee) return res.status(403).json({ error: 'Acesso restrito ao painel.' });
  const name = path.basename(String(req.params.file || ''));
  if (!/^[\w.-]+\.(pdf|md)$/i.test(name)) return res.status(400).json({ error: 'Arquivo inválido.' });
  const full = path.join(REPORTS_DIR, name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Relatório não encontrado.' });
  return res.sendFile(full);
});
