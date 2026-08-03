import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '../services/firebase';

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
  // Guards a write from landing before the read that should have preceded it.
  // Without it the persist effect fires on mount with the empty initial state
  // and writes "[]" over her saved verses. Two ways that becomes permanent:
  // the app is killed in the millisecond before the read resolves, or the
  // stored JSON is malformed — the parse throws, the catch swallows it, and
  // the [] this effect already wrote is now the only copy.
  //
  // It also matters for CLOUD RESTORE. restoreAndMerge writes the merged keys
  // and then remounts the provider tree; a fresh SavedVersesProvider that
  // persists [] on mount is exactly the stale-provider clobber that path was
  // rewritten to prevent. `savedVerses` is in MERGERS, so this is real data.
  //
  // Same guard as QuizContext and BibleScreen's settings persist.
  const hydrated = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setVerses(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => { hydrated.current = true; });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(verses)).catch(() => {});
  }, [verses]);

  const value = useMemo<SavedVersesState>(() => ({
    verses,
    addVerse: (ref, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (verses.some(v => v.ref === ref)) return;   // already saved → no event
      logEvent('verse_save', {});
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
