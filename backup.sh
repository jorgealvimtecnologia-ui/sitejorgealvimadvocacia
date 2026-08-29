#!/bin/bash
# ==============================================================================
# Script de Backup Automatizado - Jorge Alvim Advocacia & Consultoria Jurídica
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP="$(date +'%Y-%m-%d_%H-%M-%S')"
BACKUP_NAME="backup_jorgealvim_${TIMESTAMP}"
DEST_FOLDER="${BACKUP_DIR}/${BACKUP_NAME}"

mkdir -p "${DEST_FOLDER}"

echo "========================================================"
echo "📦 Iniciando Backup do Sistema Jorge Alvim Advocacia"
echo "📅 Data/Hora: $(date +'%d/%m/%Y %H:%M:%S')"
echo "========================================================"

# 1. Backup a quente do Banco de Dados SQLite (sem travar leituras/escritas)
if [ -f "${PROJECT_DIR}/leads.db" ]; then
    echo "🗄️  Exportando snapshot íntegro do banco de dados leads.db..."
    node -e "
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync('${PROJECT_DIR}/leads.db');
      db.exec(\"VACUUM INTO '${DEST_FOLDER}/leads.db'\");
      db.close();
    "
    echo "   ✓ Banco de dados copiado com sucesso via VACUUM a quente!"
else
    echo "   ⚠️  Aviso: leads.db não encontrado no diretório do projeto."
fi

# 2. Backup dos Anexos e Arquivos de Clientes
if [ -d "${PROJECT_DIR}/storage" ]; then
    echo "📁 Copiando diretório de documentos e storage..."
    cp -r "${PROJECT_DIR}/storage" "${DEST_FOLDER}/"
    echo "   ✓ Arquivos de storage copiados!"
fi

# 3. Backup de Configurações Críticas (Nginx, Docker e Variáveis de Ambiente)
if [ -f "${PROJECT_DIR}/.env" ]; then
    cp "${PROJECT_DIR}/.env" "${DEST_FOLDER}/.env.backup"
fi
if [ -d "${PROJECT_DIR}/nginx/ssl" ]; then
    mkdir -p "${DEST_FOLDER}/nginx"
    cp -r "${PROJECT_DIR}/nginx/ssl" "${DEST_FOLDER}/nginx/"
fi

# 4. Compactação e Empacotamento
echo "🗜️  Compactando pacote de backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${DEST_FOLDER}"

# 5. Geração de Checksum SHA-256 para Auditoria de Integridade
sha256sum "${BACKUP_NAME}.tar.gz" > "${BACKUP_NAME}.tar.gz.sha256"

FINAL_SIZE="$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)"
echo "   ✓ Pacote gerado: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz (${FINAL_SIZE})"

# 6. Rotação Automática de Backups (Remove backups locais com mais de 30 dias)
echo "🧹 Limpando backups locais com mais de 30 dias..."
find "${BACKUP_DIR}" -type f -name "backup_jorgealvim_*.tar.gz*" -mtime +30 -exec rm -f {} \;

echo "========================================================"
echo "✅ Backup Concluído com Sucesso!"
echo "📍 Arquivo: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "========================================================"
