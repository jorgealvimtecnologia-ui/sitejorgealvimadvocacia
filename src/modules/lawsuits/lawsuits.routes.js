/**
 * Módulo PROCESSOS JUDICIAIS & ANDAMENTOS (CNJ) — extraído do server.js.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { generateNextLawsuitId } from '../../shared/ids.js';

export const lawsuitsRouter = express.Router();

// ================= ROTAS DE PROCESSOS JUDICIAIS & ANDAMENTOS (CNJ) =================

/**
 * 1. GET /api/lawsuits - Listar processos (opcionalmente filtrados por clientId) com andamentos
 */
lawsuitsRouter.get('/api/lawsuits', requireAuth, (req, res) => {
  try {
    const { clientId } = req.query;
    let lawsuits;

    if (clientId) {
      lawsuits = db.prepare(`
        SELECT l.*, c.full_name as client_name, c.phone as client_phone
        FROM lawsuits l
        JOIN clients c ON c.id = l.client_id
        WHERE l.client_id = ?
        ORDER BY l.created_at DESC
      `).all(clientId);
    } else {
      lawsuits = db.prepare(`
        SELECT l.*, c.full_name as client_name, c.phone as client_phone
        FROM lawsuits l
        JOIN clients c ON c.id = l.client_id
        ORDER BY l.updated_at DESC
      `).all();
    }

    const movementStmt = db.prepare(`
      SELECT * FROM lawsuit_movements
      WHERE lawsuit_id = ?
      ORDER BY movement_date DESC, id DESC
    `);

    const result = lawsuits.map(law => ({
      ...law,
      movements: movementStmt.all(law.id)
    }));

    return res.json({ success: true, lawsuits: result });
  } catch (error) {
    console.error('[ERRO] Falha ao listar processos judiciais:', error);
    return res.status(500).json({ error: 'Erro ao consultar processos judiciais.' });
  }
});

/**
 * 2. POST /api/lawsuits - Cadastrar novo processo vinculado a um cliente
 */
lawsuitsRouter.post('/api/lawsuits', requireAuth, (req, res) => {
  try {
    const {
      client_id,
      cnj_number,
      tribunal,
      instance,
      action_type,
      court_branch,
      subject,
      judge_name,
      distribution_date,
      status,
      notes
    } = req.body;

    if (!client_id || !cnj_number || !tribunal) {
      return res.status(400).json({ error: 'Cliente, número CNJ e Tribunal são obrigatórios.' });
    }

    const client = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente informado não existe no sistema.' });
    }

    const id = generateNextLawsuitId();
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO lawsuits (
        id, client_id, cnj_number, tribunal, instance, action_type, court_branch,
        subject, judge_name, distribution_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      client_id,
      cnj_number.trim(),
      tribunal.trim(),
      instance || '1ª Instância',
      action_type ? action_type.trim() : '',
      court_branch ? court_branch.trim() : '',
      subject ? subject.trim() : '',
      judge_name ? judge_name.trim() : '',
      distribution_date || '',
      status || 'Em Andamento',
      notes ? notes.trim() : '',
      now,
      now
    );

    console.log(`[PROCESSOS] Processo ${cnj_number} cadastrado para cliente ${client_id} (ID: ${id})`);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_PROCESSO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Cadastro do processo judicial CNJ ${cnj_number.trim()} (${tribunal.trim()} - ${instance || '1ª Instância'}) vinculado ao cliente #${client_id}.`,
      details: { id, client_id, cnj_number: cnj_number.trim(), tribunal: tribunal.trim(), instance, action_type, court_branch, subject }
    });

    return res.status(201).json({
      success: true,
      message: 'Processo judicial cadastrado com sucesso!',
      lawsuitId: id
    });

  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar processo judicial:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar processo judicial.' });
  }
});

/**
 * 3. PUT /api/lawsuits/:id - Atualizar dados do processo judicial
 */
lawsuitsRouter.put('/api/lawsuits/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const {
      cnj_number,
      tribunal,
      instance,
      action_type,
      court_branch,
      subject,
      judge_name,
      distribution_date,
      status,
      notes
    } = req.body;

    const law = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(id);
    if (!law) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    const now = new Date().toISOString();

    const updateStmt = db.prepare(`
      UPDATE lawsuits SET
        cnj_number = ?, tribunal = ?, instance = ?, action_type = ?, court_branch = ?,
        subject = ?, judge_name = ?, distribution_date = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      cnj_number ? cnj_number.trim() : law.cnj_number,
      tribunal ? tribunal.trim() : law.tribunal,
      instance || law.instance,
      action_type !== undefined ? action_type.trim() : law.action_type,
      court_branch !== undefined ? court_branch.trim() : law.court_branch,
      subject !== undefined ? subject.trim() : law.subject,
      judge_name !== undefined ? judge_name.trim() : law.judge_name,
      distribution_date !== undefined ? distribution_date : law.distribution_date,
      status || law.status,
      notes !== undefined ? notes.trim() : law.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_PROCESSO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Alteração dos dados do processo judicial CNJ ${cnj_number || law.cnj_number} (ID: ${id}) - Status: ${status || law.status}.`,
      details: { id, cnj_number: cnj_number || law.cnj_number, tribunal: tribunal || law.tribunal, status: status || law.status }
    });

    return res.json({ success: true, message: 'Processo judicial atualizado com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar processo judicial:', error);
    return res.status(500).json({ error: 'Erro ao atualizar processo judicial.' });
  }
});

/**
 * 4. DELETE /api/lawsuits/:id - Excluir processo judicial e seus andamentos
 */
lawsuitsRouter.delete('/api/lawsuits/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const law = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(id);

    db.prepare(`DELETE FROM lawsuit_movements WHERE lawsuit_id = ?`).run(id);
    db.prepare(`DELETE FROM lawsuits WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_PROCESSO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Exclusão do processo judicial CNJ ${law ? law.cnj_number : id} e todos os seus andamentos.`
    });

    return res.json({ success: true, message: 'Processo judicial e andamentos excluídos com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir processo judicial:', error);
    return res.status(500).json({ error: 'Erro ao excluir processo judicial.' });
  }
});

/**
 * 5. POST /api/lawsuits/:id/movements - Adicionar andamento / prazo ao processo
 */
lawsuitsRouter.post('/api/lawsuits/:id/movements', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { movement_date, title, description, deadline_date, deadline_status } = req.body;

    if (!movement_date || !title) {
      return res.status(400).json({ error: 'Data do andamento e título são obrigatórios.' });
    }

    const law = db.prepare(`SELECT id, cnj_number FROM lawsuits WHERE id = ?`).get(id);
    if (!law) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO lawsuit_movements (
        lawsuit_id, movement_date, title, description, deadline_date, deadline_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insertStmt.run(
      id,
      movement_date,
      title.trim(),
      description ? description.trim() : '',
      deadline_date || '',
      deadline_status || 'Pendente',
      now
    );

    // Atualiza o updated_at do processo principal
    db.prepare(`UPDATE lawsuits SET updated_at = ? WHERE id = ?`).run(now, id);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_ANDAMENTO',
      module: 'PROCESSOS',
      resource_id: id,
      description: `Novo andamento lançado no processo CNJ ${law.cnj_number}: '${title.trim()}' (Data: ${movement_date})${deadline_date ? ' | Prazo: ' + deadline_date : ''}.`,
      details: { lawsuit_id: id, movementId: info.lastInsertRowid, title: title.trim(), movement_date, deadline_date, deadline_status }
    });

    return res.status(201).json({
      success: true,
      message: 'Andamento registrado com sucesso!',
      movementId: info.lastInsertRowid
    });
  } catch (error) {
    console.error('[ERRO] Falha ao registrar andamento:', error);
    return res.status(500).json({ error: 'Erro ao registrar andamento do processo.' });
  }
});

/**
 * 6. PUT /api/lawsuits/movements/:movementId - Atualizar andamento / alterar status do prazo
 */
lawsuitsRouter.put('/api/lawsuits/movements/:movementId', requireAuth, (req, res) => {
  try {
    const { movementId } = req.params;
    const { movement_date, title, description, deadline_date, deadline_status } = req.body;

    const mov = db.prepare(`SELECT * FROM lawsuit_movements WHERE id = ?`).get(movementId);
    if (!mov) {
      return res.status(404).json({ error: 'Andamento não encontrado.' });
    }

    const updateStmt = db.prepare(`
      UPDATE lawsuit_movements SET
        movement_date = ?, title = ?, description = ?, deadline_date = ?, deadline_status = ?
      WHERE id = ?
    `);

    updateStmt.run(
      movement_date || mov.movement_date,
      title ? title.trim() : mov.title,
      description !== undefined ? description.trim() : mov.description,
      deadline_date !== undefined ? deadline_date : mov.deadline_date,
      deadline_status || mov.deadline_status,
      movementId
    );

    db.prepare(`UPDATE lawsuits SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), mov.lawsuit_id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_ANDAMENTO',
      module: 'PROCESSOS',
      resource_id: mov.lawsuit_id,
      description: `Alteração do andamento #${movementId} no processo: '${title || mov.title}' - Status Prazo: ${deadline_status || mov.deadline_status}.`
    });

    return res.json({ success: true, message: 'Andamento atualizado com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar andamento:', error);
    return res.status(500).json({ error: 'Erro ao atualizar andamento.' });
  }
});

/**
 * 7. DELETE /api/lawsuits/movements/:movementId - Excluir linha de andamento
 */
lawsuitsRouter.delete('/api/lawsuits/movements/:movementId', requireAuth, (req, res) => {
  try {
    const { movementId } = req.params;
    const mov = db.prepare(`SELECT * FROM lawsuit_movements WHERE id = ?`).get(movementId);

    db.prepare(`DELETE FROM lawsuit_movements WHERE id = ?`).run(movementId);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_ANDAMENTO',
      module: 'PROCESSOS',
      resource_id: mov ? mov.lawsuit_id : null,
      description: `Exclusão do andamento #${movementId} ('${mov ? mov.title : 'Andamento'}').`
    });

    return res.json({ success: true, message: 'Andamento excluído com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir andamento:', error);
    return res.status(500).json({ error: 'Erro ao excluir andamento.' });
  }
});

// Migration defensiva para adicionar whatsapp_notified_at se ainda não existir
try {
  db.prepare(`ALTER TABLE lawsuit_movements ADD COLUMN whatsapp_notified_at TEXT`).run();
} catch (_) {}

/**
 * 8. GET /api/lawsuits/movements/:movementId/preview-whatsapp
 * Obtém pré-visualização da mensagem para autorização do advogado
 */
lawsuitsRouter.get('/api/lawsuits/movements/:movementId/preview-whatsapp', requireAuth, (req, res) => {
  try {
    const { movementId } = req.params;
    const mov = db.prepare(`SELECT * FROM lawsuit_movements WHERE id = ?`).get(movementId);
    if (!mov) {
      return res.status(404).json({ error: 'Andamento não encontrado.' });
    }

    const law = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(mov.lawsuit_id);
    if (!law) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    const client = law.client_id ? db.prepare(`SELECT * FROM clients WHERE id = ?`).get(law.client_id) : null;
    const clientName = client ? client.full_name : 'Cliente';
    const clientPhone = client ? (client.phone || '') : '';

    const dateFormatted = mov.movement_date ? mov.movement_date.split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');

    let defaultMsg = `Olá, ${clientName}! 👋\n\n`;
    defaultMsg += `O escritório *Jorge Alvim Advocacia* tem uma nova atualização sobre o seu processo:\n\n`;
    defaultMsg += `⚖️ *Processo:* ${law.cnj_number || 'Ação em andamento'}\n`;
    defaultMsg += `📌 *Andamento:* ${mov.title}\n`;
    defaultMsg += `📅 *Data:* ${dateFormatted}\n`;
    if (mov.description) {
      defaultMsg += `📝 *Resumo:* ${mov.description}\n`;
    }
    defaultMsg += `\n📲 Você pode acompanhar todos os detalhes e documentos na sua Área do Cliente:\n`;
    defaultMsg += `https://jorgealvimadvocacia.com.br/cliente\n\n`;
    defaultMsg += `_Atendimento Dr. Jorge Alvim • OAB/MG 222.943_`;

    return res.json({
      success: true,
      movementId: mov.id,
      lawsuitId: law.id,
      cnj_number: law.cnj_number,
      clientName,
      clientPhone,
      whatsapp_notified_at: mov.whatsapp_notified_at,
      suggestedMessage: defaultMsg
    });
  } catch (error) {
    console.error('[ERRO] Falha ao gerar preview de WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao gerar preview de WhatsApp.' });
  }
});

/**
 * 9. POST /api/lawsuits/movements/:movementId/authorize-whatsapp
 * Registra a autorização expressa do advogado e devolve o link pronto do WhatsApp
 */
lawsuitsRouter.post('/api/lawsuits/movements/:movementId/authorize-whatsapp', requireAuth, (req, res) => {
  try {
    const { movementId } = req.params;
    const { message, phone } = req.body;

    const mov = db.prepare(`SELECT * FROM lawsuit_movements WHERE id = ?`).get(movementId);
    if (!mov) {
      return res.status(404).json({ error: 'Andamento não encontrado.' });
    }

    const law = db.prepare(`SELECT * FROM lawsuits WHERE id = ?`).get(mov.lawsuit_id);
    const client = law && law.client_id ? db.prepare(`SELECT * FROM clients WHERE id = ?`).get(law.client_id) : null;

    const destPhone = (phone || (client ? client.phone : '') || '').replace(/\D/g, '');
    if (!destPhone) {
      return res.status(400).json({ error: 'Telefone do cliente é obrigatório para disparo.' });
    }

    const finalMsg = message ? message.trim() : `Atualização no processo ${law ? law.cnj_number : ''}: ${mov.title}`;
    const now = new Date().toISOString();

    db.prepare(`UPDATE lawsuit_movements SET whatsapp_notified_at = ? WHERE id = ?`).run(now, movementId);

    logAudit(req, {
      event_type: 'AUTORIZACAO',
      event_name: 'AUTORIZAR_NOTIFICACAO_WHATSAPP',
      module: 'PROCESSOS',
      resource_id: movementId,
      description: `Advogado autorizou expressamente notificação no WhatsApp para cliente ${client ? client.full_name : destPhone} (Andamento: '${mov.title}').`
    });

    const countryPhone = destPhone.startsWith('55') ? destPhone : `55${destPhone}`;
    const whatsappLink = `https://wa.me/${countryPhone}?text=${encodeURIComponent(finalMsg)}`;

    return res.json({
      success: true,
      message: 'Notificação autorizada com sucesso!',
      whatsapp_link: whatsappLink,
      whatsapp_notified_at: now
    });
  } catch (error) {
    console.error('[ERRO] Falha ao autorizar notificação no WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao autorizar notificação.' });
  }
});
