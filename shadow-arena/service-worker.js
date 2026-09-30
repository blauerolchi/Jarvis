// Offline cache for Shadow Arena (only active when served over http(s); file:// works without it).
// Bump CACHE when files change so installed copies update.
const CACHE = 'shadow-arena-v3';
const FILES = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './src/animation.js',
  './src/arena.js',
  './src/arenamode.js',
  './src/arenas_egypt.js',
  './src/audio.js',
  './src/balance.js',
  './src/bosses.js',
  './src/camera.js',
  './src/combat.js',
  './src/core.js',
  './src/enemies.js',
  './src/enemy.js',
  './src/fighter.js',
  './src/input.js',
  './src/particles.js',
  './src/physics.js',
  './src/player.js',
  './src/progression.js',
  './src/projectiles.js',
  './src/renderer.js',
  './src/screens.js',
  './src/storage.js',
  './src/touch.js',
  './src/ui.js',
  './src/weapons.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// cache first, fall back to the network (and store what it returns)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res && res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
