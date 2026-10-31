/* Shared by the existing root service worker so camera caching and push coexist. */
self.addEventListener('push', event => {
  let input = {};
  try { input = event.data?.json() || {}; } catch { input = { body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(input.title || 'Soul星球', {
    body: input.body || '你收到了一条新消息',
    icon: '/icons/soul-192.png?v=2',
    badge: '/icons/favicon-32.png?v=2',
    tag: input.id || undefined,
    data: { url: input.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    let target = new URL('/', self.location.origin);
    try {
      const requested = new URL(event.notification.data?.url || '/', self.location.origin);
      if (requested.origin === self.location.origin && /^https?:$/.test(requested.protocol)) target = requested;
    } catch { /* Fall back to the home page for malformed payloads. */ }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url === target.href);
    if (existing) return existing.focus();
    return self.clients.openWindow(target.href);
  })());
});
