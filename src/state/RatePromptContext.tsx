import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Hard-coded cadence rules:
// - First prompt: after the user finishes their first prayer ever.
// - User taps "No"   → never again.
// - User taps "Yes"  → trigger the in-app review, then ask again in 30 days.
//                      We can't read what rating they actually gave (Play /
//                      App Store APIs deliberately don't expose it), so we
//                      just keep the 30-day cadence until they tap "No".
// - User dismissed  → ask again in 7 days.
// - Once `markRated` is called (after a confirmed in-app review submission),
//   we stop forever.
const FIRST_DELAY_MS = 0;          // immediate after first prayer
const DISMISS_DELAY_MS = 7 * 86_400_000;
const YES_DELAY_MS = 30 * 86_400_000;

const STORAGE_KEY = 'ratePrompt:v1';

type Choice = 'none' | 'yes' | 'no';

interface Persisted {
  choice: Choice;            // last explicit choice (none = never chose, was just dismissed)
  lastShownAt: number;       // ms timestamp
  rated: boolean;            // user actually completed the in-app review
  promptCount: number;
}

const DEFAULT: Persisted = {
  choice: 'none',
  lastShownAt: 0,
  rated: false,
  promptCount: 0,
};

interface RatePromptState {
  ready: boolean;
  shouldAsk: () => boolean;       // call AFTER prayer to decide whether to show the sheet
  markShown: () => void;          // record that we displayed the sheet (for the dismissed cadence)
  markYes: () => void;            // user said yes (triggered review)
  markNo: () => void;             // user said no — never ask again
  markRated: () => void;          // confirmed they wrote a review
}

const Ctx = createContext<RatePromptState | null>(null);

export function RatePromptProvider({ children }: { children: React.ReactNode }) {
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

  const value = useMemo<RatePromptState>(() => ({
    ready,
    shouldAsk: () => {
      if (state.rated) return false;
      if (state.choice === 'no') return false;
      const now = Date.now();
      if (state.promptCount === 0) return now - state.lastShownAt >= FIRST_DELAY_MS;
      if (state.choice === 'yes') return now - state.lastShownAt >= YES_DELAY_MS;
      return now - state.lastShownAt >= DISMISS_DELAY_MS;
    },
    markShown: () => persist({ ...state, lastShownAt: Date.now(), promptCount: state.promptCount + 1 }),
    markYes:   () => persist({ ...state, choice: 'yes', lastShownAt: Date.now() }),
    markNo:    () => persist({ ...state, choice: 'no',  lastShownAt: Date.now() }),
    markRated: () => persist({ ...state, rated: true,   lastShownAt: Date.now() }),
  }), [state, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRatePrompt() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRatePrompt must be used inside RatePromptProvider');
  return ctx;
}
