import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useQuiz } from '../../state/QuizContext';
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

export default function QuizChallengeCard({ onPress }: { onPress: () => void }) {
  const t = useT();
  const { ready, bank, progress, session, segments } = useQuiz();

  if (!ready || !bank) return null;

  const answered = segments.filter(s => s !== 'empty').length;
  const inProgress = !!session && answered > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('quiz.card.title')}. ${t('quiz.card.answered', { n: answered })}`}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name="medal-outline" size={24} color={ROSE} />
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{t('quiz.card.title')}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {inProgress
              ? t('quiz.card.answered', { n: answered })
              : t('quiz.card.level', { n: progress.completedSets + 1 })}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={TXTSUB} />
      </View>

      <QuizSegmentBar segments={segments} height={6} style={styles.bar} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
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
