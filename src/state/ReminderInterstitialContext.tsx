import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';

// Gating for the full-screen "Follow Him" notification opt-in shown to
// RETURNING users. Rule (per product):
//   show once per day, on a returning user's first app-open of the day,
//   ONLY while notifications are still disabled.
//     • Continue → grants notifications → never shows again.
//     • Skip     → notifications stay off → shows again next return day.
// New users (still in onboarding) never see it — RootNavigator ANDs this
// with `onboarding.done`.
//
//   shouldShow = ready
//             && firstLaunchDay != null
//             && today !== firstLaunchDay   // not their very first day
//             && lastShownDay !== today     // not already shown today
//             && !notificationsGranted      // still off

// Reuse the first-launch date DailyVersesContext already persists — it's
// the user's true first-open day, so existing users get the screen on
// their next return and brand-new users only from day 2. (Read-only here.)
const FIRST_LAUNCH_KEY = 'daily-verses:first-launch-date';
const LAST_SHOWN_KEY = 'reminder-optin:last-shown-day:v1';

interface State {
  ready: boolean;
  shouldShow: boolean;
  /** Call after the user interacts (Continue or Skip) — records today so it
   *  won't re-show until tomorrow (and never if notifications got granted). */
  markShownToday: () => void;
}

const Ctx = createContext<State | null>(null);

export function ReminderInterstitialProvider({ children }: { children: React.ReactNode }) {
  const today = useCurrentDayYmd();
  const [ready, setReady] = useState(false);
  const [firstLaunchDay, setFirstLaunchDay] = useState<string | null>(null);
  const [lastShownDay, setLastShownDay] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);

  // Read persisted dates + live permission status once on mount, and again
  // whenever the calendar day rolls over (so a user who leaves the app open
  // across midnight is re-evaluated for the next day).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [first, shown] = await Promise.all([
          AsyncStorage.getItem(FIRST_LAUNCH_KEY),
          AsyncStorage.getItem(LAST_SHOWN_KEY),
        ]);
        if (cancelled) return;
        setFirstLaunchDay(first);
        setLastShownDay(shown);
      } catch { /* leave nulls → won't show */ }
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (!cancelled) setNotifGranted(!!perm.granted);
      } catch { /* assume not granted */ }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [today]);

  const markShownToday = useCallback(() => {
    setLastShownDay(today);
    AsyncStorage.setItem(LAST_SHOWN_KEY, today).catch(() => {});
    // Re-read permission — the user may have just granted it via Continue,
    // which (with the new lastShownDay) keeps shouldShow false going forward.
    Notifications.getPermissionsAsync()
      .then(p => setNotifGranted(!!p.granted))
      .catch(() => {});
  }, [today]);

  const shouldShow = useMemo(() => (
    ready
    && !!firstLaunchDay
    && today !== firstLaunchDay
    && lastShownDay !== today
    && !notifGranted
  ), [ready, firstLaunchDay, today, lastShownDay, notifGranted]);

  const value = useMemo<State>(() => ({ ready, shouldShow, markShownToday }), [ready, shouldShow, markShownToday]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminderInterstitial(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReminderInterstitial must be used inside ReminderInterstitialProvider');
  return ctx;
}
