import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { shouldSendNotice } from './validate';
import { sendEmptyPush, type PushResult } from './vapid';

/** One per phone. Holds the next clock-in time and fires the push with an alarm. */
export class LunchTimer extends DurableObject<Env> {
  async schedule(endpoint: string, clockInAt: number): Promise<void> {
    await this.ctx.storage.deleteAll(); // a new lunch starts clean
    await this.ctx.storage.put({ endpoint, clockInAt });
    await this.ctx.storage.setAlarm(clockInAt); // replaces any earlier lunch
  }

  async cancel(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** She left the app mid-lunch: push the "Back at …" notice now. */
  async notice(): Promise<boolean> {
    const [endpoint, clockInAt, lastNoticeAt] = await Promise.all([
      this.ctx.storage.get<string>('endpoint'),
      this.ctx.storage.get<number>('clockInAt'),
      this.ctx.storage.get<number>('lastNoticeAt'),
    ]);
    const now = Date.now();
    if (!endpoint || !shouldSendNotice(clockInAt, lastNoticeAt, now)) return false;
    await this.ctx.storage.put('lastNoticeAt', now);
    const res = await this.push(endpoint, 'notice');
    return res.status >= 200 && res.status < 300;
  }

  async alarm(): Promise<void> {
    const endpoint = await this.ctx.storage.get<string>('endpoint');
    if (!endpoint) return;
    const res = await this.push(endpoint, 'clock-in');

    // Throwing makes Cloudflare retry the alarm with backoff: only worth it
    // when the push service itself had a problem.
    if (res.status === 429 || res.status >= 500) throw new Error(`push service ${res.status}`);
    await this.ctx.storage.deleteAll();
  }

  private async push(endpoint: string, kind: 'notice' | 'clock-in'): Promise<PushResult> {
    const res = await sendEmptyPush(
      endpoint,
      { publicKey: this.env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(this.env.VAPID_PRIVATE_KEY) },
      this.env.VAPID_SUBJECT,
    );
    console.log(
      JSON.stringify({
        event: 'push',
        kind,
        status: res.status,
        host: new URL(endpoint).host,
        body: res.body.slice(0, 200),
      }),
    );
    return res;
  }
}
