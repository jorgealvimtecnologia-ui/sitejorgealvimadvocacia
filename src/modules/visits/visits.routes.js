/**
 * Módulo VISITAS do site (analytics de visitantes/pré-clientes). Extraído do server.js.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { logAudit } from '../../middleware/audit.js';
import { getClientIp } from '../../shared/net.js';

export const visitsRouter = express.Router();


// Helper para estimativa geográfica do IP
function estimateIpLocation(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip === 'localhost') {
    return {
      city: 'Juiz de Fora (Rede Local / Servidor)',
      region: 'MG',
      country: 'Brasil',
      isp: 'Conexão Local / Escritório'
    };
  }
  return {
    city: 'Juiz de Fora / Zona da Mata',
    region: 'MG',
    country: 'Brasil',
    isp: 'Provedor de Acesso à Internet'
  };
}

// 1. Rastrear Nova Visita ao Site (Público)
visitsRouter.post('/api/visits/track', (req, res) => {
  try {
    const rawIp = getClientIp(req);
    const clientIp = rawIp.split(',')[0].trim().replace(/^::ffff:/, '');
    const userAgent = req.headers['user-agent'] || 'Desconhecido';
    const referer = req.headers['referer'] || req.body.referer || '';
    const { page_url, path: pagePath, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.body;

    const now = new Date();
    const visitDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const visitYear = now.getFullYear();
    const visitMonth = now.getMonth() + 1; // 1 a 12
    const visitDay = now.getDate(); // 1 a 31
    const visitHour = now.getHours(); // 0 a 23
    const visitTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const createdAt = now.toISOString();

    const loc = estimateIpLocation(clientIp);

    // Detectar fonte e redes sociais automaticamente
    let detectedSocial = '';
    let detectedSource = utm_source || '';
    const lowerRef = ((referer || '') + ' ' + (page_url || '')).toLowerCase();
    if (lowerRef.includes('instagram')) detectedSocial = 'Instagram';
    else if (lowerRef.includes('facebook')) detectedSocial = 'Facebook';
    else if (lowerRef.includes('linkedin')) detectedSocial = 'LinkedIn';
    else if (lowerRef.includes('google') || lowerRef.includes('maps.google') || lowerRef.includes('business.google')) detectedSocial = 'Google Meu Negócio / Busca';
    else if (lowerRef.includes('whatsapp') || lowerRef.includes('wa.me')) detectedSocial = 'WhatsApp';
    else if (lowerRef.includes('youtube')) detectedSocial = 'YouTube';
    else if (lowerRef.includes('tiktok')) detectedSocial = 'TikTok';

    const result = db.prepare(`
      INSERT INTO site_visits (
        ip_address, user_agent, referer, page_url, path,
        visit_date, visit_year, visit_month, visit_day, visit_hour, visit_time, created_at,
        ip_city, ip_region, ip_country, ip_isp,
        utm_source, utm_medium, utm_campaign, social_media, status
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, 'Visitante'
      )
    `).run(
      clientIp, userAgent, referer || '', page_url || '/', pagePath || '/',
      visitDate, visitYear, visitMonth, visitDay, visitHour, visitTime, createdAt,
      loc.city, loc.region, loc.country, loc.isp,
      detectedSource || null, utm_medium || null, utm_campaign || null, detectedSocial || null
    );

    res.json({
      success: true,
      visitId: result.lastInsertRowid,
      ip: clientIp,
      estimatedLocation: loc
    });
  } catch (err) {
    console.error('Erro ao registrar visita:', err);
    res.status(500).json({ error: 'Erro ao registrar visita.' });
  }
});

// 2. Registrar Localização Consentida pelo Visitante (Público + Auditoria)
visitsRouter.post('/api/visits/update-location', (req, res) => {
  try {
    const { visitId, latitude, longitude, accuracy, city, state, address } = req.body;
    if (!visitId) {
      return res.status(400).json({ error: 'ID da visita é obrigatório.' });
    }

    const visit = db.prepare(`SELECT * FROM site_visits WHERE id = ?`).get(visitId);
    if (!visit) {
      return res.status(404).json({ error: 'Visita não encontrada.' });
    }

    const resolvedCity = city || (address ? address.split(',')[0] : 'Juiz de Fora');
    const resolvedState = state || 'MG';

    db.prepare(`
      UPDATE site_visits SET
        shared_location = 1,
        geo_latitude = ?,
        geo_longitude = ?,
        geo_accuracy = ?,
        geo_city = ?,
        geo_state = ?,
        geo_address = ?,
        status = CASE WHEN is_pre_client = 1 THEN 'Pré-Cliente' ELSE 'Localização Compartilhada' END
      WHERE id = ?
    `).run(
      latitude || null,
      longitude || null,
      accuracy || null,
      resolvedCity,
      resolvedState,
      address || null,
      visitId
    );

    // Registro na Trilha de Auditoria (Conforme solicitado pelo usuário)
    logAudit(req, {
      event_type: 'ACESSO',
      event_name: 'LOCALIZACAO_COMPARTILHADA',
      module: 'VISITANTES',
      resource_id: visitId,
      user_name: visit.visitor_name || 'Visitante do Site',
      description: `Visitante (IP: ${visit.ip_address}) consentiu e compartilhou sua localização: ${resolvedCity} - ${resolvedState} (Lat: ${latitude ? latitude.toFixed(4) : '-'}, Lon: ${longitude ? longitude.toFixed(4) : '-'}, Precisão: ${accuracy ? accuracy.toFixed(0) + 'm' : '-'}).`,
      details: { visitId, latitude, longitude, accuracy, city: resolvedCity, state: resolvedState, address, ip: visit.ip_address }
    });

    res.json({
      success: true,
      message: 'Localização registrada com sucesso na auditoria do escritório!'
    });
  } catch (err) {
    console.error('Erro ao atualizar localização:', err);
    res.status(500).json({ error: 'Erro ao registrar localização.' });
  }
});

// 3. Cadastrar / Atualizar Dados de Pré-Cliente (Público + Auditoria)
visitsRouter.post('/api/visits/pre-client', (req, res) => {
  try {
    const { visitId, name, phone, email, social_media, google_business, website, interest_area, notes } = req.body;
    if (!name && !phone && !email && !social_media && !website) {
      return res.status(400).json({ error: 'Informe ao menos o nome, telefone, rede social ou site.' });
    }

    const cleanName = (name || 'Pré-Cliente').trim();
    const cleanPhone = (phone || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanSocial = (social_media || '').trim();
    const cleanGoogle = (google_business || '').trim();
    const cleanWebsite = (website || '').trim();
    const cleanArea = (interest_area || 'Geral / Consultoria').trim();

    let targetVisitId = visitId;
    if (!targetVisitId) {
      const rawIp = getClientIp(req);
      const clientIp = rawIp.split(',')[0].trim().replace(/^::ffff:/, '');
      const now = new Date();
      const insert = db.prepare(`
        INSERT INTO site_visits (
          ip_address, user_agent, visit_date, visit_year, visit_month, visit_day, visit_hour, visit_time, created_at,
          ip_city, ip_region, ip_country, is_pre_client, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Juiz de Fora', 'MG', 'Brasil', 1, 'Pré-Cliente')
      `).run(
        clientIp, req.headers['user-agent'] || '', now.toISOString().split('T')[0],
        now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.toTimeString().split(' ')[0], now.toISOString()
      );
      targetVisitId = insert.lastInsertRowid;
    }

    db.prepare(`
      UPDATE site_visits SET
        visitor_name = ?,
        visitor_phone = ?,
        visitor_email = ?,
        social_media = COALESCE(NULLIF(?, ''), social_media),
        google_business = ?,
        website = ?,
        interest_area = ?,
        is_pre_client = 1,
        status = 'Pré-Cliente',
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      cleanName, cleanPhone, cleanEmail, cleanSocial, cleanGoogle, cleanWebsite, cleanArea, notes || null, targetVisitId
    );

    // Registro na Trilha de Auditoria
    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'PRE_CLIENTE_IDENTIFICADO',
      module: 'VISITANTES',
      resource_id: targetVisitId,
      user_name: cleanName,
      description: `Pré-Cliente registrado pelo site: ${cleanName} (Tel: ${cleanPhone || 'S/N'}, Redes: ${cleanSocial || 'S/N'}, Site: ${cleanWebsite || 'S/N'}, Google: ${cleanGoogle || 'S/N'}, Área: ${cleanArea}).`,
      details: { visitId: targetVisitId, name: cleanName, phone: cleanPhone, email: cleanEmail, social_media: cleanSocial, google_business: cleanGoogle, website: cleanWebsite, area: cleanArea }
    });

    res.json({
      success: true,
      message: 'Dados de pré-atendimento registrados com sucesso!',
      visitId: targetVisitId
    });
  } catch (err) {
    console.error('Erro ao registrar pré-cliente:', err);
    res.status(500).json({ error: 'Erro ao registrar dados de pré-cliente.' });
  }
});
