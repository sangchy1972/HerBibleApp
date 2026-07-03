import {
  shouldScheduleBackgroundNudge,
  activeSlotFor,
  type NudgeInput,
} from '../src/state/backgroundNudge';

// Base = every gate open, `now` exactly at the 8:00 reminder (480 min).
function base(overrides: Partial<NudgeInput> = {}): NudgeInput {
  return {
    now: new Date(2026, 6, 2, 8, 0, 0),
    slot: 'morning',
    reminderMinutes: 8 * 60,
    slotEnabled: true,
    permissionGranted: true,
    alreadyPrayed: false,
    firedTodayForSlot: false,
    ...overrides,
  };
}

describe('shouldScheduleBackgroundNudge', () => {
  it('fires when all gates pass and now is at the reminder time', () => {
    expect(shouldScheduleBackgroundNudge(base())).toBe(true);
  });

  it('is blocked when the slot is disabled', () => {
    expect(shouldScheduleBackgroundNudge(base({ slotEnabled: false }))).toBe(false);
  });

  it('is blocked when permission is not granted', () => {
    expect(shouldScheduleBackgroundNudge(base({ permissionGranted: false }))).toBe(false);
  });

  it('is blocked when the user already prayed this slot', () => {
    expect(shouldScheduleBackgroundNudge(base({ alreadyPrayed: true }))).toBe(false);
  });

  it('is blocked when it already fired today for this slot', () => {
    expect(shouldScheduleBackgroundNudge(base({ firedTodayForSlot: true }))).toBe(false);
  });

  it('does NOT pre-empt: blocked 1 min before the reminder time', () => {
    // The scheduled daily reminder covers the lead-up; a nudge before it would
    // be a near-duplicate. Window opens AT the reminder time (before = 0).
    expect(shouldScheduleBackgroundNudge(base({ now: new Date(2026, 6, 2, 7, 59) }))).toBe(false);
  });

  it('is blocked well before the reminder', () => {
    expect(shouldScheduleBackgroundNudge(base({ now: new Date(2026, 6, 2, 7, 30) }))).toBe(false);
  });

  it('still fires with an explicit before-window override', () => {
    expect(shouldScheduleBackgroundNudge(base({ now: new Date(2026, 6, 2, 7, 30), windowBeforeMin: 30 }))).toBe(true);
  });

  it('fires 120 min AFTER the reminder (window close edge)', () => {
    expect(shouldScheduleBackgroundNudge(base({ now: new Date(2026, 6, 2, 10, 0) }))).toBe(true);
  });

  it('is blocked 121 min after (outside the after-window)', () => {
    expect(shouldScheduleBackgroundNudge(base({ now: new Date(2026, 6, 2, 10, 1) }))).toBe(false);
  });

  it('respects custom window bounds', () => {
    const i = base({ now: new Date(2026, 6, 2, 8, 45), windowAfterMin: 30 });
    expect(shouldScheduleBackgroundNudge(i)).toBe(false); // 45 > 30
  });

  it('works for the night slot at 20:00', () => {
    const i = base({ slot: 'night', reminderMinutes: 20 * 60, now: new Date(2026, 6, 2, 20, 15) });
    expect(shouldScheduleBackgroundNudge(i)).toBe(true);
  });
});

describe('activeSlotFor', () => {
  it('picks morning before 15:00', () => {
    expect(activeSlotFor(new Date(2026, 6, 2, 6, 0))).toBe('morning');
    expect(activeSlotFor(new Date(2026, 6, 2, 14, 59))).toBe('morning');
  });
  it('picks night at/after 15:00', () => {
    expect(activeSlotFor(new Date(2026, 6, 2, 15, 0))).toBe('night');
    expect(activeSlotFor(new Date(2026, 6, 2, 22, 0))).toBe('night');
  });
});
