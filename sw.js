// Cache-first service worker. Bump VERSION whenever any app or content file changes.
const VERSION = 3;
const CACHE = `trainer-v${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/grade.js',
  './js/questions.js',
  './js/session.js',
  './js/srs.js',
  './js/storage.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './content/index.json',
  './content/conversations.json',
  './content/reading.json',
  './content/checkpoints.json',
  './content/grammar/g1.json',
  './content/grammar/g2.json',
  './content/grammar/g3.json',
  './content/grammar/g4.json',
  './content/grammar/g5.json',
  './content/grammar/g6.json',
  './content/grammar/g7.json',
  './content/grammar/g8.json',
  './content/grammar/fix.json',
  './content/vocab/smalltalk.json',
  './content/vocab/directions.json',
  './content/vocab/transport.json',
  './content/vocab/accommodation.json',
  './content/vocab/restaurants.json',
  './content/vocab/shops.json',
  './content/vocab/plans.json',
  './content/vocab/everyday.json',
  './content/vocab/problems.json',
  './content/vocab/work.json',
  './content/vocab/housing.json',
  './content/vocab/money.json',
  './content/vocab/personality.json',
  './content/vocab/health.json',
  './content/vocab/feelings.json',
  './content/vocab/nature.json',
  './content/vocab/technology.json',
  './content/vocab/verbs.json',
  './content/vocab/expressions.json',
  './content/vocab/falsefriends.json',
  './content/vocab/connectors.json',
  './content/vocab/repaso.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith('trainer-v') && n !== CACHE).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch (error) {
        const shell = request.mode === 'navigate' && (await cache.match('./index.html'));
        if (shell) return shell;
        throw error;
      }
    })
  );
});
