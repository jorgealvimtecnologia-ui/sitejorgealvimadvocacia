/**
 * Vínculo ENTRE pessoas (operador do painel <-> colaborador do RH) — sempre EXATO.
 *
 * Antes o sistema casava por PEDAÇO do nome (LIKE '%ana%'): a operadora "Ana" recebia a sessão de
 * colaborador da "Mariana Souza Lima" e lia os dados de RH dela. Agora só vincula quando:
 *   1. o id é o mesmo; ou
 *   2. o nome completo é IGUAL (sem acento, caixa, espaços duplicados e sem título "Dr./Dra./Sr./Sra./Prof."); e
 *   3. existe EXATAMENTE UMA pessoa assim (homônimos não vinculam: o mestre resolve).
 */
const TITLES = /^(dr|dra|doutor|doutora|sr|sra|prof|profa|adv|advogado|advogada)\.?\s+/;

export function normalizeName(s) {
  let n = String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  while (TITLES.test(n)) n = n.replace(TITLES, '');
  return n;
}

const compact = (s) => normalizeName(s).replace(/\s+/g, '');

function uniqueOrNull(list) {
  return list.length === 1 ? list[0] : null;
}

/** Colaborador do RH que é a MESMA pessoa do operador `user` (ou null). */
export function findEmployeeForUser(db, user) {
  if (!user) return null;
  const byId = user.id ? db.prepare('SELECT * FROM hr_employees WHERE id = ?').get(user.id) : null;
  if (byId) return byId;
  const nm = normalizeName(user.name);
  if (!nm) return null;
  return uniqueOrNull(db.prepare('SELECT * FROM hr_employees').all().filter((e) => normalizeName(e.name) === nm));
}

/** Operador do painel que é a MESMA pessoa do colaborador `employee` (ou null). */
export function findUserForEmployee(db, employee) {
  if (!employee) return null;
  const byId = employee.id ? db.prepare('SELECT * FROM users WHERE id = ?').get(employee.id) : null;
  if (byId) return byId;
  const nm = normalizeName(employee.name);
  if (!nm) return null;
  return uniqueOrNull(db.prepare('SELECT * FROM users').all().filter((u) => normalizeName(u.name) === nm));
}

/** Colaborador identificado pelo que a pessoa digitou no login: id, nome COMPLETO igual (com ou sem espaços). */
export function findEmployeeByTypedName(db, typed) {
  const raw = String(typed || '').trim();
  if (!raw) return null;
  const byId = db.prepare('SELECT * FROM hr_employees WHERE id = ?').get(raw);
  if (byId) return byId;
  const nm = normalizeName(raw);
  const cp = compact(raw);
  if (nm.length < 3) return null;
  return uniqueOrNull(db.prepare('SELECT * FROM hr_employees').all().filter((e) => normalizeName(e.name) === nm || compact(e.name) === cp));
}
