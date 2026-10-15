// Service worker: hace la app instalable y abre rápido. Siempre intenta la red
// primero (para tener la última versión); si no hay red, usa la copia guardada
// para mostrar al menos la pantalla de "sin conexión". El mundo nunca se guarda acá.
const CACHE = 'rinconcito-v1';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/main.js', 'js/net.js', 'js/state.js', 'js/render.js', 'js/sprites.js', 'js/font.js', 'js/input.js',
  'js/ui.js', 'js/dom.js', 'js/game.js', 'js/audio.js', 'js/creator.js',
  'shared/data.js', 'shared/maps.js', 'shared/fishing.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/ws')) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
