import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const rocketsRouter = express.Router();

/**
 * 1. GET /api/rockets/recipients - Lista destinatários disponíveis para envio de Foguetes
 */
rocketsRouter.get('/api/rockets/recipients', requireAuth, (req, res) => {
  try {
    const list = [];
    
    // Equipe Interna / Usuários do Painel
    const users = db.prepare(`SELECT id, username, name, role FROM users ORDER BY name ASC`).all();
    users.forEach(u => {
      list.push({
        id: u.id,
        name: u.name || u.username,
        role: u.role || 'admin',
        type: 'user',
        label: `👤 ${u.name || u.username} (${u.role === 'master' ? 'Sócio Mestre' : 'Operador'})`
      });
    });

    // Colaboradores RH
    try {
      const employees = db.prepare(`SELECT id, name, position, department FROM hr_employees WHERE status = 'Ativo' OR status = 'ativo' OR status IS NULL ORDER BY name ASC`).all();
      employees.forEach(emp => {
        const empName = emp.name || 'Colaborador';
        const existsInUsers = list.some(item => item.name.toLowerCase() === empName.toLowerCase());
        if (!existsInUsers) {
          list.push({
            id: `EMP-${emp.id}`,
            name: empName,
            role: emp.position || 'Colaborador',
            type: 'employee',
            label: `💼 ${empName} (${emp.position || 'Colaborador'}${emp.department ? ' - ' + emp.department : ''})`
          });
        }
      });
    } catch (e) {
      console.warn('[FOGUETES] Aviso ao buscar hr_employees:', e.message);
    }

    return res.json({
      success: true,
      recipients: list
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao listar destinatários:', err);
    return res.status(500).json({ error: 'Erro ao listar destinatários.' });
  }
});

/**
 * 2. GET /api/rockets/stats - Contadores de KPIs de Foguetes
 */
rocketsRouter.get('/api/rockets/stats', requireAuth, (req, res) => {
  try {
    const active = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 0`).get().c;
    const pendingExecution = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 0 AND message_type = 'execucao' AND status != 'missao_cumprida'`).get().c;
    const pendingKnowledge = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 0 AND message_type = 'conhecimento' AND status = 'pendente'`).get().c;
    const missionAccomplished = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE status = 'missao_cumprida'`).get().c;
    const archived = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 1`).get().c;

    return res.json({
      success: true,
      stats: {
        total_active: active,
        pending_execution: pendingExecution,
        pending_knowledge: pendingKnowledge,
        mission_accomplished: missionAccomplished,
        archived
      }
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao calcular estatísticas:', err);
    return res.status(500).json({ error: 'Erro ao calcular métricas.' });
  }
});

/**
 * 3. GET /api/rockets - Listagem com filtros por caixa (inbox, outbox, all, archived)
 */
rocketsRouter.get('/api/rockets', requireAuth, (req, res) => {
  try {
    const { box = 'all', type, priority, status, q } = req.query;
    const currentUserId = req.user.userId || req.user.id;
    const currentUserName = req.user.name || req.user.username;

    let sql = `
      SELECT r.*, 
        (SELECT COUNT(*) FROM rocket_replies rr WHERE rr.rocket_id = r.id) as replies_count,
        (SELECT MAX(created_at) FROM rocket_replies rr WHERE rr.rocket_id = r.id) as last_reply_at
      FROM rockets r
      WHERE 1=1
    `;
    const params = [];

    if (box === 'inbox') {
      sql += ` AND r.is_archived = 0 AND (r.recipient_id = ? OR r.recipient_id = 'all' OR r.recipient_name LIKE ? OR r.recipient_type = 'all')`;
      params.push(currentUserId, `%${currentUserName}%`);
    } else if (box === 'outbox') {
      sql += ` AND r.is_archived = 0 AND (r.sender_id = ? OR r.sender_name = ?)`;
      params.push(currentUserId, currentUserName);
    } else if (box === 'archived') {
      sql += ` AND r.is_archived = 1`;
    } else {
      sql += ` AND r.is_archived = 0`;
    }

    if (type) {
      sql += ` AND r.message_type = ?`;
      params.push(type);
    }
    if (priority) {
      sql += ` AND r.priority = ?`;
      params.push(priority);
    }
    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (q) {
      sql += ` AND (r.protocol_number LIKE ? OR r.subject LIKE ? OR r.message LIKE ? OR r.sender_name LIKE ? OR r.recipient_name LIKE ?)`;
      const term = `%${q.trim()}%`;
      params.push(term, term, term, term, term);
    }

    sql += ` ORDER BY r.created_at DESC`;

    const rockets = db.prepare(sql).all(...params);
    return res.json({ success: true, count: rockets.length, rockets });
  } catch (err) {
    console.error('[FOGUETES] Falha ao listar foguetes:', err);
    return res.status(500).json({ error: 'Erro ao listar despachos.' });
  }
});

/**
 * 4. POST /api/rockets - Lançamento de Novo Foguete (Despacho Rápido)
 */
rocketsRouter.post('/api/rockets', requireAuth, (req, res) => {
  try {
    const {
      recipient_id,
      recipient_name,
      recipient_type = 'individual',
      subject,
      message,
      message_type,
      priority = 'normal',
      deadline
    } = req.body;

    if (!recipient_name || !subject || !message || !message_type) {
      return res.status(400).json({ error: 'Destinatário, assunto, mensagem e finalidade são obrigatórios.' });
    }

    const currentYear = new Date().getFullYear();
    const prefix = `FOG-${currentYear}-`;
    const lastRocket = db.prepare(`SELECT protocol_number FROM rockets WHERE protocol_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
    let nextNum = 1;
    if (lastRocket && lastRocket.protocol_number) {
      const match = lastRocket.protocol_number.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const protocol_number = `${prefix}${String(nextNum).padStart(4, '0')}`;

    const sender_id = req.user.userId || req.user.id || 'USR-MASTER-01';
    const sender_name = req.user.name || req.user.username || 'Dr. Jorge Alvim';
    const sender_role = req.user.role || 'master';
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO rockets (
        protocol_number, sender_id, sender_name, sender_role,
        recipient_id, recipient_name, recipient_type,
        subject, message, message_type, priority, deadline,
        status, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const result = insertStmt.run(
      protocol_number,
      sender_id,
      sender_name,
      sender_role,
      recipient_id || 'all',
      recipient_name.trim(),
      recipient_type,
      subject.trim(),
      message.trim(),
      message_type,
      priority,
      deadline ? String(deadline) : null,
      'pendente',
      now,
      now
    );

    const rocketId = result.lastInsertRowid;
    const createdRocket = db.prepare(`SELECT * FROM rockets WHERE id = ?`).get(rocketId);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'LANCAR_FOGUETE',
      module: 'FOGUETES',
      resource_id: protocol_number,
      description: `Foguete #${protocol_number} lançado por ${sender_name} para ${recipient_name} (${message_type}).`,
      details: { protocol_number, subject, priority, message_type, recipient_name }
    });

    return res.status(201).json({
      success: true,
      message: `🚀 Foguete #${protocol_number} lançado com sucesso!`,
      rocket: createdRocket
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao lançar foguete:', err);
    return res.status(500).json({ error: 'Erro ao disparar despacho.' });
  }
});

/**
 * 5. GET /api/rockets/:id - Consulta de Foguete com histórico completo da thread
 */
rocketsRouter.get('/api/rockets/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    let rocket = null;
    if (String(id).startsWith('FOG-')) {
      rocket = db.prepare(`SELECT * FROM rockets WHERE protocol_number = ?`).get(id);
    } else {
      rocket = db.prepare(`SELECT * FROM rockets WHERE id = ?`).get(id);
    }

    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    const replies = db.prepare(`SELECT * FROM rocket_replies WHERE rocket_id = ? ORDER BY created_at ASC`).all(rocket.id);

    return res.json({
      success: true,
      rocket,
      replies
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao carregar foguete:', err);
    return res.status(500).json({ error: 'Erro ao buscar detalhes do foguete.' });
  }
});

/**
 * 6. POST /api/rockets/:id/reply - Envio de Resposta / Ação Rápida ("Ciente" ou "Missão Cumprida")
 */
rocketsRouter.post('/api/rockets/:id/reply', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { reply_type = 'comentario', message = '' } = req.body;

    const rocket = db.prepare(`SELECT * FROM rockets WHERE id = ? OR protocol_number = ?`).get(id, id);
    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    const author_id = req.user.userId || req.user.id || 'USR-MASTER-01';
    const author_name = req.user.name || req.user.username || 'Dr. Jorge Alvim';
    const author_role = req.user.role || 'master';
    const now = new Date().toISOString();

    let replyMsg = message.trim();
    if (reply_type === 'ciente') {
      replyMsg = replyMsg || '👁️ Ciente do despacho.';
    } else if (reply_type === 'missao_cumprida') {
      replyMsg = replyMsg || '🎯 Missão Cumprida com sucesso!';
    }

    if (!replyMsg) {
      return res.status(400).json({ error: 'Mensagem de resposta é obrigatória.' });
    }

    db.prepare(`
      INSERT INTO rocket_replies (rocket_id, author_id, author_name, author_role, reply_type, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(rocket.id, author_id, author_name, author_role, reply_type, replyMsg, now);

    let newStatus = rocket.status;
    if (reply_type === 'missao_cumprida') {
      newStatus = 'missao_cumprida';
    } else if (reply_type === 'ciente' && rocket.status === 'pendente') {
      newStatus = 'ciente';
    } else if (rocket.status === 'pendente') {
      newStatus = 'em_andamento';
    }

    db.prepare(`UPDATE rockets SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, now, rocket.id);

    const updatedRocket = db.prepare(`SELECT * FROM rockets WHERE id = ?`).get(rocket.id);
    const replies = db.prepare(`SELECT * FROM rocket_replies WHERE rocket_id = ? ORDER BY created_at ASC`).all(rocket.id);

    return res.json({
      success: true,
      message: 'Resposta enviada com sucesso!',
      rocket: updatedRocket,
      replies
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao responder foguete:', err);
    return res.status(500).json({ error: 'Erro ao registrar resposta.' });
  }
});

/**
 * 7. PATCH /api/rockets/:id/archive - Arquivar / Desarquivar
 */
rocketsRouter.patch('/api/rockets/:id/archive', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { is_archived } = req.body;

    const rocket = db.prepare(`SELECT * FROM rockets WHERE id = ? OR protocol_number = ?`).get(id, id);
    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    const archVal = is_archived ? 1 : 0;
    const now = new Date().toISOString();
    db.prepare(`UPDATE rockets SET is_archived = ?, archived_at = ?, updated_at = ? WHERE id = ?`).run(
      archVal,
      archVal ? now : null,
      now,
      rocket.id
    );

    return res.json({
      success: true,
      message: archVal ? 'Foguete arquivado com sucesso.' : 'Foguete desarquivado com sucesso.',
      is_archived: archVal
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao alternar arquivamento:', err);
    return res.status(500).json({ error: 'Erro ao alterar status de arquivamento.' });
  }
});

/**
 * 8. DELETE /api/rockets/:id - Exclusão Permanente
 */
rocketsRouter.delete('/api/rockets/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const rocket = db.prepare(`SELECT * FROM rockets WHERE id = ? OR protocol_number = ?`).get(id, id);
    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    db.prepare(`DELETE FROM rockets WHERE id = ?`).run(rocket.id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_FOGUETE',
      module: 'FOGUETES',
      resource_id: rocket.protocol_number,
      description: `Foguete #${rocket.protocol_number} ("${rocket.subject}") excluído por ${req.user.name || req.user.username}.`
    });

    return res.json({ success: true, message: 'Foguete excluído com sucesso.' });
  } catch (err) {
    console.error('[FOGUETES] Falha ao excluir foguete:', err);
    return res.status(500).json({ error: 'Erro ao excluir despacho.' });
  }
});
