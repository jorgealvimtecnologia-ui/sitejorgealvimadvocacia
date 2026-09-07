#!/usr/bin/env bash
# ============================================================
#   ATIVAR CLOUDFLARE - Jorge Alvim Advocacia (Linux / WSL / Mac)
#   Adiciona TRUST_CLOUDFLARE=1 no .env do servidor e reinicia.
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
echo "  ATIVAR SUPORTE A CLOUDFLARE NO SERVIDOR"
echo "============================================================"
echo "Servidor...: $SRV ($REMOTE)"
echo

echo "[1/3] Verificando e atualizando .env no servidor..."
ssh "${SSH_OPTS[@]}" "$SRV" "if grep -q '^TRUST_CLOUDFLARE=' $REMOTE/.env 2>/dev/null; then sed -i 's/^TRUST_CLOUDFLARE=.*/TRUST_CLOUDFLARE=1/' $REMOTE/.env; else echo 'TRUST_CLOUDFLARE=1' >> $REMOTE/.env; fi; echo '   .env atualizado:'; grep 'TRUST_CLOUDFLARE' $REMOTE/.env"
echo

echo "[2/3] Reiniciando serviço advocacia..."
ssh "${SSH_OPTS[@]}" "$SRV" "systemctl restart advocacia && sleep 2"
echo

echo "[3/3] Checando status e saúde (health check)..."
ssh "${SSH_OPTS[@]}" "$SRV" "printf 'Status : ' && systemctl is-active advocacia && printf 'Health : ' && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health"
echo

echo "============================================================"
echo "  SUCESSO! Servidor integrado à Cloudflare (CF-Connecting-IP)"
echo "============================================================"
