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
import fs from 'fs';
import path from 'path';

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
  const BANK = QUIZ_BANK_SIZE;

  it('keeps QUIZ_BANK_SIZE honest against the file that ships', () => {
    // QUIZ_BANK_SIZE is hand-maintained, and every number below divides by it.
    // Asserting it equals its own literal would only fail when someone edited
    // it -- exactly the case where they already know. Counting the source of
    // truth means a re-cut bank fails HERE, loudly, instead of quietly
    // invalidating the whole content budget.
    const src = path.join(__dirname, '..', 'docs', 'quiz-bank', 'quiz-en.json');
    const file = JSON.parse(fs.readFileSync(src, 'utf8'));
    expect(file.questions.length).toBe(QUIZ_BANK_SIZE);
  });

  it('reports what the shipping bank actually reaches', () => {
    // NOT an aspiration — a statement of today. If this fails because the bank
    // grew, that is the good failure: update the numbers and re-check the
    // headroom assertion below.
    expect(BANK).toBe(650);
    expect(reachableRewards(BANK)).toEqual({ sets: 130, paintings: 32, cards: 43 });
  });

  it('names the bank size that leaves nothing stranded', () => {
    // 32 paintings x 4 sets = 128 sets; 40 cards x 3 sets = 120 sets. Adding
    // eight paintings flipped which collection binds: it used to be the cards
    // at 120 sets, it is now the paintings at 128, so 128 x 5 = 640 questions.
    const need = bankSizeToCollectEverything(QUIZ_ART_COUNT, MYSTERY_CARD_COUNT);
    expect(need).toBe(640);
    const r = reachableRewards(need);
    expect(r.sets).toBe(128);
    // >= not ===: the paintings now bind at 128 sets, and by then she has
    // earned enough for 42 cards against a pool of 40. The order of the last two
    // rewards therefore FLIPPED with this batch — the cards finish 8 sets early
    // and the collection ends on a painting. That is the better ending of the
    // two, and it is a consequence rather than a decision, so it is pinned here.
    expect(r.cards).toBeGreaterThanOrEqual(MYSTERY_CARD_COUNT);
    expect(r.paintings).toBeGreaterThanOrEqual(QUIZ_ART_COUNT);
    expect(r.cards).toBe(42);
  });

  it('has closed the gap, with headroom left over', () => {
    // This test used to name the shortfall: at 327 the bank stranded the
    // collections at 16 of 24 paintings and 22 of 40 cards, permanently, with
    // the entry point gone. The v3 re-cut to 650 closed it. Kept rather than
    // deleted, inverted, because the failure it now guards is the one that
    // would be silent: shrinking the bank, or adding collectibles past what
    // 650 questions can unlock, re-strands them exactly as before.
    const need = bankSizeToCollectEverything(QUIZ_ART_COUNT, MYSTERY_CARD_COUNT);
    expect(need).toBeLessThanOrEqual(BANK);
    expect(BANK - need).toBe(10);                          // 2 sets' worth of slack

    // The v2 art batch spent most of the headroom: 50 questions of slack became
    // 10, and the paintings are now full at 32 of a reachable 32. Adding a 33rd
    // painting REQUIRES growing the bank first, which is what the assertion
    // above will catch.
    const r = reachableRewards(BANK);
    expect(r.paintings - QUIZ_ART_COUNT).toBe(0);          // no room left
    expect(r.cards - MYSTERY_CARD_COUNT).toBe(3);          // 40 -> up to 43
  });

  it('keeps the reward divisors honest', () => {
    // reachableRewards divides by these; if either constant moves, every number
    // in this file is wrong and none of the other tests would notice.
    expect(TILES_PER_PAINTING).toBe(4);
    expect(MYSTERY_EVERY).toBe(3);
  });
});
