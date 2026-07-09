import { shouldScheduleReengage, REENGAGE_CAP, REENGAGE_COOLDOWN_MIN } from '../src/state/reengageNudge';

// A neutral "now" inside the allowed window (12:00, not quiet hours).
const noon = (h = 12, m = 0) => new Date(2026, 6, 8, h, m, 0, 0);

const base = {
  now: noon(),
  permissionGranted: true,
  firedTodayCount: 0,
  lastFiredAtMs: null as number | null,
};

describe('shouldScheduleReengage', () => {
  it('fires under normal conditions (permission on, under cap, past cooldown, daytime)', () => {
    expect(shouldScheduleReengage(base)).toBe(true);
  });

  it('never fires without notification permission', () => {
    expect(shouldScheduleReengage({ ...base, permissionGranted: false })).toBe(false);
  });

  it('stops at the daily cap', () => {
    expect(shouldScheduleReengage({ ...base, firedTodayCount: REENGAGE_CAP })).toBe(false);
    expect(shouldScheduleReengage({ ...base, firedTodayCount: REENGAGE_CAP - 1 })).toBe(true);
  });

  it('respects the cooldown between fires', () => {
    const now = noon();
    // Last fired 10 min ago → still inside the default cooldown → blocked.
    const recent = now.getTime() - 10 * 60_000;
    expect(shouldScheduleReengage({ ...base, now, lastFiredAtMs: recent })).toBe(false);
    // Last fired just past the cooldown → allowed.
    const old = now.getTime() - (REENGAGE_COOLDOWN_MIN + 1) * 60_000;
    expect(shouldScheduleReengage({ ...base, now, lastFiredAtMs: old })).toBe(true);
  });

  it('stays quiet overnight (>=23:00 and <07:00)', () => {
    expect(shouldScheduleReengage({ ...base, now: noon(23, 30) })).toBe(false);
    expect(shouldScheduleReengage({ ...base, now: noon(3, 0) })).toBe(false);
    expect(shouldScheduleReengage({ ...base, now: noon(6, 59) })).toBe(false);
    // Boundary: 07:00 is allowed, 22:59 is allowed.
    expect(shouldScheduleReengage({ ...base, now: noon(7, 0) })).toBe(true);
    expect(shouldScheduleReengage({ ...base, now: noon(22, 59) })).toBe(true);
  });

  it('honors custom cap / cooldown overrides', () => {
    expect(shouldScheduleReengage({ ...base, firedTodayCount: 2, capPerDay: 2 })).toBe(false);
    const now = noon();
    expect(shouldScheduleReengage({
      ...base, now, lastFiredAtMs: now.getTime() - 5 * 60_000, cooldownMin: 3,
    })).toBe(true);
  });
});
