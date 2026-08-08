import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '../services/firebase';
import { usePrayer } from './PrayerContext';
import { streakGuideEligible } from './streakGuide';
import { measureRefInWindow, type Rect } from './FirstRunTourContext';

// Rookie streak guide — the 2-step spotlight that fires after a user who has
// NEVER lit a full day completes exactly one of today's prayers (see
// state/streakGuide.ts for the rules). This context owns the stage machine and
// the plumbing between three parties:
//   • PrayerScreen  — hosts the trigger (coordinator slot) and registers the
//     way INTO the streak screen; its focus gates step 1.
//   • StreakScreen  — registers the milestone card's measurer + a way into the
//     prayer flow; its focus gates step 2.
//   • StreakGuideHost (app root) — draws the overlay for whichever step is up.
//
// Shown at most once per calendar day, and only while the user is still a
// rookie — the day she completes both prayers, this retires itself for good
// (eligibility reads totalComplete live).

const SHOWN_KEY = 'streakGuide:lastShown:v1';

export type StreakGuideStage = 'idle' | 'step1' | 'step2';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface StreakGuideState {
  ready: boolean;
  stage: StreakGuideStage;
  /** The trigger host's gate — everything but the coordinator's own rules. */
  eligibleNow: boolean;
  /** Coordinator granted the slot → show step 1 (burns today's once-flag). */
  begin: () => void;
  /** Step 1 "Continue" → step 2 + navigate to the streak screen. */
  advanceToStreak: () => void;
  /** Any exit: skip, back, final CTA, watchdog. */
  dismiss: (how: string) => void;

  // Focus flags — each step renders only over ITS OWN screen.
  setHomeFocused: (v: boolean) => void;
  setStreakFocused: (v: boolean) => void;
  homeFocused: boolean;
  streakFocused: boolean;

  // Screen-registered plumbing (FirstRunTourContext's handler-ref pattern).
  setOpenStreakHandler: (fn: () => void) => void;
  registerMilestoneMeasurer: (ref: React.RefObject<View | null>) => void;
  measureMilestone: () => Promise<Rect | null>;
  setStartPrayerHandler: (fn: (kind: 'morning' | 'evening') => void) => void;
  startPrayer: (kind: 'morning' | 'evening') => void;
}

const Ctx = createContext<StreakGuideState | null>(null);

export function StreakGuideProvider({ children }: { children: React.ReactNode }) {
  // No readiness flag on PrayerContext — and none needed: mDone/eDone and
  // totalComplete hydrate from the SAME snapshot, so pre-hydration they read
  // all-false/0, which simply fails the exactly-one-done check. Never a
  // wrong-fire, only a late one.
  const { totalComplete, mDone, eDone } = usePrayer();
  const [stage, setStage] = useState<StreakGuideStage>('idle');
  const [ready, setReady] = useState(false);
  const [lastShown, setLastShown] = useState<string | null>(null);
  const [homeFocused, setHomeFocused] = useState(false);
  const [streakFocused, setStreakFocused] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SHOWN_KEY)
      .then(v => setLastShown(v))
      .catch(() => setLastShown(todayYmd()))    // storage broken → never nag
      .finally(() => setReady(true));
  }, []);

  const eligibleNow =
    ready && stage === 'idle' &&
    streakGuideEligible(totalComplete, mDone, eDone, lastShown, todayYmd());

  const begin = useCallback(() => {
    setStage(s => {
      if (s !== 'idle') return s;
      // Burn today's flag the moment it becomes visible — a force-quit mid-guide
      // must not re-arm it the same day.
      const ymd = todayYmd();
      setLastShown(ymd);
      AsyncStorage.setItem(SHOWN_KEY, ymd).catch(() => {});
      logEvent('streak_guide_start', { remaining: mDone ? 'evening' : 'morning' });
      return 'step1';
    });
  }, [mDone]);

  const openStreakRef = useRef<(() => void) | null>(null);
  const setOpenStreakHandler = useCallback((fn: () => void) => { openStreakRef.current = fn; }, []);

  const advanceToStreak = useCallback(() => {
    setStage(s => {
      if (s !== 'step1') return s;
      logEvent('streak_guide_step', { step: 2 });
      return 'step2';
    });
    // Stage flips first: PrayerScreen's focus-loss dismissal only fires on
    // step1, so the navigation that follows cannot kill its own step 2.
    openStreakRef.current?.();
  }, []);

  const dismiss = useCallback((how: string) => {
    setStage(s => {
      if (s === 'idle') return s;
      logEvent('streak_guide_end', { how, at_step: s === 'step1' ? 1 : 2 });
      return 'idle';
    });
  }, []);

  const milestoneRef = useRef<React.RefObject<View | null> | null>(null);
  const registerMilestoneMeasurer = useCallback((ref: React.RefObject<View | null>) => {
    milestoneRef.current = ref;
  }, []);
  const measureMilestone = useCallback((): Promise<Rect | null> => {
    const ref = milestoneRef.current;
    return ref ? measureRefInWindow(ref) : Promise.resolve(null);
  }, []);

  const startPrayerRef = useRef<((kind: 'morning' | 'evening') => void) | null>(null);
  const setStartPrayerHandler = useCallback((fn: (kind: 'morning' | 'evening') => void) => {
    startPrayerRef.current = fn;
  }, []);
  const startPrayer = useCallback((kind: 'morning' | 'evening') => {
    startPrayerRef.current?.(kind);
  }, []);

  const value = useMemo<StreakGuideState>(() => ({
    ready, stage, eligibleNow, begin, advanceToStreak, dismiss,
    setHomeFocused, setStreakFocused, homeFocused, streakFocused,
    setOpenStreakHandler, registerMilestoneMeasurer, measureMilestone,
    setStartPrayerHandler, startPrayer,
  }), [ready, stage, eligibleNow, begin, advanceToStreak, dismiss,
       homeFocused, streakFocused,
       setOpenStreakHandler, registerMilestoneMeasurer, measureMilestone,
       setStartPrayerHandler, startPrayer]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStreakGuide(): StreakGuideState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStreakGuide must be used inside StreakGuideProvider');
  return ctx;
}
