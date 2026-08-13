const CACHE_NAME = 'rohn-pos-v33';
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
            try {
                // Prefer the network so newly deployed HTML, CSS and JavaScript
                // appear immediately instead of being hidden by an old cache.
                const response = await fetch(event.request);

                if (response.ok && response.type === 'basic') {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(event.request, response.clone());
                }

                return response;
            } catch (error) {
                // Preserve offline support when the network is unavailable.
                const cached = await caches.match(event.request, { ignoreSearch: true });
                if (cached) return cached;
                throw error;
            }
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
