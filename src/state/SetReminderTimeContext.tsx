import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cadence for the "set your prayer reminders" nudge. The HOST gates on
// "notifications still OFF + onboarding done"; this context only owns the
// timing. First prompt ~20h after we first became eligible (so it never lands in
// the same session the user just declined during onboarding), then ONCE A DAY
// for as long as notifications stay off (owner 2026-08-08 — it used to escalate
// 3,4,5,6,7 days, which the owner judged far too slow). It does NOT stop once
// she has picked her times — see setReminderShouldShow for why.
//
// The permission side is genuinely live, not cached: NotificationsContext
// re-reads getPermissionsAsync() on every foreground, so a user who grants and
// later REVOKES in system settings comes back into scope automatically.

const STORAGE_KEY = 'setReminderNudge:v1';
const FIRST_DELAY_MS = 20 * 3_600_000;   // ~20h after the baseline

const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface SetReminderPersisted {
  baselineAt: number;   // ms when first eligible (0 = not tracking yet)
  lastShownAt: number;
  promptCount: number;
  configured: boolean;
}
const DEFAULT: SetReminderPersisted = { baselineAt: 0, lastShownAt: 0, promptCount: 0, configured: false };

// Pure decision — exported for tests.
//
// `configured` deliberately does NOT stop this any more (owner 2026-08-09). It
// means one thing only: she has chosen her times, so never ask her to choose
// them again — that was the "why is it asking me twice" complaint. It says
// nothing about the OS permission, and the host is gated on `!permissionGranted`,
// so while notifications are off this keeps coming back daily and asks for the
// PERMISSION instead. Two different questions; only the first one is answered.
export function setReminderShouldShow(s: SetReminderPersisted, now = Date.now()): boolean {
  if (s.baselineAt === 0) return false;
  if (s.promptCount === 0) return now - s.baselineAt >= FIRST_DELAY_MS;
  // Daily, and at most once a day — compared on the LOCAL CALENDAR DAY, not on
  // a rolling 24h window: a 24h gap drifts later every day (10:00 → 10:05 → …)
  // until it lands outside her usual session and the ask silently stops.
  return ymdOf(new Date(s.lastShownAt)) !== ymdOf(new Date(now));
}

interface State {
  ready: boolean;
  shouldShow: () => boolean;
  /** Has she already chosen her times? Gates the TIME half of the ask only —
   *  the permission half keeps coming back while notifications are off. */
  configured: boolean;
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
    configured: state.configured,
    markConfigured: () => persist({ ...state, configured: true }),
  }), [state, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSetReminderTime(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSetReminderTime must be used inside SetReminderTimeProvider');
  return ctx;
}
