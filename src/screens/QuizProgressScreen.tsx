import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  BG, TXT, TXTSUB, ROSE, GREEN_DONE, INK_06, INK_10, FONTS, P,
} from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { levelFor, puzzleView } from '../state/quizProgress';
import { lastNDays } from '../state/quizHistory';
import { SET_SIZE } from '../services/quizSets';
import { QUIZ_ART_COUNT } from '../constants/quizArt';
import { MYSTERY_CARD_COUNT } from '../constants/mysteryCards';
import MysteryRewardBar from '../components/quiz/MysteryRewardBar';
import type { RootStackScreenProps } from '../navigation/types';

// Her quiz standing.
//
// EVERY NUMBER IS DERIVED. Nothing on this screen is stored, so it cannot drift
// from the ladder that produced it — the same doctrine as PuzzleCollectionScreen.
//
// What is deliberately NOT here, because the data does not exist:
//   • per-question or per-book accuracy — the session is discarded at commit,
//     so which questions she missed is gone and is not reconstructable
//   • an accuracy trend before this build — quiz:dates:v1 has no past
//   • `totalCorrect` as a hero number. It is monotone and mostly just
//     completedSets x 5; it tells her nothing she does not already know.
//
// The activity chart is GATED on a week of history. quiz:dates:v1 starts empty
// on every existing install and cannot be backfilled, so an ungated chart shows
// long-time users a blank axis as the first thing on the screen.

const CHART_MIN_DAYS = 7;
const CHART_WINDOW = 30;

function localYmd(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export default function QuizProgressScreen({ navigation }: RootStackScreenProps<'QuizProgress'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { progress, bank, cards, likes, history, historySummary } = useQuiz();

  const answered = progress.completedSets * SET_SIZE;
  // First-pass accuracy: what she got right the first time she saw it. Guarded
  // at zero sets — a brand-new user would otherwise read "NaN%".
  const accuracy = answered > 0 ? progress.totalCorrect / answered : null;
  const puzzle = puzzleView(progress.completedSets, QUIZ_ART_COUNT);

  // Capped at the bank size on purpose: the set stream cycles, so past set 65
  // she has genuinely seen everything and starts again. The label switches
  // rather than sitting at a permanently full bar with no explanation for why
  // questions are repeating.
  const seen = Math.min(progress.setIndex * SET_SIZE, bank?.length ?? 0);
  const fullCycle = !!bank && bank.length > 0 && seen >= bank.length;
  const coverage = bank && bank.length > 0 ? seen / bank.length : 0;

  const days = useMemo(
    () => lastNDays(history, localYmd(), CHART_WINDOW),
    [history],
  );
  const showChart = history.days.length >= CHART_MIN_DAYS;
  const peak = Math.max(1, ...days.map(d => d.sets));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.progress.title')}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statRow}>
          <Stat value={String(progress.completedSets)} label={t('quiz.progress.sets')} />
          <Stat
            value={accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`}
            label={t('quiz.progress.accuracy')}
            sub={answered > 0 ? t('quiz.progress.ofAnswered', { n: answered }) : undefined}
          />
          <Stat value={String(cards.collected.length)} label={t('quiz.progress.cards')} />
        </View>

        <View style={styles.line}>
          <MaterialCommunityIcons name="medal-outline" size={17} color={ROSE} />
          <Text style={styles.lineText} maxFontSizeMultiplier={1.3}>
            {t('quiz.progress.level', { n: levelFor(progress.completedSets) })}
          </Text>
        </View>
        {/* Hidden at zero. This app's readers often arrive low, and a dashboard
            that greets a returning user with "0 perfect levels" is a scoreboard
            telling her she is bad at it. The streak row already had this
            judgement; the same rule belongs here. */}
        {progress.perfectSets > 0 ? (
          <View style={styles.line}>
            <Feather name="check-circle" size={16} color={GREEN_DONE} />
            <Text style={styles.lineText} maxFontSizeMultiplier={1.3}>
              {t('quiz.progress.perfect', { n: progress.perfectSets })}
            </Text>
          </View>
        ) : null}
        {historySummary.streak > 0 ? (
          <View style={styles.line}>
            <Feather name="zap" size={16} color={ROSE} />
            <Text style={styles.lineText} maxFontSizeMultiplier={1.3}>
              {t('quiz.progress.streak', { n: historySummary.streak })}
            </Text>
          </View>
        ) : null}
        {/* Shown only when it beats the current run — that is exactly the user
            who came back after a lapse, and "you once did 12 days" is the one
            number on this screen that welcomes her instead of grading her. */}
        {historySummary.bestStreak > historySummary.streak ? (
          <View style={styles.line}>
            <Feather name="award" size={16} color={TXTSUB} />
            <Text style={styles.lineText} maxFontSizeMultiplier={1.3}>
              {t('quiz.progress.bestStreak', { n: historySummary.bestStreak })}
            </Text>
          </View>
        ) : null}

        {/* Bank coverage — the only question anyone actually asks about a quiz:
            how much of it is left. */}
        {bank && bank.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel} maxFontSizeMultiplier={1.3}>
              {fullCycle
                ? t('quiz.progress.coverageDone', { total: bank.length })
                : t('quiz.progress.coverage', { n: seen, total: bank.length })}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(coverage * 100)}%` }]} />
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <MysteryRewardBar completedSets={progress.completedSets} />
        </View>

        {showChart ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel} maxFontSizeMultiplier={1.3}>
              {t('quiz.progress.activity', { n: CHART_WINDOW })}
            </Text>
            <View style={styles.chart} accessibilityLabel={t('quiz.progress.activity', { n: CHART_WINDOW })}>
              {days.map(d => (
                <View key={d.ymd} style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      // Floor at 2 so a zero day still reads as a tick on the
                      // baseline rather than vanishing — a gap and a missing bar
                      // look identical, and one of them is data.
                      { height: d.sets > 0 ? Math.max(4, (d.sets / peak) * 46) : 2 },
                      d.sets > 0 ? styles.barOn : styles.barOff,
                    ]}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <NavRow
          icon="image"
          title={t('quiz.progress.puzzleRow')}
          detail={t('quiz.progress.puzzleDetail', { n: puzzle.completedPaintings, total: QUIZ_ART_COUNT })}
          onPress={() => navigation.navigate('PuzzleCollection')}
        />
        <NavRow
          icon="layers"
          title={t('quiz.progress.cardsRow')}
          detail={t('quiz.progress.cardsDetail', {
            n: cards.collected.length, total: MYSTERY_CARD_COUNT, liked: likes.liked.length,
          })}
          onPress={() => navigation.navigate('CardCollection')}
        />
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2} maxFontSizeMultiplier={1.2}>{label}</Text>
      {sub ? <Text style={styles.statSub} numberOfLines={1} maxFontSizeMultiplier={1.1}>{sub}</Text> : null}
    </View>
  );
}

function NavRow({
  icon, title, detail, onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Feather name={icon} size={20} color={ROSE} />
      <View style={styles.navCopy}>
        <Text style={styles.navTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={styles.navDetail} numberOfLines={1} maxFontSizeMultiplier={1.2}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={TXTSUB} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: TXT, letterSpacing: 0.3,
  },
  scroll: { paddingHorizontal: P, paddingTop: 8 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: INK_06, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10 },
  statValue: { fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 24, color: TXT },
  statLabel: { fontFamily: FONTS.lato, fontSize: 12.5, color: TXTSUB, marginTop: 4, lineHeight: 17 },
  statSub: { fontFamily: FONTS.lato, fontSize: 11, color: TXTSUB, marginTop: 2, opacity: 0.8 },

  line: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  lineText: { flex: 1, fontFamily: FONTS.lato, fontSize: 14, color: TXT, letterSpacing: 0.2 },

  block: { marginTop: 22 },
  blockLabel: { fontFamily: FONTS.latoBold, fontSize: 13.5, color: TXT, letterSpacing: 0.3, marginBottom: 9 },
  track: { height: 6, borderRadius: 10, backgroundColor: INK_10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 10, backgroundColor: ROSE },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 2 },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 3, width: '100%' },
  barOn: { backgroundColor: ROSE },
  barOff: { backgroundColor: INK_10 },

  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 16, marginTop: 12,
  },
  navCopy: { flex: 1, minWidth: 0 },
  navTitle: { fontFamily: FONTS.latoBold, fontSize: 14.5, color: TXT, letterSpacing: 0.2 },
  navDetail: { fontFamily: FONTS.lato, fontSize: 12.5, color: TXTSUB, marginTop: 2 },
});
