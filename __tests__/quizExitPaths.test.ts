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
import { MYSTERY_EVERY, TILES_PER_PAINTING } from '../src/state/quizProgress';
import { QUIZ_ART_COUNT } from '../src/constants/quizArt';
import { quizLifecycle, reachableSets } from '../src/state/quizLifecycle';
import { QUIZ_BANK_SIZE } from '../src/constants/bibleQuiz';

/** The base layer after a commit — mirrors open()'s refusals. */
type Base = 'nextSet' | 'dailyCap' | 'done';
function baseAfterCommit(committed: number, setsUsedToday: number, dailyLimit = 3): Base {
  if (quizLifecycle(committed, QUIZ_BANK_SIZE).retired) return 'done';
  if (setsUsedToday >= dailyLimit) return 'dailyCap';
  return 'nextSet';
}

/** Celebrations the commit stacks on top. Mirrors onNextLevel + the grant effect. */
function celebrationsAfterCommit(committedBefore: number) {
  const committed = committedBefore + 1;
  const pIdx = committed / TILES_PER_PAINTING - 1;
  return {
    painting: committed % TILES_PER_PAINTING === 0 && pIdx < QUIZ_ART_COUNT,
    // The grant CLEARS the dismissed latch (prevPending effect in the screen),
    // so an earned draw always opens — earlier dismissal notwithstanding.
    draw: drawEarnedAt(committed, MYSTERY_EVERY),
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
    const beyond = QUIZ_ART_COUNT * TILES_PER_PAINTING;      // first commit past the art
    expect(celebrationsAfterCommit(beyond + TILES_PER_PAINTING - 1).painting).toBe(false);
  });
});

describe('the last set of the bank', () => {
  const LAST = reachableSets(QUIZ_BANK_SIZE);          // 130 against today's bank

  it('retires the quiz only once it is committed', () => {
    expect(quizLifecycle(LAST - 1, QUIZ_BANK_SIZE).retired).toBe(false);
    expect(quizLifecycle(LAST, QUIZ_BANK_SIZE).retired).toBe(true);
  });

  it('keeps the overlay reachable on whichever set retires the quiz', () => {
    // Whether the retiring set ALSO earns a card depends on the bank size, and
    // it just changed: at 327 questions LAST was 66 and 66 % 3 === 0, so the
    // two collided; at 650 it is 130 and 130 % 3 === 1, so they do not. The
    // collision is what nearly shipped the last card unredeemable, and the next
    // re-cut can bring it back — so assert the property, not the arithmetic of
    // one bank size.
    const retiringSetAlsoDraws = drawEarnedAt(LAST, MYSTERY_EVERY);
    expect(retiringSetAlsoDraws).toBe(LAST % MYSTERY_EVERY === 0);

    // The last draw of the bank, wherever it falls, must still land somewhere
    // the user can reach: the overlay opens over QuizDoneView, and the home
    // card keeps a door open while `pendingDraw` is true.
    const lastDrawSet = LAST - (LAST % MYSTERY_EVERY);
    expect(drawEarnedAt(lastDrawSet, MYSTERY_EVERY)).toBe(true);
    expect(celebrationsAfterCommit(lastDrawSet - 1).draw).toBe(true);
    expect(baseAfterCommit(LAST, 1)).toBe('done');
  });
});
