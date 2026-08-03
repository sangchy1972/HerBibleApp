// One quiz set in flight — the reducer.
//
// PURE, and deliberately ZERO-IMPORT: it never touches the 68 KB question bank,
// AsyncStorage, or React. `pickOption` takes `isCorrect` as an argument rather
// than looking the answer up itself, which is what keeps that true. Same split
// as dailyRhythm.ts vs DailyRhythmBar.tsx — the logic is unit-testable in this
// repo's node-environment jest setup, the component is not.
//
// THE RETRY RULE
// ──────────────
// A set is not finished until all 5 are correct. Wrong answers come back in a
// retry round, and every option the user already tried on that question renders
// greyed out. So `tried` is an ARRAY, not a single index: a 4-option question
// can survive two retry rounds and must grey BOTH earlier misses.
//
// `answers` is always length 5 and positional — never spliced, never reordered.
// That is what lets the home card's segment bar be a straight map with no
// bookkeeping, and it is why segment 2 can be red while segment 3 is empty.

export type QuizPhase = 'answering' | 'locked' | 'summary' | 'complete';
export type SegmentState = 'empty' | 'correct' | 'wrong';

export interface QuizAnswerState {
  /** Bank id, kept for audit + bank-drift detection. */
  qid: number;
  /** Option chosen in the CURRENT round; null = not yet answered this round. */
  picked: number | null;
  correct: boolean | null;
  /** Every wrong option chosen in ANY round. Drives the greyed-out state. */
  tried: number[];
}

export interface QuizSessionV1 {
  v: 1;
  bankVersion: number;
  setIndex: number;
  /** 0 = first pass. 1+ = retry rounds over the questions still wrong. */
  round: number;
  /** Question POSITIONS (0..4) being asked this round, in order. */
  queue: number[];
  cursor: number;
  phase: QuizPhase;
  answers: QuizAnswerState[];
  /**
   * Wrong count frozen at the end of round 0. Kept even though the current
   * reward gate gives a puzzle tile for every completed set: it is the only
   * record of whether the user got it right first time, and re-deriving it
   * later is impossible once retries have overwritten `correct`.
   */
  firstPassWrong: number;
  startedAt: number;
}

export function initialSession(setIndex: number, qids: number[], bankVersion: number, now = Date.now()): QuizSessionV1 {
  return {
    v: 1,
    bankVersion,
    setIndex,
    round: 0,
    queue: qids.map((_, i) => i),
    cursor: 0,
    phase: 'answering',
    answers: qids.map(qid => ({ qid, picked: null, correct: null, tried: [] })),
    firstPassWrong: 0,
    startedAt: now,
  };
}

/** Position currently being asked, or null outside the answering phases. */
export function currentPosition(s: QuizSessionV1 | null): number | null {
  if (!s || (s.phase !== 'answering' && s.phase !== 'locked')) return null;
  const p = s.queue[s.cursor];
  return p === undefined ? null : p;
}

/**
 * Record an answer. No-op unless we are actually awaiting one — this is the
 * double-tap guard, and it lives here rather than in a component ref so that a
 * second tap landing in the same frame cannot slip past a stale closure.
 */
export function pickOption(s: QuizSessionV1, optionIndex: number, isCorrect: boolean): QuizSessionV1 {
  if (s.phase !== 'answering') return s;
  const pos = currentPosition(s);
  if (pos == null) return s;
  const prev = s.answers[pos];
  if (!prev) return s;

  const answers = s.answers.slice();
  answers[pos] = {
    ...prev,
    picked: optionIndex,
    correct: isCorrect,
    // A repeat of an already-tried option can't happen (it renders disabled),
    // but de-duping keeps the array honest if it ever does.
    tried: isCorrect || prev.tried.includes(optionIndex) ? prev.tried : [...prev.tried, optionIndex],
  };
  return { ...s, answers, phase: 'locked' };
}

/** Reveal → next question, or → summary at the end of the round. */
export function advance(s: QuizSessionV1): QuizSessionV1 {
  if (s.phase !== 'locked') return s;
  const last = s.cursor >= s.queue.length - 1;
  if (!last) return { ...s, cursor: s.cursor + 1, phase: 'answering' };
  // Freeze the first-pass score exactly once, as round 0 closes.
  const firstPassWrong = s.round === 0
    ? s.answers.filter(a => a.correct === false).length
    : s.firstPassWrong;
  return { ...s, phase: 'summary', firstPassWrong };
}

/** Positions still wrong — the retry queue, in ascending question order. */
export function wrongPositions(s: QuizSessionV1): number[] {
  return s.answers.reduce<number[]>((acc, a, i) => (a.correct === false ? [...acc, i] : acc), []);
}

/**
 * Start a retry round over the wrong ones. `picked`/`correct` reset so the
 * question is genuinely re-asked; `tried` is PRESERVED — it is the whole point.
 */
export function startRetryRound(s: QuizSessionV1): QuizSessionV1 {
  if (s.phase !== 'summary') return s;
  const queue = wrongPositions(s);
  if (queue.length === 0) return s;
  const answers = s.answers.map((a, i) => (queue.includes(i) ? { ...a, picked: null, correct: null } : a));
  return { ...s, round: s.round + 1, queue, cursor: 0, phase: 'answering', answers };
}

/** Summary → complete. Only legal once every question is correct. */
export function finishSession(s: QuizSessionV1): QuizSessionV1 {
  if (s.phase !== 'summary') return s;
  if (wrongPositions(s).length > 0) return s;
  return { ...s, phase: 'complete' };
}

/**
 * Do the questions a bank now yields for this set still match the ones the
 * session was built from?
 *
 * Called when a new bank lands under a live session — the language changed, or
 * a background refresh returned. Every language ships the same ids in the same
 * positions, so the normal answer is `true` and the session survives with its
 * questions simply re-rendered in the new language. A `false` means the stored
 * answers would be graded against questions the user never saw.
 *
 * `null` session aligns with anything: there is nothing to invalidate.
 */
export function sessionAlignsWith(s: QuizSessionV1 | null, qids: readonly number[]): boolean {
  if (!s) return true;
  if (qids.length !== s.answers.length) return false;
  return qids.every((id, i) => id === s.answers[i]?.qid);
}

/** Has this option already been tried and been wrong? */
export function isTried(s: QuizSessionV1 | null, position: number, optionIndex: number): boolean {
  if (!s) return false;
  const a = s.answers[position];
  return !!a && a.tried.includes(optionIndex) && a.correct !== true;
}

/**
 * The 5 segments, POSITIONAL.
 *
 * Deliberately NOT packed left, unlike packedRhythmFill in state/dailyRhythm.ts.
 * That bar's steps are order-agnostic so packing reads as progress; here
 * segment k IS question k, and a wrong answer at position 2 must show red at
 * position 2 with position 3 still empty. Don't "fix" this to match.
 */
export function sessionSegments(s: QuizSessionV1 | null, size = 5): SegmentState[] {
  const out: SegmentState[] = Array(size).fill('empty');
  if (!s) return out;
  for (let i = 0; i < Math.min(size, s.answers.length); i += 1) {
    const a = s.answers[i];
    if (a.correct === true) out[i] = 'correct';
    else if (a.correct === false) out[i] = 'wrong';
  }
  return out;
}

export interface QuizSummary {
  correct: number;
  wrong: number;
  answered: number;
  firstPassPerfect: boolean;
}

export function sessionSummary(s: QuizSessionV1): QuizSummary {
  const correct = s.answers.filter(a => a.correct === true).length;
  const wrong = s.answers.filter(a => a.correct === false).length;
  return { correct, wrong, answered: correct + wrong, firstPassPerfect: s.firstPassWrong === 0 };
}

/**
 * Parse a persisted session. Returns null for anything we can't trust — a
 * corrupt session is disposable (the user redoes one set), so this never throws
 * and never tries to repair.
 *
 * A bankVersion mismatch is fatal to the session specifically: the stored qids
 * may no longer mean what they meant, and grading against the wrong question is
 * worse than restarting the set.
 */
export function parseSession(raw: string | null, bankVersion: number): QuizSessionV1 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || p.v !== 1) return null;
    if (p.bankVersion !== bankVersion) return null;
    if (!Array.isArray(p.answers) || p.answers.length === 0) return null;
    if (!Array.isArray(p.queue) || p.queue.length === 0) return null;
    const phase: QuizPhase = ['answering', 'locked', 'summary', 'complete'].includes(p.phase) ? p.phase : 'answering';
    const answers: QuizAnswerState[] = p.answers.map((a: any) => ({
      qid: Number.isInteger(a?.qid) ? a.qid : -1,
      picked: Number.isInteger(a?.picked) ? a.picked : null,
      correct: typeof a?.correct === 'boolean' ? a.correct : null,
      tried: Array.isArray(a?.tried) ? a.tried.filter((t: unknown) => Number.isInteger(t)) : [],
    }));
    const queue: number[] = p.queue.filter((q: unknown) => Number.isInteger(q));
    // A queue entry outside `answers` makes currentPosition return an index
    // that resolves to no question, and the screen renders a blank body with no
    // way forward — the one genuinely unrecoverable state. Discarding the
    // session costs her one set; keeping it costs her the feature.
    if (queue.length === 0 || queue.some(q => q < 0 || q >= answers.length)) return null;
    const cursor = Number.isInteger(p.cursor) ? Math.max(0, Math.min(p.cursor, queue.length - 1)) : 0;
    return {
      v: 1,
      bankVersion,
      setIndex: Number.isInteger(p.setIndex) && p.setIndex >= 0 ? p.setIndex : 0,
      round: Number.isInteger(p.round) && p.round >= 0 ? p.round : 0,
      queue,
      cursor,
      phase,
      answers,
      firstPassWrong: Number.isInteger(p.firstPassWrong) ? p.firstPassWrong : 0,
      startedAt: Number.isFinite(p.startedAt) ? p.startedAt : Date.now(),
    };
  } catch {
    return null;
  }
}
