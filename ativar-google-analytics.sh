#!/usr/bin/env bash
# ============================================================
#   ATIVAR GOOGLE ANALYTICS 4 (GA4) NO SERVIDOR
#   Adiciona GA_MEASUREMENT_ID=G-H4K6S068SW no .env de producao e staging.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

KEY="${KEY:-$HOME/.ssh/id_ed25519}"
SRV="${SRV:-root@161.97.71.14}"
REMOTE_PROD="/var/www/advocacia"
REMOTE_STAGING="/var/www/advocacia-staging"
GA_ID="G-H4K6S068SW"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
elif [ -f "$HOME/.ssh/id_ed25519_161_97_71_14" ]; then
  SSH_OPTS+=(-i "$HOME/.ssh/id_ed25519_161_97_71_14")
fi

echo "============================================================"
echo "  ATIVAR GOOGLE ANALYTICS 4 NO SERVIDOR"
echo "============================================================"
echo "Servidor...: $SRV"
echo "ID GA4.....: $GA_ID"
echo

echo "[1/3] Atualizando .env em Produção ($REMOTE_PROD)..."
ssh "${SSH_OPTS[@]}" "$SRV" "if grep -q '^GA_MEASUREMENT_ID=' $REMOTE_PROD/.env 2>/dev/null; then sed -i 's/^GA_MEASUREMENT_ID=.*/GA_MEASUREMENT_ID=$GA_ID/' $REMOTE_PROD/.env; else echo 'GA_MEASUREMENT_ID=$GA_ID' >> $REMOTE_PROD/.env; fi; echo '   Producao:'; grep 'GA_MEASUREMENT_ID' $REMOTE_PROD/.env"
echo

echo "[2/3] Atualizando .env em Staging ($REMOTE_STAGING)..."
ssh "${SSH_OPTS[@]}" "$SRV" "if [ -f $REMOTE_STAGING/.env ]; then if grep -q '^GA_MEASUREMENT_ID=' $REMOTE_STAGING/.env 2>/dev/null; then sed -i 's/^GA_MEASUREMENT_ID=.*/GA_MEASUREMENT_ID=$GA_ID/' $REMOTE_STAGING/.env; else echo 'GA_MEASUREMENT_ID=$GA_ID' >> $REMOTE_STAGING/.env; fi; echo '   Staging:'; grep 'GA_MEASUREMENT_ID' $REMOTE_STAGING/.env; fi"
echo

echo "[3/3] Reiniciando serviços para aplicar a tag no site..."
ssh "${SSH_OPTS[@]}" "$SRV" "systemctl restart advocacia && (systemctl restart advocacia-staging 2>/dev/null || true) && sleep 2"

echo "Verificando se a tag esta ativa na pagina inicial:"
ssh "${SSH_OPTS[@]}" "$SRV" "curl -s http://localhost:3000/ | grep -q '$GA_ID' && echo '  ✓ Tag Google Analytics injetada com sucesso no HTML!' || echo '  AVISO: Verifique o HTML'"

echo
echo "============================================================"
echo "  SUCESSO! Google Analytics 4 ativo em https://jorgealvimadvocacia.com.br"
echo "============================================================"
