/**
 * ==============================================================================
 * MÓDULO RADAR / PROSPECÇÃO B2B (GOOGLE EMPRESAS, CRM KANBAN & EXPORTAÇÕES)
 * ==============================================================================
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Funcionalidades:
 * 1. Base isolada de Prospecção B2B (tabela radar_b2b_prospects) com índices;
 * 2. Importação e sincronização com bases locais (Google Meu Negócio / Places);
 * 3. Busca ao vivo via Google Places API (New v1);
 * 4. CRM estilo Kanban (Novo -> Contatado -> Sem Resposta -> Em Negociação -> Convertido / Descartado);
 * 5. Conversão em 1 clique para Cliente formal (PJ) na tabela clients do escritório;
 * 6. Exportação para Meta Ads (Público Personalizado) e Brevo (E-mail/WhatsApp Marketing).
 * ==============================================================================
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { generateNextClientFullId } from '../../shared/ids.js';

export const radarB2bRouter = express.Router();

// ------------------------------------------------------------------------------
// 1. INICIALIZAÇÃO DA TABELA DE PROSPECÇÃO B2B
// ------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS radar_b2b_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    international_phone TEXT,
    website TEXT,
    address TEXT,
    neighborhood TEXT,
    city TEXT DEFAULT 'Juiz de Fora',
    state TEXT DEFAULT 'MG',
    postal_code TEXT,
    rating REAL,
    user_ratings_total INTEGER DEFAULT 0,
    business_status TEXT DEFAULT 'OPERATIONAL',
    primary_type TEXT,
    primary_type_display TEXT,
    types TEXT,
    google_maps_url TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT DEFAULT 'novo', -- 'novo', 'contatado', 'sem_resposta', 'negociando', 'convertido', 'descartado'
    notes TEXT,
    priority TEXT DEFAULT 'media', -- 'baixa', 'media', 'alta'
    converted_client_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_radar_b2b_status ON radar_b2b_prospects(status);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_primary_type ON radar_b2b_prospects(primary_type);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_neighborhood ON radar_b2b_prospects(neighborhood);
  CREATE INDEX IF NOT EXISTS idx_radar_b2b_phone ON radar_b2b_prospects(phone);
`);

// ------------------------------------------------------------------------------
// HELPERS & UTILITÁRIOS
// ------------------------------------------------------------------------------
function cleanDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function formatPhoneBR(raw) {
  const digits = cleanDigits(raw);
  if (!digits) return raw || '';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.startsWith('55') && digits.length >= 12) {
    return formatPhoneBR(digits.slice(2));
  }
  return raw.trim();
}

function extractNeighborhood(address) {
  if (!address) return 'Centro';
  // Exemplo: "Av. Barão do Rio Branco, 3896 - Bom Pastor, Juiz de Fora - MG, 36025-020"
  const m = address.match(/-\s*([^,]+),\s*Juiz de Fora/i);
  if (m && m[1]) return m[1].trim();
  const m2 = address.match(/,\s*([^,-]+)\s*-\s*Juiz de Fora/i);
  if (m2 && m2[1]) return m2[1].trim();
  return 'Juiz de Fora';
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// ------------------------------------------------------------------------------
// 2. ENDPOINTS DA API
// ------------------------------------------------------------------------------

/**
 * GET /api/radar-b2b/stats
 * Resumo estatístico do funil Kanban e base de prospecção
 */
radarB2bRouter.get('/api/radar-b2b/stats', requireAuth, (req, res) => {
  try {
    const total = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects`).get().c;
    const statsByStatus = db.prepare(`
      SELECT status, count(*) as count 
      FROM radar_b2b_prospects 
      GROUP BY status
    `).all();

    const statusCounts = {
      novo: 0,
      contatado: 0,
      sem_resposta: 0,
      negociando: 0,
      convertido: 0,
      descartado: 0
    };
    for (const r of statsByStatus) {
      if (r.status in statusCounts) statusCounts[r.status] = r.count;
    }

    const withPhone = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE phone IS NOT NULL AND phone != ''`).get().c;
    const withWebsite = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects WHERE website IS NOT NULL AND website != ''`).get().c;

    const topCategories = db.prepare(`
      SELECT primary_type_display, count(*) as count 
      FROM radar_b2b_prospects 
      WHERE primary_type_display IS NOT NULL AND primary_type_display != ''
      GROUP BY primary_type_display 
      ORDER BY count DESC 
      LIMIT 8
    `).all();

    const topNeighborhoods = db.prepare(`
      SELECT neighborhood, count(*) as count 
      FROM radar_b2b_prospects 
      WHERE neighborhood IS NOT NULL AND neighborhood != ''
      GROUP BY neighborhood 
      ORDER BY count DESC 
      LIMIT 8
    `).all();

    return res.json({
      success: true,
      total,
      withPhone,
      withWebsite,
      statusCounts,
      topCategories,
      topNeighborhoods
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b/stats:', error);
    return res.status(500).json({ error: 'Erro ao carregar métricas B2B.' });
  }
});

/**
 * GET /api/radar-b2b/prospects
 * Lista prospects para Kanban ou Tabela com filtros
 */
radarB2bRouter.get('/api/radar-b2b/prospects', requireAuth, (req, res) => {
  try {
    const { status, category, neighborhood, search, limit = 100, offset = 0, view = 'all' } = req.query;

    let sql = `SELECT * FROM radar_b2b_prospects WHERE 1=1`;
    const params = [];

    if (status && status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    if (category && category !== 'todos') {
      sql += ` AND (primary_type = ? OR primary_type_display = ?)`;
      params.push(category, category);
    }
    if (neighborhood && neighborhood !== 'todos') {
      sql += ` AND neighborhood = ?`;
      params.push(neighborhood);
    }
    if (search && search.trim()) {
      const s = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(address) LIKE ? OR LOWER(neighborhood) LIKE ?)`;
      params.push(s, s, s, s);
    }

    // Se for visualização Kanban, podemos agrupar até 25 por coluna para máxima velocidade
    if (view === 'kanban') {
      sql += ` ORDER BY user_ratings_total DESC, rating DESC, id DESC LIMIT 200`;
    } else {
      sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
      params.push(Math.min(parseInt(limit, 10) || 50, 300), parseInt(offset, 10) || 0);
    }

    const rows = db.prepare(sql).all(...params);

    return res.json({
      success: true,
      totalCount: rows.length,
      prospects: rows
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b/prospects:', error);
    return res.status(500).json({ error: 'Erro ao listar prospects B2B.' });
  }
});

/**
 * PUT /api/radar-b2b/prospects/:id/status
 * Atualiza status no Kanban, anotações e prioridade
 */
radarB2bRouter.put('/api/radar-b2b/prospects/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, priority } = req.body;

    const validStatuses = ['novo', 'contatado', 'sem_resposta', 'negociando', 'convertido', 'descartado'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status Kanban inválido.' });
    }

    const current = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(id);
    if (!current) {
      return res.status(404).json({ error: 'Prospect não encontrado.' });
    }

    const newStatus = status || current.status;
    const newNotes = notes !== undefined ? notes : current.notes;
    const newPriority = priority || current.priority || 'media';
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE radar_b2b_prospects 
      SET status = ?, notes = ?, priority = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, newNotes, newPriority, now, id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'B2B_STATUS_UPDATE',
      module: 'radar-b2b',
      description: `Atualizou prospect #${id} (${current.name}) para ${newStatus}`
    });

    return res.json({ success: true, id, status: newStatus });
  } catch (error) {
    console.error('[ERRO] radar-b2b update status:', error);
    return res.status(500).json({ error: 'Erro ao atualizar prospect.' });
  }
});

/**
 * POST /api/radar-b2b/prospects/:id/convert
 * Converte um prospect em Cliente PJ formal do escritório
 */
radarB2bRouter.post('/api/radar-b2b/prospects/:id/convert', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const prospect = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(id);

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect não encontrado.' });
    }

    if (prospect.converted_client_id) {
      return res.json({
        success: true,
        alreadyConverted: true,
        clientId: prospect.converted_client_id,
        message: 'Prospect já foi convertido em cliente anteriormente.'
      });
    }

    const newClientId = generateNextClientFullId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO clients (
        id, client_type, full_name, phone, website, street,
        neighborhood, city, state, google_business, created_at, updated_at
      ) VALUES (?, 'PJ', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newClientId,
      prospect.name,
      prospect.phone || '',
      prospect.website || '',
      prospect.address || '',
      prospect.neighborhood || 'Centro',
      prospect.city || 'Juiz de Fora',
      prospect.state || 'MG',
      prospect.google_maps_url || '',
      now,
      now
    );

    // Marca como convertido no radar
    db.prepare(`
      UPDATE radar_b2b_prospects 
      SET status = 'convertido', converted_client_id = ?, updated_at = ?
      WHERE id = ?
    `).run(newClientId, now, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'B2B_CONVERT_CLIENT',
      module: 'radar-b2b',
      description: `Prospect #${id} (${prospect.name}) convertido em Cliente ${newClientId}`
    });

    return res.json({
      success: true,
      clientId: newClientId,
      message: `Empresa "${prospect.name}" convertida com sucesso em Cliente PJ (${newClientId})!`
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b convert:', error);
    return res.status(500).json({ error: 'Erro ao converter prospect em cliente.' });
  }
});

/**
 * POST /api/radar-b2b/importar-local
 * Importa o CSV local de empresas deduplicadas ou ampliado já gerado pelo extrator
 */
radarB2bRouter.post('/api/radar-b2b/importar-local', requireAuth, (req, res) => {
  try {
    const defaultPaths = [
      '/home/jorgealvim/Documents/programação/crm-leads/empresas_deduplicadas.csv',
      '/home/jorgealvim/Documents/programação/crm-leads/empresas_juiz_de_fora_ampliado_20260315_114940.csv'
    ];

    let targetPath = null;
    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        targetPath = p;
        break;
      }
    }

    if (!targetPath) {
      return res.status(404).json({ error: 'Nenhum arquivo CSV de empresas encontrado na pasta crm-leads.' });
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lines.length <= 1) {
      return res.status(400).json({ error: 'Arquivo CSV sem registros.' });
    }

    const header = parseCSVLine(lines[0]).map(h => h.replace(/^["'\uFEFF]+|["']+$/g, '').trim().toLowerCase());
    const idxPlaceId = header.indexOf('place_id');
    const idxNome = header.indexOf('nome');
    const idxEndereco = header.indexOf('endereco');
    const idxTelefone = header.indexOf('telefone');
    const idxTelInt = header.indexOf('telefone_internacional');
    const idxWebsite = header.indexOf('website');
    const idxRating = header.indexOf('rating');
    const idxAvaliacoes = header.indexOf('total_avaliacoes');
    const idxStatusNegocio = header.indexOf('status_negocio');
    const idxTipo = header.indexOf('tipo_principal');
    const idxTipoDesc = header.indexOf('tipo_principal_descricao');
    const idxTipos = header.indexOf('tipos');
    const idxMaps = header.indexOf('google_maps_url');
    const idxLat = header.indexOf('latitude');
    const idxLng = header.indexOf('longitude');

    let inserted = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO radar_b2b_prospects (
        place_id, name, phone, international_phone, website,
        address, neighborhood, city, state, rating, user_ratings_total,
        business_status, primary_type, primary_type_display, types,
        google_maps_url, latitude, longitude, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 'Juiz de Fora', 'MG', ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, 'novo', ?, ?
      )
    `);

    // Inserção em transação para alta performance (milhares de linhas em fração de segundo)
    db.exec('BEGIN TRANSACTION;');
    try {
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]).map(c => c.replace(/^["']+|["']+$/g, '').trim());
        const placeId = idxPlaceId >= 0 ? cols[idxPlaceId] : null;
        const name = idxNome >= 0 ? cols[idxNome] : null;

        if (!name) {
          skipped++;
          continue;
        }

        const address = idxEndereco >= 0 ? cols[idxEndereco] : '';
        const neighborhood = extractNeighborhood(address);
        const phone = idxTelefone >= 0 ? formatPhoneBR(cols[idxTelefone]) : '';
        const intPhone = idxTelInt >= 0 ? cols[idxTelInt] : '';
        const website = idxWebsite >= 0 ? cols[idxWebsite] : '';
        const ratingRaw = idxRating >= 0 ? parseFloat(cols[idxRating].replace(',', '.')) : null;
        const rating = !isNaN(ratingRaw) ? ratingRaw : null;
        const reviewsRaw = idxAvaliacoes >= 0 ? parseInt(cols[idxAvaliacoes], 10) : 0;
        const reviews = !isNaN(reviewsRaw) ? reviewsRaw : 0;
        const bStatus = idxStatusNegocio >= 0 ? cols[idxStatusNegocio] : 'OPERATIONAL';
        const pType = idxTipo >= 0 ? cols[idxTipo] : '';
        const pTypeDesc = idxTipoDesc >= 0 ? cols[idxTipoDesc] : '';
        const types = idxTipos >= 0 ? cols[idxTipos] : '';
        const mapsUrl = idxMaps >= 0 ? cols[idxMaps] : '';
        const latRaw = idxLat >= 0 ? parseFloat(cols[idxLat].replace(',', '.')) : null;
        const lngRaw = idxLng >= 0 ? parseFloat(cols[idxLng].replace(',', '.')) : null;

        const resRun = insertStmt.run(
          placeId || `loc_${Date.now()}_${i}`,
          name,
          phone,
          intPhone,
          website,
          address,
          neighborhood,
          rating,
          reviews,
          bStatus,
          pType,
          pTypeDesc || pType,
          types,
          mapsUrl,
          !isNaN(latRaw) ? latRaw : null,
          !isNaN(lngRaw) ? lngRaw : null,
          now,
          now
        );

        if (resRun.changes > 0) inserted++;
        else skipped++;
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    const totalNow = db.prepare(`SELECT count(*) as c FROM radar_b2b_prospects`).get().c;
    logAudit(req, {
      event_type: 'IMPORTACAO',
      event_name: 'B2B_IMPORT_CSV',
      module: 'radar-b2b',
      description: `Importou ${inserted} empresas locais da base ${path.basename(targetPath)}`
    });

    return res.json({
      success: true,
      file: path.basename(targetPath),
      inserted,
      skipped,
      totalNow
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b importar local:', error);
    return res.status(500).json({ error: 'Erro ao importar empresas do arquivo local.' });
  }
});

/**
 * POST /api/radar-b2b/buscar-google
 * Busca ao vivo no Google Places API (New v1) e insere empresas mapeadas
 */
radarB2bRouter.post('/api/radar-b2b/buscar-google', requireAuth, async (req, res) => {
  try {
    const { query, neighborhood, includedType, apiKey: userKey } = req.body;

    const apiKey = userKey || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Chave de API do Google não configurada. Informe a chave ou defina GOOGLE_MAPS_API_KEY no servidor.'
      });
    }

    const searchTerm = query || 'empresa';
    const placeContext = neighborhood ? `${searchTerm} em ${neighborhood}, Juiz de Fora MG` : `${searchTerm} em Juiz de Fora MG`;

    const jfBounds = {
      low: { latitude: -21.96, longitude: -43.65 },
      high: { latitude: -21.48, longitude: -43.03 }
    };

    const bodyPayload = {
      textQuery: placeContext,
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize: 20,
      locationRestriction: {
        rectangle: jfBounds
      }
    };
    if (includedType) {
      bodyPayload.includedType = includedType;
    }

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.types,places.primaryType,places.primaryTypeDisplayName,places.googleMapsUri,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Google Places API retornou erro: ${errText}` });
    }

    const data = await response.json();
    const places = data.places || [];

    let inserted = 0;
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO radar_b2b_prospects (
        place_id, name, phone, website, address, neighborhood,
        city, state, rating, user_ratings_total, business_status,
        primary_type, primary_type_display, types, google_maps_url,
        latitude, longitude, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'Juiz de Fora', 'MG', ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, 'novo', ?, ?
      )
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const p of places) {
        const name = p.displayName?.text || 'Sem nome';
        const address = p.formattedAddress || '';
        const nb = extractNeighborhood(address);
        const phone = formatPhoneBR(p.nationalPhoneNumber || '');
        const website = p.websiteUri || '';
        const rating = p.rating || null;
        const reviews = p.userRatingCount || 0;
        const pType = p.primaryType || '';
        const pTypeDesc = p.primaryTypeDisplayName?.text || pType;
        const types = (p.types || []).join(', ');
        const mapsUrl = p.googleMapsUri || '';
        const lat = p.location?.latitude || null;
        const lng = p.location?.longitude || null;

        const resRun = insertStmt.run(
          p.id,
          name,
          phone,
          website,
          address,
          nb,
          rating,
          reviews,
          p.businessStatus || 'OPERATIONAL',
          pType,
          pTypeDesc,
          types,
          mapsUrl,
          lat,
          lng,
          now,
          now
        );
        if (resRun.changes > 0) inserted++;
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    logAudit(req, {
      event_type: 'CONSULTA',
      event_name: 'B2B_GOOGLE_SEARCH',
      module: 'radar-b2b',
      description: `Varredura ao vivo Google Places para "${placeContext}": ${inserted} novos inseridos`
    });

    return res.json({
      success: true,
      found: places.length,
      inserted
    });
  } catch (error) {
    console.error('[ERRO] radar-b2b buscar-google:', error);
    return res.status(500).json({ error: 'Erro ao executar busca no Google Places.' });
  }
});

/**
 * GET /api/radar-b2b/export/meta-ads
 * Gera CSV formatado para Público Personalizado no Meta Ads (Facebook/Instagram)
 * Formato padrão aceito pela Meta: phone,fn,ct,st,country
 */
radarB2bRouter.get('/api/radar-b2b/export/meta-ads', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM radar_b2b_prospects WHERE phone IS NOT NULL AND phone != ''`;
    const params = [];
    if (status && status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY id ASC`;

    const prospects = db.prepare(sql).all(...params);

    const headers = ['phone', 'fn', 'ct', 'st', 'country'];
    const rows = [headers.join(',')];

    for (const p of prospects) {
      let digits = cleanDigits(p.phone);
      if (!digits) continue;
      // Garante DDI 55
      if (!digits.startsWith('55')) {
        digits = '55' + digits;
      }
      const safeName = (p.name || '').replace(/[",\n\r]/g, ' ').trim();
      const city = 'juiz de fora';
      const state = 'mg';
      const country = 'br';

      rows.push(`${digits},"${safeName}",${city},${state},${country}`);
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="meta_ads_publico_b2b_juiz_de_fora.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('[ERRO] radar-b2b export meta ads:', error);
    return res.status(500).json({ error: 'Erro ao gerar exportação para Meta Ads.' });
  }
});

/**
 * GET /api/radar-b2b/export/brevo
 * Gera CSV formatado para Brevo (Sendinblue)
 * Formato: COMPANY,FIRSTNAME,SMS,PHONE,CITY,WEBSITE,CATEGORY,STATUS
 */
radarB2bRouter.get('/api/radar-b2b/export/brevo', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM radar_b2b_prospects WHERE 1=1`;
    const params = [];
    if (status && status !== 'todos') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY id ASC`;

    const prospects = db.prepare(sql).all(...params);

    const headers = ['COMPANY', 'FIRSTNAME', 'SMS', 'PHONE', 'CITY', 'WEBSITE', 'CATEGORY', 'STATUS'];
    const rows = [headers.join(',')];

    for (const p of prospects) {
      let digits = cleanDigits(p.phone);
      let e164 = '';
      if (digits) {
        if (!digits.startsWith('55')) digits = '55' + digits;
        e164 = '+' + digits;
      }

      const safeCompany = (p.name || '').replace(/[",\n\r]/g, ' ').trim();
      const safeCity = (p.city || 'Juiz de Fora').replace(/[",\n\r]/g, ' ').trim();
      const safeWebsite = (p.website || '').replace(/[",\n\r]/g, ' ').trim();
      const safeCategory = (p.primary_type_display || p.primary_type || 'Comércio').replace(/[",\n\r]/g, ' ').trim();

      rows.push(`"${safeCompany}","${safeCompany}","${e164}","${e164}","${safeCity}","${safeWebsite}","${safeCategory}","${p.status}"`);
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="brevo_prospeccao_b2b_juiz_de_fora.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('[ERRO] radar-b2b export brevo:', error);
    return res.status(500).json({ error: 'Erro ao gerar exportação para Brevo.' });
  }
});

/**
 * GET /api/radar-b2b/export/csv
 * Exportação completa em CSV com todos os dados e notas
 */
radarB2bRouter.get('/api/radar-b2b/export/csv', requireAuth, (req, res) => {
  try {
    const prospects = db.prepare(`SELECT * FROM radar_b2b_prospects ORDER BY id ASC`).all();

    const headers = [
      'ID', 'Place_ID', 'Nome_Empresa', 'Telefone', 'Website',
      'Endereco', 'Bairro', 'Cidade', 'UF', 'Avaliacao_Google',
      'Total_Avaliacoes', 'Categoria', 'Status_Kanban', 'Anotacoes',
      'Cliente_ID_Convertido', 'Criado_Em'
    ];
    const rows = [headers.join(',')];

    for (const p of prospects) {
      rows.push([
        p.id,
        `"${(p.place_id || '').replace(/"/g, '""')}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.phone || '').replace(/"/g, '""')}"`,
        `"${(p.website || '').replace(/"/g, '""')}"`,
        `"${(p.address || '').replace(/"/g, '""')}"`,
        `"${(p.neighborhood || '').replace(/"/g, '""')}"`,
        `"${(p.city || 'Juiz de Fora').replace(/"/g, '""')}"`,
        `"${(p.state || 'MG').replace(/"/g, '""')}"`,
        p.rating || '',
        p.user_ratings_total || 0,
        `"${(p.primary_type_display || p.primary_type || '').replace(/"/g, '""')}"`,
        `"${p.status}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`,
        `"${p.converted_client_id || ''}"`,
        `"${p.created_at}"`
      ].join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="radar_b2b_empresas_completo.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('[ERRO] radar-b2b export full csv:', error);
    return res.status(500).json({ error: 'Erro ao gerar CSV completo.' });
  }
});
