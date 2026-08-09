// The durable quiz ladder: puzzle tiles, mystery track, level, and the commit
// that advances all of them.

import {
  TILES_PER_PAINTING, MYSTERY_EVERY, INITIAL_PROGRESS,
  puzzleView, rewardPreview, mysteryView, levelFor, applyCompletion, parseProgress,
  totalTiles, tilesOfPainting, paintingFinishedBy,
} from '../src/state/quizProgress';

describe('puzzleView', () => {
  it('starts fully locked', () => {
    const v = puzzleView(0, 3);
    expect(v.paintingIndex).toBe(0);
    expect(v.tilesUnlocked).toBe(0);
    expect(v.tiles).toEqual(['locked', 'locked', 'locked', 'locked']);
    expect(v.completedPaintings).toBe(0);
    expect(v.outOfArt).toBe(false);
  });

  it('unlocks one tile per completed set', () => {
    expect(puzzleView(1, 3).tiles).toEqual(['unlocked', 'locked', 'locked', 'locked']);
    expect(puzzleView(3, 3).tiles).toEqual(['unlocked', 'unlocked', 'unlocked', 'locked']);
  });

  it('rolls to the next painting on the 4th set', () => {
    const v = puzzleView(4, 3);
    expect(v.paintingIndex).toBe(1);
    expect(v.tilesUnlocked).toBe(0);
    expect(v.completedPaintings).toBe(1);
  });

  it('CLAMPS instead of indexing past the shipped artwork', () => {
    // A reward screen is exactly where an out-of-range index would land on a
    // user who has been enjoying the feature. Crash-free is non-negotiable.
    const v = puzzleView(40, 3);
    expect(v.paintingIndex).toBe(2);          // last artwork, not 10
    expect(v.outOfArt).toBe(true);
    expect(v.tilesUnlocked).toBe(TILES_PER_PAINTING);   // shown whole, not restarted
    // completedPaintings CLAMPS too. It used to count honestly past the art,
    // which sounds more correct and shipped as "25 of 24 paintings" climbing
    // forever on the progress row while the collection screen, which clamps on
    // its own, said 24 of 24. Nothing consumes the raw count: every caller
    // renders it against a total or slices the registry with it.
    expect(v.completedPaintings).toBe(3);
  });

  it('survives nonsense input', () => {
    expect(() => puzzleView(-5, 3)).not.toThrow();
    expect(puzzleView(-5, 3).tilesUnlocked).toBe(0);
    expect(puzzleView(NaN, 3).tilesUnlocked).toBe(0);
    expect(puzzleView(4, 0).paintingIndex).toBe(0);   // artCount clamped to >= 1
  });
});

describe('mysteryView', () => {
  it('counts toward the next drop and wraps', () => {
    expect(mysteryView(0)).toEqual({ current: 0, target: MYSTERY_EVERY, remaining: 3 });
    expect(mysteryView(1)).toEqual({ current: 1, target: MYSTERY_EVERY, remaining: 2 });
    expect(mysteryView(3)).toEqual({ current: 0, target: MYSTERY_EVERY, remaining: 3 });
    expect(mysteryView(4)).toEqual({ current: 1, target: MYSTERY_EVERY, remaining: 2 });
  });
});

describe('levelFor', () => {
  it('is 1-based so a new user reads Level 1, not Level 0', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(1)).toBe(2);
    expect(levelFor(-3)).toBe(1);
  });
});

describe('applyCompletion', () => {
  const base = { ...INITIAL_PROGRESS };

  it('advances the ladder on a flawless set', () => {
    const p = applyCompletion(base, { firstPassWrong: 0, totalQuestions: 5 }, '2026-07-26');
    expect(p.setIndex).toBe(1);
    expect(p.completedSets).toBe(1);
    expect(p.perfectSets).toBe(1);
    expect(p.totalCorrect).toBe(5);
    expect(p.lastCompletedYmd).toBe('2026-07-26');
  });

  it('still completes the set after retries, but not "perfect"', () => {
    // The user's chosen economy: every completed set unlocks a tile. perfectSets
    // is kept because it is the only record of first-pass accuracy and cannot be
    // reconstructed once retries have overwritten the answers.
    const p = applyCompletion(base, { firstPassWrong: 2, totalQuestions: 5 });
    expect(p.completedSets).toBe(1);
    expect(p.perfectSets).toBe(0);
    expect(p.totalCorrect).toBe(3);
  });

  it('never records negative correctness', () => {
    const p = applyCompletion(base, { firstPassWrong: 99, totalQuestions: 5 });
    expect(p.totalCorrect).toBe(0);
  });

  it('keeps the previous date when none is supplied', () => {
    const withDate = { ...base, lastCompletedYmd: '2026-01-01' };
    expect(applyCompletion(withDate, { firstPassWrong: 0, totalQuestions: 5 }).lastCompletedYmd).toBe('2026-01-01');
  });

  it('four completed sets = one finished painting', () => {
    let p = base;
    for (let i = 0; i < 4; i += 1) p = applyCompletion(p, { firstPassWrong: 0, totalQuestions: 5 });
    expect(puzzleView(p.completedSets, 3).completedPaintings).toBe(1);
  });
});

describe('parseProgress', () => {
  it('round-trips', () => {
    const p = applyCompletion({ ...INITIAL_PROGRESS }, { firstPassWrong: 1, totalQuestions: 5 }, '2026-07-26');
    expect(parseProgress(JSON.stringify(p), 1)).toEqual(p);
  });

  it('falls back to a fresh ladder on junk', () => {
    for (const raw of [null, '{bad', 'null', JSON.stringify({ v: 9 })]) {
      expect(parseProgress(raw, 1)).toEqual({ ...INITIAL_PROGRESS, bankVersion: 1 });
    }
  });

  it('KEEPS progress across a bank version change', () => {
    // Unlike the session, which is discarded. Losing a user's puzzle progress
    // because a question got reworded would be indefensible.
    const p = applyCompletion({ ...INITIAL_PROGRESS }, { firstPassWrong: 0, totalQuestions: 5 });
    const restored = parseProgress(JSON.stringify(p), 7);
    expect(restored.completedSets).toBe(1);
    expect(restored.bankVersion).toBe(7);
  });

  it('sanitises negative and non-numeric counters', () => {
    const raw = JSON.stringify({ v: 1, setIndex: -4, completedSets: 'x', perfectSets: 2.9, totalCorrect: null });
    const p = parseProgress(raw, 1);
    expect(p.setIndex).toBe(0);
    expect(p.completedSets).toBe(0);
    expect(p.perfectSets).toBe(2);
    expect(p.totalCorrect).toBe(0);
  });
});


// ── The diptych: the final painting is two halves, not four quarters ─────────
//
// 130 sets do not divide by 4. Without a short last painting the last two sets
// of the whole game unlock nothing at all. Everything below is the arithmetic
// that makes 32x4 + 2 = 130 land exactly; quizLifecycle.test.ts pins it against
// the shipped constants.
describe('the last painting is short', () => {
  const ART = 33; const LAST = 2;

  it('counts the tiles the collection actually costs', () => {
    expect(totalTiles(ART, LAST)).toBe(130);
    expect(totalTiles(33)).toBe(132);                    // default: all four-tile
    expect(tilesOfPainting(0, ART, LAST)).toBe(4);
    expect(tilesOfPainting(31, ART, LAST)).toBe(4);
    expect(tilesOfPainting(32, ART, LAST)).toBe(2);      // the diptych
  });

  it('walks the seam between painting 32 and the diptych', () => {
    expect(puzzleView(127, ART, LAST)).toMatchObject({ paintingIndex: 31, tilesUnlocked: 3 });
    // 128 finishes painting 32 and moves her onto the diptych, empty.
    const at128 = puzzleView(128, ART, LAST);
    expect(at128).toMatchObject({ paintingIndex: 32, tilesUnlocked: 0, completedPaintings: 32 });
    expect(at128.tiles).toEqual(['locked', 'locked']);   // TWO, not four
    expect(puzzleView(129, ART, LAST).tiles).toEqual(['unlocked', 'locked']);
  });

  it('is complete at 130, not at 132', () => {
    const done = puzzleView(130, ART, LAST);
    expect(done.outOfArt).toBe(true);
    expect(done.completedPaintings).toBe(33);
    expect(done.tiles).toEqual(['unlocked', 'unlocked']);
    expect(puzzleView(129, ART, LAST).outOfArt).toBe(false);
  });

  it('rings the right half on the last set she will ever play', () => {
    expect(rewardPreview(128, ART, LAST)).toMatchObject({ freshTile: 0 });
    const last = rewardPreview(129, ART, LAST);
    expect(last.freshTile).toBe(1);
    expect(last.view.tiles).toEqual(['unlocked', 'unlocked']);
    expect(last.view.completedPaintings).toBe(33);       // credited on the set that finishes it
    expect(rewardPreview(130, ART, LAST).freshTile).toBeNull();
  });

  it('fires the completion celebration for the diptych', () => {
    // `committed % 4 === 0` fired on 128 and then never again, so the finale
    // would have been completed in silence.
    expect(paintingFinishedBy(4, ART, LAST)).toBe(0);
    expect(paintingFinishedBy(128, ART, LAST)).toBe(31);
    expect(paintingFinishedBy(129, ART, LAST)).toBeNull();
    expect(paintingFinishedBy(130, ART, LAST)).toBe(32);
    expect(paintingFinishedBy(131, ART, LAST)).toBeNull();
    expect(paintingFinishedBy(0, ART, LAST)).toBeNull();
  });

  it('survives nonsense without throwing', () => {
    expect(() => puzzleView(NaN, ART, LAST)).not.toThrow();
    expect(puzzleView(-5, ART, 0).tilesUnlocked).toBe(0);
    expect(totalTiles(0, 2)).toBe(2);
    expect(tilesOfPainting(-3, ART, LAST)).toBe(4);
  });
});

// ── The mystery countdown's final cycle is four sets long ────────────────────
describe('mysteryView with a known total', () => {
  const TOTAL = 130;

  it('is the plain 3-cycle everywhere but the end', () => {
    expect(mysteryView(0, TOTAL)).toEqual({ current: 0, target: 3, remaining: 3 });
    expect(mysteryView(4, TOTAL)).toEqual({ current: 1, target: 3, remaining: 2 });
    expect(mysteryView(125, TOTAL)).toEqual({ current: 2, target: 3, remaining: 1 });
  });

  it('switches to a 4-set target for the last stretch', () => {
    // Without this the bar reads 3/3 at set 129 and hands her nothing.
    expect(mysteryView(126, TOTAL)).toEqual({ current: 0, target: 4, remaining: 4 });
    expect(mysteryView(127, TOTAL)).toEqual({ current: 1, target: 4, remaining: 3 });
    expect(mysteryView(129, TOTAL)).toEqual({ current: 3, target: 4, remaining: 1 });
  });

  it('falls back to the 3-cycle when the total is unknown', () => {
    expect(mysteryView(127)).toEqual({ current: 1, target: 3, remaining: 2 });
  });
});
