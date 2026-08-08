import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '../services/firebase';
import { measureRefInWindow, type Rect } from './FirstRunTourContext';
import {
  planGuideSteps, planGuideEligibleFromHome, planGuideEligibleSelf,
  type PlanGuideEntry, type PlanGuideStep,
} from './planGuide';

// Plan-discovery guide — the stage machine and the plumbing between four
// parties (rules in state/planGuide.ts):
//   • PrayerScreen — hosts the home trigger; its focus gates the 'tab' step;
//     registers the way onto the Plan tab.
//   • TabBar      — registers the Plan icon's measurer (the 'tab' anchor).
//   • PlanScreen  — marks the tab visited, hosts the self trigger, registers
//     the Explore pill + mood-row measurers, the segment switcher and the
//     scroll-into-view; its focus gates the 'explore'/'mood' steps.
//   • PlanGuideHost (app root) — draws whichever step is up.
//
// ONCE EVER: the done flag burns the moment step 1 becomes visible.

const DONE_KEY = 'planGuide:done:v1';
const VISITED_KEY = 'plan:visited:v1';

export type PlanGuideStage = 'idle' | PlanGuideStep;

interface PlanGuideState {
  ready: boolean;
  stage: PlanGuideStage;
  entry: PlanGuideEntry;
  /** Home-trigger gate (minus what the coordinator adds). ctaQuiet comes from
   *  the screen — the guide fires only while the prayer CTA isn't the target. */
  eligibleFromHome: (ctaQuiet: boolean) => boolean;
  eligibleSelf: boolean;
  begin: (entry: PlanGuideEntry) => void;
  /** Advance: tab → explore (+ open the Plan tab), explore → mood (+ switch
   *  the segment and scroll the row into view), mood → finish. */
  next: () => void;
  dismiss: (how: string) => void;

  /** PlanScreen calls this on every focus — kills the home nudge for good. */
  markPlanVisited: () => void;

  setHomeFocused: (v: boolean) => void;
  setPlanFocused: (v: boolean) => void;
  homeFocused: boolean;
  planFocused: boolean;

  // Screen/bar-registered plumbing (the tour's handler-ref pattern).
  registerPlanTabMeasurer: (ref: React.RefObject<View | null>) => void;
  measurePlanTab: () => Promise<Rect | null>;
  registerExploreMeasurer: (ref: React.RefObject<View | null>) => void;
  measureExplore: () => Promise<Rect | null>;
  registerMoodMeasurer: (ref: React.RefObject<View | null>) => void;
  measureMood: () => Promise<Rect | null>;
  setOpenPlanTabHandler: (fn: () => void) => void;
  setShowExploreHandler: (fn: () => void) => void;
  setRevealMoodHandler: (fn: () => Promise<void>) => void;
}

const Ctx = createContext<PlanGuideState | null>(null);

export function PlanGuideProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(true);          // assume done until storage says otherwise
  // Synchronous mirror, for the same reason StreakGuideContext keeps one.
  const doneRef = useRef(true);
  doneRef.current = done;
  const [visited, setVisited] = useState(true);    // same safe default
  const [stage, setStage] = useState<PlanGuideStage>('idle');
  const [entry, setEntry] = useState<PlanGuideEntry>('home');
  // Synchronous stage mirror — see StreakGuideContext: side effects never live
  // inside setState updaters, and transitions never read a stale stage.
  const stageRef = useRef<PlanGuideStage>('idle');
  const go = useCallback((next: PlanGuideStage) => {
    stageRef.current = next;
    setStage(next);
  }, []);
  const [homeFocused, setHomeFocused] = useState(false);
  const [planFocused, setPlanFocused] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(DONE_KEY).catch(() => '1'),
      AsyncStorage.getItem(VISITED_KEY).catch(() => '1'),
    ]).then(([d, v]) => {
      setDone(d === '1');
      setVisited(v === '1');
    }).finally(() => setReady(true));
  }, []);

  const markPlanVisited = useCallback(() => {
    setVisited(prev => {
      if (prev) return prev;
      AsyncStorage.setItem(VISITED_KEY, '1').catch(() => {});
      return true;
    });
  }, []);

  const begin = useCallback((e: PlanGuideEntry) => {
    if (stageRef.current !== 'idle') return;
    // ALSO guard on the once-ever flag — a trigger can remount while the slot is
    // still granted (see StreakGuideContext.begin) and replay the guide.
    if (doneRef.current) return;
    setEntry(e);
    // Once ever — burn on display so a crash mid-guide can't loop it.
    doneRef.current = true;
    setDone(true);
    AsyncStorage.setItem(DONE_KEY, '1').catch(() => {});
    logEvent('plan_guide_start', { entry: e });
    go(planGuideSteps(e)[0]);
  }, [go]);

  const openPlanTabRef = useRef<(() => void) | null>(null);
  const showExploreRef = useRef<(() => void) | null>(null);
  const revealMoodRef = useRef<(() => Promise<void>) | null>(null);
  const setOpenPlanTabHandler = useCallback((fn: () => void) => { openPlanTabRef.current = fn; }, []);
  const setShowExploreHandler = useCallback((fn: () => void) => { showExploreRef.current = fn; }, []);
  const setRevealMoodHandler = useCallback((fn: () => Promise<void>) => { revealMoodRef.current = fn; }, []);

  const next = useCallback(() => {
    const s = stageRef.current;
    if (s === 'tab') {
      logEvent('plan_guide_step', { step: 'explore' });
      // Stage flips first, then the navigation — the home focus-loss
      // dismissal only fires on 'tab', so it cannot kill its own hand-off.
      go('explore');
      openPlanTabRef.current?.();
      return;
    }
    if (s === 'explore') {
      logEvent('plan_guide_step', { step: 'mood' });
      // Switch the segment, then bring the mood row into view. The host's
      // measure-retry loop tolerates however long the scroll takes.
      go('mood');
      showExploreRef.current?.();
      revealMoodRef.current?.().catch(() => {});
      return;
    }
    if (s === 'mood') {
      logEvent('plan_guide_end', { how: 'finish', at_step: 'mood' });
      go('idle');
    }
  }, [go]);

  const dismiss = useCallback((how: string) => {
    const s = stageRef.current;
    if (s === 'idle') return;
    logEvent('plan_guide_end', { how, at_step: s });
    go('idle');
  }, [go]);

  const planTabRef = useRef<React.RefObject<View | null> | null>(null);
  const exploreRef = useRef<React.RefObject<View | null> | null>(null);
  const moodRef = useRef<React.RefObject<View | null> | null>(null);
  const registerPlanTabMeasurer = useCallback((r: React.RefObject<View | null>) => { planTabRef.current = r; }, []);
  const registerExploreMeasurer = useCallback((r: React.RefObject<View | null>) => { exploreRef.current = r; }, []);
  const registerMoodMeasurer = useCallback((r: React.RefObject<View | null>) => { moodRef.current = r; }, []);
  const measurePlanTab = useCallback(() => (planTabRef.current ? measureRefInWindow(planTabRef.current) : Promise.resolve(null)), []);
  const measureExplore = useCallback(() => (exploreRef.current ? measureRefInWindow(exploreRef.current) : Promise.resolve(null)), []);
  const measureMood = useCallback(() => (moodRef.current ? measureRefInWindow(moodRef.current) : Promise.resolve(null)), []);

  const eligibleFromHome = useCallback(
    (ctaQuiet: boolean) => ready && stage === 'idle' && planGuideEligibleFromHome(done, visited, ctaQuiet),
    [ready, stage, done, visited],
  );
  const eligibleSelf = ready && stage === 'idle' && planGuideEligibleSelf(done);

  const value = useMemo<PlanGuideState>(() => ({
    ready, stage, entry, eligibleFromHome, eligibleSelf, begin, next, dismiss,
    markPlanVisited, setHomeFocused, setPlanFocused, homeFocused, planFocused,
    registerPlanTabMeasurer, measurePlanTab,
    registerExploreMeasurer, measureExplore,
    registerMoodMeasurer, measureMood,
    setOpenPlanTabHandler, setShowExploreHandler, setRevealMoodHandler,
  }), [ready, stage, entry, eligibleFromHome, eligibleSelf, begin, next, dismiss,
       markPlanVisited, homeFocused, planFocused,
       registerPlanTabMeasurer, measurePlanTab,
       registerExploreMeasurer, measureExplore,
       registerMoodMeasurer, measureMood,
       setOpenPlanTabHandler, setShowExploreHandler, setRevealMoodHandler]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanGuide(): PlanGuideState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanGuide must be used inside PlanGuideProvider');
  return ctx;
}
