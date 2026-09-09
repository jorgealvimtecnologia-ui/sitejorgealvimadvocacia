/**
 * Política de senha — FONTE ÚNICA DA VERDADE (defesa em profundidade).
 *
 * Regra do sistema: senha de 4 a 12 caracteres. Centralizar aqui garante que
 * criação de usuário, edição, redefinição e portais do cliente/colaborador
 * apliquem exatamente a mesma regra — sem divergência entre telas.
 *
 * Observação: a senha nunca é guardada em texto puro; isto valida apenas o valor
 * digitado antes de gerar o hash PBKDF2.
 */
// SEGURANÇA: mínimo de 8 caracteres (antes 4). O teto foi elevado para 64 —
// antes o máximo de 12 BLOQUEAVA senhas/passphrases fortes; o hash PBKDF2 lida
// com qualquer tamanho, então não há razão para um teto baixo.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/**
 * Valida uma senha contra a política. Retorna { ok, error }.
 * Critério de TAMANHO (mín. 8, sem teto baixo). Seguimos a orientação moderna
 * (NIST 800-63B): priorizar comprimento e NÃO impor regras de composição
 * obrigatórias — comprimento protege mais e frustra menos o usuário.
 * @param {string} password valor bruto digitado
 */
export function validatePassword(password) {
  const p = password == null ? '' : String(password).trim();
  if (p.length < PASSWORD_MIN) {
    return { ok: false, error: `A senha deve ter no mínimo ${PASSWORD_MIN} caracteres.` };
  }
  if (p.length > PASSWORD_MAX) {
    return { ok: false, error: `A senha deve ter no máximo ${PASSWORD_MAX} caracteres.` };
  }
  return { ok: true };
}
