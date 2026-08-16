// Streak levels — shared by StreakScreen (keyed off lifetime totalComplete
// there) and StreakDailyHost (keyed off the CONSECUTIVE currentStreak there).
// The two screens deliberately read different numbers into the same ladder:
// the detail screen celebrates the lifetime journey, the daily popup protects
// the chain — see the note in StreakDailyHost before "unifying" them.
export function streakLevel(d: number): number {
  if (d >= 14) return 5;
  if (d >= 7) return 4;
  if (d >= 5) return 3;
  if (d >= 3) return 2;
  return 1;
}

// Level name resolved via t() at render time; `nameKey` keys into the catalog
// so the badge name follows the user's UI language.
export const LEVEL_INFO: Record<number, { nameKey: string; next: number }> = {
  1: { nameKey: 'streak.level.spark',   next: 3 },
  2: { nameKey: 'streak.level.small',   next: 5 },
  3: { nameKey: 'streak.level.medium',  next: 7 },
  4: { nameKey: 'streak.level.big',     next: 14 },
  5: { nameKey: 'streak.level.blazing', next: 30 },
};
