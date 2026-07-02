import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cadence for the "set your prayer reminders" nudge. The HOST gates on
// "notifications still OFF + onboarding done"; this context only owns the
// timing so we re-ask without nagging. First prompt ~20h after we first became
// eligible (so it never lands in the same session the user just declined during
// onboarding), then an escalating gap 3,4,5,6,7 capped at 7 days. Once the user
// completes the setup once (`configured`) we never nag again.

const STORAGE_KEY = 'setReminderNudge:v1';
const DAY_MS = 86_400_000;
const FIRST_DELAY_MS = 20 * 3_600_000;   // ~20h after the baseline

export interface SetReminderPersisted {
  baselineAt: number;   // ms when first eligible (0 = not tracking yet)
  lastShownAt: number;
  promptCount: number;
  configured: boolean;
}
const DEFAULT: SetReminderPersisted = { baselineAt: 0, lastShownAt: 0, promptCount: 0, configured: false };

// Pure decision — exported for tests.
export function setReminderShouldShow(s: SetReminderPersisted, now = Date.now()): boolean {
  if (s.configured) return false;
  if (s.baselineAt === 0) return false;
  if (s.promptCount === 0) return now - s.baselineAt >= FIRST_DELAY_MS;
  const gapDays = Math.min(7, 2 + s.promptCount);   // 3,4,5,6,7 …
  return now - s.lastShownAt >= gapDays * DAY_MS;
}

interface State {
  ready: boolean;
  shouldShow: () => boolean;
  /** Anchor the cadence baseline the first time the nudge becomes eligible. */
  noteEligible: () => void;
  markShown: () => void;
  markConfigured: () => void;
}

const Ctx = createContext<State | null>(null);

export function SetReminderTimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SetReminderPersisted>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setState({ ...DEFAULT, ...JSON.parse(raw) }); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persist = (next: SetReminderPersisted) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<State>(() => ({
    ready,
    shouldShow: () => setReminderShouldShow(state),
    noteEligible: () => { if (state.baselineAt === 0) persist({ ...state, baselineAt: Date.now() }); },
    markShown: () => persist({ ...state, lastShownAt: Date.now(), promptCount: state.promptCount + 1 }),
    markConfigured: () => persist({ ...state, configured: true }),
  }), [state, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSetReminderTime(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSetReminderTime must be used inside SetReminderTimeProvider');
  return ctx;
}
