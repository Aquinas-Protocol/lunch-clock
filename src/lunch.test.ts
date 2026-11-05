import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_LATER_MINUTES,
  clockOutAt,
  formatEastern,
  parseLunch,
  remainingFraction,
  remainingLabel,
  shiftClockOut,
  startLunch,
  viewAt,
} from './lunch';

const at = (iso: string) => Date.parse(iso);
const MIN = 60_000;

// The phone's zone must never change the Eastern answer. Node honours runtime
// TZ changes, so run every Eastern assertion under several phone zones:
// Central (today), Arizona (no DST, the planned move), and somewhere far away.
const PHONE_ZONES = ['America/Chicago', 'America/Phoenix', 'Asia/Tokyo'];
const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe.each(PHONE_ZONES)('phone on %s', tz => {
  beforeAll(() => {
    process.env.TZ = tz;
  });

  it('really is running in that phone zone', () => {
    const offsets: Record<string, number> = {
      'America/Chicago': 360, // CST on 2026-11-04
      'America/Phoenix': 420, // MST, all year
      'Asia/Tokyo': -540,
    };
    expect(new Date(at('2026-11-04T17:16:40Z')).getTimezoneOffset()).toBe(offsets[tz]);
  });

  it('counts from the minute she tapped, like her work clock (never a minute late)', () => {
    // 11:16:40 AM CST on Wed 2026-11-04 = 17:16:40Z. Work records a 12:16 PM ET
    // clock-out, so she is due back at 12:46, not 12:47.
    const lunch = startLunch(at('2026-11-04T17:16:40Z'));
    expect(clockOutAt(lunch)).toBe(at('2026-11-04T17:16:00Z'));
    expect(lunch.clockInAt).toBe(at('2026-11-04T17:46:00Z'));
    expect(formatEastern(lunch.clockInAt)).toEqual({
      time: '12:46',
      period: 'PM',
      zone: 'EST',
      label: '12:46 PM ET',
    });
  });

  it('gives the same clock-in for any second of the tapped minute', () => {
    const first = startLunch(at('2026-11-04T17:16:00.000Z'));
    const last = startLunch(at('2026-11-04T17:16:59.999Z'));
    expect(first.clockInAt).toBe(at('2026-11-04T17:46:00Z'));
    expect(last.clockInAt).toBe(at('2026-11-04T17:46:00Z'));
  });

  it('keeps an exact-minute start exact', () => {
    expect(startLunch(at('2026-11-04T17:16:00Z')).clockInAt).toBe(at('2026-11-04T17:46:00Z'));
  });

  it('labels summer as EDT', () => {
    const e = formatEastern(at('2026-07-15T16:47:00Z'));
    expect([e.time, e.period, e.zone]).toEqual(['12:47', 'PM', 'EDT']);
  });

  it('handles the spring-forward edge (2026-03-08)', () => {
    // 1:45 AM EST + 30 min crosses 2:00 → 3:00 AM EDT.
    const lunch = startLunch(at('2026-03-08T06:45:00Z'));
    const e = formatEastern(lunch.clockInAt);
    expect([e.time, e.period, e.zone]).toEqual(['3:15', 'AM', 'EDT']);
  });

  it('handles the fall-back edge (2026-11-01)', () => {
    // 1:45 AM EDT + 30 min crosses 2:00 EDT → 1:00 AM EST.
    const lunch = startLunch(at('2026-11-01T05:45:00Z'));
    const e = formatEastern(lunch.clockInAt);
    expect([e.time, e.period, e.zone]).toEqual(['1:15', 'AM', 'EST']);
  });

  it('formats noon and midnight', () => {
    expect(formatEastern(at('2026-11-04T17:00:00Z')).label).toBe('12:00 PM ET');
    expect(formatEastern(at('2026-11-05T05:00:00Z')).label).toBe('12:00 AM ET');
  });
});

describe('view state', () => {
  const lunch = startLunch(at('2026-11-04T17:16:40Z'));

  it('is on lunch until the clock-in time, then ready again', () => {
    expect(viewAt(lunch, lunch.startedAt).kind).toBe('onLunch');
    expect(viewAt(lunch, lunch.clockInAt - 1).kind).toBe('onLunch');
    expect(viewAt(lunch, lunch.clockInAt).kind).toBe('ready');
    expect(viewAt(lunch, lunch.clockInAt + 86_400_000).kind).toBe('ready');
  });

  it('is ready with no stored lunch', () => {
    expect(viewAt(null, Date.now()).kind).toBe('ready');
  });
});

describe('countdown', () => {
  const lunch = startLunch(at('2026-11-04T17:16:40Z')); // clock-out 17:16, clock-in 17:46

  it('opens on the lunch length', () => {
    expect(remainingLabel(lunch, lunch.startedAt)).toBe('30 min left');
  });

  it('counts clock minutes to the clock-in time', () => {
    expect(remainingLabel(lunch, at('2026-11-04T17:20:30Z'))).toBe('26 min left');
    expect(remainingLabel(lunch, at('2026-11-04T17:44:30Z'))).toBe('2 min left');
    expect(remainingLabel(lunch, at('2026-11-04T17:45:00Z'))).toBe('1 min left');
  });

  it('says under a minute at the end, then nothing', () => {
    expect(remainingLabel(lunch, at('2026-11-04T17:45:30Z'))).toBe('Under a minute left');
    expect(remainingLabel(lunch, lunch.clockInAt)).toBe('');
  });

  it('drains the progress fraction from 1 at clock-out to 0 at clock-in', () => {
    expect(remainingFraction(lunch, clockOutAt(lunch))).toBe(1);
    expect(remainingFraction(lunch, clockOutAt(lunch) + 15 * MIN)).toBe(0.5);
    expect(remainingFraction(lunch, lunch.clockInAt)).toBe(0);
    expect(remainingFraction(lunch, lunch.clockInAt + MIN)).toBe(0);
  });

  it('supports the 3-minute test lunch', () => {
    const test = startLunch(at('2026-11-04T17:16:40Z'), 3);
    expect(test.clockInAt).toBe(at('2026-11-04T17:19:00Z'));
    expect(remainingLabel(test, test.startedAt)).toBe('3 min left');
  });
});

describe('adjusting the clock-out time', () => {
  const tap = at('2026-11-04T17:16:40Z'); // clock-out 12:16 PM ET, clock-in 12:46
  const lunch = startLunch(tap);

  it('moves clock-in with clock-out, a minute at a time', () => {
    const earlier = shiftClockOut(lunch, -1, tap)!;
    expect(formatEastern(clockOutAt(earlier)).label).toBe('12:15 PM ET');
    expect(formatEastern(earlier.clockInAt).label).toBe('12:45 PM ET');
    const later = shiftClockOut(lunch, 2, tap)!;
    expect(formatEastern(later.clockInAt).label).toBe('12:48 PM ET');
    expect(later.startedAt).toBe(lunch.startedAt); // same lunch
  });

  it('can go back as far as she likes while clock-in is still ahead', () => {
    expect(shiftClockOut(lunch, -29, tap)).not.toBeNull(); // clock-in 17:17:00
    expect(shiftClockOut(lunch, -30, tap)).toBeNull(); // clock-in 17:16:00, already past
    // Later in the lunch the floor rises with the clock.
    expect(shiftClockOut(lunch, -1, at('2026-11-04T17:44:59Z'))).not.toBeNull();
    expect(shiftClockOut(lunch, -1, at('2026-11-04T17:45:00Z'))).toBeNull();
  });

  it(`stops ${MAX_LATER_MINUTES} minutes after the tapped minute`, () => {
    expect(shiftClockOut(lunch, MAX_LATER_MINUTES, tap)).not.toBeNull();
    expect(shiftClockOut(lunch, MAX_LATER_MINUTES + 1, tap)).toBeNull();
  });

  it('counts down past 30 when clock-out is set later than now', () => {
    const later = shiftClockOut(lunch, 5, tap)!; // clock-out 17:21, clock-in 17:51
    expect(remainingLabel(later, tap)).toBe('35 min left');
    expect(remainingFraction(later, tap)).toBe(1);
  });

  it('survives storage', () => {
    const later = shiftClockOut(lunch, 3, tap)!;
    expect(parseLunch(JSON.stringify(later))).toEqual(later);
  });
});

describe('stored state', () => {
  it('round-trips a lunch', () => {
    const lunch = startLunch(at('2026-11-04T17:16:40Z'));
    expect(parseLunch(JSON.stringify(lunch))).toEqual(lunch);
  });

  it('treats junk as no lunch', () => {
    expect(parseLunch(null)).toBeNull();
    expect(parseLunch('not json')).toBeNull();
    expect(parseLunch('{"startedAt":"x"}')).toBeNull();
    expect(parseLunch('{"startedAt":5,"clockInAt":4,"minutes":30}')).toBeNull();
  });
});
