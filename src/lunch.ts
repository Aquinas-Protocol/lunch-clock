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
  minutes: number; // lunch length (30, or 1 in test mode)
}

export type View = { kind: 'ready' } | { kind: 'onLunch'; lunch: Lunch };

/** Start a lunch. Clock-in is rounded UP to the next whole minute so the break is never short. */
export function startLunch(now: number, minutes = LUNCH_MINUTES): Lunch {
  const clockInAt = Math.ceil((now + minutes * MINUTE) / MINUTE) * MINUTE;
  return { startedAt: now, clockInAt, minutes };
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
 * "28 min left". Counts clock minutes to the clock-in time (so it matches the
 * clock), capped at the lunch length so a 30-minute lunch never opens on "31".
 */
export function remainingLabel(lunch: Lunch, now: number): string {
  const ms = lunch.clockInAt - now;
  if (ms <= 0) return '';
  if (ms < MINUTE) return 'Under a minute left';
  return `${Math.min(Math.ceil(ms / MINUTE), lunch.minutes)} min left`;
}

/** Share of the lunch still remaining, 1 → 0. */
export function remainingFraction(lunch: Lunch, now: number): number {
  const total = lunch.clockInAt - lunch.startedAt;
  return Math.min(1, Math.max(0, (lunch.clockInAt - now) / total));
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
