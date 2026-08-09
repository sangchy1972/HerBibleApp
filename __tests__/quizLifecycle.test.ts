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
import { TILES_PER_PAINTING, MYSTERY_EVERY, totalTiles } from '../src/state/quizProgress';
import { drawEarnedAt } from '../src/state/cardDraw';
import { QUIZ_ART_COUNT, LAST_ART_TILES } from '../src/constants/quizArt';
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
    // exactness assertions below.
    expect(BANK).toBe(650);
    expect(reachableRewards(BANK, QUIZ_ART_COUNT, LAST_ART_TILES))
      .toEqual({ sets: 130, paintings: 33, cards: 43 });
  });

  it('spends every set: the paintings land exactly on the last one', () => {
    // THE POINT OF THE DIPTYCH. 130 sets do not divide by 4, so 32 four-tile
    // boards absorb 128 and the last two sets of the entire game would unlock
    // nothing at all. Making the 33rd painting two halves closes it to the set:
    //   32 x 4 + 2 = 130.
    // If this ever fails, one of three things moved — the bank, the art count,
    // or LAST_ART_TILES — and the other two have to move with it.
    expect(totalTiles(QUIZ_ART_COUNT, LAST_ART_TILES)).toBe(reachableSets(BANK));
    expect(QUIZ_ART_COUNT).toBe(33);
    expect(LAST_ART_TILES).toBe(2);
  });

  it('spends every set: the cards land exactly on the last one too', () => {
    // Same remainder problem, same fix at the other end. 130 / 3 = 43.33, so
    // the FINAL cycle costs 4 sets instead of 3 and the 43rd draw lands on set
    // 130 — the same set that finishes the diptych and retires the quiz.
    const sets = reachableSets(BANK);
    const draws: number[] = [];
    for (let n = 1; n <= sets; n += 1) if (drawEarnedAt(n, MYSTERY_EVERY, sets)) draws.push(n);

    expect(draws).toHaveLength(MYSTERY_CARD_COUNT);       // 43 draws, 43 cards
    expect(draws[draws.length - 1]).toBe(sets);           // the last one is the last set
    expect(draws[draws.length - 2]).toBe(sets - 4);       // ...and it cost 4, not 3
    expect(draws.slice(0, -1)).toEqual(
      Array.from({ length: MYSTERY_CARD_COUNT - 1 }, (_, i) => (i + 1) * MYSTERY_EVERY),
    );
  });

  it('collects everything, and only just', () => {
    // The bank is now EXACTLY the size both collections need — no slack either
    // way. That is deliberate but it is also brittle by construction, so it is
    // pinned: adding a painting or a card without growing the bank strands it,
    // and this is the test that says so before a release does.
    const need = bankSizeToCollectEverything(QUIZ_ART_COUNT, MYSTERY_CARD_COUNT, LAST_ART_TILES);
    expect(need).toBe(BANK);

    const r = reachableRewards(BANK, QUIZ_ART_COUNT, LAST_ART_TILES);
    expect(r.paintings).toBe(QUIZ_ART_COUNT);             // 33 of 33
    expect(r.cards).toBe(MYSTERY_CARD_COUNT);             // 43 of 43
  });

  it('the last painting and the last card arrive together, on the final set', () => {
    // The finale. Set 130 completes the diptych, hands her the 43rd card and
    // retires the quiz in one move — worth pinning because three independent
    // rules have to agree for it, and nothing else would notice if one drifted.
    const sets = reachableSets(BANK);
    expect(totalTiles(QUIZ_ART_COUNT, LAST_ART_TILES)).toBe(sets);
    expect(drawEarnedAt(sets, MYSTERY_EVERY, sets)).toBe(true);
    expect(quizLifecycle(sets, BANK).retired).toBe(true);
    // ...and the set before it does NOT also pay out a card.
    expect(drawEarnedAt(sets - 1, MYSTERY_EVERY, sets)).toBe(false);
  });

  it('keeps the reward divisors honest', () => {
    // reachableRewards divides by these; if either constant moves, every number
    // in this file is wrong and none of the other tests would notice.
    expect(TILES_PER_PAINTING).toBe(4);
    expect(MYSTERY_EVERY).toBe(3);
  });
});
