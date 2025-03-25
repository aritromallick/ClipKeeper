const CACHE_NAME = 'clipboard-manager-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  './icons/icon.svg'
];

// Install event - Cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    }).then(cachesToDelete => {
      return Promise.all(cachesToDelete.map(cacheToDelete => {
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Serve cached content when offline
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return cached response if available
        }
        
        // Clone the request to make a network request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(response => {
          // Don't cache non-successful responses or non-GET requests
          if (!response || response.status !== 200 || response.type !== 'basic' || event.request.method !== 'GET') {
            return response;
          }
          
          // Clone the response to cache and return it
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        }).catch(() => {
          // If network request fails and its a document, serve offline page
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html'); // Return main page for offline navigation
          }
          
          // If we can't fetch and it's not a navigation, just return undefined
          return;
        });
      })
  );
});

// Background sync for saving clipboard items when offline
self.addEventListener('sync', event => {
  if (event.tag === 'sync-clipboard-items') {
    event.waitUntil(syncClipboardItems());
  }
});

// Function to handle background syncing of clipboard data
async function syncClipboardItems() {
  try {
    // This would normally sync with a server, but in our case
    // we're using localStorage which is already synced to the device
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        message: 'Clipboard data synced'
      });
    });
    return true;
  } catch (error) {
    console.error('Background sync failed:', error);
    return false;
  }
}