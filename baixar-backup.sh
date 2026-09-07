#!/usr/bin/env bash
# ============================================================
#   BACKUP EXTERNO (offsite) - Jorge Alvim Advocacia
#   Gera um backup atual no servidor e BAIXA para o seu PC
#   (pasta backups-offsite/). Regra 3-2-1 de seguranca.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

KEY="${KEY:-$HOME/.ssh/id_ed25519}"
SRV="${SRV:-root@161.97.71.14}"
REMOTE="${REMOTE:-/var/www/advocacia}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
elif [ -f "$HOME/.ssh/id_ed25519_161_97_71_14" ]; then
  SSH_OPTS+=(-i "$HOME/.ssh/id_ed25519_161_97_71_14")
fi

mkdir -p backups-offsite

echo "============================================================"
echo "  Backup externo (baixando para o seu notebook)"
echo "============================================================"
echo

echo "[1/2] Gerando backup atual no servidor..."
LATEST=$(ssh "${SSH_OPTS[@]}" "$SRV" "cd $REMOTE && /bin/bash backup.sh >/dev/null 2>&1; ls -t backups/*.tar.gz 2>/dev/null | head -1")

if [ -z "$LATEST" ]; then
  echo "  Nenhum backup encontrado no servidor. Execute antes ./configurar-backup-automatico.sh"
  exit 1
fi

echo "  Arquivo gerado: $LATEST"
echo
echo "[2/2] Baixando para a pasta local backups-offsite/..."
scp "${SSH_OPTS[@]}" "$SRV:$REMOTE/$LATEST" backups-offsite/
scp "${SSH_OPTS[@]}" "$SRV:$REMOTE/$LATEST.sha256" backups-offsite/ 2>/dev/null || true

echo
echo "============================================================"
echo "  PRONTO! Copia de seguranca salva em:"
echo "  $(pwd)/backups-offsite"
echo "============================================================"
