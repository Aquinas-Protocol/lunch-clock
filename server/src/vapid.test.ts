import { describe, expect, it } from 'vitest';
import { b64url, vapidAuthorization, type VapidKeys } from './vapid';

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function keys(): Promise<{ keys: VapidKeys; verifyKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const publicKey = b64url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return { keys: { publicKey, privateJwk }, verifyKey: pair.publicKey };
}

describe('VAPID authorization', () => {
  const endpoint = 'https://web.push.apple.com/QGuQyavXutnMH-a7Vmt2kQ/abc';
  const subject = 'https://aquinas-protocol.github.io/lunch-clock/';
  const now = Date.parse('2026-11-04T17:16:40Z');

  it('builds "vapid t=<jwt>, k=<public key>"', async () => {
    const { keys: k } = await keys();
    const header = await vapidAuthorization(endpoint, k, subject, now);
    expect(header).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(header.endsWith(`k=${k.publicKey}`)).toBe(true);
    expect(fromB64url(k.publicKey).length).toBe(65); // uncompressed P-256 point
  });

  it('signs ES256 claims for the push service origin', async () => {
    const { keys: k, verifyKey } = await keys();
    const header = await vapidAuthorization(endpoint, k, subject, now);
    const jwt = header.slice('vapid t='.length, header.indexOf(','));
    const [h, c, s] = jwt.split('.');

    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: Math.floor(now / 1000) + 12 * 3600, // within the 24 h limit
      sub: subject,
    });

    const sig = fromB64url(s);
    expect(sig.length).toBe(64); // raw r||s, as JWS requires
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      sig,
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });
});
