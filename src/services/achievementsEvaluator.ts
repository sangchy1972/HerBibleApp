// Pure evaluator for the achievement spec. Given a snapshot of the user's
// current state, returns the set of badge ids that have been earned. The
// AchievementsContext diffs this against the persisted earned set to detect
// new awards and queue them for the unlock popup.
//
// All logic lives here as a switch on the badge's declarative `condition`
// kind, so it stays unit-testable and adding a new condition kind is a
// one-place change.

import { ACHIEVEMENTS, type Achievement } from '../constants/achievements';

export interface EvaluatorSnapshot {
  // Prayer
  currentPrayerStreak: number;       // consecutive *complete* days (m && e) ending today, with 1-day grace
  totalPrayerCompleteDays: number;
  prayerEver: boolean;               // any prayer record has m or e set — drives First Light (fires on first Amen)
  prayerDoneToday: boolean;          // morning OR evening done today (used by tripleToday)
  earlyBirdStreak: number;           // consecutive days where prayer was completed before 21:00 local

  // Reading
  chaptersRead: number;
  readPercent: number;
  readingStreak: number;             // consecutive days with ≥1 chapter marked complete (ReadChapters)
  bookCompletedToday: boolean;       // a chapter was marked read today (used by tripleToday)
  noteAddedToday: boolean;
  highlightAddedToday: boolean;      // v2.3 tripleToday accepts note OR highlight as the third leg

  // Notes / highlights
  notesCount: number;
  highlightsCount: number;
  distinctHighlightedBooks: number;
  booksRead: number;                 // distinct books with ≥1 chapter read (booksTouched)


  // Plans
  planCount: number;
  planRecentDates: string[];         // YYYY-MM-DD list of plan-finish dates (rolling window)
  hasRepeatedPlan: boolean;

  // Misc
  shareCount: number;
  daysSinceFirstLaunch: number;      // for activeYears + anniversary
  activeDaysTotal: number;           // distinct app-active days; used by A Full Year (≥ 300)
  isAnniversaryToday: boolean;       // today's date matches first-launch month/day exactly
  earnedIds: string[];               // for combo badges (Crown of Grace)
}

function meets(a: Achievement, s: EvaluatorSnapshot): boolean {
  const c = a.condition;
  switch (c.kind) {
    case 'prayerStreak':       return s.currentPrayerStreak >= c.days;
    case 'prayerCount':        return s.totalPrayerCompleteDays >= c.total;
    case 'prayerEver':         return s.prayerEver;
    case 'readPercent':        return s.readPercent >= c.percent;
    case 'chaptersRead':       return s.chaptersRead >= c.total;
    case 'readingStreak':      return s.readingStreak >= c.days;
    case 'notesCount':         return s.notesCount >= c.total;
    case 'highlightsCount':    return s.highlightsCount >= c.total;
    case 'notesCountModulo':
      // Modulo trigger: passes whenever count is a positive multiple of `step`,
      // optionally bounded by `cap`. Combined with `repeatable: true` and the
      // AchievementsContext daily-cap, the user gets one award per crossing
      // (e.g. 10 → award, 11..19 → silent, 20 → award again, …).
      return s.notesCount > 0
          && s.notesCount % c.step === 0
          && (c.cap == null || s.notesCount <= c.cap);
    case 'highlightsCountModulo':
      return s.highlightsCount > 0
          && s.highlightsCount % c.step === 0
          && (c.cap == null || s.highlightsCount <= c.cap);
    case 'highlightedBooks':   return s.distinctHighlightedBooks >= c.total;
    case 'booksRead':          return s.booksRead >= c.total;
    case 'planCount':          return s.planCount >= c.total;
    case 'planInWindow':       return countWithinDays(s.planRecentDates, c.days) >= c.total;
    case 'planRepeated':       return s.hasRepeatedPlan;
    case 'shareCount':         return s.shareCount >= c.total;
    case 'tripleToday':
      // Per v2.3: prayer + reading + (note OR highlight) all in the same day.
      return s.prayerDoneToday
          && s.bookCompletedToday
          && (s.noteAddedToday || s.highlightAddedToday);
    case 'earlyBirdStreak':    return s.earlyBirdStreak >= c.days;
    case 'allThreeStreaks':
      // Legacy condition kind (pre-v2.3). Kept for back-compat in case any
      // saved badge data references it; not currently emitted by any active
      // achievement definition.
      return s.currentPrayerStreak >= c.days
          && s.readingStreak >= c.days
          && countWithinDays(s.planRecentDates, c.days) >= c.days;
    case 'riverOfLife':
      // Per v2.3: prayer streak ≥ A AND reading streak ≥ B AND ≥ C plans
      // completed in the last `windowDays` days. Each stream measured
      // independently — they do not need to start on the same day.
      return s.currentPrayerStreak >= c.prayerDays
          && s.readingStreak >= c.readingDays
          && countWithinDays(s.planRecentDates, c.windowDays) >= c.plansInWindow;
    case 'anniversary':        return s.daysSinceFirstLaunch >= 365 && s.isAnniversaryToday;
    case 'activeYears':
      // v2.3 widens this to optionally also require `activeDaysMin` distinct
      // active days. Used by milestone.fullYear (365 + 300).
      return s.daysSinceFirstLaunch >= c.days
          && (c.activeDaysMin == null || s.activeDaysTotal >= c.activeDaysMin);
    case 'holdsAll':           return c.ids.every(id => s.earnedIds.includes(id));
  }
}

function countWithinDays(dates: string[], days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = ymd(cutoff);
  return dates.filter(d => d >= cutoffKey).length;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface EvalResult {
  earnedIds: string[];   // badge ids that meet their condition right now
}

export function evaluateAchievements(snapshot: EvaluatorSnapshot): EvalResult {
  // Two-pass: combo badges depend on other badges' earned state. First pass
  // resolves non-combo badges; second pass resolves combos against the union
  // of (currently-passing) ∪ (historically-earned).
  //
  // Critical: combos read `earnedIds` to mean "ever earned", per the spec's
  // `has(...)` semantics. Crown of Grace, for example, requires holding
  // The Whole Word + A Year of Devotion + Plan Master "simultaneously" but
  // those are themselves once-earned-then-permanent (read-100 stays at 100,
  // streak-365 stays earned even if the active streak later breaks).
  // Restricting the combo input to firstPass would falsely fail Crown the
  // moment a long-running streak breaks. The union restores correct
  // behavior while still letting newly-passing badges flow into combos.
  const firstPass: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.condition.kind === 'holdsAll') continue;
    if (meets(a, snapshot)) firstPass.push(a.id);
  }
  const comboEarnedIds = Array.from(new Set([...snapshot.earnedIds, ...firstPass]));
  const withFirst = { ...snapshot, earnedIds: comboEarnedIds };
  const second: string[] = [...firstPass];
  for (const a of ACHIEVEMENTS) {
    if (a.condition.kind !== 'holdsAll') continue;
    if (meets(a, withFirst)) second.push(a.id);
  }
  return { earnedIds: second };
}
