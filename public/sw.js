// Iron Quest service worker. Hand-written and small on purpose: the app must open offline.
const VERSION = 'iq-v2-1';
const SCOPE = self.registration.scope;
const SHELL = ['', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'].map((p) => SCOPE + p);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.href.startsWith(SCOPE)) return; // Never touches the backend.
  if (req.mode === 'navigate') {
    // Network first so updates land quickly; cached shell when offline.
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(SCOPE + 'index.html', copy)); return res; }).catch(() => caches.match(SCOPE + 'index.html', { ignoreVary: true })));
    return;
  }
  // Hashed build assets are immutable, so cache-first is safe; lazy routes get cached as they load.
  // ignoreVary: module scripts carry an Origin header the precached copies didn't have.
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(SCOPE));
    return open ? open.focus() : self.clients.openWindow(SCOPE + '#/app');
  }));
});
// The page asks us to cache what it already loaded before this worker took control.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-urls') return;
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(e.data.urls.filter((u) => u.startsWith(SCOPE)).map((u) => c.match(u, { ignoreVary: true }).then((hit) => hit || c.add(u).catch(() => undefined))))));
});
