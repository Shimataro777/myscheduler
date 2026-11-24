/* 4つ並べ：オフラインでも遊べるようにするための仕組み（サービスワーカー） */
const CACHE = 'glass4-v1.5.5';
const CORE = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './favicon.png'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js',
  'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;800&display=swap'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(CDN.map(async u => { try { const r = await fetch(u, {mode:'cors'}); if (r.ok) await c.put(u, r); } catch (er) {} }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* ページ本体：ネットにつながれば最新、つながらなければ保存しておいたもの */
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('/index.html'))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(req, {signal:ctrl.signal}); clearTimeout(t);
        if (r.ok) c.put('./index.html', r.clone());
        return r;
      } catch (er) { return (await c.match('./index.html')) || (await c.match('./')) || Response.error(); }
    })());
    return;
  }
  /* 3D・フォント・アイコンなど：保存しておいたものを優先して、なければ取りに行って保存 */
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, {ignoreVary:true});
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
      return r;
    } catch (er) { return hit || Response.error(); }
  })());
});
