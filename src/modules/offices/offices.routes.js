/**
 * Módulo ESCRITÓRIOS & EQUIPE (offices) — extraído do server.js.
 * Inclui os geradores de ID de escritório e de integrante (usados só aqui).
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const officesRouter = express.Router();

// Gerador de ID para Escritórios PJ: JA-ESC-2026-0001
function generateNextOfficeId() {
  const currentYear = new Date().getFullYear();
  const prefix = `JA-ESC-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM offices`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM offices WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Integrantes do Escritório: MEM-2026-0001
function generateNextOfficeMemberId() {
  const currentYear = new Date().getFullYear();
  const prefix = `MEM-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM office_members`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach(r => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  
  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM office_members WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// ================= ROTAS DE DADOS DO ESCRITÓRIO & EQUIPE =================

// 1. GET /api/offices - Listar escritórios cadastrados (com integrantes)
officesRouter.get('/api/offices', requireAuth, (req, res) => {
  try {
    const { search } = req.query;
    let query = `SELECT * FROM offices WHERE 1=1`;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (id LIKE ? OR corporate_name LIKE ? OR trade_name LIKE ? OR cnpj LIKE ? OR city LIKE ?)`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY created_at DESC`;
    const offices = db.prepare(query).all(...params);

    const getMembersStmt = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`);
    for (const off of offices) {
      off.members = getMembersStmt.all(off.id);
    }

    return res.json({ success: true, offices });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao listar escritórios:', error);
    return res.status(500).json({ error: 'Erro ao buscar escritórios.' });
  }
});

// 2. GET /api/offices/search-doc - Localizar por CNPJ ou CPF (local + consulta externa BrasilAPI)
officesRouter.get('/api/offices/search-doc', requireAuth, async (req, res) => {
  try {
    const docParam = (req.query.doc || '').trim();
    const cleanDoc = docParam.replace(/\D/g, '');

    if (!cleanDoc) {
      return res.status(400).json({ error: 'Informe um número de CNPJ ou CPF válido.' });
    }

    // Busca local em offices por CNPJ
    const officeByCnpj = db.prepare(`SELECT * FROM offices WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?`).get(cleanDoc);
    if (officeByCnpj) {
      officeByCnpj.members = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`).all(officeByCnpj.id);
      return res.json({ success: true, matchType: 'office_cnpj', office: officeByCnpj });
    }

    // Busca local em office_members por CPF
    const memberByCpf = db.prepare(`SELECT * FROM office_members WHERE REPLACE(REPLACE(cpf, '.', ''), '-', '') = ?`).get(cleanDoc);
    if (memberByCpf) {
      const parentOffice = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(memberByCpf.office_id);
      if (parentOffice) {
        parentOffice.members = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`).all(parentOffice.id);
        return res.json({ success: true, matchType: 'member_cpf', member: memberByCpf, office: parentOffice });
      }
    }

    // Se tiver 14 dígitos (CNPJ), faz busca na Receita Federal via BrasilAPI
    if (cleanDoc.length === 14) {
      try {
        const fetchRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanDoc}`);
        if (fetchRes.ok) {
          const apiData = await fetchRes.json();
          return res.json({
            success: true,
            matchType: 'external_cnpj',
            cnpjData: {
              cnpj: apiData.cnpj ? apiData.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cleanDoc,
              corporate_name: apiData.razao_social || '',
              trade_name: apiData.nome_fantasia || apiData.razao_social || '',
              street: apiData.logradouro || '',
              number: apiData.numero || '',
              complement: apiData.complemento || '',
              neighborhood: apiData.bairro || '',
              city: apiData.municipio || '',
              state: apiData.uf || 'MG',
              cep: apiData.cep ? String(apiData.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : '',
              email: apiData.email || '',
              phone: apiData.ddd_telefone_1 ? `(${apiData.ddd_telefone_1.slice(0, 2)}) ${apiData.ddd_telefone_1.slice(2)}` : ''
            }
          });
        }
      } catch (extErr) {
        console.warn('Erro ao consultar BrasilAPI CNPJ:', extErr);
      }
    }

    return res.status(404).json({ error: 'Nenhum escritório ou integrante localizado para este CNPJ/CPF.' });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro na busca por CNPJ/CPF:', error);
    return res.status(500).json({ error: 'Erro ao buscar CNPJ/CPF.' });
  }
});

// 3. GET /api/offices/:id - Buscar escritório individual por ID
officesRouter.get('/api/offices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const office = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(id);
    if (!office) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    office.members = db.prepare(`SELECT * FROM office_members WHERE office_id = ? ORDER BY role_type ASC, name ASC`).all(id);
    return res.json({ success: true, office });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao buscar escritório:', error);
    return res.status(500).json({ error: 'Erro ao buscar escritório.' });
  }
});

// 4. POST /api/offices - Cadastrar novo escritório (PJ) + integrantes (PF)
officesRouter.post('/api/offices', requireAuth, (req, res) => {
  try {
    const {
      corporate_name,
      trade_name,
      cnpj,
      oab_society,
      oab_uf,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      email,
      phone,
      whatsapp,
      website,
      pix_key,
      bank_info,
      notes,
      members
    } = req.body;

    if (!corporate_name || !corporate_name.trim()) {
      return res.status(400).json({ error: 'A Razão Social / Nome do Escritório é obrigatório.' });
    }

    const id = generateNextOfficeId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO offices (
        id, corporate_name, trade_name, cnpj, oab_society, oab_uf,
        street, number, neighborhood, city, state, cep, complement,
        email, phone, whatsapp, website, pix_key, bank_info, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      corporate_name.trim(),
      trade_name ? trade_name.trim() : '',
      cnpj ? cnpj.trim() : '',
      oab_society ? oab_society.trim() : '',
      oab_uf ? oab_uf.trim() : 'MG',
      street ? street.trim() : '',
      number ? number.trim() : '',
      neighborhood ? neighborhood.trim() : '',
      city ? city.trim() : '',
      state ? state.trim() : 'MG',
      cep ? cep.trim() : '',
      complement ? complement.trim() : '',
      email ? email.trim().toLowerCase() : '',
      phone ? phone.trim() : '',
      whatsapp ? whatsapp.trim() : '',
      website ? website.trim() : '',
      pix_key ? pix_key.trim() : '',
      bank_info ? bank_info.trim() : '',
      notes ? notes.trim() : '',
      now,
      now
    );

    if (Array.isArray(members) && members.length > 0) {
      const insertMemStmt = db.prepare(`
        INSERT INTO office_members (
          id, office_id, role_type, name, cpf, rg, oab_number, oab_uf,
          email, phone, position_title, admission_date,
          street, number, complement, neighborhood, city, state, cep,
          status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of members) {
        if (!m.name || !m.name.trim()) continue;
        const memId = generateNextOfficeMemberId();
        insertMemStmt.run(
          memId,
          id,
          m.role_type || 'Advogado Associado',
          m.name.trim(),
          m.cpf ? m.cpf.trim() : '',
          m.rg ? m.rg.trim() : '',
          m.oab_number ? m.oab_number.trim() : '',
          m.oab_uf ? m.oab_uf.trim() : 'MG',
          m.email ? m.email.trim().toLowerCase() : '',
          m.phone ? m.phone.trim() : '',
          m.position_title ? m.position_title.trim() : '',
          m.admission_date || '',
          m.street ? m.street.trim() : '',
          m.number ? m.number.trim() : '',
          m.complement ? m.complement.trim() : '',
          m.neighborhood ? m.neighborhood.trim() : '',
          m.city ? m.city.trim() : '',
          m.state ? m.state.trim() : 'MG',
          m.cep ? m.cep.trim() : '',
          m.status || 'Ativo',
          m.notes ? m.notes.trim() : '',
          now,
          now
        );
      }
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_ESCRITORIO',
      module: 'SISTEMA',
      resource_id: id,
      description: `Cadastro do escritório PJ: ${corporate_name.trim()} (#${id}).`
    });

    return res.status(201).json({ success: true, message: 'Escritório cadastrado com sucesso!', id });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao cadastrar escritório:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar escritório: ' + error.message });
  }
});

// 5. PUT /api/offices/:id - Atualizar escritório (PJ) e integrantes (PF)
officesRouter.put('/api/offices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const {
      corporate_name,
      trade_name,
      cnpj,
      oab_society,
      oab_uf,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      email,
      phone,
      whatsapp,
      website,
      pix_key,
      bank_info,
      notes,
      members
    } = req.body;

    const existing = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE offices SET
        corporate_name = ?,
        trade_name = ?,
        cnpj = ?,
        oab_society = ?,
        oab_uf = ?,
        street = ?,
        number = ?,
        neighborhood = ?,
        city = ?,
        state = ?,
        cep = ?,
        complement = ?,
        email = ?,
        phone = ?,
        whatsapp = ?,
        website = ?,
        pix_key = ?,
        bank_info = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      corporate_name !== undefined ? corporate_name.trim() : existing.corporate_name,
      trade_name !== undefined ? trade_name.trim() : existing.trade_name,
      cnpj !== undefined ? cnpj.trim() : existing.cnpj,
      oab_society !== undefined ? oab_society.trim() : existing.oab_society,
      oab_uf !== undefined ? oab_uf.trim() : existing.oab_uf,
      street !== undefined ? street.trim() : existing.street,
      number !== undefined ? number.trim() : existing.number,
      neighborhood !== undefined ? neighborhood.trim() : existing.neighborhood,
      city !== undefined ? city.trim() : existing.city,
      state !== undefined ? state.trim() : existing.state,
      cep !== undefined ? cep.trim() : existing.cep,
      complement !== undefined ? complement.trim() : existing.complement,
      email !== undefined ? email.trim().toLowerCase() : existing.email,
      phone !== undefined ? phone.trim() : existing.phone,
      whatsapp !== undefined ? whatsapp.trim() : existing.whatsapp,
      website !== undefined ? website.trim() : existing.website,
      pix_key !== undefined ? pix_key.trim() : existing.pix_key,
      bank_info !== undefined ? bank_info.trim() : existing.bank_info,
      notes !== undefined ? notes.trim() : existing.notes,
      now,
      id
    );

    if (Array.isArray(members)) {
      db.prepare(`DELETE FROM office_members WHERE office_id = ?`).run(id);

      const insertMemStmt = db.prepare(`
        INSERT INTO office_members (
          id, office_id, role_type, name, cpf, rg, oab_number, oab_uf,
          email, phone, position_title, admission_date,
          street, number, complement, neighborhood, city, state, cep,
          status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of members) {
        if (!m.name || !m.name.trim()) continue;
        const memId = m.id || generateNextOfficeMemberId();
        insertMemStmt.run(
          memId,
          id,
          m.role_type || 'Advogado Associado',
          m.name.trim(),
          m.cpf ? m.cpf.trim() : '',
          m.rg ? m.rg.trim() : '',
          m.oab_number ? m.oab_number.trim() : '',
          m.oab_uf ? m.oab_uf.trim() : 'MG',
          m.email ? m.email.trim().toLowerCase() : '',
          m.phone ? m.phone.trim() : '',
          m.position_title ? m.position_title.trim() : '',
          m.admission_date || '',
          m.street ? m.street.trim() : '',
          m.number ? m.number.trim() : '',
          m.complement ? m.complement.trim() : '',
          m.neighborhood ? m.neighborhood.trim() : '',
          m.city ? m.city.trim() : '',
          m.state ? m.state.trim() : 'MG',
          m.cep ? m.cep.trim() : '',
          m.status || 'Ativo',
          m.notes ? m.notes.trim() : '',
          now,
          now
        );
      }
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_ESCRITORIO',
      module: 'SISTEMA',
      resource_id: id,
      description: `Atualização do escritório PJ: ${corporate_name || existing.corporate_name} (#${id}).`
    });

    return res.json({ success: true, message: 'Dados do escritório e integrantes atualizados com sucesso!' });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao atualizar escritório:', error);
    return res.status(500).json({ error: 'Erro ao atualizar escritório.' });
  }
});

// 6. DELETE /api/offices/:id - Excluir escritório e seus integrantes
officesRouter.delete('/api/offices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM offices WHERE id = ?`).get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }

    db.prepare(`DELETE FROM office_members WHERE office_id = ?`).run(id);
    db.prepare(`DELETE FROM offices WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_ESCRITORIO',
      module: 'SISTEMA',
      resource_id: id,
      description: `Exclusão definitiva do escritório PJ #${id} (${existing.corporate_name}) e seus integrantes.`
    });

    return res.json({ success: true, message: 'Escritório e integrantes excluídos com sucesso!' });
  } catch (error) {
    console.error('[ESCRITORIOS] Erro ao excluir escritório:', error);
    return res.status(500).json({ error: 'Erro ao excluir escritório.' });
  }
});
