// The Activity-journey store. What these pin, in order of how expensive the
// bug would be: (1) an event fired before hydrate must not overwrite stored
// history with a one-entry file, (2) re-fired awards dedupe by id, (3) the cap
// keeps the newest, (4) a second hydrate UNIONS disk into the cache — the
// cloud-restore path writes disk under a live process and remounts, and a
// replace-hydrate (or none) would clobber the restored rows on the next write.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    getItem: async (k: string) => (k in store ? store[k] : null),
    setItem: async (k: string, v: string) => { store[k] = v; },
    __store: store,
  };
});

import {
  recordJourneyEvent, hydrateJourney, getJourneyEntries, isJourneyHydrated,
  subscribeJourney, JOURNEY_CAP, __resetJourneyForTest, type JourneyEntry,
} from '../src/state/journeyLog';

const mockAS = jest.requireMock('@react-native-async-storage/async-storage');
const KEY = 'journey:v1';

const plan = (slug: string, at: number): JourneyEntry => ({ id: `plan:${slug}`, kind: 'plan', at, slug });
const disk = () => JSON.parse(mockAS.__store[KEY]).entries as JourneyEntry[];
const seed = (entries: JourneyEntry[]) => { mockAS.__store[KEY] = JSON.stringify({ v: 1, entries }); };
const flush = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };

beforeEach(() => {
  __resetJourneyForTest();
  for (const k of Object.keys(mockAS.__store)) delete mockAS.__store[k];
});

test('starts unhydrated with a stable empty snapshot', async () => {
  expect(isJourneyHydrated()).toBe(false);
  const a = getJourneyEntries();
  expect(a).toEqual([]);
  expect(getJourneyEntries()).toBe(a);          // referentially stable for useSyncExternalStore
  await hydrateJourney();
  expect(isJourneyHydrated()).toBe(true);
});

test('an event fired BEFORE any hydrate unions with disk instead of clobbering it', async () => {
  seed([plan('old', 100)]);
  recordJourneyEvent(plan('new', 200));         // no hydrateJourney() call anywhere first
  await flush();
  expect(disk().map(e => e.id)).toEqual(['plan:new', 'plan:old']);
});

test('dedupes by id — a re-fired award is dropped silently', async () => {
  recordJourneyEvent(plan('a', 100));
  recordJourneyEvent({ ...plan('a', 999) });
  await flush();
  expect(getJourneyEntries()).toHaveLength(1);
  expect(getJourneyEntries()[0].at).toBe(100);
});

test('caps at JOURNEY_CAP, keeping the newest', async () => {
  seed(Array.from({ length: JOURNEY_CAP }, (_, i) => plan(`p${i}`, i + 1)));
  recordJourneyEvent(plan('fresh', 10_000));
  await flush();
  const d = disk();
  expect(d).toHaveLength(JOURNEY_CAP);
  expect(d[0].id).toBe('plan:fresh');
  expect(d.some(e => e.id === 'plan:p0')).toBe(false);   // oldest fell off
});

test('a second hydrate absorbs entries a cloud restore wrote to disk', async () => {
  await hydrateJourney();
  recordJourneyEvent(plan('mine', 300));
  await flush();
  // Restore: merged snapshot (local ∪ remote) lands on disk behind our back.
  seed([plan('mine', 300), plan('theirs', 200)]);
  await hydrateJourney();                        // post-remount Profile mount
  expect(getJourneyEntries().map(e => e.id)).toEqual(['plan:mine', 'plan:theirs']);
  recordJourneyEvent(plan('later', 400));
  await flush();
  expect(disk().map(e => e.id)).toEqual(['plan:later', 'plan:mine', 'plan:theirs']);
});

test('garbage on disk hydrates to empty instead of throwing', async () => {
  mockAS.__store[KEY] = '{not json';
  await hydrateJourney();
  expect(getJourneyEntries()).toEqual([]);
  seed([{ id: '', kind: 'plan', at: 1, slug: 'x' } as JourneyEntry,
        { id: 'ok', kind: 'nope', at: 2 } as unknown as JourneyEntry,
        plan('good', 3)]);
  __resetJourneyForTest();
  await hydrateJourney();
  expect(getJourneyEntries().map(e => e.id)).toEqual(['plan:good']);
});

test('a no-change re-hydrate keeps the snapshot reference and stays silent', async () => {
  recordJourneyEvent(plan('a', 1));
  await flush();
  const snap = getJourneyEntries();
  const seen: number[] = [];
  const off = subscribeJourney(() => seen.push(1));
  await hydrateJourney();                        // disk == cache — must be a no-op
  expect(getJourneyEntries()).toBe(snap);
  expect(seen).toEqual([]);
  off();
});

test('notifies subscribers on hydrate and on record', async () => {
  const seen: number[] = [];
  const off = subscribeJourney(() => seen.push(getJourneyEntries().length));
  await hydrateJourney();
  recordJourneyEvent(plan('a', 1));
  await flush();
  expect(seen).toEqual([0, 1]);
  off();
  recordJourneyEvent(plan('b', 2));
  await flush();
  expect(seen).toEqual([0, 1]);                  // unsubscribed — no more calls
});
