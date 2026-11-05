// Service worker for Lunch Clock.
// 1. Offline shell: network-first for page loads, cache-first for Vite's hashed
//    /assets/ files, so the app opens instantly even with a flaky connection.
// 2. Push: at clock-in time the Worker sends one empty push. Swap the
//    "Back at …" notice for "Time to clock in".

const SHELL = 'lunch-shell-v1';
const STATE_CACHE = 'lunch-state'; // shared with src/push.ts
const BASE = '/lunch-clock/';
const STATE_URL = `${BASE}__lunch-state`; // shared with src/push.ts
const TAG = 'lunch'; // shared with src/push.ts

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL)
      .then(c => c.addAll([BASE, `${BASE}manifest.json`, `${BASE}icon-180.png`]))
      .catch(() => {}),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k !== SHELL && k !== STATE_CACHE).map(k => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(BASE, copy));
          return res;
        })
        .catch(() => caches.match(BASE)),
    );
    return;
  }

  // Hashed build output never changes under the same name.
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then(c => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', event => {
  event.waitUntil(
    (async () => {
      let label = '';
      try {
        const cache = await caches.open(STATE_CACHE);
        const res = await cache.match(STATE_URL);
        if (res) label = (await res.json()).label || '';
        await caches.delete(STATE_CACHE);
      } catch {
        /* show the generic text */
      }

      // iOS doesn't reliably replace by tag (WebKit bug 258922): close by hand.
      const open = await self.registration.getNotifications({ tag: TAG }).catch(() => []);
      open.forEach(n => n.close());

      // iOS requires every push to show a notification.
      await self.registration.showNotification('Time to clock in', {
        tag: 'lunch-over',
        body: label ? `It's ${label}. Welcome back.` : 'Your lunch is over. Welcome back.',
        icon: `${BASE}icon-180.png`,
      });
    })(),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => new URL(c.url).pathname.startsWith(BASE));
      return open ? open.focus() : self.clients.openWindow(BASE);
    }),
  );
});
