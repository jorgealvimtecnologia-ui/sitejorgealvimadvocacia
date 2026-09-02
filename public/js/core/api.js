// Helper Central de Comunicação API e Autenticação
const TOKEN_KEY = 'ja_admin_token';
const USER_KEY = 'ja_admin_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getAuthHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

async function apiFetch(url, options = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
  };

  // Se o body for FormData, não envie Content-Type application/json
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    console.warn('[API] Sessão expirada ou não autorizada. Redirecionando para login.');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (typeof showLoginScreen === 'function') {
      showLoginScreen();
    }
  }

  return response;
}
