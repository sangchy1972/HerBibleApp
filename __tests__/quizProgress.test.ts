// The durable quiz ladder: puzzle tiles, mystery track, level, and the commit
// that advances all of them.

import {
  TILES_PER_PAINTING, MYSTERY_EVERY, INITIAL_PROGRESS,
  puzzleView, mysteryView, levelFor, applyCompletion, parseProgress,
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
    expect(v.completedPaintings).toBe(10);    // still counted honestly
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
