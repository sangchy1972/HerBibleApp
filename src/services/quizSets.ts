import { QUIZ_BANK, type QuizQuestion } from '../constants/bibleQuiz';

// Which 5 questions make up quiz set N.
//
// PURE — no React, no react-native, no AsyncStorage. Same contract as
// services/planRecommendations.ts, and the reason this is testable in the
// repo's node-environment jest setup.
//
// REQUIREMENTS
// ────────────
// Deterministic · no repeats until the bank is exhausted · identical across
// relaunches · reproducible from ONE stored integer (the set index) · every set
// exactly 5 questions. That last one bites: 329 % 5 = 4, so naive chunking
// leaves a broken 4-question tail.
//
// DESIGN
// ──────
// Treat the bank as an infinite stream. Cycle 0 is a deterministic shuffle of
// all N questions, cycle 1 is a DIFFERENT deterministic shuffle of the same N,
// and so on. Sets slice that stream at fixed 5-boundaries, across cycle edges —
// so there is no tail and no exhaustion state, and within any one cycle a
// question cannot repeat.
//
// The one unavoidable seam: the set that straddles the cycle 0/1 boundary can
// hold a question that also appears early in cycle 1. That is the price of
// "always exactly 5", and it costs one set out of 66.
//
// ⚠️ QUIZ_SEED AND THE MIXER ARE FROZEN. Changing either reshuffles the
// not-yet-seen queue of every existing user — they would be re-served questions
// they already answered while unseen ones silently move out of reach. There is
// no migration for this; treat both constants as ship-once.

export const SET_SIZE = 5;

const QUIZ_SEED = 0x515a1e00;
/** Golden-ratio odd constant — decorrelates adjacent cycle seeds. */
const CYCLE_MIX = 0x9e3779b1;

/**
 * mulberry32. Copied from state/verseCommentsFeed.ts rather than imported,
 * because that module pulls the whole VERSE_COMMENTS constant tree with it —
 * the same reason fnv1a is duplicated between planRecommendations.ts and
 * verseCommentsFeed.ts. Math.random is not an option: this repo keeps every
 * content-selection path deterministic so a relaunch reproduces it exactly.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates permutation of [0..n) for one cycle. */
export function cyclePermutation(n: number, cycle: number): number[] {
  const rng = mulberry32((QUIZ_SEED + cycle * CYCLE_MIX) >>> 0);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// Recomputing a 329-element shuffle per lookup would be wasteful inside a
// render. Bounded so a very long-lived session can't grow it without limit; a
// user reaches cycle 1 only after 66 sets, so this is cold after the first hit.
const permCache = new Map<string, number[]>();
const PERM_CACHE_MAX = 4;
function permutationFor(n: number, cycle: number): number[] {
  const key = `${n}:${cycle}`;
  const hit = permCache.get(key);
  if (hit) return hit;
  const perm = cyclePermutation(n, cycle);
  if (permCache.size >= PERM_CACHE_MAX) {
    const oldest = permCache.keys().next().value;
    if (oldest !== undefined) permCache.delete(oldest);
  }
  permCache.set(key, perm);
  return perm;
}

/** Bank index at global stream position p. */
export function streamPosition(p: number, n: number): number {
  if (n <= 0) return 0;
  const cycle = Math.floor(p / n);
  return permutationFor(n, cycle)[p % n];
}

/** The 5 bank INDEXES for a set. Always length 5, for any non-negative index. */
export function setPositions(setIndex: number, n: number): number[] {
  const safe = Number.isFinite(setIndex) && setIndex > 0 ? Math.floor(setIndex) : 0;
  const base = safe * SET_SIZE;
  return Array.from({ length: SET_SIZE }, (_, i) => streamPosition(base + i, n));
}

/** The 5 questions for a set, resolved against the bank. */
export function questionsForSet(setIndex: number, bank: readonly QuizQuestion[] = QUIZ_BANK): QuizQuestion[] {
  if (bank.length < SET_SIZE) return [];
  return setPositions(setIndex, bank.length).map(i => bank[i]);
}

/** How many sets before the bank starts repeating. Display only. */
export function setsPerCycle(bankSize: number = QUIZ_BANK.length): number {
  return Math.floor(bankSize / SET_SIZE);
}

/** Test seam — the cache is a performance detail, never a correctness one. */
export function __clearPermCacheForTest(): void {
  permCache.clear();
}
