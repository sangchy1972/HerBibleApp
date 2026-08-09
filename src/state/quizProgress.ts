// The durable quiz ladder — sets completed, puzzle tiles, level.
//
// PURE. Everything here is derived from three integers; there is no stored
// puzzle array, no stored tile booleans, no stored "isPerfect" flags. That is
// the GospelsPsalmsContext doctrine — a derived view can't drift out of sync
// with the counter that produced it, and there is no stuck state to migrate.

/** Tiles on a STANDARD painting. A 2×2 board, so one set = one quarter. */
export const TILES_PER_PAINTING = 4;
/** Sets between mystery card draws. Load-bearing: this IS the reward economy. */
export const MYSTERY_EVERY = 3;

// ── The tail ─────────────────────────────────────────────────────────────────
//
// 650 questions = 130 sets, and neither reward divides into it:
//   130 / 4 tiles  = 32.5 paintings
//   130 / 3 sets   = 43.33 draws
//
// Left alone, both remainders are dead sets — the last two sets of the game
// would unlock no tile at all (the 33rd painting never existing), and the 130th
// would earn no card. The fix in both cases is to make the FINAL unit absorb the
// remainder rather than to drop it:
//
//   • the last painting is a DIPTYCH — 2 tiles, left and right — so
//     32×4 + 2 = 130 exactly, and 33 paintings are collectable.
//   • the last draw costs 4 sets instead of 3, so 42×3 + 4 = 130 exactly, and
//     43 cards are collectable.
//
// Both land on set 130 together, which is also the set that retires the quiz.
//
// Everything below takes the totals as ARGUMENTS rather than reading them from
// the art list or the bank. This module is deliberately zero-import (the
// GospelsPsalmsContext doctrine) and the totals are exactly the things that
// change when content ships.

/** Tiles on painting `index` — `lastTiles` for the final one, 4 for the rest. */
export function tilesOfPainting(index: number, artCount: number, lastTiles = TILES_PER_PAINTING): number {
  const art = Math.max(1, Math.floor(artCount) || 1);
  const last = Math.max(1, Math.floor(lastTiles) || TILES_PER_PAINTING);
  return Math.floor(index) >= art - 1 ? last : TILES_PER_PAINTING;
}

/** Sets it takes to finish every painting. */
export function totalTiles(artCount: number, lastTiles = TILES_PER_PAINTING): number {
  const art = Math.max(1, Math.floor(artCount) || 1);
  const last = Math.max(1, Math.floor(lastTiles) || TILES_PER_PAINTING);
  return (art - 1) * TILES_PER_PAINTING + last;
}

/**
 * The painting a commit just FINISHED, or null.
 *
 * `committed` is 1-based (the set she has just completed). Replaces a
 * `committed % 4 === 0` test that is wrong the moment the last painting is not
 * four tiles: it would fire on set 128 (correct) and then never again, so the
 * diptych would be completed with no celebration at all.
 */
export function paintingFinishedBy(
  committed: number, artCount: number, lastTiles = TILES_PER_PAINTING,
): number | null {
  const n = Math.floor(committed) || 0;
  const art = Math.max(1, Math.floor(artCount) || 1);
  const last = Math.max(1, Math.floor(lastTiles) || TILES_PER_PAINTING);
  if (n <= 0 || n > totalTiles(art, last)) return null;
  const { paintingIndex, tileInPainting } = locate(n - 1, art, last);
  return tileInPainting + 1 >= tilesOfPainting(paintingIndex, art, last) ? paintingIndex : null;
}

/**
 * Where tile `i` sits, as FRACTIONS of the board — every field is 0..1 and
 * every caller multiplies by w or h.
 *
 * TWO layouts, because the last painting is a DIPTYCH. Four tiles are the usual
 * 2x2 quarters; two are LEFT and RIGHT halves, full height — a diptych split
 * horizontally is what the form actually is, and stacking them would read as a
 * 2x2 board with half of it missing.
 *
 * The first cut returned tile INDICES here (fx = i % 2, i.e. 0 or 1) while the
 * callers went on multiplying by the full width. Every offset came out 2x too
 * large, the board's overflow:hidden swallowed tiles 1-3, and the result was
 * that on ALL 33 paintings only the top-left quarter was ever washed or locked
 * — the other three showed at full colour, unearned — while the fresh-tile ring
 * and reveal animation played off-canvas for three sets in every four. tsc
 * cannot see it (everything is `number`).
 *
 * It lives HERE rather than in PuzzleBoard for the reason everything else in
 * this file does: node-environment jest cannot render the component, so
 * geometry left inside it is geometry nothing can check.
 */
export function tileRect(i: number, count: number) {
  if (count === 2) return { fx: i / 2, fy: 0, fw: 1 / 2, fh: 1 };
  return { fx: (i % 2) / 2, fy: Math.floor(i / 2) / 2, fw: 1 / 2, fh: 1 / 2 };
}

/** Painting and tile-within-it for a 0-based tile ordinal. */
function locate(tileOrdinal: number, artCount: number, lastTiles: number) {
  const art = Math.max(1, Math.floor(artCount) || 1);
  const beforeLast = (art - 1) * TILES_PER_PAINTING;
  if (tileOrdinal < beforeLast) {
    return { paintingIndex: Math.floor(tileOrdinal / TILES_PER_PAINTING), tileInPainting: tileOrdinal % TILES_PER_PAINTING };
  }
  return { paintingIndex: art - 1, tileInPainting: tileOrdinal - beforeLast };
}

export interface QuizProgressV1 {
  v: 1;
  bankVersion: number;
  /** 0-based index of the NEXT unfinished set. */
  setIndex: number;
  /** Sets finished (every question eventually correct). Drives the puzzle. */
  completedSets: number;
  /**
   * Sets finished 5/5 with no retry. Not currently a reward gate — the user
   * chose "every completed set unlocks a tile" — but recorded because it is the
   * only measure of real accuracy, and it cannot be reconstructed after the
   * fact once retries have overwritten the answers.
   */
  perfectSets: number;
  /** Lifetime first-pass correct answers. Drives the level ladder. */
  totalCorrect: number;
  lastCompletedYmd: string | null;
}

export const INITIAL_PROGRESS: QuizProgressV1 = {
  v: 1,
  bankVersion: 1,
  setIndex: 0,
  completedSets: 0,
  perfectSets: 0,
  totalCorrect: 0,
  lastCompletedYmd: null,
};

export interface PuzzleView {
  paintingIndex: number;
  tilesUnlocked: number;
  tiles: Array<'locked' | 'unlocked'>;
  completedPaintings: number;
  /** True once progress has run past the artwork actually shipped. */
  outOfArt: boolean;
}

/**
 * Which painting, and how much of it.
 *
 * `artCount` is the number of placeholder/real artworks bundled. When progress
 * outruns them the view CLAMPS to the last one rather than indexing past the
 * end — "crash-free is non-negotiable", and a reward screen is exactly where an
 * out-of-range index would land on a user who has been enjoying the feature.
 */
export function puzzleView(completedSets: number, artCount: number, lastTiles = TILES_PER_PAINTING): PuzzleView {
  const done = Math.max(0, Math.floor(completedSets) || 0);
  const art = Math.max(1, Math.floor(artCount) || 1);
  const last = Math.max(1, Math.floor(lastTiles) || TILES_PER_PAINTING);
  const total = totalTiles(art, last);
  const outOfArt = done >= total;

  if (outOfArt) {
    // Past the last artwork we show it fully unlocked rather than restarting a
    // board the user can never finish.
    const tilesHere = last;
    return {
      paintingIndex: art - 1,
      tilesUnlocked: tilesHere,
      tiles: Array.from({ length: tilesHere }, () => 'unlocked' as const),
      // CLAMPED, not raw. Unclamped this counts paintings that do not exist, and
      // the progress row read "25 of 24 paintings" and kept climbing while the
      // collection screen, which clamps on its own, said 24 of 24. Clamping at
      // the source is what stops the next consumer reintroducing the mismatch.
      completedPaintings: art,
      outOfArt: true,
    };
  }

  const { paintingIndex, tileInPainting } = locate(done, art, last);
  const tilesHere = tilesOfPainting(paintingIndex, art, last);
  return {
    paintingIndex,
    tilesUnlocked: tileInPainting,
    tiles: Array.from({ length: tilesHere }, (_, i) => (i < tileInPainting ? 'unlocked' : 'locked')),
    completedPaintings: paintingIndex,
    outOfArt: false,
  };
}

export interface RewardPreview {
  view: PuzzleView;
  /** Quadrant to ring, or null when there is nothing new to show. */
  freshTile: number | null;
}

/**
 * The board as the results screen should show it, for a set the user has just
 * finished but not yet committed.
 *
 * Not simply `puzzleView(completedSets + 1)`: on the set that COMPLETES a
 * painting that call rolls straight on to the next one and reports 0 tiles, so
 * the reward screen would show an empty board at the exact moment she earned a
 * finished picture. The last tile of a painting has to stay on the painting it
 * belongs to; the roll-over happens on the NEXT set.
 */
export function rewardPreview(
  completedSetsBefore: number, artCount: number, lastTiles = TILES_PER_PAINTING,
): RewardPreview {
  const before = Math.max(0, Math.floor(completedSetsBefore) || 0);
  const earned = before + 1;
  const art = Math.max(1, Math.floor(artCount) || 1);
  const last = Math.max(1, Math.floor(lastTiles) || TILES_PER_PAINTING);

  const outOfArt = earned > totalTiles(art, last);
  if (outOfArt) return { view: puzzleView(earned, art, last), freshTile: null };

  const { paintingIndex, tileInPainting } = locate(earned - 1, art, last);
  const tilesHere = tilesOfPainting(paintingIndex, art, last);
  const view: PuzzleView = {
    paintingIndex,
    tilesUnlocked: tileInPainting + 1,
    tiles: Array.from({ length: tilesHere }, (_, i) => (i <= tileInPainting ? 'unlocked' : 'locked')),
    // +1 only when this tile FINISHES the picture; the roll-over otherwise
    // happens on the next set.
    completedPaintings: paintingIndex + (tileInPainting + 1 >= tilesHere ? 1 : 0),
    outOfArt: false,
  };
  return { view, freshTile: tileInPainting };
}

export interface MysteryView {
  current: number;
  target: number;
  remaining: number;
}

/**
 * Where the last draw lands, and how long its cycle is.
 *
 * `totalSets` <= 0 means "we do not know yet" (no bank on the device), and the
 * plain every-3 rule applies — the tail cannot be computed without knowing
 * where the end is, and guessing would be worse than deferring.
 */
export function finalCycle(totalSets: number): { at: number; length: number } | null {
  const total = Math.max(0, Math.floor(totalSets) || 0);
  const cycles = Math.floor(total / MYSTERY_EVERY);
  if (cycles < 1) return null;
  // 42 whole cycles then one of 3 + leftover. For 130 that is 3+1 = 4.
  return { at: total, length: MYSTERY_EVERY + (total % MYSTERY_EVERY) };
}

/**
 * The mystery-card countdown — "N sets from the next draw". Real, not
 * decorative: hitting zero grants an actual draw via grantDrawsThrough.
 *
 * `totalSets` makes the FINAL cycle longer so the leftover sets are not dead.
 * Without it the bar would read 3/3 at set 129 and hand her nothing, then run
 * set 130 with no counter at all.
 */
export function mysteryView(completedSets: number, totalSets = 0): MysteryView {
  const done = Math.max(0, Math.floor(completedSets) || 0);
  const fin = finalCycle(totalSets);
  // In the final cycle once every whole cycle before it is spent.
  if (fin && done >= fin.at - fin.length && done < fin.at) {
    const current = done - (fin.at - fin.length);
    return { current, target: fin.length, remaining: fin.length - current };
  }
  const current = done % MYSTERY_EVERY;
  return { current, target: MYSTERY_EVERY, remaining: MYSTERY_EVERY - current };
}

/**
 * Level = the number shown on the review screen. 1-based so a brand-new user
 * reads "Level 1" rather than "Level 0", and it advances once per completed
 * set, which is what makes the review screen feel like it moved.
 */
export function levelFor(completedSets: number): number {
  return Math.max(0, Math.floor(completedSets) || 0) + 1;
}

/** Commit a finished set. The only writer of the durable record. */
export function applyCompletion(
  p: QuizProgressV1,
  outcome: { firstPassWrong: number; totalQuestions: number },
  ymd: string | null = null,
): QuizProgressV1 {
  const firstPassWrong = Math.max(0, Math.floor(outcome.firstPassWrong) || 0);
  const total = Math.max(0, Math.floor(outcome.totalQuestions) || 0);
  return {
    ...p,
    setIndex: p.setIndex + 1,
    completedSets: p.completedSets + 1,
    perfectSets: p.perfectSets + (firstPassWrong === 0 ? 1 : 0),
    totalCorrect: p.totalCorrect + Math.max(0, total - firstPassWrong),
    lastCompletedYmd: ymd ?? p.lastCompletedYmd,
  };
}

/**
 * Parse the durable record. Unlike the session, this one is NOT discarded on a
 * bankVersion mismatch — the ladder is index-based and re-derives cleanly
 * against a new bank, so we only re-stamp the version. Losing a user's puzzle
 * progress because a question got reworded would be indefensible.
 */
export function parseProgress(raw: string | null, bankVersion: number): QuizProgressV1 {
  const fresh = { ...INITIAL_PROGRESS, bankVersion };
  if (!raw) return fresh;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || p.v !== 1) return fresh;
    const int = (x: unknown) => (Number.isFinite(x) && (x as number) >= 0 ? Math.floor(x as number) : 0);
    return {
      v: 1,
      bankVersion,
      setIndex: int(p.setIndex),
      completedSets: int(p.completedSets),
      perfectSets: int(p.perfectSets),
      totalCorrect: int(p.totalCorrect),
      lastCompletedYmd: typeof p.lastCompletedYmd === 'string' ? p.lastCompletedYmd : null,
    };
  } catch {
    return fresh;
  }
}
