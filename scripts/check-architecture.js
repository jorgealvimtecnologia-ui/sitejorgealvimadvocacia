#!/usr/bin/env node
/**
 * ==============================================================================
 * GUARDIÃO DE ARQUITETURA MODULAR & CLEAN CODE (JORGE ALVIM ADVOCACIA)
 * ==============================================================================
 * Este script valida automaticamente a saúde arquitetural do projeto antes de
 * salvar ou commitar código.
 *
 * REGRAS INEGOCIÁVEIS:
 * 1. Proibição de novos blocos compactos em arquivos centrais.
 * 2. Novas rotas de API devem residir em `src/modules/<modulo>/<modulo>.routes.js`.
 * 3. Novas abas do painel devem residir em `public/js/tabs/tab-<modulo>.js`.
 * 4. Teto máximo de linhas em arquivos legados (Ceiling Check).
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Cores ANSI para saída no terminal
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let violations = [];
let warnings = [];

console.log(`\n${BOLD}${CYAN}🔍 INICIANDO AUDITORIA ARQUITETURAL DE MODULARIDADE...${RESET}\n`);

// ------------------------------------------------------------------------------
// REGRA 1: Checagem de Teto Monolítico (Ceiling Check)
// ------------------------------------------------------------------------------
const CEILINGS = [
  { file: 'server.js', maxLines: 3200, label: 'Backend Server Core' },
  { file: 'public/js/painel/painel-1-app.js', maxLines: 1800, label: 'Frontend Painel Monolith (Decomposto)' },
];

for (const item of CEILINGS) {
  const filePath = path.join(ROOT_DIR, item.file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    if (lines > item.maxLines) {
      violations.push(
        `🚨 [TETO EXCEDIDO] ${item.file} possui ${lines} linhas (máximo permitido: ${item.maxLines}). ` +
        `Não adicione novos blocos compactos nele! Extraia a funcionalidade para um submódulo em src/modules/ ou public/js/tabs/.`
      );
    } else {
      console.log(`  ${GREEN}✓${RESET} Teto de Linhas: ${item.file} (${lines}/${item.maxLines} linhas) — ${BOLD}OK${RESET}`);
    }
  }
}

// ------------------------------------------------------------------------------
// REGRA 2: Verificação de Módulos no Backend (src/modules/)
// ------------------------------------------------------------------------------
const MODULES_DIR = path.join(ROOT_DIR, 'src', 'modules');
if (fs.existsSync(MODULES_DIR)) {
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const moduleDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  let modulesChecked = 0;

  for (const dirName of moduleDirs) {
    const dirPath = path.join(MODULES_DIR, dirName);
    const files = fs.readdirSync(dirPath);
    const hasRoutes = files.some(f => f.endsWith('.routes.js') || f === 'index.js');
    
    if (!hasRoutes) {
      warnings.push(`⚠️ Módulo 'src/modules/${dirName}' não possui arquivo de rotas (*.routes.js ou index.js).`);
    } else {
      modulesChecked++;
    }
  }

  console.log(`  ${GREEN}✓${RESET} Estrutura de Módulos Backend: ${modulesChecked} módulos verificados e padronizados — ${BOLD}OK${RESET}`);
}

// ------------------------------------------------------------------------------
// REGRA 3: Verificação de Submódulos de Abas do Frontend (public/js/tabs/)
// ------------------------------------------------------------------------------
const TABS_DIR = path.join(ROOT_DIR, 'public', 'js', 'tabs');
if (fs.existsSync(TABS_DIR)) {
  const tabFiles = fs.readdirSync(TABS_DIR).filter(f => f.endsWith('.js'));
  if (tabFiles.length < 10) {
    violations.push(`🚨 [SUBMÓDULOS INSUFICIENTES] Esperado ao menos 10 submódulos em public/js/tabs/, encontrados ${tabFiles.length}.`);
  } else {
    console.log(`  ${GREEN}✓${RESET} Submódulos Desacoplados de Abas (public/js/tabs/): ${tabFiles.length} submódulos ativos — ${BOLD}OK${RESET}`);
  }
} else {
  violations.push(`🚨 [DIRETÓRIO AUSENTE] Diretório obrigatório 'public/js/tabs/' não existe.`);
}

// ------------------------------------------------------------------------------
// REGRA 4: Proibição de Rotas Compactas no corpo do server.js
// ------------------------------------------------------------------------------
const serverFile = path.join(ROOT_DIR, 'server.js');
if (fs.existsSync(serverFile)) {
  const serverContent = fs.readFileSync(serverFile, 'utf8');
  const directApiRouteRegex = /app\.(get|post|put|delete|patch)\(\s*['"]\/api\/(?!health|webhooks|admin\/maintenance\/health)/g;
  let match;
  let directRoutes = 0;
  while ((match = directApiRouteRegex.exec(serverContent)) !== null) {
    directRoutes++;
  }

  const MAX_DIRECT_API_ROUTES = 40;
  if (directRoutes > MAX_DIRECT_API_ROUTES) {
    violations.push(
      `🚨 [BLOCO COMPACTO PROIBIDO] Encontradas ${directRoutes} rotas de API diretamente em server.js (máximo legado tolerado: ${MAX_DIRECT_API_ROUTES}). ` +
      `Crie um módulo desacoplado em src/modules/<seu-modulo>/<seu-modulo>.routes.js e registre com app.use(...)!`
    );
  } else {
    console.log(`  ${GREEN}✓${RESET} Roteamento Desacoplado: ${directRoutes} rotas diretas (dentro da tolerância legada <= ${MAX_DIRECT_API_ROUTES}) — ${BOLD}OK${RESET}`);
  }
}

// ------------------------------------------------------------------------------
// REGRA 5: Veto Absoluto a 2FA / Autenticação de Dois Fatores (Diretriz do Usuário)
// ------------------------------------------------------------------------------
const PKG_FILE = path.join(ROOT_DIR, 'package.json');
if (fs.existsSync(PKG_FILE)) {
  const pkgContent = fs.readFileSync(PKG_FILE, 'utf8');
  const forbidden2FAPackages = ['speakeasy', 'otplib', 'qrcode', 'twofactor'];
  for (const pkg of forbidden2FAPackages) {
    if (pkgContent.includes(`"${pkg}"`)) {
      violations.push(`🚨 [2FA PROIBIDO] Pacote de dois fatores '${pkg}' detectado em package.json. O usuário proibiu 2FA explicitamente.`);
    }
  }
}

// ------------------------------------------------------------------------------
// REGRA 6: Detecção de Funções Monolíticas Gigantes (> 250 linhas)
// ------------------------------------------------------------------------------
function checkLargeFunctions(filePath, relName, maxLines = 250) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let currentFunc = null;
  let funcStart = 0;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detecção simplificada de início de função
    const funcMatch = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>))/);
    if (funcMatch && braceDepth === 0) {
      currentFunc = funcMatch[1] || funcMatch[2];
      funcStart = i + 1;
    }

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    braceDepth += opens - closes;

    if (braceDepth <= 0 && currentFunc) {
      const funcLength = (i + 1) - funcStart + 1;
      if (funcLength > maxLines) {
        warnings.push(`⚠️ [FUNÇÃO LONGA] '${currentFunc}' em ${relName} tem ${funcLength} linhas (recomendado <= ${maxLines}). Considere modularizar.`);
      }
      currentFunc = null;
      braceDepth = 0;
    }
  }
}

checkLargeFunctions(path.join(ROOT_DIR, 'server.js'), 'server.js', 300);
checkLargeFunctions(path.join(ROOT_DIR, 'public/js/painel/painel-1-app.js'), 'painel-1-app.js', 250);

// ------------------------------------------------------------------------------
// RESULTADO FINAL DA AUDITORIA
// ------------------------------------------------------------------------------
console.log('');
if (warnings.length > 0) {
  warnings.forEach(w => console.log(`  ${YELLOW}${w}${RESET}`));
}

if (violations.length > 0) {
  console.log(`\n${RED}${BOLD}❌ FALHA DE ARQUITETURA MODULAR:${RESET}`);
  violations.forEach(v => console.log(`  ${RED}${v}${RESET}`));
  console.log(`\n${BOLD}Ação necessária:${RESET} Separe o código em submódulos desacoplados antes de salvar ou commitar.\n`);
  if (!process.argv.includes('--watch')) {
    process.exit(1);
  }
} else {
  console.log(`${GREEN}${BOLD}✅ SUCESSO: Todas as diretrizes de modularização e Clean Code foram respeitadas!${RESET}\n`);
  if (!process.argv.includes('--watch')) {
    process.exit(0);
  }
}

// ------------------------------------------------------------------------------
// MODO --watch: Monitoramento Contínuo em Tempo Real
// ------------------------------------------------------------------------------
if (process.argv.includes('--watch')) {
  console.log(`${CYAN}👀 Guardião ativo em modo contínuo (--watch). Monitorando alterações em tempo real...${RESET}\n`);
  const watchPaths = [
    path.join(ROOT_DIR, 'server.js'),
    path.join(ROOT_DIR, 'package.json'),
    path.join(ROOT_DIR, 'public', 'js', 'painel'),
    path.join(ROOT_DIR, 'public', 'js', 'tabs'),
    path.join(ROOT_DIR, 'src', 'modules')
  ];

  let debounceTimer = null;
  const triggerCheck = (event, filename) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n${YELLOW}⚡ Alteração detectada em ${filename || 'arquivo'}... Reexecutando auditoria:${RESET}`);
      // Reexecuta o script via child_process de forma limpa
      import('node:child_process').then(cp => {
        cp.fork(path.join(ROOT_DIR, 'scripts', 'check-architecture.js'));
      });
    }, 400);
  };

  watchPaths.forEach(p => {
    if (fs.existsSync(p)) {
      fs.watch(p, { recursive: true }, triggerCheck);
    }
  });
}
