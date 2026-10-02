/**
 * Módulo de Integração com Google reCAPTCHA v3 (Anti-Abuso Invisível).
 *
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Diretrizes:
 * - Totalmente invisível ao usuário legítimo (baseado em pontuação 0.0 a 1.0).
 * - Se RECAPTCHA_SECRET_KEY não for configurada no .env, opera em modo bypass
 *   seguro para não travar ambiente local de desenvolvimento ou testes automatizados.
 * - Em caso de falha transitória de rede com a API do Google, aplica fail-open
 *   com aviso em log para não penalizar clientes legítimos que tentam contato.
 */

export async function verifyRecaptcha(token, { action, remoteip } = {}) {
  const secret = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
  const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');

  // Modo seguro de desenvolvimento / testes locais
  if (!secret) {
    return {
      success: true,
      bypassed: true,
      score: 1.0,
      reason: 'no_secret_configured'
    };
  }

  // Token ausente quando a proteção está ativa
  if (!token || typeof token !== 'string') {
    return {
      success: false,
      score: 0.0,
      reason: 'missing_token'
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteip) {
      params.append('remoteip', remoteip);
    }

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      console.warn(`[RECAPTCHA v3] Erro HTTP retornado pela API Google: ${response.status}`);
      return { success: true, bypassed: true, reason: 'google_api_http_error' };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        score: data.score || 0,
        errors: data['error-codes'] || [],
        reason: 'verification_failed'
      };
    }

    // Validação de pontuação mínima contra bots automatizados
    if (typeof data.score === 'number' && data.score < minScore) {
      return {
        success: false,
        score: data.score,
        action: data.action,
        reason: 'score_too_low'
      };
    }

    // Se uma ação esperada foi informada, valida conformidade de contexto
    if (action && data.action && data.action !== action) {
      return {
        success: false,
        score: data.score,
        action: data.action,
        reason: 'action_mismatch'
      };
    }

    return {
      success: true,
      score: data.score,
      action: data.action,
      hostname: data.hostname
    };
  } catch (err) {
    console.warn('[RECAPTCHA v3] Exceção ao consultar API do Google:', err.message);
    return {
      success: true,
      bypassed: true,
      reason: 'network_exception'
    };
  }
}
