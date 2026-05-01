import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Bookmark {
  id: string;          // `${translation}:${bookSlug}:${chapter}`
  translation: string;
  bookSlug: string;
  bookTitle: string;
  chapter: number;
  savedAt: string;
}

interface BookmarksState {
  bookmarks: Bookmark[];
  count: number;
  toggleBookmark: (params: { translation: string; bookSlug: string; bookTitle: string; chapter: number }) => void;
  isBookmarked: (translation: string, bookSlug: string, chapter: number) => boolean;
  removeBookmark: (id: string) => void;
}

const BookmarksContext = createContext<BookmarksState | null>(null);
const STORAGE_KEY = 'bookmarks:v1';

const makeId = (translation: string, bookSlug: string, chapter: number) =>
  `${translation}:${bookSlug}:${chapter}`;

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setBookmarks(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const persist = (next: Bookmark[]) => {
    setBookmarks(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<BookmarksState>(() => ({
    bookmarks,
    count: bookmarks.length,
    toggleBookmark: ({ translation, bookSlug, bookTitle, chapter }) => {
      const id = makeId(translation, bookSlug, chapter);
      if (bookmarks.some(b => b.id === id)) {
        persist(bookmarks.filter(b => b.id !== id));
      } else {
        persist([
          { id, translation, bookSlug, bookTitle, chapter, savedAt: new Date().toISOString() },
          ...bookmarks,
        ]);
      }
    },
    isBookmarked: (translation, bookSlug, chapter) =>
      bookmarks.some(b => b.id === makeId(translation, bookSlug, chapter)),
    removeBookmark: (id) => persist(bookmarks.filter(b => b.id !== id)),
  }), [bookmarks]);

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error('useBookmarks must be used inside BookmarksProvider');
  return ctx;
}
