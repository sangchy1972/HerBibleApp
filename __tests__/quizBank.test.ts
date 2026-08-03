// The CDN payload validator.
//
// This is the boundary between a hand-edited file on a bucket and the app's
// notion of what "correct" means. It is deliberately ALL-OR-NOTHING: set
// composition indexes questions by POSITION, so silently dropping one bad
// question would shift every set boundary and hand different users a different
// quiz. A quiz that marks a right answer wrong is worse than no quiz at all,
// and "no quiz" has a defined behaviour (the home card hides itself).

import { parseBankFile } from '../src/services/quizBank';
import { QUIZ_BANK_VERSION } from '../src/constants/bibleQuiz';
import { SET_SIZE } from '../src/services/quizSets';

const q = (over: Record<string, unknown> = {}) => ({
  id: 1, question: 'Who?', options: ['a', 'b', 'c', 'd'], answerIndex: 2, ...over,
});
const file = (questions: unknown[], over: Record<string, unknown> = {}) => ({
  v: 1, lang: 'en', bankVersion: QUIZ_BANK_VERSION, count: questions.length, questions, ...over,
});
/** A bank with one question of interest and enough filler to clear SET_SIZE.
 *  The interesting item stays at index 0 so assertions read the same as before. */
const bank = (...qs: unknown[]) => [
  ...qs,
  ...Array.from({ length: Math.max(0, SET_SIZE - qs.length) }, (_, i) => q({ id: 900 + i })),
];

describe('parseBankFile — happy path', () => {
  it('accepts a well-formed bank', () => {
    const out = parseBankFile(file(bank(q(), q({ id: 2 }))), 'en');
    expect(out).toHaveLength(SET_SIZE);
    expect(out![0].answerIndex).toBe(2);
  });

  it('accepts 2-option True/False items', () => {
    // 60 of the 327 are True/False; rejecting them would silently halve sets.
    const out = parseBankFile(file(bank(q({ options: ['True', 'False'], answerIndex: 1 }))), 'en');
    expect(out).toHaveLength(SET_SIZE);
    expect(out![0].options).toEqual(['True', 'False']);
  });

  it('trims whitespace', () => {
    const out = parseBankFile(file(bank(q({ question: '  Who?  ', options: [' a ', 'b', 'c', 'd'] }))), 'en');
    expect(out![0].question).toBe('Who?');
    expect(out![0].options[0]).toBe('a');
  });

  it('tolerates a payload with no lang/bankVersion fields', () => {
    expect(parseBankFile({ questions: bank(q()) }, 'en')).toHaveLength(SET_SIZE);
  });

  it('rejects a bank too small to fill one set', () => {
    // 1-4 questions passes every other check and then makes QuizContext.open()
    // refuse silently -- questionsForSet cannot fill a set -- leaving a blank
    // quiz screen with no way forward. "No quiz yet" is the honest failure.
    for (let n = 1; n < SET_SIZE; n += 1) {
      const qs = Array.from({ length: n }, (_, i) => q({ id: i + 1 }));
      expect(`${n}:${parseBankFile(file(qs), 'en')}`).toBe(`${n}:null`);
    }
    expect(parseBankFile(file(bank()), 'en')).toHaveLength(SET_SIZE);
  });
});

describe('parseBankFile — rejects the whole file', () => {
  const rejects = (raw: unknown, why: string) => {
    it(why, () => expect(parseBankFile(raw, 'en')).toBeNull());
  };

  rejects(null, 'null');
  rejects('nope', 'a string');
  rejects({}, 'no questions array');
  rejects(file([]), 'an empty bank');
  rejects(file([q(), q({ id: 1 })]), 'a duplicate id');
  rejects(file([q(), q({ id: 2, answerIndex: 9 })]), 'an answerIndex past the end');
  rejects(file([q({ answerIndex: -1 })]), 'a negative answerIndex');
  rejects(file([q({ answerIndex: 1.5 })]), 'a non-integer answerIndex');
  rejects(file([q({ options: ['only'] })]), 'fewer than 2 options');
  rejects(file([q({ options: ['a', '   '] })]), 'a blank option');
  rejects(file([q({ options: ['a', 3] })]), 'a non-string option');
  rejects(file([q({ question: '' })]), 'an empty question');
  rejects(file([q({ id: 'x' })]), 'a non-integer id');
  rejects(file([q(), null]), 'a null entry');
  rejects(file([q()], { bankVersion: 99 }), 'a different bank version');
  rejects(file([q()], { lang: 'de' }), 'the wrong language');

  it('rejects an absurdly large payload rather than trying to hold it', () => {
    const huge = Array.from({ length: 5001 }, (_, i) => q({ id: i }));
    expect(parseBankFile(file(huge), 'en')).toBeNull();
  });

  it('does NOT return a partial bank when one question is bad', () => {
    // The property that matters: 3 good + 1 bad must yield null, not 3.
    const out = parseBankFile(file([q({ id: 1 }), q({ id: 2 }), q({ id: 3, answerIndex: 88 }), q({ id: 4 })]), 'en');
    expect(out).toBeNull();
  });
});
