// Módulo Core: Autenticação, Sessão e Telas de Acesso

function showLoginScreen() {
  const loginView = document.getElementById('login-view');
  const panelView = document.getElementById('panel-view');
  if (loginView) loginView.classList.remove('hidden');
  if (panelView) panelView.classList.add('hidden');
}

function showPanelScreen(user) {
  const loginView = document.getElementById('login-view');
  const panelView = document.getElementById('panel-view');
  if (loginView) loginView.classList.add('hidden');
  if (panelView) panelView.classList.remove('hidden');

  const name = user ? user.name || user.username : 'Administrador';
  const uDisplay = document.getElementById('current-user-display');
  if (uDisplay) uDisplay.textContent = name;
  const uMobileDisplay = document.getElementById('current-user-display-mobile');
  if (uMobileDisplay) uMobileDisplay.textContent = name;

  if (typeof handleHashRouting === 'function') {
    handleHashRouting();
  } else if (typeof switchTab === 'function') {
    switchTab('leads');
  }
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      showPanelScreen(data.user);
      
      // Carregamentos secundários não bloqueantes
      try { if (typeof loadClients === 'function') loadClients(); } catch(e){}
      try { if (typeof loadLawsuits === 'function') loadLawsuits(); } catch(e){}
      try { if (typeof loadOffices === 'function') loadOffices(); } catch(e){}
      try { if (typeof loadDriveFiles === 'function') loadDriveFiles(); } catch(e){}
      try { if (typeof loadCalendarSummary === 'function') loadCalendarSummary(); } catch(e){}
      try { if (typeof loadPublicationsStats === 'function') loadPublicationsStats(); } catch(e){}
      try { if (typeof loadHrDashboard === 'function') loadHrDashboard(); } catch(e){}
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      showLoginScreen();
    }
  } catch (err) {
    showLoginScreen();
  }
}

async function handleLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const username = usernameInput ? usernameInput.value : '';
  const password = passwordInput ? passwordInput.value : '';
  const errorMsg = document.getElementById('login-error-msg');
  const errorText = document.getElementById('login-error-text');

  if (errorMsg) errorMsg.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      showPanelScreen(data.user);

      // Carregamentos secundários
      try { if (typeof loadClients === 'function') loadClients(); } catch(e){}
      try { if (typeof loadLawsuits === 'function') loadLawsuits(); } catch(e){}
      try { if (typeof loadOffices === 'function') loadOffices(); } catch(e){}
      try { if (typeof loadDriveFiles === 'function') loadDriveFiles(); } catch(e){}
      try { if (typeof loadCalendarSummary === 'function') loadCalendarSummary(); } catch(e){}
      try { if (typeof loadPublicationsStats === 'function') loadPublicationsStats(); } catch(e){}
      try { if (typeof loadHrDashboard === 'function') loadHrDashboard(); } catch(e){}
    } else {
      if (errorText) errorText.textContent = data.error || 'Credenciais inválidas.';
      if (errorMsg) errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    if (errorText) errorText.textContent = 'Erro ao comunicar com o servidor.';
    if (errorMsg) errorMsg.classList.remove('hidden');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (err) {
    console.error('Erro ao deslogar:', err);
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.hash = '';
    showLoginScreen();
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

document.addEventListener('DOMContentLoaded', checkAuth);
