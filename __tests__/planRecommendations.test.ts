import { recommendPlans, buildReadingPlansCard, scorePlan } from '../src/services/planRecommendations';
import { FEATURED_PLANS_SUMMARY } from '../src/constants/featuredPlansSummary';

const summaries = FEATURED_PLANS_SUMMARY.en;
const YMD = '2026-07-12';
const rec = (over: Partial<Parameters<typeof recommendPlans>[0]> = {}) =>
  recommendPlans({ answers: { topics: [] }, summaries, excludeSlugs: [], todayYmd: YMD, count: 3, ...over });

const record = (days: number[], over: object = {}) =>
  ({ completedDays: days, firstStartedAt: 1, ...over });

describe('recommendPlans', () => {
  it('anxiety topic ranks an anxiety-family plan first; diversity rules hold', () => {
    const out = rec({ answers: { topics: ['anxiety'] } });
    expect(['anxiety', 'anxiety-fear', 'fear']).toContain(out[0].secondary);
    const tags = out.map(p => p.secondary);
    expect(new Set(tags).size).toBe(tags.length);                       // no duplicate tags
    const bySection = out.reduce<Record<string, number>>((m, p) => ({ ...m, [p.primary]: (m[p.primary] ?? 0) + 1 }), {});
    Object.values(bySection).forEach(n => expect(n).toBeLessThanOrEqual(2));
  });

  it('never suggests started or finished plans', () => {
    const excluded = ['overcoming-anxiety', 'rhythms-of-prayer', 'hope-in-waiting'];
    const out = rec({ answers: { topics: ['anxiety', 'faith', 'hope'] }, excludeSlugs: excluded });
    out.forEach(p => expect(excluded).not.toContain(p.slug));
  });

  it('age gate: 65+ family user gets no motherhood/dating plans', () => {
    const out = rec({ answers: { topics: ['family'], age: '65+' } });
    const banned = ['motherhood', 'as-a-mother', 'mother', 'love-dating', 'in-love', 'newlywed-season'];
    out.forEach(p => expect(banned).not.toContain(p.secondary));
    // ...but an age-neutral family tag still surfaces on top
    expect(['marriage-wifehood', 'wife', 'adult-daughter', 'transition', 'empty-nest']).toContain(out[0].secondary);
  });

  it('deterministic within a day; rotation may differ across days but stays internally stable', () => {
    expect(rec()).toEqual(rec());
    const dayA = rec({ todayYmd: '2026-07-12' });
    const dayB = rec({ todayYmd: '2026-07-13' });
    expect(dayA).toEqual(rec({ todayYmd: '2026-07-12' }));
    expect(dayB).toEqual(rec({ todayYmd: '2026-07-13' }));
  });

  it('bibleLevel steers depth: new users never get the 90/31-day deep reads; regular+30min ranks a long walking-with-god plan first', () => {
    const newbie = rec({ answers: { topics: [], bibleLevel: 'new' } });
    newbie.forEach(p => expect(p.duration_days).toBeLessThan(14));
    const deep = rec({ answers: { topics: [], bibleLevel: 'regular', goal: 'understand', timeCommitment: 30 }, count: 1 });
    expect(deep[0].primary).toBe('walking-with-god');
    expect(deep[0].duration_days).toBeGreaterThanOrEqual(14);
  });

  it('cold start (skipped onboarding) fills from the editorial starter tier', () => {
    const out = rec({ answers: {} });
    expect(out).toHaveLength(3);
    out.forEach(p => expect(scorePlan(p, {} as any).reasons).toContain('starter +1'));
  });
});

describe('buildReadingPlansCard', () => {
  const answers = { topics: ['anxiety'] };

  it('slot math: 0/1/2/5 active → 3/2/1/1 suggested, active capped at 3 by percent', () => {
    const zero = buildReadingPlansCard({ records: {}, summaries, answers, todayYmd: YMD });
    expect(zero.active).toHaveLength(0);
    expect(zero.suggested).toHaveLength(3);

    const one = buildReadingPlansCard({
      records: { 'rhythms-of-prayer': record([1]) }, summaries, answers, todayYmd: YMD,
    });
    expect(one.active).toHaveLength(1);
    expect(one.suggested).toHaveLength(2);

    const two = buildReadingPlansCard({
      records: { 'rhythms-of-prayer': record([1]), 'hope-in-waiting': record([1, 2]) },
      summaries, answers, todayYmd: YMD,
    });
    expect(two.active).toHaveLength(2);
    expect(two.suggested).toHaveLength(1);

    const five = buildReadingPlansCard({
      records: {
        'rhythms-of-prayer': record([1]),                        // 1/7
        'hope-in-waiting': record([1, 2, 3, 4, 5, 6]),           // 6/7 — fastest
        'overcoming-anxiety': record([1, 2, 3]),                 // 3/5
        'gift-of-sabbath': record([1, 2]),                       // 2/7
        'the-power-of-words': record([1, 2, 3, 4]),              // 4/5 — 2nd
      },
      summaries, answers, todayYmd: YMD,
    });
    expect(five.active).toHaveLength(3);
    expect(five.suggested).toHaveLength(1);
    expect(five.active[0].plan.slug).toBe('hope-in-waiting');
    expect(five.active[1].plan.slug).toBe('the-power-of-words');
    expect(five.active.map(a => a.percent)).toEqual([...five.active.map(a => a.percent)].sort((a, b) => b - a));
  });

  it('finished plans are not active but stay excluded from suggestions', () => {
    const out = buildReadingPlansCard({
      records: { 'overcoming-anxiety': record([1, 2, 3, 4, 5], { finishedAt: 123 }) },
      summaries, answers, todayYmd: YMD,
    });
    expect(out.active).toHaveLength(0);
    out.suggested.forEach(p => expect(p.slug).not.toBe('overcoming-anxiety'));
  });
});
