// End-to-end smoke test for the quiz → reward loop.
//
// The unit tests each cover one module. This one plays the whole thing the way
// a user does — answer, retry, commit, earn, draw, like, repeat — against the
// real pure modules and the real card pool, because the bugs that survive unit
// tests are the ones that live between modules.
//
// It is NOT a render test (this repo's jest is node-env with react-native
// stubbed). It exercises every piece of logic the screens call, in the order
// the screens call it.

import {
  initialSession, pickOption, advance, startRetryRound, finishSession,
  currentPosition, sessionSummary,
} from '../src/state/quizSession';
import {
  INITIAL_PROGRESS, applyCompletion, MYSTERY_EVERY, levelFor, puzzleView,
} from '../src/state/quizProgress';
import {
  INITIAL_CARD_PROGRESS, INITIAL_CARD_LIKES, spreadFor, collectCard, grantDraw,
  drawEarnedAt, toggleLike, isLiked, type CardProgressV1, type CardLikesV1,
} from '../src/state/cardDraw';
import { INITIAL_HISTORY, recordSet, summarize } from '../src/state/quizHistory';
import { questionsForSet, SET_SIZE } from '../src/services/quizSets';
import { MYSTERY_CARDS, MYSTERY_CARD_COUNT } from '../src/constants/mysteryCards';
import { QUIZ_ART_COUNT } from '../src/constants/quizArt';
import type { QuizQuestion } from '../src/constants/bibleQuiz';

const CARD_IDS = MYSTERY_CARDS.map(c => c.id);

/** Stand-in bank the same size as the real one; set composition only sees a length. */
const BANK: QuizQuestion[] = Array.from({ length: 327 }, (_, i) => ({
  id: i + 1,
  question: `q${i}`,
  options: ['a', 'b', 'c', 'd'],
  answerIndex: i % 4,
}));

interface World {
  progress: typeof INITIAL_PROGRESS;
  cards: CardProgressV1;
  likes: CardLikesV1;
  history: typeof INITIAL_HISTORY;
}

const fresh = (): World => ({
  progress: INITIAL_PROGRESS,
  cards: INITIAL_CARD_PROGRESS,
  likes: INITIAL_CARD_LIKES,
  history: INITIAL_HISTORY,
});

/**
 * Play one full set exactly as QuizChallengeScreen does.
 * `wrongAt` = positions to deliberately miss on the first pass.
 */
function playSet(w: World, ymd: string, wrongAt: number[] = []): World {
  const qs = questionsForSet(w.progress.setIndex, BANK);
  let s = initialSession(w.progress.setIndex, qs.map(q => q.id), 2);

  // Round 0.
  for (let i = 0; i < SET_SIZE; i += 1) {
    const pos = currentPosition(s)!;
    const q = qs[pos];
    const correct = !wrongAt.includes(pos);
    s = pickOption(s, correct ? q.answerIndex : (q.answerIndex + 1) % q.options.length, correct);
    s = advance(s);
  }
  expect(s.phase).toBe('summary');

  // Retry rounds until nothing is wrong — a set cannot commit otherwise.
  let guard = 0;
  while (sessionSummary(s).wrong > 0 && guard < 10) {
    s = startRetryRound(s);
    while (s.phase !== 'summary') {
      const pos = currentPosition(s)!;
      s = pickOption(s, qs[pos].answerIndex, true);
      s = advance(s);
    }
    guard += 1;
  }

  const done = finishSession(s);
  expect(done.phase).toBe('complete');

  const progress = applyCompletion(w.progress, {
    firstPassWrong: done.firstPassWrong,
    totalQuestions: done.answers.length,
  }, ymd);

  return {
    progress,
    cards: drawEarnedAt(progress.completedSets, MYSTERY_EVERY) ? grantDraw(w.cards) : w.cards,
    likes: w.likes,
    history: recordSet(w.history, ymd, {
      questions: done.answers.length,
      firstPassWrong: done.firstPassWrong,
    }),
  };
}

/** Take the draw the way the overlay does: first candidate on the table. */
function draw(w: World): World {
  const { candidates } = spreadFor(w.cards, CARD_IDS);
  expect(candidates.length).toBeGreaterThan(0);
  return { ...w, cards: collectCard(w.cards, CARD_IDS[candidates[0]]) };
}

const day = (n: number) => new Date(Date.UTC(2026, 7, 1) + n * 86400000).toISOString().slice(0, 10);

describe('the loop', () => {
  it('earns a card on the third set and not before', () => {
    let w = fresh();
    w = playSet(w, day(0));
    expect(w.cards.pendingDraw).toBe(false);
    w = playSet(w, day(1));
    expect(w.cards.pendingDraw).toBe(false);
    w = playSet(w, day(2));
    expect(w.cards.pendingDraw).toBe(true);
  });

  it('taking the card spends the draw and nothing else grants another', () => {
    let w = fresh();
    for (let i = 0; i < 3; i += 1) w = playSet(w, day(i));
    w = draw(w);
    expect(w.cards.pendingDraw).toBe(false);
    expect(w.cards.collected).toHaveLength(1);

    // Two more sets: still nothing owed until the sixth.
    w = playSet(w, day(3));
    w = playSet(w, day(4));
    expect(w.cards.pendingDraw).toBe(false);
    w = playSet(w, day(5));
    expect(w.cards.pendingDraw).toBe(true);
  });

  it('an unclaimed draw survives and is not doubled by the next earn', () => {
    // She backgrounds the app on the reward screen, plays three more sets
    // later, and must still owe exactly ONE card — grantDraw is idempotent.
    let w = fresh();
    for (let i = 0; i < 6; i += 1) w = playSet(w, day(i));
    expect(w.cards.pendingDraw).toBe(true);
    w = draw(w);
    expect(w.cards.collected).toHaveLength(1);
    expect(w.cards.drawsTaken).toBe(1);
  });

  it('records history, level, puzzle tiles and accuracy consistently', () => {
    let w = fresh();
    // 4 sets: two clean, two with a first-pass miss.
    w = playSet(w, day(0));
    w = playSet(w, day(0), [2]);          // same day — must accumulate
    w = playSet(w, day(1));
    w = playSet(w, day(2), [0, 3]);

    expect(w.progress.completedSets).toBe(4);
    expect(w.progress.perfectSets).toBe(2);
    expect(levelFor(w.progress.completedSets)).toBe(5);

    // 4 sets x 5 = 20 asked, 3 missed first time.
    expect(w.progress.totalCorrect).toBe(17);

    // Day 0 holds two sets.
    expect(w.history.days).toHaveLength(3);
    expect(w.history.days[0]).toEqual({ ymd: day(0), sets: 2, questions: 10, firstPassWrong: 1 });

    const s = summarize(w.history, day(2));
    expect(s.streak).toBe(3);
    expect(s.activeDays).toBe(3);
    expect(s.accuracy).toBeCloseTo(17 / 20);

    // Four sets completes the first painting.
    const pv = puzzleView(w.progress.completedSets, QUIZ_ART_COUNT);
    expect(pv.completedPaintings).toBe(1);
  });

  it('never re-serves a question inside a cycle across many sets', () => {
    // The set stream and the ladder have to stay in step: setIndex advances by
    // exactly one per commit, and setPositions is keyed on it.
    let w = fresh();
    const seen = new Set<number>();
    for (let i = 0; i < 30; i += 1) {
      for (const q of questionsForSet(w.progress.setIndex, BANK)) {
        expect(seen.has(q.id)).toBe(false);
        seen.add(q.id);
      }
      w = playSet(w, day(i));
    }
    expect(seen.size).toBe(30 * SET_SIZE);
  });

  it('walks the whole card pool in exactly 40 draws, 120 sets', () => {
    let w = fresh();
    let sets = 0;
    while (w.cards.collected.length < MYSTERY_CARD_COUNT && sets < 400) {
      w = playSet(w, day(sets % 180));
      sets += 1;
      if (w.cards.pendingDraw) w = draw(w);
    }
    expect(w.cards.collected).toHaveLength(MYSTERY_CARD_COUNT);
    expect(w.cards.drawsTaken).toBe(MYSTERY_CARD_COUNT);
    expect(sets).toBe(MYSTERY_CARD_COUNT * MYSTERY_EVERY);
  });

  it('keeps drawing after the pool is exhausted instead of dead-ending', () => {
    let w = fresh();
    for (let i = 0; i < MYSTERY_CARD_COUNT * MYSTERY_EVERY; i += 1) {
      w = playSet(w, day(i % 180));
      if (w.cards.pendingDraw) w = draw(w);
    }
    for (let i = 0; i < 3; i += 1) w = playSet(w, day(i));
    expect(w.cards.pendingDraw).toBe(true);
    const before = w.cards.collected.length;
    w = draw(w);
    expect(w.cards.collected).toHaveLength(before);   // repeat, not a new entry
    expect(w.cards.drawsTaken).toBe(MYSTERY_CARD_COUNT + 1);
  });
});

describe('likes', () => {
  it('survive across draws and can be undone', () => {
    let w = fresh();
    for (let i = 0; i < 6; i += 1) w = playSet(w, day(i));
    w = draw(w);
    const id = w.cards.collected[0];

    w = { ...w, likes: toggleLike(w.likes, id) };
    expect(isLiked(w.likes, id)).toBe(true);

    for (let i = 6; i < 9; i += 1) w = playSet(w, day(i));
    w = draw(w);
    expect(isLiked(w.likes, id)).toBe(true);          // untouched by a later draw

    w = { ...w, likes: toggleLike(w.likes, id) };
    expect(isLiked(w.likes, id)).toBe(false);
  });

  it('only ever holds ids that are in the pool', () => {
    let w = fresh();
    for (let i = 0; i < 3; i += 1) w = playSet(w, day(i));
    w = draw(w);
    w = { ...w, likes: toggleLike(w.likes, w.cards.collected[0]) };
    for (const id of w.likes.liked) expect(CARD_IDS).toContain(id);
  });
});

describe('dashboard numbers are safe on a brand-new account', () => {
  it('divides by zero nowhere', () => {
    const w = fresh();
    const answered = w.progress.completedSets * SET_SIZE;
    expect(answered).toBe(0);
    // The screen guards accuracy on answered > 0; assert the guard is needed.
    expect(Number.isNaN(w.progress.totalCorrect / answered)).toBe(true);
    expect(summarize(w.history, day(0)).accuracy).toBeNull();
    expect(levelFor(0)).toBe(1);
    expect(puzzleView(0, QUIZ_ART_COUNT).tilesUnlocked).toBe(0);
    expect(spreadFor(w.cards, CARD_IDS).candidates).toHaveLength(4);
  });
});
