import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ROSE, GREEN_DONE, TXT, TXTSUB, BTN_RADIUS, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import QuizSegmentBar from './QuizSegmentBar';
import PuzzleBoard from './PuzzleBoard';
import MysteryRewardBar from './MysteryRewardBar';
import { rewardPreview } from '../../state/quizProgress';
import { QUIZ_ART_COUNT } from '../../constants/quizArt';
import type { SegmentState } from '../../state/quizSession';

// End-of-round screen.
//
// Two shapes, one component, because they differ only in the CTA:
//   wrong > 0 → "try those again" (the set is NOT finished; the reducer refuses
//               to complete a set with a wrong answer still standing)
//   wrong = 0 → "continue", which commits the set and advances the ladder
//
// Presentational: it reports what the reducer already decided and never
// re-derives the score.

export default function QuizReviewView({
  segments, correct, total, wrong, level, firstPassPerfect, completedSets,
  onRetry, onContinue,
}: {
  segments: SegmentState[];
  correct: number;
  total: number;
  wrong: number;
  level: number;
  firstPassPerfect: boolean;
  /** Sets completed BEFORE this one. The reward preview looks one ahead. */
  completedSets: number;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const done = wrong === 0;

  // The board shows the state AFTER this set commits, with the tile it earns
  // ringed. Showing the pre-commit state would mean the reward only appears
  // once she has already tapped away from the screen celebrating it.
  const { view, freshTile } = rewardPreview(completedSets, QUIZ_ART_COUNT);
  const boardSize = Math.min(width - 88, 240);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.ring, done && styles.ringDone]}>
          <MaterialCommunityIcons
            name={done ? 'medal-outline' : 'refresh'}
            size={42}
            color={done ? GREEN_DONE : ROSE}
          />
        </View>

        <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {done
            ? (firstPassPerfect ? t('quiz.review.perfect') : t('quiz.review.done'))
            : t('quiz.review.almost')}
        </Text>

        <Text style={styles.score} maxFontSizeMultiplier={1.3}>
          {t('quiz.review.score', { n: correct, total })}
        </Text>

        <QuizSegmentBar segments={segments} height={8} style={styles.bar} />

        <Text style={styles.sub} maxFontSizeMultiplier={1.3}>
          {done ? t('quiz.review.levelDone', { n: level }) : t('quiz.review.retryHint', { n: wrong })}
        </Text>

        {/* The reward only appears once the set is actually finished. Showing a
            puzzle tile beside "2 still wrong" would promise something the user
            hasn't earned and can't collect yet. */}
        {done ? (
          <>
            <Text style={styles.rewardLabel} maxFontSizeMultiplier={1.3}>
              {view.outOfArt ? t('quiz.reward.allArt') : t('quiz.reward.tile')}
            </Text>
            <PuzzleBoard
              paintingIndex={view.paintingIndex}
              tilesUnlocked={view.tilesUnlocked}
              size={boardSize}
              newTile={freshTile}
            />
            <View style={styles.mystery}>
              <MysteryRewardBar completedSets={completedSets + 1} />
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.85}
          onPress={done ? onContinue : onRetry}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {done ? t('quiz.action.continue') : t('quiz.action.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, alignItems: 'center' },
  // Tinted disc, no shadow — the app's badge treatment.
  ring: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(216,138,161,0.12)',
    marginBottom: 20,
  },
  ringDone: { backgroundColor: 'rgba(125,184,125,0.14)' },
  headline: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 24,
    color: TXT, textAlign: 'center', letterSpacing: 0.3,
  },
  score: {
    fontFamily: FONTS.merriweather, fontSize: 17.3,
    color: TXTSUB, textAlign: 'center', marginTop: 10,
  },
  bar: { marginTop: 22 },
  rewardLabel: {
    fontFamily: FONTS.latoBold, fontSize: 13.5, color: TXTSUB,
    letterSpacing: 0.5, textAlign: 'center', marginTop: 30, marginBottom: 14,
    textTransform: 'uppercase',
  },
  mystery: { marginTop: 26, width: '100%' },
  sub: {
    fontFamily: FONTS.lato, fontSize: 14.5, color: TXTSUB,
    textAlign: 'center', marginTop: 18, lineHeight: 21,
  },
  footer: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: {
    fontFamily: FONTS.latoBold, fontSize: 16.5, color: '#FFFFFF', letterSpacing: 0.4,
  },
});
