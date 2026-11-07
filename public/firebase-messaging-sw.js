/* SmartAqua Pro push notifications (FR15, Sprint 4; docs/notifications.md).
 * Registered by src/services/pushService.ts only after the user presses
 * "Turn on alerts". It handles FCM web pushes itself (no Firebase SDK here):
 * shows the notification and opens the tank's deep link on click. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: 'SmartAqua Pro', body: event.data ? event.data.text() : '' } };
  }
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'SmartAqua Pro';
  event.waitUntil(self.registration.showNotification(title, {
    body: notification.body || data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.alertId || data.recommendationId || undefined,
    renotify: Boolean(data.alertId),
    data: { link: data.link || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin);
  // Only ever open this app's own pages.
  const link = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        return client.navigate(link).then((navigated) => (navigated || client).focus());
      }
    }
    return self.clients.openWindow(link);
  }));
});
