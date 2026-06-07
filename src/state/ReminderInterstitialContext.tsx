import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';

// Gating for the full-screen "Follow Him" notification opt-in shown to
// RETURNING users. Rule (per product, 2026-06):
//   • Day 1 (the user's very first day) → never shows. First open shows
//     only the brand welcome splash (OnboardingScreen).
//   • From day 2 on, while notifications are still disabled, the screen
//     may show up to TWICE per day — once in the daytime window and once
//     in the evening window. These windows match FollowHimScreen's
//     day/night background art (03:00–18:00 = day, otherwise night), so
//     the morning visit gets the sunrise frame and the evening visit the
//     dusk frame.
//   • Each window shows at most once: Continue or Skip records the
//     current day+window slot, which suppresses re-shows until the next
//     window (or next day).
//   • Once notifications are granted it never shows again.
//
//   shouldShow = ready
//             && firstLaunchDay != null
//             && today !== firstLaunchDay   // not their very first day
//             && lastShownSlot !== currentSlot // this window not used yet
//             && !notificationsGranted      // still off

// Reuse the first-launch date DailyVersesContext already persists — it's
// the user's true first-open day, so existing users get the screen on
// their next return and brand-new users only from day 2. (Read-only here.)
const FIRST_LAUNCH_KEY = 'daily-verses:first-launch-date';
// v2: value is now `YYYY-MM-DD:day` / `YYYY-MM-DD:night` (one slot per
// window) instead of v1's bare YYYY-MM-DD (one slot per day).
const LAST_SHOWN_KEY = 'reminder-optin:last-shown-slot:v2';

// Day/night windows — MUST mirror FollowHimScreen's pickBackground cutoffs
// so the slot we record always matches the artwork the user actually saw.
const DAY_START = 3;   // 03:00
const DAY_END = 18;    // 18:00 (6 pm)
function currentWindow(): 'day' | 'night' {
  const h = new Date().getHours();
  return h >= DAY_START && h < DAY_END ? 'day' : 'night';
}

interface State {
  ready: boolean;
  shouldShow: boolean;
  /** Call after the user interacts (Continue or Skip) — records the current
   *  day+window slot so it won't re-show until the next window (and never
   *  again once notifications are granted). */
  markShownToday: () => void;
}

const Ctx = createContext<State | null>(null);

export function ReminderInterstitialProvider({ children }: { children: React.ReactNode }) {
  const today = useCurrentDayYmd();
  const [ready, setReady] = useState(false);
  const [firstLaunchDay, setFirstLaunchDay] = useState<string | null>(null);
  const [lastShownSlot, setLastShownSlot] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);
  // The day+window slot we're currently in, e.g. "2026-06-07:night".
  // Refreshed on mount and every return to foreground so an evening
  // re-open after a morning show re-arms the gate.
  const [slot, setSlot] = useState<string>(() => `${today}:${currentWindow()}`);

  // Keep the slot in sync: foreground transitions catch "reopened the app
  // in the evening"; the `today` dep catches midnight rollover (the hook
  // already refreshes on both foreground and a midnight timer).
  useEffect(() => {
    const refresh = () => setSlot(`${today}:${currentWindow()}`);
    refresh();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [today]);

  // Read persisted state + live permission status once on mount, and again
  // whenever the day rolls over (so a user who leaves the app open across
  // midnight is re-evaluated for the next day).
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
        setLastShownSlot(shown);
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
    setLastShownSlot(slot);
    AsyncStorage.setItem(LAST_SHOWN_KEY, slot).catch(() => {});
    // Re-read permission — the user may have just granted it via Continue,
    // which keeps shouldShow false in every future window.
    Notifications.getPermissionsAsync()
      .then(p => setNotifGranted(!!p.granted))
      .catch(() => {});
  }, [slot]);

  const shouldShow = useMemo(() => (
    ready
    && !!firstLaunchDay
    && today !== firstLaunchDay
    && lastShownSlot !== slot
    && !notifGranted
  ), [ready, firstLaunchDay, today, lastShownSlot, slot, notifGranted]);

  const value = useMemo<State>(() => ({ ready, shouldShow, markShownToday }), [ready, shouldShow, markShownToday]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminderInterstitial(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReminderInterstitial must be used inside ReminderInterstitialProvider');
  return ctx;
}
