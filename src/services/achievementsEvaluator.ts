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
  currentPrayerStreak: number;       // consecutive complete days ending today (or yesterday with grace)
  totalPrayerCompleteDays: number;
  prayerDoneToday: boolean;          // morning OR evening done today
  earlyBirdStreak: number;           // consecutive days where prayer was completed before 7am local

  // Reading
  chaptersRead: number;
  readPercent: number;
  readingStreak: number;             // ActivityContext.streak — distinct days the user has been active in the app
  bookCompletedToday: boolean;       // a chapter was read today
  noteAddedToday: boolean;

  // Notes / highlights
  notesCount: number;
  highlightsCount: number;
  distinctHighlightedBooks: number;

  // Plans (placeholder — wire when PlanCompletionContext lands)
  planCount: number;
  planRecentDates: string[];         // YYYY-MM-DD list, used to derive "N in last D days"
  hasRepeatedPlan: boolean;

  // Misc
  shareCount: number;
  daysSinceFirstLaunch: number;      // for activeYears + anniversary
  isAnniversaryToday: boolean;       // today's date matches first-launch month/day exactly
  earnedIds: string[];               // for combo badges (Crown of Grace)
}

function meets(a: Achievement, s: EvaluatorSnapshot): boolean {
  const c = a.condition;
  switch (c.kind) {
    case 'prayerStreak':       return s.currentPrayerStreak >= c.days;
    case 'prayerCount':        return s.totalPrayerCompleteDays >= c.total;
    case 'readPercent':        return s.readPercent >= c.percent;
    case 'chaptersRead':       return s.chaptersRead >= c.total;
    case 'readingStreak':      return s.readingStreak >= c.days;
    case 'notesCount':         return s.notesCount >= c.total;
    case 'highlightsCount':    return s.highlightsCount >= c.total;
    case 'highlightedBooks':   return s.distinctHighlightedBooks >= c.total;
    case 'planCount':          return s.planCount >= c.total;
    case 'planInWindow':       return countWithinDays(s.planRecentDates, c.days) >= c.total;
    case 'planRepeated':       return s.hasRepeatedPlan;
    case 'shareCount':         return s.shareCount >= c.total;
    case 'tripleToday':        return s.prayerDoneToday && s.bookCompletedToday && s.noteAddedToday;
    case 'earlyBirdStreak':    return s.earlyBirdStreak >= c.days;
    case 'allThreeStreaks':    return s.currentPrayerStreak >= c.days
                                   && s.readingStreak >= c.days
                                   && countWithinDays(s.planRecentDates, c.days) >= c.days; // approximate: 1 plan per day for `days`
    case 'anniversary':        return s.daysSinceFirstLaunch >= 365 && s.isAnniversaryToday;
    case 'activeYears':        return s.daysSinceFirstLaunch >= c.days;
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
  // resolves non-combo badges; second pass resolves combos against the result
  // of the first.
  const firstPass: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.condition.kind === 'holdsAll') continue;
    if (meets(a, snapshot)) firstPass.push(a.id);
  }
  const withFirst = { ...snapshot, earnedIds: firstPass };
  const second: string[] = [...firstPass];
  for (const a of ACHIEVEMENTS) {
    if (a.condition.kind !== 'holdsAll') continue;
    if (meets(a, withFirst)) second.push(a.id);
  }
  return { earnedIds: second };
}
