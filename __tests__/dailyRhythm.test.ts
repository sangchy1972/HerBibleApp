import { computeRhythm, pickOngoingPlan, type RhythmInput } from '../src/state/dailyRhythm';

const TODAY = '2026-07-02';

const base: RhythmInput = {
  hour: 10,
  todayYmd: TODAY,
  mDone: false,
  eDone: false,
  gospelReady: true,
  gospelMorningDone: false,
  gospelEveningDone: false,
  gospelPlanComplete: false,
  planRecords: {},
};

const plan = (over: Partial<RhythmInput['planRecords'][string]> = {}) => ({
  completedDays: [1], firstStartedAt: 1000, ...over,
});

describe('computeRhythm — next-step selection', () => {
  it('morning, nothing done → morning prayer first', () => {
    const v = computeRhythm(base);
    expect(v.state).toEqual({ kind: 'step', step: 'prayerMorning' });
    expect(v.dots).toEqual(['current', 'locked', 'pending', 'pending', 'pending']);
  });

  it('evening, nothing done → evening prayer first, then morning catch-up', () => {
    const v = computeRhythm({ ...base, hour: 20 });
    expect(v.state).toEqual({ kind: 'step', step: 'prayerEvening' });
    const v2 = computeRhythm({ ...base, hour: 20, eDone: true });
    expect(v2.state).toEqual({ kind: 'step', step: 'prayerMorning' });
  });

  it('10:00 with morning prayer done → evening prayer is LOCKED, skips to morning gospel', () => {
    const v = computeRhythm({ ...base, mDone: true });
    expect(v.state).toEqual({ kind: 'step', step: 'gospelMorning' });
    expect(v.dots[1]).toBe('locked');          // evening prayer not startable before 18:00
  });

  it('evening orders gospel evening before gospel morning', () => {
    const v = computeRhythm({ ...base, hour: 19, mDone: true, eDone: true });
    expect(v.state).toEqual({ kind: 'step', step: 'gospelEvening' });
  });

  it('gospel not ready (offline) → gospel steps locked and skipped, plan suggested', () => {
    const v = computeRhythm({ ...base, mDone: true, gospelReady: false });
    expect(v.state).toEqual({ kind: 'step', step: 'plan' });
    expect(v.dots[2]).toBe('locked');
    expect(v.dots[3]).toBe('locked');
  });

  it('gospel 89-day plan complete → steps retired, count as done, never suggested', () => {
    const v = computeRhythm({ ...base, mDone: true, gospelPlanComplete: true });
    expect(v.state).toEqual({ kind: 'step', step: 'plan' });
    expect(v.dots[2]).toBe('retired');
    expect(v.dots[3]).toBe('retired');
  });

  it('plan done today (lastDayYmd) → step 5 done', () => {
    const v = computeRhythm({
      ...base, mDone: true, gospelMorningDone: true,
      planRecords: { a: plan({ lastDayYmd: TODAY }) },
    });
    expect(v.dots[4]).toBe('done');
    expect(v.state).toEqual({ kind: 'step', step: 'gospelEvening' });
  });

  it('plan finished TODAY still counts as done today', () => {
    const v = computeRhythm({
      ...base,
      planRecords: { a: plan({ finishedAt: Date.now(), lastDayYmd: TODAY }) },
    });
    expect(v.dots[4]).toBe('done');
  });

  it('legacy record without lastDayYmd → not done today', () => {
    const v = computeRhythm({ ...base, planRecords: { a: plan() } });
    expect(v.dots[4]).toBe('pending');
  });
});

describe('computeRhythm — rest states', () => {
  const allDoneDay = {
    ...base, mDone: true, eDone: true,
    gospelMorningDone: true, gospelEveningDone: true,
    planRecords: { a: plan({ lastDayYmd: TODAY }) },
  };

  it('all five done → allDone', () => {
    const v = computeRhythm({ ...allDoneDay, hour: 21, eDone: true });
    expect(v.state).toEqual({ kind: 'allDone' });
    expect(v.doneCount).toBe(5);
  });

  it('everything available done before 18:00 (evening prayer locked) → waitEvening', () => {
    const v = computeRhythm({ ...allDoneDay, eDone: false, hour: 10 });
    expect(v.state).toEqual({ kind: 'waitEvening' });
    expect(v.dots[1]).toBe('locked');
  });

  it('dead zone 02:00 with only locked prayers left → deadZone', () => {
    const v = computeRhythm({
      ...base, hour: 2,
      gospelMorningDone: true, gospelEveningDone: true,
      planRecords: { a: plan({ lastDayYmd: TODAY }) },
    });
    expect(v.state).toEqual({ kind: 'deadZone' });
    expect(v.dots[0]).toBe('locked');
    expect(v.dots[1]).toBe('locked');
  });

  it('dead zone with a freshly rolled gospel pair → suggests morning gospel first', () => {
    const v = computeRhythm({ ...base, hour: 2 });
    expect(v.state).toEqual({ kind: 'step', step: 'gospelMorning' });
  });

  it('gospel unavailable is EXCLUDED from all-done (offline day never falsely completes)', () => {
    const v = computeRhythm({
      ...base, hour: 21, mDone: true, eDone: true, gospelReady: false,
      planRecords: { a: plan({ lastDayYmd: TODAY }) },
    });
    expect(v.state).toEqual({ kind: 'allDone' });
    expect(v.doneCount).toBe(3);               // gospel dots don't count as done
  });
});

describe('pickOngoingPlan', () => {
  it('no records / all finished → null (explore mode)', () => {
    expect(pickOngoingPlan({})).toBeNull();
    expect(pickOngoingPlan({ a: plan({ finishedAt: 1 }) })).toBeNull();
    expect(pickOngoingPlan({ a: { completedDays: [], firstStartedAt: 0 } })).toBeNull();
  });

  it('picks the freshest lastDayYmd, tiebreak by firstStartedAt', () => {
    expect(pickOngoingPlan({
      a: plan({ lastDayYmd: '2026-07-01' }),
      b: plan({ lastDayYmd: '2026-06-20' }),
    })).toBe('a');
    expect(pickOngoingPlan({
      a: plan({ lastDayYmd: '2026-07-01', firstStartedAt: 1 }),
      b: plan({ lastDayYmd: '2026-07-01', firstStartedAt: 2 }),
    })).toBe('b');
  });

  it('legacy records without lastDayYmd sort below dated ones', () => {
    expect(pickOngoingPlan({
      legacy: plan({ firstStartedAt: 99 }),
      dated: plan({ lastDayYmd: '2026-01-01', firstStartedAt: 1 }),
    })).toBe('dated');
  });

  it('mode is ongoing/explore accordingly in the view', () => {
    expect(computeRhythm({ ...base, planRecords: { a: plan() } }).planMode).toBe('ongoing');
    expect(computeRhythm(base).planMode).toBe('explore');
  });
});
