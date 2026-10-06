/**
 * ESCOPO DE DADOS (AUD-27 Parte 2) — "quem vê o quê DENTRO de uma aba permitida".
 *
 * O RBAC (rbac.js) decide QUAIS ABAS a função abre. Este módulo decide, dentro da aba de
 * Processos, QUAIS REGISTROS a pessoa vê, conforme o `data_scope` da matriz (access_permissions):
 *   - all / office  → vê todos os processos do escritório;
 *   - assigned / own → vê só os processos em seu nome (responsible_user_id = ela) MAIS os
 *                      processos SEM responsável (pool do escritório), para não esconder o que
 *                      já existe. À medida que o mestre/sócio atribui um responsável, o processo
 *                      deixa de ser pool e passa a ser privado daquele advogado.
 *
 * Módulo puro em relação a efeitos (só lê o banco para descobrir o data_scope).
 */
import { db } from '../config/db.js';

/** Sessão do Usuário Mestre (mesma regra do rbac.js, reescrita aqui para não acoplar módulos). */
function ehMestre(s) {
  return !!s && (s.userId === 'USR-MASTER-01' || s.username === 'jorgealvimtecnologia' || s.role === 'master');
}

/** data_scope da sessão: 'all' | 'office' | 'assigned' | 'own'. Mestre = 'all'. Padrão conservador = 'assigned'. */
export function dataScopeOf(session) {
  if (!session) return 'assigned';
  if (ehMestre(session)) return 'all';
  try {
    const row = db.prepare(`SELECT data_scope FROM access_permissions WHERE user_id = ?`).get(session.userId);
    return (row && row.data_scope) || 'assigned';
  } catch {
    return 'assigned';
  }
}

/** True se o escopo limita a visão aos processos do próprio responsável (+ pool sem dono). */
export function limitaAoResponsavel(scope) {
  return scope === 'assigned' || scope === 'own';
}

/** Pode atribuir/mudar o responsável de um processo? (quem tem visão total do escritório). */
export function podeAtribuirResponsavel(session) {
  return ehMestre(session) || dataScopeOf(session) === 'all';
}

/**
 * Um processo é visível para a sessão?
 * Regra central reutilizável em listar/abrir/editar/excluir/lançar andamento.
 */
export function processoVisivel(session, lawsuit) {
  if (!lawsuit) return false;
  if (!limitaAoResponsavel(dataScopeOf(session))) return true; // all/office: vê tudo
  const dono = lawsuit.responsible_user_id;
  return !dono || dono === session.userId; // sem dono = pool; com dono = só o dono
}

/**
 * Responsável a gravar ao CRIAR um processo:
 *  - se quem cria pode atribuir (mestre/sócio) e informou um responsável, usa o informado;
 *  - senão, se o escopo de quem cria é restrito (advogado/estagiário), o dono é ele mesmo;
 *  - senão, fica SEM dono (pool do escritório).
 * @returns {{id: string|null, name: string|null}}
 */
export function responsavelAoCriar(session, informadoUserId) {
  if (podeAtribuirResponsavel(session) && informadoUserId) {
    return { id: informadoUserId, name: nomeDoResponsavel(informadoUserId) };
  }
  if (limitaAoResponsavel(dataScopeOf(session))) {
    return { id: session.userId, name: session.name || null };
  }
  return { id: null, name: null };
}

/** Nome para exibição de um responsável, a partir do id do usuário (users ou access_permissions). */
export function nomeDoResponsavel(userId) {
  if (!userId) return null;
  try {
    const u = db.prepare(`SELECT name FROM users WHERE id = ?`).get(userId);
    if (u && u.name) return u.name;
    const p = db.prepare(`SELECT user_name FROM access_permissions WHERE user_id = ?`).get(userId);
    if (p && p.user_name) return p.user_name;
  } catch { /* ignora */ }
  return null;
}
