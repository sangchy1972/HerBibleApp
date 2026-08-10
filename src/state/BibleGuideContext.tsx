import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent, setUserProps } from '../services/firebase';
import { measureRefInWindow, type Rect } from './FirstRunTourContext';
import {
  bibleGuideNext, bibleGuideAfterDrawer, bibleGuideEligible, type BibleGuideStep,
} from './bibleGuide';

// Bible-reader guide — the stage machine and the plumbing between three parties
// (rules in state/bibleGuide.ts):
//   • BibleScreen        registers the five anchor measurers, reports focus,
//                        chapter-readiness and drawer state, and owns the two
//                        stage effects the tour needs from it (open the verse
//                        toolbar, scroll to the Mark-as-Complete CTA).
//   • BibleGuideTrigger  hosted by BibleScreen; takes the coordinator slot.
//   • BibleGuideHost     app root; draws whichever step is up.
//
// ONCE EVER: the done flag burns the moment step 1 becomes visible.

const DONE_KEY = 'bibleGuide:done:v1';

export type BibleGuideStage = 'idle' | BibleGuideStep;

interface BibleGuideState {
  ready: boolean;
  stage: BibleGuideStage;
  eligible: boolean;
  begin: () => void;
  next: () => void;
  dismiss: (how: string) => void;

  /** Gates rendering + measuring; also ends the tour if she leaves the tab. */
  setBibleFocused: (v: boolean) => void;
  bibleFocused: boolean;
  /** The chapter has verses on screen. Anchors 2–5 do not exist without them. */
  setChapterReady: (v: boolean) => void;
  /** The book drawer is open — it paints OVER the overlay, so the guide hides. */
  setDrawerOpen: (v: boolean) => void;
  drawerOpen: boolean;

  registerToolsMeasurer: (ref: React.RefObject<View | null>) => void;
  registerBooksMeasurer: (ref: React.RefObject<View | null>) => void;
  registerAudioMeasurer: (ref: React.RefObject<View | null>) => void;
  registerVerseBarMeasurer: (ref: React.RefObject<View | null>) => void;
  registerCompleteMeasurer: (ref: React.RefObject<View | null>) => void;
  measureFor: (step: BibleGuideStep) => Promise<Rect | null>;

  /** Opens the real verse toolbar on verse 1 (step 4's anchor must exist). */
  setRevealVerseBarHandler: (fn: () => Promise<void>) => void;
  /** Closes it again — the toolbar must not outlive the step that opened it. */
  setHideVerseBarHandler: (fn: () => void) => void;
  /** Animated scroll to the bottom of the chapter (step 5). */
  setScrollToCompleteHandler: (fn: () => Promise<void>) => void;
}

const Ctx = createContext<BibleGuideState | null>(null);

export function BibleGuideProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(true);          // assume done until storage says otherwise
  // Synchronous mirror — begin() must not read a stale flag through a batched
  // setState and hand out the once-ever tour twice (see StreakGuideContext).
  const doneRef = useRef(true);
  doneRef.current = done;
  const [stage, setStage] = useState<BibleGuideStage>('idle');
  const stageRef = useRef<BibleGuideStage>('idle');
  const go = useCallback((next: BibleGuideStage) => {
    stageRef.current = next;
    setStage(next);
  }, []);
  const [bibleFocused, setBibleFocused] = useState(false);
  const [chapterReady, setChapterReady] = useState(false);
  const [drawerOpen, setDrawerOpenState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DONE_KEY)
      .then(d => setDone(d === '1'))
      .catch(() => setDone(true))               // unreadable storage → behave as seen
      .finally(() => setReady(true));
  }, []);

  // ── Anchors ───────────────────────────────────────────────────────────────
  const toolsRef = useRef<React.RefObject<View | null> | null>(null);
  const booksRef = useRef<React.RefObject<View | null> | null>(null);
  const audioRef = useRef<React.RefObject<View | null> | null>(null);
  const verseBarRef = useRef<React.RefObject<View | null> | null>(null);
  const completeRef = useRef<React.RefObject<View | null> | null>(null);
  const registerToolsMeasurer = useCallback((r: React.RefObject<View | null>) => { toolsRef.current = r; }, []);
  const registerBooksMeasurer = useCallback((r: React.RefObject<View | null>) => { booksRef.current = r; }, []);
  const registerAudioMeasurer = useCallback((r: React.RefObject<View | null>) => { audioRef.current = r; }, []);
  const registerVerseBarMeasurer = useCallback((r: React.RefObject<View | null>) => { verseBarRef.current = r; }, []);
  const registerCompleteMeasurer = useCallback((r: React.RefObject<View | null>) => { completeRef.current = r; }, []);

  const measureFor = useCallback((step: BibleGuideStep) => {
    const box = step === 'tools' ? toolsRef.current
      : step === 'books' ? booksRef.current
      : step === 'audio' ? audioRef.current
      : step === 'verse' ? verseBarRef.current
      : completeRef.current;
    return box ? measureRefInWindow(box) : Promise.resolve(null);
  }, []);

  // ── Screen effects the tour drives ────────────────────────────────────────
  const revealVerseBarRef = useRef<(() => Promise<void>) | null>(null);
  const hideVerseBarRef = useRef<(() => void) | null>(null);
  const scrollToCompleteRef = useRef<(() => Promise<void>) | null>(null);
  const setRevealVerseBarHandler = useCallback((fn: () => Promise<void>) => { revealVerseBarRef.current = fn; }, []);
  const setHideVerseBarHandler = useCallback((fn: () => void) => { hideVerseBarRef.current = fn; }, []);
  const setScrollToCompleteHandler = useCallback((fn: () => Promise<void>) => { scrollToCompleteRef.current = fn; }, []);

  /** Enter a step and run whatever the screen has to do for its anchor to exist. */
  const enter = useCallback((step: BibleGuideStep) => {
    go(step);
    logEvent('bible_guide_step', { step });
    if (step === 'verse') { revealVerseBarRef.current?.().catch(() => {}); return; }
    if (step === 'complete') {
      // The toolbar would otherwise ride the scroll down under the scrim, and a
      // stray selection left behind after the tour is a bug she'd have to undo.
      hideVerseBarRef.current?.();
      scrollToCompleteRef.current?.().catch(() => {});
    }
  }, [go]);

  const finish = useCallback((how: string) => {
    const at = stageRef.current;
    if (at === 'idle') return;
    hideVerseBarRef.current?.();
    logEvent('bible_guide_end', { how, at_step: at });
    go('idle');
  }, [go]);

  const begin = useCallback(() => {
    if (stageRef.current !== 'idle') return;
    // Guard the once-ever flag here too: a trigger can remount while the slot is
    // still granted and replay the tour (the bug PlanGuideContext.begin carries
    // the same guard for).
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    AsyncStorage.setItem(DONE_KEY, '1').catch(() => {});
    logEvent('bible_guide_start', {});
    // A segment for "did she ever get taught the reader", answerable without
    // counting distinct users on an event.
    setUserProps({ bible_guide_seen: 'yes' });
    enter('tools');
  }, [enter]);

  const next = useCallback(() => {
    const at = stageRef.current;
    if (at === 'idle') return;
    const to = bibleGuideNext(at);
    if (!to) { finish('finish'); return; }
    enter(to);
  }, [enter, finish]);

  // Leaving the tab mid-tour ends it. It is once-ever and already burned, so it
  // does not come back — the alternative is a scrim waiting on a screen she is
  // no longer looking at, resumed minutes later with no context.
  useEffect(() => {
    if (!bibleFocused && stageRef.current !== 'idle') finish('left_bible');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bibleFocused]);

  // The drawer closing during the 'books' step IS that step succeeding — she
  // used the control it highlighted. Advance instead of re-teaching it.
  //
  // The transition runs OUTSIDE the setState updater, against a synchronous ref
  // mirror. An updater must stay pure: React is free to call it twice, and this
  // one would then log the event twice and re-enter the step.
  const drawerOpenRef = useRef(false);
  const setDrawerOpen = useCallback((v: boolean) => {
    if (drawerOpenRef.current === v) return;
    drawerOpenRef.current = v;
    setDrawerOpenState(v);
    if (v) return;
    const to = bibleGuideAfterDrawer(stageRef.current);
    if (to === 'idle') finish('finish');
    else if (to) {
      logEvent('bible_guide_books_used', {});
      enter(to);
    }
  }, [enter, finish]);

  const eligible = ready && stage === 'idle' && bibleGuideEligible(done, chapterReady);

  const value = useMemo<BibleGuideState>(() => ({
    ready, stage, eligible, begin, next, dismiss: finish,
    setBibleFocused, bibleFocused, setChapterReady, setDrawerOpen, drawerOpen,
    registerToolsMeasurer, registerBooksMeasurer, registerAudioMeasurer,
    registerVerseBarMeasurer, registerCompleteMeasurer, measureFor,
    setRevealVerseBarHandler, setHideVerseBarHandler, setScrollToCompleteHandler,
  }), [ready, stage, eligible, begin, next, finish, bibleFocused, setDrawerOpen, drawerOpen,
       registerToolsMeasurer, registerBooksMeasurer, registerAudioMeasurer,
       registerVerseBarMeasurer, registerCompleteMeasurer, measureFor,
       setRevealVerseBarHandler, setHideVerseBarHandler, setScrollToCompleteHandler]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBibleGuide(): BibleGuideState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBibleGuide must be used inside BibleGuideProvider');
  return ctx;
}
