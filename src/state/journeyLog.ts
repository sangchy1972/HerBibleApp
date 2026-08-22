import AsyncStorage from '@react-native-async-storage/async-storage';

// The Activity journey — an append-only timeline of user milestones, rendered
// on Profile above the Account section. Records exactly three kinds (owner
// 2026-08-22): a badge earned/re-earned, a reading plan started, a quiz puzzle
// piece collected. Deliberately NOT the daily devotions — those happen every
// day and would drown the milestones.
//
// A module store rather than a context (pattern: overlayCardsPrefs): the
// writers are three unrelated contexts and the one reader is ProfileScreen.
// Entries store only ids — badge id, plan slug, painting index — and resolve
// names/art through the existing helpers at render time, so a CDN /v1/ bump
// or copy change can never strand stale text in the log.
//
// The log is record-forward: milestones earned before this shipped have no
// trustworthy dates, and inventing them would make the timeline lie. An empty
// log simply hides the section.

export type JourneyEntry =
  | { id: string; kind: 'badge'; at: number; badgeId: string; count: number }
  | { id: string; kind: 'plan'; at: number; slug: string }
  | { id: string; kind: 'puzzle'; at: number; paintingIndex: number; finishedPainting: boolean };

const KEY = 'journey:v1';   // NOT 'activity:*' — that prefix is the days-read set
export const JOURNEY_CAP = 100;

let entries: JourneyEntry[] | null = null;   // null until the first hydrate lands
const EMPTY: JourneyEntry[] = [];
const subs = new Set<() => void>();
let inflight: Promise<void> | null = null;

function notify() {
  subs.forEach(f => { try { f(); } catch {} });
}

function isEntry(x: unknown): x is JourneyEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id || typeof e.at !== 'number' || !Number.isFinite(e.at)) return false;
  if (e.kind === 'badge') return typeof e.badgeId === 'string' && typeof e.count === 'number';
  if (e.kind === 'plan') return typeof e.slug === 'string' && !!e.slug;
  if (e.kind === 'puzzle') return typeof e.paintingIndex === 'number' && typeof e.finishedPainting === 'boolean';
  return false;
}

function sanitize(raw: string | null): JourneyEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { entries?: unknown };
    const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return list.filter(isEntry);
  } catch { return []; }
}

// Union by id, first argument wins, newest first, capped. First-argument-wins
// is what makes "a live write outranks a late hydrate" fall out for free.
function unionCap(a: JourneyEntry[], b: JourneyEntry[]): JourneyEntry[] {
  const seen = new Set(a.map(e => e.id));
  const merged = [...a, ...b.filter(e => !seen.has(e.id))];
  merged.sort((x, y) => y.at - x.at);
  return merged.slice(0, JOURNEY_CAP);
}

export function isJourneyHydrated(): boolean { return entries !== null; }

/** Stable reference between changes — safe for useSyncExternalStore. */
export function getJourneyEntries(): JourneyEntry[] {
  return entries && entries.length ? entries : EMPTY;
}

export function subscribeJourney(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

// Union `disk` into the cache. Keeps the old array reference (and stays
// silent) when nothing changed — unionCap reuses the cached element objects,
// so identity comparison is exact, and a no-op absorb must not hand
// useSyncExternalStore a fresh snapshot. The very first absorb always counts
// as a change: it flips the hydrated flag and ProfileScreen's gate waits on it.
function absorb(disk: JourneyEntry[]): void {
  const cur = entries;
  const next = unionCap(cur ?? [], disk);
  const changed = cur === null
    || next.length !== cur.length
    || next.some((e, i) => e !== cur[i]);
  if (changed) {
    entries = next;
    notify();
  }
}

/**
 * Read disk and UNION it into the cache — not replace, and deliberately
 * re-runnable. A cloud restore writes merged state to disk and remounts the
 * provider tree; ProfileScreen's next mount calls this again and the restored
 * entries are absorbed instead of clobbered by the pre-restore cache.
 */
export function hydrateJourney(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      absorb(sanitize(raw));
    } catch {
      absorb([]);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Records are SERIALIZED on one chain, and each one re-reads disk immediately
// before its write. The read-union-write is still not atomic against the one
// other writer of this key (cloud restore's multiSet in cloudBackup), but
// putting the read adjacent to the write shrinks that race from a full
// collectLocal round-trip to a microtask-sized window (swarm F1, 2026-08-22),
// and the chain removes record-vs-record interleaving entirely.
let writeChain: Promise<void> = Promise.resolve();

/**
 * Append one milestone. Fire-and-forget and never throws — callers are the
 * award paths of three contexts and must not gain a failure mode from a
 * timeline. Reads disk before writing, so an event fired before Profile ever
 * mounted cannot overwrite the stored history with a one-entry file, and
 * dedupes by id so a re-fired award (context hydration races re-evaluate) is
 * dropped silently.
 */
export function recordJourneyEvent(e: JourneyEntry): void {
  writeChain = writeChain.then(async () => {
    let disk: JourneyEntry[] = [];
    try { disk = sanitize(await AsyncStorage.getItem(KEY)); } catch {}
    absorb(disk);
    const cur = entries ?? [];
    if (cur.some(x => x.id === e.id)) return;
    entries = unionCap([e], cur);
    notify();
    await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, entries })).catch(() => {});
  }).catch(() => {});
}

export function __resetJourneyForTest(): void {
  entries = null;
  inflight = null;
  writeChain = Promise.resolve();
  subs.clear();
}
