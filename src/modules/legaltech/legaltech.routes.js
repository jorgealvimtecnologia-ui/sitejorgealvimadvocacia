/**
 * ==============================================================================
 * MÓDULO DE INOVAÇÕES TECNOLÓGICAS & LEGALTECH (FASE 4)
 * ==============================================================================
 * Inclui:
 * 1. Solicitações de Novos Campos ao Programador (evita schema drift desordenado)
 * 2. Detector Preventivo de Conflito de Interesses (Código de Ética OAB)
 * 3. Consulta Inteligente de CEP (ViaCEP) e CNPJ
 * 4. Validador de Dias Úteis Forenses (CPC art. 216 / 219)
 * ==============================================================================
 */

import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth, requireMaster } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const legaltechRouter = express.Router();

// ------------------------------------------------------------------------------
// Inicialização da Tabela de Pedidos de Campos ao Programador
// ------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS programmer_field_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    target_module TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'TEXTO',
    is_required INTEGER NOT NULL DEFAULT 0,
    suggested_options TEXT,
    business_justification TEXT,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    admin_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pfr_status ON programmer_field_requests(status);
  CREATE INDEX IF NOT EXISTS idx_pfr_module ON programmer_field_requests(target_module);
`);

// ------------------------------------------------------------------------------
// 1. SOLICITAÇÃO DE NOVO CAMPO AO PROGRAMADOR
// ------------------------------------------------------------------------------

// Criar nova solicitação
legaltechRouter.post('/api/legaltech/field-requests', requireAuth, (req, res) => {
  try {
    const {
      target_module,
      field_label,
      field_type = 'TEXTO',
      is_required = 0,
      suggested_options = '',
      business_justification = ''
    } = req.body;

    if (!target_module || !field_label || !field_label.trim()) {
      return res.status(400).json({ error: 'Módulo e Nome do Campo são obrigatórios.' });
    }

    const id = `REQ-FLD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();
    const userId = req.user.userId || req.user.id || 'ANON';
    const userName = req.user.name || req.user.username || 'Usuário';

    db.prepare(`
      INSERT INTO programmer_field_requests (
        id, user_id, user_name, target_module, field_label, field_type,
        is_required, suggested_options, business_justification, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)
    `).run(
      id,
      userId,
      userName,
      target_module.trim(),
      field_label.trim(),
      field_type,
      is_required ? 1 : 0,
      suggested_options ? suggested_options.trim() : null,
      business_justification ? business_justification.trim() : null,
      now,
      now
    );

    logAudit(req, {
      event_type: 'SOLICITACAO',
      event_name: 'CAMPO_PROGRAMADOR_CRIADO',
      module: 'LEGALTECH',
      description: `Pedido de novo campo "${field_label.trim()}" solicitado para o módulo ${target_module.trim()} por ${userName}.`,
      details: JSON.stringify({ id, target_module, field_label, field_type })
    });

    res.status(201).json({
      success: true,
      message: 'Solicitação de novo campo enviada com sucesso para a equipe técnica!',
      request: {
        id,
        target_module,
        field_label,
        field_type,
        status: 'PENDENTE',
        created_at: now
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar pedido de campo: ' + err.message });
  }
});

// Listar todas as solicitações
legaltechRouter.get('/api/legaltech/field-requests', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM programmer_field_requests
      ORDER BY created_at DESC
    `).all();

    res.json({
      success: true,
      requests: rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar pedidos: ' + err.message });
  }
});

// Atualizar status da solicitação (Exclusivo Master)
legaltechRouter.patch('/api/legaltech/field-requests/:id/status', requireMaster, (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const validStatuses = ['PENDENTE', 'EM_ANALISE', 'IMPLEMENTADO', 'REJEITADO'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Escolha: ' + validStatuses.join(', ') });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE programmer_field_requests
      SET status = ?, admin_notes = coalesce(?, admin_notes), updated_at = ?
      WHERE id = ?
    `).run(status, admin_notes || null, now, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'CAMPO_PROGRAMADOR_STATUS',
      module: 'LEGALTECH',
      description: `Status da solicitação de campo ${id} alterado para ${status}.`,
      details: JSON.stringify({ id, status, admin_notes })
    });

    res.json({
      success: true,
      message: `Solicitação atualizada para ${status}.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. DETECTOR PREVENTIVO DE CONFLITO DE INTERESSES (OAB)
// ------------------------------------------------------------------------------
legaltechRouter.get('/api/legaltech/check-conflict', requireAuth, (req, res) => {
  try {
    const query = (req.query.name || '').trim();
    if (!query || query.length < 3) {
      return res.json({ success: true, hasConflict: false, matches: [] });
    }

    const searchPattern = `%${query}%`;
    const clientMatches = db.prepare(`
      SELECT id, full_name, cpf, 'CLIENTE_EXISTENTE' as conflict_type
      FROM clients
      WHERE full_name LIKE ?
      LIMIT 5
    `).all(searchPattern);

    const leadMatches = db.prepare(`
      SELECT id, name, phone, 'ATENDIMENTO_LEAD' as conflict_type
      FROM leads
      WHERE name LIKE ?
      LIMIT 5
    `).all(searchPattern);

    const matches = [
      ...clientMatches.map(c => ({
        id: c.id,
        name: c.full_name,
        details: `CPF: ${c.cpf || 'Não informado'} (Cadastrado como Cliente)`,
        type: c.conflict_type
      })),
      ...leadMatches.map(l => ({
        id: l.id,
        name: l.name,
        details: `Telefone: ${l.phone || 'N/D'} (Contato em Atendimento/Lead)`,
        type: l.conflict_type
      }))
    ];

    res.json({
      success: true,
      hasConflict: matches.length > 0,
      matches
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar conflito de interesses: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. CONSULTA INTELIGENTE DE CEP (ViaCEP com Fallback)
// ------------------------------------------------------------------------------
legaltechRouter.get('/api/legaltech/cep/:cep', requireAuth, async (req, res) => {
  try {
    const rawCep = (req.params.cep || '').replace(/\D/g, '');
    if (rawCep.length !== 8) {
      return res.status(400).json({ error: 'CEP deve conter exatamente 8 dígitos numéricos.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      const data = await response.json();
      if (data.erro) {
        return res.status(404).json({ error: 'CEP não localizado na base dos Correios.' });
      }

      res.json({
        success: true,
        data: {
          cep: data.cep,
          logradouro: data.logradouro,
          complemento: data.complemento,
          bairro: data.bairro,
          cidade: data.localidade,
          uf: data.uf,
          ibge: data.ibge
        }
      });
    } catch (_fetchErr) {
      clearTimeout(timeout);
      res.status(502).json({ error: 'Serviço de consulta de CEP temporariamente indisponível.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro na busca de CEP: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. CONSULTA DE CNPJ PÚBLICO
// ------------------------------------------------------------------------------
legaltechRouter.get('/api/legaltech/cnpj/:cnpj', requireAuth, async (req, res) => {
  try {
    const rawCnpj = (req.params.cnpj || '').replace(/\D/g, '');
    if (rawCnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ deve conter exatamente 14 dígitos numéricos.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(404).json({ error: 'CNPJ não localizado na base pública da Receita Federal.' });
      }

      const data = await response.json();
      res.json({
        success: true,
        data: {
          cnpj: data.cnpj,
          razaoSocial: data.razao_social,
          nomeFantasia: data.nome_fantasia || data.razao_social,
          situacaoCadastral: data.descricao_situacao_cadastral,
          cnae: data.cnae_fiscal_descricao,
          cep: data.cep,
          logradouro: `${data.descricao_tipo_de_logradouro || ''} ${data.logradouro || ''}`.trim(),
          numero: data.numero,
          bairro: data.bairro,
          municipio: data.municipio,
          uf: data.uf,
          telefone: data.ddd_telefone_1
        }
      });
    } catch (_fetchErr) {
      clearTimeout(timeout);
      res.status(502).json({ error: 'Serviço de consulta de CNPJ temporariamente indisponível.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro na busca de CNPJ: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. VALIDADOR DE DIAS ÚTEIS (CPC art. 216 / 219)
// ------------------------------------------------------------------------------
legaltechRouter.get('/api/legaltech/check-workday', requireAuth, (req, res) => {
  try {
    const dateStr = req.query.date; // YYYY-MM-DD
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'Data no formato YYYY-MM-DD é obrigatória.' });
    }

    const parts = dateStr.split('-').map(Number);
    const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);

    const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;

    // Checa feriados cadastrados
    let isHoliday = false;
    let holidayName = '';
    try {
      const row = db.prepare(`SELECT holiday_name FROM court_holidays WHERE holiday_date = ? LIMIT 1`).get(dateStr);
      if (row) {
        isHoliday = true;
        holidayName = row.holiday_name;
      }
    } catch (_e) {}

    const isWorkday = !isWeekend && !isHoliday;

    // Calcula próximo dia útil se não for dia útil
    let nextWorkday = new Date(targetDate);
    if (!isWorkday) {
      while (true) {
        nextWorkday.setDate(nextWorkday.getDate() + 1);
        const dayOfWeek = nextWorkday.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        const yyyy = nextWorkday.getFullYear();
        const mm = String(nextWorkday.getMonth() + 1).padStart(2, '0');
        const dd = String(nextWorkday.getDate()).padStart(2, '0');
        const nextDateStr = `${yyyy}-${mm}-${dd}`;
        
        let holidayRow = null;
        try {
          holidayRow = db.prepare(`SELECT holiday_name FROM court_holidays WHERE holiday_date = ? LIMIT 1`).get(nextDateStr);
        } catch (_e) {}

        if (!holidayRow) break;
      }
    }

    const nextYyyy = nextWorkday.getFullYear();
    const nextMm = String(nextWorkday.getMonth() + 1).padStart(2, '0');
    const nextDd = String(nextWorkday.getDate()).padStart(2, '0');
    const nextWorkdayStr = `${nextYyyy}-${nextMm}-${nextDd}`;

    res.json({
      success: true,
      originalDate: dateStr,
      isWorkday,
      reason: isWeekend ? (targetDate.getDay() === 0 ? 'Domingo' : 'Sábado') : (isHoliday ? `Feriado: ${holidayName}` : 'Dia Útil'),
      nextWorkdayDate: isWorkday ? dateStr : nextWorkdayStr
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao validar dia útil: ' + err.message });
  }
});
