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

# A pasta temporária pode conter dados sensíveis antes da higienização/compactação:
# em qualquer saída (sucesso ou erro) ela é apagada. Só o .tar.gz final permanece.
cleanup() { rm -rf "${DEST_FOLDER}"; }
trap cleanup EXIT

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
    # O backup viaja para HD externo sem criptografia: a CÓPIA (nunca o banco de
    # produção) perde chaves de API e sessões ativas. Ver scripts/backup-scrub-db.js.
    echo "🧼 Higienizando a cópia do banco (sem segredos em texto puro)..."
    node "${PROJECT_DIR}/scripts/backup-scrub-db.js" "${DEST_FOLDER}/leads.db"
else
    echo "   ⚠️  Aviso: leads.db não encontrado no diretório do projeto."
fi

# 2. Backup dos Anexos e Arquivos de Clientes
if [ -d "${PROJECT_DIR}/storage" ]; then
    echo "📁 Copiando diretório de documentos e storage..."
    cp -r "${PROJECT_DIR}/storage" "${DEST_FOLDER}/"
    echo "   ✓ Arquivos de storage copiados!"
fi

# 3. Configurações críticas — SEM SEGREDOS.
# O .env (chaves Asaas, SMTP, Meta, etc.) e as chaves privadas TLS NÃO entram no backup:
# ele é levado a HD externo sem criptografia. Para saber o que reconfigurar numa
# restauração, gravamos apenas os NOMES das variáveis (nunca os valores). O .env em si
# deve ficar guardado em cofre de senhas (ver docs/INFRA.md, "Segredos fora do backup").
if [ -f "${PROJECT_DIR}/.env" ]; then
    grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=' "${PROJECT_DIR}/.env" \
        | sed -E 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=.*/\1/' | sort -u \
        > "${DEST_FOLDER}/env-variaveis.txt" || true
    echo "   ✓ Lista de NOMES das variáveis do .env gravada (sem valores)."
fi
if [ -d "${PROJECT_DIR}/nginx/ssl" ]; then
    mkdir -p "${DEST_FOLDER}/nginx/ssl"
    # certificados públicos sim; chaves privadas e contêineres (.key, *key*, .pfx, .p12) nunca
    find "${PROJECT_DIR}/nginx/ssl" -type f ! -iname '*key*' ! -iname '*.pfx' ! -iname '*.p12' \
        -exec cp {} "${DEST_FOLDER}/nginx/ssl/" \;
fi

# Trava de segurança: se algo sensível escapou para a pasta, aborta o backup.
VAZADOS="$(find "${DEST_FOLDER}" \( -name '.env' -o -name '.env.*' -o -iname '*key*' -o -iname '*.pfx' -o -iname '*.p12' \) | head -5)"
if [ -n "${VAZADOS}" ]; then
    echo "❌ ABORTADO: arquivos sensíveis encontrados no pacote de backup:"
    echo "${VAZADOS}"
    exit 1
fi

# Manifesto de integridade: o teste de restauração (scripts/backup-restore-test.js)
# confere cada arquivo do pacote contra estes hashes SHA-256.
( cd "${DEST_FOLDER}" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 -r sha256sum > MANIFEST.sha256 )
echo "   ✓ Manifesto de integridade gerado ($(wc -l < "${DEST_FOLDER}/MANIFEST.sha256") arquivo(s))."

# 4. Compactação e Empacotamento
echo "🗜️  Compactando pacote de backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${DEST_FOLDER}"

# 5. Geração de Checksum SHA-256 para Auditoria de Integridade
sha256sum "${BACKUP_NAME}.tar.gz" > "${BACKUP_NAME}.tar.gz.sha256"

# 5b. Cópia EXTERNA CIFRADA (AUD-12): se a chave pública estiver no servidor, o pacote é cifrado com ela.
# Só a chave PRIVADA (com o Dr. Jorge, fora do servidor) abre o .enc. Falha aqui não apaga o backup local,
# mas o teste semanal de restauração acusa a falta da versão cifrada.
PUB_KEY="${BACKUP_PUBLIC_KEY:-/etc/advocacia/backup-public.pem}"
if [ -f "${PUB_KEY}" ]; then
    echo "🔐 Cifrando o pacote para a cópia externa..."
    if node "${PROJECT_DIR}/scripts/backup-cifrar.js" cifrar "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" --pub="${PUB_KEY}"; then
        # Envio automático (opcional): destino configurado em /etc/advocacia/backup-remote.conf (uma linha, ex.: gdrive:Backups-JorgeAlvim)
        REMOTE_CONF="${BACKUP_REMOTE_CONF:-/etc/advocacia/backup-remote.conf}"
        if [ -f "${REMOTE_CONF}" ] && command -v rclone >/dev/null 2>&1; then
            REMOTE="$(head -n1 "${REMOTE_CONF}" | tr -d '\r')"
            echo "☁️  Enviando a cópia cifrada para ${REMOTE}..."
            if rclone copy "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz.enc" "${REMOTE}" && rclone copy "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz.enc.sha256" "${REMOTE}"; then
                echo "   ✓ Cópia externa enviada."
            else
                echo "   ⚠️  Falha ao enviar a cópia externa (o pacote cifrado local foi mantido)."
            fi
        fi
    else
        echo "   ⚠️  Falha ao cifrar o pacote (o pacote local sem cifra foi mantido)."
    fi
fi

FINAL_SIZE="$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)"
echo "   ✓ Pacote gerado: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz (${FINAL_SIZE})"

# 6. Rotação Automática de Backups (Remove backups locais com mais de 30 dias)
echo "🧹 Limpando backups locais com mais de 30 dias..."
find "${BACKUP_DIR}" -type f -name "backup_jorgealvim_*.tar.gz*" -mtime +30 -exec rm -f {} \;

echo "========================================================"
echo "✅ Backup Concluído com Sucesso!"
echo "📍 Arquivo: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "========================================================"
