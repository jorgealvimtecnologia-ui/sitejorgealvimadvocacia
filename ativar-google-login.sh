#!/usr/bin/env bash
# ============================================================
#   ATIVAR LOGIN COM O GOOGLE NO SERVIDOR
#   Adiciona GOOGLE_CLIENT_ID no .env de producao e staging.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

KEY="${KEY:-$HOME/.ssh/id_ed25519}"
SRV="${SRV:-root@161.97.71.14}"
REMOTE_PROD="/var/www/advocacia"
REMOTE_STAGING="/var/www/advocacia-staging"
CLIENT_ID="285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
elif [ -f "$HOME/.ssh/id_ed25519_161_97_71_14" ]; then
  SSH_OPTS+=(-i "$HOME/.ssh/id_ed25519_161_97_71_14")
fi

echo "============================================================"
echo "  ATIVAR LOGIN COM O GOOGLE NO SERVIDOR"
echo "============================================================"
echo "Servidor...: $SRV"
echo "Client ID..: $CLIENT_ID"
echo

echo "[1/3] Atualizando .env em Produção ($REMOTE_PROD)..."
ssh "${SSH_OPTS[@]}" "$SRV" "if grep -q '^GOOGLE_CLIENT_ID=' $REMOTE_PROD/.env 2>/dev/null; then sed -i 's/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$CLIENT_ID/' $REMOTE_PROD/.env; else echo 'GOOGLE_CLIENT_ID=$CLIENT_ID' >> $REMOTE_PROD/.env; fi; echo '   Producao:'; grep 'GOOGLE_CLIENT_ID' $REMOTE_PROD/.env"
echo

echo "[2/3] Atualizando .env em Staging ($REMOTE_STAGING)..."
ssh "${SSH_OPTS[@]}" "$SRV" "if [ -f $REMOTE_STAGING/.env ]; then if grep -q '^GOOGLE_CLIENT_ID=' $REMOTE_STAGING/.env 2>/dev/null; then sed -i 's/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$CLIENT_ID/' $REMOTE_STAGING/.env; else echo 'GOOGLE_CLIENT_ID=$CLIENT_ID' >> $REMOTE_STAGING/.env; fi; echo '   Staging:'; grep 'GOOGLE_CLIENT_ID' $REMOTE_STAGING/.env; fi"
echo

echo "[3/3] Reiniciando serviços para ativar o Google Sign-In..."
ssh "${SSH_OPTS[@]}" "$SRV" "systemctl restart advocacia && (systemctl restart advocacia-staging 2>/dev/null || true) && sleep 2"

echo "Verificando se a API de autenticação do Google responde ativa:"
ssh "${SSH_OPTS[@]}" "$SRV" "curl -s http://localhost:3000/api/auth/google-config"
echo

echo "============================================================"
echo "  SUCESSO! Login com Google ATIVO no Painel e Portal do Cliente!"
echo "============================================================"
