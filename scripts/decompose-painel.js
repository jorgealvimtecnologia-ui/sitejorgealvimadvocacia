/**
 * ==============================================================================
 * SCRIPT DE DECOMPOSIÇÃO E MODULARIZAÇÃO DE painel-1-app.js
 * ==============================================================================
 * Extrai as 16 abas funcionais de painel-1-app.js para submódulos coesos em
 * `public/js/tabs/tab-<nome>.js`.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SRC_FILE = path.join(ROOT_DIR, 'public', 'js', 'painel', 'painel-1-app.js');
const TABS_DIR = path.join(ROOT_DIR, 'public', 'js', 'tabs');

if (!fs.existsSync(TABS_DIR)) {
  fs.mkdirSync(TABS_DIR, { recursive: true });
}

const rawContent = fs.readFileSync(SRC_FILE, 'utf8');
const lines = rawContent.split('\n');

// Definição dos blocos com marcadores de início e fim
const TABS = [
  {
    name: 'tab-clients.js',
    title: 'MÓDULO: GESTÃO DE CLIENTES & CONTRATOS',
    startStr: '// ================= 2. GESTÃO DE CLIENTES & CONTRATOS',
    endStr: '// ================= 3. GESTÃO DE LEADS'
  },
  {
    name: 'tab-leads.js',
    title: 'MÓDULO: GESTÃO DE LEADS & CAPTAÇÃO',
    startStr: '// ================= 3. GESTÃO DE LEADS',
    endStr: '// ================= 3. GESTÃO DE PROCESSOS JUDICIAIS'
  },
  {
    name: 'tab-lawsuits.js',
    title: 'MÓDULO: PROCESSOS JUDICIAIS, ANDAMENTOS (CNJ) & WHATSAPP',
    startStr: '// ================= 3. GESTÃO DE PROCESSOS JUDICIAIS',
    endStr: '// 🛡️ MATRIZ DE GESTÃO DE ACESSOS'
  },
  {
    name: 'tab-users.js',
    title: 'MÓDULO: GESTÃO DE USUÁRIOS, SENHAS & RBAC',
    startStr: '// 🛡️ MATRIZ DE GESTÃO DE ACESSOS',
    endStr: '// ================= 4.2 MÓDULO DO DRIVE'
  },
  {
    name: 'tab-drive.js',
    title: 'MÓDULO: DRIVE DO ESCRITÓRIO (ARQUIVO DIGITAL)',
    startStr: '// ================= 4.2 MÓDULO DO DRIVE',
    endStr: '// ================= 4.1 MÓDULO DE GESTÃO E CADASTRO DE ESCRITÓRIOS'
  },
  {
    name: 'tab-offices.js',
    title: 'MÓDULO: GESTÃO DE ESCRITÓRIOS, FILIAIS & EQUIPE',
    startStr: '// ================= 4.1 MÓDULO DE GESTÃO E CADASTRO DE ESCRITÓRIOS',
    endStr: '// ================= 5. GERADOR DE DOCUMENTOS'
  },
  {
    name: 'tab-documents.js',
    title: 'MÓDULO: GERADOR DE DOCUMENTOS (PROCURAÇÃO, CONTRATO & HIPOSSUFICIÊNCIA)',
    startStr: '// ================= 5. GERADOR DE DOCUMENTOS',
    endStr: '// ================= 6. MÓDULO FINANCEIRO'
  },
  {
    name: 'tab-finance.js',
    title: 'MÓDULO: FINANCEIRO, CARNÊS, ALVARÁS, LIVRO CAIXA & NFS-E ASAAS',
    startStr: '// ================= 6. MÓDULO FINANCEIRO',
    endStr: '// ================= GESTÃO DO BLOG JURÍDICO'
  },
  {
    name: 'tab-blog.js',
    title: 'MÓDULO: BLOG JURÍDICO, BOXES DA HOME & MODERAÇÃO',
    startStr: '// ================= GESTÃO DO BLOG JURÍDICO',
    endStr: '// ================= 7. MÓDULO DE AUDITORIA',
    extraRanges: [
      {
        startStr: '// MODAL DE MODERAÇÃO DE COMENTÁRIOS',
        endStr: '// BLOCO DE RASCUNHO DE ATIVIDADES'
      }
    ]
  },
  {
    name: 'tab-audit.js',
    title: 'MÓDULO: AUDITORIA, HISTÓRICO GERAL & BACKUPS EM 1-CLIQUE',
    startStr: '// ================= 7. MÓDULO DE AUDITORIA',
    endStr: '// ================= FUNÇÕES DA ABA 8: PRÉ-CLIENTES'
  },
  {
    name: 'tab-traffic.js',
    title: 'MÓDULO: PRÉ-CLIENTES, TRÁFEGO & VISITAS (TELEMETRIA)',
    startStr: '// ================= FUNÇÕES DA ABA 8: PRÉ-CLIENTES',
    endStr: '// FUNÇÕES DA ABA 9: RADAR JUDICIAL'
  },
  {
    name: 'tab-radar.js',
    title: 'MÓDULO: RADAR JUDICIAL (DATAJUD CNJ, MNI & TRIBUNAIS)',
    startStr: '// FUNÇÕES DA ABA 9: RADAR JUDICIAL',
    endStr: '// 📅 CONTROLLER DA AGENDA GERAL'
  },
  {
    name: 'tab-calendar.js',
    title: 'MÓDULO: AGENDA FORENSE, CALENDÁRIOS & RASCUNHOS DE ATIVIDADES',
    startStr: '// 📅 CONTROLLER DA AGENDA GERAL',
    endStr: '// 📢 CONTROLLER DE INTIMAÇÕES',
    extraRanges: [
      {
        startStr: '// BLOCO DE RASCUNHO DE ATIVIDADES',
        endStr: '// CALCULADORA E EMISSÃO DE RESCISÃO TRABALHISTA'
      }
    ]
  },
  {
    name: 'tab-publications.js',
    title: 'MÓDULO: INTIMAÇÕES JUDICIAIS (COMUNICAAPI/DJEN) & CALCULADORA DE PRAZOS',
    startStr: '// 📢 CONTROLLER DE INTIMAÇÕES',
    endStr: '// 👥 MÓDULO DE GESTÃO DE PESSOAL'
  },
  {
    name: 'tab-hr.js',
    title: 'MÓDULO: RH, DEPARTAMENTO PESSOAL, CLT & RESCISÕES TRABALHISTAS',
    startStr: '// 👥 MÓDULO DE GESTÃO DE PESSOAL',
    endStr: '// MODAL DE MODERAÇÃO DE COMENTÁRIOS',
    extraRanges: [
      {
        startStr: '// CALCULADORA E EMISSÃO DE RESCISÃO TRABALHISTA',
        endStr: '// INICIALIZADOR DE GRÁFICOS EM TODAS AS 16 ABAS'
      }
    ]
  },
  {
    name: 'tab-charts.js',
    title: 'MÓDULO: INICIALIZADOR DE GRÁFICOS BI (CHART.JS)',
    startStr: '// INICIALIZADOR DE GRÁFICOS EM TODAS AS 16 ABAS',
    endStr: '// ================= REGISTRO DE SERVICE WORKER PWA'
  }
];

// Helper para encontrar índices
function findLineIndex(str) {
  const idx = lines.findIndex(l => l.includes(str));
  if (idx === -1) throw new Error(`Marcador não encontrado: "${str}"`);
  return idx;
}

// Extrai cada submódulo
for (const tab of TABS) {
  const startIdx = findLineIndex(tab.startStr);
  const endIdx = findLineIndex(tab.endStr);
  let chunk = lines.slice(startIdx, endIdx).join('\n');

  if (tab.extraRanges) {
    for (const extra of tab.extraRanges) {
      const eStart = findLineIndex(extra.startStr);
      const eEnd = findLineIndex(extra.endStr);
      chunk += '\n\n' + lines.slice(eStart, eEnd).join('\n');
    }
  }

  // Detecta funções declaradas no chunk para expor no window
  const funcMatches = [...chunk.matchAll(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/g)].map(m => m[1]);
  const uniqueFuncs = [...new Set(funcMatches)].filter(f => !f.startsWith('_'));

  const exportStatements = uniqueFuncs.map(f => `  window.${f} = typeof ${f} !== 'undefined' ? ${f} : window.${f};`).join('\n');

  const fileContent = `/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: ${tab.title}
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

${chunk}

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
${exportStatements}
})();
`;

  const destPath = path.join(TABS_DIR, tab.name);
  fs.writeFileSync(destPath, fileContent, 'utf8');
  console.log(`  ✓ Submódulo criado: public/js/tabs/${tab.name} (${chunk.split('\n').length} linhas)`);
}

// Agora construímos o painel-1-app.js enxuto (Core Shell)
// Mantém as linhas 1 até o primeiro módulo (tab-clients, linha 1321)
// E adiciona o registro do ServiceWorker no final
const firstModuleIdx = findLineIndex(TABS[0].startStr);
const swIdx = findLineIndex('// ================= REGISTRO DE SERVICE WORKER PWA');

const coreHeader = lines.slice(0, firstModuleIdx).join('\n');
const swChunk = lines.slice(swIdx).join('\n');

const newCoreContent = `/**
 * ==============================================================================
 * PAINEL DE CONTROLE - CORE SHELL & COORDENADOR DE ABAS (JORGE ALVIM ADVOCACIA)
 * ==============================================================================
 * Este arquivo atua como orquestrador central e provedor de utilitários globais.
 * Todas as 16 abas funcionais foram decompostas e modularizadas em:
 * \`public/js/tabs/tab-<modulo>.js\`.
 * ==============================================================================
 */

${coreHeader}

    // ================= EXPORTAÇÃO DE UTILITÁRIOS GLOBAIS =================
    window.allLeads = allLeads;
    window.allUsers = allUsers;
    window.allClients = allClients;
    window.allLawsuits = allLawsuits;
    window.getToken = getToken;
    window.getAuthHeaders = getAuthHeaders;
    window.formatMoney = formatMoney;
    window.formatDate = formatDate;
    window.copyToClipboard = copyToClipboard;
    window.maskCPF = maskCPF;
    window.maskCNPJ = maskCNPJ;
    window.maskPhone = maskPhone;
    window.maskCEP = maskCEP;
    window.maskMoney = maskMoney;
    window.switchTab = switchTab;

${swChunk}
`;

fs.writeFileSync(SRC_FILE, newCoreContent, 'utf8');
const newTotalLines = newCoreContent.split('\n').length;
console.log(`\n🎉 painel-1-app.js modularizado com sucesso! Reduzido de ${lines.length} para ${newTotalLines} linhas (-${lines.length - newTotalLines} linhas)!`);
