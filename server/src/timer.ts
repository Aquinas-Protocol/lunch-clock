import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { sendEmptyPush } from './vapid';

/** One per phone. Holds the next clock-in time and fires the push with an alarm. */
export class LunchTimer extends DurableObject<Env> {
  async schedule(endpoint: string, clockInAt: number): Promise<void> {
    await this.ctx.storage.put({ endpoint, clockInAt });
    await this.ctx.storage.setAlarm(clockInAt); // replaces any earlier lunch
  }

  async cancel(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    const endpoint = await this.ctx.storage.get<string>('endpoint');
    if (!endpoint) return;

    const res = await sendEmptyPush(
      endpoint,
      { publicKey: this.env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(this.env.VAPID_PRIVATE_KEY) },
      this.env.VAPID_SUBJECT,
    );
    console.log(
      JSON.stringify({
        event: 'push',
        status: res.status,
        host: new URL(endpoint).host,
        body: res.body.slice(0, 200),
      }),
    );

    // Throwing makes Cloudflare retry the alarm with backoff: only worth it
    // when the push service itself had a problem.
    if (res.status === 429 || res.status >= 500) throw new Error(`push service ${res.status}`);
    await this.ctx.storage.deleteAll();
  }
}
