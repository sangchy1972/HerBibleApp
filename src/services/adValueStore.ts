// Per-user ad-value ledger (Android ad-request spec §⑤-1).
//
// Six facts, updated ATOMICALLY in the paid callback and mirrored in memory so
// every ad opportunity can read them synchronously:
//   last3Values          rolling window of the last 3 RAW per-impression USD
//                        values — target uses the last 2, secondary the last 1
//   recordedImpressions  count of paid events since this feature shipped (the
//                        layer gate: ladder starts at 2, newbie exits at 2)
//   allTimeMax / values  full-history stats — analysis only, never routed on
//   ltv                  lifetime ad revenue, raw USD
//
// Everything is RAW revenue (e.g. 0.09), NEVER eCPM — per owner. The ×1000
// happens only inside adLadders' comparisons.
//
// INVARIANT (spec): recordedImpressions ≥ k ⟺ last3Values has ≥ min(k,3)
// entries. Both are written in the same update, so a user classified into the
// ladder always has the data the target formula needs. A corrupt read falls
// back to the empty state — the failure direction is "new user flow", which is
// safe (it only under-prices, never over-prices).

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'adEngine:value:v1';
/** Full-history sample cap. At ~10 impressions/day this is months of data;
 *  beyond it we drop the OLDEST so the JSON stays bounded. Median/mean over
 *  the retained window is plenty for the pricing analysis it exists for. */
const MAX_SAMPLES = 1000;

export interface AdValueState {
  v: 1;
  imps: number;
  last3: number[];
  max: number;
  ltv: number;
  values: number[];
}

const EMPTY: AdValueState = { v: 1, imps: 0, last3: [], max: 0, ltv: 0, values: [] };

let state: AdValueState = { ...EMPTY, last3: [], values: [] };
let hydrated = false;
/** A paid event landed before hydration finished. The engine starts behind a
 *  BOUNDED wait, so a wedged AsyncStorage read can resolve late — after real
 *  impressions have already been recorded. A late hydrate must never clobber
 *  those; losing the disk snapshot's history costs a re-calibration, losing a
 *  live paid event costs real routing data. */
let dirtySinceHydrateStarted = false;

function sanitize(raw: unknown): AdValueState | null {
  const p = raw as Partial<AdValueState> | null;
  if (!p || typeof p !== 'object' || p.v !== 1) return null;
  const nums = (a: unknown, cap: number): number[] =>
    Array.isArray(a) ? a.filter((x): x is number => typeof x === 'number' && isFinite(x) && x >= 0).slice(-cap) : [];
  const imps = typeof p.imps === 'number' && isFinite(p.imps) && p.imps >= 0 ? Math.floor(p.imps) : 0;
  const last3 = nums(p.last3, 3);
  // The invariant both layer gates lean on. A snapshot that violates it is
  // untrusted in full — half-trusting it could put a user in the ladder with
  // no data behind the target formula.
  if (last3.length !== Math.min(imps, 3)) return null;
  return {
    v: 1,
    imps,
    last3,
    max: typeof p.max === 'number' && isFinite(p.max) && p.max >= 0 ? p.max : 0,
    ltv: typeof p.ltv === 'number' && isFinite(p.ltv) && p.ltv >= 0 ? p.ltv : 0,
    values: nums(p.values, MAX_SAMPLES),
  };
}

export async function hydrateAdValueStore(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw && !dirtySinceHydrateStarted) {
      const clean = sanitize(JSON.parse(raw));
      if (clean) state = clean;
    }
  } catch { /* fresh state — degrades to the new-user flow, the safe direction */ }
  hydrated = true;
}

/** Synchronous read — the planner runs on every request decision. */
export function adValueState(): Readonly<AdValueState> {
  return state;
}

/**
 * The atomic write-back. Called from the paid callback with the RAW USD value.
 * Memory updates synchronously (the very next opportunity may read it);
 * persistence is one setItem of the whole snapshot, so a crash between calls
 * can lose at most the latest impression, never tear the invariant.
 */
export function recordPaidValue(value: number): Readonly<AdValueState> {
  dirtySinceHydrateStarted = true;
  const v = isFinite(value) && value >= 0 ? value : 0;
  state = {
    v: 1,
    imps: state.imps + 1,
    last3: [...state.last3, v].slice(-3),
    max: Math.max(state.max, v),
    ltv: state.ltv + v,
    values: [...state.values, v].slice(-MAX_SAMPLES),
  };
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  return state;
}

/** Derived, analysis-only. */
export function adValueStats(): { mean: number; median: number } {
  const vs = state.values;
  if (vs.length === 0) return { mean: 0, median: 0 };
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  const sorted = [...vs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { mean, median };
}

export function __resetAdValueStoreForTest(): void {
  state = { ...EMPTY, last3: [], values: [] };
  hydrated = false;
  dirtySinceHydrateStarted = false;
}
export function __sanitizeForTest(raw: unknown): AdValueState | null { return sanitize(raw); }
