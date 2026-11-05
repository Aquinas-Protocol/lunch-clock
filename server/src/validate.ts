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
