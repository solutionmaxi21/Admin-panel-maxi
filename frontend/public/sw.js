/**
 * Custom Service Worker for offline support
 * Handles document fallback and caching strategies
 */

const CACHE_NAME = 'offline-cache-v3';
const OFFLINE_PAGE = '/offline.html';

// Install event - cache the offline page
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v3...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching offline page:', OFFLINE_PAGE);
      return cache.add(OFFLINE_PAGE);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - handle offline requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle navigation requests (document fetches)
  // IMPORTANT: Do NOT cache HTML to avoid serving stale UI after hard refresh.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => {
          // Network failed - serve offline page
          console.log('[SW] Navigation failed, serving offline page:', request.url);
          return caches.match(OFFLINE_PAGE).then((response) => {
            return response || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // Handle static asset requests (CSS, JS, fonts, etc.)
  if (
    request.url.includes('/_next/static/') ||
    request.url.includes('/fonts/') ||
    request.url.includes('/styles/')
  ) {
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }
            const cacheCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cacheCopy);
            });
            return response;
          })
          .catch(() => {
            // Return placeholder for failed static assets
            console.log('[SW] Static asset failed:', request.url);
            return new Response('Not available offline', { status: 503 });
          });
      })
    );
    return;
  }

  // Handle API requests - Network only (never serve stale API data)
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          console.log('[SW] API request failed (offline):', request.url);
          return new Response(
            JSON.stringify({ error: 'Offline - request queued for sync' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // [NEW] Do NOT cache dynamic pages in the fallback handler
  // This ensures they are always fetched from network (or fail if offline)
  // We want the user to see the offline page if network fails, NOT stale content
  const isDynamicPage =
    request.url.includes('/store') ||
    request.url.includes('/cart') ||
    request.url.includes('/checkout') ||
    request.url.includes('/account') ||
    request.url.includes('/login') ||
    request.url.includes('/register');

  if (isDynamicPage && request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_PAGE);
      })
    );
    return;
  }

  // Default: Network First for everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const cacheCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, cacheCopy);
        });
        return response;
      })
      .catch(() => {
        console.log('[SW] Request failed (offline):', request.url);
        // For image requests, return a placeholder
        if (request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="14" fill="#999">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
        return new Response('Not available offline', { status: 503 });
      })
  );
});
