import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ROSE, TXT, TXTSUB, BTN_RADIUS, FONTS, ROSE_WASH } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import QuizSegmentBar from './QuizSegmentBar';
import PuzzleBoard from './PuzzleBoard';
import MysteryRewardBar from './MysteryRewardBar';
import { rewardPreview, MYSTERY_EVERY, TILES_PER_PAINTING } from '../../state/quizProgress';
import { drawEarnedAt } from '../../state/cardDraw';
import { DAILY_SET_LIMIT } from '../../state/quizHistory';
import { QUIZ_ART_COUNT } from '../../constants/quizArt';
import type { SegmentState } from '../../state/quizSession';

// End-of-round screen.
//
// Two shapes, one component:
//   wrong > 0 → "try those again" (the set is NOT finished; the reducer refuses
//               to complete a set with a wrong answer still standing)
//   wrong = 0 → the reward layout from the reference design: headline, "puzzle
//               piece unlocked", the big board with 15dp side margins, the
//               mystery-reward countdown, and ONE button — Next level.
//
// The done shape deliberately carries NO ring, NO score line, NO segment bar
// and NO "Level N complete" (per user): all of that restated what the headline
// already says, and the screen is about the reward now.
//
// Presentational: it reports what the reducer already decided and never
// re-derives the score.

export default function QuizReviewView({
  segments, correct, total, wrong, firstPassPerfect, completedSets,
  lastOfDay, lastEver, setsLeftAfter, onRetry, onNextLevel,
}: {
  segments: SegmentState[];
  correct: number;
  total: number;
  wrong: number;
  firstPassPerfect: boolean;
  /** Sets completed BEFORE this one. The reward preview looks one ahead. */
  completedSets: number;
  /** Committing this set spends the last of today's three. The CTA still
   *  commits; the line above it says today ends here. */
  lastOfDay: boolean;
  /** Committing this set uses up the last question in the bank, so there is no
   *  next level to offer -- ever, not just today. */
  lastEver: boolean;
  /** Sets left today AFTER this one commits. Shown on EVERY set, so the third
   *  ends a countdown she has been watching instead of ambushing her. */
  setsLeftAfter: number;
  onRetry: () => void;
  /** Commit. The screen decides what owns it next — the next set, a
   *  celebration, or the capped/retired view. */
  onNextLevel: () => void;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const done = wrong === 0;

  // The board shows the state AFTER this set commits, with the tile it earns
  // ringed. Showing the pre-commit state would mean the reward only appears
  // once she has already tapped away from the screen celebrating it.
  const { view, freshTile } = rewardPreview(completedSets, QUIZ_ART_COUNT);
  // 15dp side margins (per user) — the board is the screen's hero now.
  const boardSize = width - 30;
  // The set she is about to commit. The counter has to read from the COMMITTED
  // number or the screen that celebrates a card says "3 more to go" with an
  // empty bar — she watched that counter for three sets and never saw it land.
  const earnsCard = drawEarnedAt(completedSets + 1, MYSTERY_EVERY);

  if (!done) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.retryContent} showsVerticalScrollIndicator={false}>
          <View style={styles.ring}>
            <MaterialCommunityIcons name="refresh" size={42} color={ROSE} />
          </View>
          <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {t('quiz.review.almost')}
          </Text>
          <Text style={styles.score} maxFontSizeMultiplier={1.3}>
            {t('quiz.review.score', { n: correct, total })}
          </Text>
          <QuizSegmentBar segments={segments} height={8} style={styles.bar} />
          <Text style={styles.sub} maxFontSizeMultiplier={1.3}>
            {t('quiz.review.retryHint', { n: wrong })}
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {t('quiz.action.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {firstPassPerfect ? t('quiz.review.perfect') : t('quiz.review.done')}
        </Text>

        <Text style={styles.rewardLabel} maxFontSizeMultiplier={1.3}>
          {view.outOfArt ? t('quiz.reward.allArt') : t('quiz.reward.tile')}
        </Text>

        {/* showCaption: three reward moments in four were an unnamed quarter
            of an unnamed picture. She is collecting a Caravaggio; the least
            the screen can do is say so while she earns it. */}
        <PuzzleBoard
          paintingIndex={view.paintingIndex}
          tilesUnlocked={view.tilesUnlocked}
          size={boardSize}
          newTile={freshTile}
          showCaption
        />

        <View style={styles.mystery}>
          {earnsCard ? (
            <View style={styles.unlocked}>
              <MaterialCommunityIcons name="gift-outline" size={19} color={ROSE} />
              <Text style={styles.unlockedText} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                {t('quiz.mystery.unlocked')}
              </Text>
            </View>
          ) : (
            <MysteryRewardBar completedSets={completedSets + 1} />
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.85}
          onPress={onNextLevel}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {/* "Next level" would be a lie on the set that ends the day or the
                bank — those commit the same way but land on the capped/finished
                view, so the button says Continue there. */}
            {lastOfDay || lastEver ? t('quiz.action.continue') : t('quiz.action.nextLevel')}
          </Text>
        </TouchableOpacity>
        <Text style={styles.lastOfDay} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {lastEver
            ? t('quiz.done.title')
            : lastOfDay
              ? t('quiz.daily.lastOfDay')
              : t('quiz.daily.remaining', { n: setsLeftAfter, total: DAILY_SET_LIMIT })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // 15dp sides so the board can run nearly edge to edge; headline pulled up —
  // the top of the screen is just two lines of text over the board (per user).
  content: { paddingHorizontal: 15, paddingTop: 6, paddingBottom: 24, alignItems: 'center' },
  retryContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, alignItems: 'center' },
  // Tinted disc, no shadow — the app's badge treatment (retry shape only).
  ring: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ROSE_WASH,
    marginBottom: 20,
  },
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
    letterSpacing: 0.5, textAlign: 'center', marginTop: 12, marginBottom: 14,
    textTransform: 'uppercase',
  },
  mystery: { marginTop: 24, width: '100%', paddingHorizontal: 9 },
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
  lastOfDay: {
    fontFamily: FONTS.lato, fontSize: 13, color: TXTSUB,
    textAlign: 'center', marginTop: 12, letterSpacing: 0.2,
  },
  unlocked: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: ROSE_WASH, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  unlockedText: { flex: 1, fontFamily: FONTS.latoBold, fontSize: 13.5, color: TXT, letterSpacing: 0.2 },
});
