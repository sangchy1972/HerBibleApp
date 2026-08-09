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
// and caps the feature at 10 draws instead of 43.
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
   * Highest completedSets already considered for a draw.
   *
   * PERSISTED, and that is the point. The grant used to live in an in-memory
   * ref, and the grant is a different render from the commit — so a kill in
   * between committed the set and lost the draw FOREVER, because on relaunch
   * the ref re-seeded to the new count and that set was never re-examined.
   * Storing the watermark makes the grant derivable instead of ref-dependent.
   */
  grantedThroughSets: number;
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
  grantedThroughSets: 0,
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

/**
 * The spread she is looking at right now. Stable across relaunches.
 *
 * ALWAYS four faces when the pool allows it. `availableIndexes` only resets
 * once every card is collected, so at 39-of-40 the raw candidate list is a
 * single entry — and laying out ONE card under a prompt that says "choose one"
 * is a joke at her expense after three completed sets. The last few draws top
 * the table up with cards she already holds; the uncollected ones are still
 * drawn first, so she cannot be handed a repeat while a new card is available.
 */
export function spreadFor(p: CardProgressV1, ids: readonly string[]): DrawSpread {
  const uncollected = new Set(ids).size - new Set(p.collected).size;
  const primary = candidatesFor(p.drawsTaken, availableIndexes(p.collected, ids));
  let candidates = primary;

  if (primary.length < CANDIDATES_PER_DRAW && ids.length >= CANDIDATES_PER_DRAW) {
    const taken = new Set(primary);
    const filler = candidatesFor(
      p.drawsTaken + 1,
      ids.map((_, i) => i).filter(i => !taken.has(i)),
    );
    candidates = [...primary, ...filler].slice(0, CANDIDATES_PER_DRAW);
  }

  return { candidates, poolExhausted: uncollected <= 0 };
}

/**
 * Which card a tap on spread position `tappedIndex` should actually hand her.
 *
 * Returns an index into `candidates` — the tapped one when it is a card she does
 * not have, and the first uncollected one on the table otherwise.
 *
 * WHY THIS EXISTS. spreadFor tops the table up with cards she already holds once
 * fewer than four remain uncollected (a single face under "choose one" is a joke
 * after three completed sets). But the faces are FACE DOWN and only the chosen
 * one is ever turned over — the other three fade out unrevealed — so tapping the
 * filler silently spent a whole reward on a duplicate. With 43 draws over 40
 * cards that cost the average player half a card and left only 51% of players
 * who finished the entire bank with a complete collection; at 43 cards it would
 * have been 9%. Since the position she taps carries no information about what is
 * under it, resolving the tap to a card she is missing is not a lie — it is the
 * same arbitrary assignment spreadFor already made, minus the wasted reward.
 * With this, 43 draws collect 43 distinct cards deterministically.
 *
 * Once EVERYTHING is collected the pool resets and repeats are the point, so the
 * tap is honoured exactly as made.
 */
export function resolveDraw(
  candidates: readonly number[],
  tappedIndex: number,
  collected: readonly string[],
  ids: readonly string[],
): number {
  if (candidates.length === 0) return 0;
  const i = Math.min(Math.max(0, Math.floor(tappedIndex) || 0), candidates.length - 1);
  const held = new Set(collected);
  const isNew = (poolIndex: number) => {
    const id = ids[poolIndex];
    return typeof id === 'string' && !held.has(id);
  };
  if (isNew(candidates[i]!)) return i;
  const firstNew = candidates.findIndex(isNew);
  return firstNew === -1 ? i : firstNew;
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

/**
 * Catch up on every draw earned between `grantedThroughSets` and `completedSets`.
 *
 * Idempotent and CRASH-SAFE: replaying it after a kill re-examines exactly the
 * sets that were never considered, so a draw earned in the frame before the
 * process died is still granted on the next launch. `pendingDraw` is a single
 * boolean rather than a queue on purpose — owing her two draws at once has
 * never been reachable at a 3-set cadence, and a counter would need its own
 * merge rules for no benefit.
 */
export function grantDrawsThrough(
  p: CardProgressV1,
  completedSets: number,
  every: number,
  totalSets = 0,
): CardProgressV1 {
  const n = Math.max(0, Math.floor(completedSets) || 0);
  if (n <= p.grantedThroughSets) return p;
  let owed = false;
  for (let k = p.grantedThroughSets + 1; k <= n; k += 1) {
    if (drawEarnedAt(k, every, totalSets)) { owed = true; break; }
  }
  return {
    ...p,
    grantedThroughSets: n,
    pendingDraw: p.pendingDraw || owed,
  };
}

/** A completed set earned a draw. Idempotent — two calls do not stack two draws. */
export function grantDraw(p: CardProgressV1): CardProgressV1 {
  return p.pendingDraw ? p : { ...p, pendingDraw: true };
}

/**
 * Does completing set number `completedSets` (1-based) earn a draw?
 *
 * `totalSets` is how many sets the bank allows in total. Pass it and the LAST
 * draw slides onto the final set, absorbing the remainder: 130 sets give
 * 42 cycles of 3 plus one of 4, i.e. draws at 3..126 and then 130, which is 43
 * draws with no dead set. Omit it (0) and the plain every-N rule applies —
 * that is the right answer when the bank is not on the device yet, since the
 * tail cannot be located without knowing where the end is.
 */
export function drawEarnedAt(completedSets: number, every: number, totalSets = 0): boolean {
  const n = Math.floor(completedSets);
  const e = Math.max(1, Math.floor(every) || 1);
  if (n <= 0) return false;
  const total = Math.max(0, Math.floor(totalSets) || 0);
  const cycles = Math.floor(total / e);
  if (total <= 0 || cycles < 1) return n % e === 0;
  // Every whole cycle before the last, then the last one on the final set.
  return n === total || (n % e === 0 && n <= e * (cycles - 1));
}

// ── Likes ────────────────────────────────────────────────────────────────────
//
// Its own key, not a field on CardProgressV1. Same split rule the quiz session
// and the quiz ladder already follow: by write frequency, and by what losing it
// costs. `collected` is written once per three sets and must never be lost;
// `liked` is written on every heart tap and losing it costs an icon.
//
// ANALYTICS ONLY EVER SEES A LIKE. There is no unlike event — "not liked"
// should emit nothing at all, which is what no signal ought to look like.
//
// The heart still TOGGLES though, and that is deliberate: a mis-tap she cannot
// undo is worse than a slightly inflated like count. The consequence to accept
// is that lifetime `card_like` events can exceed the number of currently-liked
// cards. They measure different things and both are correct.

export interface CardLikesV1 {
  v: 1;
  /** Card ids. Kept sorted so the cloud union merger produces stable output. */
  liked: string[];
}

export const INITIAL_CARD_LIKES: CardLikesV1 = { v: 1, liked: [] };

export function isLiked(l: CardLikesV1, cardId: string): boolean {
  return l.liked.includes(cardId);
}

/** Returns the same object when nothing changes, so callers can skip the write. */
export function toggleLike(l: CardLikesV1, cardId: string): CardLikesV1 {
  if (!cardId) return l;
  const has = l.liked.includes(cardId);
  const liked = has ? l.liked.filter(x => x !== cardId) : [...l.liked, cardId].sort();
  return { v: 1, liked };
}

export function parseCardLikes(raw: string | null): CardLikesV1 {
  if (!raw) return INITIAL_CARD_LIKES;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.liked)) return INITIAL_CARD_LIKES;
    const liked = p.liked.filter((x: unknown) => typeof x === 'string' && x.length > 0);
    return { v: 1, liked: [...new Set<string>(liked)].sort() };
  } catch {
    return INITIAL_CARD_LIKES;
  }
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
    const unique = [...new Set<string>(collected)];
    return {
      v: 1,
      // De-dupe on read: a merge from another device unions the arrays, and a
      // duplicate would inflate the collection count.
      collected: unique,
      drawsTaken: Number.isInteger(p.drawsTaken) && p.drawsTaken >= 0 ? p.drawsTaken : unique.length,
      pendingDraw: p.pendingDraw === true,
      // Absent on a record written before this field existed. Seeding from the
      // collected count x MYSTERY_EVERY rather than 0 stops an upgrade replaying every draw she
      // has ever earned as one big backlog.
      grantedThroughSets: Number.isInteger(p.grantedThroughSets) && p.grantedThroughSets >= 0
        ? p.grantedThroughSets
        : unique.length * 3,
    };
  } catch {
    return INITIAL_CARD_PROGRESS;
  }
}
