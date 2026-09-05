// Weekly Recap — pure logic. Owner spec 2026-09-05 (12-point Q&A):
//   • Weeks start on SUNDAY. The recap shown during week W covers the whole
//     completed week W-1 (last Sunday → the Saturday just passed), no matter
//     which day of W the user first opens the app.
//   • New users are exempt while firstLaunch is under 3 days old.
//   • Zero-activity weeks STILL get a recap (encouraging copy variant).
//   • Reading = chapters marked completed (a dated counter; no minutes).
//   • Deltas vs the week before are part of the stats; a user whose previous
//     week has no data gets a "fresh start" (null) delta, never "-0".
//   • Re-prompt rules: at most 1 sheet show per day, at most 3 shows per
//     recap week; once the user opens the flow (or the week rolls over) it
//     never shows again. Missed = gone — no archive.
//
// Everything here is pure and injected so jest can walk calendars freely;
// the contexts adapt their stores into WeekInput at the call site.
import type { QuizDay } from '../state/quizHistory';

export interface PrayerDayRecord { m: boolean; e: boolean }

export interface WeekInput {
  /** ymd → prayer record (PrayerContext DayRecords). */
  prayerRecords: Readonly<Record<string, PrayerDayRecord>>;
  /** App-open days (ActivityContext dates). */
  activityDates: ReadonlySet<string>;
  /** Quiz per-day history (quizHistory days, any order). */
  quizDays: readonly QuizDay[];
  /** ymd → chapters marked completed that day (ReadChaptersContext daily log). */
  chapterCounts: Readonly<Record<string, number>>;
}

export interface WeekSlice {
  amen: number;              // morning + evening completions across the week
  morningAmen: number;
  eveningAmen: number;
  activeDays: boolean[];     // Sun..Sat
  activeCount: number;
  chapters: number;
  quizQuestions: number;
  quizPct: number | null;    // first-pass accuracy 0..100; null when no questions
  hasAnyData: boolean;
}

export type PersonaId =
  | 'sunriseKeeper'   // mornings carried the week
  | 'lampAtDusk'      // evenings carried the week
  | 'steadfastWalker' // all seven days active
  | 'returningHeart'  // quiet previous week, came back this week
  | 'deepDiver'       // reading led everything
  | 'wordScholar'     // strong quiz week
  | 'seedPlanter'     // a modest but real start
  | 'quietSojourner'; // an empty week — spoken to with kindness

export interface WeeklyStats {
  weekStartYmd: string;      // the covered week's Sunday
  weekEndYmd: string;        // its Saturday
  cur: WeekSlice;
  // Deltas vs the week before the covered one; null = no prior data at all
  // ("fresh start"), so the UI never renders a meaningless -0.
  delta: { amen: number; chapters: number; activeDays: number; quizPct: number | null } | null;
  persona: PersonaId;
}

// ── Calendar helpers (local time, ymd strings all the way) ─────────────────

export function ymdOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymdOf(d);
}

/** Sunday (start) of the week containing `todayYmd`. */
export function weekStartOf(todayYmd: string): string {
  const d = parseYmd(todayYmd);
  d.setDate(d.getDate() - d.getDay()); // getDay(): Sun=0
  return ymdOf(d);
}

/** The COVERED week for a recap seen on `todayYmd`: last Sunday → Saturday. */
export function coveredWeekOf(todayYmd: string): { start: string; end: string } {
  const thisSunday = weekStartOf(todayYmd);
  return { start: addDays(thisSunday, -7), end: addDays(thisSunday, -1) };
}

function weekDays(startYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startYmd, i));
}

// ── Aggregation ────────────────────────────────────────────────────────────

function sliceWeek(input: WeekInput, startYmd: string): WeekSlice {
  const days = weekDays(startYmd);
  let morningAmen = 0;
  let eveningAmen = 0;
  let chapters = 0;
  let quizQuestions = 0;
  let quizWrong = 0;
  const quizByYmd = new Map(input.quizDays.map(q => [q.ymd, q]));
  const activeDays = days.map(d => input.activityDates.has(d));
  for (const d of days) {
    const p = input.prayerRecords[d];
    if (p?.m) morningAmen++;
    if (p?.e) eveningAmen++;
    chapters += Math.max(0, Math.floor(input.chapterCounts[d] ?? 0));
    const q = quizByYmd.get(d);
    if (q) { quizQuestions += q.questions; quizWrong += q.firstPassWrong; }
  }
  const amen = morningAmen + eveningAmen;
  const activeCount = activeDays.filter(Boolean).length;
  const quizPct = quizQuestions > 0
    ? Math.round(((quizQuestions - Math.min(quizWrong, quizQuestions)) / quizQuestions) * 100)
    : null;
  return {
    amen, morningAmen, eveningAmen, activeDays, activeCount, chapters,
    quizQuestions, quizPct,
    hasAnyData: amen > 0 || activeCount > 0 || chapters > 0 || quizQuestions > 0,
  };
}

// ── Persona (owner-reviewed copy lives in i18n under recap.persona.<id>) ───
//
// Deterministic first-match order — the rarer, more personal reads win:
//   returningHeart > steadfastWalker > sunriseKeeper / lampAtDusk >
//   deepDiver > wordScholar > seedPlanter > quietSojourner.
export function resolvePersona(cur: WeekSlice, prev: WeekSlice): PersonaId {
  if (!cur.hasAnyData) return 'quietSojourner';
  if (prev.activeCount <= 1 && cur.activeCount >= 3) return 'returningHeart';
  if (cur.activeCount === 7) return 'steadfastWalker';
  if (cur.morningAmen >= 4 && cur.morningAmen >= cur.eveningAmen) return 'sunriseKeeper';
  if (cur.eveningAmen >= 4) return 'lampAtDusk';
  if (cur.chapters >= 7 && cur.chapters >= cur.amen) return 'deepDiver';
  if (cur.quizPct !== null && cur.quizPct >= 80 && cur.quizQuestions >= 20) return 'wordScholar';
  return 'seedPlanter';
}

export function computeWeeklyStats(input: WeekInput, todayYmd: string): WeeklyStats {
  const { start, end } = coveredWeekOf(todayYmd);
  const cur = sliceWeek(input, start);
  const prevStart = addDays(start, -7);
  const prev = sliceWeek(input, prevStart);
  return {
    weekStartYmd: start,
    weekEndYmd: end,
    cur,
    delta: prev.hasAnyData
      ? {
          amen: cur.amen - prev.amen,
          chapters: cur.chapters - prev.chapters,
          activeDays: cur.activeCount - prev.activeCount,
          quizPct: cur.quizPct !== null && prev.quizPct !== null ? cur.quizPct - prev.quizPct : null,
        }
      : null,
    persona: resolvePersona(cur, prev),
  };
}

// ── Sheet eligibility + show bookkeeping ───────────────────────────────────

export interface RecapPromptState {
  /** The covered week's Sunday this state belongs to. */
  weekStart: string;
  /** Days (ymd) the unlock sheet was shown. */
  shownOn: string[];
  /** She tapped through to the flow — never prompt again for this week. */
  opened: boolean;
}

export const EMPTY_PROMPT_STATE: RecapPromptState = { weekStart: '', shownOn: [], opened: false };

export const MAX_SHOWS_PER_WEEK = 3;
export const MIN_ACCOUNT_AGE_DAYS = 3;

/** Normalize stored state to the recap week current at `todayYmd` — a rolled
 *  week resets the counters (the old week's recap is gone forever). */
export function promptStateFor(stored: RecapPromptState | null, todayYmd: string): RecapPromptState {
  const weekStart = coveredWeekOf(todayYmd).start;
  if (!stored || stored.weekStart !== weekStart) return { weekStart, shownOn: [], opened: false };
  return stored;
}

export function shouldPromptRecap(args: {
  state: RecapPromptState;      // already normalized via promptStateFor
  todayYmd: string;
  firstLaunchYmd: string | null; // ActivityContext/DailyVerses first-launch date
}): boolean {
  const { state, todayYmd, firstLaunchYmd } = args;
  if (state.opened) return false;
  if (state.shownOn.length >= MAX_SHOWS_PER_WEEK) return false;
  if (state.shownOn.includes(todayYmd)) return false;      // 1 per day
  if (!firstLaunchYmd) return false;                       // not hydrated yet — never guess
  // New-user exemption: under 3 days since first open, no recap yet.
  const age = (parseYmd(todayYmd).getTime() - parseYmd(firstLaunchYmd).getTime()) / 86400000;
  if (age < MIN_ACCOUNT_AGE_DAYS) return false;
  return true;
}

export function markPromptShown(state: RecapPromptState, todayYmd: string): RecapPromptState {
  if (state.shownOn.includes(todayYmd)) return state;
  return { ...state, shownOn: [...state.shownOn, todayYmd] };
}

export function markPromptOpened(state: RecapPromptState): RecapPromptState {
  return { ...state, opened: true };
}
