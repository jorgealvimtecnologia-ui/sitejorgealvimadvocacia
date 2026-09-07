/**
 * Validação de Credenciais Google (OpenID Connect / Google Identity Services)
 */

export async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;

  // 1. Suporte a Mock de Testes Automatizados (Playwright / Integração)
  if (idToken.startsWith('mock-google-token:')) {
    const parts = idToken.split(':');
    return {
      sub: parts[1] || 'google-test-id-123456',
      email: (parts[2] || 'cliente.google@teste.com').toLowerCase().trim(),
      name: parts[3] || 'Cliente Google Demonstração',
      picture: 'https://lh3.googleusercontent.com/a/default-avatar',
      email_verified: 'true'
    };
  }

  // 2. Validação Oficial através da API de Tokeninfo / Userinfo do Google
  try {
    const isAccessToken = idToken.startsWith('ya29.') || idToken.length > 50 && !idToken.includes('.');
    const url = isAccessToken
      ? `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(idToken)}`
      : `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      // Se for access token e tokeninfo falhar, tenta userinfo endpoint oficial
      if (isAccessToken) {
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: AbortSignal.timeout(6000)
        });
        if (userinfoRes.ok) {
          const uData = await userinfoRes.json();
          if (uData && uData.email && uData.sub) {
            return {
              sub: uData.sub,
              email: String(uData.email).toLowerCase().trim(),
              name: uData.name || uData.given_name || 'Usuário Google',
              picture: uData.picture || '',
              email_verified: Boolean(uData.email_verified)
            };
          }
        }
      }
      return null;
    }
    const data = await res.json();
    if (!data.email || !data.sub) return null;
    return {
      sub: data.sub,
      email: String(data.email).toLowerCase().trim(),
      name: data.name || data.given_name || 'Usuário Google',
      picture: data.picture || '',
      email_verified: data.email_verified === 'true' || data.email_verified === true || data.verified_email === true
    };
  } catch (err) {
    console.warn('[GOOGLE AUTH] Falha na comunicação com o endpoint Google:', err.message);
    return null;
  }
}
