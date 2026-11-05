// Web Push with no payload: only the VAPID authorization (RFC 8292) is needed,
// so there is no payload encryption. The service worker already knows what to
// show from its own cached state.

export interface VapidKeys {
  publicKey: string; // base64url, uncompressed P-256 point (65 bytes)
  privateJwk: JsonWebKey; // { kty, crv, x, y, d }
}

const enc = new TextEncoder();

export function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `Authorization` header value for one push endpoint. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now = Date.now(),
): Promise<string> {
  const { kty, crv, x, y, d } = keys.privateJwk;
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty, crv, x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(now / 1000) + 12 * 3600,
      sub: subject,
    }),
  );
  // WebCrypto ECDSA signatures are already raw r||s, which is what ES256 wants.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(`${header}.${claims}`),
  );
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

export interface PushResult {
  status: number;
  body: string;
}

export async function sendEmptyPush(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
): Promise<PushResult> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(endpoint, keys, subject),
      TTL: '900', // deliver within 15 min of clock-in, or not at all
      Urgency: 'high',
    },
    body: '',
  });
  return { status: res.status, body: await res.text() };
}
