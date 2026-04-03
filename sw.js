const CACHE_NAME = 'kinetic-v3';

const urlsToCache = [
    '/kinetic/index.html',
    '/kinetic/styles.css',
    '/kinetic/app.js',
    '/kinetic/manifest.json',
    '/kinetic/icon-192.png',
    '/kinetic/icon-512.png'
];

// Install → cache files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const url of urlsToCache) {
                try {
                    await cache.add(url);
                    console.log('Cached:', url);
                } catch (err) {
                    console.error('FAILED to cache:', url, err);
                }
            }
        })
    );
});

// Fetch → serve from cache first
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});