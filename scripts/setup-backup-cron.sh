#!/bin/bash
# ============================================================
#  Configura no servidor (cron), de forma idempotente:
#   1) o backup automático diário: backup.sh todo dia às 03:00;
#   2) o TESTE DE RESTAURAÇÃO do backup: todo domingo às 04:30.
#      Restaura o pacote mais recente numa área isolada e confere checksum,
#      integridade do banco, arquivos e idade do backup. Se falhar, avisa o
#      titular por e-mail (--avisar) e registra em backups/restore-test.log.
#      Semanal de propósito: se o backup diário parar, o aviso chega em até 7 dias.
# ============================================================
# Atenção: "crontab -l" devolve erro quando o usuário ainda NÃO tem crontab. Com "set -e", isso
# abortava o subshell ANTES do echo e o agendamento era perdido em silêncio; por isso o "|| true".
set -e
PROJ="${PROJ:-/var/www/advocacia}"
NODE_BIN="$(command -v node || echo /usr/bin/node)"

chmod +x "$PROJ/backup.sh" 2>/dev/null || true
mkdir -p "$PROJ/backups"

CRON_LINE="0 3 * * * cd $PROJ && /bin/bash backup.sh >> $PROJ/backups/backup.log 2>&1"
VERIFY_LINE="30 4 * * 0 cd $PROJ && $NODE_BIN scripts/backup-restore-test.js backups --avisar --log=backups/restore-test.log >> backups/restore-test.out 2>&1"
# Verificacao periodica da producao (AUD-20): segunda 05:00, confere site/certificado/backup e avisa por e-mail se houver problema grave.
PROD_URL_V="${PROD_URL:-https://jorgealvimadvocacia.com.br}"
CHECKLIST_LINE="0 5 * * 1 cd $PROJ && $NODE_BIN scripts/producao-checklist.js --url=$PROD_URL_V --servidor=$PROJ >> backups/producao-checklist.log 2>&1 || $NODE_BIN scripts/avisar-producao.js >> backups/producao-checklist.log 2>&1"

if crontab -l 2>/dev/null | grep -Fq "backup.sh"; then
  echo "✓ Cron de backup já estava configurado."
else
  ( crontab -l 2>/dev/null || true; echo "$CRON_LINE" ) | crontab -
  echo "✅ Cron de backup ADICIONADO: todo dia às 03:00."
fi

if crontab -l 2>/dev/null | grep -Fq "backup-restore-test.js"; then
  echo "✓ Cron do teste de restauração já estava configurado."
else
  ( crontab -l 2>/dev/null || true; echo "$VERIFY_LINE" ) | crontab -
  echo "✅ Cron do teste de restauração ADICIONADO: todo domingo às 04:30."
fi

if crontab -l 2>/dev/null | grep -Fq "producao-checklist.js"; then
  echo "OK Cron da verificacao de producao ja estava configurado."
else
  ( crontab -l 2>/dev/null || true; echo "$CHECKLIST_LINE" ) | crontab -
  echo "ADICIONADO Cron da verificacao de producao: toda segunda as 05:00."
fi

echo ""
echo "--- Agendamentos de backup ativos ---"
crontab -l 2>/dev/null | grep -i backup || echo "(nenhum)"
