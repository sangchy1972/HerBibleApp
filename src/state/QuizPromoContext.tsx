import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cadence for the "try the quiz, earn a reward card" nudge.
//
// The HOST owns eligibility (is she actually in the afternoon gap, is the quiz
// even available); this owns only the timing, exactly like
// SetReminderTimeContext and RatePromptContext. Same shape on purpose — three
// nudges with three different cadence implementations is how one of them ends
// up nagging.
//
// THE CADENCE: 2 days to the second showing, then 3, 4, 5 … capped at 14.
// Escalating rather than fixed because a woman who ignores it twice is telling
// us something, and the honest response is to ask less often rather than to
// stop entirely — she may simply not have had a free evening yet.
//
// STOPS FOR GOOD once she has actually played (`converted`). The prompt exists
// to introduce a feature; once she has met it, repeating the introduction is
// just noise. The host sets that flag from real quiz progress, not from the
// CTA tap, so tapping through and then backing out does not count.

const STORAGE_KEY = 'nudge:quizPromo:v1';
const DAY_MS = 86_400_000;
/** Escalation ceiling. At 14 days she sees it at most twice a month. */
export const MAX_GAP_DAYS = 14;

export interface QuizPromoPersisted {
  lastShownAt: number;
  promptCount: number;
  /** She has completed at least one quiz set. Terminal. */
  converted: boolean;
}
const DEFAULT: QuizPromoPersisted = { lastShownAt: 0, promptCount: 0, converted: false };

/**
 * Pure decision — exported for tests.
 *
 * The FIRST showing has no delay of its own. Unlike the reminder nudge, which
 * waits 20h so it cannot land in the session where she just declined
 * notifications, this one is already gated by a rare condition: the host only
 * asks on an afternoon where she has finished everything else. Adding a timer
 * on top would mean the first eligible gap gets skipped for no reason.
 */
export function quizPromoShouldShow(s: QuizPromoPersisted, now = Date.now()): boolean {
  if (s.converted) return false;
  if (s.promptCount === 0) return true;
  // 2, 3, 4, 5 … 14. `promptCount` is 1 after the first showing, so the first
  // gap is 2 days.
  const gapDays = Math.min(MAX_GAP_DAYS, 1 + s.promptCount);
  return now - s.lastShownAt >= gapDays * DAY_MS;
}

/** The gap she is currently waiting out, in days. Exposed for tests + debug. */
export function quizPromoGapDays(promptCount: number): number {
  const n = Math.max(0, Math.floor(promptCount) || 0);
  return n === 0 ? 0 : Math.min(MAX_GAP_DAYS, 1 + n);
}

interface State {
  ready: boolean;
  shouldShow: () => boolean;
  markShown: () => void;
  /** Terminal. Called once real quiz progress exists. */
  markConverted: () => void;
}

const Ctx = createContext<State | null>(null);

export function QuizPromoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuizPromoPersisted>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        // Spread over DEFAULT rather than trusting the parse: a record written
        // by a future build with extra fields, or a truncated write, must not
        // produce undefined counters that make every comparison NaN.
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') setState({ ...DEFAULT, ...p });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Functional updates throughout: a mutator that closed over `state` would be
  // correct only as long as no two of them can fire in the same commit, and
  // that is a property of the CALLER, not of this file.
  const persist = (fn: (prev: QuizPromoPersisted) => QuizPromoPersisted) => {
    setState(prev => {
      const next = fn(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const value = useMemo<State>(() => ({
    ready,
    shouldShow: () => quizPromoShouldShow(state),
    markShown: () => persist(p => ({ ...p, lastShownAt: Date.now(), promptCount: p.promptCount + 1 })),
    markConverted: () => persist(p => (p.converted ? p : { ...p, converted: true })),
  }), [state, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Safe outside a provider — an inert state, so a stray consumer renders
 *  nothing rather than crashing. Same contract as useQuiz. */
export function useQuizPromo(): State {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return { ready: false, shouldShow: () => false, markShown: () => {}, markConverted: () => {} };
}
