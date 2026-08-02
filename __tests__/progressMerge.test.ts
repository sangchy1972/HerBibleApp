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
    ]) expect(BACKUP_KEYS).toContain(key);
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
});
