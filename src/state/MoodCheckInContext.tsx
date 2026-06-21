import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Mood } from '../components/MoodEmoji';
import { logEvent } from '../services/firebase';

const STORAGE_KEY = 'mood:v1';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Persisted {
  picks: Record<string, Mood>;       // 'YYYY-MM-DD' → mood
  lastShownAt: number;               // ms timestamp of last time the flow opened
}

const DEFAULT: Persisted = { picks: {}, lastShownAt: 0 };

interface MoodCheckInState {
  ready: boolean;
  picks: Record<string, Mood>;
  todayMood: Mood | null;
  totalCheckIns: number;
  shouldShow: () => boolean;
  markShown: () => void;
  recordPick: (mood: Mood) => void;
  /** Record (or change) the mood for an arbitrary day — powers make-up
   *  check-ins / editing a past day from the calendar. `dateKey` is YYYY-MM-DD. */
  recordPickFor: (dateKey: string, mood: Mood) => void;
}

const Ctx = createContext<MoodCheckInState | null>(null);

export function MoodCheckInProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setState({ ...DEFAULT, ...JSON.parse(raw) }); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persist = (next: Persisted) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<MoodCheckInState>(() => {
    const today = todayKey();
    return {
      ready,
      picks: state.picks,
      todayMood: state.picks[today] ?? null,
      totalCheckIns: Object.keys(state.picks).length,
      shouldShow: () => {
        // Already picked today → never show again until tomorrow.
        if (state.picks[today]) return false;
        // First time ever, or first time today: show.
        const last = new Date(state.lastShownAt || 0);
        const lastKey = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
        if (state.lastShownAt === 0 || lastKey !== today) return true;
        // Already shown today and skipped — only re-show after 8 hours.
        return Date.now() - state.lastShownAt >= EIGHT_HOURS_MS;
      },
      markShown: () => persist({ ...state, lastShownAt: Date.now() }),
      recordPick: (mood) => {
        logEvent('mood_check_in', { mood });
        persist({
          ...state,
          picks: { ...state.picks, [today]: mood },
          lastShownAt: Date.now(),
        });
      },
      recordPickFor: (dateKey, mood) => {
        logEvent('mood_check_in', { mood, backfill: dateKey !== today });
        persist({
          ...state,
          picks: { ...state.picks, [dateKey]: mood },
          // Only bump the "shown today" clock when it's actually today, so a
          // back-fill of a past day doesn't suppress today's own prompt.
          lastShownAt: dateKey === today ? Date.now() : state.lastShownAt,
        });
      },
    };
  }, [state, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMoodCheckIn() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMoodCheckIn must be used inside MoodCheckInProvider');
  return ctx;
}
