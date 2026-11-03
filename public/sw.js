// Jens Run service worker: online altijd de nieuwste versie (netwerk eerst),
// offline speelbaar uit de cache. Geluid en plaatjes: cache, en op de achtergrond verversen.
const CACHE = 'jensrun-v1';
const CORE = ['/', '/index.html', '/style.css', '/game.js', '/three.module.min.js', '/manifest.webmanifest',
  '/img/menu-bg.jpg', '/img/jens-face.png', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // lettertypes van Google: gewoon via de browser
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/beheer')) return;
  const media = /\.(mp3|png|jpe?g|webp)$/i.test(url.pathname);
  e.respondWith(media ? staleWhileRevalidate(req) : networkFirst(req));
});
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/index.html')) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok && res.status === 200) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}
