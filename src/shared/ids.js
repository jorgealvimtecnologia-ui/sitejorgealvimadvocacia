/**
 * Geradores de identificadores de domínio (compartilhados).
 */
import { db } from '../config/db.js';

// Gerador de ID para Leads do Formulário do Site: JA-2026-0001
export function generateNextClientId() {
  const currentYear = new Date().getFullYear();
  const prefix = `JA-${currentYear}-`;

  const records = db.prepare(`SELECT id FROM leads`).all();
  let maxNum = 0;
  if (records && records.length > 0) {
    records.forEach((r) => {
      const match = (r.id || '').match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  const checkStmt = db.prepare(`SELECT id FROM leads WHERE id = ?`);
  while (checkStmt.get(candidate)) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

// Gerador de ID para Processos Judiciais: PROC-2026-0001
export function generateNextLawsuitId() {
  const currentYear = new Date().getFullYear();
  const prefix = `PROC-${currentYear}-`;

  const records = db.prepare(`SELECT id FROM lawsuits WHERE id LIKE ?`).all(`${prefix}%`);
  if (!records || records.length === 0) {
    return `${prefix}0001`;
  }

  const maxNum = records.reduce((max, r) => {
    const numPart = parseInt(r.id.replace(prefix, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);

  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}
