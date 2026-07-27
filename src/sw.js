/**
 * Boat Safe service worker — offline support for weak/no cell coverage.
 *
 * - App shell + local data: cache-first (instant load, refreshed in background).
 * - NOAA data: network-first, falling back to the last cached response, so a
 *   boater who loses signal still sees the most recent forecast/tides pulled.
 *
 * Bump CACHE_VERSION to force a refresh of cached assets on next visit.
 */
const CACHE_VERSION = 'boatsafe-v1';

// Minimal shell precache; everything else is cached on first use at runtime.
const SHELL = ['./', './index.html', './manifest.json', './oceanbightlogo.png'];

// NOAA hosts we call directly; served network-first so data stays fresh online.
const NET_FIRST_HOSTS = [
    'api.weather.gov',
    'api.tidesandcurrents.noaa.gov',
    'www.weather.gov'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            // Don't fail the whole install if one shell URL 404s in a given build
            .then(cache => Promise.allSettled(SHELL.map(u => cache.add(u))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (NET_FIRST_HOSTS.includes(url.hostname)) {
        event.respondWith(networkFirst(req));
    } else if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(req));
    }
    // other cross-origin GETs (e.g. fonts) fall through to the network
});

async function networkFirst(req) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) {
        // Stale-while-revalidate: serve cache now, refresh for next time.
        fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
        return cached;
    }
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
}
