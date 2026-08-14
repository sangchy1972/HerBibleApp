// Daily quiz history — the only thing that makes any chart possible.
//
// PURE. No React, no AsyncStorage, no dates beyond the YYYY-MM-DD strings it is
// handed, so the caller owns "what day is it" and this stays testable.
//
// WHY IT EXISTS
// =============
// Nothing recorded WHEN she answered. `quizProgress` keeps `lastCompletedYmd`,
// one string — enough to say "she played" and nothing else. No streak, no week,
// no trend, ever, without a second store.
//
// WHY PER-DAY COUNTERS RATHER THAN A BARE DATE ARRAY
// ==================================================
// `readChapters:dates:v1` and `activity:dates` are plain string arrays, and
// copying that shape here would have been the path of least resistance. It is
// the difference between "she was active on the 3rd" and "she did 3 sets and
// missed 2 questions on the 3rd" — and the second cannot be re-derived later,
// because the session is discarded the moment a set commits.
//
// ⚠️ NO HISTORY, AND IT CANNOT BE BACKFILLED. Every existing install starts
// empty. Anything drawn from this must be gated on having enough days, or the
// first thing a long-time user sees is a blank axis.

/** Days retained. A bounded array is a fixed memory and merge cost, and nothing
 *  in this app looks back further than six months. */
export const HISTORY_DAYS = 180;

export interface QuizDay {
  /** YYYY-MM-DD, local time — same convention as lastCompletedYmd. */
  ymd: string;
  /** Sets completed that day. */
  sets: number;
  /** Questions answered that day (sets x SET_SIZE). */
  questions: number;
  /** Questions wrong on the FIRST pass. Retries are not counted again. */
  firstPassWrong: number;
}

export interface QuizHistoryV1 {
  v: 1;
  /** Ascending by ymd. Capped at HISTORY_DAYS. */
  days: QuizDay[];
}

export const INITIAL_HISTORY: QuizHistoryV1 = { v: 1, days: [] };

const int = (x: unknown) => (Number.isFinite(x) && (x as number) >= 0 ? Math.floor(x as number) : 0);
const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Record one completed set. Same-day sets accumulate into one entry. */
export function recordSet(
  h: QuizHistoryV1,
  ymd: string,
  outcome: { questions: number; firstPassWrong: number },
): QuizHistoryV1 {
  if (!isYmd(ymd)) return h;
  const q = int(outcome.questions);
  const w = Math.min(q, int(outcome.firstPassWrong));

  const days = h.days.slice();
  const i = days.findIndex(d => d.ymd === ymd);
  if (i >= 0) {
    days[i] = {
      ymd,
      sets: days[i].sets + 1,
      questions: days[i].questions + q,
      firstPassWrong: days[i].firstPassWrong + w,
    };
  } else {
    days.push({ ymd, sets: 1, questions: q, firstPassWrong: w });
    // Only sort on insert of a NEW day. Appending is the normal case and
    // already ordered; a clock that went backwards is the exception.
    days.sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));
  }
  return { v: 1, days: days.slice(-HISTORY_DAYS) };
}

/**
 * THE DAILY CAP.
 *
 * Ten completed sets a day (owner 2026-08-14: "not just 3 — she should have
 * plenty to answer"; the old cap read as running out of game, and play volume
 * now outranks pacing). It was 3 from the v3 re-cut until then.
 *
 * WHAT RAISING IT SPENDS — decided with eyes open, not discovered later:
 *
 *     cap   bank exhausted    cards/day (max)
 *      3        43.3 d            1.00
 *     10        13.0 d            3.33
 *
 * The bank is 650 questions = 130 sets. A maxed-out user now retires the quiz
 * in 13 days instead of 43, collects the 33rd painting and the 43rd card in
 * those same 13 days, and the one-card-a-day rhythm (3 === MYSTERY_EVERY, a
 * beat a person could feel and come back for) is gone — a full day earns 3⅓
 * cards. The owner chose reach over runway; when the bank grows, the runway
 * grows back. Every OTHER lifecycle exactness is untouched: set 130 still lays
 * the last half of the 33rd painting, hands her the 43rd card and retires the
 * quiz in one move (pinned in __tests__/quizLifecycle.test.ts) — the cap only
 * changes how many days that takes.
 *
 * NOT tunable per user, and deliberately not remote-config: the number is part
 * of what the app IS, and a cap that moves is a cap she cannot build a habit
 * around.
 *
 * COUNTED FROM COMPLETED SETS, not from starts. A set she abandoned halfway
 * costs her nothing, and — more importantly — a set already in flight can always
 * be finished. Blocking someone mid-question because the clock rolled over is
 * the sort of thing that reads as a crash.
 */
export const DAILY_SET_LIMIT = 10;

export interface DailyGate {
  limit: number;
  /** Sets completed today. Can exceed `limit` if the cap was ever raised. */
  done: number;
  /** Sets she may still start today. Clamped to 0. */
  remaining: number;
  /** Today is used up. */
  reached: boolean;
}

export function dailyGate(h: QuizHistoryV1, todayYmd: string, limit = DAILY_SET_LIMIT): DailyGate {
  const cap = Math.max(1, Math.floor(limit) || 1);
  // An unparseable date must not hand out a free unlimited day, so it reads as
  // zero done rather than as "no record, therefore no cap".
  const day = isYmd(todayYmd) ? h.days.find(d => d.ymd === todayYmd) : undefined;
  const done = int(day?.sets);
  return { limit: cap, done, remaining: Math.max(0, cap - done), reached: done >= cap };
}

/**
 * May she begin a set right now?
 *
 * `hasLiveSession` wins over the cap, always. She started that set legitimately
 * — under the cap, or before midnight — and the only thing refusing it would
 * achieve is stranding her on a half-answered screen with a session that
 * persists and can never be finished or cleared.
 */
export function canStartSet(gate: DailyGate, hasLiveSession: boolean): boolean {
  return hasLiveSession || !gate.reached;
}

/** Ascending window of the last `n` calendar days ending at `todayYmd`,
 *  including days she did nothing — a chart needs the gaps. */
export function lastNDays(h: QuizHistoryV1, todayYmd: string, n: number): QuizDay[] {
  if (!isYmd(todayYmd) || n <= 0) return [];
  const byYmd = new Map(h.days.map(d => [d.ymd, d]));
  const out: QuizDay[] = [];
  // Parse as UTC and step in UTC: a local-midnight Date shifts by an hour
  // across a DST boundary and can repeat or skip a calendar day.
  const t = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(t)) return [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const ymd = new Date(t - i * 86400000).toISOString().slice(0, 10);
    out.push(byYmd.get(ymd) ?? { ymd, sets: 0, questions: 0, firstPassWrong: 0 });
  }
  return out;
}

export interface HistorySummary {
  /** Consecutive days with at least one set, counting back from today. */
  streak: number;
  /** Longest such run anywhere in the retained window. */
  bestStreak: number;
  activeDays: number;
  setsLast7: number;
  setsLast30: number;
  /** First-pass accuracy over the retained window, or null when nothing is recorded. */
  accuracy: number | null;
}

export function summarize(h: QuizHistoryV1, todayYmd: string): HistorySummary {
  const days = h.days;
  const q = days.reduce((s, d) => s + d.questions, 0);
  const w = days.reduce((s, d) => s + d.firstPassWrong, 0);

  const win = lastNDays(h, todayYmd, HISTORY_DAYS);
  let run = 0; let best = 0;
  for (const d of win) {
    if (d.sets > 0) { run += 1; best = Math.max(best, run); } else { run = 0; }
  }
  // The CURRENT streak counts back from today. A day she has not played YET
  // must not break it — otherwise the number collapses to zero every midnight
  // and only recovers once she opens the app, which reads as a bug.
  let streak = 0;
  for (let i = win.length - 1; i >= 0; i -= 1) {
    if (win[i].sets > 0) streak += 1;
    else if (i === win.length - 1) continue;   // today, not played yet
    else break;
  }

  return {
    streak,
    bestStreak: best,
    activeDays: days.filter(d => d.sets > 0).length,
    setsLast7: lastNDays(h, todayYmd, 7).reduce((s, d) => s + d.sets, 0),
    setsLast30: lastNDays(h, todayYmd, 30).reduce((s, d) => s + d.sets, 0),
    accuracy: q > 0 ? (q - w) / q : null,
  };
}

/**
 * Parse. Never throws; drops only the entries it cannot trust rather than the
 * whole record, since history is append-only and irreplaceable.
 */
export function parseHistory(raw: string | null): QuizHistoryV1 {
  if (!raw) return INITIAL_HISTORY;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.days)) return INITIAL_HISTORY;
    const seen = new Set<string>();
    const days: QuizDay[] = [];
    for (const d of p.days) {
      if (!d || !isYmd(d.ymd) || seen.has(d.ymd)) continue;
      seen.add(d.ymd);
      const questions = int(d.questions);
      days.push({
        ymd: d.ymd,
        sets: int(d.sets),
        questions,
        firstPassWrong: Math.min(questions, int(d.firstPassWrong)),
      });
    }
    days.sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));
    return { v: 1, days: days.slice(-HISTORY_DAYS) };
  } catch {
    return INITIAL_HISTORY;
  }
}
