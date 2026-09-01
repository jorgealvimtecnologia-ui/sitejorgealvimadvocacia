// Service Worker PWA - Jorge Alvim Advocacia & Tecnologia
const CACHE_NAME = 'jorgealvim-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/painel',
  '/painel.html',
  '/cliente',
  '/cliente.html',
  '/colaborador',
  '/colaborador.html',
  '/blog',
  '/blog.html',
  '/public/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => console.warn('[PWA] Cache parcial:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignora chamadas dinâmicas à API para garantir dados frescos em tempo real
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
