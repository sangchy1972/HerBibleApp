import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, BTN_RADIUS, FONTS, P } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useQuiz } from '../../state/QuizContext';
import { levelFor } from '../../state/quizProgress';
import { currentPosition, isTried } from '../../state/quizSession';
import { SET_SIZE } from '../../services/quizSets';
import QuizSegmentBar from '../quiz/QuizSegmentBar';
import QuizOptionButton, { type OptionState } from '../quiz/QuizOptionButton';
import QuizVerdict from '../quiz/QuizVerdict';
import { useAutoAdvance } from '../quiz/useAutoAdvance';

// Home-screen Quiz Challenge, below My Reading Plans.
//
// It used to be a one-line teaser (medal + "Level 1 · 5 questions" + chevron)
// that the user reported people simply never noticed. It is now the QUESTION
// ITSELF: title, the segment bar under it, the question, and the four options,
// all answerable in place — so the tap that starts a set is the tap that answers
// the first question, with no navigation in between.
//
// The split with QuizChallengeScreen is deliberate: home owns ANSWERING, the
// screen owns RESULTS AND REWARDS (retry, puzzle tile, mystery draw, finished
// painting). So the last question's CTA hands off to the screen rather than
// growing a second copy of the results flow here.
//
// Type sizes, fonts and option styling are the quiz's own (QuizOptionButton is
// literally the same component the full screen uses), so the card reads as the
// quiz rather than as a home-screen imitation of it.
//
// Renders NOTHING until the bank has landed. The bank is fetched from the CDN, so
// a device that has never been online genuinely has no questions — and a card
// that opens into an empty quiz is worse than no card. That absence is the
// designed behaviour, not a failure state to paper over with a spinner.

export default function QuizChallengeCard({
  onPress, onOpenCollection,
}: {
  onPress: () => void;
  onOpenCollection: () => void;
}) {
  const t = useT();
  const isFocused = useIsFocused();
  const {
    ready, bank, progress, session, questions, currentQuestion, segments,
    daily, lifecycle, pendingDraw, startAndPick, next,
  } = useQuiz();

  const pos = currentPosition(session);
  const answer = pos != null && session ? session.answers[pos] ?? null : null;
  const locked = session?.phase === 'locked';
  const inSummary = session?.phase === 'summary';
  // Mid-set: the live question. Before the set begins: its first question, so the
  // card is never sitting there with nothing to answer — which is the entire
  // point of moving the quiz onto the home screen.
  const question = currentQuestion ?? (session ? null : questions[0] ?? null);
  const questionPos = pos ?? 0;
  const roundLength = session ? session.queue.length : SET_SIZE;
  const step = session ? session.cursor + 1 : 1;
  const isLast = step >= roundLength;

  // One state per option, same rules as the full screen: `tried` beats
  // everything, so an option ruled out in an earlier round stays greyed.
  const optionStates = useMemo<OptionState[]>(() => {
    if (!question) return [];
    return question.options.map((_, i) => {
      if (locked && answer) {
        if (answer.picked === i) return answer.correct ? 'correct' : 'wrong';
        // The right answer is NOT surfaced after a miss (per user): tinting it
        // green handed her the answer before the retry round could ask again.
      }
      if (isTried(session, questionPos, i)) return 'tried';
      return 'idle';
    });
  }, [question, locked, answer, session, questionPos]);

  // Same held reveal as the full screen, then move on by itself. On the LAST
  // question of the round that means handing off: the summary, the retry round,
  // the puzzle tile and the card draw all live on the full screen, and next()
  // runs first so it is already in `summary` when that screen mounts instead of
  // flashing the answered question again.
  //
  // Above the early returns, like every other hook here — a conditional hook
  // would blow up the moment the bank lands or the quiz retires.
  useAutoAdvance(!!locked, () => {
    next();
    // `isFocused` is load-bearing: the card stays mounted when she switches tabs,
    // so answering the last question and moving to the Bible reader inside the 2s
    // hold would otherwise shove a full-screen quiz over what she is reading. The
    // set just waits in `summary`, which the compact "Reward waiting" card already
    // handles the next time she looks at home.
    if (isLast && isFocused) onPress();
  });

  if (!ready || !bank) return null;
  // RETIRED. Every question in the bank has been served, so the card would be
  // offering a game whose content she has finished. It goes away rather than
  // pretending -- and because `retired` is derived from the bank on the device
  // (state/quizLifecycle.ts), shipping more questions brings it back on its own.
  //
  // Not a dead end: Profile keeps My Progress, My Cards and the puzzle
  // collection, so everything she earned is still one tap from the same place
  // it always was.
  //
  // `&& !pendingDraw` is load-bearing. The set that retires the quiz ALSO earns
  // a draw whenever the reachable-set count divides by MYSTERY_EVERY — which it
  // does today, 66 / 3 — and this screen is the only route to the overlay that
  // spends it. Hiding unconditionally cost her that card forever, with nothing
  // anywhere even hinting one was owed. She still cannot START anything;
  // canStart stays false.
  if (lifecycle.retired && !pendingDraw) return null;

  const answered = segments.filter(s => s !== 'empty').length;
  // Today is spent with nothing in flight. Also covers `questions` coming back
  // short of a full set, which open() refuses to start.
  const cappedOut = !session && daily.reached;

  const header = (
    <>
      <View style={styles.header}>
        {/* The medal is its own target: it opens the collection, not the quiz.
            Nested inside a touchable, which RN handles — the inner one wins.
            hitSlop keeps it reachable without growing the icon. */}
        <TouchableOpacity
          onPress={onOpenCollection}
          // Asymmetric on purpose: generous everywhere except the right side,
          // where a symmetric slop would reach past `headerCopy`'s 14 pt margin
          // and steal taps aimed at the title — opening the collection when she
          // meant to open the quiz.
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('quiz.collection.title')}
        >
          <MaterialCommunityIcons name="medal-outline" size={24} color={ROSE} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{t('quiz.card.title')}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={TXTSUB} />
      </View>

      {/* Under the title, as on the full screen (and as the reference layout the
          user asked for). */}
      <QuizSegmentBar segments={segments} height={6} style={styles.bar} />

      <Text style={styles.status} numberOfLines={1}>
        {inSummary
          ? segments.every(s => s === 'correct') ? t('quiz.card.claim') : t('quiz.card.answered', { n: answered })
          : cappedOut
            ? t('quiz.daily.capCard', { total: daily.limit })
            : session
              ? t('quiz.header.progress', { n: step, total: roundLength })
              : t('quiz.card.level', { n: levelFor(progress.completedSets) })}
      </Text>
    </>
  );

  // No question to show — a set sitting in `summary` (results belong on the full
  // screen), today's allowance spent, or a bank too short to deal a set. Falls
  // back to the compact teaser, whole-card tappable, exactly as before.
  if (!question || inSummary || cappedOut) {
    return (
      <View style={styles.outer}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('quiz.card.title')}
        >
          {header}
          {inSummary ? (
            <View style={[styles.cta, styles.ctaSpaced]}>
              <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {t('quiz.action.seeResults')}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      {/* NOT one big touchable anymore: the options are the touch targets, and a
          card-wide press would compete with them for every tap. Only the header
          row opens the full screen. */}
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('quiz.card.title')}
        >
          {header}
        </TouchableOpacity>

        <Text style={styles.question} maxFontSizeMultiplier={1.4}>
          {question.question}
        </Text>

        <View style={styles.options}>
          {question.options.map((label, i) => (
            <QuizOptionButton
              key={i}
              label={label}
              state={optionStates[i] ?? 'idle'}
              disabled={!!locked}
              // Starts the set on the first tap. startAndPick does both halves in
              // one update — open() then pick() would answer into a session that
              // does not exist yet and the tap would be swallowed.
              onPress={() => startAndPick(i)}
            />
          ))}
        </View>

        {/* Appears BELOW the options, never above: growing the card downward
            leaves everything she is looking at exactly where it was. */}
        {locked ? (
          <View style={styles.verdictSlot}>
            <QuizVerdict correct={answer?.correct === true} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Owned here, not by the caller — see the note at the call site in
  // PrayerScreen. Mirrors that screen's `section` style (paddingHorizontal: P).
  outer: { paddingHorizontal: P, paddingTop: 20 },
  // Flat white card, no border, no shadow — the app's card system (matches
  // MyReadingPlansCard directly above it, so the two read as siblings).
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  // Sized to PrayerScreen's sectionTitle so the card sits in the same visual
  // register as its neighbours — deliberately NOT the +8% quiz scale, which
  // applies inside the quiz itself.
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 19.85,
    color: TXT, letterSpacing: 0.3,
  },
  bar: { marginTop: 14 },
  // Centred under the bar, matching the full screen's counter row.
  status: {
    fontFamily: FONTS.lato, fontSize: 13, color: TXTSUB,
    letterSpacing: 0.4, textAlign: 'center', marginTop: 10,
  },
  // The quiz's own question type: Merriweather at the +8 % scale.
  question: {
    fontFamily: FONTS.merriweather, fontSize: 19.87, lineHeight: 28.5,
    color: TXT, letterSpacing: 0.1, marginTop: 16, marginBottom: 18,
  },
  // Cancels the trailing option's own 11 marginBottom so the card's 16 of
  // padding is the only gap under the last one.
  options: { marginBottom: -11 },
  // The 11 the last option already carries is part of this gap.
  verdictSlot: { paddingTop: 10 },
  // The app's primary CTA: rose, BTN_RADIUS, no shadow. In the footer the
  // verdict's own marginBottom is the gap; the compact variant has no verdict
  // and adds ctaSpaced instead.
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaSpaced: { marginTop: 16 },
  ctaText: {
    fontFamily: FONTS.latoBold, fontSize: 16.5, color: '#FFFFFF', letterSpacing: 0.4,
  },
});
