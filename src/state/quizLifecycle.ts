import { SET_SIZE } from '../services/quizSets';
import { TILES_PER_PAINTING, MYSTERY_EVERY, totalTiles, puzzleView } from './quizProgress';

// When the quiz is finished, and what she can have collected by then.
//
// PURE — no React, no storage, no bank import. It takes a size, not a bank.
//
// WHY THE QUIZ RETIRES
// ────────────────────
// services/quizSets.ts treats the bank as an infinite stream: cycle 1 is a
// different shuffle of the same questions, so the quiz never runs out and never
// says so. That is the right behaviour for the SET machinery — there is no
// broken tail and no exhaustion state to handle mid-set — but it is the wrong
// behaviour for the home screen. Once every question has been served, the card
// is offering her a game whose content she has already finished, and the only
// honest thing left to do is stand down.
//
// DERIVED, NEVER STORED. `retired` is a function of the bank she has in front
// of her, so the day a larger bank lands the card comes back on its own, with no
// migration and no flag to unset. That is the whole reason this is computed from
// `bankSize` rather than latched into quiz:progress:v1.
//
// ⚠️ RETIREMENT CAPS THE COLLECTIONS. She can only complete
// `reachableSets(bankSize)` sets, ever — and paintings cost 4 sets each, cards
// 3. With too small a bank the collection screens sit at a fraction forever with
// no way to move, which is a worse thing to look at than a repeated question.
// `bankSizeToCollectEverything()` is the number that makes that impossible;
// __tests__/quizLifecycle.test.ts prints the current gap.

export interface QuizLifecycle {
  bankSize: number;
  /** Distinct questions served at least once. Clamped to bankSize. */
  seen: number;
  /** Every question in the bank has now been served at least once. */
  bankComplete: boolean;
  /**
   * The quiz is done and hides itself from the home screen.
   *
   * Currently the same thing as `bankComplete`. Kept as its own field because
   * the two answer different questions — "is there new content" versus "should
   * the entry point exist" — and the second is the one every screen wants.
   */
  retired: boolean;
}

export function quizLifecycle(setIndex: number, bankSize: number | null | undefined): QuizLifecycle {
  const size = Number.isFinite(bankSize) && (bankSize as number) > 0 ? Math.floor(bankSize as number) : 0;
  const idx = Number.isFinite(setIndex) && setIndex > 0 ? Math.floor(setIndex) : 0;
  // A bank we do not have yet must NOT read as finished. `size === 0` is the
  // never-been-online device, and retiring the quiz there would hide the feature
  // from the exact user who has not seen a single question.
  if (size === 0) return { bankSize: 0, seen: 0, bankComplete: false, retired: false };
  const seen = Math.min(idx * SET_SIZE, size);
  const bankComplete = seen >= size;
  return { bankSize: size, seen, bankComplete, retired: bankComplete };
}

/**
 * Sets she can ever complete against a bank of this size.
 *
 * Ceil, not floor: the last set of the cycle straddles the cycle boundary and is
 * still played in full — 327 questions is 66 sets, not 65. `setsPerCycle` in
 * quizSets.ts floors the same number for DISPLAY ("sets before it repeats"), and
 * the two are deliberately different questions.
 */
export function reachableSets(bankSize: number): number {
  const size = Number.isFinite(bankSize) && bankSize > 0 ? Math.floor(bankSize) : 0;
  return Math.ceil(size / SET_SIZE);
}

export interface Reachable {
  sets: number;
  paintings: number;
  cards: number;
}

/**
 * What a bank of this size lets her finish before the quiz retires.
 *
 * `artCount` / `lastTiles` describe the art SHAPE. Omit them and paintings are
 * counted as if every one were four tiles and there were an endless supply,
 * which is what this used to assume. Pass them and the final painting's real
 * size is used — the shipped collection ends on a two-tile diptych precisely so
 * that 130 sets finish 33 paintings instead of stranding two sets after 32.
 *
 * `cards` is unaffected by the tail rule: sliding the last draw onto the final
 * set changes WHEN it lands, not how many there are.
 */
export function reachableRewards(
  bankSize: number, artCount = 0, lastTiles = TILES_PER_PAINTING,
): Reachable {
  const sets = reachableSets(bankSize);
  const art = Math.max(0, Math.floor(artCount) || 0);
  const paintings = art > 0
    ? puzzleView(sets, art, lastTiles).completedPaintings
    : Math.floor(sets / TILES_PER_PAINTING);
  return { sets, paintings, cards: Math.floor(sets / MYSTERY_EVERY) };
}

/**
 * The smallest bank that leaves nothing stranded.
 *
 * Answering "how many questions do I need" from the collection sizes rather than
 * the other way round, because the collections are the expensive content: 24
 * paintings had to be sourced, cropped, described and translated seven ways, and
 * 40 cards were written and rewritten twice. Questions are the cheap side of the
 * equation, so they are the side that should move.
 */
export function bankSizeToCollectEverything(
  paintings: number, cards: number, lastTiles = TILES_PER_PAINTING,
): number {
  const setsNeeded = Math.max(
    totalTiles(Math.max(1, Math.floor(paintings)), lastTiles),
    Math.max(0, Math.floor(cards)) * MYSTERY_EVERY,
  );
  // The bank must be large enough that reachableSets() >= setsNeeded. Ceil
  // means (setsNeeded - 1) * SET_SIZE + 1 technically suffices; the round number
  // is what a content brief can actually be written against.
  return setsNeeded * SET_SIZE;
}
