import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, FONTS, P } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useQuiz } from '../../state/QuizContext';
import { levelFor } from '../../state/quizProgress';
import QuizSegmentBar from '../quiz/QuizSegmentBar';

// Home-screen entry point for the Quiz Challenge, below My Reading Plans.
//
// Renders NOTHING until the bank has landed. The bank is fetched from the CDN,
// so a device that has never been online genuinely has no questions — and a
// card that opens into an empty quiz is worse than no card. That absence is the
// designed behaviour, not a failure state to paper over with a spinner.
//
// Layout follows the competitor the user referenced, minus the ornamental
// filigree frame: title row with a medal, a one-line status, and the
// 5-segment bar. The whole card is the touch target; the chevron is decorative.

export default function QuizChallengeCard({
  onPress, onOpenCollection,
}: {
  onPress: () => void;
  onOpenCollection: () => void;
}) {
  const t = useT();
  const { ready, bank, progress, session, segments, daily, lifecycle, pendingDraw } = useQuiz();

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
  const inProgress = !!session && answered > 0;
  // A set sitting in `summary` is finished but not yet claimed — she closed the
  // app on the results screen. "5 of 5 answered" reads as nothing left to do,
  // when in fact a puzzle piece is waiting behind one tap.
  const awaitingClaim = session?.phase === 'summary' && segments.every(s => s === 'correct');
  // Capped, with nothing left in flight. Ranked BELOW the two in-progress states
  // on purpose: a set she has already started is still finishable, and telling
  // her she is done for the day while a half-answered set waits behind the tap
  // would be a lie she can immediately disprove.

  return (
    <View style={styles.outer}>
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('quiz.card.title')}. ${t('quiz.card.answered', { n: answered })}`}
    >
      <View style={styles.header}>
        {/* The medal is its own target: it opens the collection, not the quiz.
            Nested inside the card's touchable, which RN handles — the inner
            one wins. hitSlop keeps it reachable without growing the icon. */}
        <TouchableOpacity
          onPress={onOpenCollection}
          // Asymmetric on purpose: generous everywhere except the right side,
          // where a symmetric slop would reach past `headerCopy`'s 14 pt margin
          // and steal taps aimed at the title — opening the collection when she
          // meant to start the quiz.
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('quiz.collection.title')}
        >
          <MaterialCommunityIcons name="medal-outline" size={24} color={ROSE} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{t('quiz.card.title')}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {awaitingClaim
              ? t('quiz.card.claim')
              : inProgress
                ? t('quiz.card.answered', { n: answered })
                : daily.reached
                  ? t('quiz.daily.capCard', { total: daily.limit })
                  : daily.done > 0
                    ? t('quiz.daily.remaining', { n: daily.remaining, total: daily.limit })
                    : t('quiz.card.level', { n: levelFor(progress.completedSets) })}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={TXTSUB} />
      </View>

      <QuizSegmentBar segments={segments} height={6} style={styles.bar} />
    </TouchableOpacity>
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
  sub: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    letterSpacing: 0.2, marginTop: 2,
  },
  bar: { marginTop: 14 },
});
