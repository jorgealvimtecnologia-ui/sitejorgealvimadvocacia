/**
 * Módulo USUÁRIOS & CONTROLE DE ACESSO (RBAC) — gestão de usuários, matriz de
 * permissões e templates de perfil. Extraído do server.js.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth, validateToken } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { hashPassword } from '../../shared/password-crypto.js';
import { validatePassword } from '../../shared/password-policy.js';

export const accessRouter = express.Router();

// ================= ROTAS DE GESTÃO DE USUÁRIOS =================

accessRouter.get('/api/users', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, username, name, role, created_at
      FROM users
      ORDER BY
        CASE WHEN role = 'master' THEN 1 ELSE 2 END,
        created_at ASC
    `).all();
    // SEGURANÇA: senhas nunca são retornadas (nem para o mestre). Para trocar,
    // usa-se "Redefinir senha" (PUT /api/users/:id), que grava novo hash PBKDF2.
    rows.forEach(r => { r.plain_password = ''; });
    return res.json({ success: true, users: rows });
  } catch (error) {
    console.error('[ERRO] Falha ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro ao consultar usuários.' });
  }
});

accessRouter.post('/api/users', requireAuth, (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Nome, login e senha são obrigatórios.' });
    }

    {
      const pol = validatePassword(password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();
    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(cleanUsername);

    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }

    const { hash, salt } = hashPassword(cleanPassword);
    const userId = 'USR-' + Date.now();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      cleanUsername,
      hash,
      salt,
      name.trim(),
      role || 'admin',
      new Date().toISOString()
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CRIAR_USUARIO',
      module: 'USUARIOS',
      resource_id: userId,
      description: `Criação de novo usuário '${name.trim()}' (login: ${cleanUsername}) com perfil '${role || 'admin'}'.`,
      details: { userId, username: cleanUsername, name: name.trim(), role: role || 'admin' }
    });

    return res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao cadastrar usuário:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
});

accessRouter.put('/api/users/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name, password, role } = req.body;

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    let updatedName = name ? name.trim() : user.name;
    let updatedRole = role ? role : user.role;

    if (user.username === 'jorgealvimtecnologia' || user.role === 'master') {
      updatedRole = 'master';
    }

    const passwordChanged = !!(password && password.trim().length > 0);

    if (passwordChanged) {
      const pol = validatePassword(password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
      const cleanPassword = password.trim();
      const { hash, salt } = hashPassword(cleanPassword);
      db.prepare(`
        UPDATE users
        SET name = ?, password_hash = ?, salt = ?, role = ?
        WHERE id = ?
      `).run(updatedName, hash, salt, updatedRole, id);
    } else {
      db.prepare(`
        UPDATE users 
        SET name = ?, role = ? 
        WHERE id = ?
      `).run(updatedName, updatedRole, id);
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_USUARIO',
      module: 'USUARIOS',
      resource_id: id,
      description: `Alteração do usuário ID '${id}' (${updatedName})${passwordChanged ? ' com redefinição de senha' : ''}.`,
      details: { id, name: updatedName, role: updatedRole, passwordChanged }
    });

    return res.json({ success: true, message: 'Dados do usuário atualizados com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar usuário:', error);
    return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

accessRouter.delete('/api/users/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (user.username === 'jorgealvimtecnologia' || user.role === 'master') {
      return res.status(403).json({ 
        error: 'O usuário mestre (jorgealvimtecnologia) não pode ser excluído por segurança.' 
      });
    }

    if (req.user.userId === user.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta logada.' });
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_USUARIO',
      module: 'USUARIOS',
      resource_id: id,
      description: `Exclusão definitiva do operador '${user.name}' (login: ${user.username}).`
    });

    return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir usuário:', error);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

// =============================================================================
// 🛡️ MATRIZ DE CONTROLE DE ACESSO & PERMISSÕES GRANULARES (RBAC/ABAC HÍBRIDO)
// =============================================================================

const ROLE_TEMPLATES = {
  master: {
    key: 'master',
    name: 'Dr. Jorge Alvim (Mestre / Diretor Geral)',
    badge_label: '👑 Mestre Irrestrito',
    badge_class: 'bg-amber-100 text-amber-950 border-amber-400 font-extrabold',
    data_scope: 'all',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 1,
      tab_users: 1, tab_settings: 1
    }
  },
  dono_escritorio: {
    key: 'dono_escritorio',
    name: 'Dono de Escritório / Sócio Titular',
    badge_label: '🏛️ Sócio Titular',
    badge_class: 'bg-gold-100 text-gold-950 border-gold-400 font-bold',
    data_scope: 'all',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 1,
      tab_users: 1, tab_settings: 1
    }
  },
  advogado: {
    key: 'advogado',
    name: 'Advogado(a) Associado(a)',
    badge_label: '⚖️ Advogado(a)',
    badge_class: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold',
    data_scope: 'assigned',
    tabs: {
      tab_leads: 0, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  estagiario: {
    key: 'estagiario',
    name: 'Estagiário(a) de Direito',
    badge_label: '🎓 Estagiário(a)',
    badge_class: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-semibold',
    data_scope: 'assigned',
    tabs: {
      tab_leads: 0, tab_clients: 0, tab_lawsuits: 1, tab_radar: 1,
      tab_offices: 0, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  secretaria: {
    key: 'secretaria',
    name: 'Secretária Executiva / Atendimento',
    badge_label: '💼 Secretária / Atendimento',
    badge_class: 'bg-purple-100 text-purple-900 border-purple-300 font-semibold',
    data_scope: 'office',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 0, tab_drive: 0, tab_calendar: 1, tab_publications: 0,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  gerente: {
    key: 'gerente',
    name: 'Gerente Administrativo-Financeiro',
    badge_label: '🏢 Gerência / DP',
    badge_class: 'bg-blue-100 text-blue-900 border-blue-300 font-semibold',
    data_scope: 'all',
    tabs: {
      tab_leads: 1, tab_clients: 1, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 0,
      tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 1
    }
  },
  motorista: {
    key: 'motorista',
    name: 'Motorista / Apoio Operacional',
    badge_label: '🚗 Motorista / Externo',
    badge_class: 'bg-slate-200 text-slate-800 border-slate-300 font-semibold',
    data_scope: 'assigned',
    tabs: {
      tab_leads: 0, tab_clients: 0, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 0, tab_drive: 0, tab_calendar: 1, tab_publications: 0,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 1, tab_portal_cliente: 0,
      tab_users: 0, tab_settings: 0
    }
  },
  cliente: {
    key: 'cliente',
    name: 'Cliente (PF / PJ)',
    badge_label: '👤 Cliente',
    badge_class: 'bg-teal-100 text-teal-900 border-teal-300 font-semibold',
    data_scope: 'own',
    tabs: {
      tab_leads: 0, tab_clients: 0, tab_lawsuits: 0, tab_radar: 0,
      tab_offices: 0, tab_drive: 0, tab_calendar: 0, tab_publications: 0,
      tab_hr: 0, tab_financial: 0, tab_colaborador: 0, tab_portal_cliente: 1,
      tab_users: 0, tab_settings: 0
    }
  }
};

export function syncAllAccessPermissions() {
  try {
    const now = new Date().toISOString();

    // 1. Sincronizar Usuários do Painel
    const users = db.prepare(`SELECT * FROM users`).all();
    for (const u of users) {
      const isMaster = u.id === 'USR-MASTER-01' || u.username === 'jorgealvimtecnologia' || u.name.toLowerCase().includes('jorge alvim');
      const isDraMariana = u.name.toLowerCase().includes('mariana') || u.username.includes('mariana');
      const isDraGabriela = u.name.toLowerCase().includes('gabriela') || u.username.includes('gabriela');
      
      let tplKey = isMaster ? 'master' : ((isDraMariana || isDraGabriela) ? 'dono_escritorio' : 'advogado');
      let userType = isMaster ? 'master' : 'admin';
      const tpl = ROLE_TEMPLATES[tplKey];

      const exists = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(u.id);
      if (!exists) {
        db.prepare(`
          INSERT INTO access_permissions (
            id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
            role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
            tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
            tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `PERM-${u.id}`, u.id, userType, u.name, u.username, '', '',
          tplKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
          tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
          tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
          tpl.tabs.tab_users, tpl.tabs.tab_settings, 1, tpl.data_scope, 'Usuário Painel', now, now
        );
      } else if (isMaster) {
        // Enforce God Mode para Dr. Jorge Alvim
        db.prepare(`
          UPDATE access_permissions 
          SET role_template = 'master', tab_leads = 1, tab_clients = 1, tab_lawsuits = 1, tab_radar = 1,
              tab_offices = 1, tab_drive = 1, tab_calendar = 1, tab_publications = 1, tab_hr = 1,
              tab_financial = 1, tab_colaborador = 1, tab_portal_cliente = 1, tab_users = 1, tab_settings = 1,
              is_active = 1, data_scope = 'all', updated_at = ?
          WHERE user_id = ?
        `).run(now, u.id);
      }
    }

    // 2. Sincronizar Colaboradores do RH (CLT, Estágio, Associados)
    const employees = db.prepare(`SELECT * FROM hr_employees`).all();
    for (const emp of employees) {
      const pos = (emp.position || '').toLowerCase();
      let tplKey = 'advogado';
      let userType = 'empregado';

      if (pos.includes('estagi')) {
        tplKey = 'estagiario';
        userType = 'estagiario';
      } else if (pos.includes('secret') || pos.includes('recepc')) {
        tplKey = 'secretaria';
        userType = 'secretaria';
      } else if (pos.includes('gerente') || pos.includes('financ')) {
        tplKey = 'gerente';
        userType = 'gerente';
      } else if (pos.includes('motorist') || pos.includes('externo')) {
        tplKey = 'motorista';
        userType = 'motorista';
      } else if (pos.includes('sóci') || pos.includes('socio') || pos.includes('titular')) {
        tplKey = 'dono_escritorio';
        userType = 'dono_escritorio';
      } else if (pos.includes('advog')) {
        tplKey = 'advogado';
        userType = 'advogado';
      }

      const tpl = ROLE_TEMPLATES[tplKey];
      const exists = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(emp.id);
      if (!exists) {
        db.prepare(`
          INSERT INTO access_permissions (
            id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
            role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
            tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
            tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `PERM-${emp.id}`, emp.id, userType, emp.name, emp.cpf, emp.email || '', emp.phone || '',
          tplKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
          tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
          tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
          tpl.tabs.tab_users, tpl.tabs.tab_settings, 1, tpl.data_scope, `${emp.position} (${emp.contract_type})`, now, now
        );
      }
    }

    // 3. Sincronizar Clientes Cadastrados (PF e PJ)
    const clients = db.prepare(`SELECT * FROM clients`).all();
    for (const c of clients) {
      const tpl = ROLE_TEMPLATES.cliente;
      const iden = c.client_type === 'PJ' ? (c.cnpj || c.cpf) : (c.cpf || c.cnpj);
      const exists = db.prepare(`SELECT id FROM access_permissions WHERE user_id = ?`).get(c.id);
      if (!exists) {
        db.prepare(`
          INSERT INTO access_permissions (
            id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
            role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
            tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
            tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `PERM-${c.id}`, c.id, 'cliente', c.full_name, iden || c.id, c.email || '', c.phone || '',
          'cliente', tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
          tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
          tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
          tpl.tabs.tab_users, tpl.tabs.tab_settings, 1, 'own', `Cliente ${c.client_type}`, now, now
        );
      }
    }
    console.log('🛡️ [RBAC/ABAC] Sincronização de Matriz de Controle de Acesso concluída com sucesso!');
  } catch (err) {
    console.error('Erro na sincronização de permissões de acesso:', err);
  }
}

// (sync inicial de permissões é chamado no boot pelo server.js, dentro do app.listen)

/**
 * 1. GET /api/access-control/matrix - Listar toda a matriz de permissões granulares
 */
accessRouter.get('/api/access-control/matrix', requireAuth, (req, res) => {
  try {
    syncAllAccessPermissions();

    const rows = db.prepare(`
      SELECT * FROM access_permissions 
      ORDER BY 
        CASE 
          WHEN role_template = 'master' THEN 1
          WHEN role_template = 'dono_escritorio' THEN 2
          WHEN role_template = 'advogado' THEN 3
          WHEN role_template = 'estagiario' THEN 4
          WHEN role_template = 'gerente' THEN 5
          WHEN role_template = 'secretaria' THEN 6
          WHEN role_template = 'motorista' THEN 7
          WHEN role_template = 'cliente' THEN 8
          ELSE 9
        END, user_name ASC
    `).all();

    const stats = {
      total: rows.length,
      active: rows.filter(r => r.is_active === 1).length,
      masters: rows.filter(r => r.role_template === 'master' || r.role_template === 'dono_escritorio').length,
      lawyers: rows.filter(r => r.role_template === 'advogado').length,
      interns: rows.filter(r => r.role_template === 'estagiario').length,
      staff: rows.filter(r => ['secretaria', 'gerente', 'motorista'].includes(r.role_template)).length,
      clients: rows.filter(r => r.role_template === 'cliente').length
    };

    // SEGURANÇA: a matriz não expõe senhas. Para trocar, usa-se "Redefinir senha".
    const matrix = rows.map(r => {
      const tpl = ROLE_TEMPLATES[r.role_template] || ROLE_TEMPLATES.advogado;
      return {
        ...r,
        plain_password: '',
        is_master: r.role_template === 'master' || r.user_id === 'USR-MASTER-01' || (r.user_name || '').toLowerCase().includes('jorge alvim'),
        badge_label: tpl.badge_label,
        badge_class: tpl.badge_class,
        role_name: tpl.name
      };
    });

    return res.json({
      success: true,
      stats,
      templates: ROLE_TEMPLATES,
      matrix
    });
  } catch (err) {
    console.error('[ERRO] Falha ao consultar matriz de acessos:', err);
    return res.status(500).json({ error: 'Erro ao consultar matriz de permissões.' });
  }
});

/**
 * 2. POST /api/access-control/toggle - Ligar/Desligar switch de uma aba individual
 */
accessRouter.post('/api/access-control/toggle', requireAuth, (req, res) => {
  try {
    const { user_id, tab_key, enabled } = req.body;

    if (!user_id || !tab_key) {
      return res.status(400).json({ error: 'ID do usuário e chave da aba são obrigatórios.' });
    }

    const validTabs = [
      'tab_leads', 'tab_clients', 'tab_lawsuits', 'tab_radar', 'tab_offices',
      'tab_drive', 'tab_calendar', 'tab_publications', 'tab_hr', 'tab_financial',
      'tab_colaborador', 'tab_portal_cliente', 'tab_users', 'tab_settings'
    ];

    if (!validTabs.includes(tab_key)) {
      return res.status(400).json({ error: 'Chave de aba inválida.' });
    }

    const record = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(user_id);
    if (!record) {
      return res.status(404).json({ error: 'Registro de permissão não encontrado.' });
    }

    // Regra de Ouro: Dr. Jorge Alvim / Mestre NUNCA pode ter acesso revogado (God Mode)
    const isMaster = record.role_template === 'master' || record.user_id === 'USR-MASTER-01' || (record.user_name || '').toLowerCase().includes('jorge alvim');
    if (isMaster && !enabled) {
      return res.status(403).json({
        error: '👑 Acesso Mestre Protegido: O Dr. Jorge Alvim possui acesso total permanente e irrestrito a todos os recursos.'
      });
    }

    const val = enabled ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE access_permissions 
      SET ${tab_key} = ?, role_template = 'custom', updated_at = ?
      WHERE user_id = ?
    `).run(val, now, user_id);

    logAudit(req, {
      event_type: 'ALTERACAO_PERMISSAO',
      event_name: 'TOGGLE_ABA',
      module: 'CONTROLE_ACESSO',
      resource_id: user_id,
      description: `Permissão da aba '${tab_key}' ${enabled ? 'HABILITADA' : 'DESABILITADA'} para '${record.user_name}'.`,
      details: { user_id, user_name: record.user_name, tab_key, enabled: val }
    });

    return res.json({
      success: true,
      message: `Aba ${tab_key.replace('tab_', '').toUpperCase()} ${enabled ? 'ativada' : 'desativada'} com sucesso para ${record.user_name}.`,
      tab_key,
      enabled: val
    });
  } catch (err) {
    console.error('[ERRO] Falha ao alternar permissão:', err);
    return res.status(500).json({ error: 'Erro ao alternar permissão.' });
  }
});

/**
 * 3. POST /api/access-control/apply-template - Aplicar Perfil Pronto em 1 Clique
 */
accessRouter.post('/api/access-control/apply-template', requireAuth, (req, res) => {
  try {
    const { user_id, template_key } = req.body;

    if (!user_id || !template_key || !ROLE_TEMPLATES[template_key]) {
      return res.status(400).json({ error: 'Usuário e Modelo de Perfil válido são obrigatórios.' });
    }

    const record = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(user_id);
    if (!record) {
      return res.status(404).json({ error: 'Registro de permissão não encontrado.' });
    }

    // Regra de Ouro: Dr. Jorge Alvim sempre permanece como Master
    const isMaster = record.role_template === 'master' || record.user_id === 'USR-MASTER-01' || (record.user_name || '').toLowerCase().includes('jorge alvim');
    const targetKey = isMaster ? 'master' : template_key;
    const tpl = ROLE_TEMPLATES[targetKey];
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE access_permissions 
      SET role_template = ?, tab_leads = ?, tab_clients = ?, tab_lawsuits = ?, tab_radar = ?,
          tab_offices = ?, tab_drive = ?, tab_calendar = ?, tab_publications = ?, tab_hr = ?,
          tab_financial = ?, tab_colaborador = ?, tab_portal_cliente = ?, tab_users = ?,
          tab_settings = ?, data_scope = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      targetKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
      tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
      tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
      tpl.tabs.tab_users, tpl.tabs.tab_settings, tpl.data_scope, now, user_id
    );

    logAudit(req, {
      event_type: 'ALTERACAO_PERMISSAO',
      event_name: 'APLICAR_TEMPLATE',
      module: 'CONTROLE_ACESSO',
      resource_id: user_id,
      description: `Perfil padrão '${tpl.name}' aplicado para '${record.user_name}'.`
    });

    return res.json({
      success: true,
      message: `Perfil '${tpl.name}' aplicado com sucesso para ${record.user_name}!`,
      template: tpl
    });
  } catch (err) {
    console.error('[ERRO] Falha ao aplicar template de permissões:', err);
    return res.status(500).json({ error: 'Erro ao aplicar modelo de permissão.' });
  }
});

/**
 * 4. POST /api/access-control/toggle-user-status - Ativar / Suspender Acesso Global
 */
accessRouter.post('/api/access-control/toggle-user-status', requireAuth, (req, res) => {
  try {
    const { user_id, is_active } = req.body;

    const record = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(user_id);
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    const isMaster = record.role_template === 'master' || record.user_id === 'USR-MASTER-01' || (record.user_name || '').toLowerCase().includes('jorge alvim');
    if (isMaster && !is_active) {
      return res.status(403).json({ error: '👑 O acesso do Dr. Jorge Alvim não pode ser inativado.' });
    }

    const activeVal = is_active ? 1 : 0;
    db.prepare(`UPDATE access_permissions SET is_active = ?, updated_at = ? WHERE user_id = ?`).run(activeVal, new Date().toISOString(), user_id);

    return res.json({
      success: true,
      message: `Acesso de ${record.user_name} ${is_active ? 'ATIVADO' : 'SUSPENSO'} com sucesso!`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. GET /api/access-control/my-permissions - Retorna abas permitidas da sessão ativa
 */
accessRouter.get('/api/access-control/my-permissions', (req, res) => {
  try {
    // 1. Tentar ler sessão do painel
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token || req.headers['x-access-token']);
    const session = validateToken(token);

    if (!session) {
      return res.status(401).json({ error: 'Sessão não autenticada. Faça login para acessar o sistema.' });
    }

    // 2. Checar se é Usuário Mestre (Dr. Jorge Alvim)
    const isMaster = session.userId === 'USR-MASTER-01' || session.username === 'jorgealvimtecnologia' || (session.name || '').toLowerCase().includes('jorge alvim') || session.role === 'master';
    if (isMaster) {
      return res.json({
        success: true,
        is_master: true,
        role_name: 'Dr. Jorge Alvim (Mestre)',
        permissions: ROLE_TEMPLATES.master.tabs
      });
    }

    // 3. Buscar permissões customizadas na Matriz RBAC (access_permissions)
    const perm = db.prepare(`SELECT * FROM access_permissions WHERE user_id = ?`).get(session.userId);
    if (perm) {
      // Se estiver explicitamente desativado na matriz
      if (perm.is_active === 0) {
        return res.status(403).json({ error: 'Perfil de operador desativado na Matriz de Controle de Acesso.' });
      }

      return res.json({
        success: true,
        is_master: perm.role_template === 'master',
        role_name: perm.role_template,
        permissions: {
          tab_leads: perm.tab_leads, tab_clients: perm.tab_clients, tab_lawsuits: perm.tab_lawsuits,
          tab_radar: perm.tab_radar, tab_offices: perm.tab_offices, tab_drive: perm.tab_drive,
          tab_calendar: perm.tab_calendar, tab_publications: perm.tab_publications, tab_hr: perm.tab_hr,
          tab_financial: perm.tab_financial, tab_colaborador: perm.tab_colaborador,
          tab_portal_cliente: perm.tab_portal_cliente, tab_users: perm.tab_users, tab_settings: perm.tab_settings
        }
      });
    }

    // 4. Fallback estrito ao template do cargo do usuário (session.role)
    const roleKey = session.role || 'advogado';
    const tpl = ROLE_TEMPLATES[roleKey] || ROLE_TEMPLATES.advogado;

    // Auto-registrar na matriz access_permissions para manter rastreabilidade
    try {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO access_permissions (
          id, user_id, user_type, user_name, user_identifier, user_email, user_phone,
          role_template, tab_leads, tab_clients, tab_lawsuits, tab_radar, tab_offices,
          tab_drive, tab_calendar, tab_publications, tab_hr, tab_financial, tab_colaborador,
          tab_portal_cliente, tab_users, tab_settings, is_active, data_scope, notes, created_at, updated_at
        ) VALUES (?, ?, 'admin', ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'Auto-gerado via Login RBAC', ?, ?)
      `).run(
        `PERM-${session.userId}`, session.userId, session.name || session.username, session.username,
        roleKey, tpl.tabs.tab_leads, tpl.tabs.tab_clients, tpl.tabs.tab_lawsuits, tpl.tabs.tab_radar,
        tpl.tabs.tab_offices, tpl.tabs.tab_drive, tpl.tabs.tab_calendar, tpl.tabs.tab_publications,
        tpl.tabs.tab_hr, tpl.tabs.tab_financial, tpl.tabs.tab_colaborador, tpl.tabs.tab_portal_cliente,
        tpl.tabs.tab_users, tpl.tabs.tab_settings, tpl.data_scope, now, now
      );
    } catch (e) {}

    return res.json({
      success: true,
      is_master: false,
      role_name: roleKey,
      permissions: tpl.tabs
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
