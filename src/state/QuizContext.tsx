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
  spreadFor, collectCard, grantDrawsThrough, resolveDraw, toggleLike, isLiked,
  type CardProgressV1, type CardLikesV1,
} from './cardDraw';
import {
  INITIAL_HISTORY, parseHistory, recordSet, summarize, dailyGate, canStartSet,
  type QuizHistoryV1, type HistorySummary, type DailyGate,
} from './quizHistory';
import { quizLifecycle, reachableSets, type QuizLifecycle } from './quizLifecycle';
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
// FOUR of the five are in MERGERS (services/progressMerge.ts); the session is
// deliberately excluded, being disposable by design. The ladder shipped WITHOUT
// an entry and silently reset on every reinstall — do not add a sixth key
// without deciding its merger in the same commit.
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
  /** Ask for another bank fetch. The unavailable view needs a real retry — the
   *  foreground listener alone means force-quitting is the only other way. */
  retryBank: () => void;
  progress: QuizProgressV1;
  session: QuizSessionV1 | null;
  /** The 5 questions of the CURRENT set, resolved. Empty when there is no bank. */
  questions: QuizQuestion[];
  /** Question on screen right now, or null outside the answering phases. */
  currentQuestion: QuizQuestion | null;
  /** 5 segments for the progress bar, positional. */
  segments: SegmentState[];
  /** Start (or resume) the current set. A no-op once the daily cap is reached
   *  and there is nothing in flight to resume. */
  open: () => void;
  /** Answer the question on screen. Ignored unless one is awaiting an answer. */
  pick: (optionIndex: number) => void;
  /**
   * Answer from the HOME card, starting the set if this is the first tap.
   *
   * Both halves have to land in ONE update. The home card renders the first
   * question of a set that has not begun yet, so `open()` followed by `pick()`
   * would have pick() read a session that does not exist for another render —
   * the tap would be swallowed and the card would just sit there.
   *
   * Refuses for exactly the same reasons open() does (no bank, daily cap spent,
   * retired), so the cap can't be bypassed by answering from home.
   */
  startAndPick: (optionIndex: number) => void;
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
  /** Today's three-set allowance: how many are gone, how many are left. */
  daily: DailyGate;
  /** YYYY-MM-DD, local, ROLLED OVER at midnight. The single answer to "what day
   *  is it" — screens that computed their own froze it at launch. */
  todayYmd: string;
  /** Sets this bank allows in total. 0 until the bank lands. The reward tail
   *  (last painting, last draw) is measured from it. */
  totalSets: number;
  /** May she begin a NEW set right now? False once today's allowance is spent,
   *  and false forever once the quiz has retired. A set already in flight is
   *  always resumable — cap or no cap, retired or not. */
  canStart: boolean;
  /** Whether the bank still has anything she has not seen. `retired` hides the
   *  home card; it is derived from the bank on the device, so a bigger bank
   *  brings the quiz back with no migration. */
  lifecycle: QuizLifecycle;
  /** She has earned a draw and not taken it. Survives a force quit. */
  pendingDraw: boolean;
  /** The 4 face-down cards on the table right now. Stable across relaunches. */
  drawSpread: MysteryCard[];
  /** What a tap on spread position `index` actually hands her. See resolveDraw:
   *  the filler faces exist to fill the table, not to eat a reward. */
  resolveDrawPick: (index: number) => MysteryCard | null;
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
  /** Which language the bank in state was fetched for. A REF, not state:
   *  nothing renders from it, and as state it re-rendered the whole provider on
   *  every successful load for no visible difference. */
  const bankLangRef = useRef<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const retryBank = useCallback(() => setRetryTick(t => t + 1), []);
  const [progress, setProgress] = useState<QuizProgressV1>(INITIAL_PROGRESS);
  const [session, setSession] = useState<QuizSessionV1 | null>(null);
  const [cards, setCards] = useState<CardProgressV1>(INITIAL_CARD_PROGRESS);
  const [likes, setLikes] = useState<CardLikesV1>(INITIAL_CARD_LIKES);
  const [history, setHistory] = useState<QuizHistoryV1>(INITIAL_HISTORY);
  // TODAY, AS STATE. It used to be a bare localYmd() call inside a useMemo keyed
  // on `history`, which meant the date froze at whatever it was when the app
  // launched: her streak stopped advancing at midnight, and the daily cap --
  // which is entirely a question of what day it is -- would never have reset for
  // anyone who leaves the app open.
  const [todayYmd, setTodayYmd] = useState(localYmd);

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

  // Roll the date over: at the next local midnight while the app is open, and
  // whenever it comes back to the foreground. The timer covers someone playing
  // through midnight; the AppState listener covers the ordinary case of closing
  // the app capped and reopening it the next morning.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => setTodayYmd(prev => {
      const now = localYmd();
      return now === prev ? prev : now;      // same string = no re-render
    });
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      // Clamped: a device whose clock is far in the past would otherwise ask for
      // a delay past setTimeout's 32-bit ceiling and fire immediately, forever.
      const ms = Math.min(Math.max(midnight.getTime() - now.getTime(), 1000), 86400000);
      timer = setTimeout(() => { bump(); schedule(); }, ms);
    };
    schedule();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') bump(); });
    return () => { if (timer) clearTimeout(timer); sub.remove(); };
  }, []);

  // ── Bank (cache-first, then network) ──────────────────────────────────────
  // Re-runs on language change: a user who switches to Spanish should get the
  // Spanish bank, not keep answering English questions.
  //
  // The OLD bank stays on screen while the new one LOADS. Clearing it first
  // would blank the question she is currently reading and bounce her home
  // mid-answer.
  //
  // But it does NOT survive a load that FAILS for a different language. Keeping
  // it there meant a user who switched to Spanish and lost the fetch went on
  // reading English questions under a Spanish UI, which is worse than showing
  // nothing — see the header of services/quizBank.ts. Being ejected to the home
  // screen is the accepted cost, and it is only paid when the language actually
  // changed; a same-language refresh that fails still keeps what she has.
  useEffect(() => {
    let alive = true;
    setBankStatus('loading');
    loadBank(language)
      .then(b => {
        if (!alive) return;
        if (b) { setBank(b); bankLangRef.current = language; }
        // A DIFFERENT language failing must clear the bank. Keeping it meant a
        // user who switched to Spanish and hit a failed fetch kept reading
        // ENGLISH questions under a Spanish UI — worse than showing nothing,
        // which is exactly what quizBank's own header says. Keeping it is only
        // right when the SAME language is merely refreshing.
        else if (bankLangRef.current !== null && bankLangRef.current !== language) setBank(null);
        setBankStatus(b ? 'ready' : 'unavailable');
        if (b) reconcileSession(b);
      })
      .catch(() => {
        if (!alive) return;
        // fetchBank documents that it never throws, so this is belt and braces
        // — but it must clear the bank on a language change for the same reason
        // the success path does, or the guarantee silently depends on which
        // path failed.
        if (bankLangRef.current !== null && bankLangRef.current !== language) setBank(null);
        setBankStatus('unavailable');
      });
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

  // Today's allowance. Derived, never stored: a counter of our own could drift
  // from the history the progress screen reads, and history is already the
  // append-only record every other daily number comes from.
  const daily = useMemo(() => dailyGate(history, todayYmd), [history, todayYmd]);
  // Retirement reads `bank`, not bankStatus: a device still fetching has
  // bank === null and must NOT read as finished, or the feature would vanish
  // for a few hundred milliseconds on every cold start.
  const lifecycle = useMemo(
    () => quizLifecycle(progress.setIndex, bank?.length ?? 0),
    [progress.setIndex, bank],
  );
  // The retired half is NOT overridden by a live session. A session cannot
  // outlive retirement: the set that retires the quiz is committed before
  // setIndex advances, so by the time `retired` is true that session is gone.
  // `!!bank` FIRST. Without it this was true on a device that has no questions:
  // quizLifecycle(x, 0).retired is deliberately false (a null bank must not read
  // as "finished"), and a fresh `daily` allows a set — so every "Go play" button
  // lit up, and all three of them navigate with REPLACE. She left the collection
  // screen, QuizChallengeScreen mounted, its bank-unavailable effect fired
  // goBack(), and the screen she came from no longer existed. On a restored
  // Android nav stack goBack() has nowhere to go at all, and navLock had already
  // latched — a blank page with a dead X and dead hardware back.
  const totalSets = useMemo(() => reachableSets(bank?.length ?? 0), [bank]);
  const canStart = !!bank && canStartSet(daily, !!session) && !lifecycle.retired;

  // ── Actions ───────────────────────────────────────────────────────────────
  const open = useCallback(() => {
    setSession(prev => {
      // Resume rather than restart — the user may be mid-set.
      if (prev && prev.setIndex === progress.setIndex && prev.phase !== 'complete') return prev;
      if (!bank) return prev;
      // THE DAILY CAP, enforced here rather than only in the UI. Every entry
      // point funnels through open() -- the home card, the auto-open effect on
      // the quiz screen, and "next set" on the results screen -- and a check in
      // three components is a check that will be forgotten in the fourth.
      // Reading `daily` (computed from history + todayYmd) rather than a counter
      // of our own means it cannot drift from what the screens display.
      if (daily.reached) return prev;
      // Every question has been served. quizSets would happily deal a second
      // shuffle of the same bank forever -- that is what makes the set machinery
      // simple -- but serving her a game whose content she has finished is not
      // something to do quietly. See state/quizLifecycle.ts.
      if (lifecycle.retired) return prev;
      const qs = questionsForSet(progress.setIndex, bank);
      if (qs.length < SET_SIZE) return prev;
      logEvent('quiz_set_start', { set_index: progress.setIndex });
      return initialSession(progress.setIndex, qs.map(q => q.id), QUIZ_BANK_VERSION);
    });
  }, [bank, progress.setIndex, daily.reached, lifecycle.retired]);

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

  // logEvent stays OUT of the updater — a state updater must be pure, or a
  // rebase / StrictMode replay double-counts the set start. The ref makes it
  // fire once per set even if two taps land in the same frame.
  const homeStartLogged = useRef<number | null>(null);
  const startAndPick = useCallback((optionIndex: number) => {
    if (!session && bank && !daily.reached && !lifecycle.retired
        && homeStartLogged.current !== progress.setIndex) {
      homeStartLogged.current = progress.setIndex;
      logEvent('quiz_set_start', { set_index: progress.setIndex, source: 'home' });
    }
    setSession(prev => {
      let s = prev;
      if (!s) {
        // Same refusals as open(). The home card must not become a way around
        // the daily cap just because the question is rendered in place.
        if (!bank || daily.reached || lifecycle.retired) return prev;
        const qs = questionsForSet(progress.setIndex, bank);
        if (qs.length < SET_SIZE) return prev;
        s = initialSession(progress.setIndex, qs.map(q => q.id), QUIZ_BANK_VERSION);
      }
      const pos = currentPosition(s);
      if (pos == null) return s;
      // `questions` is resolved from progress.setIndex while no session exists,
      // which is the same set we just built — so this is the right question in
      // both branches.
      const q = questions[pos];
      if (!q) return s;
      // A second tap in the same batch receives the ALREADY-LOCKED session here
      // and pickOption returns it untouched, so the double-tap guard still
      // lives in the reducer.
      return pickOption(s, optionIndex, optionIndex === q.answerIndex);
    });
  }, [bank, session, questions, progress.setIndex, daily.reached, lifecycle.retired]);

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

    // localYmd() fresh, not the `todayYmd` state: a set finished at 00:00:02
     // belongs to the day it ENDED on, and the state may be up to five seconds
     // behind the timer above. Recording it against yesterday would give her a
     // fourth set today.
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
   * Grant every draw earned since the last one we considered.
   *
   * The watermark is PERSISTED (`grantedThroughSets`), not held in a ref. The
   * grant is a different render from the commit, so a kill in between used to
   * commit the set and lose the draw forever — on relaunch the ref re-seeded to
   * the new count and that set was never examined again. Replaying from the
   * stored watermark catches exactly the sets that were missed.
   */
  useEffect(() => {
    if (!hydrated.current) return;
    setCards(prev => {
      const next = grantDrawsThrough(prev, progress.completedSets, MYSTERY_EVERY, totalSets);
      if (next !== prev && next.pendingDraw && !prev.pendingDraw) {
        logEvent('quiz_draw_earned', { completed_sets: progress.completedSets });
      }
      return next;
    });
  }, [progress.completedSets, totalSets]);

  // ── Mystery cards ─────────────────────────────────────────────────────────
  const cardIds = useMemo(() => MYSTERY_CARDS.map(c => c.id), []);
  const knownCardIds = useMemo(() => new Set(cardIds), [cardIds]);

  const spreadCandidates = useMemo(() => spreadFor(cards, cardIds).candidates, [cards, cardIds]);
  const drawSpread = useMemo(
    () => spreadCandidates.map(i => MYSTERY_CARDS[i]!),
    [spreadCandidates],
  );
  const resolveDrawPick = useCallback((index: number): MysteryCard | null => {
    const at = resolveDraw(spreadCandidates, index, cards.collected, cardIds);
    return MYSTERY_CARDS[spreadCandidates[at]!] ?? null;
  }, [spreadCandidates, cards.collected, cardIds]);

  // Most recent first: the collection reads as "what she just got", not as a
  // list she has to scroll to the bottom of.
  // Filtered against the live pool, not mapped blindly. `cardById` falls back
  // to the first card, so an id from a newer build — or a union merge across app
  // versions — would render as a phantom duplicate of doubt-1 with a clashing
  // React key, a "41 of 40" count, and a heart that likes the wrong card.
  const collectedCards = useMemo(
    () => cards.collected.filter(id => knownCardIds.has(id)).map(cardById).reverse(),
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

  const historySummary = useMemo(() => summarize(history, todayYmd), [history, todayYmd]);

  const abandon = useCallback(() => setSession(null), []);

  const value = useMemo<QuizState>(() => ({
    ready, bank, bankStatus, retryBank, progress, session, questions, currentQuestion, segments,
    open, pick, startAndPick, next, retry, finish, abandon,
    cards, likes, history, historySummary, daily, canStart, todayYmd, lifecycle,
    pendingDraw: cards.pendingDraw, drawSpread, resolveDrawPick, totalSets, collectedCards,
    drawCard, likeCard, cardIsLiked, logCardShare, logCardOpen,
  }), [ready, bank, bankStatus, retryBank, progress, session, questions, currentQuestion, segments,
       open, pick, startAndPick, next, retry, finish, abandon,
       cards, likes, history, historySummary, daily, canStart, todayYmd, lifecycle,
       drawSpread, resolveDrawPick, totalSets, collectedCards,
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
    ready: false, bank: null, bankStatus: 'unavailable', retryBank: () => {}, progress: INITIAL_PROGRESS, session: null,
    questions: [], currentQuestion: null, segments: ['empty', 'empty', 'empty', 'empty', 'empty'],
    open: () => {}, pick: () => {}, startAndPick: () => {}, next: () => {}, retry: () => {}, finish: () => {}, abandon: () => {},
    cards: INITIAL_CARD_PROGRESS, likes: INITIAL_CARD_LIKES, history: INITIAL_HISTORY,
    historySummary: { streak: 0, bestStreak: 0, activeDays: 0, setsLast7: 0, setsLast30: 0, accuracy: null },
    daily: dailyGate(INITIAL_HISTORY, ''), canStart: false, todayYmd: '',
    lifecycle: quizLifecycle(0, 0),
    pendingDraw: false, drawSpread: [], resolveDrawPick: () => null, totalSets: 0, collectedCards: [],
    drawCard: () => {}, likeCard: () => {}, cardIsLiked: () => false,
    logCardShare: () => {}, logCardOpen: () => {},
  };
}
