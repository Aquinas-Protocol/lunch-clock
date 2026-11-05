// Service worker for Lunch Clock.
// 1. Offline shell: network-first for page loads, cache-first for Vite's hashed
//    /assets/ files, so the app opens instantly even with a flaky connection.
// 2. Push (always empty): when she leaves the app during lunch, show
//    "Back at …"; at clock-in time, swap it for "Time to clock in".

const SHELL = 'lunch-shell-v2';
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

// Pushes carry no payload; the time tells them apart. The Worker only sends the
// "she left the app" notice while clock-in is more than 90 s away, and the
// clock-in push at clock-in itself; 45 s splits them with room for clock skew.
const NOTICE_CUTOFF_MS = 45_000;

self.addEventListener('push', event => {
  event.waitUntil(
    (async () => {
      let state = null;
      try {
        const res = await (await caches.open(STATE_CACHE)).match(STATE_URL);
        if (res) state = await res.json();
      } catch {
        /* show the generic text */
      }
      const label = (state && state.label) || '';
      const isNotice = state && Date.now() < state.clockInAt - NOTICE_CUTOFF_MS;

      // iOS doesn't reliably replace by tag (WebKit bug 258922): close by hand.
      const open = await self.registration.getNotifications({ tag: TAG }).catch(() => []);
      open.forEach(n => n.close());

      // iOS requires every push to show a notification.
      if (isNotice) {
        await self.registration.showNotification(`Back at ${label}`, {
          tag: TAG,
          body: 'Clock back in then. This updates when it is time.',
          icon: `${BASE}icon-180.png`,
        });
        return;
      }
      await caches.delete(STATE_CACHE).catch(() => {});
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
