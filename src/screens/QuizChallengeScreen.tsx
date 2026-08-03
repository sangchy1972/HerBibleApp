import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BG, TXT, TXTSUB, FONTS, ROSE, ROSE_WASH, BTN_RADIUS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { currentPosition, isTried, sessionSummary } from '../state/quizSession';
import { levelFor, MYSTERY_EVERY, TILES_PER_PAINTING } from '../state/quizProgress';
import { drawEarnedAt } from '../state/cardDraw';
import { QUIZ_ART_COUNT } from '../constants/quizArt';
import QuizSegmentBar from '../components/quiz/QuizSegmentBar';
import QuizQuestionView from '../components/quiz/QuizQuestionView';
import QuizReviewView from '../components/quiz/QuizReviewView';
import MysteryDrawOverlay from '../components/quiz/MysteryDrawOverlay';
import PaintingComplete from '../components/quiz/PaintingComplete';
import type { OptionState } from '../components/quiz/QuizOptionButton';
import type { RootStackScreenProps } from '../navigation/types';

// The full-screen quiz. Owns no state — every transition goes through
// QuizContext, so closing the screen mid-set and reopening resumes exactly
// where the user left off (the session is persisted on every answer).
//
// Leaving is always allowed and never destructive: the in-flight session
// survives, and the ladder only advances on an explicit "continue".

export default function QuizChallengeScreen({ navigation }: RootStackScreenProps<'Quiz'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {
    ready, bank, bankStatus, session, questions, currentQuestion, segments, progress,
    open, pick, next, retry, finish, pendingDraw, daily,
  } = useQuiz();

  // The draw overlay sits ON TOP of the results screen rather than being a
  // route of its own: the reward has to land in the same breath as the set that
  // earned it, not after a navigation transition.
  const [drawing, setDrawing] = useState(false);
  // Backing out of the spread leaves pendingDraw true on purpose — the reward
  // is not spent. Without this ref the effect below would immediately re-open
  // the overlay, and the scrim would fade back in over the dismiss animation.
  // She would appear to be trapped. The flag lives for this visit only, so the
  // draw is offered again next time she opens the quiz.
  const drawDismissed = useRef(false);
  // True when the overlay was opened by a draw she earned in a PREVIOUS visit
  // rather than by the set she just finished. Collecting that one must leave
  // her on the quiz, not throw her home — she opened the app to answer
  // questions and an old reward ambushed her before the first one.
  const resumedDraw = useRef(false);
  // Two taps in one frame dispatch two GO_BACKs; the second pops the parent and
  // she lands two screens away from where she meant to be.
  const navLock = useRef(false);
  const goHome = () => {
    if (navLock.current) return;
    navLock.current = true;
    navigation.goBack();
  };

  // A finished painting gets its own moment. Four sets and twenty questions is
  // a bigger thing than one set, and folding it into the same results card
  // would make the larger achievement read as the smaller one.
  const [finishedPainting, setFinishedPainting] = useState<number | null>(null);

  // A draw interrupted by a force quit is offered again on the next open —
  // pendingDraw is persisted and only ever spent by collecting a card.
  useEffect(() => {
    if (!ready || !pendingDraw || drawing || drawDismissed.current) return;
    // A draw that was already owed when the screen mounted is a leftover, not a
    // reward for what she is doing right now.
    if (!leaving.current) resumedDraw.current = true;
    setDrawing(true);
  }, [ready, pendingDraw, drawing]);

  // Start (or resume) as soon as the bank is available. Guarded inside `open`,
  // which returns the existing session untouched if one is already in flight.
  //
  // `leaving` matters: committing a set changes progress.setIndex, which
  // changes `open`'s identity, which re-fires this effect during the frame
  // between finish() and the screen unmounting — silently starting and
  // persisting a session for the NEXT set the user never asked to begin.
  const leaving = useRef(false);
  useEffect(() => {
    if (ready && bank && !leaving.current) open();
  }, [ready, bank, open]);

  // Today is spent and there is nothing in flight. This has to be an explicit
  // screen: open() refuses, so `session` stays null, and body() returns null for
  // a null session -- which without this branch is a permanently blank page
  // under a header, reachable from the home card by one tap.
  const cappedOut = ready && !!bank && !session && daily.reached;

  // Android hardware back = the close button, not a silent no-op.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  const pos = currentPosition(session);
  const answer = pos != null && session ? session.answers[pos] : null;
  const locked = session?.phase === 'locked';

  // One state per option. `tried` beats everything: an option the user already
  // ruled out in an earlier round stays greyed even after she picks a new one.
  const optionStates = useMemo<OptionState[]>(() => {
    if (!currentQuestion) return [];
    return currentQuestion.options.map((_, i) => {
      if (locked && answer) {
        if (answer.picked === i) return answer.correct ? 'correct' : 'wrong';
        // Only reveal the right answer when she got it wrong — revealing it on
        // a correct pick would draw the eye away from her own answer.
        if (answer.correct === false && i === currentQuestion.answerIndex) return 'revealed';
      }
      if (pos != null && isTried(session, pos, i)) return 'tried';
      return 'idle';
    });
  }, [currentQuestion, locked, answer, session, pos]);

  const summary = session ? sessionSummary(session) : null;
  const roundLength = session ? session.queue.length : 0;
  const step = session ? session.cursor + 1 : 0;

  // Leave only when the bank is genuinely UNAVAILABLE — never merely because it
  // is reloading. Keying this on `!bank` used to eject the user mid-question
  // the instant she changed app language, since that re-triggers the fetch.
  useEffect(() => {
    if (ready && bankStatus === 'unavailable' && !bank) goHome();
  }, [ready, bankStatus, bank, navigation]);

  const body = () => {
    if (!session) return null;
    if (session.phase === 'summary' && summary) {
      return (
        <QuizReviewView
          segments={segments}
          correct={summary.correct}
          total={questions.length}
          wrong={summary.wrong}
          level={levelFor(progress.completedSets)}
          firstPassPerfect={summary.firstPassPerfect}
          completedSets={progress.completedSets}
          // <= 1, not === 1: a clock change or a lowered cap can land her here
          // with 0 remaining and a session still open, and `=== 1` would then
          // offer a "next set" button that open() silently refuses.
          lastOfDay={daily.remaining <= 1}
          onRetry={retry}
          onNextLevel={() => {
            // Commit and stay. `leaving` is NOT set: the auto-open effect is
            // exactly what starts the next set, which is the whole point.
            finish();
          }}
          onContinue={() => {
            leaving.current = true;
            // Decided BEFORE finish(), synchronously, from the set she is about
            // to commit. Navigating in the same tick as a granted draw would
            // unmount the screen before the overlay could show and the reward
            // would only surface on her next visit — but two sets in three earn
            // nothing, and those must still take her home. Waiting on the
            // pendingDraw effect for both would strand her on the results
            // screen with a dead button.
            const committed = progress.completedSets + 1;
            const earns = drawEarnedAt(committed, MYSTERY_EVERY);
            // The 4th, 8th, 12th… set completes a painting. Computed from the
            // committed count, synchronously, for the same reason the draw is:
            // the screen must know before finish() whether anything is going to
            // hold it open.
            // Clamped: past the last painting there is nothing new to finish,
            // and an unclamped index would replay a full "picture complete"
            // celebration for artwork 73 every four sets, forever, while the
            // grid never grew. QuizReviewView already handles this via
            // view.outOfArt.
            const pIdx = committed / TILES_PER_PAINTING - 1;
            const painting = committed % TILES_PER_PAINTING === 0 && pIdx < QUIZ_ART_COUNT
              ? pIdx
              : null;
            finish();
            if (painting != null) setFinishedPainting(painting);
            else if (!earns) goHome();
          }}
        />
      );
    }
    if (!currentQuestion) return null;
    return (
      <QuizQuestionView
        question={currentQuestion}
        optionStates={optionStates}
        locked={!!locked}
        wasCorrect={answer?.correct === true}
        isLast={step >= roundLength}
        onPick={pick}
        onNext={next}
      />
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} hitSlop={12} style={styles.close}>
          <Feather name="x" size={24} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.level} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.header.level', { n: levelFor(progress.completedSets) })}
          </Text>
        </View>
        {/* Balances the close button so the title stays optically centred. */}
        <View style={styles.close} />
      </View>

      <QuizSegmentBar segments={segments} height={6} style={styles.bar} />

      {session && session.phase !== 'summary' ? (
        <Text style={styles.counter} maxFontSizeMultiplier={1.3}>
          {t('quiz.header.progress', { n: step, total: roundLength })}
        </Text>
      ) : (
        <View style={styles.counterSpacer} />
      )}

      {cappedOut ? <DailyCapView limit={daily.limit} onClose={goHome} /> : body()}

      {/* The painting sits ON TOP of the card draw when both land on the same
          set (every 12th). She collects the picture, then the card — biggest
          reward last is wrong here: the card is the routine one, and burying
          the painting under it would make the rarer thing feel incidental. */}
      {drawing ? (
        <MysteryDrawOverlay
          blocked={finishedPainting != null}
          onDone={() => {
            drawDismissed.current = true;
            setDrawing(false);
            // A leftover draw hands her back the quiz she came here for; a draw
            // she just earned takes her home with it.
            if (resumedDraw.current) { resumedDraw.current = false; return; }
            goHome();
          }}
        />
      ) : null}

      {finishedPainting != null ? (
        <PaintingComplete
          paintingIndex={finishedPainting}
          onDone={() => {
            setFinishedPainting(null);
            // Only leave if no card draw is waiting underneath.
            if (!pendingDraw) goHome();
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Seven sets done. Congratulation, not a lockout.
 *
 * It offers a way onward rather than only a way out: she opened the quiz
 * wanting to do something with it, and a screen whose single control is "close"
 * is a dead end. The collection is the thing her seven sets were FOR.
 */
function DailyCapView({ limit, onClose }: { limit: number; onClose: () => void }) {
  const t = useT();
  return (
    <View style={styles.capRoot}>
      <View style={styles.capRing}>
        <MaterialCommunityIcons name="check-decagram-outline" size={40} color={ROSE} />
      </View>
      <Text style={styles.capTitle} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {t('quiz.daily.capTitle')}
      </Text>
      <Text style={styles.capBody} maxFontSizeMultiplier={1.3}>
        {t('quiz.daily.capBody', { total: limit })}
      </Text>
      <TouchableOpacity style={styles.capCta} activeOpacity={0.85} onPress={onClose} accessibilityRole="button">
        <Text style={styles.capCtaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('common.close')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  level: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: TXT, letterSpacing: 0.3,
  },
  bar: { marginHorizontal: 20 },
  counter: {
    fontFamily: FONTS.lato, fontSize: 13, color: TXTSUB,
    letterSpacing: 0.4, textAlign: 'center', marginTop: 10, height: 18,
  },
  counterSpacer: { height: 28 },

  capRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingBottom: 40 },
  capRing: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: ROSE_WASH, alignItems: 'center', justifyContent: 'center',
  },
  capTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 23,
    color: TXT, textAlign: 'center', letterSpacing: 0.3, marginTop: 22,
  },
  capBody: {
    fontFamily: FONTS.lato, fontSize: 14.5, lineHeight: 22, color: TXTSUB,
    textAlign: 'center', marginTop: 12, letterSpacing: 0.2,
  },
  capCta: {
    height: 52, minWidth: 200, paddingHorizontal: 28,
    borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center', marginTop: 30,
  },
  capCtaText: { fontFamily: FONTS.latoBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.4 },
});
