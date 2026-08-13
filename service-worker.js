const CACHE_NAME = 'rohn-pos-v29';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './menu.html',
    './payments.html',
    './pending.html',
    './history.html',
    './styles.css',
    './script.js',
    './cash-register.png',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(LOCAL_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);

    // Browser extensions and third-party resources cannot safely be stored in
    // this app's cache. Only handle files served by Rohn POS itself.
    if (!['http:', 'https:'].includes(requestUrl.protocol) || requestUrl.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        (async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;

            const response = await fetch(event.request);

            // Cache only complete, same-origin responses. Awaiting the write
            // prevents a rejected cache operation from becoming an uncaught promise.
            if (response.ok && response.type === 'basic') {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(event.request, response.clone());
            }

            return response;
        })()
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});
