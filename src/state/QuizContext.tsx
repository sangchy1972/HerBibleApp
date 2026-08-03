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
  INITIAL_PROGRESS, applyCompletion, parseProgress, MYSTERY_EVERY, type QuizProgressV1,
} from './quizProgress';
import {
  INITIAL_CARD_PROGRESS, INITIAL_CARD_LIKES, parseCardProgress, parseCardLikes,
  spreadFor, collectCard, grantDraw, drawEarnedAt, toggleLike, isLiked,
  type CardProgressV1, type CardLikesV1,
} from './cardDraw';
import {
  INITIAL_HISTORY, parseHistory, recordSet, summarize,
  type QuizHistoryV1, type HistorySummary,
} from './quizHistory';
import { MYSTERY_CARDS, cardById, type MysteryCard } from '../constants/mysteryCards';
import { logEvent } from '../services/firebase';

// All quiz I/O in one place. The screens never touch AsyncStorage and never
// touch the bank service; they get resolved questions and call actions.
//
// FIVE KEYS, split by write frequency and by how much losing them costs.
// ReadChaptersContext already splits its keys on the same principle.
//   quiz:session:v1    — the in-flight set. Written on EVERY answer. Disposable:
//                        a corrupt read just restarts the current set.
//   quiz:progress:v1   — the ladder (sets completed, puzzle tiles). Written only
//                        on completion. Must never be lost.
//   quiz:cards:v1      — mystery cards collected + the unspent draw. Must never
//                        be lost.
//   quiz:card-likes:v1 — hearts. Written on every tap; losing it costs an icon.
//   quiz:dates:v1      — daily history. Append-only and unbackfillable, so a
//                        write that fails to happen is gone forever.
//
// All five are in MERGERS (services/progressMerge.ts). The ladder shipped
// WITHOUT an entry and silently reset on every reinstall — do not add a sixth
// key without adding its merger in the same commit.
//
// The bank comes from the CDN, so `bank` can legitimately be null forever on a
// device that has never been online. `ready && !!bank` is the gate the home card
// uses to decide whether the feature exists at all.

const SESSION_KEY = 'quiz:session:v1';
const PROGRESS_KEY = 'quiz:progress:v1';
const CARDS_KEY = 'quiz:cards:v1';
const LIKES_KEY = 'quiz:card-likes:v1';
const HISTORY_KEY = 'quiz:dates:v1';

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

  // ── Mystery cards ────────────────────────────────────────────────────────
  cards: CardProgressV1;
  likes: CardLikesV1;
  history: QuizHistoryV1;
  /** Rolling streak / accuracy / activity, derived from history. */
  historySummary: HistorySummary;
  /** She has earned a draw and not taken it. Survives a force quit. */
  pendingDraw: boolean;
  /** The 4 face-down cards on the table right now. Stable across relaunches. */
  drawSpread: MysteryCard[];
  /** Collected cards, most recent first. */
  collectedCards: MysteryCard[];
  /** Take the card she tapped. Spends the draw. */
  drawCard: (cardId: string) => void;
  /** Heart toggle. Only the LIKE transition is logged; unliking emits nothing. */
  likeCard: (cardId: string, source: 'draw' | 'collection') => void;
  cardIsLiked: (cardId: string) => boolean;
  /** Fire the share/save analytics for a card. The capture itself lives in the UI. */
  logCardShare: (cardId: string, method: 'system' | 'save') => void;
  logCardOpen: (cardId: string) => void;
}

const Ctx = createContext<QuizState | null>(null);

export function QuizProvider({ children, language }: { children: React.ReactNode; language: string }) {
  const [ready, setReady] = useState(false);
  const [bank, setBank] = useState<QuizQuestion[] | null>(null);
  const [bankStatus, setBankStatus] = useState<BankStatus>('loading');
  const [retryTick, setRetryTick] = useState(0);
  const [progress, setProgress] = useState<QuizProgressV1>(INITIAL_PROGRESS);
  const [session, setSession] = useState<QuizSessionV1 | null>(null);
  const [cards, setCards] = useState<CardProgressV1>(INITIAL_CARD_PROGRESS);
  const [likes, setLikes] = useState<CardLikesV1>(INITIAL_CARD_LIKES);
  const [history, setHistory] = useState<QuizHistoryV1>(INITIAL_HISTORY);

  // Guards a write from landing before the read that should have preceded it.
  // Same failure this repo hit in adRevenue: an un-hydrated write erases real
  // state with an empty default.
  const hydrated = useRef(false);
  /** Set finished by finish(), waiting for the commit effect to drain it. */
  const pendingCommit = useRef<QuizSessionV1 | null>(null);

  // ── Hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rawProgress, rawSession, rawCards, rawLikes, rawHistory] = await Promise.all([
          AsyncStorage.getItem(PROGRESS_KEY).catch(() => null),
          AsyncStorage.getItem(SESSION_KEY).catch(() => null),
          AsyncStorage.getItem(CARDS_KEY).catch(() => null),
          AsyncStorage.getItem(LIKES_KEY).catch(() => null),
          AsyncStorage.getItem(HISTORY_KEY).catch(() => null),
        ]);
        if (!alive) return;
        setProgress(parseProgress(rawProgress, QUIZ_BANK_VERSION));
        // parseSession returns null on a bank-version mismatch: the stored qids
        // may no longer mean what they meant, and grading against the wrong
        // question is worse than restarting the set.
        setSession(parseSession(rawSession, QUIZ_BANK_VERSION));
        // These three are NOT discarded on a bank-version bump. Cards, hearts
        // and history are addressed by their own ids and dates; a reworded
        // question has nothing to do with them.
        setCards(parseCardProgress(rawCards));
        setLikes(parseCardLikes(rawLikes));
        setHistory(parseHistory(rawHistory));
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

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(CARDS_KEY, JSON.stringify(cards)).catch(() => {});
  }, [cards]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(LIKES_KEY, JSON.stringify(likes)).catch(() => {});
  }, [likes]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
  }, [history]);

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

  /**
   * Commit the finished set.
   *
   * The updater ONLY stages the result; every side effect happens in the effect
   * below. React guarantees a state updater is a pure function of its argument
   * and nothing more — nesting setProgress / setHistory / logEvent inside
   * setSession (and setCards inside setProgress, as this did) means a rebase or
   * a future StrictMode re-invokes them, and each replay silently grants
   * another completed set, another puzzle tile and another history row. Nothing
   * reproduces it in this build; it is exactly the double-grant the rest of
   * this file is written to avoid.
   */
  const finish = useCallback(() => {
    setSession(prev => {
      if (!prev) return prev;
      const done = finishSession(prev);
      if (done === prev) return prev;          // still has wrong answers
      pendingCommit.current = done;
      return null;                             // session cleared
    });
  }, []);

  // Drain the staged commit. Runs once per session transition, so each write
  // lands exactly once no matter how many times the updater was called.
  useEffect(() => {
    const done = pendingCommit.current;
    if (!done) return;
    pendingCommit.current = null;

    const { firstPassPerfect } = sessionSummary(done);
    logEvent('quiz_set_complete', {
      set_index: done.setIndex,
      first_pass_wrong: done.firstPassWrong,
      perfect: firstPassPerfect ? 1 : 0,
    });

    const ymd = localYmd();
    setProgress(p => applyCompletion(p, {
      firstPassWrong: done.firstPassWrong,
      totalQuestions: done.answers.length,
    }, ymd));
    // Append-only and unbackfillable — if this write is ever skipped, that day
    // is gone.
    setHistory(h => recordSet(h, ymd, {
      questions: done.answers.length,
      firstPassWrong: done.firstPassWrong,
    }));
  }, [session]);

  /**
   * Grant the draw once per newly completed set.
   *
   * Keyed on the committed count rather than fired inside the commit, so it
   * cannot double-grant, and `lastGranted` makes a re-render idempotent on top
   * of grantDraw already being so.
   */
  const lastGranted = useRef(-1);
  useEffect(() => {
    if (!hydrated.current) return;
    const n = progress.completedSets;
    // Seed on the first pass after hydration: a restored account at set 9 must
    // not be handed a draw it already spent months ago.
    if (lastGranted.current < 0) { lastGranted.current = n; return; }
    if (n === lastGranted.current) return;
    lastGranted.current = n;
    if (drawEarnedAt(n, MYSTERY_EVERY)) {
      setCards(c => grantDraw(c));
      logEvent('quiz_draw_earned', { completed_sets: n });
    }
  }, [progress.completedSets]);

  // ── Mystery cards ─────────────────────────────────────────────────────────
  const cardIds = useMemo(() => MYSTERY_CARDS.map(c => c.id), []);

  const drawSpread = useMemo(
    () => spreadFor(cards, cardIds).candidates.map(i => MYSTERY_CARDS[i]),
    [cards, cardIds],
  );

  // Most recent first: the collection reads as "what she just got", not as a
  // list she has to scroll to the bottom of.
  const collectedCards = useMemo(
    () => cards.collected.map(cardById).reverse(),
    [cards.collected],
  );

  const drawCard = useCallback((cardId: string) => {
    setCards(prev => {
      // Guard on pendingDraw, not on the UI being open. A double tap in the
      // same frame otherwise spends one draw and collects two cards.
      if (!prev.pendingDraw) return prev;
      const card = cardById(cardId);
      // card_collect is the funnel BASE. Without it every later number is a raw
      // count instead of a rate — likes/day tells you nothing, likes per card
      // collected is a behaviour.
      logEvent('card_collect', { card_id: card.id, card_theme: card.theme });
      return collectCard(prev, cardId);
    });
  }, []);

  const likeCard = useCallback((cardId: string, source: 'draw' | 'collection') => {
    setLikes(prev => {
      const next = toggleLike(prev, cardId);
      if (next === prev) return prev;
      // ONLY the like transition is logged. There is no card_unlike: "not
      // liked" should emit nothing at all. The heart still toggles, because a
      // mis-tap she cannot undo is worse than a slightly inflated like count —
      // so lifetime card_like events can exceed currently-liked cards, and that
      // is correct. They measure different things.
      if (isLiked(next, cardId)) {
        const card = cardById(cardId);
        logEvent('card_like', { card_id: card.id, card_theme: card.theme, source });
      }
      return next;
    });
  }, []);

  const cardIsLiked = useCallback((cardId: string) => isLiked(likes, cardId), [likes]);

  const logCardShare = useCallback((cardId: string, method: 'system' | 'save') => {
    const card = cardById(cardId);
    // The EXISTING GA4 recommended `share` event, with a new content_type —
    // same shape ShareVerseSheet and AchievementUnlockSheet already use, and
    // save-to-album is method:'save' exactly as the badge sheet does it.
    // card_theme rides along so a theme breakdown is possible without a second,
    // double-countable event.
    logEvent('share', {
      content_type: 'mystery_card',
      item_id: card.id,
      method,
      card_theme: card.theme,
    });
  }, []);

  const logCardOpen = useCallback((cardId: string) => {
    const card = cardById(cardId);
    logEvent('card_open', { card_id: card.id, card_theme: card.theme, source: 'collection' });
  }, []);

  const historySummary = useMemo(() => summarize(history, localYmd()), [history]);

  const abandon = useCallback(() => setSession(null), []);

  const value = useMemo<QuizState>(() => ({
    ready, bank, bankStatus, progress, session, questions, currentQuestion, segments,
    open, pick, next, retry, finish, abandon,
    cards, likes, history, historySummary,
    pendingDraw: cards.pendingDraw, drawSpread, collectedCards,
    drawCard, likeCard, cardIsLiked, logCardShare, logCardOpen,
  }), [ready, bank, bankStatus, progress, session, questions, currentQuestion, segments,
       open, pick, next, retry, finish, abandon,
       cards, likes, history, historySummary, drawSpread, collectedCards,
       drawCard, likeCard, cardIsLiked, logCardShare, logCardOpen]);

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
    cards: INITIAL_CARD_PROGRESS, likes: INITIAL_CARD_LIKES, history: INITIAL_HISTORY,
    historySummary: { streak: 0, bestStreak: 0, activeDays: 0, setsLast7: 0, setsLast30: 0, accuracy: null },
    pendingDraw: false, drawSpread: [], collectedCards: [],
    drawCard: () => {}, likeCard: () => {}, cardIsLiked: () => false,
    logCardShare: () => {}, logCardOpen: () => {},
  };
}
