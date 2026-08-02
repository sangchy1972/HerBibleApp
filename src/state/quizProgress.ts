// The durable quiz ladder — sets completed, puzzle tiles, level.
//
// PURE. Everything here is derived from three integers; there is no stored
// puzzle array, no stored tile booleans, no stored "isPerfect" flags. That is
// the GospelsPsalmsContext doctrine — a derived view can't drift out of sync
// with the counter that produced it, and there is no stuck state to migrate.

/** Tiles per painting. A 2×2 board, so one set = one quarter. */
export const TILES_PER_PAINTING = 4;
/** Sets between mystery-reward drops. Placeholder economy, tune freely. */
export const MYSTERY_EVERY = 3;

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
export function puzzleView(completedSets: number, artCount: number): PuzzleView {
  const done = Math.max(0, Math.floor(completedSets) || 0);
  const art = Math.max(1, Math.floor(artCount) || 1);
  const completedPaintings = Math.floor(done / TILES_PER_PAINTING);
  const rawIndex = completedPaintings;
  const outOfArt = rawIndex >= art;
  const paintingIndex = outOfArt ? art - 1 : rawIndex;
  // Past the last artwork we show it fully unlocked rather than restarting a
  // board the user can never finish.
  const tilesUnlocked = outOfArt ? TILES_PER_PAINTING : done % TILES_PER_PAINTING;
  return {
    paintingIndex,
    tilesUnlocked,
    tiles: Array.from({ length: TILES_PER_PAINTING }, (_, i) => (i < tilesUnlocked ? 'unlocked' : 'locked')),
    completedPaintings,
    outOfArt,
  };
}

export interface MysteryView {
  current: number;
  target: number;
  remaining: number;
}

/** Placeholder reward track — "N levels away from the mystery reward". */
export function mysteryView(completedSets: number): MysteryView {
  const done = Math.max(0, Math.floor(completedSets) || 0);
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
