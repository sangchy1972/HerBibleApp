import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '../services/firebase';
import { useOnboarding } from './OnboardingContext';

// First-run home tour: a 3-step spotlight that plays ONCE, the first time a
// brand-new user lands on the Prayer tab after finishing the questionnaire.
// It walks her through the Daily Rhythm bar → the streak flame → the verse card.
//
// This context owns only STATE and the anchor rects. PrayerScreen measures the
// three anchors and pushes them in; <FirstRunTourHost> renders the overlay.
//
// Three flags, and the difference matters:
//   • pending — owed but not on screen yet. True from the FIRST render after
//     hydration, before anything is measured or drawn. The nudge coordinator and
//     the mood check-in gate on this, so nothing can slip in front of the tour
//     during the ~700 ms measure window.
//   • active — on screen right now.
//   • ranThisSession — the tour played during THIS app session. The mood
//     check-in stays suppressed for the rest of the session (per user: a
//     brand-new user must not get the mood sheet on her first run at all — not
//     before the tour, and not chased right after it either).

const DONE_KEY = 'tour:home:done:v1';

export type TourAnchorId = 'rhythm' | 'streak' | 'verse';
export const TOUR_STEPS: TourAnchorId[] = ['rhythm', 'streak', 'verse'];

export interface Rect { x: number; y: number; w: number; h: number }

export type AnchorMeasurer = () => Promise<Rect | null>;

// Promise-wrapped measureInWindow. Resolves null for a missing/collapsed view
// (whose callback silently never fires — hence the timeout) or a zero rect.
export function measureRefInWindow(ref: React.RefObject<View | null>): Promise<Rect | null> {
  return new Promise(resolve => {
    const node = ref.current;
    if (!node) { resolve(null); return; }
    const cap = setTimeout(() => resolve(null), 200);
    node.measureInWindow((x, y, w, h) => {
      clearTimeout(cap);
      resolve(w > 0 && h > 0 ? { x, y, w, h } : null);
    });
  });
}

interface FirstRunTourState {
  ready: boolean;
  pending: boolean;
  active: boolean;
  ranThisSession: boolean;
  /** 0-based index into TOUR_STEPS. */
  step: number;
  anchors: Partial<Record<TourAnchorId, Rect>>;
  setAnchor: (id: TourAnchorId, r: Rect | null) => void;
  /** PrayerScreen registers a live re-measurer per anchor; the host calls it at
   *  every step so the hole tracks the CURRENT layout (window coordinates). */
  registerAnchorMeasurer: (id: TourAnchorId, fn: AnchorMeasurer) => void;
  measureAnchor: (id: TourAnchorId) => Promise<Rect | null>;
  /** PrayerScreen calls this once its anchors are measured and settled. */
  start: () => void;
  next: () => void;
  skip: () => void;
  /** Last step's CTA — same as skip, but reported separately. */
  finish: () => void;
  /** Give up before showing anything; does NOT burn the once-ever flag. */
  abort: () => void;
  /** PrayerScreen registers the way into the prayer flow; the host (which lives
   *  above the screen) fires it from the last step's CTA. */
  setStartPrayerHandler: (fn: () => void) => void;
  startPrayer: () => void;
}

const Ctx = createContext<FirstRunTourState | null>(null);

export function FirstRunTourProvider({ children }: { children: React.ReactNode }) {
  const { ready: obReady, done: obDone } = useOnboarding();
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(true);      // assume done until storage says otherwise
  const [active, setActive] = useState(false);
  const [ranThisSession, setRan] = useState(false);
  const [aborted, setAborted] = useState(false);
  const [step, setStep] = useState(0);
  const [anchors, setAnchors] = useState<Partial<Record<TourAnchorId, Rect>>>({});
  const startedRef = useRef(false);
  const measurersRef = useRef<Partial<Record<TourAnchorId, AnchorMeasurer>>>({});
  const registerAnchorMeasurer = useCallback((id: TourAnchorId, fn: AnchorMeasurer) => {
    measurersRef.current[id] = fn;
  }, []);
  const measureAnchor = useCallback((id: TourAnchorId): Promise<Rect | null> => {
    const fn = measurersRef.current[id];
    return fn ? fn().catch(() => null) : Promise.resolve(null);
  }, []);
  const startPrayerRef = useRef<(() => void) | null>(null);
  const setStartPrayerHandler = useCallback((fn: () => void) => { startPrayerRef.current = fn; }, []);
  const startPrayer = useCallback(() => { startPrayerRef.current?.(); }, []);

  useEffect(() => {
    AsyncStorage.getItem(DONE_KEY)
      .then(v => setDone(v === '1'))
      .catch(() => setDone(true))               // storage broken → never nag
      .finally(() => setReady(true));
  }, []);

  // EXISTING users have no `tour:home:done` key either — so an absent key alone
  // would fire the tour at everyone on the update that ships it. The tell is
  // WHEN onboarding completed: a brand-new user is still in the questionnaire
  // (obDone === false) when this provider hydrates and only flips true later; a
  // returning user is already done at hydration. So if onboarding is ALREADY
  // done the moment we read storage, quietly mark the tour as seen and never
  // show it. Only someone who finishes the questionnaire in THIS session is new.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!ready || !obReady || seededRef.current) return;
    seededRef.current = true;
    if (!done && obDone) {
      setDone(true);
      AsyncStorage.setItem(DONE_KEY, '1').catch(() => {});
    }
  }, [ready, obReady, done, obDone]);

  const pending = ready && !done && obReady && obDone && !active && !aborted;

  const setAnchor = useCallback((id: TourAnchorId, r: Rect | null) => {
    setAnchors(prev => {
      const cur = prev[id];
      if (!r) {
        if (!cur) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (cur && cur.x === r.x && cur.y === r.y && cur.w === r.w && cur.h === r.h) return prev;
      return { ...prev, [id]: r };
    });
  }, []);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStep(0);
    setActive(true);
    setRan(true);
    // Burn the once-ever flag the MOMENT it becomes visible, not on completion —
    // a crash or force-quit mid-tour must not trap a new user in a loop.
    setDone(true);
    AsyncStorage.setItem(DONE_KEY, '1').catch(() => {});
    logEvent('tour_home_start');
  }, []);

  const next = useCallback(() => {
    setStep(s => {
      const n = s + 1;
      if (n >= TOUR_STEPS.length) return s;
      logEvent('tour_home_step', { step: n + 1 });
      return n;
    });
  }, []);

  const skip = useCallback(() => {
    setActive(false);
    logEvent('tour_home_skip', { step: step + 1 });
  }, [step]);

  const finish = useCallback(() => {
    setActive(false);
    logEvent('tour_home_finish');
  }, []);

  // Nothing measurable → walk away quietly. `aborted` drops the gate so the rest
  // of the app's prompts aren't suppressed for the whole session, and the
  // once-ever flag stays UNSET so the tour gets another shot on the next start.
  const abort = useCallback(() => {
    startedRef.current = true;   // but don't retry within this session
    setAborted(true);
    setActive(false);
  }, []);

  const value = useMemo<FirstRunTourState>(() => ({
    ready, pending, active, ranThisSession, step, anchors,
    setAnchor, registerAnchorMeasurer, measureAnchor,
    start, next, skip, finish, abort, setStartPrayerHandler, startPrayer,
  }), [ready, pending, active, ranThisSession, step, anchors,
       setAnchor, registerAnchorMeasurer, measureAnchor,
       start, next, skip, finish, abort, setStartPrayerHandler, startPrayer]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFirstRunTour(): FirstRunTourState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFirstRunTour must be used inside FirstRunTourProvider');
  return ctx;
}
