import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOTAL_BIBLE_CHAPTERS = 1189;
export const TOTAL_BIBLE_BOOKS = 66;

const STORAGE_KEY = 'readChapters:v1';
const DATES_STORAGE_KEY = 'readChapters:dates:v1';
// ymd → chapters marked completed that day. Feeds the Weekly Recap's
// "chapters this week" (owner 2026-09-05: reading = mark-as-completed
// count, not minutes). Kept as a rolling ~5-week map so it can't grow
// unboundedly. Counts start accruing from the build that ships this —
// the first recap after updating honestly shows a partial week.
const DAILY_COUNTS_KEY = 'readChapters:dailyCounts:v1';
const DAILY_COUNTS_KEEP_DAYS = 35;

const keyOf = (bookSlug: string, chapter: number) => `${bookSlug}:${chapter}`;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Consecutive days ending today (or yesterday with one-day grace) where the
// user actually opened a chapter — distinct from ActivityContext.streak,
// which only proves the app was launched.
function readingStreakOf(dates: Set<string>): number {
  if (dates.size === 0) return 0;
  const cur = new Date();
  if (!dates.has(ymd(cur))) cur.setDate(cur.getDate() - 1);
  let s = 0;
  while (dates.has(ymd(cur))) { s++; cur.setDate(cur.getDate() - 1); }
  return s;
}

interface ReadChaptersState {
  read: Set<string>;
  chaptersRead: number;
  booksTouched: number;
  percent: number;
  readDates: Set<string>;
  readToday: boolean;
  readingStreak: number;
  /** ymd → chapters marked completed that day (rolling ~5 weeks). */
  dailyCounts: Readonly<Record<string, number>>;
  markRead: (bookSlug: string, chapter: number) => void;
  /** Revert a chapter to unread (user "Mark as unread"). Progress counters
   *  derive from the read set, so they update automatically. Reading-date
   *  history is left intact — un-completing one chapter shouldn't erase the
   *  fact the user read on that day. */
  markUnread: (bookSlug: string, chapter: number) => void;
  isRead: (bookSlug: string, chapter: number) => boolean;
}

const ReadChaptersContext = createContext<ReadChaptersState | null>(null);

export function ReadChaptersProvider({ children }: { children: React.ReactNode }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [readDates, setReadDates] = useState<Set<string>>(new Set());
  const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(DATES_STORAGE_KEY),
      AsyncStorage.getItem(DAILY_COUNTS_KEY),
    ]).then(([rawRead, rawDates, rawCounts]) => {
      if (rawRead) {
        try { setRead(new Set(JSON.parse(rawRead) as string[])); } catch {}
      }
      if (rawDates) {
        try { setReadDates(new Set(JSON.parse(rawDates) as string[])); } catch {}
      }
      if (rawCounts) {
        try {
          const parsed = JSON.parse(rawCounts) as Record<string, number>;
          if (parsed && typeof parsed === 'object') setDailyCounts(parsed);
        } catch {}
      }
    });
  }, []);

  const persistRead = (next: Set<string>) => {
    setRead(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };
  const persistDates = (next: Set<string>) => {
    setReadDates(next);
    AsyncStorage.setItem(DATES_STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };
  const persistCounts = (next: Record<string, number>) => {
    // Prune anything older than the keep window so the map stays tiny.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAILY_COUNTS_KEEP_DAYS);
    const floor = ymd(cutoff);
    const pruned: Record<string, number> = {};
    for (const [k, v] of Object.entries(next)) if (k >= floor && v > 0) pruned[k] = v;
    setDailyCounts(pruned);
    AsyncStorage.setItem(DAILY_COUNTS_KEY, JSON.stringify(pruned)).catch(() => {});
  };

  const value = useMemo<ReadChaptersState>(() => {
    const today = ymd(new Date());
    return {
      read,
      chaptersRead: read.size,
      booksTouched: new Set([...read].map(k => k.split(':')[0])).size,
      percent: Math.min(100, Math.round((read.size / TOTAL_BIBLE_CHAPTERS) * 100)),
      readDates,
      readToday: readDates.has(today),
      readingStreak: readingStreakOf(readDates),
      dailyCounts,
      markRead: (bookSlug, chapter) => {
        const k = keyOf(bookSlug, chapter);
        if (!read.has(k)) {
          const nextRead = new Set(read);
          nextRead.add(k);
          persistRead(nextRead);
          // Recap counter — only on a genuine unread→read transition, so
          // re-tapping an already-completed chapter can't inflate the week.
          persistCounts({ ...dailyCounts, [today]: (dailyCounts[today] ?? 0) + 1 });
        }
        if (!readDates.has(today)) {
          const nextDates = new Set(readDates);
          nextDates.add(today);
          persistDates(nextDates);
        }
      },
      markUnread: (bookSlug, chapter) => {
        const k = keyOf(bookSlug, chapter);
        if (read.has(k)) {
          const nextRead = new Set(read);
          nextRead.delete(k);
          persistRead(nextRead);
          // Mirror the counter down (floor 0) so a same-day mistake corrects
          // itself; un-marking on a LATER day deliberately leaves history —
          // same stance as readDates above.
          const cur = dailyCounts[today] ?? 0;
          if (cur > 0) persistCounts({ ...dailyCounts, [today]: cur - 1 });
        }
      },
      isRead: (bookSlug, chapter) => read.has(keyOf(bookSlug, chapter)),
    };
  }, [read, readDates, dailyCounts]);

  return <ReadChaptersContext.Provider value={value}>{children}</ReadChaptersContext.Provider>;
}

export function useReadChapters() {
  const ctx = useContext(ReadChaptersContext);
  if (!ctx) throw new Error('useReadChapters must be used inside ReadChaptersProvider');
  return ctx;
}
