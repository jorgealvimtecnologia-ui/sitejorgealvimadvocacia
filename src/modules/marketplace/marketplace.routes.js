/**
 * Módulo LOJA (Marketplace Jurídico) — Rotas de API (integração com o painel)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * O sub-app de verdade (venda de PDFs com split do Mercado Pago, OAuth de autores,
 * moderação e download com marca d'água) vive em `marketplace-juridico/` e é um app
 * Express CommonJS autônomo. Ele é montado em `/loja` pelo server.js SOMENTE quando
 * `MARKETPLACE_ENABLED=true` e os segredos existem — porque o carregamento do sub-app
 * exige as chaves do Mercado Pago e derrubaria o boot se faltassem.
 *
 * Aqui ficam apenas as rotas `/api/loja/*` que a aba do painel consome (só o mestre).
 * Nenhum segredo é lido ou exposto; só reportamos o ESTADO (ligada/desligada) e as
 * pendências que faltam para ligar os pagamentos.
 */
import express from 'express';

export const marketplaceRouter = express.Router();

/** Variáveis obrigatórias para LIGAR os pagamentos (Mercado Pago + cofre de segredos). */
const REQUIRED_ENV = [
  'TOKEN_ENCRYPTION_KEY',
  'SESSION_SECRET',
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
];

/** A flag está ligada? (apenas a chave de ambiente, sem checar segredos). */
export function marketplaceFlagOn() {
  return process.env.MARKETPLACE_ENABLED === 'true';
}

/** A loja está pronta para operar (flag ligada E todos os segredos presentes)? */
export function marketplaceReady() {
  return marketplaceFlagOn() && REQUIRED_ENV.every((k) => process.env[k]);
}

/** Lista legível do que ainda falta para ligar os pagamentos. */
export function marketplacePendencias() {
  const pend = [];
  if (!marketplaceFlagOn()) {
    pend.push('Ligar a flag MARKETPLACE_ENABLED=true no ambiente (systemd/cofre).');
  }
  const faltando = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (faltando.length) {
    pend.push('Cadastrar os segredos no cofre (scripts/env-vault.js): ' + faltando.join(', ') + '.');
  }
  pend.push('Abrir conta Mercado Pago Marketplace (produção) com split aprovado — o sandbox não valida o split.');
  pend.push('Criar a pasta privada dos PDFs no servidor (PRIVATE_UPLOADS_DIR) e bloqueá-la no Nginx (nunca servir como estático).');
  return pend;
}

/**
 * GET /api/loja/status — estado da loja para a aba do painel (só o mestre).
 * Resposta: { success, ready, flag, pendencias[], vitrineUrl, moderacaoUrl }
 */
marketplaceRouter.get('/api/loja/status', (req, res) => {
  const ready = marketplaceReady();
  return res.json({
    success: true,
    ready,
    flag: marketplaceFlagOn(),
    pendencias: ready ? [] : marketplacePendencias(),
    vitrineUrl: '/loja',
    moderacaoUrl: '/loja/painel/admin/moderacao',
    comissaoPadrao: Number(process.env.PLATFORM_FEE_PERCENT || 15),
  });
});
