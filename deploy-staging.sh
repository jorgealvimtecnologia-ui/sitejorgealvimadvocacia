#!/usr/bin/env bash
# ============================================================
#   DEPLOY para HOMOLOGACAO (STAGING) - Jorge Alvim Advocacia
#   Envia os arquivos para o ambiente separado de teste
#   Faz backup antes, envia arquivos e reinicia com AUTO-ROLLBACK.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

KEY="${KEY:-$HOME/.ssh/id_ed25519}"
SRV="${SRV:-root@161.97.71.14}"
REMOTE="${REMOTE:-/var/www/advocacia-staging}"
SERVICE="advocacia-staging"
PORT="3001"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
elif [ -f "$HOME/.ssh/id_ed25519_161_97_71_14" ]; then
  SSH_OPTS+=(-i "$HOME/.ssh/id_ed25519_161_97_71_14")
fi

echo "============================================================"
echo "  DEPLOY STAGING (HOMOLOGACAO) - Jorge Alvim Advocacia"
echo "============================================================"
echo "Pasta local: $(pwd)"
echo "Servidor...: $SRV ($REMOTE)"
echo "Servico....: $SERVICE (Porta $PORT)"
echo

echo "[1/3] Fazendo backup no staging (para rollback)..."
ssh "${SSH_OPTS[@]}" "$SRV" "D=$REMOTE/backups/predeploy-\$(date +%Y%m%d-%H%M%S); mkdir -p \$D && cp -r $REMOTE/server.js $REMOTE/*.html $REMOTE/src $REMOTE/public \$D/ 2>/dev/null; echo \$D > $REMOTE/backups/LAST && echo '   Backup criado em: '\$D"
echo

echo "[2/3] Enviando server.js, páginas públicas (*.html), src/, public/ e scripts/..."
scp "${SSH_OPTS[@]}" -r server.js *.html src public scripts "$SRV:$REMOTE/"
echo

echo "[3/3] Ajustando permissões, reiniciando e checando saúde (com AUTO-ROLLBACK)..."
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'manual')"
ssh "${SSH_OPTS[@]}" "$SRV" "sed -i 's/\r$//' $REMOTE/scripts/deploy-remote.sh 2>/dev/null; bash $REMOTE/scripts/deploy-remote.sh $REMOTE $SERVICE $PORT $SHA"

echo
echo "============================================================"
echo "  PRONTO! Staging no ar: https://homolog.jorgealvimadvocacia.com.br"
echo "============================================================"
