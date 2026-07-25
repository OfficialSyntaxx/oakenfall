/* Oakenfall service worker — makes the game installable and available offline.
   Host-agnostic: only root-relative paths, so it survives a move off Netlify to
   any host/domain. Network-first so an online visit always gets the latest
   build, with a cache fallback so an installed hold still opens offline. */
const CACHE = 'oakenfall-v1';
const CORE = ['/', '/play/', '/game/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && req.url.startsWith(self.location.origin)) {
        const c = await caches.open(CACHE); c.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const home = (await caches.match('/play/')) || (await caches.match('/'));
        if (home) return home;
      }
      throw err;
    }
  })());
});
