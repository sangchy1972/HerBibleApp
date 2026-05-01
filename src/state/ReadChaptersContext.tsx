import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Total Protestant-canon chapter count; matches every translation we ship.
export const TOTAL_BIBLE_CHAPTERS = 1189;
export const TOTAL_BIBLE_BOOKS = 66;

const STORAGE_KEY = 'readChapters:v1';

const keyOf = (bookSlug: string, chapter: number) => `${bookSlug}:${chapter}`;

interface ReadChaptersState {
  read: Set<string>;
  chaptersRead: number;
  booksTouched: number;        // distinct books with at least one chapter read
  percent: number;             // chaptersRead / TOTAL_BIBLE_CHAPTERS, rounded
  markRead: (bookSlug: string, chapter: number) => void;
  isRead: (bookSlug: string, chapter: number) => boolean;
}

const ReadChaptersContext = createContext<ReadChaptersState | null>(null);

export function ReadChaptersProvider({ children }: { children: React.ReactNode }) {
  const [read, setRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setRead(new Set(JSON.parse(raw) as string[])); } catch {}
      }
    });
  }, []);

  const persist = (next: Set<string>) => {
    setRead(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };

  const value = useMemo<ReadChaptersState>(() => {
    const chaptersRead = read.size;
    const booksTouched = new Set([...read].map(k => k.split(':')[0])).size;
    const percent = Math.min(100, Math.round((chaptersRead / TOTAL_BIBLE_CHAPTERS) * 100));
    return {
      read,
      chaptersRead,
      booksTouched,
      percent,
      markRead: (bookSlug, chapter) => {
        const k = keyOf(bookSlug, chapter);
        if (read.has(k)) return;
        const next = new Set(read);
        next.add(k);
        persist(next);
      },
      isRead: (bookSlug, chapter) => read.has(keyOf(bookSlug, chapter)),
    };
  }, [read]);

  return <ReadChaptersContext.Provider value={value}>{children}</ReadChaptersContext.Provider>;
}

export function useReadChapters() {
  const ctx = useContext(ReadChaptersContext);
  if (!ctx) throw new Error('useReadChapters must be used inside ReadChaptersProvider');
  return ctx;
}
