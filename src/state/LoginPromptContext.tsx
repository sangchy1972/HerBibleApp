import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useAchievements } from './AchievementsContext';
import { useNotes } from './NotesContext';
import { useHighlights } from './HighlightsContext';
import { useOnboarding } from './OnboardingContext';
import { logEvent } from '../services/firebase';

// Soft login nudges. The onboarding flow already shows a dedicated login screen
// at the end (logged there as login_prompt_shown {trigger:'onboarding'}). THIS
// context drives the POST-onboarding reminders, gated so we never nag:
//   • one-time triggers — first badge, first note, first highlight, day-1 open;
//   • a periodic nudge on later opens;
//   • NEVER while onboarding is still in progress, and the open-triggered
//     day1/periodic nudge NEVER in the same session onboarding finished
//     (the user just answered the dedicated login step moments ago);
//   • NEVER more than once per 3 days (across all triggers);
//   • NEVER once the user is signed in.
// Each shown prompt logs `login_prompt_shown {trigger}`; the actual conversion
// (`sign_up`) is logged in AuthContext when auth first flips on.

type Trigger = 'first_badge' | 'first_note' | 'first_highlight' | 'day1' | 'periodic';
const ONE_TIME: Trigger[] = ['first_badge', 'first_note', 'first_highlight', 'day1'];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ARM_DELAY_MS = 3000;   // let other contexts hydrate before we baseline counts

const LAST_AT_KEY = 'loginPrompt:lastAt';
const FIRED_KEY = 'loginPrompt:fired';
const LAST_TRIGGER_KEY = 'loginPrompt:lastTrigger';   // read by AuthContext for sign_up.prompt_source
const FIRST_OPEN_KEY = 'loginPrompt:firstOpen';

interface LoginPromptState {
  /** True when a login prompt should be on screen (renders SignInSheet at root). */
  promptVisible: boolean;
  dismiss: () => void;
}

const Ctx = createContext<LoginPromptState | null>(null);

export function LoginPromptProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { earnedCount } = useAchievements();
  const { notes } = useNotes();
  const { count: highlightCount } = useHighlights();
  const { ready: obReady, done: obDone } = useOnboarding();
  const isLoggedIn = !!user;

  const [promptVisible, setPromptVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const loggedInRef = useRef(isLoggedIn);
  loggedInRef.current = isLoggedIn;
  const armedRef = useRef(false);
  // Whether onboarding was ALREADY done when this session started — the
  // open-triggered nudge must not fire in the session onboarding completes.
  const obDoneAtLaunchRef = useRef<boolean | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const lastAtRef = useRef(0);
  const firstOpenRef = useRef(Date.now());
  const baselineRef = useRef({ badges: 0, notes: 0, highlights: 0 });

  // Decide whether to show a prompt for this trigger, honoring all the gates.
  const maybePrompt = useCallback((trigger: Trigger) => {
    if (loggedInRef.current) return;
    if (ONE_TIME.includes(trigger) && firedRef.current.has(trigger)) return;
    if (Date.now() - lastAtRef.current < THREE_DAYS_MS) return;   // global 1-per-3-days cap
    setPromptVisible(true);
    lastAtRef.current = Date.now();
    AsyncStorage.setItem(LAST_AT_KEY, String(lastAtRef.current)).catch(() => {});
    AsyncStorage.setItem(LAST_TRIGGER_KEY, trigger).catch(() => {});
    if (ONE_TIME.includes(trigger)) {
      firedRef.current.add(trigger);
      AsyncStorage.setItem(FIRED_KEY, JSON.stringify([...firedRef.current])).catch(() => {});
    }
    logEvent('login_prompt_shown', { trigger });
  }, []);

  // Hydrate persisted state.
  useEffect(() => {
    (async () => {
      try {
        const [lastAt, fired, firstOpen] = await Promise.all([
          AsyncStorage.getItem(LAST_AT_KEY),
          AsyncStorage.getItem(FIRED_KEY),
          AsyncStorage.getItem(FIRST_OPEN_KEY),
        ]);
        lastAtRef.current = lastAt ? Number(lastAt) : 0;
        if (fired) { try { firedRef.current = new Set(JSON.parse(fired)); } catch {} }
        if (firstOpen) firstOpenRef.current = Number(firstOpen);
        else AsyncStorage.setItem(FIRST_OPEN_KEY, String(firstOpenRef.current)).catch(() => {});
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // Remember whether onboarding was already done at launch.
  useEffect(() => {
    if (obReady && obDoneAtLaunchRef.current === null) obDoneAtLaunchRef.current = obDone;
  }, [obReady, obDone]);

  // Arm only once onboarding is finished (a delay lets a returning user's
  // hydrated counts become the baseline so they don't fire a spurious "first_*").
  useEffect(() => {
    if (!hydrated || !obReady || !obDone || armedRef.current) return;
    const timer = setTimeout(() => {
      baselineRef.current = { badges: earnedCount, notes: notes.length, highlights: highlightCount };
      armedRef.current = true;
      // Day-1 vs periodic nudge on this open (capped to 1/3-days inside
      // maybePrompt) — skipped in the session onboarding just completed.
      if (obDoneAtLaunchRef.current) {
        maybePrompt(Date.now() - firstOpenRef.current < DAY_MS ? 'day1' : 'periodic');
      }
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, obReady, obDone]);

  // Milestone observers — fire only on the genuine 0→1 crossing past the armed
  // baseline (so existing data on a returning user doesn't trigger them).
  useEffect(() => {
    if (armedRef.current && baselineRef.current.badges < 1 && earnedCount >= 1) maybePrompt('first_badge');
  }, [earnedCount, maybePrompt]);
  useEffect(() => {
    if (armedRef.current && baselineRef.current.notes < 1 && notes.length >= 1) maybePrompt('first_note');
  }, [notes.length, maybePrompt]);
  useEffect(() => {
    if (armedRef.current && baselineRef.current.highlights < 1 && highlightCount >= 1) maybePrompt('first_highlight');
  }, [highlightCount, maybePrompt]);

  // Signing in dismisses + permanently suppresses (maybePrompt also guards).
  useEffect(() => { if (isLoggedIn) setPromptVisible(false); }, [isLoggedIn]);

  const value = useMemo<LoginPromptState>(() => ({
    promptVisible: promptVisible && !isLoggedIn,
    dismiss: () => setPromptVisible(false),
  }), [promptVisible, isLoggedIn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLoginPrompt() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLoginPrompt must be used inside LoginPromptProvider');
  return ctx;
}
