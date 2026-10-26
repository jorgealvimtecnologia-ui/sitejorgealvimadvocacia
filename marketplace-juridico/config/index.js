'use strict';

/**
 * Configuração central lida de variáveis de ambiente (.env).
 * Em produção, defina estas variáveis no systemd/pm2, nunca commitadas.
 */

require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'https://jorgealvimadvocacia.com.br',
  port: Number(process.env.PORT || 3000),

  db: {
    path: process.env.DB_PATH || path_default(),
  },

  // Pasta PRIVADA dos PDFs — FORA do diretório público servido pelo Express.
  // Ex.: /var/data/monografias  (nunca dentro de /public)
  storage: {
    privateDir: process.env.PRIVATE_UPLOADS_DIR || '/var/data/monografias',
    maxPdfBytes: Number(process.env.MAX_PDF_BYTES || 40 * 1024 * 1024), // 40MB
  },

  // Chave de 32 bytes em hex (64 chars) para AES-256-GCM dos tokens do MP.
  // Gere com:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  crypto: {
    tokenKeyHex: required('TOKEN_ENCRYPTION_KEY'),
  },

  session: {
    secret: required('SESSION_SECRET'),
  },

  mercadopago: {
    clientId: required('MP_CLIENT_ID'),        // APP_ID da aplicação marketplace
    clientSecret: required('MP_CLIENT_SECRET'),
    // Chave pública do INTEGRADOR (marketplace), usada no front por padrão.
    integratorPublicKey: process.env.MP_PUBLIC_KEY || '',
    redirectUri: process.env.MP_REDIRECT_URI ||
      'https://jorgealvimadvocacia.com.br/oauth/callback',
    // Secret configurado no painel de Webhooks do MP (assinatura x-signature)
    webhookSecret: required('MP_WEBHOOK_SECRET'),
    oauthTokenUrl: 'https://api.mercadopago.com/oauth/token',
    authorizeUrl: 'https://auth.mercadopago.com/authorization',
    paymentsUrl: 'https://api.mercadopago.com/v1/payments',
  },

  // Comissão padrão da plataforma (%). Pode ser sobrescrita por autor/produto.
  platform: {
    defaultFeePercent: Number(process.env.PLATFORM_FEE_PERCENT || 15),
    downloadTokenHours: Number(process.env.DOWNLOAD_TOKEN_HOURS || 48),
    downloadMaxUses: Number(process.env.DOWNLOAD_MAX_USES || 5),
  },
};

function path_default() {
  // Padrão: ./data/marketplace.db relativo à raiz do projeto
  return require('path').join(process.cwd(), 'data', 'marketplace.db');
}
