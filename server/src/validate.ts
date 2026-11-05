// Request validation. Kept free of Workers imports so it runs under Vitest.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AHEAD_MS = 2 * 60 * 60 * 1000; // a lunch is never more than 2 h out
const SKEW_MS = 5 * 60 * 1000; // tolerate a phone clock a few minutes off

// Only real browser push services, so this Worker can't be pointed at
// arbitrary URLs.
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
];

export interface Schedule {
  deviceId: string;
  clockInAt: number;
  endpoint: string;
}

export function parseSchedule(body: unknown, now: number): Schedule | string {
  if (!body || typeof body !== 'object') return 'body must be JSON';
  const b = body as Record<string, unknown>;
  const deviceId = parseDeviceId(b.deviceId);
  if (!deviceId) return 'bad deviceId';

  const clockInAt = b.clockInAt;
  if (typeof clockInAt !== 'number' || !Number.isFinite(clockInAt)) return 'bad clockInAt';
  if (clockInAt < now - SKEW_MS || clockInAt > now + MAX_AHEAD_MS) return 'clockInAt out of range';

  const sub = b.subscription as Record<string, unknown> | undefined;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  if (!isPushEndpoint(endpoint)) return 'bad subscription endpoint';

  return { deviceId, clockInAt, endpoint };
}

export function parseCancel(body: unknown): { deviceId: string } | string {
  const deviceId = parseDeviceId((body as Record<string, unknown> | null)?.deviceId);
  return deviceId ? { deviceId } : 'bad deviceId';
}

function parseDeviceId(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null;
}

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(url.hostname));
  } catch {
    return false;
  }
}

// The "she left the app" notice: only while clock-in is comfortably ahead (so
// the service worker can't mistake it for the clock-in push), and at most once
// per 15 s (visibilitychange and pagehide can both fire on one exit).
export const NOTICE_MIN_AHEAD_MS = 90_000;
export const NOTICE_MIN_GAP_MS = 15_000;

export function shouldSendNotice(
  clockInAt: number | undefined,
  lastNoticeAt: number | undefined,
  now: number,
): boolean {
  if (clockInAt === undefined || now > clockInAt - NOTICE_MIN_AHEAD_MS) return false;
  return lastNoticeAt === undefined || now - lastNoticeAt >= NOTICE_MIN_GAP_MS;
}
