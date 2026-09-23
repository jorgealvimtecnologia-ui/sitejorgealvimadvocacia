/**
 * Links para arquivos protegidos (/storage/clients e /storage/office_drive).
 * O servidor exige login para esses arquivos; como um <a href> não envia o cabeçalho
 * Authorization, este script acrescenta ?token=<sessão> no momento do clique.
 */
(function () {
  var PROTECTED = /^\/storage\/(clients|office_drive)\//;
  var TOKEN_KEYS = ['ja_admin_token', 'jorgealvim_client_token'];

  function currentToken() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      try {
        var t = localStorage.getItem(TOKEN_KEYS[i]) || sessionStorage.getItem(TOKEN_KEYS[i]);
        if (t) return t;
      } catch (e) { /* storage bloqueado */ }
    }
    return null;
  }

  function withToken(href) {
    var token = currentToken();
    if (!token) return href;
    var url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin || !PROTECTED.test(url.pathname)) return href;
    url.searchParams.set('token', token);
    return url.pathname + url.search + url.hash;
  }

  function onActivate(ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var raw = a.getAttribute('href') || '';
    if (!PROTECTED.test(raw.split('?')[0].replace(window.location.origin, ''))) return;
    a.setAttribute('href', withToken(raw));
  }

  document.addEventListener('click', onActivate, true);
  document.addEventListener('auxclick', onActivate, true);

  // Para aberturas via JS: window.JAStorageUrl('/storage/clients/...')
  window.JAStorageUrl = withToken;
})();
