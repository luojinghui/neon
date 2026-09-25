/* Only immutable, versioned vision assets are cached. Never cache photos or APIs. */
const CACHE = 'neon-vision-0.10.35-v1';
const ROOT = '/mediapipe/0.10.35/';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('neon-vision-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT) || !/\.(wasm|m?js|task|tflite)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
    } catch { /* Storage may be disabled or full. */ }
    const response = await fetch(event.request);
    if (cache && response.ok && !response.headers.get('content-type')?.includes('text/html')) {
      try { await cache.put(event.request, response.clone()); } catch { /* Network result is still usable. */ }
    }
    return response;
  })());
});
