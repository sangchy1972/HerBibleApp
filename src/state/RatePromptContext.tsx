import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cadence rules (per product, denser re-ask):
// - First prompt: right after the user finishes their first prayer ever.
// - "Yes"      → trigger the in-app review, then NEVER ask again.
// - "No"       → ask again in ~30 days (and keep the 30-day cadence).
// - Dismissed  → escalating gap: 3, 4, 5, 6, 7 … capped at 15 days.
// - `markRated` (confirmed review submitted) → stop forever.
const NO_DELAY_MS = 30 * 86_400_000;   // No → ~30 days
const DAY_MS = 86_400_000;

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

// Pure cadence decision — exported so it can be unit-tested without React.
export function rateShouldAsk(
  s: Pick<Persisted, 'rated' | 'choice' | 'lastShownAt' | 'promptCount'>,
  now = Date.now(),
): boolean {
  if (s.rated) return false;
  if (s.choice === 'yes') return false;                       // Yes → never again
  if (s.promptCount === 0) return true;                        // first time (after first prayer)
  if (s.choice === 'no') return now - s.lastShownAt >= NO_DELAY_MS;   // No → 30 days
  const gapDays = Math.min(15, 2 + s.promptCount);             // dismissed → 3,4,5,…,15
  return now - s.lastShownAt >= gapDays * DAY_MS;
}

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
    shouldAsk: () => rateShouldAsk(state),
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
