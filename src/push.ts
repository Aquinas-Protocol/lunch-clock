// Lock-screen reminder: permission, push subscription, the Worker call, and the
// immediate "Back at …" notice. The Worker sends one push at clock-in time; the
// service worker (public/sw.js) then swaps the notice for "Time to clock in".

import { PUSH_API, VAPID_PUBLIC_KEY } from './config';
import { formatEastern, type Lunch } from './lunch';

export type ReminderStatus = 'pending' | 'set' | 'denied' | 'notInstalled' | 'failed';

const BASE = import.meta.env.BASE_URL; // "/lunch-clock/"
const STATE_CACHE = 'lunch-state'; // shared with sw.js
const STATE_URL = `${BASE}__lunch-state`; // shared with sw.js
const TAG = 'lunch'; // shared with sw.js

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushCapable(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {});
}

/** Set the lock-screen reminder for this lunch. Never throws. */
export async function setReminder(lunch: Lunch, deviceId: string): Promise<ReminderStatus> {
  if (!pushCapable()) return 'notInstalled';
  // iOS only shows the permission prompt during the tap itself, so this must be
  // the first thing that awaits.
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') return 'denied';

  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 8000);
    const sub = await subscription(reg);
    const { label } = formatEastern(lunch.clockInAt);
    await writeState({ clockInAt: lunch.clockInAt, label });

    const res = await fetch(`${PUSH_API}/lunch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, clockInAt: lunch.clockInAt, subscription: sub.toJSON() }),
    });
    if (!res.ok) return 'failed';

    // No notice now: one shown while she's looking at the app counts as seen
    // and skips the lock screen. sendLeaveNotice() asks for it when she leaves.
    await closeLunchNotices(reg); // clear any stale one from an earlier lunch
    return 'set';
  } catch {
    return 'failed';
  }
}

/**
 * She just left the app (locked the phone or switched away): ask the Worker to
 * push the "Back at …" notice now, so it arrives after the lock and stays on the
 * lock screen. A beacon survives the page being suspended, and a text/plain
 * body keeps it a simple request (no CORS preflight). Returns whether queued.
 */
export function sendLeaveNotice(deviceId: string): boolean {
  if (!('sendBeacon' in navigator)) return false;
  const body = new Blob([JSON.stringify({ deviceId })], { type: 'text/plain' });
  return navigator.sendBeacon(`${PUSH_API}/lunch/notice`, body);
}

/** Cancel: drop the scheduled push and clear the notice. Never throws. */
export async function cancelReminder(deviceId: string): Promise<void> {
  await clearLocalReminder();
  await fetch(`${PUSH_API}/lunch`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  }).catch(() => {});
}

/** Lunch is over (or canceled): clear any lingering notice and the shared state. */
export async function clearLocalReminder(): Promise<void> {
  try {
    await caches.delete(STATE_CACHE);
    const reg = await navigator.serviceWorker?.getRegistration(BASE);
    if (reg) await closeLunchNotices(reg);
  } catch {
    /* best effort */
  }
}

async function subscription(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID key not configured');
  const key = base64UrlToBytes(VAPID_PUBLIC_KEY);
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    const current = existing.options.applicationServerKey;
    if (current && sameBytes(new Uint8Array(current), key)) return existing;
    await existing.unsubscribe(); // key was rotated
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

// iOS doesn't reliably replace notifications by tag (WebKit bug 258922), so
// close matching ones by hand before showing a new one.
async function closeLunchNotices(reg: ServiceWorkerRegistration): Promise<void> {
  if (typeof reg.getNotifications !== 'function') return;
  const open = await reg.getNotifications({ tag: TAG });
  open.forEach(n => n.close());
}

async function writeState(state: { clockInAt: number; label: string }): Promise<void> {
  const cache = await caches.open(STATE_CACHE);
  await cache.put(
    STATE_URL,
    new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }),
  );
}

function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}
