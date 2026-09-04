#!/bin/bash
# ============================================================
#  Configura o backup automático diário (cron) no servidor.
#  Agenda backup.sh todo dia às 03:00. Idempotente.
# ============================================================
set -e
PROJ=/var/www/advocacia

chmod +x "$PROJ/backup.sh" 2>/dev/null || true
mkdir -p "$PROJ/backups"

CRON_LINE="0 3 * * * cd $PROJ && /bin/bash backup.sh >> $PROJ/backups/backup.log 2>&1"

if crontab -l 2>/dev/null | grep -Fq "backup.sh"; then
  echo "✓ Cron de backup já estava configurado."
else
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
  echo "✅ Cron de backup ADICIONADO: todo dia às 03:00."
fi

echo ""
echo "--- Agendamentos de backup ativos ---"
crontab -l 2>/dev/null | grep -i backup || echo "(nenhum)"
