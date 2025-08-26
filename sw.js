// CMS Service Worker for Ultra-Fast Performance
const CACHE_NAME = 'cms-v1';
const CRITICAL_RESOURCES = [
  '/',
  '/sys-dashboard.css',
  '/sys-modules.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache critical resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CRITICAL_RESOURCES))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => 
      Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network and cache for next time
        return fetch(event.request)
          .then(response => {
            // Don't cache failed responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Cache static assets and pages
            const responseToCache = response.clone();
            const url = new URL(event.request.url);
            
            if (url.pathname.endsWith('.css') || 
                url.pathname.endsWith('.js') || 
                url.pathname.includes('/dashboard') ||
                url.pathname.match(/^\/(menus|articles|system-layouts|systemforms)/)) {
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            
            return response;
          });
      })
  );
});








