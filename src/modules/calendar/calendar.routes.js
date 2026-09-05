/**
 * Módulo AGENDA (calendar) — eventos, prazos, rascunhos e feeds ICS. Extraído do server.js.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { PORT } from '../../config/constants.js';

export const calendarRouter = express.Router();

// =========================================================================
// 📅 MÓDULO DE AGENDA & CALENDÁRIO JURÍDICO (REST, iCal & Google Calendar)
// =========================================================================

// Formatar data/hora para padrão iCalendar RFC 5545
function formatIcalDateTime(dateStr, allDay = false) {
  if (!dateStr) return '';
  const clean = dateStr.replace(/[-:]/g, '');
  if (allDay || clean.length <= 8) {
    return clean.slice(0, 8);
  }
  if (clean.includes('T')) {
    const parts = clean.split('T');
    const timePart = (parts[1] + '0000').slice(0, 6);
    return `${parts[0]}T${timePart}`;
  }
  return clean;
}

// Gerador de Feed .ics em conformidade com RFC 5545
function generateIcsCalendar(events, calendarName = 'Jorge Alvim Advocacia - Agenda') {
  const nowIcal = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jorge Alvim Advocacia//Agenda & Prazos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H'
  ];

  events.forEach(evt => {
    const uid = evt.ical_uid || `${evt.id}@jorgealvimadvocacia.com.br`;
    const dtStart = formatIcalDateTime(evt.start_datetime, evt.all_day === 1);
    const dtEnd = formatIcalDateTime(evt.end_datetime || evt.start_datetime, evt.all_day === 1);
    
    let descriptionText = `Tipo: ${evt.event_type.toUpperCase()}\\n`;
    if (evt.lawyer_name) descriptionText += `Advogado: ${evt.lawyer_name}\\n`;
    if (evt.client_name) descriptionText += `Cliente: ${evt.client_name}\\n`;
    if (evt.lawsuit_number) descriptionText += `Processo CNJ: ${evt.lawsuit_number}\\n`;
    if (evt.meeting_url) descriptionText += `Link Virtual: ${evt.meeting_url}\\n`;
    if (evt.description) descriptionText += `Detalhes: ${evt.description.replace(/\n/g, '\\n')}\\n`;

    const summary = `${evt.event_type === 'audiencia' ? '⚖️ [AUDIÊNCIA] ' : evt.event_type === 'prazo_fatal' ? '⚠️ [PRAZO] ' : '📅 '}${evt.title}`;
    const location = evt.meeting_url || evt.location || 'Jorge Alvim Advocacia - Benfica, Juiz de Fora / MG';

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${uid}`);
    ics.push(`DTSTAMP:${nowIcal}`);
    if (evt.all_day === 1) {
      ics.push(`DTSTART;VALUE=DATE:${dtStart}`);
      ics.push(`DTEND;VALUE=DATE:${dtEnd}`);
    } else {
      ics.push(`DTSTART:${dtStart}`);
      ics.push(`DTEND:${dtEnd}`);
    }
    ics.push(`SUMMARY:${summary}`);
    ics.push(`DESCRIPTION:${descriptionText}`);
    ics.push(`LOCATION:${location}`);
    ics.push(`STATUS:${evt.status === 'concluido' ? 'COMPLETED' : evt.status === 'cancelado' ? 'CANCELLED' : 'CONFIRMED'}`);
    
    // Alarme / Lembrete 24h antes
    ics.push('BEGIN:VALARM');
    ics.push('TRIGGER:-PT24H');
    ics.push('ACTION:DISPLAY');
    ics.push(`DESCRIPTION:Lembrete de Compromisso: ${evt.title}`);
    ics.push('END:VALARM');

    if (evt.event_type === 'audiencia' || evt.event_type === 'consulta' || evt.event_type === 'reuniao') {
      ics.push('BEGIN:VALARM');
      ics.push('TRIGGER:-PT2H');
      ics.push('ACTION:DISPLAY');
      ics.push(`DESCRIPTION:Audiência/Reunião em 2 Horas: ${evt.title}`);
      ics.push('END:VALARM');
    }

    ics.push('END:VEVENT');
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

// 1. Listar Compromissos e Eventos com Filtros
calendarRouter.get('/api/calendar/events', requireAuth, (req, res) => {
  try {
    const { lawyer_id, event_type, status, month, year, start, end } = req.query;
    let query = `SELECT * FROM calendar_events WHERE 1=1`;
    const params = [];

    if (lawyer_id && lawyer_id !== 'all') {
      query += ` AND (lawyer_id = ? OR lawyer_name LIKE ?)`;
      params.push(lawyer_id, `%${lawyer_id}%`);
    }

    if (event_type && event_type !== 'all') {
      query += ` AND event_type = ?`;
      params.push(event_type);
    }

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (year && month) {
      const padM = String(month).padStart(2, '0');
      query += ` AND (start_datetime LIKE ? OR end_datetime LIKE ?)`;
      params.push(`${year}-${padM}%`, `${year}-${padM}%`);
    } else if (year) {
      query += ` AND (start_datetime LIKE ? OR end_datetime LIKE ?)`;
      params.push(`${year}%`, `${year}%`);
    }

    if (start && end) {
      query += ` AND (start_datetime >= ? AND start_datetime <= ?)`;
      params.push(start, end);
    }

    query += ` ORDER BY start_datetime ASC`;

    const events = db.prepare(query).all(...params);
    return res.json({ success: true, events });
  } catch (err) {
    console.error('[ERRO] Falha ao buscar eventos da agenda:', err);
    return res.status(500).json({ error: 'Erro ao consultar agenda: ' + err.message });
  }
});

// 2. Criar Novo Compromisso / Prazo / Audiência
calendarRouter.post('/api/calendar/events', requireAuth, (req, res) => {
  try {
    const {
      title, description, event_type, start_datetime, end_datetime,
      all_day, location, meeting_url, lawyer_id, lawyer_name,
      client_id, client_name, lawsuit_id, lawsuit_number,
      priority, status, color, notes
    } = req.body;

    if (!title || !start_datetime || !event_type) {
      return res.status(400).json({ error: 'Título, tipo de evento e data de início são obrigatórios.' });
    }

    const id = 'EVT-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const now = new Date().toISOString();
    const ical_uid = `${id}@jorgealvimadvocacia.com.br`;

    // Resolver nomes de cliente ou advogado caso tenha vindo apenas ID
    let resolvedLawyerName = lawyer_name || '';
    if (lawyer_id && !resolvedLawyerName) {
      const member = db.prepare(`SELECT name FROM office_members WHERE id = ?`).get(lawyer_id);
      if (member) resolvedLawyerName = member.name;
    }

    let resolvedClientName = client_name || '';
    if (client_id && !resolvedClientName) {
      const cli = db.prepare(`SELECT full_name FROM clients WHERE id = ?`).get(client_id);
      if (cli) resolvedClientName = cli.full_name;
    }

    let resolvedLawsuitNumber = lawsuit_number || '';
    if (lawsuit_id && !resolvedLawsuitNumber) {
      const law = db.prepare(`SELECT lawsuit_number FROM lawsuits WHERE id = ?`).get(lawsuit_id);
      if (law) resolvedLawsuitNumber = law.lawsuit_number;
    }

    db.prepare(`
      INSERT INTO calendar_events (
        id, title, description, event_type, start_datetime, end_datetime,
        all_day, location, meeting_url, lawyer_id, lawyer_name,
        client_id, client_name, lawsuit_id, lawsuit_number,
        priority, status, color, ical_uid, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, title, description || '', event_type, start_datetime, end_datetime || start_datetime,
      all_day ? 1 : 0, location || '', meeting_url || '', lawyer_id || 'dr-jorge-alvim', resolvedLawyerName || 'Dr. Jorge Alvim',
      client_id || null, resolvedClientName || '', lawsuit_id || null, resolvedLawsuitNumber || '',
      priority || 'normal', status || 'agendado', color || '', ical_uid, notes || '', now, now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'NOVO_COMPROMISSO_AGENDA',
      module: 'AGENDA',
      resource_id: id,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Agendado: ${title} (${event_type.toUpperCase()}) para ${start_datetime} - Advogado: ${resolvedLawyerName || 'Geral'}.`,
      details: { id, title, event_type, start_datetime, lawyer_name: resolvedLawyerName }
    });

    const newEvent = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
    return res.json({ success: true, message: 'Compromisso agendado com sucesso!', event: newEvent });
  } catch (err) {
    console.error('[ERRO] Falha ao criar compromisso:', err);
    return res.status(500).json({ error: 'Erro ao agendar compromisso: ' + err.message });
  }
});

// 3. Obter Detalhes de um Evento
calendarRouter.get('/api/calendar/events/:id', requireAuth, (req, res) => {
  try {
    const event = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Compromisso não encontrado.' });
    return res.json({ success: true, event });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Atualizar Compromisso
calendarRouter.put('/api/calendar/events/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: 'Compromisso não encontrado.' });

    const {
      title, description, event_type, start_datetime, end_datetime,
      all_day, location, meeting_url, lawyer_id, lawyer_name,
      client_id, client_name, lawsuit_id, lawsuit_number,
      priority, status, color, notes
    } = req.body;

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE calendar_events SET
        title = ?, description = ?, event_type = ?, start_datetime = ?, end_datetime = ?,
        all_day = ?, location = ?, meeting_url = ?, lawyer_id = ?, lawyer_name = ?,
        client_id = ?, client_name = ?, lawsuit_id = ?, lawsuit_number = ?,
        priority = ?, status = ?, color = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title !== undefined ? title : existing.title,
      description !== undefined ? description : existing.description,
      event_type !== undefined ? event_type : existing.event_type,
      start_datetime !== undefined ? start_datetime : existing.start_datetime,
      end_datetime !== undefined ? end_datetime : existing.end_datetime,
      all_day !== undefined ? (all_day ? 1 : 0) : existing.all_day,
      location !== undefined ? location : existing.location,
      meeting_url !== undefined ? meeting_url : existing.meeting_url,
      lawyer_id !== undefined ? lawyer_id : existing.lawyer_id,
      lawyer_name !== undefined ? lawyer_name : existing.lawyer_name,
      client_id !== undefined ? client_id : existing.client_id,
      client_name !== undefined ? client_name : existing.client_name,
      lawsuit_id !== undefined ? lawsuit_id : existing.lawsuit_id,
      lawsuit_number !== undefined ? lawsuit_number : existing.lawsuit_number,
      priority !== undefined ? priority : existing.priority,
      status !== undefined ? status : existing.status,
      color !== undefined ? color : existing.color,
      notes !== undefined ? notes : existing.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'EDICAO',
      event_name: 'ATUALIZAR_COMPROMISSO_AGENDA',
      module: 'AGENDA',
      resource_id: id,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Atualizado: ${title || existing.title} (${(event_type || existing.event_type).toUpperCase()}).`,
      details: { id, title }
    });

    const updated = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
    return res.json({ success: true, message: 'Compromisso atualizado com sucesso!', event: updated });
  } catch (err) {
    console.error('[ERRO] Falha ao atualizar compromisso:', err);
    return res.status(500).json({ error: 'Erro ao atualizar compromisso: ' + err.message });
  }
});

// 5. Atualização Rápida de Status (Ex: Concluído / Cumprido)
calendarRouter.patch('/api/calendar/events/:id/status', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

    const now = new Date().toISOString();
    db.prepare(`UPDATE calendar_events SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, id);

    return res.json({ success: true, message: `Status alterado para "${status}" com sucesso!` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Excluir Compromisso
calendarRouter.delete('/api/calendar/events/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: 'Compromisso não encontrado.' });

    db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_COMPROMISSO_AGENDA',
      module: 'AGENDA',
      resource_id: id,
      user_name: req.user ? req.user.name : 'Operador',
      description: `Excluído: ${existing.title} (${existing.event_type.toUpperCase()}).`,
      details: { id, title: existing.title }
    });

    return res.json({ success: true, message: 'Compromisso removido com sucesso!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Resumo da Agenda (Pauta de Hoje e Prazos dos Próximos 7 Dias)
calendarRouter.get('/api/calendar/summary', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const next7Days = new Date(now);
    next7Days.setDate(now.getDate() + 7);
    const next7Str = `${next7Days.getFullYear()}-${pad(next7Days.getMonth() + 1)}-${pad(next7Days.getDate())}T23:59`;

    // Eventos de Hoje
    const todayEvents = db.prepare(`
      SELECT * FROM calendar_events 
      WHERE start_datetime LIKE ? OR (start_datetime <= ? AND end_datetime >= ?)
      ORDER BY start_datetime ASC
    `).all(`${todayStr}%`, `${todayStr}T23:59`, `${todayStr}T00:00`);

    // Prazos Críticos nos Próximos 7 Dias
    const urgentDeadlines = db.prepare(`
      SELECT * FROM calendar_events 
      WHERE event_type = 'prazo_fatal' AND status != 'concluido' AND start_datetime >= ? AND start_datetime <= ?
      ORDER BY start_datetime ASC
    `).all(`${todayStr}T00:00`, next7Str);

    // Totais do Mês
    const currentMonthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}%`;
    const totalMonth = db.prepare(`SELECT COUNT(*) as count FROM calendar_events WHERE start_datetime LIKE ?`).get(currentMonthPrefix).count;
    const totalHearings = db.prepare(`SELECT COUNT(*) as count FROM calendar_events WHERE event_type = 'audiencia' AND start_datetime LIKE ?`).get(currentMonthPrefix).count;
    const totalDeadlines = db.prepare(`SELECT COUNT(*) as count FROM calendar_events WHERE event_type = 'prazo_fatal' AND start_datetime LIKE ?`).get(currentMonthPrefix).count;

    return res.json({
      success: true,
      today_events: todayEvents,
      urgent_deadlines: urgentDeadlines,
      stats: {
        total_month: totalMonth,
        total_hearings: totalHearings,
        total_deadlines: totalDeadlines
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. Lista Consolidada de Advogados / Integrantes para a Agenda
calendarRouter.get('/api/calendar/lawyers', requireAuth, (req, res) => {
  try {
    const defaultLawyers = [
      { id: 'dr-jorge-alvim', name: 'Dr. Jorge Alvim', role: 'Advogado Titular', oab: 'OAB/MG 222.943' }
    ];

    const members = db.prepare(`SELECT id, name, role_type, position_title, oab_number, oab_uf FROM office_members WHERE status = 'Ativo' ORDER BY name ASC`).all();
    const users = db.prepare(`SELECT id, name, role, username FROM users ORDER BY name ASC`).all();

    const consolidated = [...defaultLawyers];

    members.forEach(m => {
      if (!consolidated.some(l => l.id === m.id || l.name.toLowerCase() === m.name.toLowerCase())) {
        consolidated.push({
          id: m.id,
          name: m.name,
          role: m.position_title || m.role_type || 'Membro do Escritório',
          oab: m.oab_number ? `OAB/${m.oab_uf || 'MG'} ${m.oab_number}` : ''
        });
      }
    });

    users.forEach(u => {
      if (!consolidated.some(l => l.id === u.id || l.name.toLowerCase() === u.name.toLowerCase())) {
        consolidated.push({
          id: u.id,
          name: u.name,
          role: u.role === 'admin' ? 'Administrador' : 'Operador',
          oab: ''
        });
      }
    });

    return res.json({ success: true, lawyers: consolidated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 9. Informações e Links de Sincronização iCal / Google Agenda
calendarRouter.get('/api/calendar/sync-links', requireAuth, (req, res) => {
  try {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    const officeFeedUrl = `${baseUrl}/api/calendar/feed/office.ics`;
    const googleSubOffice = `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(officeFeedUrl.replace(/^https?:\/\//, 'webcal://'))}`;

    return res.json({
      success: true,
      office_feed_url: officeFeedUrl,
      google_subscribe_url: googleSubOffice,
      webcal_office_url: officeFeedUrl.replace(/^https?:\/\//, 'webcal://')
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 10. Feed iCalendar (.ics) Geral do Escritório (Público / Assinável)
calendarRouter.get('/api/calendar/feed/office.ics', (req, res) => {
  try {
    const events = db.prepare(`
      SELECT * FROM calendar_events 
      WHERE status != 'cancelado'
      ORDER BY start_datetime ASC
    `).all();

    const icsContent = generateIcsCalendar(events, 'Jorge Alvim Advocacia - Agenda Geral');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="agenda-jorgealvim-geral.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(icsContent);
  } catch (err) {
    console.error('[ERRO] Falha ao gerar feed iCal do escritório:', err);
    return res.status(500).send('Erro ao gerar calendário iCal: ' + err.message);
  }
});

// 11. Feed iCalendar (.ics) Individual por Advogado
calendarRouter.get('/api/calendar/feed/lawyer/:lawyerId.ics', (req, res) => {
  try {
    const { lawyerId } = req.params;
    const events = db.prepare(`
      SELECT * FROM calendar_events 
      WHERE (lawyer_id = ? OR lawyer_name LIKE ?) AND status != 'cancelado'
      ORDER BY start_datetime ASC
    `).all(lawyerId, `%${lawyerId}%`);

    const lawyer = db.prepare(`SELECT name FROM office_members WHERE id = ?`).get(lawyerId);
    const lawyerName = lawyer ? lawyer.name : (lawyerId === 'dr-jorge-alvim' ? 'Dr. Jorge Alvim' : lawyerId);

    const icsContent = generateIcsCalendar(events, `Agenda: ${lawyerName} - Jorge Alvim Advocacia`);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="agenda-${lawyerId}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(icsContent);
  } catch (err) {
    console.error('[ERRO] Falha ao gerar feed iCal do advogado:', err);
    return res.status(500).send('Erro ao gerar calendário iCal: ' + err.message);
  }
});

// ================= ROTAS DO BLOCO DE RASCUNHO DE ATIVIDADES (AGENDA & PRAZOS) =================

// 1. Listar Rascunhos de Atividades
calendarRouter.get('/api/calendar/drafts', requireAuth, (req, res) => {
  try {
    const { lawyer_id, client_id, lawsuit_number, status, search } = req.query;
    let query = `SELECT * FROM activity_drafts WHERE 1=1`;
    const params = [];

    if (lawyer_id && lawyer_id !== 'all') {
      query += ` AND (lawyer_id = ? OR lawyer_name LIKE ?)`;
      params.push(lawyer_id, `%${lawyer_id}%`);
    }

    if (client_id) {
      query += ` AND (client_id = ? OR client_name LIKE ?)`;
      params.push(client_id, `%${client_id}%`);
    }

    if (lawsuit_number) {
      query += ` AND lawsuit_number LIKE ?`;
      params.push(`%${lawsuit_number}%`);
    }

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query += ` AND (activity_title LIKE ? OR notes LIKE ? OR client_name LIKE ? OR defendant_name LIKE ? OR lawsuit_number LIKE ? OR tribunal LIKE ?)`;
      params.push(s, s, s, s, s, s);
    }

    query += ` ORDER BY created_at DESC`;

    const drafts = db.prepare(query).all(...params);
    return res.json({ success: true, drafts, total: drafts.length });
  } catch (err) {
    console.error('Erro ao listar rascunhos de atividades:', err);
    return res.status(500).json({ error: 'Erro ao buscar rascunhos: ' + err.message });
  }
});

// 2. Criar ou Atualizar Rascunho de Atividade
calendarRouter.post('/api/calendar/drafts', requireAuth, (req, res) => {
  try {
    const {
      id,
      lawyer_name,
      lawyer_id,
      client_name,
      client_id,
      defendant_name,
      lawsuit_number,
      tribunal,
      court_branch,
      activity_title,
      deadline_date,
      notes,
      status
    } = req.body;

    if (!activity_title || !activity_title.trim()) {
      return res.status(400).json({ error: 'O título da atividade/tarefa é obrigatório.' });
    }

    const now = new Date().toISOString();

    if (id) {
      // Atualização
      db.prepare(`
        UPDATE activity_drafts SET
          lawyer_name = ?,
          lawyer_id = ?,
          client_name = ?,
          client_id = ?,
          defendant_name = ?,
          lawsuit_number = ?,
          tribunal = ?,
          court_branch = ?,
          activity_title = ?,
          deadline_date = ?,
          notes = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        lawyer_name || '',
        lawyer_id || '',
        client_name || '',
        client_id || '',
        defendant_name || '',
        lawsuit_number || '',
        tribunal || '',
        court_branch || '',
        activity_title.trim(),
        deadline_date || '',
        notes || '',
        status || 'rascunho',
        now,
        id
      );

      return res.json({ success: true, message: 'Rascunho de atividade atualizado com sucesso!', id });
    } else {
      // Criação
      const result = db.prepare(`
        INSERT INTO activity_drafts (
          lawyer_name, lawyer_id, client_name, client_id,
          defendant_name, lawsuit_number, tribunal, court_branch,
          activity_title, deadline_date, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        lawyer_name || '',
        lawyer_id || '',
        client_name || '',
        client_id || '',
        defendant_name || '',
        lawsuit_number || '',
        tribunal || '',
        court_branch || '',
        activity_title.trim(),
        deadline_date || '',
        notes || '',
        status || 'rascunho',
        now,
        now
      );

      return res.status(201).json({
        success: true,
        message: 'Rascunho de atividade salvo com sucesso!',
        id: result.lastInsertRowid
      });
    }
  } catch (err) {
    console.error('Erro ao salvar rascunho de atividade:', err);
    return res.status(500).json({ error: 'Erro ao salvar rascunho: ' + err.message });
  }
});

// 3. Excluir Rascunho de Atividade
calendarRouter.delete('/api/calendar/drafts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`DELETE FROM activity_drafts WHERE id = ?`).run(id);
    return res.json({ success: true, message: 'Rascunho excluído com sucesso!' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao excluir rascunho: ' + err.message });
  }
});
