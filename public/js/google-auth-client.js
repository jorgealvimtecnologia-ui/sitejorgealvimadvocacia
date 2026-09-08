/**
 * Google Identity Services (GIS) - Conector de Alta Performance & Resiliência
 * Jorge Alvim Advocacia
 * 
 * Resolve condições de corrida, atrasos no carregamento da biblioteca,
 * bloqueio de popups pelo navegador e supressão de One-Tap pelo Chrome FedCM.
 */
(function(window) {
  'use strict';

  const DEFAULT_CLIENT_ID = '285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com';
  let _clientId = null;
  let _clientIdPromise = null;
  let _tokenClient = null;
  let _isReady = false;
  const _readyListeners = [];

  function fetchClientId() {
    if (_clientIdPromise) return _clientIdPromise;
    _clientIdPromise = fetch('/api/auth/google-config')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.clientId && typeof data.clientId === 'string' && data.clientId.trim()) {
          _clientId = data.clientId.trim();
        } else {
          _clientId = DEFAULT_CLIENT_ID;
        }
        return _clientId;
      })
      .catch(() => {
        _clientId = DEFAULT_CLIENT_ID;
        return _clientId;
      });
    return _clientIdPromise;
  }

  // Inicia busca antecipada do client ID
  fetchClientId();

  function isGsiLibraryAvailable() {
    return Boolean(window.google && window.google.accounts && window.google.accounts.oauth2);
  }

  function setupClients(clientId) {
    if (!isGsiLibraryAvailable() || !clientId) return false;

    // 1. Inicializa Google Identity Services ID
    if (window.google.accounts.id && !window.__jaGsiIdInitialized) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: () => {},
          auto_select: false,
          cancel_on_tap_outside: true
        });
        try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
        window.__jaGsiIdInitialized = true;
      } catch (err) {
        console.warn('[GOOGLE GSI] Falha ao inicializar id:', err);
      }
    }

    // 2. Inicializa Google Token Client para Popup
    if (window.google.accounts.oauth2 && !_tokenClient) {
      try {
        _tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'email profile openid',
          callback: (tokenRes) => {
            if (window.__jaCurrentGoogleAuthSuccess) {
              window.__jaCurrentGoogleAuthSuccess(tokenRes);
            }
          },
          error_callback: (errRes) => {
            if (window.__jaCurrentGoogleAuthError) {
              window.__jaCurrentGoogleAuthError(errRes);
            }
          }
        });
        _isReady = true;
        _readyListeners.forEach(fn => { try { fn(_tokenClient); } catch(e) {} });
        _readyListeners.length = 0;
        return true;
      } catch (err) {
        console.warn('[GOOGLE GSI] Falha ao criar tokenClient:', err);
      }
    }
    return Boolean(_tokenClient);
  }

  function checkAndInitialize() {
    if (_isReady) return true;
    if (isGsiLibraryAvailable()) {
      if (_clientId) {
        return setupClients(_clientId);
      } else {
        fetchClientId().then(cid => setupClients(cid));
      }
    }
    return false;
  }

  // Polling e escutas automáticas para inicialização mais rápida possível
  window.__onGoogleGsiLoaded = function() {
    checkAndInitialize();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndInitialize);
  } else {
    checkAndInitialize();
  }

  // Polling a cada 40ms por até 4 segundos para garantir inicialização logo que o script chegar
  let attempts = 0;
  const pollTimer = setInterval(() => {
    attempts++;
    if (checkAndInitialize() || attempts > 100) {
      clearInterval(pollTimer);
    }
  }, 40);

  const GoogleAuthClient = {
    isReady: () => _isReady && isGsiLibraryAvailable(),

    onReady: (fn) => {
      if (_isReady && isGsiLibraryAvailable()) {
        fn(_tokenClient);
      } else {
        _readyListeners.push(fn);
      }
    },

    /**
     * Dispara autenticação imediata e protegida contra popup blocker
     * @param {Object} options 
     * @param {string} [options.buttonId] ID do botão para feedback visual
     * @param {string} [options.prompt] 'select_account' para abertura imediata da lista de contas
     * @param {Function} options.onSuccess ({ access_token, credential })
     * @param {Function} options.onError (error)
     */
    triggerAuth: function(options) {
      options = options || {};
      const promptMode = options.prompt || 'select_account';
      const btn = options.buttonId ? document.getElementById(options.buttonId) : null;
      let originalContent = '';
      let isCompleted = false;

      if (btn) {
        originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.style.opacity = '0.85';
        btn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-700 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Abrindo Google Accounts...</span>
        `;
      }

      function restoreButton() {
        if (btn && originalContent && !isCompleted) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerHTML = originalContent;
        }
      }

      const safetyTimer = setTimeout(() => {
        restoreButton();
      }, 45000);

      window.__jaCurrentGoogleAuthSuccess = async function(tokenRes) {
        clearTimeout(safetyTimer);
        isCompleted = true;
        restoreButton();
        if (tokenRes && tokenRes.access_token) {
          if (options.onSuccess) {
            await options.onSuccess({ access_token: tokenRes.access_token });
          }
        } else {
          if (options.onError) options.onError(tokenRes || { error: 'cancelled' });
        }
      };

      window.__jaCurrentGoogleAuthError = function(errRes) {
        clearTimeout(safetyTimer);
        restoreButton();
        if (options.onError) options.onError(errRes || { error: 'cancelled' });
      };

      // 1. SE JÁ ESTÁ PRONTO: Disparo síncrono IMEDIATO (Preserva User Activation / sem bloqueio de popup)
      if (_isReady && _tokenClient) {
        try {
          _tokenClient.requestAccessToken({ prompt: promptMode });
          return;
        } catch (err) {
          console.warn('[GOOGLE GSI] Falha no disparo síncrono, tentando re-inicializar:', err);
        }
      }

      // 2. SE NÃO ESTAVA PRONTO: Tenta inicializar com tolerância de até 3 segundos
      const checkDeadline = Date.now() + 3200;
      const waitInterval = setInterval(() => {
        checkAndInitialize();
        if (_isReady && _tokenClient) {
          clearInterval(waitInterval);
          try {
            _tokenClient.requestAccessToken({ prompt: promptMode });
          } catch (err) {
            clearTimeout(safetyTimer);
            restoreButton();
            if (options.onError) options.onError(err);
          }
        } else if (Date.now() > checkDeadline) {
          clearInterval(waitInterval);
          clearTimeout(safetyTimer);
          restoreButton();
          const err = new Error('GOOGLE_BLOCKED_OR_UNAVAILABLE');
          if (options.onError) {
            options.onError(err);
          } else {
            alert('Não foi possível carregar a janela do Google. Se estiver usando bloqueador de anúncios (ex: AdBlock, Brave Shields) ou conexão restrita, permita o site ou faça login com seu CPF/Usuário e Senha.');
          }
        }
      }, 50);
    }
  };

  window.GoogleAuthClient = GoogleAuthClient;
})(window);
