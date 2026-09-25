/**
 * ==============================================================================
 * MÓDULO META ADS & MARKETING (Facebook Graph API & Marketing API)
 * ==============================================================================
 * Permite ao escritório de advocacia:
 * 1. Fazer upload de mídias (fotos e vídeos) para anúncios e posts;
 * 2. Enviar campanhas em rascunho (status: 'PAUSED') para o Meta Ads Manager;
 * 3. Publicar conteúdos institucionais no Facebook e Instagram;
 * 4. Validador de Compliance Ético OAB (Provimento 205/2021) e Políticas da Meta;
 * 5. Armazenamento e histórico local no banco SQLite com fallback seguro.
 * ==============================================================================
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { ROOT_DIR } from '../../config/constants.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const metaAdsRouter = express.Router();

// ------------------------------------------------------------------------------
// Configuração do Diretório de Armazenamento de Mídias de Marketing
// ------------------------------------------------------------------------------
const MARKETING_STORAGE_DIR = path.join(ROOT_DIR, 'storage', 'marketing');
if (!fs.existsSync(MARKETING_STORAGE_DIR)) {
  fs.mkdirSync(MARKETING_STORAGE_DIR, { recursive: true });
}

const storageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MARKETING_STORAGE_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const rand = crypto.randomBytes(3).toString('hex');
    cb(null, `meta_${Date.now()}_${rand}_${cleanBase}${ext}`);
  }
});

const uploadMarketing = multer({
  storage: storageEngine,
  limits: { fileSize: 40 * 1024 * 1024 } // 40MB
});

// ------------------------------------------------------------------------------
// Inicialização das Tabelas no SQLite
// ------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS meta_marketing_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT,
    call_to_action TEXT NOT NULL DEFAULT 'LEARN_MORE',
    destination_type TEXT NOT NULL, -- 'AD_DRAFT_PAUSED', 'FACEBOOK_PAGE_POST', 'INSTAGRAM_FEED', 'LOCAL_DRAFT'
    media_path TEXT,
    media_type TEXT,
    media_filename TEXT,
    status TEXT NOT NULL, -- 'SENT_TO_META_PAUSED', 'PUBLISHED_ORGANIC', 'DRAFT_LOCAL', 'SIMULATED_DRAFT'
    meta_response TEXT,
    meta_ad_id TEXT,
    meta_creative_id TEXT,
    compliance_flags TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta_api_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mmp_status ON meta_marketing_posts(status);
  CREATE INDEX IF NOT EXISTS idx_mmp_dest ON meta_marketing_posts(destination_type);
`);

// Migrações seguras e retrocompatíveis para segmentação de público, orçamento diário e agendamento
const adPostColumns = [
  "daily_budget_cents INTEGER DEFAULT 2000",
  "campaign_goal TEXT DEFAULT 'OUTCOME_LEADS'",
  "target_city TEXT DEFAULT 'Juiz de Fora'",
  "target_radius_km INTEGER DEFAULT 40",
  "target_age_min INTEGER DEFAULT 25",
  "target_age_max INTEGER DEFAULT 65",
  "target_gender TEXT DEFAULT 'ALL'",
  "target_interests TEXT DEFAULT '[]'",
  "start_date TEXT",
  "end_date TEXT",
  "ad_status TEXT DEFAULT 'ACTIVE'"
];
for (const col of adPostColumns) {
  try {
    db.exec(`ALTER TABLE meta_marketing_posts ADD COLUMN ${col}`);
  } catch (_) {}
}

// Semeador seguro das contas oficiais da Meta (Instagram, Ads, WhatsApp, Página)
const officialMetaDefaults = [
  ['meta_instagram_account_id', '17841460928822628'],
  ['meta_ad_account_id', '705653348893835'],
  ['meta_whatsapp_account_id', '114822078371308'],
  ['meta_page_id', '696494846890195']
];
for (const [k, v] of officialMetaDefaults) {
  try {
    db.prepare(`
      INSERT INTO meta_api_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(k, v, new Date().toISOString());
  } catch (_) {}
}

// ------------------------------------------------------------------------------
// Validador de Compliance Ético OAB (Prov. 205/2021) & Diretrizes da Meta
// ------------------------------------------------------------------------------
export function checkOABAndMetaCompliance(title = '', message = '') {
  const text = `${title} ${message}`.toLowerCase();
  const warnings = [];

  // Regras OAB - Promessa de Resultados
  if (/(causa ganha|ganho de causa|garantido|garantimos|resultado certo|100% de vit[oó]ria)/i.test(text)) {
    warnings.push('Alerta OAB (Prov. 205/2021): Vedada promessa de resultados judiciais ou expressões como "causa ganha" ou "garantido".');
  }

  // Regras OAB - Mercantilização e Preços
  if (/(gr[aá]tis|gratuito|sem custo nenhum|de gra[cç]a|promo[cç][aã]o|desconto|pre[cç]o popular|parcelas de r\$|r\$|\bhonor[aá]rios gr[aá]tis)/i.test(text)) {
    warnings.push('Alerta OAB (Art. 4º): Vedada a divulgação de valores, preços, gratuidade enganosa ou mercantilização da advocacia.');
  }

  // Regras OAB - Autolouvaminha
  if (/(o melhor advogado|líder em|lider de mercado|imbat[ií]vel|especialista n[uú]mero 1|o mais r[aá]pido)/i.test(text)) {
    warnings.push('Alerta OAB (Art. 3º): Vedada a autolouvação e comparações depreciativas com colegas de profissão.');
  }

  // Regras Meta Ads - Atributos Pessoais & Sensacionalismo
  if (/(est[aá] com nome sujo|est[aá] devendo|foi demitido injustamente\?|est[aá] falido)/i.test(text)) {
    warnings.push('Alerta Meta Ads: Políticas de anúncio proíbem perguntas diretas sobre atributos pessoais negativos (dívidas, demissão, falência).');
  }

  return {
    compliant: warnings.length === 0,
    warnings
  };
}

// ------------------------------------------------------------------------------
// Obtenção Segura das Configurações da Meta (Variáveis de Ambiente ou Banco)
// ------------------------------------------------------------------------------
function getMetaConfig() {
  const getSetting = (key, envVar) => {
    try {
      const row = db.prepare(`SELECT value FROM meta_api_settings WHERE key = ?`).get(key);
      if (row && row.value) return row.value;
    } catch (_) {}
    return process.env[envVar] || '';
  };

  const systemUserToken = getSetting('meta_system_user_token', 'META_SYSTEM_USER_TOKEN');
  const adAccountId = getSetting('meta_ad_account_id', 'META_AD_ACCOUNT_ID');
  const pageId = getSetting('meta_page_id', 'META_PAGE_ID');
  const instagramAccountId = getSetting('meta_instagram_account_id', 'META_INSTAGRAM_ACCOUNT_ID');
  const defaultAdsetId = getSetting('meta_default_adset_id', 'META_DEFAULT_ADSET_ID');

  return {
    systemUserToken,
    adAccountId: adAccountId.startsWith('act_') ? adAccountId : (adAccountId ? `act_${adAccountId}` : ''),
    pageId,
    instagramAccountId,
    defaultAdsetId,
    isConfigured: Boolean(systemUserToken && (adAccountId || pageId))
  };
}

// ------------------------------------------------------------------------------
// 1. OBTER CONFIGURAÇÕES DA META API
// ------------------------------------------------------------------------------
metaAdsRouter.get('/api/meta-ads/config', requireAuth, (req, res) => {
  try {
    const config = getMetaConfig();
    res.json({
      success: true,
      isConfigured: config.isConfigured,
      adAccountId: config.adAccountId,
      pageId: config.pageId,
      instagramAccountId: config.instagramAccountId,
      defaultAdsetId: config.defaultAdsetId,
      hasToken: Boolean(config.systemUserToken)
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar configuração da Meta API: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. SALVAR CONFIGURAÇÕES DA META API
// ------------------------------------------------------------------------------
metaAdsRouter.post('/api/meta-ads/config', requireAuth, (req, res) => {
  try {
    const { systemUserToken, adAccountId, pageId, instagramAccountId, defaultAdsetId } = req.body;
    const now = new Date().toISOString();

    const upsertStmt = db.prepare(`
      INSERT INTO meta_api_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    if (systemUserToken !== undefined && systemUserToken !== '') {
      upsertStmt.run('meta_system_user_token', String(systemUserToken).trim(), now);
    }
    if (adAccountId !== undefined) {
      upsertStmt.run('meta_ad_account_id', String(adAccountId).trim(), now);
    }
    if (pageId !== undefined) {
      upsertStmt.run('meta_page_id', String(pageId).trim(), now);
    }
    if (instagramAccountId !== undefined) {
      upsertStmt.run('meta_instagram_account_id', String(instagramAccountId).trim(), now);
    }
    if (defaultAdsetId !== undefined) {
      upsertStmt.run('meta_default_adset_id', String(defaultAdsetId).trim(), now);
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'META_ADS_CONFIG_UPDATE',
      module: 'META_ADS',
      description: 'Configurações de integração com a Meta API atualizadas pelo administrador.'
    });

    res.json({ success: true, message: 'Configurações da Meta API atualizadas com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar credenciais: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. VERIFICAÇÃO EM TEMPO REAL DE COMPLIANCE ÉTICO (OAB + META)
// ------------------------------------------------------------------------------
metaAdsRouter.post('/api/meta-ads/compliance-check', requireAuth, (req, res) => {
  const { title = '', message = '' } = req.body;
  const result = checkOABAndMetaCompliance(title, message);
  res.json({ success: true, ...result });
});

// ------------------------------------------------------------------------------
// 4. LISTAR MATERIAIS & RASCUNHOS DE MARKETING
// ------------------------------------------------------------------------------
metaAdsRouter.get('/api/meta-ads/posts', requireAuth, (req, res) => {
  try {
    const posts = db.prepare(`SELECT * FROM meta_marketing_posts ORDER BY created_at DESC LIMIT 100`).all();
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar materiais: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. PUBLICAR / ENVIAR RASCUNHO DE ANÚNCIO PARA A META
// ------------------------------------------------------------------------------
metaAdsRouter.post('/api/meta-ads/posts', requireAuth, uploadMarketing.single('media'), async (req, res) => {
  try {
    const {
      title,
      message,
      link_url = 'https://jorgealvimadvocacia.com.br',
      call_to_action = 'LEARN_MORE',
      destination_type = 'AD_DRAFT_PAUSED',
      daily_budget = 20,
      campaign_goal = 'OUTCOME_LEADS',
      target_city = 'Juiz de Fora',
      target_radius_km = 40,
      target_age_min = 25,
      target_age_max = 65,
      target_gender = 'ALL',
      target_interests = '[]',
      start_date = null,
      end_date = null,
      ad_status = 'ACTIVE'
    } = req.body;

    if (!title || !message) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(400).json({ error: 'Título e texto da publicação são obrigatórios.' });
    }

    const dailyBudgetCents = Math.max(500, Math.round(parseFloat(daily_budget || 20) * 100));
    const radiusKm = parseInt(target_radius_km, 10) || 40;
    const ageMin = Math.max(18, Math.min(65, parseInt(target_age_min, 10) || 25));
    const ageMax = Math.max(ageMin, Math.min(65, parseInt(target_age_max, 10) || 65));
    const gender = ['ALL', 'MEN', 'WOMEN'].includes(target_gender) ? target_gender : 'ALL';
    const desiredStatus = ad_status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
    let targetInterestsJson = '[]';
    try {
      if (typeof target_interests === 'string') {
        const parsed = JSON.parse(target_interests);
        targetInterestsJson = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
      } else if (Array.isArray(target_interests)) {
        targetInterestsJson = JSON.stringify(target_interests);
      }
    } catch (_) {
      targetInterestsJson = JSON.stringify([String(target_interests || '')]);
    }

    const compliance = checkOABAndMetaCompliance(title, message);
    const config = getMetaConfig();
    const postId = 'meta_post_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const now = new Date().toISOString();

    let mediaPath = null;
    let mediaFilename = null;
    let mediaType = null;

    if (req.file) {
      mediaPath = `/storage/marketing/${req.file.filename}`;
      mediaFilename = req.file.originalname;
      mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }

    // URL pública da imagem para publicação orgânica.
    // O Instagram (Content Publishing API) EXIGE uma URL direta de imagem acessível;
    // o Facebook /photos também aceita `url`. Prioriza o arquivo enviado; senão usa a
    // capa do artigo (media_url) vinda do handoff do blog.
    const PUBLIC_BASE = (process.env.PROD_URL || 'https://jorgealvimadvocacia.com.br').replace(/\/+$/, '');
    let publicImageUrl = null;
    if (req.file && mediaType === 'image') {
      publicImageUrl = `${PUBLIC_BASE}/storage/marketing/${req.file.filename}`;
    } else if (req.body.media_url) {
      const rawUrl = String(req.body.media_url).trim();
      if (rawUrl) {
        publicImageUrl = rawUrl.startsWith('http')
          ? rawUrl
          : `${PUBLIC_BASE}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      }
    }

    let status = 'DRAFT_LOCAL';
    let metaAdId = null;
    let metaCreativeId = null;
    let metaResponseObj = null;

    // Se temos integração real com a Meta configurada
    if (config.isConfigured && config.systemUserToken) {
      try {
        if (destination_type === 'AD_DRAFT_PAUSED') {
          // =========================================================================
          // MODO 1: ANÚNCIO PAGO NO META ADS (Veicula tanto no Facebook quanto Instagram)
          // =========================================================================
          let imageHash = null;
          if (req.file && mediaType === 'image') {
            const fileBuffer = fs.readFileSync(req.file.path);
            const blob = new Blob([fileBuffer], { type: req.file.mimetype });
            const form = new FormData();
            form.append('filename', blob, req.file.originalname);
            form.append('access_token', config.systemUserToken);

            const imgRes = await fetch(`https://graph.facebook.com/v21.0/${config.adAccountId}/adimages`, {
              method: 'POST',
              body: form
            });
            const imgData = await imgRes.json();
            if (imgData.images && imgData.images[req.file.originalname]) {
              imageHash = imgData.images[req.file.originalname].hash;
            }
          }

          const storySpec = {
            page_id: config.pageId || undefined,
            link_data: {
              image_hash: imageHash || undefined,
              link: link_url,
              message: message,
              name: title,
              call_to_action: { type: call_to_action }
            }
          };

          // Vincula perfil do Instagram comercial para aparecer em ambas as redes
          if (config.instagramAccountId) {
            storySpec.instagram_actor_id = config.instagramAccountId;
          }

          const creativePayload = {
            access_token: config.systemUserToken,
            name: `Criativo: ${title}`,
            object_story_spec: storySpec
          };

          const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${config.adAccountId}/adcreatives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creativePayload)
          });
          const creativeData = await creativeRes.json();
          metaCreativeId = creativeData.id || null;

          if (metaCreativeId && config.defaultAdsetId) {
            const adRes = await fetch(`https://graph.facebook.com/v21.0/${config.adAccountId}/ads`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: config.systemUserToken,
                name: `Anúncio: ${title}`,
                adset_id: config.defaultAdsetId,
                creative: { creative_id: metaCreativeId },
                status: desiredStatus
              })
            });
            const adData = await adRes.json();
            metaAdId = adData.id || null;
            metaResponseObj = adData;
            status = desiredStatus === 'ACTIVE' ? 'ACTIVE' : 'SENT_TO_META_PAUSED';
          } else {
            status = metaCreativeId ? (desiredStatus === 'ACTIVE' ? 'ACTIVE' : 'SENT_TO_META_PAUSED') : 'DRAFT_LOCAL';
            metaResponseObj = creativeData;
          }

        } else if (destination_type === 'FACEBOOK_PAGE_POST') {
          // =========================================================================
          // MODO 2: PUBLICAÇÃO ORGÂNICA NA PÁGINA DO FACEBOOK
          // =========================================================================
          if (!config.pageId) {
            status = 'DRAFT_LOCAL';
            metaResponseObj = { error: 'Página do Facebook não configurada: informe o ID da Página (pageId) em Configurações da Meta API.' };
          } else {
            const captionText = `${title}\n\n${message}${link_url ? `\n\nSaiba mais: ${link_url}` : ''}`;
            let fbEndpoint = `https://graph.facebook.com/v21.0/${config.pageId}/feed`;
            let fbBody;
            let fbHeaders = {};

            if (req.file && mediaType === 'image') {
              // Imagem enviada no formulário — sobe o arquivo direto (source)
              fbEndpoint = `https://graph.facebook.com/v21.0/${config.pageId}/photos`;
              const fileBuffer = fs.readFileSync(req.file.path);
              const blob = new Blob([fileBuffer], { type: req.file.mimetype });
              const form = new FormData();
              form.append('source', blob, req.file.originalname);
              form.append('caption', captionText);
              form.append('access_token', config.systemUserToken);
              fbBody = form;
            } else if (publicImageUrl) {
              // Capa do artigo (URL pública) — publica como foto via `url`
              fbEndpoint = `https://graph.facebook.com/v21.0/${config.pageId}/photos`;
              fbHeaders = { 'Content-Type': 'application/json' };
              fbBody = JSON.stringify({
                access_token: config.systemUserToken,
                url: publicImageUrl,
                caption: captionText
              });
            } else {
              // Sem imagem — post de texto + link no feed
              fbHeaders = { 'Content-Type': 'application/json' };
              fbBody = JSON.stringify({
                access_token: config.systemUserToken,
                message: `${title}\n\n${message}`,
                link: link_url || undefined
              });
            }

            const fbRes = await fetch(fbEndpoint, { method: 'POST', headers: fbHeaders, body: fbBody });
            const fbData = await fbRes.json();
            metaAdId = fbData.id || fbData.post_id || null;
            metaResponseObj = fbData;
            status = metaAdId ? 'PUBLISHED_ORGANIC' : 'SIMULATED_DRAFT';
          }

        } else if (destination_type === 'INSTAGRAM_FEED') {
          // =========================================================================
          // MODO 3: PUBLICAÇÃO ORGÂNICA NO INSTAGRAM (Content Publishing API)
          // =========================================================================
          if (!config.instagramAccountId) {
            status = 'DRAFT_LOCAL';
            metaResponseObj = { error: 'Instagram não configurado: informe o ID da conta comercial (instagramAccountId) em Configurações da Meta API.' };
          } else if (!publicImageUrl) {
            // O feed do Instagram NÃO aceita post sem mídia — precisa de uma imagem pública.
            status = 'DRAFT_LOCAL';
            metaResponseObj = { error: 'O feed do Instagram exige uma imagem. Envie uma imagem do criativo ou defina a capa do artigo antes de publicar.' };
          } else {
            const igEndpoint = `https://graph.facebook.com/v21.0/${config.instagramAccountId}/media`;
            const igRes = await fetch(igEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: config.systemUserToken,
                caption: `${title}\n\n${message}${link_url ? `\n\n${link_url}` : ''}`,
                image_url: publicImageUrl
              })
            });
            const igData = await igRes.json();
            if (igData.id) {
              // Publicar o container criado
              const pubRes = await fetch(`https://graph.facebook.com/v21.0/${config.instagramAccountId}/media_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: config.systemUserToken,
                  creation_id: igData.id
                })
              });
              const pubData = await pubRes.json();
              if (pubData.id) {
                metaAdId = pubData.id;
                metaResponseObj = pubData;
                status = 'PUBLISHED_ORGANIC';
              } else {
                metaResponseObj = { error: 'Falha ao publicar o container no Instagram.', detail: pubData };
                status = 'SIMULATED_DRAFT';
              }
            } else {
              metaResponseObj = { error: 'Falha ao criar a mídia no Instagram (verifique se a URL da imagem é pública e se o token tem permissão instagram_content_publish).', detail: igData };
              status = 'SIMULATED_DRAFT';
            }
          }
        } else {
          status = 'DRAFT_LOCAL';
          metaResponseObj = { note: 'Rascunho interno gravado no sistema.' };
        }

      } catch (metaErr) {
        console.warn('[META ADS API] Falha na chamada externa da Meta:', metaErr.message);
        status = 'SIMULATED_DRAFT';
        metaAdId = `meta_ad_sim_${Date.now()}`;
        metaCreativeId = `meta_cr_sim_${Date.now()}`;
        metaResponseObj = { simulated: true, note: 'Gravado em modo assistido local.', reason: metaErr.message };
      }
    } else {
      // Modo Simulação/Homologação local assistida (quando ainda não há tokens reais ou destino é rascunho)
      status = destination_type === 'AD_DRAFT_PAUSED' ? 'SIMULATED_DRAFT' : 'DRAFT_LOCAL';
      metaAdId = `meta_ad_sim_${Date.now()}`;
      metaCreativeId = `meta_cr_sim_${Date.now()}`;
      metaResponseObj = {
        simulated: true,
        destination: destination_type,
        message: 'Rascunho gerado localmente com sucesso! Será sincronizado quando o System User Token for ativado.'
      };
    }

    // Persistir no Banco de Dados com configuração ampla de público e orçamento
    const insertStmt = db.prepare(`
      INSERT INTO meta_marketing_posts (
        id, title, message, link_url, call_to_action, destination_type,
        media_path, media_type, media_filename, status, meta_response,
        meta_ad_id, meta_creative_id, compliance_flags, created_by,
        daily_budget_cents, campaign_goal, target_city, target_radius_km,
        target_age_min, target_age_max, target_gender, target_interests,
        start_date, end_date, ad_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      postId,
      title,
      message,
      link_url,
      call_to_action,
      destination_type,
      mediaPath,
      mediaType,
      mediaFilename,
      status,
      JSON.stringify(metaResponseObj),
      metaAdId,
      metaCreativeId,
      JSON.stringify(compliance.warnings),
      req.user?.username || 'admin',
      dailyBudgetCents,
      campaign_goal,
      target_city,
      radiusKm,
      ageMin,
      ageMax,
      gender,
      targetInterestsJson,
      start_date || null,
      end_date || null,
      desiredStatus,
      now,
      now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'META_POST_CREATED',
      module: 'META_ADS',
      resource_id: postId,
      description: `Material de marketing criado: "${title}" (${destination_type}) status=${desiredStatus} término=${end_date || 'contínuo'} com orçamento de R$ ${(dailyBudgetCents/100).toFixed(2)}/dia em ${target_city} (+${radiusKm}km).`
    });

    const metaErrorMsg = metaResponseObj && (metaResponseObj.error?.message || (typeof metaResponseObj.error === 'string' ? metaResponseObj.error : null));
    const statusMessages = {
      ACTIVE: 'Campanha ativada com sucesso no Meta Ads Manager!',
      SENT_TO_META_PAUSED: 'Rascunho salvo no Meta Ads Manager (status: PAUSED)!',
      PUBLISHED_ORGANIC: destination_type === 'INSTAGRAM_FEED'
        ? 'Publicado no feed do Instagram com sucesso! 📸'
        : 'Publicado no feed da Página do Facebook com sucesso! 📘',
      SIMULATED_DRAFT: `Não foi possível publicar agora${metaErrorMsg ? `: ${metaErrorMsg}` : '.'} O material ficou salvo como rascunho.`,
      DRAFT_LOCAL: metaErrorMsg
        ? `Salvo como rascunho — ${metaErrorMsg}`
        : (desiredStatus === 'ACTIVE'
            ? 'Material homologado como ATIVO! Clique em "Publicar" para veicular.'
            : 'Material salvo com sucesso no histórico como Rascunho Pausado!')
    };

    res.status(201).json({
      success: true,
      published: ['ACTIVE', 'PUBLISHED_ORGANIC', 'SENT_TO_META_PAUSED'].includes(status),
      message: statusMessages[status] || 'Material salvo no painel.',
      post: {
        id: postId,
        title,
        message,
        link_url,
        call_to_action,
        destination_type,
        media_path: mediaPath,
        media_type: mediaType,
        status,
        ad_status: desiredStatus,
        start_date,
        end_date,
        meta_ad_id: metaAdId,
        daily_budget_cents: dailyBudgetCents,
        campaign_goal: campaign_goal,
        target_city: target_city,
        target_radius_km: radiusKm,
        target_age_min: ageMin,
        target_age_max: ageMax,
        target_gender: gender,
        target_interests: JSON.parse(targetInterestsJson),
        compliance
      }
    });

  } catch (err) {
    console.error('Erro ao processar post da Meta:', err);
    res.status(500).json({ error: 'Erro ao processar material: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. ALTERAR STATUS DO ANÚNCIO (ATIVAR / PAUSAR NO META ADS OU LOCAL)
// ------------------------------------------------------------------------------
metaAdsRouter.patch('/api/meta-ads/posts/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;
    if (!['ACTIVE', 'PAUSED', 'PUBLISHED'].includes(newStatus)) {
      return res.status(400).json({ error: 'Status deve ser ACTIVE, PAUSED ou PUBLISHED.' });
    }

    const post = db.prepare('SELECT * FROM meta_marketing_posts WHERE id = ?').get(id);
    if (!post) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }

    const config = getMetaConfig();
    let metaUpdated = false;

    if (post.meta_ad_id && config.isConfigured && config.systemUserToken && !post.meta_ad_id.startsWith('meta_ad_sim_') && ['ACTIVE', 'PAUSED'].includes(newStatus)) {
      try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${post.meta_ad_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            access_token: config.systemUserToken
          })
        });
        const rData = await response.json();
        if (rData.success) metaUpdated = true;
      } catch (err) {
        console.warn('[META ADS API] Erro ao sincronizar status na Meta:', err.message);
      }
    }

    const now = new Date().toISOString();
    const dbStatus = newStatus === 'PUBLISHED' ? 'PUBLISHED_ORGANIC' : (newStatus === 'ACTIVE' ? 'ACTIVE' : 'SENT_TO_META_PAUSED');
    const adStatus = newStatus === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
    db.prepare(`
      UPDATE meta_marketing_posts
      SET ad_status = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(adStatus, dbStatus, now, id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'META_AD_STATUS_TOGGLE',
      module: 'META_ADS',
      resource_id: id,
      description: `Status do anúncio "${post.title}" alterado para ${newStatus}.`
    });

    res.json({
      success: true,
      message: `Status alterado para ${newStatus === 'ACTIVE' ? 'ATIVO (Veiculando)' : newStatus === 'PUBLISHED' ? 'PUBLICADO' : 'PAUSADO'} com sucesso!`,
      ad_status: adStatus,
      status: dbStatus,
      metaUpdated
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar status do anúncio: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 7. PUBLICAR MATERIAL EXISTENTE NA META (OU RETORNAR STATUS SE REQUER TOKEN)
// ------------------------------------------------------------------------------
metaAdsRouter.post('/api/meta-ads/posts/:id/publish', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = db.prepare('SELECT * FROM meta_marketing_posts WHERE id = ?').get(id);
    if (!post) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }

    const config = getMetaConfig();
    if (!config.isConfigured || !config.systemUserToken) {
      return res.json({
        success: false,
        requiresToken: true,
        message: 'Token de Acesso da Meta não configurado. Use o assistente com cópia automática ou insira o token na engrenagem ⚙️.',
        post
      });
    }

    let metaAdId = null;
    let metaCreativeId = null;
    let newStatus = 'ACTIVE';

    if (post.destination_type === 'AD_DRAFT_PAUSED' && config.adAccountId) {
      const storySpec = {
        page_id: config.pageId || undefined,
        link_data: {
          link: post.link_url || 'https://jorgealvimadvocacia.com.br',
          message: post.message,
          name: post.title,
          call_to_action: { type: post.call_to_action || 'LEARN_MORE' }
        }
      };
      if (config.instagramAccountId) {
        storySpec.instagram_actor_id = config.instagramAccountId;
      }
      const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${config.adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: config.systemUserToken,
          name: `Criativo: ${post.title}`,
          object_story_spec: storySpec
        })
      });
      const creativeData = await creativeRes.json();
      metaCreativeId = creativeData.id || null;

      if (metaCreativeId && config.defaultAdsetId) {
        const adRes = await fetch(`https://graph.facebook.com/v21.0/${config.adAccountId}/ads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: config.systemUserToken,
            name: `Anúncio: ${post.title}`,
            adset_id: config.defaultAdsetId,
            creative: { creative_id: metaCreativeId },
            status: post.ad_status || 'ACTIVE'
          })
        });
        const adData = await adRes.json();
        metaAdId = adData.id || null;
      }
      newStatus = post.ad_status === 'PAUSED' ? 'SENT_TO_META_PAUSED' : 'ACTIVE';
    } else if (post.destination_type === 'FACEBOOK_PAGE_POST' && config.pageId) {
      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${config.pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: config.systemUserToken,
          message: `${post.title}\n\n${post.message}`,
          link: post.link_url || undefined
        })
      });
      const fbData = await fbRes.json();
      metaAdId = fbData.id || fbData.post_id || null;
      newStatus = 'PUBLISHED_ORGANIC';
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE meta_marketing_posts
      SET meta_ad_id = COALESCE(?, meta_ad_id),
          meta_creative_id = COALESCE(?, meta_creative_id),
          status = ?,
          ad_status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(metaAdId, metaCreativeId, newStatus, 'ACTIVE', now, id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'META_POST_PUBLISHED',
      module: 'META_ADS',
      resource_id: id,
      description: `Material "${post.title}" publicado na Meta.`
    });

    res.json({
      success: true,
      message: 'Material publicado na Meta com sucesso!',
      meta_ad_id: metaAdId,
      status: newStatus
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao publicar material na Meta: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. EXCLUIR MATERIAL / RASCUNHO
// ------------------------------------------------------------------------------
metaAdsRouter.delete('/api/meta-ads/posts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const post = db.prepare(`SELECT * FROM meta_marketing_posts WHERE id = ?`).get(id);

    if (!post) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }

    if (post.media_path) {
      const fullPath = path.join(ROOT_DIR, post.media_path);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (_) {}
      }
    }

    db.prepare(`DELETE FROM meta_marketing_posts WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'META_POST_DELETED',
      module: 'META_ADS',
      resource_id: id,
      description: `Material de marketing excluído: "${post.title}".`
    });

    res.json({ success: true, message: 'Material excluído com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir material: ' + err.message });
  }
});
