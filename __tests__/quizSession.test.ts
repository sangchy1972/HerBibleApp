// The quiz session reducer — answering, the reveal lock, and the retry round
// that greys out options the user already tried.

import {
  initialSession, pickOption, advance, startRetryRound, finishSession,
  currentPosition, wrongPositions, isTried, sessionSegments, sessionSummary,
  parseSession, type QuizSessionV1,
} from '../src/state/quizSession';

const QIDS = [10, 20, 30, 40, 50];
const fresh = () => initialSession(3, QIDS, 1, 1000);

/** Answer the current question and move on. */
const answer = (s: QuizSessionV1, opt: number, ok: boolean) => advance(pickOption(s, opt, ok));

describe('initialSession', () => {
  it('starts on question 0 of round 0 with nothing answered', () => {
    const s = fresh();
    expect(s.phase).toBe('answering');
    expect(s.round).toBe(0);
    expect(s.cursor).toBe(0);
    expect(s.queue).toEqual([0, 1, 2, 3, 4]);
    expect(s.answers).toHaveLength(5);
    expect(s.answers.every(a => a.picked === null && a.correct === null && a.tried.length === 0)).toBe(true);
    expect(currentPosition(s)).toBe(0);
  });
});

describe('pickOption', () => {
  it('records a correct answer and locks for the reveal', () => {
    const s = pickOption(fresh(), 2, true);
    expect(s.phase).toBe('locked');
    expect(s.answers[0].correct).toBe(true);
    expect(s.answers[0].picked).toBe(2);
    expect(s.answers[0].tried).toEqual([]);   // only WRONG picks are remembered
  });

  it('remembers a wrong pick so the retry can grey it out', () => {
    const s = pickOption(fresh(), 1, false);
    expect(s.answers[0].correct).toBe(false);
    expect(s.answers[0].tried).toEqual([1]);
  });

  it('IGNORES a second tap while locked', () => {
    // The double-tap guard. In the reducer, not a component ref, so a second
    // tap in the same frame cannot slip past a stale closure.
    const first = pickOption(fresh(), 1, false);
    expect(pickOption(first, 3, true)).toBe(first);   // same reference
  });

  it('does nothing outside the answering phase', () => {
    const summary = { ...fresh(), phase: 'summary' as const };
    expect(pickOption(summary, 0, true)).toBe(summary);
  });
});

describe('advance', () => {
  it('does nothing unless a reveal is on screen', () => {
    const s = fresh();
    expect(advance(s)).toBe(s);
  });

  it('walks to the next question', () => {
    const s = answer(fresh(), 0, true);
    expect(s.phase).toBe('answering');
    expect(s.cursor).toBe(1);
    expect(currentPosition(s)).toBe(1);
  });

  it('ends the round at the summary', () => {
    let s = fresh();
    for (let i = 0; i < 5; i += 1) s = answer(s, 0, true);
    expect(s.phase).toBe('summary');
    expect(currentPosition(s)).toBeNull();
  });
});

describe('firstPassWrong', () => {
  it('freezes at the end of round 0 and survives retries', () => {
    let s = fresh();
    s = answer(s, 0, true);
    s = answer(s, 1, false);
    s = answer(s, 0, true);
    s = answer(s, 2, false);
    s = answer(s, 0, true);
    expect(s.firstPassWrong).toBe(2);

    // Fix both on retry — the first-pass record must NOT improve.
    s = startRetryRound(s);
    s = answer(s, 3, true);
    s = answer(s, 3, true);
    expect(s.phase).toBe('summary');
    expect(s.firstPassWrong).toBe(2);
    expect(sessionSummary(s).firstPassPerfect).toBe(false);
  });
});

describe('retry round', () => {
  const withTwoWrong = () => {
    let s = fresh();
    s = answer(s, 0, true);
    s = answer(s, 1, false);
    s = answer(s, 0, true);
    s = answer(s, 2, false);
    s = answer(s, 0, true);
    return s;
  };

  it('queues only the wrong ones, in question order', () => {
    const s = startRetryRound(withTwoWrong());
    expect(s.round).toBe(1);
    expect(s.queue).toEqual([1, 3]);
    expect(s.cursor).toBe(0);
    expect(s.phase).toBe('answering');
  });

  it('re-asks them but KEEPS what was already tried', () => {
    const s = startRetryRound(withTwoWrong());
    expect(s.answers[1].picked).toBeNull();
    expect(s.answers[1].correct).toBeNull();
    expect(s.answers[1].tried).toEqual([1]);      // preserved — this is the point
    expect(s.answers[0].correct).toBe(true);      // untouched
  });

  it('accumulates tried across two retry rounds', () => {
    let s = startRetryRound(withTwoWrong());
    s = answer(s, 2, false);                      // wrong again on position 1
    s = answer(s, 3, true);
    s = startRetryRound(s);
    expect(s.answers[1].tried).toEqual([1, 2]);
    expect(isTried(s, 1, 1)).toBe(true);
    expect(isTried(s, 1, 2)).toBe(true);
    expect(isTried(s, 1, 0)).toBe(false);
    expect(isTried(s, 0, 1)).toBe(false);         // a different question
  });

  it('handles all five wrong', () => {
    let s = fresh();
    for (let i = 0; i < 5; i += 1) s = answer(s, 0, false);
    expect(wrongPositions(s)).toEqual([0, 1, 2, 3, 4]);
    expect(startRetryRound(s).queue).toEqual([0, 1, 2, 3, 4]);
  });

  it('refuses to start when nothing is wrong', () => {
    let s = fresh();
    for (let i = 0; i < 5; i += 1) s = answer(s, 0, true);
    expect(startRetryRound(s)).toBe(s);
  });

  it('stops greying an option once the question is finally right', () => {
    let s = startRetryRound(withTwoWrong());
    s = pickOption(s, 3, true);
    expect(isTried(s, 1, 1)).toBe(false);
  });
});

describe('finishSession', () => {
  it('refuses while anything is still wrong', () => {
    let s = fresh();
    s = answer(s, 0, true);
    s = answer(s, 1, false);
    s = answer(s, 0, true);
    s = answer(s, 0, true);
    s = answer(s, 0, true);
    expect(finishSession(s)).toBe(s);
  });

  it('completes once every question is correct', () => {
    let s = fresh();
    for (let i = 0; i < 5; i += 1) s = answer(s, 0, true);
    expect(finishSession(s).phase).toBe('complete');
  });
});

describe('sessionSegments', () => {
  it('is all empty with no session', () => {
    expect(sessionSegments(null)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });

  it('is POSITIONAL — a hole stays a hole', () => {
    // Deliberately unlike packedRhythmFill: segment k IS question k here, so a
    // wrong answer at position 1 must leave position 2 empty.
    let s = fresh();
    s = answer(s, 0, true);
    s = answer(s, 1, false);
    expect(sessionSegments(s)).toEqual(['correct', 'wrong', 'empty', 'empty', 'empty']);
  });
});

describe('sessionSummary', () => {
  it('counts the current round, not the first pass', () => {
    let s = fresh();
    s = answer(s, 0, true);
    s = answer(s, 1, false);
    s = answer(s, 0, true);
    s = answer(s, 0, true);
    s = answer(s, 0, true);
    expect(sessionSummary(s)).toEqual({ correct: 4, wrong: 1, answered: 5, firstPassPerfect: false });
  });
});

describe('parseSession', () => {
  it('round-trips a live session', () => {
    const s = answer(fresh(), 1, false);
    expect(parseSession(JSON.stringify(s), 1)).toEqual(s);
  });

  it('rejects junk rather than throwing', () => {
    expect(parseSession(null, 1)).toBeNull();
    expect(parseSession('{not json', 1)).toBeNull();
    expect(parseSession('null', 1)).toBeNull();
    expect(parseSession(JSON.stringify({ v: 2 }), 1)).toBeNull();
  });

  it('discards a session from a DIFFERENT bank version', () => {
    // The stored qids may no longer mean what they meant; grading against the
    // wrong question is worse than restarting the set.
    const s = fresh();
    expect(parseSession(JSON.stringify(s), 2)).toBeNull();
  });

  it('clamps a cursor that points past the queue', () => {
    const s = { ...fresh(), cursor: 99 };
    expect(parseSession(JSON.stringify(s), 1)!.cursor).toBe(4);
  });

  it('drops non-integer entries out of tried', () => {
    const s: any = fresh();
    s.answers[0].tried = [1, 'x', null, 2];
    expect(parseSession(JSON.stringify(s), 1)!.answers[0].tried).toEqual([1, 2]);
  });
});
