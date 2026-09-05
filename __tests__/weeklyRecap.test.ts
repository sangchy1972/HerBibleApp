import {
  weekStartOf, coveredWeekOf, computeWeeklyStats, resolvePersona,
  promptStateFor, shouldPromptRecap, markPromptShown, markPromptOpened,
  MAX_SHOWS_PER_WEEK, type WeekInput, type WeekSlice,
} from '../src/services/weeklyRecap';

// 2026-09-05 is a Saturday; 2026-09-06 a Sunday (the app's spec anchor week).
const SAT = '2026-09-05';
const SUN = '2026-09-06';

const emptyInput: WeekInput = {
  prayerRecords: {},
  activityDates: new Set(),
  quizDays: [],
  chapterCounts: {},
};

const slice = (over: Partial<WeekSlice>): WeekSlice => ({
  amen: 0, morningAmen: 0, eveningAmen: 0,
  activeDays: [false, false, false, false, false, false, false],
  activeCount: 0, chapters: 0, quizQuestions: 0, quizPct: null,
  hasAnyData: true, ...over,
});

describe('week calendar (Sunday start)', () => {
  test('weekStartOf lands on Sunday for every day of the week', () => {
    expect(weekStartOf(SUN)).toBe('2026-09-06');
    expect(weekStartOf('2026-09-09')).toBe('2026-09-06'); // Wednesday
    expect(weekStartOf('2026-09-12')).toBe('2026-09-06'); // Saturday
  });

  test('coveredWeekOf spans the completed Sun..Sat regardless of open day', () => {
    // Opening on Sunday, mid-week, or the following Saturday all cover the
    // same finished week — the owner's "late open still gets last week" rule.
    for (const day of ['2026-09-06', '2026-09-09', '2026-09-12']) {
      expect(coveredWeekOf(day)).toEqual({ start: '2026-08-30', end: '2026-09-05' });
    }
  });

  test('month/year boundaries roll correctly', () => {
    expect(coveredWeekOf('2026-01-01')).toEqual({ start: '2025-12-21', end: '2025-12-27' });
  });
});

describe('computeWeeklyStats', () => {
  const input: WeekInput = {
    prayerRecords: {
      '2026-08-30': { m: true, e: true },
      '2026-08-31': { m: true, e: false },
      '2026-09-04': { m: false, e: true },
      // Outside the covered week AND outside its predecessor — must be ignored
      // by both slices (09-06 is the current week; 08-22 is two weeks back):
      '2026-09-06': { m: true, e: true },
      '2026-08-22': { m: true, e: true },
    },
    activityDates: new Set(['2026-08-30', '2026-08-31', '2026-09-04', '2026-09-07']),
    quizDays: [
      { ymd: '2026-08-31', sets: 2, questions: 20, firstPassWrong: 4 },
      { ymd: '2026-09-07', sets: 1, questions: 10, firstPassWrong: 0 },
    ],
    chapterCounts: { '2026-08-30': 2, '2026-09-05': 1, '2026-09-06': 9 },
  };

  test('aggregates only the covered week', () => {
    const s = computeWeeklyStats(input, SUN);
    expect(s.weekStartYmd).toBe('2026-08-30');
    expect(s.weekEndYmd).toBe('2026-09-05');
    expect(s.cur.amen).toBe(4);
    expect(s.cur.morningAmen).toBe(2);
    expect(s.cur.eveningAmen).toBe(2);
    expect(s.cur.activeCount).toBe(3);
    expect(s.cur.activeDays).toEqual([true, true, false, false, false, true, false]);
    expect(s.cur.chapters).toBe(3);
    expect(s.cur.quizQuestions).toBe(20);
    expect(s.cur.quizPct).toBe(80);
  });

  test('previous week empty → delta null (fresh start, never -0)', () => {
    const s = computeWeeklyStats(input, SUN);
    expect(s.delta).toBeNull();
  });

  test('previous week with data → real deltas', () => {
    const withPrev: WeekInput = {
      ...input,
      prayerRecords: { ...input.prayerRecords, '2026-08-25': { m: true, e: false } },
      activityDates: new Set([...input.activityDates, '2026-08-25', '2026-08-26']),
    };
    const s = computeWeeklyStats(withPrev, SUN);
    expect(s.delta).toEqual({ amen: 3, chapters: 3, activeDays: 1, quizPct: null });
  });

  test('zero-activity week still produces a recap payload', () => {
    const s = computeWeeklyStats(emptyInput, SUN);
    expect(s.cur.hasAnyData).toBe(false);
    expect(s.persona).toBe('quietSojourner');
  });
});

describe('resolvePersona order', () => {
  const prevQuiet = slice({ activeCount: 0, hasAnyData: false });
  const prevBusy = slice({ activeCount: 5 });

  test('empty week → quietSojourner', () => {
    expect(resolvePersona(slice({ hasAnyData: false }), prevBusy)).toBe('quietSojourner');
  });
  test('comeback beats everything else', () => {
    expect(resolvePersona(slice({ activeCount: 7, morningAmen: 7, amen: 7 }), prevQuiet)).toBe('returningHeart');
  });
  test('full seven days → steadfastWalker', () => {
    expect(resolvePersona(slice({ activeCount: 7 }), prevBusy)).toBe('steadfastWalker');
  });
  test('mornings carry → sunriseKeeper; evenings carry → lampAtDusk', () => {
    expect(resolvePersona(slice({ activeCount: 5, morningAmen: 5, eveningAmen: 2, amen: 7 }), prevBusy)).toBe('sunriseKeeper');
    expect(resolvePersona(slice({ activeCount: 5, morningAmen: 1, eveningAmen: 5, amen: 6 }), prevBusy)).toBe('lampAtDusk');
  });
  test('reading-led week → deepDiver', () => {
    expect(resolvePersona(slice({ activeCount: 4, chapters: 9, amen: 3, morningAmen: 2, eveningAmen: 1 }), prevBusy)).toBe('deepDiver');
  });
  test('sharp quiz week → wordScholar', () => {
    expect(resolvePersona(slice({ activeCount: 4, quizPct: 92, quizQuestions: 30 }), prevBusy)).toBe('wordScholar');
  });
  test('modest week → seedPlanter', () => {
    expect(resolvePersona(slice({ activeCount: 2, amen: 1, morningAmen: 1 }), prevBusy)).toBe('seedPlanter');
  });
});

describe('prompt eligibility (1/day, 3/week, opened kills, new-user exempt)', () => {
  const base = { firstLaunchYmd: '2026-08-01' };

  test('fresh week resets stored state', () => {
    const stale = { weekStart: '2026-08-23', shownOn: ['2026-08-27'], opened: true };
    const s = promptStateFor(stale, SUN);
    expect(s).toEqual({ weekStart: '2026-08-30', shownOn: [], opened: false });
  });

  test('eligible on a clean day; blocked same day after a show', () => {
    let s = promptStateFor(null, SUN);
    expect(shouldPromptRecap({ state: s, todayYmd: SUN, ...base })).toBe(true);
    s = markPromptShown(s, SUN);
    expect(shouldPromptRecap({ state: s, todayYmd: SUN, ...base })).toBe(false);
    expect(shouldPromptRecap({ state: s, todayYmd: '2026-09-07', ...base })).toBe(true);
  });

  test('third show exhausts the week', () => {
    let s = promptStateFor(null, SUN);
    s = markPromptShown(s, '2026-09-06');
    s = markPromptShown(s, '2026-09-07');
    s = markPromptShown(s, '2026-09-08');
    expect(s.shownOn).toHaveLength(MAX_SHOWS_PER_WEEK);
    expect(shouldPromptRecap({ state: s, todayYmd: '2026-09-09', ...base })).toBe(false);
  });

  test('opening the flow silences the rest of the week', () => {
    let s = promptStateFor(null, SUN);
    s = markPromptOpened(markPromptShown(s, SUN));
    expect(shouldPromptRecap({ state: s, todayYmd: '2026-09-08', ...base })).toBe(false);
  });

  test('new users (<3 days) are exempt; day 3 is eligible', () => {
    const s = promptStateFor(null, SUN);
    expect(shouldPromptRecap({ state: s, todayYmd: SUN, firstLaunchYmd: '2026-09-04' })).toBe(false);
    expect(shouldPromptRecap({ state: s, todayYmd: SUN, firstLaunchYmd: '2026-09-03' })).toBe(true);
    expect(shouldPromptRecap({ state: s, todayYmd: SUN, firstLaunchYmd: null })).toBe(false);
  });

  test('SAT before the new week still covers the week before it', () => {
    // Saturday 09-05 belongs to the 08-30 week, so its recap covers 08-23..29.
    expect(coveredWeekOf(SAT)).toEqual({ start: '2026-08-23', end: '2026-08-29' });
  });
});
