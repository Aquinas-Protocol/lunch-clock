import { describe, expect, it } from 'vitest';
import { isPushEndpoint, parseCancel, parseSchedule, shouldSendNotice } from './validate';

const now = Date.parse('2026-11-04T17:16:40Z');
const deviceId = '3f2b8c4e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const apple = 'https://web.push.apple.com/QGuQyavXutnMH-a7Vmt2kQ/abc';
const ok = { deviceId, clockInAt: now + 30 * 60_000, subscription: { endpoint: apple } };

describe('parseSchedule', () => {
  it('accepts a normal lunch', () => {
    expect(parseSchedule(ok, now)).toEqual({ deviceId, clockInAt: ok.clockInAt, endpoint: apple });
  });

  it('rejects bad device ids', () => {
    expect(parseSchedule({ ...ok, deviceId: 'pyper' }, now)).toBe('bad deviceId');
    expect(parseSchedule({ ...ok, deviceId: undefined }, now)).toBe('bad deviceId');
  });

  it('keeps clock-in within a sane window', () => {
    expect(parseSchedule({ ...ok, clockInAt: now + 3 * 3600_000 }, now)).toBe('clockInAt out of range');
    expect(parseSchedule({ ...ok, clockInAt: now - 10 * 60_000 }, now)).toBe('clockInAt out of range');
    expect(parseSchedule({ ...ok, clockInAt: '12:47' }, now)).toBe('bad clockInAt');
    // A phone clock a little ahead is fine.
    expect(typeof parseSchedule({ ...ok, clockInAt: now - 60_000 }, now)).toBe('object');
  });

  it('only allows real push services', () => {
    const bad = (endpoint: string) =>
      parseSchedule({ ...ok, subscription: { endpoint } }, now) === 'bad subscription endpoint';
    expect(bad('https://example.com/hook')).toBe(true);
    expect(bad('http://web.push.apple.com/x')).toBe(true);
    expect(bad('https://web.push.apple.com.evil.test/x')).toBe(true);
    expect(bad('not a url')).toBe(true);
    expect(parseSchedule({ ...ok, subscription: undefined }, now)).toBe('bad subscription endpoint');
  });

  it('rejects non-objects', () => {
    expect(parseSchedule(null, now)).toBe('body must be JSON');
  });
});

describe('isPushEndpoint', () => {
  it('knows the major push services', () => {
    expect(isPushEndpoint(apple)).toBe(true);
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });
});

describe('parseCancel', () => {
  it('needs a device id', () => {
    expect(parseCancel({ deviceId })).toEqual({ deviceId });
    expect(parseCancel({ deviceId: 'x' })).toBe('bad deviceId');
    expect(parseCancel(null)).toBe('bad deviceId');
  });
});

describe('shouldSendNotice', () => {
  const clockInAt = now + 30 * 60_000;

  it('sends while clock-in is comfortably ahead', () => {
    expect(shouldSendNotice(clockInAt, undefined, now)).toBe(true);
    expect(shouldSendNotice(clockInAt, undefined, clockInAt - 91_000)).toBe(true);
  });

  it('never sends close to clock-in (the service worker would mistake it)', () => {
    expect(shouldSendNotice(clockInAt, undefined, clockInAt - 89_000)).toBe(false);
    expect(shouldSendNotice(clockInAt, undefined, clockInAt + 1)).toBe(false);
  });

  it('needs a scheduled lunch', () => {
    expect(shouldSendNotice(undefined, undefined, now)).toBe(false);
  });

  it('ignores a double exit within 15 s, then allows a fresh one', () => {
    expect(shouldSendNotice(clockInAt, now, now + 5_000)).toBe(false);
    expect(shouldSendNotice(clockInAt, now, now + 15_000)).toBe(true);
  });
});
