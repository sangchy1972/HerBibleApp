import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUIZ_BANK_VERSION, type QuizQuestion } from '../constants/bibleQuiz';
import { loadBank } from '../services/quizBank';
import { questionsForSet, SET_SIZE } from '../services/quizSets';
import {
  initialSession, pickOption, advance, startRetryRound, finishSession,
  currentPosition, sessionSegments, sessionSummary, parseSession, sessionAlignsWith,
  type QuizSessionV1, type SegmentState,
} from './quizSession';
import {
  INITIAL_PROGRESS, applyCompletion, parseProgress, type QuizProgressV1,
} from './quizProgress';
import { logEvent } from '../services/firebase';

// All quiz I/O in one place. The screens never touch AsyncStorage and never
// touch the bank service; they get resolved questions and call actions.
//
// TWO KEYS, split by write frequency and by how much losing them costs:
//   quiz:session:v1  — the in-flight set. Written on EVERY answer. Disposable:
//                      a corrupt read just restarts the current set.
//   quiz:progress:v1 — the ladder (sets completed, puzzle tiles). Written only
//                      on completion. This one must never be lost.
// ReadChaptersContext already splits its keys on the same principle.
//
// The bank comes from the CDN, so `bank` can legitimately be null forever on a
// device that has never been online. `ready && !!bank` is the gate the home card
// uses to decide whether the feature exists at all.

const SESSION_KEY = 'quiz:session:v1';
const PROGRESS_KEY = 'quiz:progress:v1';

/**
 * `loading` and `unavailable` are NOT the same thing and must never be
 * collapsed into `bank === null`. A screen that treats "still fetching" as
 * "there is no quiz" throws the user out of a question she is in the middle of
 * answering the moment anything re-triggers the fetch.
 */
export type BankStatus = 'loading' | 'ready' | 'unavailable';

interface QuizState {
  /** Hydration finished — until then, render nothing rather than a wrong state. */
  ready: boolean;
  /** null = no bank on this device yet. The home card hides itself. */
  bank: QuizQuestion[] | null;
  bankStatus: BankStatus;
  progress: QuizProgressV1;
  session: QuizSessionV1 | null;
  /** The 5 questions of the CURRENT set, resolved. Empty when there is no bank. */
  questions: QuizQuestion[];
  /** Question on screen right now, or null outside the answering phases. */
  currentQuestion: QuizQuestion | null;
  /** 5 segments for the progress bar, positional. */
  segments: SegmentState[];
  /** Start (or resume) the current set. */
  open: () => void;
  /** Answer the question on screen. Ignored unless one is awaiting an answer. */
  pick: (optionIndex: number) => void;
  /** Reveal → next question, or → summary. */
  next: () => void;
  /** Summary → re-ask the ones still wrong. */
  retry: () => void;
  /** Summary → commit the set and advance the ladder. */
  finish: () => void;
  /** Throw away the in-flight set without committing (debug / reset). */
  abandon: () => void;
}

const Ctx = createContext<QuizState | null>(null);

export function QuizProvider({ children, language }: { children: React.ReactNode; language: string }) {
  const [ready, setReady] = useState(false);
  const [bank, setBank] = useState<QuizQuestion[] | null>(null);
  const [bankStatus, setBankStatus] = useState<BankStatus>('loading');
  const [retryTick, setRetryTick] = useState(0);
  const [progress, setProgress] = useState<QuizProgressV1>(INITIAL_PROGRESS);
  const [session, setSession] = useState<QuizSessionV1 | null>(null);

  // Guards a write from landing before the read that should have preceded it.
  // Same failure this repo hit in adRevenue: an un-hydrated write erases real
  // state with an empty default.
  const hydrated = useRef(false);

  // ── Hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rawProgress, rawSession] = await Promise.all([
          AsyncStorage.getItem(PROGRESS_KEY).catch(() => null),
          AsyncStorage.getItem(SESSION_KEY).catch(() => null),
        ]);
        if (!alive) return;
        setProgress(parseProgress(rawProgress, QUIZ_BANK_VERSION));
        // parseSession returns null on a bank-version mismatch: the stored qids
        // may no longer mean what they meant, and grading against the wrong
        // question is worse than restarting the set.
        setSession(parseSession(rawSession, QUIZ_BANK_VERSION));
      } finally {
        if (alive) { hydrated.current = true; setReady(true); }
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Bank (cache-first, then network) ──────────────────────────────────────
  // Re-runs on language change: a user who switches to Spanish should get the
  // Spanish bank, not keep answering English questions.
  //
  // The OLD bank deliberately stays on screen while the new one loads. Clearing
  // it first would blank the question she is currently reading, and — because
  // the screen treats "no bank" as "no quiz" — bounce her back to the home
  // screen mid-answer.
  useEffect(() => {
    let alive = true;
    setBankStatus('loading');
    loadBank(language)
      .then(b => {
        if (!alive) return;
        if (b) setBank(b);
        setBankStatus(b ? 'ready' : 'unavailable');
        if (b) reconcileSession(b);
      })
      .catch(() => { if (alive) setBankStatus('unavailable'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, retryTick]);

  // A device that was offline at launch would otherwise never see the quiz
  // again until the app is force-quit — the fetch effect keys only on language.
  // Retrying when the app comes back to the foreground covers the ordinary
  // "she opened it on the train, then got signal" case without a poll loop.
  useEffect(() => {
    if (bankStatus !== 'unavailable') return;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') setRetryTick(t => t + 1);
    });
    return () => sub.remove();
  }, [bankStatus]);

  /**
   * A new bank arrived while a set was in flight. Every language ships the same
   * ids in the same positions, so the normal outcome is that the session
   * survives and the questions simply change language.
   *
   * If the ids DON'T line up, the session is dropped rather than repaired: the
   * stored answers would then be graded against questions the user never saw,
   * and marking a right answer wrong is worse than restarting one set.
   */
  const reconcileSession = useCallback((b: QuizQuestion[]) => {
    setSession(prev => {
      if (!prev) return prev;
      const qs = questionsForSet(prev.setIndex, b);
      if (sessionAlignsWith(prev, qs.map(q => q.id))) return prev;
      logEvent('quiz_session_dropped_bank_drift', { set_index: prev.setIndex });
      return null;
    });
  }, []);

  // ── Persist ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated.current) return;
    if (session) AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {});
    else AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)).catch(() => {});
  }, [progress]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // The set the session belongs to, NOT progress.setIndex: a session persists
  // across the commit boundary for one render, and reading the wrong index
  // there would swap the questions out from under the summary screen.
  const activeSetIndex = session ? session.setIndex : progress.setIndex;
  const questions = useMemo(
    () => (bank ? questionsForSet(activeSetIndex, bank) : []),
    [bank, activeSetIndex],
  );

  const currentQuestion = useMemo(() => {
    const pos = currentPosition(session);
    if (pos == null) return null;
    return questions[pos] ?? null;
  }, [session, questions]);

  const segments = useMemo(() => sessionSegments(session, SET_SIZE), [session]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const open = useCallback(() => {
    setSession(prev => {
      // Resume rather than restart — the user may be mid-set.
      if (prev && prev.setIndex === progress.setIndex && prev.phase !== 'complete') return prev;
      if (!bank) return prev;
      const qs = questionsForSet(progress.setIndex, bank);
      if (qs.length < SET_SIZE) return prev;
      logEvent('quiz_set_start', { set_index: progress.setIndex });
      return initialSession(progress.setIndex, qs.map(q => q.id), QUIZ_BANK_VERSION);
    });
  }, [bank, progress.setIndex]);

  const pick = useCallback((optionIndex: number) => {
    setSession(prev => {
      if (!prev) return prev;
      const pos = currentPosition(prev);
      if (pos == null) return prev;
      const q = questions[pos];
      if (!q) return prev;
      // Correctness is decided HERE, against the resolved question, and passed
      // into the reducer — which is what keeps quizSession.ts dependency-free
      // and unit-testable without the bank.
      return pickOption(prev, optionIndex, optionIndex === q.answerIndex);
    });
  }, [questions]);

  const next = useCallback(() => setSession(prev => (prev ? advance(prev) : prev)), []);
  const retry = useCallback(() => setSession(prev => {
    if (!prev) return prev;
    const s = startRetryRound(prev);
    if (s !== prev) logEvent('quiz_retry_round', { set_index: prev.setIndex, round: s.round });
    return s;
  }), []);

  const finish = useCallback(() => {
    setSession(prev => {
      if (!prev) return prev;
      const done = finishSession(prev);
      if (done === prev) return prev;          // still has wrong answers
      const { firstPassPerfect } = sessionSummary(done);
      logEvent('quiz_set_complete', {
        set_index: done.setIndex,
        first_pass_wrong: done.firstPassWrong,
        perfect: firstPassPerfect ? 1 : 0,
      });
      setProgress(p => applyCompletion(p, {
        firstPassWrong: done.firstPassWrong,
        totalQuestions: done.answers.length,
      }, localYmd()));
      return null;                              // session cleared; ladder advanced
    });
  }, []);

  const abandon = useCallback(() => setSession(null), []);

  const value = useMemo<QuizState>(() => ({
    ready, bank, bankStatus, progress, session, questions, currentQuestion, segments,
    open, pick, next, retry, finish, abandon,
  }), [ready, bank, bankStatus, progress, session, questions, currentQuestion, segments,
       open, pick, next, retry, finish, abandon]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function localYmd(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Safe outside a provider — returns an inert state so a stray consumer renders
 *  nothing instead of crashing, the same contract as useBadges. */
export function useQuiz(): QuizState {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    ready: false, bank: null, bankStatus: 'unavailable', progress: INITIAL_PROGRESS, session: null,
    questions: [], currentQuestion: null, segments: ['empty', 'empty', 'empty', 'empty', 'empty'],
    open: () => {}, pick: () => {}, next: () => {}, retry: () => {}, finish: () => {}, abandon: () => {},
  };
}
