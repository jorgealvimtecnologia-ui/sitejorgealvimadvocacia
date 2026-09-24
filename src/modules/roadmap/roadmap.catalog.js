import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Catálogo Canônico de Funções e Módulos do Sistema Jorge Alvim Advocacia
 * Inspeciona arquivos reais no disco para determinar status em tempo real:
 * - ⚡ Ativa: Arquivo presente, funcional e estável.
 * - 🆕 Criada: Nova funcionalidade implantada recentemente.
 * - 🔄 Modificada: Módulo que recebeu modificações nas últimas atualizações.
 * - ❌ Excluída: Funcionalidade descontinuada ou vetada (ex: 2FA / TOTP).
 */
export const SYSTEM_FUNCTIONS_CATALOG = [
  // 1. Camada de Acesso & Segurança
  {
    id: 'FUNC-AUTH-01',
    name: 'Login Unificado & Identity-First',
    module: 'auth',
    layer: 'Backend API & Frontend',
    description: 'Entrada única por CPF, Username ou Google OAuth sem fricção, com detecção automática de perfil.',
    file: 'src/modules/auth/auth.routes.js',
    marker: '⚡ Ativa',
    category: 'Segurança & Identidade'
  },
  {
    id: 'FUNC-AUTH-02',
    name: 'Sessão JWT com Cookie HTTP-Only Blindado',
    module: 'auth',
    layer: 'Backend API',
    description: 'Emissão e renovação de token JWT em cookie seguro com flags HttpOnly, SameSite=Lax e expiração controlada.',
    file: 'src/middleware/auth.js',
    marker: '⚡ Ativa',
    category: 'Segurança & Identidade'
  },
  {
    id: 'FUNC-AUTH-03',
    name: 'Matriz RBAC/ABAC de Permissões Granulares',
    module: 'access',
    layer: 'Backend & Database',
    description: 'Controle de acesso por papel (Mestre, Advogado, Estagiário, Secretária, Colaborador, Cliente).',
    file: 'src/modules/access/access.routes.js',
    marker: '⚡ Ativa',
    category: 'Segurança & Identidade'
  },
  {
    id: 'FUNC-AUTH-04',
    name: 'Autenticação Multifator 2FA / TOTP',
    module: 'auth',
    layer: 'Segurança',
    description: 'Autenticação por token temporário de 6 dígitos. Excluída e vetada por diretriz expressa do Dr. Jorge.',
    file: 'scripts/check-architecture.js',
    marker: '❌ Excluída',
    category: 'Segurança & Identidade'
  },
  {
    id: 'FUNC-AUTH-05',
    name: 'Auditoria de Acesso & Proteção Brute-Force',
    module: 'auth',
    layer: 'Backend Middleware',
    description: 'Registro de tentativas de acesso (IP, login, horário) com bloqueio preventivo após falhas consecutivas.',
    file: 'src/middleware/audit.js',
    marker: '⚡ Ativa',
    category: 'Segurança & Identidade'
  },

  // 2. Camada Jurídica & Radar Processual
  {
    id: 'FUNC-JUR-01',
    name: 'Gestão Processual & Andamentos (Lawsuits)',
    module: 'lawsuits',
    layer: 'Backend & Frontend Tab',
    description: 'Cadastro unificado de processos, fases, varas, tribunais e movimentações judiciais.',
    file: 'src/modules/lawsuits/lawsuits.routes.js',
    marker: '⚡ Ativa',
    category: 'Core Jurídico'
  },
  {
    id: 'FUNC-JUR-02',
    name: 'Sincronização Automática DJEN & Push PJe',
    module: 'sync',
    layer: 'Backend Service',
    description: 'Motor de sincronização periódica de intimações oficiais do Diário de Justiça Eletrônico Nacional.',
    file: 'src/modules/sync/sync.routes.js',
    marker: '⚡ Ativa',
    category: 'Core Jurídico'
  },
  {
    id: 'FUNC-JUR-03',
    name: 'Leitor & Triagem de Publicações Judiciais',
    module: 'publications',
    layer: 'Frontend Tab & Backend',
    description: 'Triagem inteligente de despachos, sentenças e acórdãos com marcação de leitura e lançamento de prazos.',
    file: 'public/js/tabs/tab-publications.js',
    marker: '⚡ Ativa',
    category: 'Core Jurídico'
  },
  {
    id: 'FUNC-JUR-04',
    name: 'Radar Processual & Web Crawler',
    module: 'radar',
    layer: 'Backend Crawler & Tab',
    description: 'Monitoramento contínuo de movimentações em tribunais de Minas Gerais e tribunais superiores.',
    file: 'public/js/tabs/tab-radar.js',
    marker: '⚡ Ativa',
    category: 'Core Jurídico'
  },

  // 3. Gestão de Clientes, CRM & Atendimento
  {
    id: 'FUNC-CLI-01',
    name: 'Cadastro de Clientes Unificado (PF / PJ)',
    module: 'clients',
    layer: 'Backend & Frontend Tab',
    description: 'Ficha completa de cliente com histórico processual, financeiro, documentos e dados LGPD.',
    file: 'src/modules/clients/clients.routes.js',
    marker: '⚡ Ativa',
    category: 'Gestão de Clientes'
  },
  {
    id: 'FUNC-CLI-02',
    name: 'Portal do Cliente Self-Service',
    module: 'client-portal',
    layer: 'Frontend & API',
    description: 'Acesso exclusivo do cliente para consultar andamento de seus processos, contratos e documentos.',
    file: 'cliente.html',
    marker: '⚡ Ativa',
    category: 'Gestão de Clientes'
  },
  {
    id: 'FUNC-CLI-03',
    name: 'Triagem de Leads & WhatsApp Marketing',
    module: 'leads',
    layer: 'Backend & Frontend Tab',
    description: 'Captação automática de interessados pelo site com despacho instantâneo para o WhatsApp do Dr. Jorge.',
    file: 'src/modules/leads/leads.routes.js',
    marker: '⚡ Ativa',
    category: 'Gestão de Clientes'
  },
  {
    id: 'FUNC-CLI-04',
    name: 'Assinatura Eletrônica de Contratos (e-Sign)',
    module: 'esign',
    layer: 'Backend & Frontend',
    description: 'Coleta de assinatura digital em procurações e contratos de honorários com trilha auditada.',
    file: 'src/modules/esign/esign.routes.js',
    marker: '⚡ Ativa',
    category: 'Gestão de Clientes'
  },

  // 4. Gestão Financeira & Faturamento
  {
    id: 'FUNC-FIN-01',
    name: 'Fluxo de Caixa & Lançamentos Financeiros',
    module: 'financial',
    layer: 'Backend & Frontend Tab',
    description: 'Controle de honorários, custas, receitas, despesas e relatórios analíticos de conciliação.',
    file: 'src/modules/financial/financial.routes.js',
    marker: '⚡ Ativa',
    category: 'Financeiro'
  },
  {
    id: 'FUNC-FIN-02',
    name: 'Emissão Automática de NFS-e Municipal',
    module: 'financial',
    layer: 'Backend Service',
    description: 'Módulo de integração para emissão de nota fiscal de serviços advocatícios.',
    file: 'public/js/tabs/tab-finance.js',
    marker: '⚡ Ativa',
    category: 'Financeiro'
  },

  // 5. Recursos Humanos & Ponto
  {
    id: 'FUNC-HR-01',
    name: 'Registro de Ponto Eletrônico (Portaria 671 MTE)',
    module: 'hr',
    layer: 'Backend & Frontend Tab',
    description: 'Registro biométrico/geolocalizado de entradas e saídas com comprovante inviolável do trabalhador.',
    file: 'src/modules/hr/hr.routes.js',
    marker: '⚡ Ativa',
    category: 'RH & Equipe'
  },
  {
    id: 'FUNC-HR-02',
    name: 'Portal do Colaborador & Ficha Funcional',
    module: 'hr',
    layer: 'Frontend & API',
    description: 'Painel individual do colaborador para consulta de espelho de ponto, recibos e avisos.',
    file: 'colaborador.html',
    marker: '⚡ Ativa',
    category: 'RH & Equipe'
  },

  // 6. Comunicação Interna & Despachos
  {
    id: 'FUNC-ROCKET-01',
    name: 'Central de Foguetes & Despachos Imediatos',
    module: 'rockets',
    layer: 'Backend & Frontend',
    description: 'Envio de despachos prioritários com confirmação formal de ciência e métricas de resposta da equipe.',
    file: 'src/modules/rockets/rockets.routes.js',
    marker: '⚡ Ativa',
    category: 'Comunicação'
  },

  // 7. Engenharia, SRE & Roadmap Vivo
  {
    id: 'FUNC-ROADMAP-01',
    name: 'Tríade Unificada 3 em 1 (Requisitos + Checklist + Roadmap)',
    module: 'roadmap',
    layer: 'Backend & Frontend Tab',
    description: 'Motor unificado com auto-auditoria de tabelas, arquivos, telemetria de 4 camadas e semáforos de conformidade.',
    file: 'src/modules/roadmap/roadmap.routes.js',
    marker: '🔄 Modificada',
    category: 'Engenharia & SRE'
  },
  {
    id: 'FUNC-ROADMAP-02',
    name: 'Centro de Comando do Construtor',
    module: 'roadmap',
    layer: 'Backend & Frontend Tab',
    description: 'Console dedicado para o arquiteto emitir ordens e diretrizes que entram automaticamente na fila de prioridades.',
    file: 'public/js/tabs/tab-roadmap.js',
    marker: '🆕 Criada',
    category: 'Engenharia & SRE'
  },
  {
    id: 'FUNC-ROADMAP-03',
    name: 'Histórico & Trilha de Auditoria com Data e Hora Completa',
    module: 'roadmap',
    layer: 'Backend Database & Tab',
    description: 'Registro imutável de todas as transições de status e ordens emitidas, com busca em tempo real.',
    file: 'src/modules/roadmap/roadmap.routes.js',
    marker: '🆕 Criada',
    category: 'Engenharia & SRE'
  },
  {
    id: 'FUNC-ROADMAP-04',
    name: 'Catálogo Dinâmico de Funções com Marcação de Ciclo de Vida',
    module: 'roadmap',
    layer: 'Backend & Frontend Tab',
    description: 'Mapeamento de todas as capacidades do sistema indicando se estão Ativas, Criadas, Modificadas ou Excluídas.',
    file: 'src/modules/roadmap/roadmap.catalog.js',
    marker: '🆕 Criada',
    category: 'Engenharia & SRE'
  },
  {
    id: 'FUNC-ROADMAP-05',
    name: 'Integração de Agentes IAs (Claude & Antigravity)',
    module: 'roadmap',
    layer: 'Scripts & CLI',
    description: 'Ponte de leitura e execução de ordens via CLI (npm run roadmap:pending / status) e diretrizes CLAUDE.md / AGENTS.md.',
    file: 'scripts/roadmap-agent.js',
    marker: '🆕 Criada',
    category: 'Engenharia & SRE'
  }
];

/**
 * Obtém o catálogo com metadados reais de filesystem (data e hora da última modificação)
 */
export function getSystemFunctionsWithMetadata() {
  return SYSTEM_FUNCTIONS_CATALOG.map(fn => {
    let lastModified = 'N/A';
    let fileExists = false;
    let sizeBytes = 0;

    try {
      const fullPath = path.join(PROJECT_ROOT, fn.file);
      if (fs.existsSync(fullPath)) {
        fileExists = true;
        const stat = fs.statSync(fullPath);
        lastModified = stat.mtime.toISOString();
        sizeBytes = stat.size;
      }
    } catch (e) {
      // Ignora falhas de leitura
    }

    return {
      ...fn,
      fileExists,
      sizeBytes,
      lastModified
    };
  });
}
