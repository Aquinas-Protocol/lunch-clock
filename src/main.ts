import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import './styles.css';

import {
  LUNCH_MINUTES,
  formatEastern,
  formatToday,
  parseLunch,
  remainingFraction,
  remainingLabel,
  startLunch,
  viewAt,
  type Lunch,
  type View,
} from './lunch';
import {
  cancelReminder,
  clearLocalReminder,
  isStandalone,
  registerServiceWorker,
  sendLeaveNotice,
  setReminder,
  type ReminderStatus,
} from './push';

const LUNCH_KEY = 'lunch:v1';
const STATUS_KEY = 'lunch:reminder';
const TEST_KEY = 'lunch:test';
const DEVICE_KEY = 'lunch:device';

const app = document.getElementById('app')!;

// ── Storage ────────────────────────────────────────────

const loadLunch = () => parseLunch(localStorage.getItem(LUNCH_KEY));
const testMode = () => localStorage.getItem(TEST_KEY) === '1';

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function endLunch(): void {
  localStorage.removeItem(LUNCH_KEY);
  localStorage.removeItem(STATUS_KEY);
}

// ── Markup ─────────────────────────────────────────────

// The brand mark (brand/logo.jpg, rendered by scripts/make-icons.mjs).
const MARK = `<img class="mark" src="${import.meta.env.BASE_URL}logo-mark.png" alt="" aria-hidden="true">`;

const SHARE = `<svg class="share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;

const TEST_MINUTES = 3; // long enough to lock the phone and see the notice first
const badge = () => (testMode() ? `<span class="badge">Test · ${TEST_MINUTES} min</span>` : '');

function readyHtml(now: number): string {
  const coach = isStandalone()
    ? ''
    : `<p class="coach rise d2">For a reminder on your lock screen, add Lunch to your Home Screen: tap ${SHARE}<strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>`;
  return `<section class="screen">
    <header class="top" data-eyebrow>
      <p class="eyebrow">${MARK}<span>${formatToday(now)}</span></p>${badge()}
    </header>
    <div class="hero">
      <h1 class="headline rise">Ready for <em>lunch?</em></h1>
    </div>
    <div class="bottom">
      ${coach}
      <button class="pill rise d3" type="button" data-action="take"><span class="dot" aria-hidden="true"></span>Take Lunch</button>
    </div>
  </section>`;
}

function lunchHtml(lunch: Lunch): string {
  const e = formatEastern(lunch.clockInAt);
  return `<section class="screen">
    <header class="top" data-eyebrow>
      <p class="eyebrow"><span class="live-dot" aria-hidden="true"></span><span>On lunch</span></p>${badge()}
    </header>
    <div class="hero">
      <p class="body rise">Clock back in at</p>
      <p class="display rise d1" aria-label="${e.time} ${e.period} Eastern Time">
        <span class="numerals">${e.time}</span><span class="period">${e.period}</span>
      </p>
      <p class="caption zone rise d1">Eastern Time · ${e.zone}</p>
      <div class="progress rise d2" aria-hidden="true"><div class="fill" data-fill></div></div>
      <p class="remaining rise d2" data-remaining></p>
      <p class="caption status rise d2" data-status></p>
    </div>
    <div class="bottom">
      <button class="quiet rise d3" type="button" data-action="cancel">Cancel lunch</button>
    </div>
  </section>`;
}

const STATUS_TEXT: Record<ReminderStatus, { text: string; tone: 'muted' | 'warn' }> = {
  // Quiet when things are fine; only problems get a line.
  pending: { text: '', tone: 'muted' },
  set: { text: '', tone: 'muted' },
  denied: { text: 'Notifications are off. The time still shows here.', tone: 'warn' },
  notInstalled: { text: 'Add Lunch to your Home Screen to get a lock-screen reminder.', tone: 'muted' },
  failed: { text: "Couldn't set the reminder. The time still shows here.", tone: 'warn' },
};

// ── Render ─────────────────────────────────────────────

let shown: View['kind'] | null = null;
let ticker: number | undefined;

/** Full render: only when the screen changes, so entrance motion plays once. */
function render(): void {
  const now = Date.now();
  const view = viewAt(loadLunch(), now);
  app.innerHTML = view.kind === 'onLunch' ? lunchHtml(view.lunch) : readyHtml(now);
  shown = view.kind;
  update();
  scheduleTick();
}

/** Cheap per-second update of the live bits. */
function update(): void {
  const lunch = loadLunch();
  if (!lunch || shown !== 'onLunch') return;
  const now = Date.now();
  const fill = app.querySelector<HTMLElement>('[data-fill]');
  const remaining = app.querySelector<HTMLElement>('[data-remaining]');
  const status = app.querySelector<HTMLElement>('[data-status]');
  fill?.style.setProperty('--f', remainingFraction(lunch, now).toFixed(4));
  if (remaining) remaining.textContent = remainingLabel(lunch, now);
  if (status) {
    const s = STATUS_TEXT[(localStorage.getItem(STATUS_KEY) as ReminderStatus) || 'pending'];
    status.textContent = s.text;
    status.dataset.tone = s.tone;
  }
}

function tick(): void {
  const view = viewAt(loadLunch(), Date.now());
  if (view.kind === shown) return update();
  if (view.kind === 'ready') {
    endLunch();
    void clearLocalReminder();
  }
  render();
}

function scheduleTick(): void {
  window.clearInterval(ticker);
  ticker = undefined;
  if (shown === 'onLunch' && !document.hidden) ticker = window.setInterval(tick, 1000);
}

// ── Actions ────────────────────────────────────────────

function takeLunch(): void {
  const lunch = startLunch(Date.now(), testMode() ? TEST_MINUTES : LUNCH_MINUTES);
  localStorage.setItem(LUNCH_KEY, JSON.stringify(lunch));
  localStorage.setItem(STATUS_KEY, 'pending');
  render(); // optimistic: the time shows instantly

  // Called synchronously inside the tap so iOS will show the permission prompt.
  void setReminder(lunch, deviceId()).then(status => {
    if (loadLunch()?.startedAt !== lunch.startedAt) return; // canceled meanwhile
    localStorage.setItem(STATUS_KEY, status);
    update();
  });
}

let disarm: number | undefined;

function cancelLunch(button: HTMLButtonElement): void {
  if (button.dataset.armed !== 'true') {
    button.dataset.armed = 'true';
    button.textContent = 'Tap again to cancel';
    disarm = window.setTimeout(() => {
      button.dataset.armed = 'false';
      button.textContent = 'Cancel lunch';
    }, 3000);
    return;
  }
  window.clearTimeout(disarm);
  endLunch();
  void cancelReminder(deviceId());
  render();
}

// Hidden test switch: five quick taps on the top bar toggles a short test lunch.
let taps: number[] = [];
function eyebrowTap(): void {
  const now = Date.now();
  taps = [...taps.filter(t => now - t < 2000), now];
  if (taps.length < 5) return;
  taps = [];
  if (testMode()) localStorage.removeItem(TEST_KEY);
  else localStorage.setItem(TEST_KEY, '1');
  render();
}

app.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLButtonElement>('[data-action]');
  if (action?.dataset.action === 'take') return takeLunch();
  if (action?.dataset.action === 'cancel') return cancelLunch(action);
  if (target.closest('[data-eyebrow]')) eyebrowTap();
});

// iOS moves any notification she has already seen (one shown while the app is
// open) into Notification Center, off the lock screen. So the "Back at …"
// notice is only sent once she leaves the app: locking the phone from here
// puts it on the lock screen, where it stays until her next unlock.
let noticeSent = false;
function leftApp(): void {
  if (noticeSent || shown !== 'onLunch') return;
  if (localStorage.getItem(STATUS_KEY) !== 'set') return;
  noticeSent = sendLeaveNotice(deviceId());
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) leftApp();
  else {
    noticeSent = false;
    tick();
  }
  scheduleTick();
});
window.addEventListener('pagehide', leftApp);
window.addEventListener('pageshow', () => tick());

// ── Boot ───────────────────────────────────────────────

// ?test=1 / ?test=0 also toggles test mode (handy in a desktop browser).
const params = new URLSearchParams(location.search);
if (params.has('test')) {
  if (params.get('test') === '1') localStorage.setItem(TEST_KEY, '1');
  else localStorage.removeItem(TEST_KEY);
  history.replaceState(null, '', location.pathname);
}

if (viewAt(loadLunch(), Date.now()).kind === 'ready' && loadLunch()) endLunch();
registerServiceWorker();
render();
