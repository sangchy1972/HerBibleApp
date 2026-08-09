// The rules QuizChallengeScreen orchestrates, extracted and pinned.
//
// WHY THIS FILE EXISTS
// ────────────────────
// Three separate audits once found three separate blank screens here, all in
// the predicates that decide, after a set commits, WHO OWNS THE SCREEN. The
// screen is React and this repo's jest setup has no renderer, so the rules are
// restated as pure functions and checked over every reachable combination.
//
// THE CURRENT DESIGN (single "Next level" CTA, no trip home between sets):
// committing a set re-fires the auto-open effect, so the layer UNDER any
// celebration is always one of exactly three things —
//     the next set        open() succeeds
//     DailyCapView        open() refuses: daily cap spent
//     QuizDoneView        open() refuses: bank finished
// and the celebrations stack ON TOP in a fixed order (painting above draw,
// via MysteryDrawOverlay's `blocked` prop). Dismissing a celebration merely
// uncovers the layer below; nothing navigates. There is no post-commit limbo,
// which is why the old 1500 ms safety net is gone.

import { drawEarnedAt } from '../src/state/cardDraw';
import {
  MYSTERY_EVERY, TILES_PER_PAINTING, totalTiles, paintingFinishedBy,
} from '../src/state/quizProgress';
import { QUIZ_ART_COUNT, LAST_ART_TILES } from '../src/constants/quizArt';
import { quizLifecycle, reachableSets } from '../src/state/quizLifecycle';
import { QUIZ_BANK_SIZE } from '../src/constants/bibleQuiz';

/** Sets the shipping bank yields. The reward tail is measured from it. */
const TOTAL_SETS = reachableSets(QUIZ_BANK_SIZE);

/** The base layer after a commit — mirrors open()'s refusals. */
type Base = 'nextSet' | 'dailyCap' | 'done';
function baseAfterCommit(committed: number, setsUsedToday: number, dailyLimit = 3): Base {
  if (quizLifecycle(committed, QUIZ_BANK_SIZE).retired) return 'done';
  if (setsUsedToday >= dailyLimit) return 'dailyCap';
  return 'nextSet';
}

/**
 * Celebrations the commit stacks on top. Mirrors onNextLevel + the grant effect.
 *
 * Calls the SAME functions the screen calls. It used to re-implement them
 * (`committed % TILES_PER_PAINTING === 0`), which meant that when the screen
 * moved to paintingFinishedBy for the diptych, this file went on pinning a rule
 * nothing implemented any more — a guard that passes and guards nothing.
 */
function celebrationsAfterCommit(committedBefore: number) {
  const committed = committedBefore + 1;
  return {
    painting: paintingFinishedBy(committed, QUIZ_ART_COUNT, LAST_ART_TILES) != null,
    // The grant CLEARS the dismissed latch (prevPending effect in the screen),
    // so an earned draw always opens — earlier dismissal notwithstanding.
    draw: drawEarnedAt(committed, MYSTERY_EVERY, TOTAL_SETS),
  };
}

describe('after a commit, the screen always has a base owner', () => {
  it('every reachable commit lands on a real base layer', () => {
    for (let committed = 1; committed <= reachableSets(QUIZ_BANK_SIZE); committed += 1) {
      for (let used = 1; used <= 3; used += 1) {
        expect(['nextSet', 'dailyCap', 'done']).toContain(baseAfterCommit(committed, used));
      }
    }
  });

  it('the daily cap owns the base once the third set commits', () => {
    expect(baseAfterCommit(5, 3)).toBe('dailyCap');
    expect(baseAfterCommit(5, 2)).toBe('nextSet');
  });

  it('retirement outranks the daily cap', () => {
    const LAST = reachableSets(QUIZ_BANK_SIZE);
    expect(baseAfterCommit(LAST, 3)).toBe('done');
  });
});

describe('celebrations stack, never own', () => {
  it('a dismissed draw cannot suppress a NEW draw (the old latch bug)', () => {
    // The grant clears the latch, so `draw` here is unconditional on dismissal.
    expect(celebrationsAfterCommit(MYSTERY_EVERY - 1).draw).toBe(true);
    expect(celebrationsAfterCommit(2 * MYSTERY_EVERY - 1).draw).toBe(true);
  });

  it('every 12th set stacks BOTH; painting sits above the draw', () => {
    const c = celebrationsAfterCommit(11);           // commits set 12
    expect(c.painting).toBe(true);
    expect(c.draw).toBe(true);
    // Order is enforced by MysteryDrawOverlay's `blocked={finishedPainting != null}`;
    // this test pins that both are expected at once so that prop stays necessary.
  });

  it('past the last painting, no phantom celebration replays', () => {
    const beyond = totalTiles(QUIZ_ART_COUNT, LAST_ART_TILES);   // 130: the art is spent
    expect(celebrationsAfterCommit(beyond).painting).toBe(false);
    expect(celebrationsAfterCommit(beyond + TILES_PER_PAINTING).painting).toBe(false);
  });

  it('celebrates each painting exactly once, including the diptych', () => {
    const fired: number[] = [];
    for (let before = 0; before < TOTAL_SETS + 20; before += 1) {
      const p = paintingFinishedBy(before + 1, QUIZ_ART_COUNT, LAST_ART_TILES);
      if (p != null) fired.push(p);
    }
    expect(fired).toEqual(Array.from({ length: QUIZ_ART_COUNT }, (_, i) => i));
  });
});

describe('the last set of the bank', () => {
  const LAST = reachableSets(QUIZ_BANK_SIZE);          // 130 against today's bank

  it('retires the quiz only once it is committed', () => {
    expect(quizLifecycle(LAST - 1, QUIZ_BANK_SIZE).retired).toBe(false);
    expect(quizLifecycle(LAST, QUIZ_BANK_SIZE).retired).toBe(true);
  });

  it('keeps the overlay reachable on the set that retires the quiz', () => {
    // THE COLLISION IS NOW DELIBERATE. At 327 questions LAST was 66 and 66 % 3
    // === 0, so the retiring set also drew a card, and that collision nearly
    // shipped the last card unredeemable. At 650 the plain rule would have
    // separated them — but the tail rule slides the 43rd draw ONTO set 130 on
    // purpose, so the collision is back by design. This test therefore has to
    // assert that the collision is HANDLED, not that it is absent.
    //
    // It also has to call the 3-arg form. The 2-arg form still answers "false"
    // here, which is what let this guard go blind to the very thing it exists
    // for.
    expect(drawEarnedAt(LAST, MYSTERY_EVERY, TOTAL_SETS)).toBe(true);
    expect(celebrationsAfterCommit(LAST - 1)).toEqual({ painting: true, draw: true });

    // Both celebrations AND retirement on one commit. The overlay opens over
    // QuizDoneView (blocked by the painting until she collects it), and the
    // home card keeps a door open while `pendingDraw` is true.
    expect(baseAfterCommit(LAST, 1)).toBe('done');
  });

  it('does not pay a card out on the set before the last', () => {
    // 129 % 3 === 0, so the plain rule WOULD have. The tail rule holds it back
    // to 130 — if this ever flips, the final cycle is silently three sets again
    // and the 43rd card is unreachable.
    expect(drawEarnedAt(LAST - 1, MYSTERY_EVERY, TOTAL_SETS)).toBe(false);
    expect(drawEarnedAt(LAST - 4, MYSTERY_EVERY, TOTAL_SETS)).toBe(true);
  });
});
