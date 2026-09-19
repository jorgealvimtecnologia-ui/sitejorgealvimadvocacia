import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { hashPassword } from '../../shared/password-crypto.js';

export const rocketsRouter = express.Router();
rocketsRouter.use(express.json());
rocketsRouter.use(express.urlencoded({ extended: true }));

/**
 * Helper interno para extrair dados limpos do usuário autenticado
 */
function getCurrentUserInfo(req) {
  const userId = req.user.userId || req.user.id || 'USR-MASTER-01';
  const userName = req.user.name || req.user.username || 'Dr. Jorge Alvim';
  const userRole = req.user.role || 'master';
  const isMaster = userRole === 'master' || req.user.username === 'jorgealvimtecnologia';
  return { userId, userName, userRole, isMaster };
}

/**
 * 1. GET /api/rockets/recipients - Lista destinatários disponíveis para envio de Foguetes
 */
rocketsRouter.get('/api/rockets/recipients', requireAuth, (req, res) => {
  try {
    const { userId, userName } = getCurrentUserInfo(req);
    const list = [];
    
    // Equipe Interna / Usuários do Painel
    const users = db.prepare(`SELECT id, username, name, role FROM users ORDER BY name ASC`).all();
    users.forEach(u => {
      if (u.id === userId || (u.username && u.username === req.user.username)) return;
      let rTemplate = u.role;
      try {
        const perm = db.prepare(`SELECT role_template FROM access_permissions WHERE user_id = ?`).get(u.id);
        if (perm && perm.role_template) rTemplate = perm.role_template;
      } catch (e) {}

      const roleLabels = {
        master: 'Sócio Mestre',
        dono_escritorio: 'Sócio Titular',
        advogado: 'Advogado(a)',
        estagiario: 'Estagiário(a)',
        secretaria: 'Secretária',
        gerente: 'Gerente',
        motorista: 'Motorista',
        cliente: 'Cliente'
      };
      const labelRole = roleLabels[rTemplate] || (u.role === 'master' ? 'Sócio Mestre' : 'Operador');

      list.push({
        id: u.id,
        name: u.name || u.username,
        role: rTemplate || u.role || 'admin',
        type: 'user',
        label: `👤 ${u.name || u.username} (${labelRole})`
      });
    });

    // Colaboradores RH
    try {
      const employees = db.prepare(`SELECT id, name, position, department FROM hr_employees WHERE status = 'Ativo' OR status = 'ativo' OR status IS NULL ORDER BY name ASC`).all();
      employees.forEach(emp => {
        const empName = emp.name || 'Colaborador';
        const empId = `EMP-${emp.id}`;
        if (empId === userId || empName.toLowerCase() === userName.toLowerCase()) return;
        const existsInUsers = list.some(item => item.name.toLowerCase() === empName.toLowerCase());
        if (!existsInUsers) {
          list.push({
            id: empId,
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
 * 2. GET /api/rockets/stats - Contadores de KPIs de Foguetes por Usuário
 */
rocketsRouter.get('/api/rockets/stats', requireAuth, (req, res) => {
  try {
    const { userId, userName, isMaster } = getCurrentUserInfo(req);
    const scope = req.query.scope || 'personal';

    // Minhas estatísticas pessoais (por usuário)
    const inboxActive = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE is_archived = 0 AND (recipient_id = ? OR recipient_id = 'all' OR recipient_type = 'all' OR recipient_name LIKE ?)
    `).get(userId, `%${userName}%`).c;

    const outboxActive = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE is_archived = 0 AND (sender_id = ? OR sender_name = ?)
    `).get(userId, userName).c;

    const pendingExecution = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE is_archived = 0 AND message_type = 'execucao' AND status != 'missao_cumprida'
      AND (recipient_id = ? OR recipient_id = 'all' OR recipient_type = 'all' OR recipient_name LIKE ?)
    `).get(userId, `%${userName}%`).c;

    const pendingKnowledge = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE is_archived = 0 AND message_type = 'conhecimento' AND status = 'pendente'
      AND (recipient_id = ? OR recipient_id = 'all' OR recipient_type = 'all' OR recipient_name LIKE ?)
    `).get(userId, `%${userName}%`).c;

    const missionAccomplished = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE status = 'missao_cumprida'
      AND (recipient_id = ? OR recipient_id = 'all' OR recipient_type = 'all' OR recipient_name LIKE ? OR sender_id = ? OR sender_name = ?)
    `).get(userId, `%${userName}%`, userId, userName).c;

    const savedCount = db.prepare(`
      SELECT COUNT(*) as c FROM rocket_saved_messages WHERE user_id = ?
    `).get(userId).c;

    const archivedCount = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE is_archived = 1 
      AND (recipient_id = ? OR recipient_id = 'all' OR recipient_name LIKE ? OR sender_id = ? OR sender_name = ?)
    `).get(userId, `%${userName}%`, userId, userName).c;

    const unreadInbox = db.prepare(`
      SELECT COUNT(*) as c FROM rockets 
      WHERE is_archived = 0 AND status = 'pendente'
      AND (recipient_id = ? OR recipient_id = 'all' OR recipient_type = 'all' OR recipient_name LIKE ?)
    `).get(userId, `%${userName}%`).c;

    // Estatísticas Globais do Escritório (para supervisão do Mestre)
    let globalStats = null;
    if (isMaster) {
      const gActive = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 0`).get().c;
      const gPendingExec = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 0 AND message_type = 'execucao' AND status != 'missao_cumprida'`).get().c;
      const gPendingKnow = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 0 AND message_type = 'conhecimento' AND status = 'pendente'`).get().c;
      const gDone = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE status = 'missao_cumprida'`).get().c;
      const gArchived = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE is_archived = 1`).get().c;
      globalStats = {
        total_active: gActive,
        pending_execution: gPendingExec,
        pending_knowledge: gPendingKnow,
        mission_accomplished: gDone,
        archived: gArchived
      };
    }

    const personalStats = {
      total_active: inboxActive + outboxActive,
      inbox_count: inboxActive,
      outbox_count: outboxActive,
      pending_execution: pendingExecution,
      pending_knowledge: pendingKnowledge,
      mission_accomplished: missionAccomplished,
      saved_count: savedCount,
      archived: archivedCount,
      unread_inbox: unreadInbox
    };

    return res.json({
      success: true,
      stats: (isMaster && scope === 'global') ? (globalStats || personalStats) : personalStats,
      personal_stats: personalStats,
      global_stats: globalStats,
      is_master: isMaster
    });
  } catch (err) {
    console.error('[FOGUETES] Falha ao calcular estatísticas:', err);
    return res.status(500).json({ error: 'Erro ao calcular métricas.' });
  }
});

/**
 * 3. GET /api/rockets - Listagem com filtros por caixa (inbox, outbox, saved, archived, all)
 */
rocketsRouter.get('/api/rockets', requireAuth, (req, res) => {
  try {
    const { box = 'inbox', type, priority, status, q, scope = 'personal' } = req.query;
    const { userId: currentUserId, userName: currentUserName, isMaster } = getCurrentUserInfo(req);

    let sql = `
      SELECT r.*, 
        (SELECT COUNT(*) FROM rocket_replies rr WHERE rr.rocket_id = r.id) as replies_count,
        (SELECT MAX(created_at) FROM rocket_replies rr WHERE rr.rocket_id = r.id) as last_reply_at,
        (SELECT COUNT(*) FROM rocket_saved_messages rsm WHERE rsm.rocket_id = r.id AND rsm.user_id = ?) as is_saved
      FROM rockets r
      WHERE 1=1
    `;
    const params = [currentUserId];

    if (box === 'inbox') {
      sql += ` AND r.is_archived = 0 AND (r.recipient_id = ? OR r.recipient_id = 'all' OR r.recipient_name LIKE ? OR r.recipient_type = 'all')`;
      params.push(currentUserId, `%${currentUserName}%`);
    } else if (box === 'outbox') {
      sql += ` AND r.is_archived = 0 AND (r.sender_id = ? OR r.sender_name = ?)`;
      params.push(currentUserId, currentUserName);
    } else if (box === 'saved') {
      sql += ` AND EXISTS (SELECT 1 FROM rocket_saved_messages rsm WHERE rsm.rocket_id = r.id AND rsm.user_id = ?)`;
      params.push(currentUserId);
    } else if (box === 'archived') {
      if (isMaster && scope === 'global') {
        sql += ` AND r.is_archived = 1`;
      } else {
        sql += ` AND r.is_archived = 1 AND (r.recipient_id = ? OR r.recipient_id = 'all' OR r.recipient_name LIKE ? OR r.sender_id = ? OR r.sender_name = ?)`;
        params.push(currentUserId, `%${currentUserName}%`, currentUserId, currentUserName);
      }
    } else {
      // box === 'all'
      if (isMaster && scope === 'global') {
        sql += ` AND r.is_archived = 0`;
      } else {
        sql += ` AND r.is_archived = 0 AND (r.recipient_id = ? OR r.recipient_id = 'all' OR r.recipient_type = 'all' OR r.recipient_name LIKE ? OR r.sender_id = ? OR r.sender_name = ?)`;
        params.push(currentUserId, `%${currentUserName}%`, currentUserId, currentUserName);
      }
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
    return res.json({
      success: true,
      count: rockets.length,
      rockets,
      current_user_id: currentUserId,
      current_user_name: currentUserName,
      is_master: isMaster
    });
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
      title,
      message,
      message_type = 'execucao',
      priority = 'normal',
      deadline
    } = req.body || {};

    const finalSubject = (subject || title || '').trim();
    if (!recipient_name || !finalSubject || !message) {
      return res.status(400).json({ error: 'Destinatário, assunto/título e mensagem são obrigatórios.' });
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

    const { userId: sender_id, userName: sender_name, userRole: sender_role } = getCurrentUserInfo(req);
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
      finalSubject,
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
      details: { protocol_number, subject: finalSubject, priority, message_type, recipient_name }
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
rocketsRouter.get('/api/rockets/:id', requireAuth, (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === 'users' || id === 'templates' || id === 'recipients' || id === 'stats') {
      return next();
    }
    const { userId } = getCurrentUserInfo(req);

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
    const isSaved = db.prepare(`SELECT 1 FROM rocket_saved_messages WHERE user_id = ? AND rocket_id = ?`).get(userId, rocket.id) ? 1 : 0;

    return res.json({
      success: true,
      rocket: { ...rocket, is_saved: isSaved },
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
    const { reply_type = 'comentario', message = '' } = req.body || {};

    const rocket = db.prepare(`SELECT * FROM rockets WHERE id = ? OR protocol_number = ?`).get(id, id);
    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    const { userId: author_id, userName: author_name, userRole: author_role } = getCurrentUserInfo(req);
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
    const { is_archived } = req.body || {};

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
 * 8. PATCH /api/rockets/:id/save - Salvar / Favoritar Mensagem (Por Usuário)
 */
rocketsRouter.patch('/api/rockets/:id/save', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = getCurrentUserInfo(req);

    const rocket = db.prepare(`SELECT * FROM rockets WHERE id = ? OR protocol_number = ?`).get(id, id);
    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    const existing = db.prepare(`SELECT 1 FROM rocket_saved_messages WHERE user_id = ? AND rocket_id = ?`).get(userId, rocket.id);
    let isSaved = false;
    if (existing) {
      db.prepare(`DELETE FROM rocket_saved_messages WHERE user_id = ? AND rocket_id = ?`).run(userId, rocket.id);
      isSaved = false;
    } else {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO rocket_saved_messages (user_id, rocket_id, saved_at) VALUES (?, ?, ?)`).run(userId, rocket.id, now);
      isSaved = true;
    }

    return res.json({
      success: true,
      message: isSaved ? 'Despacho salvo nos favoritos!' : 'Despacho removido dos salvos.',
      is_saved: isSaved
    });
  } catch (err) {
    console.error('[FOGUETES] Erro ao salvar mensagem:', err);
    return res.status(500).json({ error: 'Erro ao alternar status de mensagem salva.' });
  }
});

/**
 * 9. DELETE /api/rockets/:id - Exclusão Permanente de Mensagem (Autor ou Mestre)
 */
rocketsRouter.delete('/api/rockets/:id', requireAuth, (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === 'users' || id === 'templates') {
      return next();
    }
    const { userId: currentUserId, userName: currentUserName, isMaster } = getCurrentUserInfo(req);

    const rocket = db.prepare(`SELECT * FROM rockets WHERE id = ? OR protocol_number = ?`).get(id, id);
    if (!rocket) {
      return res.status(404).json({ error: 'Foguete não encontrado.' });
    }

    // Permissão: Autor da mensagem OU Sócio Mestre
    const isAuthor = rocket.sender_id === currentUserId || rocket.sender_name === currentUserName;
    if (!isMaster && !isAuthor) {
      return res.status(403).json({ error: 'Apenas o autor do despacho ou o Sócio Mestre podem excluir esta mensagem.' });
    }

    db.prepare(`DELETE FROM rockets WHERE id = ?`).run(rocket.id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_FOGUETE',
      module: 'FOGUETES',
      resource_id: rocket.protocol_number,
      description: `Foguete #${rocket.protocol_number} ("${rocket.subject}") excluído por ${currentUserName}.`
    });

    return res.json({ success: true, message: 'Foguete excluído com sucesso.' });
  } catch (err) {
    console.error('[FOGUETES] Falha ao excluir foguete:', err);
    return res.status(500).json({ error: 'Erro ao excluir despacho.' });
  }
});

/**
 * 10. MODELOS DE MENSAGENS SALVAS (TEMPLATES)
 */
rocketsRouter.get('/api/rockets/templates', requireAuth, (req, res) => {
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM rocket_templates`).get().c;
    if (count === 0) {
      const now = new Date().toISOString();
      const insertTpl = db.prepare(`
        INSERT INTO rocket_templates (title, message_type, priority, subject, message, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'Dr. Jorge Alvim', ?)
      `);
      insertTpl.run(
        'Urgência Processual: Petição/Contestação',
        'execucao',
        'urgente',
        'Elaborar manifestação urgente em 24h',
        'Favor dar prioridade máxima na elaboração da manifestação processual referente aos autos citados. Missão com prazo improrrogável de 24 horas.',
        now
      );
      insertTpl.run(
        'Aviso de Audiência de Instrução',
        'conhecimento',
        'normal',
        'Ciência de audiência de instrução designada',
        'Designada audiência de instrução e julgamento para a data indicada. Favor revisar os autos e alinhar com o cliente com antecedência.',
        now
      );
      insertTpl.run(
        'Solicitação de Documentação ao Trabalhador',
        'execucao',
        'normal',
        'Envio de comprovante ou documento pendente',
        'Solicitamos a entrega da documentação solicitada pelo departamento de pessoal/jurídico até a data estipulada.',
        now
      );
    }

    const templates = db.prepare(`SELECT * FROM rocket_templates ORDER BY id ASC`).all();
    return res.json({ success: true, count: templates.length, templates });
  } catch (err) {
    console.error('[FOGUETES] Erro ao listar modelos:', err);
    return res.status(500).json({ error: 'Erro ao carregar modelos de mensagens.' });
  }
});

rocketsRouter.post('/api/rockets/templates', requireAuth, (req, res) => {
  try {
    const { title, message_type = 'execucao', priority = 'normal', subject, message } = req.body || {};
    if (!title || !subject || !message) {
      return res.status(400).json({ error: 'Título do modelo, assunto e texto são obrigatórios.' });
    }

    const { userName } = getCurrentUserInfo(req);
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO rocket_templates (title, message_type, priority, subject, message, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title.trim(), message_type, priority, subject.trim(), message.trim(), userName, now);

    const created = db.prepare(`SELECT * FROM rocket_templates WHERE id = ?`).get(result.lastInsertRowid);
    return res.status(201).json({ success: true, message: 'Modelo salvo com sucesso!', template: created });
  } catch (err) {
    console.error('[FOGUETES] Erro ao criar modelo:', err);
    return res.status(500).json({ error: 'Erro ao salvar modelo de mensagem.' });
  }
});

rocketsRouter.delete('/api/rockets/templates/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const template = db.prepare(`SELECT * FROM rocket_templates WHERE id = ?`).get(id);
    if (!template) {
      return res.status(404).json({ error: 'Modelo não encontrado.' });
    }

    db.prepare(`DELETE FROM rocket_templates WHERE id = ?`).run(template.id);
    return res.json({ success: true, message: 'Modelo excluído com sucesso.' });
  } catch (err) {
    console.error('[FOGUETES] Erro ao excluir modelo:', err);
    return res.status(500).json({ error: 'Erro ao excluir modelo de mensagem.' });
  }
});

/**
 * 11. CONTROLE DE USUÁRIOS DO FOGUETE (Listar, Criar e Excluir Usuários)
 */
rocketsRouter.get('/api/rockets/users', requireAuth, (req, res) => {
  try {
    const list = [];
    const users = db.prepare(`SELECT id, username, name, role, created_at FROM users ORDER BY name ASC`).all();
    users.forEach(u => {
      const sentCount = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE sender_id = ? OR sender_name = ?`).get(u.id, u.name || u.username).c;
      const recvCount = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE recipient_id = ? OR recipient_name = ?`).get(u.id, u.name || u.username).c;
      list.push({
        id: u.id,
        username: u.username,
        name: u.name || u.username,
        role: u.role || 'admin',
        type: 'user',
        is_master: u.role === 'master' || u.username === 'jorgealvimtecnologia',
        sent_count: sentCount,
        received_count: recvCount,
        created_at: u.created_at
      });
    });

    // Colaboradores RH
    try {
      const employees = db.prepare(`SELECT id, name, position, department, status, created_at FROM hr_employees ORDER BY name ASC`).all();
      employees.forEach(emp => {
        const empId = `EMP-${emp.id}`;
        const sentCount = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE sender_id = ? OR sender_name = ?`).get(empId, emp.name).c;
        const recvCount = db.prepare(`SELECT COUNT(*) as c FROM rockets WHERE recipient_id = ? OR recipient_name = ?`).get(empId, emp.name).c;
        list.push({
          id: empId,
          raw_id: emp.id,
          username: emp.name,
          name: emp.name,
          role: emp.position || 'Colaborador',
          department: emp.department,
          type: 'employee',
          is_master: false,
          sent_count: sentCount,
          received_count: recvCount,
          created_at: emp.created_at
        });
      });
    } catch (e) {}

    return res.json({ success: true, count: list.length, users: list });
  } catch (err) {
    console.error('[FOGUETES] Erro ao listar usuários de foguetes:', err);
    return res.status(500).json({ error: 'Erro ao listar usuários do canal de foguetes.' });
  }
});

rocketsRouter.post('/api/rockets/users', requireAuth, (req, res) => {
  try {
    const { name, username, password, role = 'admin' } = req.body || {};
    if (!name || !username) {
      return res.status(400).json({ error: 'Nome e nome de usuário são obrigatórios.' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }

    const rawPassword = password ? String(password).trim() : 'Mivl@100';
    if (rawPassword.length < 8) {
      return res.status(400).json({ error: 'A senha deve conter no mínimo 8 caracteres.' });
    }

    const { hash, salt } = hashPassword(rawPassword);
    const userId = `USER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, cleanUsername, hash, salt, name.trim(), role, now);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_USUARIO_FOGUETE',
      module: 'FOGUETES',
      resource_id: userId,
      description: `Novo usuário ${name.trim()} (@${cleanUsername}) criado no canal de foguetes.`
    });

    return res.status(201).json({
      success: true,
      message: `Usuário ${name.trim()} criado com sucesso!`,
      user: { id: userId, username: cleanUsername, name: name.trim(), role }
    });
  } catch (err) {
    console.error('[FOGUETES] Erro ao criar usuário de foguete:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar novo usuário.' });
  }
});

rocketsRouter.delete('/api/rockets/users/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { isMaster, userId: currentUserId } = getCurrentUserInfo(req);

    if (!isMaster && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores e o Sócio Mestre podem gerenciar usuários.' });
    }

    const targetUser = db.prepare(`SELECT * FROM users WHERE id = ? OR username = ?`).get(id, id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (targetUser.role === 'master' || targetUser.username === 'jorgealvimtecnologia' || targetUser.id === 'USR-MASTER-01') {
      return res.status(403).json({ error: 'O Usuário Mestre (Dr. Jorge Alvim) não pode ser excluído.' });
    }

    if (targetUser.id === currentUserId) {
      return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário em sessão.' });
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(targetUser.id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_USUARIO_FOGUETE',
      module: 'FOGUETES',
      resource_id: targetUser.id,
      description: `Usuário ${targetUser.name} (@${targetUser.username}) removido do canal de foguetes.`
    });

    return res.json({ success: true, message: `Usuário ${targetUser.name} excluído com sucesso.` });
  } catch (err) {
    console.error('[FOGUETES] Erro ao excluir usuário de foguete:', err);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});
