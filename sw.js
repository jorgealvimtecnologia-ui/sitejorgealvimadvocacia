// Service Worker PWA - Jorge Alvim Advocacia & Tecnologia
const CACHE_NAME = 'jorgealvim-pwa-v2';

self.addEventListener('install', (event) => {
  // Força o Service Worker novo a assumir o controle imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Limpa todos os caches antigos imediatamente ao ativar
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora chamadas dinâmicas à API ou métodos POST/PUT/DELETE
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // Estratégia Network-First: Sempre busca a versão mais recente do servidor
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se a resposta for válida, atualiza o cache para eventual uso offline
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Se falhar a rede (offline), usa o cache armazenado
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
