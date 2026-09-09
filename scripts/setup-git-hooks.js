#!/usr/bin/env node
/**
 * Configura o git hook de pre-commit para rodar a checagem arquitetural automaticamente
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(ROOT_DIR, '.git', 'hooks');
const PRE_COMMIT_FILE = path.join(HOOKS_DIR, 'pre-commit');

if (!fs.existsSync(HOOKS_DIR)) {
  console.log('ℹ️ Diretório .git/hooks não encontrado ou inacessível no ambiente.');
  process.exit(0);
}

const hookContent = `#!/bin/sh
# Guardião de Arquitetura Modular - Jorge Alvim Advocacia
echo "🛡️ Executando validação de arquitetura modular pré-commit..."
node scripts/check-architecture.js
if [ $? -ne 0 ]; then
  echo "❌ Commit bloqueado: código compacto ou violação de modularidade detectada."
  exit 1
fi
`;

try {
  fs.writeFileSync(PRE_COMMIT_FILE, hookContent, { mode: 0o755 });
  console.log('✅ Git hook pre-commit instalado com sucesso em .git/hooks/pre-commit');
} catch (e) {
  console.warn('⚠️ Não foi possível instalar hook .git (sandbox ou permissão):', e.message);
}
