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

  // 2. Validação Oficial através da API de Tokeninfo do Google
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.email || !data.sub) return null;
    return {
      sub: data.sub,
      email: String(data.email).toLowerCase().trim(),
      name: data.name || data.given_name || 'Usuário Google',
      picture: data.picture || '',
      email_verified: data.email_verified === 'true' || data.email_verified === true
    };
  } catch (err) {
    console.warn('[GOOGLE AUTH] Falha na comunicação com o endpoint Google:', err.message);
    return null;
  }
}
