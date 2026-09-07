#!/usr/bin/env bash
# ============================================================
#   DEPLOY - Jorge Alvim Advocacia (Linux / macOS / WSL)
#   Executa o envio dos arquivos para o servidor em produção.
#   Faz backup antes, envia os arquivos e reinicia com AUTO-ROLLBACK.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

KEY="${KEY:-$HOME/.ssh/id_ed25519_161_97_71_14}"
SRV="${SRV:-root@161.97.71.14}"
REMOTE="${REMOTE:-/var/www/advocacia}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
fi

echo "============================================================"
echo "  DEPLOY - Jorge Alvim Advocacia"
echo "============================================================"
echo "Pasta local: $(pwd)"
echo "Servidor...: $SRV ($REMOTE)"
echo

echo "[1/3] Fazendo backup COMPLETO no servidor (para rollback)..."
ssh "${SSH_OPTS[@]}" "$SRV" "D=$REMOTE/backups/predeploy-\$(date +%Y%m%d-%H%M%S); mkdir -p \$D && cp -r $REMOTE/server.js $REMOTE/*.html $REMOTE/src $REMOTE/public \$D/ 2>/dev/null; echo \$D > $REMOTE/backups/LAST && echo '   Backup criado em: '\$D"
echo

echo "[2/3] Enviando server.js, páginas públicas (*.html), src/, public/ e scripts/..."
scp "${SSH_OPTS[@]}" -r server.js *.html src public scripts "$SRV:$REMOTE/"
echo

echo "[3/3] Ajustando permissões, reiniciando e checando saúde (com AUTO-ROLLBACK)..."
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'manual')"
ssh "${SSH_OPTS[@]}" "$SRV" "sed -i 's/\r$//' $REMOTE/scripts/deploy-remote.sh 2>/dev/null; bash $REMOTE/scripts/deploy-remote.sh $REMOTE advocacia 3000 $SHA"

echo
echo "============================================================"
echo "  PRONTO! Deploy no ar com sucesso. Versão: $SHA"
echo "============================================================"
