#!/usr/bin/env bash
# ============================================================================
#  deploy-remote.sh — executa NO servidor, após o envio dos arquivos.
#  Ajusta permissões, reinicia o serviço, confere a saúde e — se o health
#  check falhar — REVERTE AUTOMATICAMENTE para o último backup (rollback).
#  Também grava um marcador de versão (data/hora + commit) do que está no ar.
#
#  Uso:  deploy-remote.sh <REMOTE_DIR> <SERVICE> <PORT> [GIT_SHA]
#  Ex.:  deploy-remote.sh /var/www/advocacia advocacia 3000 9ee3393
#  Códigos de saída: 0=OK · 1=deploy revertido (rollback OK) · 2/3=falha grave
# ============================================================================
set -u
REMOTE="${1:-/var/www/advocacia}"
SERVICE="${2:-advocacia}"
PORT="${3:-3000}"
GIT_SHA="${4:-desconhecido}"

# Usuário do serviço (o scp grava como root; o serviço roda como www-data e
# precisa de permissão de leitura/travessia nas pastas novas).
U=$(systemctl cat "$SERVICE" 2>/dev/null | sed -n 's/^User=//p'); U="${U:-www-data}"

fix_perms() {
  chown -R "$U:$U" "$REMOTE/src" "$REMOTE/public" 2>/dev/null || true
  chmod -R a+rX "$REMOTE/src" "$REMOTE/public" 2>/dev/null || true
  chmod a+r "$REMOTE/server.js" "$REMOTE"/*.html 2>/dev/null || true
}

health() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://localhost:$PORT/health" 2>/dev/null || echo 000
}

echo "[deploy-remote] Ajustando permissões (usuário do serviço: $U)..."
fix_perms

echo "[deploy-remote] Reiniciando $SERVICE..."
systemctl restart "$SERVICE"
sleep 3
CODE="$(health)"
echo "[deploy-remote] Health pós-deploy: $CODE"

if [ "$CODE" = "200" ]; then
  # Marca a versão implantada (para saber o que está no ar).
  mkdir -p "$REMOTE/backups"
  echo "$(date '+%Y-%m-%d %H:%M:%S') · commit $GIT_SHA · OK" > "$REMOTE/backups/DEPLOYED"
  printf '[deploy-remote] Status do servico: '; systemctl is-active "$SERVICE"
  echo "[deploy-remote] DEPLOY OK — versão $GIT_SHA no ar."
  exit 0
fi

echo "[deploy-remote] !!! Health falhou ($CODE). REVERTENDO automaticamente para o último backup..."
D="$(cat "$REMOTE/backups/LAST" 2>/dev/null)"
if [ -z "$D" ] || [ ! -d "$D" ]; then
  echo "[deploy-remote] !!! Nenhum backup encontrado em backups/LAST. Rollback impossível — intervenção manual necessária."
  exit 2
fi
echo "[deploy-remote] Restaurando de: $D"
cp -r "$D"/server.js "$D"/*.html "$D"/src "$D"/public "$REMOTE/" 2>/dev/null || true
fix_perms
systemctl restart "$SERVICE"
sleep 3
CODE2="$(health)"
if [ "$CODE2" = "200" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') · ROLLBACK (deploy $GIT_SHA falhou) · versão anterior restaurada" > "$REMOTE/backups/DEPLOYED"
  echo "[deploy-remote] ROLLBACK OK — versão anterior no ar (Health 200). O deploy com problema foi DESFEITO automaticamente."
  exit 1
fi
echo "[deploy-remote] !!! ROLLBACK também falhou (Health $CODE2). Intervenção manual necessária (rode reparar-servidor.bat)."
exit 3
