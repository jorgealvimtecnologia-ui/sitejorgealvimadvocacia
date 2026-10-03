/**
 * Política de senha — FONTE ÚNICA DA VERDADE (defesa em profundidade).
 *
 * Regra do sistema: senha de 10 a 64 caracteres. Centralizar aqui garante que
 * criação de usuário, edição, redefinição e portais do cliente/colaborador
 * apliquem exatamente a mesma regra — sem divergência entre telas. Os campos
 * dos formulários (minlength/maxlength e textos de ajuda) devem refletir estes
 * mesmos valores; tests/security-hardening.test.js confere isso.
 *
 * Observação: a senha nunca é guardada em texto puro; isto valida apenas o valor
 * digitado antes de gerar o hash PBKDF2.
 */
// SEGURANÇA: mínimo de 10 caracteres (antes 8 e, originalmente, 4). O teto de 64
// permite frases longas (passphrases); o hash PBKDF2 lida com qualquer tamanho,
// então não há razão para um teto baixo.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 64;

/** Texto curto de ajuda para telas e mensagens ("De 10 a 64 caracteres"). */
export const PASSWORD_HINT = `De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres`;

/**
 * Valida uma senha contra a política. Retorna { ok, error }.
 * Critério de TAMANHO (mín. 10, sem teto baixo). Seguimos a orientação moderna
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

/**
 * Aviso para quem entra com uma senha criada antes da política atual.
 * NÃO bloqueia o login (senhas antigas continuam valendo): apenas orienta a
 * trocar. Só pode ser chamado no momento do login, quando a senha em texto
 * puro está disponível — o banco guarda apenas o hash.
 * @param {string} password senha digitada no login (já autenticada)
 * @returns {{password_policy_outdated?: true, password_policy_message?: string}}
 */
export function outdatedPasswordNotice(password) {
  if (validatePassword(password).ok) return {};
  return {
    password_policy_outdated: true,
    password_policy_message: `Sua senha atual é antiga e não atende à política de segurança (${PASSWORD_HINT.toLowerCase()}). Você continua entrando normalmente, mas troque-a em breve.`
  };
}
