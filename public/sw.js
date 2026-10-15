// RadioSync Fútbol Service Worker - Version 3
const CACHE_NAME = 'radiosync-cache-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Borrar todas las cachés antiguas para que nunca se queden datos obsoletos
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purgando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Los streams de audio en vivo nunca deben pasar por caché
  if (
    url.includes('.mp3') ||
    url.includes('.aac') ||
    url.includes('.m3u8') ||
    url.includes('.ts') ||
    url.includes('/api/livestream') ||
    event.request.destination === 'audio'
  ) {
    return;
  }

  // ESTRATEGIA NETWORK-FIRST:
  // Siempre pide la versión más reciente al servidor primero.
  // Si no hay internet (offline), entonces usa la caché.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
