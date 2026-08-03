// Pure merge logic for cloud backup/restore (no RN imports — unit-testable).
//
// A "snapshot" is a map of AsyncStorage key → raw stored string, restricted to
// the whitelisted keys below. On restore we merge the device's local snapshot
// with the remote one so progress is NEVER lost in either direction:
//   • fresh install (local empty)            → remote wins
//   • same device re-login (remote stale)    → local wins / union
//   • two devices used in parallel           → union of both
//
// Every merger is defensive: a malformed side is ignored in favor of the other,
// so a corrupt cloud payload can never destroy local data.

export type Snapshot = Record<string, string>;

type Merger = (local: string | undefined, remote: string | undefined) => string | undefined;

function parse<T>(raw: string | undefined): T | null {
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// Fall back to whichever side parses when the other is malformed/absent.
// `fn` only runs when BOTH sides parsed.
function jsonMerger<T>(fn: (local: T, remote: T) => T): Merger {
  return (l, r) => {
    const lv = parse<T>(l);
    const rv = parse<T>(r);
    if (lv == null && rv == null) return l ?? r;
    if (lv == null) return r;
    if (rv == null) return l;
    return JSON.stringify(fn(lv, rv));
  };
}

const preferLocal: Merger = (l, r) => l ?? r;

// One-shot '1' flags — once set anywhere, stays set.
const sticky1: Merger = (l, r) => (l === '1' || r === '1' ? '1' : (l ?? r));

// Earliest of two YYYY-MM-DD strings (install-date anchor → keep the oldest).
const minYmd: Merger = (l, r) => (l && r ? (l < r ? l : r) : (l ?? r));

// Stringified lifetime counters — take the max.
const maxNumeric: Merger = (l, r) => {
  const ln = l != null ? Number(l) : NaN;
  const rn = r != null ? Number(r) : NaN;
  if (Number.isNaN(ln) && Number.isNaN(rn)) return l ?? r;
  if (Number.isNaN(ln)) return r;
  if (Number.isNaN(rn)) return l;
  return String(Math.max(ln, rn));
};

const unionStringArray: Merger = jsonMerger<string[]>((l, r) => {
  const a = Array.isArray(l) ? l : [];
  const b = Array.isArray(r) ? r : [];
  return Array.from(new Set([...a, ...b])).sort();
});

// Arrays of objects with a stable `id` — union by id, newest `savedAt` first.
function unionById(): Merger {
  type Item = { id: string; savedAt?: string };
  return jsonMerger<Item[]>((l, r) => {
    const a = Array.isArray(l) ? l : [];
    const b = Array.isArray(r) ? r : [];
    const seen = new Set(a.map(x => x?.id));
    const merged = [...a, ...b.filter(x => x && !seen.has(x.id))];
    return merged.sort((x, y) => String(y?.savedAt ?? '').localeCompare(String(x?.savedAt ?? '')));
  });
}

// Object maps — union of keys, LOCAL entry wins on conflict.
const unionObjectLocalWins: Merger = jsonMerger<Record<string, unknown>>((l, r) => ({ ...r, ...l }));

// prayer:records:v1 — ymd → { m, e, mAt?, eAt? }. Union days; within a day a
// completion on EITHER side counts (never un-complete), earliest timestamp kept.
type PrayerDay = { m?: boolean; e?: boolean; mAt?: string; eAt?: string };
const mergePrayerRecords: Merger = jsonMerger<Record<string, PrayerDay>>((l, r) => {
  const out: Record<string, PrayerDay> = { ...r };
  for (const [ymd, ld] of Object.entries(l)) {
    const rd = out[ymd];
    out[ymd] = rd
      ? { ...rd, ...ld, m: !!(ld.m || rd.m), e: !!(ld.e || rd.e), mAt: ld.mAt ?? rd.mAt, eAt: ld.eAt ?? rd.eAt }
      : ld;
  }
  return out;
});

// plan-completion:v1 — slug → { completedDays, firstStartedAt, finishedAt?, lastDayYmd? }.
type PlanRecord = {
  completedDays?: number[]; firstStartedAt?: number; finishedAt?: number; lastDayYmd?: string;
  dayDates?: Record<number, string>;
};
const mergePlanRecords: Merger = jsonMerger<Record<string, PlanRecord>>((l, r) => {
  const out: Record<string, PlanRecord> = { ...r };
  for (const [slug, lr] of Object.entries(l)) {
    const rr = out[slug];
    if (!rr) { out[slug] = lr; continue; }
    const days = Array.from(new Set([...(lr.completedDays ?? []), ...(rr.completedDays ?? [])])).sort((a, b) => a - b);
    const starts = [lr.firstStartedAt, rr.firstStartedAt].filter((n): n is number => typeof n === 'number');
    const finishes = [lr.finishedAt, rr.finishedAt].filter((n): n is number => typeof n === 'number');
    const lastDays = [lr.lastDayYmd, rr.lastDayYmd].filter((s): s is string => typeof s === 'string');
    out[slug] = {
      ...rr, ...lr,
      // Per-day completion dates must UNION — the object spread above would
      // otherwise drop whichever device recorded the other days.
      dayDates: { ...(rr.dayDates ?? {}), ...(lr.dayDates ?? {}) },
      completedDays: days,
      firstStartedAt: starts.length ? Math.min(...starts) : undefined,
      finishedAt: finishes.length ? Math.min(...finishes) : undefined,
      lastDayYmd: lastDays.length ? lastDays.sort()[lastDays.length - 1] : undefined,
    };
  }
  return out;
});

// gospels-psalms:progress:v2 — single linear-progress object; whichever side is
// further along (round, then combined day) wins wholesale.
type GpProgress = { round?: number; morning?: { day?: number }; evening?: { day?: number } };
const mergeGospelsPsalms: Merger = jsonMerger<GpProgress>((l, r) => {
  const score = (p: GpProgress) =>
    (p.round ?? 0) * 100000 + (p.morning?.day ?? 0) + (p.evening?.day ?? 0);
  return score(l) >= score(r) ? l : r;
});

// achievements:v1 — badgeId → { count, firstAwardedAt, lastAwardedAt }.
type Award = { count?: number; firstAwardedAt?: number; lastAwardedAt?: number };
const mergeAchievements: Merger = jsonMerger<Record<string, Award>>((l, r) => {
  const out: Record<string, Award> = { ...r };
  for (const [id, la] of Object.entries(l)) {
    const ra = out[id];
    out[id] = ra
      ? {
          count: Math.max(la.count ?? 0, ra.count ?? 0),
          firstAwardedAt: Math.min(la.firstAwardedAt ?? Infinity, ra.firstAwardedAt ?? Infinity),
          lastAwardedAt: Math.max(la.lastAwardedAt ?? 0, ra.lastAwardedAt ?? 0),
        }
      : la;
  }
  return out;
});

// mood:v2 — { entries: {ymd → entry}, lastShownAt }.
type Mood = { entries?: Record<string, unknown>; lastShownAt?: number };
const mergeMood: Merger = jsonMerger<Mood>((l, r) => ({
  entries: { ...(r.entries ?? {}), ...(l.entries ?? {}) },
  lastShownAt: Math.max(l.lastShownAt ?? 0, r.lastShownAt ?? 0),
}));

// Quiz ladder. Every field is a monotonic lifetime counter, so max-per-field is
// correct and a device that is behind can never drag the user backwards.
//
// `setIndex` is the position in the question stream, NOT a score — taking the
// max means the further-along device wins and she never re-answers a set she
// already cleared. It is deliberately NOT tied to completedSets: they diverge
// if a set is ever skipped, and clamping one to the other would silently
// rewrite her place in the bank.
const mergeQuizProgress = jsonMerger<any>((l, r) => ({
  ...l,
  v: 1,
  bankVersion: Math.max(l?.bankVersion ?? 1, r?.bankVersion ?? 1),
  setIndex: Math.max(l?.setIndex ?? 0, r?.setIndex ?? 0),
  completedSets: Math.max(l?.completedSets ?? 0, r?.completedSets ?? 0),
  perfectSets: Math.max(l?.perfectSets ?? 0, r?.perfectSets ?? 0),
  totalCorrect: Math.max(l?.totalCorrect ?? 0, r?.totalCorrect ?? 0),
  lastCompletedYmd: [l?.lastCompletedYmd, r?.lastCompletedYmd]
    .filter((x): x is string => typeof x === 'string')
    .sort()
    .pop() ?? null,
}));

// Mystery cards. `collected` unions — a card drawn on any device is hers. Union
// rather than "longer array wins" because two devices can hold disjoint sets.
// `pendingDraw` ORs: an unspent draw earned anywhere must survive, since losing
// it silently eats a reward she already worked three sets for.
const mergeCardProgress = jsonMerger<any>((l, r) => {
  const collected = Array.from(new Set([
    ...(Array.isArray(l?.collected) ? l.collected : []),
    ...(Array.isArray(r?.collected) ? r.collected : []),
  ]));
  return {
    v: 1,
    collected,
    // Never below the collection size, or a restore would report fewer draws
    // than she visibly holds cards.
    drawsTaken: Math.max(l?.drawsTaken ?? 0, r?.drawsTaken ?? 0, collected.length),
    pendingDraw: l?.pendingDraw === true || r?.pendingDraw === true,
    // Max, to match the ladder's own merge: the further-along device wins, and
    // the watermark can never rewind and re-grant draws she already took.
    grantedThroughSets: Math.max(l?.grantedThroughSets ?? 0, r?.grantedThroughSets ?? 0),
  };
});

// Daily quiz history. Union by date, MAX per field — deliberately not sum.
//
// Sum looks more correct for the one case where it matters (two devices used on
// the same day) and corrupts the common case: every ordinary restore replays
// the same day against itself and doubles it. Max can only ever UNDER-count the
// rare two-device day. Choose the failure that is rare and small over the one
// that is routine and wrong.
const mergeQuizHistory = jsonMerger<any>((l, r) => {
  const by = new Map<string, any>();
  for (const d of [...(Array.isArray(l?.days) ? l.days : []), ...(Array.isArray(r?.days) ? r.days : [])]) {
    if (!d || typeof d.ymd !== 'string') continue;
    const prev = by.get(d.ymd);
    by.set(d.ymd, prev ? {
      ymd: d.ymd,
      sets: Math.max(prev.sets ?? 0, d.sets ?? 0),
      questions: Math.max(prev.questions ?? 0, d.questions ?? 0),
      firstPassWrong: Math.max(prev.firstPassWrong ?? 0, d.firstPassWrong ?? 0),
    } : d);
  }
  const days = [...by.values()].sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));
  return { v: 1, days: days.slice(-180) };   // HISTORY_DAYS
});

// The full backup manifest: every key that goes to the cloud, with its merge
// strategy. Caches, ad/nudge state, attest tokens etc. are deliberately absent.
export const MERGERS: Record<string, Merger> = {
  // Progress
  'prayer:records:v1': mergePrayerRecords,
  'plan-completion:v1': mergePlanRecords,
  'gospels-psalms:progress:v2': mergeGospelsPsalms,
  'notes:v1': unionById(),
  'savedVerses': unionById(),
  'highlights:v1': unionObjectLocalWins,
  'bookmarks:v1': unionById(),
  'readChapters:v1': unionStringArray,
  'readChapters:dates:v1': unionStringArray,
  'activity:dates': unionStringArray,
  'achievements:v1': mergeAchievements,
  'achievements:prev-passing-set:v1': unionStringArray,
  // Union, so "seen on any device" wins. The alternative — intersection — would
  // re-announce badges as NEW on every device the user has ever signed into,
  // which is the failure the ribbon exists to avoid. Missing this entry
  // entirely would be worse: a restore would arrive with `earned` full and
  // `seen` absent, and the backfill only runs when the key has NEVER existed,
  // so she'd get a wall of ribbons on a fresh install.
  'achievements:seen:v1': unionStringArray,
  // ⚠️ Added late. The quiz shipped WITHOUT these, which meant a reinstall or a
  // restore silently reset the whole ladder — level back to 1, puzzle tiles
  // gone, and (once cards land) a full card collection sitting next to Level 1.
  // The in-flight session is deliberately still absent: it is disposable by
  // design and restoring a half-answered set onto another device is worse than
  // restarting it.
  'quiz:progress:v1': mergeQuizProgress,
  'quiz:cards:v1': mergeCardProgress,
  // Likes union. An unlike on one device can therefore be resurrected by a
  // restore from another — accepted, the same trade already documented for
  // achievements:seen:v1. The alternative is a timestamp on every heart tap
  // plus a tombstone per unlike, to protect an icon.
  'quiz:card-likes:v1': jsonMerger<any>((l, r) => ({
    v: 1,
    liked: Array.from(new Set([
      ...(Array.isArray(l?.liked) ? l.liked : []),
      ...(Array.isArray(r?.liked) ? r.liked : []),
    ])).sort(),
  })),
  'quiz:dates:v1': mergeQuizHistory,
  'mood:v2': mergeMood,
  'shares:count': maxNumeric,
  'daily-verses:first-launch-date': minYmd,
  // Settings & onboarding (device's current choice wins; empty device restores)
  'onboarding:answers:v1': preferLocal,
  'onboarding:done:v1': sticky1,
  'ui:lang:v1': preferLocal,
  'bible:current-translation:v1': preferLocal,
  'bible:reader-settings:v1': preferLocal,
  'notifications:v1': preferLocal,
  'bible:last-read': preferLocal,
  'auth:photo-override': preferLocal,
  'auth:signed-up:v1': sticky1,
};

export const BACKUP_KEYS = Object.keys(MERGERS);

// Merge two snapshots key-by-key. Returns the merged snapshot plus the list of
// keys whose merged value differs from local — the caller writes exactly those
// (and uses the list to decide whether a UI re-hydration is needed).
export function mergeSnapshots(local: Snapshot, remote: Snapshot): { merged: Snapshot; changedKeys: string[] } {
  const merged: Snapshot = {};
  const changedKeys: string[] = [];
  for (const key of BACKUP_KEYS) {
    const value = MERGERS[key](local[key], remote[key]);
    if (value == null) continue;
    merged[key] = value;
    if (value !== local[key]) changedKeys.push(key);
  }
  return { merged, changedKeys };
}
