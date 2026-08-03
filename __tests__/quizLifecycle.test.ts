// When the quiz stands down, and what she owns by then.
//
// The second half of this file is not really testing code — it is pinning the
// CONTENT BUDGET. Retirement caps how many sets she can ever complete, and
// paintings and cards are bought with sets, so the size of the question bank
// silently decides whether the collection screens can ever reach 100%. That
// number belongs in version control where it can be argued with.

import {
  quizLifecycle, reachableSets, reachableRewards, bankSizeToCollectEverything,
} from '../src/state/quizLifecycle';
import { TILES_PER_PAINTING, MYSTERY_EVERY } from '../src/state/quizProgress';
import { QUIZ_ART_COUNT } from '../src/constants/quizArt';
import { MYSTERY_CARD_COUNT } from '../src/constants/mysteryCards';
import { QUIZ_BANK_SIZE } from '../src/constants/bibleQuiz';
import { SET_SIZE } from '../src/services/quizSets';

describe('quizLifecycle', () => {
  it('does not retire a quiz she has not started', () => {
    expect(quizLifecycle(0, 327)).toMatchObject({ seen: 0, bankComplete: false, retired: false });
  });

  it('retires only once every question has been served', () => {
    // 327 questions, 5 per set. Set 65 has served 325 of them; two are still
    // unseen and the quiz must stay.
    expect(quizLifecycle(65, 327).retired).toBe(false);
    expect(quizLifecycle(65, 327).seen).toBe(325);
    expect(quizLifecycle(66, 327).retired).toBe(true);
  });

  it('NEVER retires a device that has no bank yet', () => {
    // The worst possible false positive. `bankSize` is 0 on a phone that has
    // never been online, and retiring there would hide the feature from the one
    // user who has not answered a single question. Any progress count.
    for (const idx of [0, 1, 66, 10000]) {
      expect(`${idx}:${quizLifecycle(idx, 0).retired}`).toBe(`${idx}:false`);
      expect(`${idx}:${quizLifecycle(idx, null).retired}`).toBe(`${idx}:false`);
      expect(`${idx}:${quizLifecycle(idx, undefined).retired}`).toBe(`${idx}:false`);
    }
  });

  it('comes back on its own when the bank grows', () => {
    // The whole reason retirement is derived rather than latched: shipping more
    // questions must un-retire every existing user with no migration.
    const done = quizLifecycle(66, 327);
    expect(done.retired).toBe(true);
    const grown = quizLifecycle(66, 600);
    expect(grown.retired).toBe(false);
    expect(grown.seen).toBe(330);
  });

  it('never reports more seen than the bank holds', () => {
    // seen feeds a "N of M" coverage line. Unclamped it reads "500 of 327".
    expect(quizLifecycle(200, 327).seen).toBe(327);
  });

  it('survives nonsense', () => {
    expect(quizLifecycle(NaN, 327).seen).toBe(0);
    expect(quizLifecycle(-9, 327).seen).toBe(0);
    expect(quizLifecycle(10, NaN).retired).toBe(false);
    expect(quizLifecycle(10, -50).retired).toBe(false);
  });
});

describe('reachableSets', () => {
  it('counts the straddling last set, unlike setsPerCycle', () => {
    // 327 / 5 = 65.4. She plays 66 sets: the 66th crosses the cycle boundary
    // and is still a full 5 questions. setsPerCycle floors the same number for
    // display ("sets before it repeats") — different question, different answer.
    expect(reachableSets(327)).toBe(66);
    expect(reachableSets(325)).toBe(65);
    expect(reachableSets(0)).toBe(0);
    expect(reachableSets(-4)).toBe(0);
  });
});

describe('the content budget', () => {
  // The bank is NOT bundled (it streams from the CDN in seven languages), so
  // this is the declared size rather than a count. See QUIZ_BANK_SIZE.
  const BANK = QUIZ_BANK_SIZE;

  it('reports what the shipping bank actually reaches', () => {
    // NOT an aspiration — a statement of today. If this fails because the bank
    // grew, that is the good failure: update the numbers and check the gap
    // below closed.
    expect(BANK).toBe(327);
    expect(reachableRewards(BANK)).toEqual({ sets: 66, paintings: 16, cards: 22 });
  });

  it('names the bank size that leaves nothing stranded', () => {
    // 24 paintings x 4 sets = 96 sets; 40 cards x 3 sets = 120 sets. The cards
    // are the binding constraint, so 120 sets x 5 = 600 questions.
    const need = bankSizeToCollectEverything(QUIZ_ART_COUNT, MYSTERY_CARD_COUNT);
    expect(need).toBe(600);
    const r = reachableRewards(need);
    expect(r.sets).toBe(120);
    // >= not ===: the cards bind at 120 sets, and by then she has earned enough
    // sets for 30 paintings against a pool of 24. The slack is fine — it means
    // the LAST thing she collects is a card, and the paintings finished 24 sets
    // earlier. Reversing that order would end the whole feature on a card.
    expect(r.cards).toBeGreaterThanOrEqual(MYSTERY_CARD_COUNT);
    expect(r.paintings).toBeGreaterThanOrEqual(QUIZ_ART_COUNT);
    expect(r.paintings).toBe(30);
  });

  it('records the gap the bank still has to close', () => {
    // THE ONE NUMBER TO ACT ON. Until the bank reaches 600 questions,
    // retirement strands both collections partway and no amount of UI work
    // fixes it: the paintings screen sits at 16 of 24 and My Cards at 22 of 40,
    // permanently, with the only entry point gone.
    //
    // Delete this test when the gap is zero.
    const need = bankSizeToCollectEverything(QUIZ_ART_COUNT, MYSTERY_CARD_COUNT);
    expect(need - BANK).toBe(273);
    expect(Math.ceil((need - BANK) / SET_SIZE)).toBe(55);   // 55 more sets' worth
  });

  it('keeps the reward divisors honest', () => {
    // reachableRewards divides by these; if either constant moves, every number
    // in this file is wrong and none of the other tests would notice.
    expect(TILES_PER_PAINTING).toBe(4);
    expect(MYSTERY_EVERY).toBe(3);
  });
});
