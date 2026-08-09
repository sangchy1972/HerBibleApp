// The quiz session reducer — answering, the reveal lock, and the retry round
// that greys out options the user already tried.

import {
  initialSession, pickOption, advance, startRetryRound, finishSession,
  currentPosition, wrongPositions, isTried, sessionSegments, sessionSummary,
  parseSession, sessionAlignsWith, triedFlags, type QuizSessionV1,
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

describe('sessionAlignsWith — bank swapped under a live session', () => {
  const s = initialSession(0, [11, 22, 33, 44, 55], 2);

  it('accepts the same ids in the same positions', () => {
    // The normal case: she switched language. All 7 banks ship identical ids
    // in identical order, so the session survives and the questions simply
    // re-render in the new language.
    expect(sessionAlignsWith(s, [11, 22, 33, 44, 55])).toBe(true);
  });

  it('rejects a reordering', () => {
    // Same questions, different order — grading position 0 would now check the
    // answer key of a question she was never shown.
    expect(sessionAlignsWith(s, [22, 11, 33, 44, 55])).toBe(false);
  });

  it('rejects a different length', () => {
    expect(sessionAlignsWith(s, [11, 22, 33])).toBe(false);
    expect(sessionAlignsWith(s, [11, 22, 33, 44, 55, 66])).toBe(false);
  });

  it('treats a null session as always aligned', () => {
    // Nothing in flight, nothing to invalidate.
    expect(sessionAlignsWith(null, [1, 2, 3])).toBe(true);
    expect(sessionAlignsWith(null, [])).toBe(true);
  });

  it('survives a retry round, where queue shrinks but answers do not', () => {
    // startRetryRound rewrites `queue`, never `answers` — so alignment must be
    // judged against answers, or every retry would look like bank drift and
    // throw the set away mid-recovery.
    const wrong = pickOption(s, 1, false);
    const atSummary = { ...advance({ ...wrong, cursor: 4 }), phase: 'summary' as const };
    const retry = startRetryRound(atSummary);
    expect(retry.queue.length).toBeLessThan(retry.answers.length);
    expect(sessionAlignsWith(retry, [11, 22, 33, 44, 55])).toBe(true);
  });
});

// The home card renders the FIRST question of a set that has not started yet, so
// a tap on an option has to start the set and answer it in the same update
// (QuizContext.startAndPick). This is that composition — if it ever stops
// producing a locked session with the answer recorded at position 0, a tap on
// the home card silently does nothing.
describe('start-and-answer in one step (home card)', () => {
  it('locks with the answer recorded at position 0', () => {
    const s = pickOption(initialSession(3, QIDS, 1, 1000), 2, true);
    expect(s.phase).toBe('locked');
    expect(currentPosition(s)).toBe(0);
    expect(s.answers[0]).toMatchObject({ qid: 10, picked: 2, correct: true });
    expect(sessionSegments(s)).toEqual(['correct', 'empty', 'empty', 'empty', 'empty']);
  });

  it('a second tap in the same batch is swallowed, not re-answered', () => {
    // Both taps see no session; React hands the second updater the state the
    // first produced, so the reducer's phase guard is what stops the double.
    const first = pickOption(initialSession(3, QIDS, 1, 1000), 2, true);
    expect(pickOption(first, 0, false)).toBe(first);
  });

  it('records a wrong first answer as tried, so the retry greys it out', () => {
    const s = pickOption(initialSession(3, QIDS, 1, 1000), 1, false);
    expect(isTried(s, 0, 1)).toBe(true);
    expect(sessionSegments(s)[0]).toBe('wrong');
  });
});


// ── triedFlags: the lock-out invariant ────────────────────────────────────────
//
// `tried` grows monotonically and nothing bounds it against the option count.
// If every option ends up greyed the set can never be finished and, because the
// session is persisted, it comes back identical on every relaunch — the whole
// feature bricked. These pin the guard, not the happy path.
describe('triedFlags', () => {
  it('greys exactly the options already tried, positionally', () => {
    let s = fresh();
    s = advance(pickOption(s, 2, false));          // q0: tried 2
    for (let i = 0; i < 4; i++) s = advance(pickOption(s, 0, true));
    s = startRetryRound(s);
    expect(triedFlags(s, 0, 4)).toEqual([false, false, true, false]);
    // A question she never got wrong greys nothing.
    expect(triedFlags(s, 1, 4)).toEqual([false, false, false, false]);
  });

  it('NEVER returns all-true, even when every option has been tried', () => {
    // Only reachable when the correct option is itself in `tried` — which is
    // what a bank re-cut that moves an answerIndex under a live session does.
    // Forced directly here because content currently prevents it, and content
    // is not a guarantee.
    const s = fresh();
    const rigged: QuizSessionV1 = {
      ...s,
      round: 1,
      phase: 'answering',
      queue: [0],
      answers: s.answers.map((a, i) => (i === 0 ? { ...a, tried: [0, 1, 2, 3] } : a)),
    };
    const flags = triedFlags(rigged, 0, 4);
    expect(flags).toEqual([false, false, false, false]);
    expect(flags.some(f => !f)).toBe(true);        // at least one is tappable
  });

  it('drops ALL flags rather than the last one, since we cannot tell which is bogus', () => {
    const s = fresh();
    const rigged: QuizSessionV1 = {
      ...s,
      answers: s.answers.map((a, i) => (i === 0 ? { ...a, tried: [0, 1] } : a)),
    };
    expect(triedFlags(rigged, 0, 2)).toEqual([false, false]);
  });

  it('is safe on a null session and on a zero option count', () => {
    expect(triedFlags(null, 0, 4)).toEqual([false, false, false, false]);
    expect(triedFlags(fresh(), 0, 0)).toEqual([]);
  });

  it('two-option questions still leave one tappable after a miss', () => {
    let s = fresh();
    s = advance(pickOption(s, 1, false));
    for (let i = 0; i < 4; i++) s = advance(pickOption(s, 0, true));
    s = startRetryRound(s);
    expect(triedFlags(s, 0, 2)).toEqual([false, true]);
  });
});
