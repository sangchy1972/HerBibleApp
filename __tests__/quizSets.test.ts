// Quiz set composition — the contract that decides which 5 questions a user
// sees, and the one place a silent change would re-serve answered questions
// while pushing unseen ones out of reach.

import {
  SET_SIZE, mulberry32, cyclePermutation, streamPosition, setPositions,
  questionsForSet, setsPerCycle, __clearPermCacheForTest,
} from '../src/services/quizSets';
import { QUIZ_BANK_VERSION, quizBankUrl, QUIZ_LANGS } from '../src/constants/bibleQuiz';
import type { QuizQuestion } from '../src/constants/bibleQuiz';

// The real bank now lives on the CDN, so set composition is tested against a
// synthetic bank of the SAME SIZE — the algorithm only ever sees a length.
const N = 327;
const fakeBank: QuizQuestion[] = Array.from({ length: N }, (_, i) => ({
  id: i + 1, question: `q${i}`, options: ['a', 'b', 'c', 'd'], answerIndex: i % 4,
}));

beforeEach(() => __clearPermCacheForTest());

describe('bank constants', () => {
  it('pins the bank version so a question-set edit forces a conscious bump', () => {
    // v2 = the two language-dependent questions were removed. Anything that
    // changes the SET of questions must bump this, or an in-flight session
    // grades answers against questions the user never saw.
    expect(QUIZ_BANK_VERSION).toBe(2);
  });

  it('builds a CDN url per language', () => {
    expect(quizBankUrl('es')).toBe('https://covers.everlandapps.com/v1/quiz/quiz-es.json');
    expect(quizBankUrl('zh-Hant')).toBe('https://covers.everlandapps.com/v1/quiz/quiz-zh-Hant.json');
  });

  it('falls back to English for an unpublished language', () => {
    expect(quizBankUrl('ja')).toBe('https://covers.everlandapps.com/v1/quiz/quiz-en.json');
    expect(quizBankUrl('')).toBe('https://covers.everlandapps.com/v1/quiz/quiz-en.json');
  });

  it('publishes all 7 app languages', () => {
    expect([...QUIZ_LANGS].sort()).toEqual(['de', 'en', 'es', 'fr', 'pt', 'zh-Hans', 'zh-Hant']);
  });
});

describe('mulberry32', () => {
  it('is deterministic and stays in [0,1)', () => {
    const a = mulberry32(123); const b = mulberry32(123);
    for (let i = 0; i < 50; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('cyclePermutation', () => {
  it('is a true permutation of [0..n)', () => {
    const p = cyclePermutation(N, 0);
    expect(p.length).toBe(N);
    expect(new Set(p).size).toBe(N);
    expect(Math.min(...p)).toBe(0);
    expect(Math.max(...p)).toBe(N - 1);
  });

  it('gives a DIFFERENT order per cycle', () => {
    // Without this the second pass through the bank would replay the first in
    // the same order, which is the whole reason cycles exist.
    expect(cyclePermutation(N, 0)).not.toEqual(cyclePermutation(N, 1));
    expect(cyclePermutation(N, 1)).not.toEqual(cyclePermutation(N, 2));
  });

  it('is stable across calls', () => {
    expect(cyclePermutation(N, 3)).toEqual(cyclePermutation(N, 3));
  });
});

describe('setPositions', () => {
  // GOLDEN SNAPSHOT. If these change, QUIZ_SEED or the mixer moved, and every
  // existing user's queue silently reshuffled. There is no migration for that.
  it('matches the frozen golden values', () => {
    expect(setPositions(0, N)).toEqual([1, 209, 22, 82, 61]);
    expect(setPositions(1, N)).toEqual([312, 56, 99, 125, 48]);
  });

  it('always returns exactly 5, for any index', () => {
    for (const k of [0, 1, 7, 64, 65, 66, 200, 5000]) {
      expect(setPositions(k, N).length).toBe(SET_SIZE);
    }
  });

  it('never repeats a question inside one cycle', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 65; k += 1) setPositions(k, N).forEach(x => seen.add(x));
    expect(seen.size).toBe(325);   // 65 sets x 5, all distinct
  });

  it('covers the whole bank by the end of the cycle', () => {
    const all = new Set<number>();
    for (let k = 0; k < 66; k += 1) setPositions(k, N).forEach(x => all.add(x));
    expect(all.size).toBe(N);      // 330 draws, 327 distinct = the cycle seam
  });

  it('keeps every position inside the bank', () => {
    for (const k of [0, 65, 66, 131, 1000]) {
      for (const p of setPositions(k, N)) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(N);
      }
    }
  });

  it('clamps a negative or non-finite index to set 0 instead of throwing', () => {
    expect(setPositions(-5, N)).toEqual(setPositions(0, N));
    expect(setPositions(NaN, N)).toEqual(setPositions(0, N));
  });

  it('is unaffected by the permutation cache', () => {
    const warm = setPositions(70, N);
    __clearPermCacheForTest();
    expect(setPositions(70, N)).toEqual(warm);
  });
});

describe('questionsForSet', () => {
  it('resolves 5 real questions', () => {
    const qs = questionsForSet(0, fakeBank);
    expect(qs.length).toBe(SET_SIZE);
    for (const q of qs) {
      expect(typeof q.question).toBe('string');
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns nothing rather than a short set when the bank is too small', () => {
    expect(questionsForSet(0, fakeBank.slice(0, 3))).toEqual([]);
  });

  it('reports the cycle length', () => {
    expect(setsPerCycle(N)).toBe(65);
  });
});

describe('streamPosition', () => {
  it('survives an empty bank instead of dividing by zero', () => {
    expect(streamPosition(4, 0)).toBe(0);
  });
});
