import { mergeSnapshots, BACKUP_KEYS } from '../src/services/progressMerge';

const j = (v: unknown) => JSON.stringify(v);

describe('mergeSnapshots', () => {
  test('fresh install: empty local → remote wins for every key', () => {
    const remote = {
      'prayer:records:v1': j({ '2026-07-01': { m: true, e: true } }),
      'ui:lang:v1': 'zh-Hans',
      'onboarding:done:v1': '1',
      'shares:count': '7',
    };
    const { merged, changedKeys } = mergeSnapshots({}, remote);
    expect(merged).toEqual(remote);
    expect(changedKeys.sort()).toEqual(Object.keys(remote).sort());
  });

  test('remote empty (first-ever backup): local passes through unchanged', () => {
    const local = { 'ui:lang:v1': 'fr', 'activity:dates': j(['2026-07-18']) };
    const { merged, changedKeys } = mergeSnapshots(local, {});
    expect(merged).toEqual(local);
    expect(changedKeys).toEqual([]);
  });

  test('prayer records: days union, either-side completion counts, timestamps kept', () => {
    const local = { 'prayer:records:v1': j({ '2026-07-18': { m: true, e: false, mAt: 'L' } }) };
    const remote = {
      'prayer:records:v1': j({
        '2026-07-18': { m: false, e: true, eAt: 'R' },
        '2026-07-10': { m: true, e: true },
      }),
    };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['prayer:records:v1']);
    expect(out['2026-07-18']).toEqual({ m: true, e: true, mAt: 'L', eAt: 'R' });
    expect(out['2026-07-10']).toEqual({ m: true, e: true });
  });

  test('plan records: per-slug union of days, earliest start, finish preserved, remote-only slug kept', () => {
    const local = { 'plan-completion:v1': j({ hope: { completedDays: [1, 2], firstStartedAt: 200 } }) };
    const remote = {
      'plan-completion:v1': j({
        hope: { completedDays: [2, 3], firstStartedAt: 100, lastDayYmd: '2026-06-01' },
        peace: { completedDays: [1], firstStartedAt: 50, finishedAt: 60 },
      }),
    };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['plan-completion:v1']);
    expect(out.hope.completedDays).toEqual([1, 2, 3]);
    expect(out.hope.firstStartedAt).toBe(100);
    expect(out.hope.lastDayYmd).toBe('2026-06-01');
    expect(out.peace.finishedAt).toBe(60);
  });

  test('gospels-psalms: the further-along snapshot wins wholesale', () => {
    const behind = j({ v: 2, round: 0, morning: { day: 5 }, evening: { day: 4 } });
    const ahead = j({ v: 2, round: 1, morning: { day: 2 }, evening: { day: 1 } });
    expect(
      mergeSnapshots({ 'gospels-psalms:progress:v2': behind }, { 'gospels-psalms:progress:v2': ahead })
        .merged['gospels-psalms:progress:v2'],
    ).toBe(ahead);
  });

  test('notes: union by id without duplicates, newest savedAt first', () => {
    const local = { 'notes:v1': j([{ id: 'a', savedAt: '2026-07-01' }]) };
    const remote = { 'notes:v1': j([{ id: 'a', savedAt: '2026-07-01' }, { id: 'b', savedAt: '2026-07-10' }]) };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['notes:v1']);
    expect(out.map((n: { id: string }) => n.id)).toEqual(['b', 'a']);
  });

  test('achievements: count max, first min, last max', () => {
    const local = { 'achievements:v1': j({ streak7: { count: 1, firstAwardedAt: 500, lastAwardedAt: 500 } }) };
    const remote = { 'achievements:v1': j({ streak7: { count: 3, firstAwardedAt: 100, lastAwardedAt: 900 } }) };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['achievements:v1']);
    expect(out.streak7).toEqual({ count: 3, firstAwardedAt: 100, lastAwardedAt: 900 });
  });

  test('scalar strategies: counter max, first-launch min, settings prefer local, flags sticky', () => {
    const local = { 'shares:count': '3', 'daily-verses:first-launch-date': '2026-07-01', 'ui:lang:v1': 'de' };
    const remote = { 'shares:count': '9', 'daily-verses:first-launch-date': '2025-12-25', 'ui:lang:v1': 'en', 'onboarding:done:v1': '1' };
    const { merged } = mergeSnapshots(local, remote);
    expect(merged['shares:count']).toBe('9');
    expect(merged['daily-verses:first-launch-date']).toBe('2025-12-25');
    expect(merged['ui:lang:v1']).toBe('de');
    expect(merged['onboarding:done:v1']).toBe('1');
  });

  test('malformed remote JSON never destroys local data', () => {
    const local = { 'prayer:records:v1': j({ '2026-07-18': { m: true, e: false } }) };
    const remote = { 'prayer:records:v1': '{corrupt!!' };
    const { merged, changedKeys } = mergeSnapshots(local, remote);
    expect(merged['prayer:records:v1']).toBe(local['prayer:records:v1']);
    expect(changedKeys).toEqual([]);
  });

  test('identical snapshots report no changes (no needless remount)', () => {
    const same = { 'activity:dates': j(['2026-07-18']), 'ui:lang:v1': 'en' };
    expect(mergeSnapshots(same, { ...same }).changedKeys).toEqual([]);
  });

  test('manifest sanity: core progress keys are all covered', () => {
    for (const key of [
      'prayer:records:v1', 'plan-completion:v1', 'notes:v1', 'savedVerses',
      'highlights:v1', 'achievements:v1', 'daily-verses:first-launch-date',
      'onboarding:answers:v1', 'notifications:v1',
      // If this one is ever dropped, a restore lands with `earned` full and
      // `seen` absent — and the context only backfills when the key has NEVER
      // existed, so the user gets a green NEW ribbon on every badge she has
      // owned for months.
      'achievements:seen:v1',
      // The quiz shipped without these. A reinstall reset the whole ladder.
      'quiz:progress:v1', 'quiz:cards:v1', 'quiz:card-likes:v1', 'quiz:dates:v1',
    ]) expect(BACKUP_KEYS).toContain(key);
  });

  test('daily history unions by date and takes the MAX, never the sum', () => {
    // Sum looks right for two devices used on one day and corrupts every
    // ordinary restore, which replays the same day against itself.
    const day = (ymd: string, sets: number, questions: number, wrong: number) => ({ ymd, sets, questions, firstPassWrong: wrong });
    const local = { 'quiz:dates:v1': JSON.stringify({ v: 1, days: [day('2026-08-01', 2, 10, 1), day('2026-08-02', 1, 5, 0)] }) };
    const remote = { 'quiz:dates:v1': JSON.stringify({ v: 1, days: [day('2026-08-01', 2, 10, 1), day('2026-08-03', 3, 15, 2)] }) };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['quiz:dates:v1'] as string);
    expect(out.days.map((d: any) => d.ymd)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    // The shared day is NOT 4 sets.
    expect(out.days[0].sets).toBe(2);
    expect(out.days[0].questions).toBe(10);
  });

  test('quiz ladder: every counter takes the max, so a stale device cannot drag her back', () => {
    const local = { 'quiz:progress:v1': JSON.stringify({ v: 1, bankVersion: 2, setIndex: 12, completedSets: 12, perfectSets: 5, totalCorrect: 51, lastCompletedYmd: '2026-08-01' }) };
    const remote = { 'quiz:progress:v1': JSON.stringify({ v: 1, bankVersion: 2, setIndex: 7, completedSets: 7, perfectSets: 6, totalCorrect: 33, lastCompletedYmd: '2026-08-03' }) };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['quiz:progress:v1'] as string);
    expect(out.setIndex).toBe(12);
    expect(out.completedSets).toBe(12);
    expect(out.perfectSets).toBe(6);          // the OTHER device was better here
    expect(out.totalCorrect).toBe(51);
    expect(out.lastCompletedYmd).toBe('2026-08-03');
  });

  test('cards: collection unions and an unspent draw survives from either side', () => {
    // Losing pendingDraw would silently eat a reward she worked three sets for.
    const local = { 'quiz:cards:v1': JSON.stringify({ v: 1, collected: ['doubt-1', 'weary-2'], drawsTaken: 2, pendingDraw: false }) };
    const remote = { 'quiz:cards:v1': JSON.stringify({ v: 1, collected: ['weary-2', 'lack-1'], drawsTaken: 2, pendingDraw: true }) };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['quiz:cards:v1'] as string);
    expect(new Set(out.collected)).toEqual(new Set(['doubt-1', 'weary-2', 'lack-1']));
    expect(out.pendingDraw).toBe(true);
    // Never fewer draws than cards she visibly holds.
    expect(out.drawsTaken).toBe(3);
  });

  test('seen-badge set unions across devices rather than intersecting', () => {
    // "Seen on any device" must win. Intersecting would re-announce badges as
    // NEW on every device she has ever signed into.
    const local = { 'achievements:seen:v1': JSON.stringify(['prayer.first', 'note.count10']) };
    const remote = { 'achievements:seen:v1': JSON.stringify(['prayer.first', 'milestone.crown']) };
    const out = mergeSnapshots(local, remote).merged['achievements:seen:v1'];
    expect(new Set(JSON.parse(out as string))).toEqual(
      new Set(['prayer.first', 'note.count10', 'milestone.crown']),
    );
  });

  test('journey: union by id across devices, newest first, one row per milestone', () => {
    // The id encodes the milestone (badge×count / plan slug / puzzle ordinal),
    // so the same milestone recorded on two devices collapses to one row.
    const local = { 'journey:v1': j({ v: 1, entries: [
      { id: 'plan:hope-7', kind: 'plan', at: 200, slug: 'hope-7' },
      { id: 'badge:prayer.first:1', kind: 'badge', at: 100, badgeId: 'prayer.first', count: 1 },
    ] }) };
    const remote = { 'journey:v1': j({ v: 1, entries: [
      { id: 'plan:hope-7', kind: 'plan', at: 200, slug: 'hope-7' },
      { id: 'puzzle:3', kind: 'puzzle', at: 300, paintingIndex: 0, finishedPainting: false },
    ] }) };
    const out = JSON.parse(mergeSnapshots(local, remote).merged['journey:v1'] as string);
    expect(out.entries.map((e: any) => e.id)).toEqual(['puzzle:3', 'plan:hope-7', 'badge:prayer.first:1']);
  });

  test('journey: a malformed side falls back to the healthy one', () => {
    const healthy = { 'journey:v1': j({ v: 1, entries: [{ id: 'plan:a', kind: 'plan', at: 1, slug: 'a' }] }) };
    const broken = { 'journey:v1': '{not json' };
    expect(JSON.parse(mergeSnapshots(broken, healthy).merged['journey:v1'] as string).entries).toHaveLength(1);
    expect(JSON.parse(mergeSnapshots(healthy, broken).merged['journey:v1'] as string).entries).toHaveLength(1);
  });
});
