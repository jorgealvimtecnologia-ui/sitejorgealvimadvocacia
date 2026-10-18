/**
 * Módulo de Integração e Importação de Contatos (Google Contacts / Gmail, Celular, CSV e Excel)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { generateNextClientFullId, generateNextClientId } from '../../shared/ids.js';

export const contactsRouter = express.Router();

const DEFAULT_GOOGLE_CLIENT_ID = '285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com';

/**
 * Normaliza número de telefone para dígitos limpos
 */
function cleanDigits(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Formata telefone brasileiro para exibição amigável
 */
function formatPhoneBR(raw) {
  const digits = cleanDigits(raw);
  if (!digits) return raw || '';
  // Celular com DDD (11 dígitos, ex: 32 99999-9999)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  // Telefone fixo com DDD (10 dígitos, ex: 32 3215-4943)
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // DDI + Brasil (13 ou 12 dígitos, ex: 5532999999999)
  if (digits.startsWith('55') && (digits.length === 13 || digits.length === 12)) {
    const sem55 = digits.slice(2);
    return formatPhoneBR(sem55);
  }
  return raw.trim();
}

const PJ_PATTERNS = [
  /\b(ltda|eireli|s[\.\/\s]?a|me|epp|s\/s)\b/i,
  /\b(auto\s*pe[cç]as?|posto|supermercado|farm[aá]cia|drogaria|oficina|restaurante|pizzaria|padaria|hotel|pousada|lanchonete|buffet)\b/i,
  /\b(cl[ií]nica|hospital|laborat[oó]rio|advocacia|advogados|contabilidade|assessoria|consultoria|est[uú]dio|pet\s*shop|veterin[aá]ria)\b/i,
  /\b(distribuidora|com[eé]rcio|ind[uú]stria|servi[cç]os|transportes|log[ií]stica|engenharia|construtora|incorporadora|imobili[aá]ria|corretora)\b/i,
  /\b([oó]tica|gr[aá]fica|papelaria|vidra[cç]aria|marmoraria|serralheria|metal[uú]rgica|madeireira|m[oó]veis|ve[ií]culos|concession[aá]ria|lava\s*(jato|r[aá]pido))\b/i,
  /\b(associa[cç][aã]o|instituto|funda[cç][aã]o|cooperativa|coop|sindicato|igreja|prefeitura|c[aâ]mara|secretaria|tribunal|cart[oó]rio|banco|seguros)\b/i,
  /\b(academia|escola|col[eé]gio|faculdade|universidade|tecnologia|sistemas|inform[aá]tica)\b/i
];

function detectClientType(c) {
  if (c.client_type === 'PJ' || c.client_type === 'PF') return c.client_type;
  if (c.cnpj && String(c.cnpj).trim()) return 'PJ';
  const target = `${c.name || c.full_name || ''} ${c.organization || ''} ${c.profession || ''} ${c.notes || ''}`.toLowerCase();
  for (const pat of PJ_PATTERNS) {
    if (pat.test(target)) return 'PJ';
  }
  return 'PF';
}

/**
 * 1. GET /api/contacts/google-config
 * Retorna credenciais e escopos para Google People API / GIS
 */
contactsRouter.get('/api/contacts/google-config', requireAuth, (req, res) => {
  try {
    const clientId = (process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
    return res.json({
      success: true,
      clientId,
      scope: 'https://www.googleapis.com/auth/contacts.readonly'
    });
  } catch (err) {
    console.error('[CONTATOS] Erro ao obter config Google:', err);
    return res.status(500).json({ error: 'Erro ao obter configurações do Google.' });
  }
});

/**
 * 2. POST /api/contacts/check-duplicates
 * Verifica se telefones ou e-mails já estão cadastrados em clients ou leads
 */
contactsRouter.post('/api/contacts/check-duplicates', requireAuth, (req, res) => {
  try {
    const { phones = [], emails = [] } = req.body || {};

    const existingPhones = new Set();
    const existingEmails = new Set();

    // Buscar todos os telefones e emails cadastrados em clients e leads
    const clientRows = db.prepare(`SELECT phone, email FROM clients WHERE deleted_at IS NULL`).all();
    const leadRows = db.prepare(`SELECT phone, email FROM leads`).all();

    const allDbPhones = new Set();
    const allDbEmails = new Set();

    [...clientRows, ...leadRows].forEach(r => {
      if (r.phone) {
        const d = cleanDigits(r.phone);
        if (d) allDbPhones.add(d);
        // Também armazena os últimos 8 e 9 dígitos para comparação robusta
        if (d.length >= 8) allDbPhones.add(d.slice(-8));
        if (d.length >= 9) allDbPhones.add(d.slice(-9));
      }
      if (r.email) {
        allDbEmails.add(r.email.trim().toLowerCase());
      }
    });

    // Comparar telefones fornecidos
    phones.forEach(p => {
      const d = cleanDigits(p);
      if (!d) return;
      if (allDbPhones.has(d) || (d.length >= 8 && allDbPhones.has(d.slice(-8))) || (d.length >= 9 && allDbPhones.has(d.slice(-9)))) {
        existingPhones.add(p);
      }
    });

    // Comparar emails fornecidos
    emails.forEach(e => {
      if (!e) return;
      const cleanE = String(e).trim().toLowerCase();
      if (cleanE && allDbEmails.has(cleanE)) {
        existingEmails.add(e);
      }
    });

    return res.json({
      success: true,
      existingPhones: Array.from(existingPhones),
      existingEmails: Array.from(existingEmails)
    });
  } catch (err) {
    console.error('[CONTATOS] Erro ao verificar duplicatas:', err);
    return res.status(500).json({ error: 'Erro ao verificar duplicatas: ' + err.message });
  }
});

/**
 * 3. POST /api/contacts/import-batch
 * Importa contatos selecionados para a tabela escolhida (clients ou leads)
 */
contactsRouter.post('/api/contacts/import-batch', requireAuth, (req, res) => {
  try {
    const {
      target = 'clients',
      contacts = [],
      skipDuplicates = true,
      sourceTag = 'Importação de Contatos'
    } = req.body || {};

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Nenhum contato selecionado para importação.' });
    }

    if (contacts.length > 5000) {
      return res.status(400).json({ error: 'Limite máximo de 5.000 contatos por lote.' });
    }

    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;
    const errors = [];

    // Prepara Statements para verificação e inserção
    const checkClientPhone = db.prepare(`SELECT id, full_name FROM clients WHERE deleted_at IS NULL AND phone = ? LIMIT 1`);
    const checkLeadPhone = db.prepare(`SELECT id, name FROM leads WHERE phone = ? LIMIT 1`);

    const insertClientStmt = db.prepare(`
      INSERT INTO clients (
        id, client_type, full_name, cpf, rg, cnpj, street, number, neighborhood, city, state, cep, complement,
        email, phone, social_media, nationality, marital_status, profession,
        contract_value, installments_count, installment_value, amount_paid, balance_due, contract_status,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?)
    `);

    const insertLeadStmt = db.prepare(`
      INSERT INTO leads (
        id, created_at, name, phone, area, message, files, status,
        email, city, origin, origin_detail, stage
      ) VALUES (?, ?, ?, ?, ?, ?, '[]', 'Novo', ?, ?, ?, ?, 'recebido')
    `);

    db.exec('BEGIN');
    try {
      contacts.forEach((c, idx) => {
        const name = (c.name || c.full_name || '').toString().trim();
        const rawPhone = (c.phone || c.cellphone || '').toString().trim();
        const formattedPhone = formatPhoneBR(rawPhone);
        const email = (c.email || '').toString().trim().toLowerCase();

        if (!name && !formattedPhone) {
          skipped++;
          errors.push({ linha: idx + 1, motivo: 'Nome ou telefone ausente.' });
          return;
        }

        const effectiveName = name || `Contato ${formattedPhone}`;

        // Verificação de duplicidade se skipDuplicates estiver ativo
        if (skipDuplicates) {
          if (formattedPhone) {
            const existsCli = checkClientPhone.get(formattedPhone);
            const existsLead = checkLeadPhone.get(formattedPhone);
            if (existsCli || existsLead) {
              skipped++;
              return;
            }
          }
          if (email && email.includes('@')) {
            const existsEmail = db.prepare(`SELECT id FROM clients WHERE deleted_at IS NULL AND LOWER(TRIM(email)) = ? LIMIT 1`).get(email);
            if (existsEmail) {
              skipped++;
              return;
            }
          }
        }

        // Se o contato possui e-mail e não possui telefone, tenta enriquecer com segurança cliente existente de nome idêntico e único
        if (target === 'clients' && email && email.includes('@') && (!formattedPhone || formattedPhone === 'Sem Telefone') && name && name.length >= 4) {
          const matchingByName = db.prepare(`
            SELECT id, full_name, email FROM clients 
            WHERE deleted_at IS NULL AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
          `).all(name);
          if (matchingByName.length === 1 && (!matchingByName[0].email || matchingByName[0].email.trim() === '')) {
            db.prepare(`UPDATE clients SET email = ?, updated_at = ? WHERE id = ?`).run(email, now, matchingByName[0].id);
            imported++;
            return;
          }
        }

        if (target === 'leads') {
          const leadId = generateNextClientId();
          const noteText = [
            c.notes ? `Obs: ${c.notes}` : '',
            c.organization ? `Empresa: ${c.organization}` : '',
            sourceTag ? `Origem: ${sourceTag}` : ''
          ].filter(Boolean).join(' | ');

          insertLeadStmt.run(
            leadId,
            now,
            effectiveName,
            formattedPhone || '',
            c.area || 'Geral / Contato Importado',
            noteText || `Contato importado via ${sourceTag}`,
            email || null,
            c.city || null,
            'Importação Contatos',
            sourceTag
          );
          imported++;
        } else {
          // Destino: Clientes
          const clientId = generateNextClientFullId();
          const clientType = detectClientType(c);
          const noteInfo = [
            c.notes ? c.notes : '',
            sourceTag ? `Fonte: ${sourceTag}` : ''
          ].filter(Boolean).join(' | ');

          insertClientStmt.run(
            clientId,
            clientType,
            effectiveName,
            (c.cpf || '').toString().trim(),
            (c.rg || '').toString().trim(),
            (c.cnpj || '').toString().trim(),
            (c.street || '').toString().trim(),
            (c.number || '').toString().trim(),
            (c.neighborhood || '').toString().trim(),
            (c.city || '').toString().trim(),
            (c.state || 'MG').toString().trim(),
            (c.cep || '').toString().trim(),
            noteInfo || null,
            email || '',
            formattedPhone || '',
            sourceTag || '',
            'brasileiro(a)',
            'solteiro(a)',
            (c.profession || c.organization || '').toString().trim(),
            0, 1, 0, 0, 0, 'Ativo',
            now, now
          );
          imported++;
        }
      });

      db.exec('COMMIT');
    } catch (insertErr) {
      db.exec('ROLLBACK');
      throw insertErr;
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'IMPORTAR_CONTATOS_LOTE',
      module: 'CONTATOS',
      description: `Importação de contatos para ${target === 'leads' ? 'Leads' : 'Clientes'}: ${imported} importados, ${skipped} ignorados/duplicados. Fonte: ${sourceTag}.`
    });

    return res.json({
      success: true,
      target,
      imported,
      skipped,
      errorsCount: errors.length
    });
  } catch (error) {
    console.error('[CONTATOS] Erro no lote de importação:', error);
    return res.status(500).json({ error: 'Erro ao processar importação: ' + error.message });
  }
});
