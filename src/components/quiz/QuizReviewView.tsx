import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withDelay,
  Easing, useReducedMotion,
} from 'react-native-reanimated';
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
//
// ENTRANCE. The screen used to appear all at once, fully formed, which made a
// reward moment feel like a form submission. It now arrives in the order the
// news actually breaks: the verdict, then what it earned her, then the board,
// then the piece lighting up, then the progress being credited, and only then
// the way out. Every number below is a single source of truth — the stagger is
// derived from them rather than typed twice.
const T_HEADLINE = 0;      // "All Correct!"
const T_LABEL    = 260;    // "PUZZLE PIECE UNLOCKED"
const T_BOARD    = 520;    // the painting fades up
const T_TILE     = 900;    // ...and the fresh quarter lights up inside it
const T_MYSTERY  = 1180;   // the countdown bar arrives
const T_FILL     = T_MYSTERY + 260;   // ...then fills
// Per user: the CTA lands 2 s after the BOARD, not after the previous step —
// long enough that she looks at the painting instead of straight past it.
const T_CTA      = T_BOARD + 2000;
const T_FOOTNOTE = T_CTA - 220;   // before the CTA: the button is the last thing to land

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

  // Respect the OS switch. With reduce-motion on, every entering animation is
  // dropped to a near-instant fade and the CTA stops breathing — the content is
  // identical, so nothing is lost but the movement.
  //
  // Reanimated's SYNCHRONOUS hook, not AccessibilityInfo's promise. The async
  // read resolves after mount, and `entering` configs are captured AT mount —
  // so with the promise the full 2.5 s stagger still played on the first run,
  // which is the only run that matters. Two other screens in this app have the
  // same hole; this one does not.
  const reduceMotion = useReducedMotion();
  /** Entering animation for one step of the timeline. */
  const step = (delay: number) =>
    reduceMotion
      ? FadeInDown.duration(1).delay(0)
      : FadeInDown.duration(420).delay(delay).easing(Easing.out(Easing.cubic));

  // Breathing CTA — the SAME gesture as the home screen's Start Prayer button
  // (PrayerScreen: 0.92 ↔ 1.0 at 1180 ms, with the vertical amplitude ~3/8 of
  // the horizontal so the pill squishes wider/narrower rather than puffing).
  // Copied deliberately rather than approximated: two CTAs that breathe at
  // almost-but-not-quite the same rate read as a bug in one of them.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!done || reduceMotion) { pulse.value = 1; return; }
    pulse.value = 0.92;
    pulse.value = withDelay(T_CTA, withRepeat(
      withTiming(1, { duration: 1180, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    ));
  }, [done, reduceMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => {
    const px = pulse.value;
    const py = 0.97 + (px - 0.92) * (0.03 / 0.08);
    return { transform: [{ scaleX: px }, { scaleY: py }] };
  });

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
          <TouchableOpacity style={styles.retryCta} activeOpacity={0.85} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retryCtaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
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
        <Animated.Text entering={step(T_HEADLINE)} style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {firstPassPerfect ? t('quiz.review.perfect') : t('quiz.review.done')}
        </Animated.Text>

        <Animated.Text entering={step(T_LABEL)} style={styles.rewardLabel} maxFontSizeMultiplier={1.3}>
          {view.outOfArt ? t('quiz.reward.allArt') : t('quiz.reward.tile')}
        </Animated.Text>

        {/* showCaption: three reward moments in four were an unnamed quarter
            of an unnamed picture. She is collecting a Caravaggio; the least
            the screen can do is say so while she earns it. */}
        <Animated.View entering={step(T_BOARD)}>
          <PuzzleBoard
            paintingIndex={view.paintingIndex}
            tilesUnlocked={view.tilesUnlocked}
            size={boardSize}
            newTile={freshTile}
            showCaption
            revealNewTile={!reduceMotion}
            revealDelayMs={T_TILE}
          />
        </Animated.View>

        <Animated.View entering={step(T_MYSTERY)} style={styles.mystery}>
          {earnsCard ? (
            <View style={styles.unlocked}>
              <MaterialCommunityIcons name="gift-outline" size={19} color={ROSE} />
              <Text style={styles.unlockedText} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                {t('quiz.mystery.unlocked')}
              </Text>
            </View>
          ) : (
            <MysteryRewardBar
              completedSets={completedSets + 1}
              animate={!reduceMotion}
              fillDelayMs={T_FILL}
            />
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {/* The pulse lives on a DECORATIVE layer behind the button, never on the
            touchable — the same split PrayerScreen uses. A Reanimated transform
            on the pressable itself desyncs its native touch region on Android,
            and a 0.92 scaleX would shrink the target ~8 % mid-breath. */}
        {/* ctaWrap stays a PLAIN View: PrayerScreen's note explains that a
            Reanimated-owned wrapper can freeze the native hit region at its
            attach-time position, and a FadeInDown translate would do exactly
            that for its 420 ms. The entrance rides the decorative fill and the
            label instead, so nothing animates the touchable's own box. */}
        <View style={styles.ctaWrap}>
          <Animated.View entering={step(T_CTA)} pointerEvents="none" style={[styles.ctaPulseBg, pulseStyle]} />
          <TouchableOpacity
            style={styles.ctaHit}
            activeOpacity={0.85}
            onPress={onNextLevel}
            accessibilityRole="button"
          >
            <Animated.Text entering={step(T_CTA)} style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {/* "Next level" would be a lie on the set that ends the day or the
                  bank — those commit the same way but land on the capped/finished
                  view, so the button says Continue there. */}
              {lastOfDay || lastEver ? t('quiz.action.continue') : t('quiz.action.nextLevel')}
            </Animated.Text>
          </TouchableOpacity>
        </View>
        <Animated.Text entering={step(T_FOOTNOTE)} style={styles.lastOfDay} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {lastEver
            ? t('quiz.done.title')
            : lastOfDay
              ? t('quiz.daily.lastOfDay')
              : t('quiz.daily.remaining', { n: setsLeftAfter, total: DAILY_SET_LIMIT })}
        </Animated.Text>
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
    fontFamily: FONTS.latoBold, fontSize: 14.9, color: TXTSUB,    // 13.5 → 14.9 (+10 % per user)
    letterSpacing: 0.5, textAlign: 'center', marginTop: 12, marginBottom: 14,
    textTransform: 'uppercase',
  },
  mystery: { marginTop: 24, width: '100%', paddingHorizontal: 9 },
  sub: {
    fontFamily: FONTS.lato, fontSize: 14.5, color: TXTSUB,
    textAlign: 'center', marginTop: 18, lineHeight: 21,
  },
  footer: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  // Split in three so the touch target is never Reanimated-owned — same shape
  // as PrayerScreen's ctaWrap / ctaPulseBg / ctaHit. `cta` (a single view that
  // was both geometry and fill) is gone; the geometry is identical.
  ctaWrap: {
    height: 54, alignSelf: 'stretch', justifyContent: 'center',
  },
  ctaPulseBg: { ...StyleSheet.absoluteFillObject, borderRadius: BTN_RADIUS, backgroundColor: ROSE },
  ctaHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The retry shape reuses the label but not the pulse: nothing was earned, so
  // the button should not be asking for attention.
  retryCta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  // Unchanged from before this pass. Only the reward screen's CTA was asked to
  // match the home button; sharing one style would have silently restyled a
  // screen nobody was reviewing.
  retryCtaText: {
    fontFamily: FONTS.latoBold, fontSize: 16.5, color: '#FFFFFF', letterSpacing: 0.4,
  },
  // Matched to PrayerScreen's startBtnText EXACTLY (per user): system face at
  // 18 / '700' / 0.3 tracking. It was FONTS.latoBold at 16.5 / 0.4, which read
  // as a different button doing a similar job.
  ctaText: {
    color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3,
  },
  lastOfDay: {
    fontFamily: FONTS.lato, fontSize: 14.95, color: TXTSUB,       // 13 → 14.95 (+15 % per user)
    textAlign: 'center', marginTop: 12, marginBottom: 15,         // +15 px below (per user)
    letterSpacing: 0.2,
  },
  unlocked: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: ROSE_WASH, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  unlockedText: { flex: 1, fontFamily: FONTS.latoBold, fontSize: 13.5, color: TXT, letterSpacing: 0.2 },
});
