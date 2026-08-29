#!/bin/bash
# ==============================================================================
# Script de Configuração de Certificado SSL Oficial (Let's Encrypt / Certbot)
# Escritório: Jorge Alvim Advocacia
# ==============================================================================

if [ -z "$1" ]; then
  echo "Uso: ./init-letsencrypt.sh seu-dominio.com.br seu-email@exemplo.com"
  exit 1
fi

DOMAIN=$1
EMAIL=${2:-"contato@$DOMAIN"}

echo "🏛️  Iniciando emissão de certificado SSL para: $DOMAIN"
echo "📧  E-mail de renovação: $EMAIL"

# 1. Cria diretórios para validação do desafio ACME
mkdir -p ./nginx/ssl ./certbot/www ./certbot/conf

# 2. Executa o Certbot via Docker
docker run --rm \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  -v "$(pwd)/nginx/ssl:/etc/letsencrypt/live/$DOMAIN" \
  certbot/certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" -d "www.$DOMAIN"

echo "✅ Certificado gerado com sucesso para $DOMAIN!"
echo "🔄 Recarregando Nginx..."
docker compose restart nginx-proxy
