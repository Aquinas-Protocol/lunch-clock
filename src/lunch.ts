// Pure lunch-timer logic. No DOM, no storage: everything here is unit-tested.
//
// All Eastern-time output goes through the IANA zone America/New_York, so the
// phone's own time zone (Central today, Arizona later) never matters.

export const LUNCH_MINUTES = 30;
export const EASTERN = 'America/New_York';
const MINUTE = 60_000;

export interface Lunch {
  startedAt: number; // epoch ms when she tapped Take Lunch
  clockInAt: number; // epoch ms, always on a whole minute
  minutes: number; // lunch length (30, or 3 in test mode)
}

export type View = { kind: 'ready' } | { kind: 'onLunch'; lunch: Lunch };

/**
 * Start a lunch. Her work clock records clock-out to the minute (a 12:16:40 tap
 * is a 12:16 clock-out), so clock-out is the minute she tapped and clock-in is
 * exactly `minutes` later. Rounding up instead made her a minute late.
 */
export function startLunch(now: number, minutes = LUNCH_MINUTES): Lunch {
  const clockOut = Math.floor(now / MINUTE) * MINUTE;
  return { startedAt: now, clockInAt: clockOut + minutes * MINUTE, minutes };
}

/** The clock-out minute this lunch counts from. */
export function clockOutAt(lunch: Lunch): number {
  return lunch.clockInAt - lunch.minutes * MINUTE;
}

/** How much later than her tap the clock-out can be set. */
export const MAX_LATER_MINUTES = 15;

/**
 * Move clock-out (and with it clock-in) by whole minutes to match her work
 * clock. Null when out of range: clock-in must stay in the future, and
 * clock-out can be at most MAX_LATER_MINUTES after the minute she tapped.
 */
export function shiftClockOut(lunch: Lunch, deltaMinutes: number, now: number): Lunch | null {
  const clockInAt = lunch.clockInAt + deltaMinutes * MINUTE;
  const latestOut = Math.floor(lunch.startedAt / MINUTE) * MINUTE + MAX_LATER_MINUTES * MINUTE;
  if (clockInAt <= now || clockInAt - lunch.minutes * MINUTE > latestOut) return null;
  return { ...lunch, clockInAt };
}

export function viewAt(lunch: Lunch | null, now: number): View {
  return lunch && now < lunch.clockInAt ? { kind: 'onLunch', lunch } : { kind: 'ready' };
}

export interface EasternTime {
  time: string; // "12:47"
  period: string; // "PM"
  zone: string; // "EST" or "EDT"
  label: string; // "12:47 PM ET"
}

const easternFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

export function formatEastern(ms: number): EasternTime {
  const parts = easternFmt.formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '';
  const time = `${get('hour')}:${get('minute')}`;
  const period = get('dayPeriod').toUpperCase();
  return { time, period, zone: get('timeZoneName'), label: `${time} ${period} ET` };
}

/**
 * "28 min left". Counts clock minutes to the clock-in time, so it matches the
 * clock. Can read above the lunch length if she set clock-out later than now.
 */
export function remainingLabel(lunch: Lunch, now: number): string {
  const ms = lunch.clockInAt - now;
  if (ms <= 0) return '';
  if (ms < MINUTE) return 'Under a minute left';
  return `${Math.ceil(ms / MINUTE)} min left`;
}

/** Share of the lunch still remaining, measured from clock-out, 1 → 0. */
export function remainingFraction(lunch: Lunch, now: number): number {
  return Math.min(1, Math.max(0, (lunch.clockInAt - now) / (lunch.minutes * MINUTE)));
}

/** "Wednesday · November 4" in the phone's own zone (it's her day, wherever she is). */
export function formatToday(now: number): string {
  const d = new Date(now);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${weekday} · ${date}`;
}

/** Parse stored state defensively; anything odd means "no lunch". */
export function parseLunch(raw: string | null): Lunch | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Lunch>;
    if (
      typeof v.startedAt === 'number' &&
      typeof v.clockInAt === 'number' &&
      typeof v.minutes === 'number' &&
      v.clockInAt > v.startedAt
    ) {
      return { startedAt: v.startedAt, clockInAt: v.clockInAt, minutes: v.minutes };
    }
  } catch {
    /* fall through */
  }
  return null;
}
