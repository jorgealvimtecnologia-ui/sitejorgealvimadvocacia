#!/usr/bin/env bash
# ============================================================
#   Configurar BACKUP AUTOMATICO diario no servidor (03:00)
#   Instala o agendamento (cron) e faz um backup de teste.
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

echo "============================================================"
echo "  Configurar backup automatico (diario 03:00) no servidor"
echo "============================================================"
echo "Servidor: $SRV ($REMOTE)"
echo

echo "[1/3] Enviando scripts de backup ao servidor..."
scp "${SSH_OPTS[@]}" backup.sh "$SRV:$REMOTE/backup.sh"
scp "${SSH_OPTS[@]}" scripts/setup-backup-cron.sh "$SRV:$REMOTE/scripts/setup-backup-cron.sh"
echo

echo "[2/3] Instalando o agendamento (cron) no servidor..."
ssh "${SSH_OPTS[@]}" "$SRV" "cd $REMOTE && bash scripts/setup-backup-cron.sh"
echo

echo "[3/3] Rodando um backup de teste agora (snapshot imediato)..."
ssh "${SSH_OPTS[@]}" "$SRV" "cd $REMOTE && /bin/bash backup.sh && echo '' && echo 'Backups existentes:' && ls -1t backups | head -5"
echo

echo "============================================================"
echo "  PRONTO! Backup automatico ativo (todo dia 03:00) e"
echo "  backup de teste criado com sucesso no servidor."
echo "============================================================"
