// The mystery card draw — pure logic.
//
// PURE, and deliberately near-zero-import: no React, no AsyncStorage, no card
// text. It takes a pool SIZE and returns indexes. Same split as quizSession.ts
// vs QuizContext, and the reason this is testable in the repo's node-env jest.
//
// THE MECHANIC
// ============
// Four DISTINCT cards are laid face down; whichever she taps is the one she
// keeps. The other three are not consumed — they return to the pool and may
// come up as candidates again.
//
// Consuming all four would look tidier and is wrong: it burns the pool at 4x
// and caps the feature at 10 draws instead of 40.
//
// WHY CANDIDATES ARE DETERMINISTIC
// ================================
// Candidates for draw N come from mulberry32(CARD_SEED + N) over the
// uncollected pool — the same technique as services/quizSets.ts.
//
// This is not tidiness. If candidates were random per render, force-quitting
// mid-draw would reshuffle them, so anyone who wanted a different card could
// reroll indefinitely and the "choice" would be theatre. Deterministic
// candidates mean the spread she left is the spread she comes back to.

/** Cards laid face down per draw. */
export const CANDIDATES_PER_DRAW = 4;

/** ⚠️ FROZEN. Changing this reshuffles every existing user's candidate spread
 *  mid-draw. Ship-once, like QUIZ_SEED. */
const CARD_SEED = 0x63a7d100;

/**
 * mulberry32. Copied rather than imported from services/quizSets.ts: that
 * module pulls in the QuizQuestion type and the whole set-composition surface,
 * and this one is meant to stay dependency-free. Same reason fnv1a is
 * duplicated between planRecommendations and verseCommentsFeed.
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

export interface CardProgressV1 {
  v: 1;
  /** Card ids, in the order she drew them. */
  collected: string[];
  /** May exceed collected.length once the pool has reset and repeats begin. */
  drawsTaken: number;
  /**
   * A draw has been EARNED but not yet taken.
   *
   * This flag is the whole reason the reward survives real life. The draw is
   * earned the moment a set commits, but she can background the app before the
   * overlay appears, or take a call, or the process can be killed. Without it
   * the reward is silently lost — the same class of failure the achievement
   * NEW ribbon had to work around.
   */
  pendingDraw: boolean;
}

export const INITIAL_CARD_PROGRESS: CardProgressV1 = {
  v: 1,
  collected: [],
  drawsTaken: 0,
  pendingDraw: false,
};

/**
 * Which pool positions are on the table for draw `drawIndex`.
 *
 * `available` is the list of pool indexes she has NOT collected. Returns
 * `CANDIDATES_PER_DRAW` distinct entries, or everything left when fewer remain.
 */
export function candidatesFor(drawIndex: number, available: readonly number[]): number[] {
  const n = available.length;
  if (n === 0) return [];
  const k = Math.min(CANDIDATES_PER_DRAW, n);
  const safe = Number.isFinite(drawIndex) && drawIndex > 0 ? Math.floor(drawIndex) : 0;

  // Partial Fisher-Yates over a copy: draws k distinct entries without the
  // retry loop a naive "pick random until unique" would need, which degrades
  // badly once `available` is nearly exhausted.
  const rng = mulberry32((CARD_SEED + safe * 0x9e3779b1) >>> 0);
  const a = available.slice();
  for (let i = 0; i < k; i += 1) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a.slice(0, k);
}

/**
 * Pool indexes still uncollected.
 *
 * Once every card is collected the pool RESETS and repeats begin — a card that
 * comforted her once is not worthless the second time, and a reward counter
 * that dead-ends is worse than a repeat. The collection screen still shows each
 * card once.
 */
export function availableIndexes(collected: readonly string[], ids: readonly string[]): number[] {
  const seen = new Set(collected);
  const left: number[] = [];
  for (let i = 0; i < ids.length; i += 1) if (!seen.has(ids[i])) left.push(i);
  return left.length > 0 ? left : ids.map((_, i) => i);
}

export interface DrawSpread {
  /** Pool indexes on the table, in the order they are laid out. */
  candidates: number[];
  /** True once she has collected every card at least once. */
  poolExhausted: boolean;
}

/** The spread she is looking at right now. Stable across relaunches. */
export function spreadFor(p: CardProgressV1, ids: readonly string[]): DrawSpread {
  const uncollected = new Set(ids).size - new Set(p.collected).size;
  return {
    candidates: candidatesFor(p.drawsTaken, availableIndexes(p.collected, ids)),
    poolExhausted: uncollected <= 0,
  };
}

/**
 * Commit a pick.
 *
 * `pendingDraw` clears here and nowhere else — the draw is spent the moment she
 * chooses, not when the overlay closes, so dismissing the screen afterwards can
 * never hand her a second card.
 *
 * Re-collecting an already-held card (possible after a pool reset) does not
 * duplicate it in `collected`, but still counts as a draw.
 */
export function collectCard(p: CardProgressV1, cardId: string): CardProgressV1 {
  if (!cardId) return p;
  return {
    ...p,
    collected: p.collected.includes(cardId) ? p.collected : [...p.collected, cardId],
    drawsTaken: p.drawsTaken + 1,
    pendingDraw: false,
  };
}

/** A completed set earned a draw. Idempotent — two calls do not stack two draws. */
export function grantDraw(p: CardProgressV1): CardProgressV1 {
  return p.pendingDraw ? p : { ...p, pendingDraw: true };
}

/** Does completing set number `completedSets` (1-based) earn a draw? */
export function drawEarnedAt(completedSets: number, every: number): boolean {
  const n = Math.floor(completedSets);
  const e = Math.max(1, Math.floor(every) || 1);
  return n > 0 && n % e === 0;
}

/**
 * Parse the durable record. Never throws and never repairs partially.
 *
 * Unlike the quiz session this is NOT discarded on unexpected shape — losing a
 * user's whole card collection because one field went odd would be
 * indefensible, so every field falls back independently.
 */
export function parseCardProgress(raw: string | null): CardProgressV1 {
  if (!raw) return INITIAL_CARD_PROGRESS;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || p.v !== 1) return INITIAL_CARD_PROGRESS;
    const collected = Array.isArray(p.collected)
      ? p.collected.filter((x: unknown) => typeof x === 'string' && x.length > 0)
      : [];
    return {
      v: 1,
      // De-dupe on read: a merge from another device unions the arrays, and a
      // duplicate would inflate the collection count.
      collected: [...new Set<string>(collected)],
      drawsTaken: Number.isInteger(p.drawsTaken) && p.drawsTaken >= 0 ? p.drawsTaken : collected.length,
      pendingDraw: p.pendingDraw === true,
    };
  } catch {
    return INITIAL_CARD_PROGRESS;
  }
}
