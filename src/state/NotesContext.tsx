import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NoteKind = 'reflection' | 'note';

export interface Note {
  id: string;
  text: string;
  savedAt: string;
  verseRef?: string;
  verseText?: string;
  kind?: NoteKind;
}

interface NotesState {
  notes: Note[];
  addNote: (text: string, verse?: { ref: string; text: string }, kind?: NoteKind) => void;
  editNote: (id: string, text: string) => void;
  removeNote: (id: string) => void;
}

const NotesContext = createContext<NotesState | null>(null);
const STORAGE_KEY = 'notes:v1';

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setNotes(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const persist = (next: Note[]) => {
    setNotes(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<NotesState>(() => ({
    notes,
    addNote: (text, verse, kind) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      persist([
        {
          id: String(Date.now()),
          text: trimmed,
          savedAt: new Date().toISOString(),
          verseRef: verse?.ref,
          verseText: verse?.text,
          kind,
        },
        ...notes,
      ]);
    },
    editNote: (id, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const target = notes.find(n => n.id === id);
      if (!target || target.text === trimmed) return; // no-op when unchanged
      persist(notes.map(n =>
        n.id === id ? { ...n, text: trimmed, savedAt: new Date().toISOString() } : n,
      ));
    },
    removeNote: (id) => persist(notes.filter((n) => n.id !== id)),
  }), [notes]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used inside NotesProvider');
  return ctx;
}
