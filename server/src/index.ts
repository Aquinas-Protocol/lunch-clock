// lunch-push: schedules Lunch Clock's one "Time to clock in" push.
//   POST   /lunch  { deviceId, clockInAt, subscription }  → alarm at clockInAt
//   DELETE /lunch  { deviceId }                            → cancel
//   GET    /health

import { LunchTimer } from './timer';
import { parseCancel, parseSchedule } from './validate';

export { LunchTimer };

export interface Env {
  LUNCH_TIMER: DurableObjectNamespace<LunchTimer>;
  ALLOWED_ORIGINS: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string; // secret: private JWK as JSON
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    const cors: Record<string, string> = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {};
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json', ...cors },
      });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(req.url);
    if (pathname === '/health') return json({ ok: true });
    if (pathname !== '/lunch') return json({ error: 'not found' }, 404);
    if (!allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403);
    // Fail closed until the keys are in place.
    if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return json({ error: 'not configured' }, 503);

    const body = await req.json().catch(() => null);

    if (req.method === 'POST') {
      const s = parseSchedule(body, Date.now());
      if (typeof s === 'string') return json({ error: s }, 400);
      await timer(env, s.deviceId).schedule(s.endpoint, s.clockInAt);
      return json({ ok: true, clockInAt: s.clockInAt });
    }

    if (req.method === 'DELETE') {
      const c = parseCancel(body);
      if (typeof c === 'string') return json({ error: c }, 400);
      await timer(env, c.deviceId).cancel();
      return json({ ok: true });
    }

    return json({ error: 'method not allowed' }, 405);
  },
} satisfies ExportedHandler<Env>;

const timer = (env: Env, deviceId: string) =>
  env.LUNCH_TIMER.get(env.LUNCH_TIMER.idFromName(deviceId));
