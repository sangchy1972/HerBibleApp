import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedVerse {
  id: string;
  ref: string;        // e.g. "Psalms 23:1"
  text: string;
  savedAt: string;    // ISO date
}

interface SavedVersesState {
  verses: SavedVerse[];
  addVerse: (ref: string, text: string) => void;
  removeVerse: (id: string) => void;
  hasVerse: (ref: string) => boolean;
}

const SavedVersesContext = createContext<SavedVersesState | null>(null);
const STORAGE_KEY = 'savedVerses';

export function SavedVersesProvider({ children }: { children: React.ReactNode }) {
  const [verses, setVerses] = useState<SavedVerse[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setVerses(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(verses)).catch(() => {});
  }, [verses]);

  const value = useMemo<SavedVersesState>(() => ({
    verses,
    addVerse: (ref, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setVerses(prev => {
        if (prev.some(v => v.ref === ref)) return prev;
        return [{ id: String(Date.now()), ref, text: trimmed, savedAt: new Date().toISOString() }, ...prev];
      });
    },
    removeVerse: (id) => setVerses(prev => prev.filter(v => v.id !== id)),
    hasVerse: (ref) => verses.some(v => v.ref === ref),
  }), [verses]);

  return <SavedVersesContext.Provider value={value}>{children}</SavedVersesContext.Provider>;
}

export function useSavedVerses() {
  const ctx = useContext(SavedVersesContext);
  if (!ctx) throw new Error('useSavedVerses must be used inside SavedVersesProvider');
  return ctx;
}
