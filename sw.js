const CACHE_NAME = 'kinetic-v1';

const urlsToCache = [
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install → cache files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Fetch → serve from cache first
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});