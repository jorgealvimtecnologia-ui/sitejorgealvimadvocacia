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
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 12;

/**
 * Valida uma senha contra a política. Retorna { ok, error }.
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
