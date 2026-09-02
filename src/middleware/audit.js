import { db } from '../config/db.js';
import { getClientIp } from '../config/constants.js';

// Helper Centralizado de Auditoria e Trilha de Histórico Geral (Compliance, LGPD e Segurança)
export function logAudit(req, {
  event_type = 'ALTERACAO',
  event_name,
  module,
  resource_id = null,
  user_cpf = null,
  user_name = null,
  user_role = null,
  description,
  details = null
}) {
  try {
    const cleanIp = getClientIp(req);
    const userAgent = req ? (req.headers['user-agent'] || 'Desconhecido') : 'Sistema Local';

    let finalName = user_name;
    let finalCpf = user_cpf;
    let finalRole = user_role;

    if (!finalName && req) {
      if (req.user) {
        finalName = req.user.name || req.user.username;
        finalRole = req.user.role || 'admin';
        finalCpf = req.user.cpf || (req.user.username === 'jorgealvimtecnologia' ? '000.000.000-00' : null);
      } else if (req.client) {
        finalName = req.client.name || req.client.fullName;
        finalRole = 'client';
        finalCpf = req.client.cpf || req.client.cnpj || null;
      } else if (req.employee) {
        finalName = req.employee.name || req.employee.fullName;
        finalRole = 'employee';
        finalCpf = req.employee.cpf || null;
      }
    }

    if (!finalName) {
      finalName = 'Sistema Automático';
      finalRole = 'sistema';
    }

    const detailsJson = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO audit_logs (
        event_type, event_name, module, resource_id, user_cpf, user_name,
        user_role, ip_address, user_agent, description, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event_type,
      event_name,
      module,
      resource_id ? String(resource_id) : null,
      finalCpf || null,
      finalName,
      finalRole || 'admin',
      cleanIp,
      userAgent.substring(0, 255),
      description,
      detailsJson,
      now
    );
  } catch (err) {
    console.error('[AUDITORIA] Falha ao registrar log de auditoria:', err);
  }
}
