import { slotView, migrateV1 } from '../src/state/GospelsPsalmsContext';

// Pure-function coverage for the v2 per-slot progress model: derived
// advancement (the "checks reset by construction" guarantee), the day-89
// terminal state, clock-backwards safety, and the v1 → v2 migration table.

const TODAY = '2026-07-04';
const YESTERDAY = '2026-07-03';

describe('slotView', () => {
  it('unread day → not done, no advancement', () => {
    expect(slotView({ day: 5, completedYmd: null }, TODAY))
      .toEqual({ day: 5, doneToday: false, complete: false });
  });

  it('read today → doneToday, same day', () => {
    expect(slotView({ day: 5, completedYmd: TODAY }, TODAY))
      .toEqual({ day: 5, doneToday: true, complete: false });
  });

  it('read yesterday → advanced view (day+1, unchecked) even before any write', () => {
    expect(slotView({ day: 5, completedYmd: YESTERDAY }, TODAY))
      .toEqual({ day: 6, doneToday: false, complete: false });
  });

  it('day 89 read → terminal complete; never advances past 89', () => {
    expect(slotView({ day: 89, completedYmd: YESTERDAY }, TODAY))
      .toEqual({ day: 89, doneToday: false, complete: true });
  });

  it('day 89 unread → not complete, still the working day', () => {
    expect(slotView({ day: 89, completedYmd: null }, TODAY))
      .toEqual({ day: 89, doneToday: false, complete: false });
  });

  it('clock set backwards (completedYmd in the future) → not doneToday AND not advanced', () => {
    expect(slotView({ day: 5, completedYmd: '2026-07-10' }, TODAY))
      .toEqual({ day: 5, doneToday: false, complete: false });
  });
});

describe('migrateV1', () => {
  it('one slot done (v1 never stamped ymd for a lone flag) → credited today, other slot open', () => {
    const v2 = migrateV1({ day: 5, mDone: true, eDone: false, completedYmd: null }, TODAY);
    expect(v2.morning).toEqual({ day: 5, completedYmd: TODAY });
    expect(v2.evening).toEqual({ day: 5, completedYmd: null });
    expect(v2.round).toBe(1);
  });

  it('both done with stamp (awaiting rollover) → both carry the stamp; view advances both', () => {
    const v2 = migrateV1({ day: 5, mDone: true, eDone: true, completedYmd: YESTERDAY }, TODAY);
    expect(slotView(v2.morning, TODAY)).toEqual({ day: 6, doneToday: false, complete: false });
    expect(slotView(v2.evening, TODAY)).toEqual({ day: 6, doneToday: false, complete: false });
  });

  it('the v1 stuck record (both done, ymd null) → self-heals: credited today, advances tomorrow', () => {
    const v2 = migrateV1({ day: 1, mDone: true, eDone: true, completedYmd: null }, TODAY);
    expect(slotView(v2.morning, TODAY)).toEqual({ day: 1, doneToday: true, complete: false });
    expect(slotView(v2.morning, '2026-07-05')).toEqual({ day: 2, doneToday: false, complete: false });
  });

  it('v1 plan-complete → both slots terminal-complete (round reset handled by the provider)', () => {
    const v2 = migrateV1({ day: 89, mDone: true, eDone: true, completedYmd: YESTERDAY }, TODAY);
    expect(slotView(v2.morning, TODAY).complete).toBe(true);
    expect(slotView(v2.evening, TODAY).complete).toBe(true);
  });

  it('garbage day is clamped', () => {
    const v2 = migrateV1({ day: 999, mDone: false, eDone: false, completedYmd: null }, TODAY);
    expect(v2.morning.day).toBe(89);
  });
});
