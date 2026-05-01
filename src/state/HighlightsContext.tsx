import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Highlight {
  id: string;          // `${translation}:${bookSlug}:${chapter}:${verse}`
  translation: string;
  bookSlug: string;
  bookTitle: string;
  chapter: number;
  verse: number;
  color: string;       // 'rose' | 'lav' | 'amber' | 'sage' | 'sky'
  text: string;
  savedAt: string;
}

interface HighlightsState {
  highlights: Record<string, Highlight>;
  count: number;
  setHighlight: (h: Omit<Highlight, 'id' | 'savedAt'>) => void;
  removeHighlight: (id: string) => void;
  getColor: (translation: string, bookSlug: string, chapter: number, verse: number) => string | undefined;
}

const HighlightsContext = createContext<HighlightsState | null>(null);
const STORAGE_KEY = 'highlights:v1';

const makeId = (translation: string, bookSlug: string, chapter: number, verse: number) =>
  `${translation}:${bookSlug}:${chapter}:${verse}`;

export function HighlightsProvider({ children }: { children: React.ReactNode }) {
  const [highlights, setHighlights] = useState<Record<string, Highlight>>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setHighlights(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const persist = (next: Record<string, Highlight>) => {
    setHighlights(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<HighlightsState>(() => ({
    highlights,
    count: Object.keys(highlights).length,
    setHighlight: (h) => {
      const id = makeId(h.translation, h.bookSlug, h.chapter, h.verse);
      const existing = highlights[id];
      // Toggle off if same color tapped again
      if (existing && existing.color === h.color) {
        const next = { ...highlights };
        delete next[id];
        persist(next);
        return;
      }
      persist({
        ...highlights,
        [id]: { ...h, id, savedAt: new Date().toISOString() },
      });
    },
    removeHighlight: (id) => {
      if (!highlights[id]) return;
      const next = { ...highlights };
      delete next[id];
      persist(next);
    },
    getColor: (translation, bookSlug, chapter, verse) =>
      highlights[makeId(translation, bookSlug, chapter, verse)]?.color,
  }), [highlights]);

  return <HighlightsContext.Provider value={value}>{children}</HighlightsContext.Provider>;
}

export function useHighlights() {
  const ctx = useContext(HighlightsContext);
  if (!ctx) throw new Error('useHighlights must be used inside HighlightsProvider');
  return ctx;
}
