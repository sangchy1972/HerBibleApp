// The seven-sets-a-day cap.
//
// It exists because the bank is 65 sets. Without a cap a motivated user empties
// it in a weekend and everything after that is a repeat wearing a level number.
// The interesting cases are all about NOT punishing her: a set in flight has to
// be finishable, and midnight has to actually reset.

import {
  DAILY_SET_LIMIT, dailyGate, canStartSet, recordSet, parseHistory,
  INITIAL_HISTORY, type QuizHistoryV1,
} from '../src/state/quizHistory';

const TODAY = '2026-08-03';
const YESTERDAY = '2026-08-02';
const set = { questions: 5, firstPassWrong: 0 };

function withSets(n: number, ymd = TODAY, from: QuizHistoryV1 = INITIAL_HISTORY) {
  let h = from;
  for (let i = 0; i < n; i += 1) h = recordSet(h, ymd, set);
  return h;
}

describe('dailyGate', () => {
  it('starts the day with the full allowance', () => {
    const g = dailyGate(INITIAL_HISTORY, TODAY);
    expect(g).toEqual({ limit: 7, done: 0, remaining: 7, reached: false });
    expect(DAILY_SET_LIMIT).toBe(7);
  });

  it('counts down as sets complete, and stops at the 7th', () => {
    for (let n = 0; n <= 7; n += 1) {
      const g = dailyGate(withSets(n), TODAY);
      expect(`${n}:${g.remaining}:${g.reached}`).toBe(`${n}:${7 - n}:${n >= 7}`);
    }
  });

  it('never reports a negative allowance', () => {
    // Reachable: the cap could be lowered in a later build, or a merge could
    // union two devices that each played their seven. A negative number would
    // render as "-3 sets left today".
    const g = dailyGate(withSets(12), TODAY);
    expect(g.done).toBe(12);
    expect(g.remaining).toBe(0);
    expect(g.reached).toBe(true);
  });

  it('resets at midnight', () => {
    // Yesterday's seven must not follow her into today. This is the whole
    // feature — if it fails she is capped forever.
    const h = withSets(7, YESTERDAY);
    expect(dailyGate(h, YESTERDAY).reached).toBe(true);
    expect(dailyGate(h, TODAY)).toEqual({ limit: 7, done: 0, remaining: 7, reached: false });
  });

  it('counts only today, even with a long history behind it', () => {
    let h = withSets(7, '2026-07-30');
    h = withSets(7, '2026-07-31', h);
    h = withSets(2, TODAY, h);
    expect(dailyGate(h, TODAY).remaining).toBe(5);
  });

  it('treats a broken date as a fresh day rather than as no cap', () => {
    // Failing open here would hand out an unlimited day to anyone whose clock
    // or locale produced something we could not parse.
    expect(dailyGate(withSets(7), 'not-a-date').done).toBe(0);
    expect(dailyGate(withSets(7), '').limit).toBe(7);
  });

  it('refuses a nonsense limit instead of disabling itself', () => {
    expect(dailyGate(INITIAL_HISTORY, TODAY, 0).limit).toBe(1);
    expect(dailyGate(INITIAL_HISTORY, TODAY, -5).limit).toBe(1);
    expect(dailyGate(INITIAL_HISTORY, TODAY, NaN).limit).toBe(1);
  });

  it('survives a round-trip through storage', () => {
    // The cap is only as good as the history it reads. If parseHistory dropped
    // today's row she would get seven more sets after every force quit.
    const h = withSets(7);
    const back = parseHistory(JSON.stringify(h));
    expect(dailyGate(back, TODAY).reached).toBe(true);
  });
});

describe('canStartSet', () => {
  it('lets her start while she has sets left', () => {
    expect(canStartSet(dailyGate(withSets(6), TODAY), false)).toBe(true);
  });

  it('blocks a NEW set once the seventh is done', () => {
    expect(canStartSet(dailyGate(withSets(7), TODAY), false)).toBe(false);
  });

  it('always lets her finish the set she is already in', () => {
    // Two ways to land here: she started her 7th and the count hit 7 while the
    // session was still open, or the clock rolled past midnight mid-set. Either
    // way the session is persisted and refusing it would strand her on a
    // half-answered screen she can neither finish nor clear.
    expect(canStartSet(dailyGate(withSets(7), TODAY), true)).toBe(true);
    expect(canStartSet(dailyGate(withSets(99), TODAY), true)).toBe(true);
  });
});
