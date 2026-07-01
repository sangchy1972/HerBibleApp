import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Mood } from '../components/MoodEmoji';
import { logEvent } from '../services/firebase';

const STORAGE_KEY_V2 = 'mood:v2';
const STORAGE_KEY_V1 = 'mood:v1';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** One day's mood + optional note. `at` is the ms timestamp of the last write
 *  (0 for entries migrated from the noteless v1 store). */
export interface MoodEntry { mood: Mood; note?: string; at: number }

interface PersistedV2 {
  entries: Record<string, MoodEntry>;   // 'YYYY-MM-DD' → entry
  lastShownAt: number;                   // ms timestamp the prompt last opened
}

const DEFAULT: PersistedV2 = { entries: {}, lastShownAt: 0 };

// Should the daily prompt open right now? Pure so the mount-trigger effect and
// the exposed `shouldShow` share one definition.
function computeShouldShow(state: PersistedV2, now = Date.now()): boolean {
  const today = todayKey();
  if (state.entries[today]) return false;                 // already logged today
  const last = new Date(state.lastShownAt || 0);
  const lastKey = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  if (state.lastShownAt === 0 || lastKey !== today) return true;   // first ever / first today
  return now - state.lastShownAt >= EIGHT_HOURS_MS;        // shown+skipped today → re-show after 8h
}

interface MoodCheckInState {
  ready: boolean;
  entries: Record<string, MoodEntry>;
  /** DERIVED date→mood view; keeps calendar/stats consumers simple. */
  picks: Record<string, Mood>;
  todayMood: Mood | null;
  todayNote: string | null;
  totalCheckIns: number;
  /** The daily bottom-sheet is visible. Read by the global <MoodCheckInSheet>. */
  promptVisible: boolean;
  openPrompt: () => void;
  closePrompt: () => void;
  shouldShow: () => boolean;
  markShown: () => void;
  recordPick: (mood: Mood, note?: string) => void;
  /** Record/change any day's mood — powers make-up check-ins + day-detail edits. */
  recordPickFor: (dateKey: string, mood: Mood, note?: string) => void;
  entryFor: (dateKey: string) => MoodEntry | null;
}

const Ctx = createContext<MoodCheckInState | null>(null);

export function MoodCheckInProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedV2>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const firedRef = useRef(false);

  // Load v2; migrate a v1 store once if that's all we have.
  useEffect(() => {
    (async () => {
      try {
        const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
        if (rawV2) {
          setState({ ...DEFAULT, ...JSON.parse(rawV2) });
          return;
        }
        const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
        if (rawV1) {
          const v1 = JSON.parse(rawV1) as { picks?: Record<string, Mood>; lastShownAt?: number };
          const entries: Record<string, MoodEntry> = {};
          for (const [k, mood] of Object.entries(v1.picks || {})) entries[k] = { mood, at: 0 };
          const migrated: PersistedV2 = { entries, lastShownAt: v1.lastShownAt || 0 };
          setState(migrated);
          // Persist forward so we never migrate twice (v1 is left as a backup).
          AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated)).catch(() => {});
        }
      } catch {
        // Malformed JSON → fall back to DEFAULT (already set).
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = (next: PersistedV2) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next)).catch(() => {});
  };

  // Open the daily prompt once per mount when it's due. Runs the moment the
  // store is hydrated. markShown() is folded in so a dismiss-without-save
  // respects the 8h / next-day cadence.
  useEffect(() => {
    if (!ready || firedRef.current) return;
    firedRef.current = true;
    if (computeShouldShow(state)) {
      setPromptVisible(true);
      persist({ ...state, lastShownAt: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const value = useMemo<MoodCheckInState>(() => {
    const today = todayKey();
    const picks: Record<string, Mood> = {};
    for (const [k, e] of Object.entries(state.entries)) picks[k] = e.mood;
    const todayEntry = state.entries[today];
    return {
      ready,
      entries: state.entries,
      picks,
      todayMood: todayEntry?.mood ?? null,
      todayNote: todayEntry?.note ?? null,
      totalCheckIns: Object.keys(state.entries).length,
      promptVisible,
      openPrompt: () => setPromptVisible(true),
      closePrompt: () => setPromptVisible(false),
      shouldShow: () => computeShouldShow(state),
      markShown: () => persist({ ...state, lastShownAt: Date.now() }),
      recordPick: (mood, note) => {
        const clean = note?.trim() || undefined;
        logEvent('mood_check_in', { mood, backfill: false, hasNote: !!clean });
        persist({
          ...state,
          entries: { ...state.entries, [today]: { mood, note: clean, at: Date.now() } },
          lastShownAt: Date.now(),
        });
      },
      recordPickFor: (dateKey, mood, note) => {
        const clean = note?.trim() || undefined;
        logEvent('mood_check_in', { mood, backfill: dateKey !== today, hasNote: !!clean });
        persist({
          ...state,
          entries: { ...state.entries, [dateKey]: { mood, note: clean, at: Date.now() } },
          // Only bump the "shown today" clock for an actual today write, so a
          // back-fill of a past day doesn't suppress today's own prompt.
          lastShownAt: dateKey === today ? Date.now() : state.lastShownAt,
        });
      },
      entryFor: (dateKey) => state.entries[dateKey] ?? null,
    };
  }, [state, ready, promptVisible]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMoodCheckIn() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMoodCheckIn must be used inside MoodCheckInProvider');
  return ctx;
}
