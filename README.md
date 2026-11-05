# Lunch Clock

A one-button lunch timer for working from home. Tap **Take Lunch** and it shows when to clock back in, **in Eastern time**, whatever time zone the phone is in. A lock-screen notice holds the time, and at clock-in time it's replaced by a "Time to clock in" nudge. Then the app is ready for tomorrow.

Live: https://aquinas-protocol.github.io/lunch-clock/

## How it works

- **Clock-in time**: tap time + 30 minutes, rounded *up* to the whole minute (so the break is never short), formatted with the IANA zone `America/New_York`. EST/EDT is automatic, and the phone's own zone (Central, Arizona, anything) never matters. Logic and tests: `src/lunch.ts`.
- **Lock-screen notice**: an installed (Home Screen) web app can use Web Push on iOS 16.4+. On Take Lunch the app subscribes, tells the Worker the clock-in time, and shows "Back at 12:47 PM ET".
- **Auto-clear**: the Worker (`server/`, Cloudflare Worker + one Durable Object per phone) sets an alarm for the clock-in minute and sends one empty push. The service worker (`public/sw.js`) closes the lunch notice and shows "Time to clock in". iOS requires every push to show something, so a notice can't vanish silently.
- **No accounts, no history.** State lives in the phone's localStorage; the Worker only holds a push endpoint and one timestamp until the alarm fires.

## Develop

```bash
npm install
npm run dev        # http://localhost:5174/lunch-clock/
npm test           # client logic + Worker helpers
npm run typecheck
```

Test mode: tap the top bar five times quickly (or open with `?test=1`) for a 1-minute lunch. Tap five times again (or `?test=0`) to turn it off.

## Deploy

```bash
npm run deploy                 # web app → GitHub Pages (gh-pages branch)
cd server && npm run deploy    # Worker → lunch-push.machina-infastructure.workers.dev
```

Keys: `cd server && npm run keys` makes a new VAPID pair. The private key goes straight into the `VAPID_PRIVATE_KEY` Worker secret (never printed); the public key is written to `server/wrangler.toml` and `src/config.ts`. Then redeploy both. Phones re-subscribe on their next Take Lunch.

## Install on an iPhone

1. Open the live URL in Safari.
2. Share → **Add to Home Screen**, then open **Lunch** from the Home Screen.
3. Tap **Take Lunch** and allow notifications.
4. If you use a Work or Do Not Disturb Focus, allow **Lunch** in it.

Design system: [DESIGN.md](DESIGN.md).
