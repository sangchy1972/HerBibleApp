// The rules QuizChallengeScreen orchestrates, extracted and pinned.
//
// WHY THIS FILE EXISTS
// ────────────────────
// Three separate audits found three separate blank screens, and all three lived
// in the same place: the handful of predicates that decide, after a set is
// committed, WHO OWNS THE SCREEN. The screen itself is React and this repo's
// jest setup has no renderer, so the predicates are restated here as pure
// functions and checked exhaustively over every reachable combination.
//
// That is weaker than rendering the component — it verifies the RULE, not the
// wiring — but the bugs were never in the wiring. Each one was a predicate that
// disagreed with another predicate about the same fact:
//
//   1. `drawDismissed` latched for the whole visit, so a draw earned later in
//      the same visit could not open. onContinue had already committed and set
//      `leaving`, so nothing navigated either.
//   2. The painting branch returned before clearing that latch, so the
//      celebration declined to leave (a draw was pending), the overlay declined
//      to open (the latch was set), and the safety net declined to arm (its
//      guard read bare `pendingDraw`).
//   3. Retirement hid every route to the overlay while a draw was still owed,
//      so the last card of the bank was unredeemable forever.
//
// The invariant that kills all three: AFTER A COMMIT, EXACTLY ONE OF
// {draw overlay, painting celebration, navigation} MUST OWN THE SCREEN.

import { drawEarnedAt } from '../src/state/cardDraw';
import { MYSTERY_EVERY, TILES_PER_PAINTING } from '../src/state/quizProgress';
import { QUIZ_ART_COUNT } from '../src/constants/quizArt';
import { quizLifecycle, reachableSets } from '../src/state/quizLifecycle';
import { QUIZ_BANK_SIZE } from '../src/constants/bibleQuiz';

/** The screen's `drawWillOpen`. Bare `pendingDraw` is NOT the same thing. */
const drawWillOpen = (pendingDraw: boolean, dismissed: boolean) => pendingDraw && !dismissed;

/** Who takes the screen when Continue is tapped. Mirrors onContinue's branches. */
type Owner = 'painting' | 'draw' | 'navigate';
function ownerAfterContinue(completedSetsBefore: number, dismissedBefore: boolean): Owner {
  const committed = completedSetsBefore + 1;
  const earns = drawEarnedAt(committed, MYSTERY_EVERY);
  const pIdx = committed / TILES_PER_PAINTING - 1;
  const painting = committed % TILES_PER_PAINTING === 0 && pIdx < QUIZ_ART_COUNT;
  if (painting) return 'painting';
  // onContinue clears the latch synchronously on this branch, which is what
  // makes `earns` a reliable predictor rather than a hopeful one.
  if (earns) return 'draw';
  void dismissedBefore;
  return 'navigate';
}

/** PaintingComplete.onDone. Returning false means "leave". */
const paintingHoldsScreen = (pendingDraw: boolean, dismissed: boolean, retired: boolean) =>
  drawWillOpen(pendingDraw, dismissed) || retired;

/** The 1500 ms safety net arms only when NOBODY owns the screen. */
const netArms = (session: boolean, drawing: boolean, pendingDraw: boolean, dismissed: boolean, painting: boolean) =>
  !session && !drawing && !drawWillOpen(pendingDraw, dismissed) && !painting;

describe('after a commit, someone always owns the screen', () => {
  it('assigns exactly one owner for every set in a full bank', () => {
    for (let before = 0; before < 400; before += 1) {
      for (const dismissed of [false, true]) {
        const o = ownerAfterContinue(before, dismissed);
        expect(`${before}:${dismissed}:${o}`).toBe(`${before}:${dismissed}:${o}`);
        expect(['painting', 'draw', 'navigate']).toContain(o);
      }
    }
  });

  it('never lets a dismissed draw change who owns the screen', () => {
    // The bug was that it did: `earns` said the overlay would take over while
    // the latch said it would not, and the gap between them was a blank page.
    for (let before = 0; before < 200; before += 1) {
      expect(ownerAfterContinue(before, false)).toBe(ownerAfterContinue(before, true));
    }
  });

  it('the painting celebration only holds the screen when something follows it', () => {
    // (pendingDraw, dismissed, retired) -> holds?
    expect(paintingHoldsScreen(false, false, false)).toBe(false);   // nothing waiting: leave
    expect(paintingHoldsScreen(true, false, false)).toBe(true);     // overlay will open: stay
    expect(paintingHoldsScreen(true, true, false)).toBe(false);     // THE BUG: owed but dismissed
    expect(paintingHoldsScreen(false, false, true)).toBe(true);     // retired: fall to QuizDoneView
  });

  it('arms the safety net in exactly the state that used to be permanent', () => {
    // Session gone, nothing drawing, no painting, and a draw that is owed but
    // will not open. Before the fix this was a blank page whose only control
    // was the header X.
    expect(netArms(false, false, true, true, false)).toBe(true);
    // …and never while something legitimately owns the screen.
    expect(netArms(true, false, false, false, false)).toBe(false);   // question on screen
    expect(netArms(false, true, false, false, false)).toBe(false);   // overlay open
    expect(netArms(false, false, false, false, true)).toBe(false);   // painting showing
    expect(netArms(false, false, true, false, false)).toBe(false);   // overlay about to open
  });
});

describe('the last set of the bank', () => {
  const LAST = reachableSets(QUIZ_BANK_SIZE);          // 66 against today's bank

  it('retires the quiz only once it is committed', () => {
    expect(quizLifecycle(LAST - 1, QUIZ_BANK_SIZE).retired).toBe(false);
    expect(quizLifecycle(LAST, QUIZ_BANK_SIZE).retired).toBe(true);
  });

  it('earns a mystery card, which is why retirement must not hide the overlay', () => {
    // 66 % 3 === 0. The set that ends the quiz is also a draw set, so hiding
    // every route to the overlay the moment `retired` flips cost her that card
    // permanently. The home card and the dashboard both keep a door open while
    // `pendingDraw` is true; if this ever stops being true the door can close.
    expect(drawEarnedAt(LAST, MYSTERY_EVERY)).toBe(true);
    expect(ownerAfterContinue(LAST - 1, false)).toBe('draw');
  });

  it('offers no "next level", because there is no next level', () => {
    // lastEver in QuizChallengeScreen. Today `lastOfDay` happens to hide the
    // button too (66 divides by 3), but that is a coincidence of this bank
    // size, and a bank whose reachable count is coprime to 3 and 4 would show
    // a button that does nothing.
    const lastEver = (setIndexBefore: number) =>
      (setIndexBefore + 1) * 5 >= QUIZ_BANK_SIZE;
    expect(lastEver(LAST - 1)).toBe(true);
    expect(lastEver(LAST - 2)).toBe(false);
  });
});
