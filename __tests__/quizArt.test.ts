// The puzzle reward maths.
//
// The interesting bug here is off-by-one. The results screen shows the board as
// it will be AFTER the set commits, and rings the tile that set earned — so it
// works with `completedSets + 1` while `puzzleView` is written against
// completed counts. Getting that wrong rings the previous tile, or none.

import { QUIZ_ART, QUIZ_ART_COUNT, artworkAt } from '../src/constants/quizArt';
import { rewardPreview as rawPreview, TILES_PER_PAINTING } from '../src/state/quizProgress';

const rewardPreview = (before: number) => rawPreview(before, QUIZ_ART_COUNT);

describe('art registry', () => {
  it('has unique, stable ids', () => {
    // Ids address a user's collected paintings. A duplicate would make two
    // entries indistinguishable in analytics and in React keys.
    const ids = QUIZ_ART.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes a count that matches the list', () => {
    expect(QUIZ_ART_COUNT).toBe(QUIZ_ART.length);
    expect(QUIZ_ART_COUNT).toBeGreaterThan(0);
  });

  it('gives every artwork a title key and a two-stop palette', () => {
    for (const a of QUIZ_ART) {
      expect(a.titleKey.startsWith('quiz.art.')).toBe(true);
      expect(a.bg).toHaveLength(2);
      expect(a.ink).toMatch(/^#/);
    }
  });

  it('clamps instead of returning undefined', () => {
    // A reward screen is the last place an out-of-range index should land.
    expect(artworkAt(-3)).toBe(QUIZ_ART[0]);
    expect(artworkAt(0)).toBe(QUIZ_ART[0]);
    expect(artworkAt(9999)).toBe(QUIZ_ART[QUIZ_ART_COUNT - 1]);
    expect(artworkAt(NaN)).toBe(QUIZ_ART[0]);
  });
});

describe('reward preview', () => {
  it('rings the tile the finished set just earned', () => {
    // First ever set → first quadrant, one tile open.
    expect(rewardPreview(0)).toMatchObject({ freshTile: 0 });
    expect(rewardPreview(0).view.tilesUnlocked).toBe(1);

    expect(rewardPreview(1)).toMatchObject({ freshTile: 1 });
    expect(rewardPreview(2)).toMatchObject({ freshTile: 2 });
    expect(rewardPreview(3)).toMatchObject({ freshTile: 3 });
  });

  it('completes the painting on the 4th set, then starts the next', () => {
    const fourth = rewardPreview(3);          // completing set #4
    expect(fourth.view.tilesUnlocked).toBe(TILES_PER_PAINTING);
    expect(fourth.view.paintingIndex).toBe(0);

    const fifth = rewardPreview(4);           // completing set #5
    expect(fifth.view.paintingIndex).toBe(1);
    expect(fifth.view.tilesUnlocked).toBe(1);
    expect(fifth.freshTile).toBe(0);
  });

  it('never rings a tile once the art runs out', () => {
    // Past the last painting the board shows fully unlocked; ringing a tile
    // there would claim a reward that doesn't exist.
    const past = rewardPreview(QUIZ_ART_COUNT * TILES_PER_PAINTING + 10);
    expect(past.view.outOfArt).toBe(true);
    expect(past.freshTile).toBeNull();
    expect(past.view.paintingIndex).toBe(QUIZ_ART_COUNT - 1);
    expect(past.view.tilesUnlocked).toBe(TILES_PER_PAINTING);
  });

  it('keeps the painting index inside the registry for every reachable count', () => {
    for (let done = 0; done < QUIZ_ART_COUNT * TILES_PER_PAINTING + 20; done += 1) {
      const { view } = rewardPreview(done);
      expect(view.paintingIndex).toBeGreaterThanOrEqual(0);
      expect(view.paintingIndex).toBeLessThan(QUIZ_ART_COUNT);
      expect(view.tilesUnlocked).toBeGreaterThanOrEqual(0);
      expect(view.tilesUnlocked).toBeLessThanOrEqual(TILES_PER_PAINTING);
    }
  });
});
