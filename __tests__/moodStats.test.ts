import {
  isoKey, monthGrid, daysInMonth, isLeapYear, daysInYear, dayOfYear,
  currentStreak, monthCountFor, monthStats, yearCountFor, yearStats,
} from '../src/state/moodStats';
import type { Mood } from '../src/components/MoodEmoji';

// Build a pick map from a list of 'YYYY-MM-DD' keys (all 'happy' — the mood
// value is irrelevant to these presence-based stats).
const picksFrom = (keys: string[]): Record<string, Mood> =>
  Object.fromEntries(keys.map(k => [k, 'happy' as Mood]));

describe('isoKey — local-time, zero-padded', () => {
  it('pads single-digit month/day', () => {
    expect(isoKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('date math', () => {
  it('daysInMonth handles 28/29/30/31', () => {
    expect(daysInMonth(2026, 1)).toBe(28);   // Feb 2026 (non-leap)
    expect(daysInMonth(2028, 1)).toBe(29);   // Feb 2028 (leap)
    expect(daysInMonth(2026, 3)).toBe(30);   // Apr
    expect(daysInMonth(2026, 0)).toBe(31);   // Jan
  });
  it('leap-year rules', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
  });
  it('dayOfYear is 1-based', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 3, 28))).toBe(118);  // demo: day 118
  });
});

describe('monthGrid', () => {
  it('pads leading + trailing nulls to whole weeks', () => {
    const grid = monthGrid(new Date(2026, 3, 1));   // Apr 2026, 1st is a Wednesday
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toBeNull();                       // leading pad
    const days = grid.filter(Boolean).length;
    expect(days).toBe(30);
  });
});

describe('currentStreak', () => {
  const today = new Date(2026, 5, 30);   // Jun 30 2026
  it('counts a consecutive run ending today', () => {
    const p = picksFrom(['2026-06-28', '2026-06-29', '2026-06-30']);
    expect(currentStreak(p, today)).toBe(3);
  });
  it('still counts a run that ended yesterday (today not yet logged)', () => {
    const p = picksFrom(['2026-06-28', '2026-06-29']);
    expect(currentStreak(p, today)).toBe(2);
  });
  it('returns 0 when neither today nor yesterday logged', () => {
    const p = picksFrom(['2026-06-27']);
    expect(currentStreak(p, today)).toBe(0);
  });
  it('a gap breaks the streak', () => {
    const p = picksFrom(['2026-06-26', '2026-06-27', '2026-06-29', '2026-06-30']);
    expect(currentStreak(p, today)).toBe(2);   // 29 + 30 only
  });
  it('spans a month boundary', () => {
    const p = picksFrom(['2026-04-30', '2026-05-01', '2026-05-02']);
    expect(currentStreak(p, new Date(2026, 4, 2))).toBe(3);
  });
  it('empty map → 0', () => {
    expect(currentStreak({}, today)).toBe(0);
  });
});

describe('monthStats', () => {
  it('counts logged days and computes pct of the whole month', () => {
    const p = picksFrom(['2026-04-01', '2026-04-02', '2026-04-15']);
    const s = monthStats(p, 2026, 3);
    expect(s.count).toBe(3);
    expect(s.total).toBe(30);
    expect(s.pct).toBe(10);          // 3/30
  });
  it('ignores other months', () => {
    const p = picksFrom(['2026-04-01', '2026-05-01', '2026-03-31']);
    expect(monthCountFor(p, 2026, 3)).toBe(1);
  });
  it('empty month → 0/total/0', () => {
    const s = monthStats({}, 2026, 3);
    expect(s).toEqual({ count: 0, total: 30, pct: 0 });
  });
  it('70% of April demo figure', () => {
    const keys = Array.from({ length: 21 }, (_, i) => `2026-04-${String(i + 1).padStart(2, '0')}`);
    expect(monthStats(picksFrom(keys), 2026, 3).pct).toBe(70);   // 21/30
  });
});

describe('yearStats', () => {
  it('year-elapsed pct + remaining (demo: 32% day 118/365)', () => {
    const s = yearStats({}, 2026, new Date(2026, 3, 28));
    expect(s.total).toBe(365);
    expect(s.dayOfYear).toBe(118);
    expect(s.daysRemaining).toBe(247);
    expect(s.pct).toBe(32);
  });
  it('counts logged days in the year', () => {
    const p = picksFrom(['2026-01-01', '2026-06-30', '2025-12-31']);
    expect(yearCountFor(p, 2026)).toBe(2);
  });
  it('leap year total', () => {
    expect(yearStats({}, 2028, new Date(2028, 0, 1)).total).toBe(366);
  });
  it('past year reads as fully elapsed', () => {
    const s = yearStats({}, 2025, new Date(2026, 5, 30));
    expect(s.pct).toBe(100);
    expect(s.daysRemaining).toBe(0);
  });
});
