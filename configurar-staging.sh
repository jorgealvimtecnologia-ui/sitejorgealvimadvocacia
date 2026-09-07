#!/usr/bin/env bash
# ============================================================
#   CONFIGURAR AMBIENTE DE HOMOLOGAÇÃO (STAGING) NO SERVIDOR
#   Cria /var/www/advocacia-staging, serviço systemd na porta 3001
#   e vhost nginx para homolog.jorgealvimadvocacia.com.br
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

KEY="${KEY:-$HOME/.ssh/id_ed25519}"
SRV="${SRV:-root@161.97.71.14}"
REMOTE_PROD="${REMOTE_PROD:-/var/www/advocacia}"
REMOTE_STAGING="${REMOTE_STAGING:-/var/www/advocacia-staging}"
SERVICE_NAME="advocacia-staging"
STAGING_PORT="3001"
DOMAIN="homolog.jorgealvimadvocacia.com.br"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
elif [ -f "$HOME/.ssh/id_ed25519_161_97_71_14" ]; then
  SSH_OPTS+=(-i "$HOME/.ssh/id_ed25519_161_97_71_14")
fi

echo "============================================================"
echo "  CONFIGURAÇÃO DO AMBIENTE DE HOMOLOGAÇÃO (STAGING)"
echo "============================================================"
echo "Servidor...: $SRV"
echo "Destino....: $REMOTE_STAGING (Porta $STAGING_PORT)"
echo "Subdomínio.: https://$DOMAIN"
echo

echo "[1/4] Criando diretório de staging e copiando base de arquivos..."
ssh "${SSH_OPTS[@]}" "$SRV" bash -s <<REMOTE_SCRIPT
set -e
mkdir -p "$REMOTE_STAGING" "$REMOTE_STAGING/backups" "$REMOTE_STAGING/storage"
# Copia arquivos base do projeto de produção (sem sobrescrever caso já existam)
cp -r "$REMOTE_PROD/server.js" "$REMOTE_PROD"/*.html "$REMOTE_PROD/src" "$REMOTE_PROD/public" "$REMOTE_PROD/scripts" "$REMOTE_PROD/package.json" "$REMOTE_STAGING/" 2>/dev/null || true

# Copia node_modules se não existir no staging
if [ ! -d "$REMOTE_STAGING/node_modules" ] && [ -d "$REMOTE_PROD/node_modules" ]; then
  echo "  Copiando node_modules para staging..."
  cp -r "$REMOTE_PROD/node_modules" "$REMOTE_STAGING/"
fi

# Configura .env de staging com porta 3001
if [ ! -f "$REMOTE_STAGING/.env" ]; then
  if [ -f "$REMOTE_PROD/.env" ]; then
    cp "$REMOTE_PROD/.env" "$REMOTE_STAGING/.env"
    sed -i 's/^PORT=.*/PORT=3001/' "$REMOTE_STAGING/.env"
    if ! grep -q '^PORT=' "$REMOTE_STAGING/.env"; then
      echo "PORT=3001" >> "$REMOTE_STAGING/.env"
    fi
  else
    echo -e "PORT=3001\nNODE_ENV=production\nTRUST_CLOUDFLARE=1" > "$REMOTE_STAGING/.env"
  fi
else
  sed -i 's/^PORT=.*/PORT=3001/' "$REMOTE_STAGING/.env"
fi

echo "  ✓ Diretório $REMOTE_STAGING pronto."
REMOTE_SCRIPT
echo

echo "[2/4] Criando e ativando serviço systemd ($SERVICE_NAME)..."
ssh "${SSH_OPTS[@]}" "$SRV" bash -s <<REMOTE_SCRIPT
set -e
NODE_BIN=\$(which node || echo "/usr/bin/node")
U=\$(systemctl cat advocacia 2>/dev/null | sed -n 's/^User=//p'); U="\${U:-www-data}"

cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=Jorge Alvim Advocacia - Ambiente de Homologacao (Staging)
After=network.target

[Service]
Type=simple
User=\$U
WorkingDirectory=$REMOTE_STAGING
ExecStart=\$NODE_BIN server.js
Restart=always
RestartSec=5
Environment=PORT=$STAGING_PORT
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Ajusta permissões
chown -R "\$U:\$U" "$REMOTE_STAGING"
chmod -R a+rX "$REMOTE_STAGING"

systemctl daemon-reload
systemctl enable --now $SERVICE_NAME
systemctl restart $SERVICE_NAME
sleep 2

printf "  Status do serviço: "
systemctl is-active $SERVICE_NAME
REMOTE_SCRIPT
echo

echo "[3/4] Configurando vhost do Nginx para $DOMAIN..."
ssh "${SSH_OPTS[@]}" "$SRV" bash -s <<REMOTE_SCRIPT
set -e
NGINX_CONF="/etc/nginx/sites-available/advocacia-staging"

# Se o nginx usar sites-available / sites-enabled:
if [ -d "/etc/nginx/sites-available" ]; then
  cat > "\$NGINX_CONF" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name homolog.jorgealvimadvocacia.com.br;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header CF-Connecting-IP \$http_cf_connecting_ip;
        client_max_body_size 100M;
    }
}
EOF
  ln -sf "\$NGINX_CONF" "/etc/nginx/sites-enabled/advocacia-staging"
elif [ -d "/etc/nginx/conf.d" ]; then
  cat > "/etc/nginx/conf.d/advocacia-staging.conf" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name homolog.jorgealvimadvocacia.com.br;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header CF-Connecting-IP \$http_cf_connecting_ip;
        client_max_body_size 100M;
    }
}
EOF
fi

# Testa sintaxe do Nginx e recarrega
nginx -t && systemctl reload nginx
echo "  ✓ Nginx configurado e recarregado com sucesso."
REMOTE_SCRIPT
echo

echo "[4/4] Testando saúde do Staging localmente no servidor..."
ssh "${SSH_OPTS[@]}" "$SRV" "printf 'Health Check (Porta 3001): ' && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/health"
echo

echo "============================================================"
echo "  STAGING PROVISIONADO COM SUCESSO!"
echo "============================================================"
echo "  Pasta: $REMOTE_STAGING"
echo "  Serviço: $SERVICE_NAME (porta $STAGING_PORT)"
echo "  Subdomínio: https://$DOMAIN"
echo
echo "  LEMBRETE: Na Cloudflare, adicione o registro DNS:"
echo "    Tipo: A"
echo "    Nome: homolog"
echo "    Destino: 161.97.71.14"
echo "    Proxy: Proxied (Nuvem laranja ligada)"
echo "============================================================"
