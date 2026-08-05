import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BG, TXT, TXTSUB, FONTS, ROSE, ROSE_WASH, BTN_RADIUS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { currentPosition, isTried, sessionSummary } from '../state/quizSession';
import { levelFor, TILES_PER_PAINTING } from '../state/quizProgress';
import { SET_SIZE } from '../services/quizSets';
import { QUIZ_ART_COUNT } from '../constants/quizArt';
import QuizSegmentBar from '../components/quiz/QuizSegmentBar';
import QuizQuestionView from '../components/quiz/QuizQuestionView';
import QuizReviewView from '../components/quiz/QuizReviewView';
import MysteryDrawOverlay from '../components/quiz/MysteryDrawOverlay';
import PaintingComplete from '../components/quiz/PaintingComplete';
import type { OptionState } from '../components/quiz/QuizOptionButton';
import { maybeShowInterstitial } from '../services/ads';
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
    open, pick, next, retry, finish, pendingDraw, daily, lifecycle,
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
  // Cleared whenever a NEW draw is granted. Without this, `drawDismissed` is a
  // one-way latch for the whole visit: arrive with a leftover draw, deal with
  // it, then earn another one three sets later, and the overlay silently
  // refuses to open — her new card swallowed with nothing anywhere hinting one
  // was owed.
  const prevPending = useRef(false);
  useEffect(() => {
    if (pendingDraw && !prevPending.current) drawDismissed.current = false;
    prevPending.current = pendingDraw;
  }, [pendingDraw]);
  // Two taps in one frame dispatch two GO_BACKs; the second pops the parent and
  // she lands two screens away from where she meant to be.
  const navLock = useRef(false);
  const goHome = () => {
    if (navLock.current) return;
    navLock.current = true;
    navigation.goBack();
  };
  // Takes the lock too. It only READ it before, so "collection" followed
  // quickly by "close" replaced this route and then dispatched GO_BACK with a
  // dead source key — which bubbles to the parent navigator and pops her two
  // screens away, the exact thing navLock exists to stop.
  const goCollection = () => {
    if (navLock.current) return;
    navLock.current = true;
    navigation.replace('PuzzleCollection');
  };

  // A finished painting gets its own moment. Four sets and twenty questions is
  // a bigger thing than one set, and folding it into the same results card
  // would make the larger achievement read as the smaller one.
  const [finishedPainting, setFinishedPainting] = useState<number | null>(null);

  // A draw interrupted by a force quit is offered again on the next open —
  // pendingDraw is persisted and only ever spent by collecting a card.
  useEffect(() => {
    if (!ready || !pendingDraw || drawing || drawDismissed.current) return;
    setDrawing(true);
  }, [ready, pendingDraw, drawing]);

  // Start (or resume) as soon as the bank is available. Guarded inside `open`,
  // which returns the existing session untouched if one is already in flight —
  // and refuses outright once the day is capped or the bank is finished, in
  // which case the capped/retired views below own the screen instead.
  //
  // This effect is ALSO what makes "Next level" work: committing a set changes
  // progress.setIndex, which re-fires it, which starts the next set — while any
  // celebration (painting, card draw) plays out on top.
  useEffect(() => {
    if (ready && bank) open();
  }, [ready, bank, open]);

  // Today is spent and there is nothing in flight. This has to be an explicit
  // screen: open() refuses, so `session` stays null, and body() returns null for
  // a null session -- which without this branch is a permanently blank page
  // under a header, reachable from the home card by one tap.
  const cappedOut = ready && !!bank && !session && daily.reached && !lifecycle.retired;
  // Retirement outranks the daily cap: "come back tomorrow" would be a lie once
  // there is nothing left to come back to. Reachable even with the home card
  // gone -- the collection screens link here, and Android can restore this route
  // from a saved navigation state.
  const retiredOut = ready && !!bank && !session && lifecycle.retired;

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
        // The right answer is NOT surfaced after a miss (per user): tinting it
        // green handed her the answer before the retry round could ask again.
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
          firstPassPerfect={summary.firstPassPerfect}
          completedSets={progress.completedSets}
          // <= 1, not === 1: a clock change or a lowered cap can land her here
          // with 0 remaining and a session still open, and `=== 1` would then
          // offer a "next set" button that open() silently refuses.
          lastOfDay={daily.remaining <= 1}
          // Computed from the set she is ABOUT to commit, the same way earns and
          // painting are. `lifecycle.retired` is still false at this point.
          lastEver={(progress.setIndex + 1) * SET_SIZE >= (bank?.length ?? 0)}
          setsLeftAfter={Math.max(0, daily.remaining - 1)}
          onRetry={() => {
            // Interstitial on the retry transition.
            //
            // WHY HERE and nowhere else in the quiz. It is a real break: she has
            // read her results and tapped a button that changes what is on
            // screen, which is the pattern the store policies ask for. Every
            // other moment in this feature is either mid-question (disallowed)
            // or already occupied by a reward — an ad landing on the card draw
            // or the finished-painting celebration would step on the thing she
            // played for.
            //
            // ORDER MATTERS: retry() first, so the questions are already on
            // screen underneath and closing the ad returns her straight to
            // them. Same shape as PrayerFlow's amen and PlanDayWalk's day-end.
            // maybeShowInterstitial is synchronous, returns nothing, and
            // silently no-ops when nothing is loaded — never branch on it.
            //
            // A user who never gets one wrong never sees this ad at all. That
            // is the design, not an oversight.
            retry();
            // EVERY retry, on purpose. An audit proposed capping this at one per
            // visit; the owner rejected it, and the reasoning is his to make:
            // more attempts should mean more impressions. Do not re-add a cap
            // here without asking him.
            //
            // In practice MIN_INTERVAL_MS in services/ads.ts already holds it to
            // one interstitial a minute across the whole app, and a retry round
            // of one or two questions runs 10-25 s — so consecutive retries
            // mostly fall inside that floor and show nothing. Measure
            // ad_impression_custom with placement=quiz_retry rather than
            // counting taps; the two numbers will differ a lot.
            //
            // The 400 ms is NOT a frequency control and should stay. "Try those
            // again" is the primary footer CTA, a double-tap on a retry button
            // is a reflex, and presenting inside the same touch window puts the
            // second tap on the creative. At scale a pattern of accidental
            // clicks is what gets an AdMob account flagged for invalid traffic —
            // it costs revenue rather than protecting the user from it.
            setTimeout(() => maybeShowInterstitial('quiz_retry'), 400);
          }}
          onNextLevel={() => {
            // Commit and stay. The auto-open effect starts the next set (or the
            // capped/retired view takes the screen), so the button IS the next
            // level — no trip home between sets.
            //
            // The 4th, 8th, 12th… set completes a painting. Computed from the
            // count she is ABOUT to commit, synchronously — the celebration has
            // to mount in the same breath as the commit, not a render later.
            // Clamped: past the last painting there is nothing new to finish,
            // and an unclamped index would replay a full "picture complete"
            // celebration for artwork 25 every four sets, forever, while the
            // grid never grew. QuizReviewView already handles this via
            // view.outOfArt.
            //
            // A draw set (every 3rd) needs nothing from us here: the grant
            // lands a render after finish(), the grant clears the dismissed
            // latch, and the pendingDraw effect opens the overlay on top of
            // whatever now owns the screen.
            const committed = progress.completedSets + 1;
            const pIdx = committed / TILES_PER_PAINTING - 1;
            const painting = committed % TILES_PER_PAINTING === 0 && pIdx < QUIZ_ART_COUNT
              ? pIdx
              : null;
            finish();
            if (painting != null) setFinishedPainting(painting);
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
        onPick={pick}
        onNext={next}
      />
    );
  };

  // The results screen carries no level title, no bar and no counter (per
  // user) — its own body has the reward layout, and two progress bars on one
  // screen was exactly the complaint. Only the close button survives.
  const inSummary = session?.phase === 'summary';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} hitSlop={12} style={styles.close}>
          <Feather name="x" size={24} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          {!inSummary ? (
            <Text style={styles.level} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {t('quiz.header.level', { n: levelFor(progress.completedSets) })}
            </Text>
          ) : null}
        </View>
        {/* Balances the close button so the title stays optically centred. */}
        <View style={styles.close} />
      </View>

      {!inSummary ? (
        <>
          <QuizSegmentBar segments={segments} height={9} style={styles.bar} />
          {session ? (
            <Text style={styles.counter} maxFontSizeMultiplier={1.3}>
              {t('quiz.header.progress', { n: step, total: roundLength })}
            </Text>
          ) : (
            <View style={styles.counterSpacer} />
          )}
        </>
      ) : null}

      {retiredOut ? (
        <QuizDoneView
          onCollection={goCollection}
          onClose={goHome}
        />
      ) : cappedOut ? (
        <DailyCapView
          limit={daily.limit}
          onCollection={goCollection}
          onClose={goHome}
        />
      ) : body()}

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
            // Always stays: underneath is whatever legitimately owns the screen
            // now — the next set the commit auto-opened, the daily-cap view, or
            // QuizDoneView on the set that finished the bank.
          }}
        />
      ) : null}

      {finishedPainting != null ? (
        <PaintingComplete
          paintingIndex={finishedPainting}
          onDone={() => {
            // Closing the celebration just uncovers the screen's real owner —
            // the next set, the draw overlay (unblocked by this very state
            // change), the daily-cap view, or QuizDoneView.
            setFinishedPainting(null);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Every question answered. The end of the content, not the end of a day.
 *
 * Separate from DailyCapView because the two say opposite things: the cap says
 * come back tomorrow, and here there is nothing to come back to until the bank
 * grows. Telling her to return tomorrow would be a promise the app cannot keep.
 */
function QuizDoneView({ onCollection, onClose }: { onCollection: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <View style={styles.capRoot}>
      <View style={styles.capRing}>
        <MaterialCommunityIcons name="trophy-outline" size={40} color={ROSE} />
      </View>
      <Text style={styles.capTitle} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {t('quiz.done.title')}
      </Text>
      <Text style={styles.capBody} maxFontSizeMultiplier={1.3}>
        {t('quiz.done.body')}
      </Text>
      <TouchableOpacity style={styles.capCta} activeOpacity={0.85} onPress={onCollection} accessibilityRole="button">
        <Text style={styles.capCtaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('quiz.progress.puzzleRow')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.capSecondary} activeOpacity={0.7} onPress={onClose} accessibilityRole="button">
        <Text style={styles.capSecondaryText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('common.close')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Today's sets are done. Congratulation, not a lockout.
 *
 * It offers a way onward rather than only a way out: she opened the quiz
 * wanting to do something with it, and a screen whose single control is "close"
 * is a dead end. The collection is the thing her three sets were FOR.
 */
function DailyCapView({
  limit, onCollection, onClose,
}: {
  limit: number;
  onCollection: () => void;
  onClose: () => void;
}) {
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
      {/* The collection is what her three sets were FOR. A screen whose only
          control is "close" sends her away from the thing she just earned. */}
      <TouchableOpacity style={styles.capCta} activeOpacity={0.85} onPress={onCollection} accessibilityRole="button">
        <Text style={styles.capCtaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('quiz.progress.puzzleRow')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.capSecondary} activeOpacity={0.7} onPress={onClose} accessibilityRole="button">
        <Text style={styles.capSecondaryText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
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
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 19.26,   // 18 → +7 % per user
    color: TXT, letterSpacing: 0.3,
  },
  // 70 % of the width, centred (per user). It used to be `marginHorizontal: 20`
  // against a track that also declared `width: '100%'`, which measured the
  // parent and ran the bar off the right edge of the screen.
  bar: { width: '70%', alignSelf: 'center' },
  counter: {
    // 13 → 14.3 (+10 %) and marginTop 10 → 15 (+5) per user. `height` grows with
    // the type or Android clips the descenders.
    fontFamily: FONTS.lato, fontSize: 14.3, color: TXTSUB,
    letterSpacing: 0.4, textAlign: 'center', marginTop: 15, height: 20,
  },
  // Stands in for the counter on the summary — must match its total box
  // (15 + 20) or the body jumps as the set ends.
  counterSpacer: { height: 35 },

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
  capCtaText: { fontFamily: FONTS.latoBold, fontSize: 17.5, color: '#FFFFFF', letterSpacing: 0.4 },   // CTA size unified at 17.5 (was 16) — per user
  capSecondary: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  capSecondaryText: { fontFamily: FONTS.latoBold, fontSize: 14.5, color: ROSE, letterSpacing: 0.3 },
});
