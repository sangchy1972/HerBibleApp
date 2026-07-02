// Pure, React-free helpers for the mood module: date keys, month grids, and
// streak / month / year statistics. Kept free of any react-native import so the
// whole file runs under plain ts-jest (see src/state/__tests__/moodStats.test.ts).
//
// `Mood` is imported type-only — the import is erased at compile time, so the
// SVG-heavy MoodEmoji module is never loaded when these helpers run in tests.
import type { Mood } from '../components/MoodEmoji';

/** Local-time 'YYYY-MM-DD'. NEVER use toISOString() here — that is UTC and
 *  shifts the day for users west of GMT after ~16:00 / east before ~08:00. */
export function isoKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Cell { day: number; date: Date }

/** A calendar month laid out as leading-null-padded 7-column weeks. Leading
 *  nulls pad to the first day's weekday; trailing nulls pad the last week to 7. */
export function monthGrid(cursor: Date): (Cell | null)[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Cell | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** 1-based day of the year (Jan 1 → 1). */
export function dayOfYear(d: Date): number {
  // Use UTC date components for BOTH endpoints so the subtraction is DST-immune.
  // The old version subtracted two local-time Dates, so across a spring-forward
  // transition the gap was N days minus 1h and floored to N-1 — making the year
  // progress ("day X/365") off by one for DST timezones for half the year.
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((cur - start) / 86_400_000);
}

type PickMap = Record<string, Mood>;

/** Consecutive-day streak ending today. If today isn't logged we still count a
 *  run that ended yesterday (the streak isn't "broken" until a day is fully
 *  missed). Returns 0 when neither today nor yesterday is logged. */
export function currentStreak(picks: PickMap, today: Date = new Date()): number {
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!picks[isoKey(cursor)]) {
    cursor.setDate(cursor.getDate() - 1);
    if (!picks[isoKey(cursor)]) return 0;
  }
  let count = 0;
  while (picks[isoKey(cursor)]) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/** Number of logged days in a given month. */
export function monthCountFor(picks: PickMap, year: number, month0: number): number {
  const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}-`;
  let c = 0;
  for (const k in picks) if (k.startsWith(prefix)) c++;
  return c;
}

export interface MonthStats { count: number; total: number; pct: number }

/** count = logged days this month, total = days in the month,
 *  pct = round(count/total*100) — the "70% OF APRIL" figure in the demo. */
export function monthStats(picks: PickMap, year: number, month0: number): MonthStats {
  const total = daysInMonth(year, month0);
  const count = monthCountFor(picks, year, month0);
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return { count, total, pct };
}

/** Number of logged days in a given year. */
export function yearCountFor(picks: PickMap, year: number): number {
  const prefix = `${year}-`;
  let c = 0;
  for (const k in picks) if (k.startsWith(prefix)) c++;
  return c;
}

export interface YearStats {
  count: number;        // logged days this year
  total: number;        // 365 / 366
  pct: number;          // YEAR-ELAPSED percent (demo: 32% = day 118 / 365)
  dayOfYear: number;
  daysRemaining: number;
}

export function yearStats(picks: PickMap, year: number, today: Date = new Date()): YearStats {
  const total = daysInYear(year);
  const count = yearCountFor(picks, year);
  const isCurrentYear = today.getFullYear() === year;
  // Past/future years read as fully elapsed / not-started respectively.
  const doy = isCurrentYear ? dayOfYear(today) : today.getFullYear() > year ? total : 0;
  const daysRemaining = Math.max(0, total - doy);
  const pct = total > 0 ? Math.round((doy / total) * 100) : 0;
  return { count, total, pct, dayOfYear: doy, daysRemaining };
}
