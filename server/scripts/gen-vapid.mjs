// Generate a VAPID key pair for lunch-push.
//
// The private key is piped straight into the Worker secret VAPID_PRIVATE_KEY
// and never printed or written to disk. The public key (safe to publish) is
// written into wrangler.toml and ../src/config.ts. Afterwards: redeploy the
// Worker (npm run deploy) and the web app (cd .. && npm run deploy).
//
// Rotating keys invalidates existing phone subscriptions; the app re-subscribes
// on the next Take Lunch automatically.
//
// Run from server/: npm run keys

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const { kty, crv, x, y, d } = await subtle.exportKey('jwk', pair.privateKey);
const publicKey = Buffer.from(await subtle.exportKey('raw', pair.publicKey)).toString('base64url');

const put = spawnSync('npx wrangler secret put VAPID_PRIVATE_KEY', {
  shell: true,
  input: JSON.stringify({ kty, crv, x, y, d }),
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (put.status !== 0) {
  console.error('wrangler secret put failed; no files were changed.');
  process.exit(1);
}

const replaceIn = (file, pattern, value) => {
  const text = readFileSync(file, 'utf8');
  if (!pattern.test(text)) throw new Error(`VAPID_PUBLIC_KEY line not found in ${file}`);
  writeFileSync(file, text.replace(pattern, value));
};
replaceIn('wrangler.toml', /^VAPID_PUBLIC_KEY = ".*"$/m, `VAPID_PUBLIC_KEY = "${publicKey}"`);
replaceIn(
  '../src/config.ts',
  /^export const VAPID_PUBLIC_KEY = '.*';$/m,
  `export const VAPID_PUBLIC_KEY = '${publicKey}';`,
);

console.log(`\nVAPID public key: ${publicKey}`);
console.log('Written to wrangler.toml and ../src/config.ts. Now redeploy the Worker and the web app.');
