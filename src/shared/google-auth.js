/**
 * Validação de Credenciais Google (OpenID Connect / Google Identity Services)
 *
 * SEGURANÇA — o que esta função garante a quem a chama (os 4 logins Google do sistema:
 * painel, unificado, colaborador e portal do cliente):
 *  1. O token é validado COM O GOOGLE (tokeninfo); nada é aceito só pelo formato.
 *  2. O token foi emitido PARA ESTE SISTEMA (`aud` = nosso Client ID). Sem isso, um token
 *     do Google emitido para OUTRO aplicativo seria aceito aqui (ataque de "deputado confuso").
 *  3. O emissor (`iss`) é o Google e o e-mail está VERIFICADO (`email_verified`).
 *  4. O "token de teste" (mock-google-token:…) NÃO existe em produção: só é aceito com
 *     NODE_ENV=test, ou fora de produção com ALLOW_MOCK_GOOGLE_TOKEN=1. Antes ele era
 *     aceito em qualquer ambiente e permitia entrar como MESTRE sem conta Google nenhuma.
 */

// Mesmo valor que /api/auth/google-config entrega ao navegador quando GOOGLE_CLIENT_ID não está definido.
export const DEFAULT_GOOGLE_CLIENT_ID = '285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** Client IDs aceitos como destinatário do token (`aud`). */
export function allowedAudiences(env = process.env) {
  const extra = String(env.GOOGLE_ALLOWED_AUDIENCES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([String(env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim(), ...extra]);
}

/** O token de teste só vale em teste (ou, fora de produção, com liberação explícita). */
export function mockTokensAllowed(env = process.env) {
  if (env.NODE_ENV === 'production') return false;
  return env.NODE_ENV === 'test' || env.ALLOW_MOCK_GOOGLE_TOKEN === '1';
}

const isTrue = (v) => v === true || v === 'true';

/**
 * @param {string} idToken id_token (JWT) ou access_token do Google
 * @param {{ env?: object, fetchImpl?: typeof fetch }} [opts] injeção para testes
 * @returns {Promise<{sub:string,email:string,name:string,picture:string,email_verified:boolean}|null>}
 */
export async function verifyGoogleToken(idToken, { env = process.env, fetchImpl = fetch } = {}) {
  if (!idToken || typeof idToken !== 'string') return null;

  // 1. Token de teste (Playwright / integração): NUNCA em produção.
  if (idToken.startsWith('mock-google-token:')) {
    if (!mockTokensAllowed(env)) {
      console.warn(
        '[GOOGLE AUTH] Token de teste recusado: ele só vale em NODE_ENV=test (ou ALLOW_MOCK_GOOGLE_TOKEN=1 fora de produção).'
      );
      return null;
    }
    const parts = idToken.split(':');
    return {
      sub: parts[1] || 'google-test-id-123456',
      email: (parts[2] || 'cliente.google@teste.com').toLowerCase().trim(),
      name: parts[3] || 'Cliente Google Demonstração',
      picture: 'https://lh3.googleusercontent.com/a/default-avatar',
      email_verified: true,
    };
  }

  // 2. Validação oficial pelo endpoint tokeninfo do Google.
  try {
    const isAccessToken = idToken.startsWith('ya29.') || (idToken.length > 50 && !idToken.includes('.'));
    const url = isAccessToken
      ? `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(idToken)}`
      : `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    // Sem alternativa por /userinfo: ela não informa o `aud`, então não dá para provar que o
    // token foi emitido para este sistema.
    if (!res.ok) return null;
    const data = await res.json();

    const sub = data.sub || data.user_id;
    if (!data.email || !sub) return null;

    if (!allowedAudiences(env).has(String(data.aud || ''))) {
      console.warn('[GOOGLE AUTH] Token recusado: emitido para outro aplicativo (aud não confere).');
      return null;
    }
    if (data.iss && !GOOGLE_ISSUERS.has(String(data.iss))) {
      console.warn('[GOOGLE AUTH] Token recusado: emissor inesperado.');
      return null;
    }
    if (!isTrue(data.email_verified) && data.verified_email !== true) {
      console.warn('[GOOGLE AUTH] Token recusado: e-mail da conta Google não verificado.');
      return null;
    }
    return {
      sub: String(sub),
      email: String(data.email).toLowerCase().trim(),
      name: data.name || data.given_name || 'Usuário Google',
      picture: data.picture || '',
      email_verified: true,
    };
  } catch (err) {
    console.warn('[GOOGLE AUTH] Falha na comunicação com o endpoint Google:', err.message);
    return null;
  }
}
