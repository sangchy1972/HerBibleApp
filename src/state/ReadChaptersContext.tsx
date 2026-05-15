import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOTAL_BIBLE_CHAPTERS = 1189;
export const TOTAL_BIBLE_BOOKS = 66;

const STORAGE_KEY = 'readChapters:v1';            // Mark-as-Complete (1.0)
const VIEWED_STORAGE_KEY = 'readChapters:viewed:v1'; // 15s dwell (0.5)
const DATES_STORAGE_KEY = 'readChapters:dates:v1';
// One-shot migration flag: previously, the 5-min Bible-tab timer auto-fired
// `markRead(currentChapter)` on top of the explicit Mark-as-Complete button,
// so the chapter set could grow without the user ever confirming they read
// the chapter. The auto-fire was removed; this clears the polluted set on
// first launch of the new build so the progress bar starts honest. Days Read
// (DATES_STORAGE_KEY) is preserved — that signal was never auto-fired.
const STRICT_MARK_MIGRATION_KEY = 'readChapters:strict-mark-only-migrated';

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

// Two-tier progress: `viewed` (≥ 15 s of dwell, BibleScreen commits) counts
// for half credit, `read` (explicit Mark-as-Complete) counts for full. The
// weighted percent rewards engagement without forcing users to tap a button
// they never form the habit of tapping.
interface ReadChaptersState {
  read: Set<string>;          // marked complete (1.0 weight)
  viewed: Set<string>;        // dwelt ≥ 15 s but not marked (0.5 weight unless also in `read`)
  chaptersRead: number;       // |read ∪ viewed| — union, for achievement triggers
  booksTouched: number;       // distinct books across both sets
  percent: number;            // weighted ((|read| × 1.0) + (|viewed\read| × 0.5)) / 1189
  readDates: Set<string>;
  readToday: boolean;
  readingStreak: number;
  markRead: (bookSlug: string, chapter: number) => void;    // Mark-as-Complete tap
  markViewed: (bookSlug: string, chapter: number) => void;  // 15 s dwell fired
  isRead: (bookSlug: string, chapter: number) => boolean;   // is marked complete?
}

const ReadChaptersContext = createContext<ReadChaptersState | null>(null);

export function ReadChaptersProvider({ children }: { children: React.ReactNode }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [readDates, setReadDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      if (!(await AsyncStorage.getItem(STRICT_MARK_MIGRATION_KEY))) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await AsyncStorage.setItem(STRICT_MARK_MIGRATION_KEY, '1');
      }
      const [rawRead, rawViewed, rawDates] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(VIEWED_STORAGE_KEY),
        AsyncStorage.getItem(DATES_STORAGE_KEY),
      ]);
      if (rawRead) {
        try { setRead(new Set(JSON.parse(rawRead) as string[])); } catch {}
      }
      if (rawViewed) {
        try { setViewed(new Set(JSON.parse(rawViewed) as string[])); } catch {}
      }
      if (rawDates) {
        try { setReadDates(new Set(JSON.parse(rawDates) as string[])); } catch {}
      }
    })();
  }, []);

  const persistRead = (next: Set<string>) => {
    setRead(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };
  const persistViewed = (next: Set<string>) => {
    setViewed(next);
    AsyncStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };
  const persistDates = (next: Set<string>) => {
    setReadDates(next);
    AsyncStorage.setItem(DATES_STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };

  const value = useMemo<ReadChaptersState>(() => {
    const today = ymd(new Date());
    const union = new Set<string>([...viewed, ...read]);
    // Weighted progress: each chapter contributes 1.0 if marked complete,
    // else 0.5 if viewed ≥ 15 s, else 0. Sum then divide by 1189.
    let weighted = 0;
    for (const k of union) weighted += read.has(k) ? 1.0 : 0.5;
    const addTodayTo = (dates: Set<string>): Set<string> => {
      if (dates.has(today)) return dates;
      const next = new Set(dates);
      next.add(today);
      return next;
    };
    return {
      read,
      viewed,
      chaptersRead: union.size,
      booksTouched: new Set([...union].map(k => k.split(':')[0])).size,
      percent: Math.min(100, Math.round((weighted / TOTAL_BIBLE_CHAPTERS) * 100)),
      readDates,
      readToday: readDates.has(today),
      readingStreak: readingStreakOf(readDates),
      markRead: (bookSlug, chapter) => {
        const k = keyOf(bookSlug, chapter);
        if (!read.has(k)) {
          const next = new Set(read);
          next.add(k);
          persistRead(next);
        }
        const nextDates = addTodayTo(readDates);
        if (nextDates !== readDates) persistDates(nextDates);
      },
      markViewed: (bookSlug, chapter) => {
        const k = keyOf(bookSlug, chapter);
        if (!viewed.has(k)) {
          const next = new Set(viewed);
          next.add(k);
          persistViewed(next);
        }
        const nextDates = addTodayTo(readDates);
        if (nextDates !== readDates) persistDates(nextDates);
      },
      isRead: (bookSlug, chapter) => read.has(keyOf(bookSlug, chapter)),
    };
  }, [read, viewed, readDates]);

  return <ReadChaptersContext.Provider value={value}>{children}</ReadChaptersContext.Provider>;
}

export function useReadChapters() {
  const ctx = useContext(ReadChaptersContext);
  if (!ctx) throw new Error('useReadChapters must be used inside ReadChaptersProvider');
  return ctx;
}
