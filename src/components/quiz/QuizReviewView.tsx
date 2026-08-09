import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withDelay,
  Easing, useReducedMotion,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ROSE, TXT, TXTSUB, BTN_RADIUS, FONTS, ROSE_WASH } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import QuizSegmentRing from './QuizSegmentRing';
import PuzzleBoard from './PuzzleBoard';
import MysteryRewardBar from './MysteryRewardBar';
import { rewardPreview, MYSTERY_EVERY, TILES_PER_PAINTING } from '../../state/quizProgress';
import { drawEarnedAt } from '../../state/cardDraw';
import { DAILY_SET_LIMIT } from '../../state/quizHistory';
import { QUIZ_ART_COUNT, LAST_ART_TILES } from '../../constants/quizArt';
import type { SegmentState } from '../../state/quizSession';
import type { StyleProp, ViewStyle } from 'react-native';

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
// The retry shape has its own, much shorter CTA beat. T_CTA's 2 s exists to hold
// her on the PAINTING; the retry screen has no painting, so reusing it would
// leave "Try those again" unpainted for 2.5 s on the one screen she most wants
// to leave — every retry round, and stacked on top of the interstitial's own
// deliberate 400 ms. It lands just after the mystery bar instead.
const T_RETRY_CTA = T_MYSTERY + 420;
/** How long one element takes to arrive. */
const RISE_MS = 420;
/** It rises this far while fading in. */
const RISE_FROM = 22;
/** Margin after the last element lands before the screen is declared settled.
 *  Covers a dropped frame. */
const SETTLE_PAD = 300;

// One element's arrival.
//
// SHARED VALUES, NEVER `entering=`. This is a repo rule, written down in
// QuizVerdict and QuizOptionsEntrance, and this file broke it: Reanimated
// LAYOUT animations do not reliably run inside a `fullScreenModal` on the new
// architecture, and this screen IS one (RootNavigator registers Quiz that way).
// A dropped entrance leaves the config captured at mount with nothing to ever
// set it — i.e. the entire results screen stuck at opacity 0, permanently, with
// no recovery. The watchdog below is what makes a dropped timing merely ugly
// instead of fatal.
//
// It stays an Animated.View FOREVER; `settled` only releases pointerEvents.
//
// QuizOptionsEntrance hands back to a plain View at rest and that is right
// THERE, because it wraps stateless buttons. Copying it here was a bug: React
// compares by element TYPE, so Animated.View → View at the same position
// unmounts the subtree and mounts a fresh one. At 3.24 s, on every perfect set,
// PuzzleBoard's `loaded` would reset to false — the painting vanishing back to
// a grey box until the CDN image re-decodes, and the new quarter re-washing and
// re-lighting — while MysteryRewardBar's `grow` reset to 0 and the bar snapped
// back to the previous step to re-fill a second time. Nothing tappable is
// inside a Rise (the CTA's touchable is a plain sibling gated by `disabled`),
// so the handback bought nothing and cost a guaranteed full replay.
function Rise({
  at, settled, style, children, pointerEvents,
}: {
  /** Ms from mount. */
  at: number;
  /** Landed. Releases touches; does NOT change what is rendered. */
  settled: boolean;
  style?: StyleProp<ViewStyle>;
  /** Optional: the retry CTA's fill is a bare coloured layer with nothing in it. */
  children?: React.ReactNode;
  /** Force-none for decorative layers that must never take a touch, settled or
   *  not — the CTA fill sits over the whole button box. */
  pointerEvents?: 'none';
}) {
  const p = useSharedValue(settled ? 1 : 0);
  useEffect(() => {
    // Reduce-motion mounts already settled: no animation to schedule, no
    // watchdog to leave pending for 3 s.
    if (settled) { p.value = 1; return; }
    p.value = 0;
    p.value = withDelay(at, withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }));
    const wd = setTimeout(() => { p.value = 1; }, at + RISE_MS + SETTLE_PAD);
    return () => clearTimeout(wd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, p]);
  const st = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * RISE_FROM }],
  }));
  return (
    <Animated.View
      style={[style, st]}
      pointerEvents={pointerEvents ?? (settled ? 'auto' : 'none')}
    >
      {children}
    </Animated.View>
  );
}

export default function QuizReviewView({
  segments, correct, total, wrong, firstPassPerfect, completedSets,
  lastOfDay, lastEver, setsLeftAfter, totalSets, onRetry, onNextLevel,
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
  /** Sets this bank allows in total — what the reward tail is measured from. */
  totalSets: number;
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

  /** The CTA beat for whichever shape is rendering. */
  const ctaAt = done ? T_CTA : T_RETRY_CTA;

  // Two REAL pieces of state, not two animation configs.
  //
  // `settled` hands the whole tree back to plain Views once everything has
  // landed. `ctaLive` is what makes the button tappable — and it is the fix for
  // a defect that shipped on both shapes: the TouchableOpacity was laid out at
  // full size from mount while only the pill and the label faded in, so for
  // 2.5 s there was a full-width, 54 pt, INVISIBLE, live "Next level" in the
  // footer. One stray tap committed the set and destroyed the reward reveal she
  // had earned, irreversibly. Wrapping the footer in an Animated.View (the
  // earlier fix on the retry shape) does NOT solve this: opacity 0 still takes
  // touches in RN, and on Fabric the hit region sits at the animation's final
  // position while the transform runs on the UI thread. Only `disabled` does.
  const [settled, setSettled] = useState(reduceMotion);
  const [ctaLive, setCtaLive] = useState(reduceMotion);
  useEffect(() => {
    if (reduceMotion) { setSettled(true); setCtaLive(true); return; }
    setSettled(false); setCtaLive(false);
    const a = setTimeout(() => setCtaLive(true), ctaAt);
    // The last thing to arrive is the CTA on the retry shape and the footnote's
    // sibling CTA on the reward shape — both at ctaAt.
    const b = setTimeout(() => setSettled(true), ctaAt + RISE_MS + SETTLE_PAD);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [reduceMotion, ctaAt]);

  // Breathing CTA — the SAME gesture as the home screen's Start Prayer button
  // (PrayerScreen: 0.92 ↔ 1.0 at 1180 ms, with the vertical amplitude ~3/8 of
  // the horizontal so the pill squishes wider/narrower rather than puffing).
  // Copied deliberately rather than approximated: two CTAs that breathe at
  // almost-but-not-quite the same rate read as a bug in one of them.
  //
  // REWARD SHAPE ONLY. The retry CTA deliberately does not breathe: nothing was
  // earned, so the button should not be asking for attention. (Removing that
  // guard was scope creep in an earlier pass — it is not part of the ring/bar
  // request and it reverts a deliberate tweak.)
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
  const { view, freshTile } = rewardPreview(completedSets, QUIZ_ART_COUNT, LAST_ART_TILES);
  // 15dp side margins (per user) — the board is the screen's hero now.
  const boardSize = width - 30;
  // The set she is about to commit. The counter has to read from the COMMITTED
  // number or the screen that celebrates a card says "3 more to go" with an
  // empty bar — she watched that counter for three sets and never saw it land.
  const earnsCard = drawEarnedAt(completedSets + 1, MYSTERY_EVERY, totalSets);

  if (!done) {
    // Same staggered arrival as the reward shape, and the same mystery bar at
    // the bottom. A missed set still moved her toward the card — the old screen
    // said "3 left to get right" and then nothing, so a retry read as pure loss
    // when it is actually a pause. The ring replaces the refresh icon AND the
    // score line: it says both, in the place the eye already goes.
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.retryContent} showsVerticalScrollIndicator={false}>
          <Rise at={T_HEADLINE} settled={settled}>
            {/* The glyphs read as "two slash five" and the per-question state is
                colour-only, so the ring speaks the sentence the old score line
                used to say. That is also what keeps quiz.review.score alive. */}
            <QuizSegmentRing segments={segments} label={t('quiz.review.score', { n: correct, total })} />
          </Rise>
          <Rise at={T_LABEL} settled={settled}>
            <Text style={styles.retryHeadline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {t('quiz.review.almost')}
            </Text>
          </Rise>
          <Rise at={T_BOARD} settled={settled}>
            <Text style={styles.sub} maxFontSizeMultiplier={1.3}>
              {t('quiz.review.retryHint', { n: wrong })}
            </Text>
          </Rise>

          <Rise at={T_MYSTERY} settled={settled} style={styles.retryMystery}>
            {/* completedSets, NOT +1: this set has not been earned yet. The bar
                shows where she stands, static — there is no step to animate to
                until she gets them right. */}
            <MysteryRewardBar completedSets={completedSets} totalSets={totalSets} />
          </Rise>
        </ScrollView>
        {/* ctaWrap stays a PLAIN View so nothing Reanimated owns the touchable's
            box; the arrival rides a decorative layer, and `disabled` — not
            opacity — is what keeps it untappable until it is visible. */}
        <View style={styles.footer}>
          <View
            style={styles.ctaWrap}
            accessibilityElementsHidden={!ctaLive}
            importantForAccessibility={ctaLive ? 'auto' : 'no-hide-descendants'}
          >
            <Rise at={T_RETRY_CTA} settled={settled} style={styles.ctaPulseBg} pointerEvents="none" />
            <TouchableOpacity
              style={styles.ctaHit}
              activeOpacity={0.85}
              onPress={onRetry}
              disabled={!ctaLive}
              accessibilityRole="button"
            >
              <Rise at={T_RETRY_CTA} settled={settled}>
                <Text style={styles.retryCtaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {t('quiz.action.retry')}
                </Text>
              </Rise>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Rise at={T_HEADLINE} settled={settled}>
          <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {firstPassPerfect ? t('quiz.review.perfect') : t('quiz.review.done')}
          </Text>
        </Rise>

        <Rise at={T_LABEL} settled={settled}>
          <Text style={styles.rewardLabel} maxFontSizeMultiplier={1.3}>
            {view.outOfArt ? t('quiz.reward.allArt') : t('quiz.reward.tile')}
          </Text>
        </Rise>

        {/* showCaption: three reward moments in four were an unnamed quarter
            of an unnamed picture. She is collecting a Caravaggio; the least
            the screen can do is say so while she earns it. */}
        <Rise at={T_BOARD} settled={settled}>
          <PuzzleBoard
            paintingIndex={view.paintingIndex}
            tilesUnlocked={view.tilesUnlocked}
            tileCount={view.tiles.length}
            size={boardSize}
            newTile={freshTile}
            showCaption
            revealNewTile={!reduceMotion}
            revealDelayMs={T_TILE}
          />
        </Rise>

        <Rise at={T_MYSTERY} settled={settled} style={styles.mystery}>
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
              totalSets={totalSets}
              animate={!reduceMotion}
              fillDelayMs={T_FILL}
            />
          )}
        </Rise>
      </ScrollView>

      <View style={styles.footer}>
        {/* The pulse lives on a DECORATIVE layer behind the button, never on the
            touchable — the same split PrayerScreen uses. A Reanimated transform
            on the pressable itself desyncs its native touch region on Android,
            and a 0.92 scaleX would shrink the target ~8 % mid-breath. */}
        {/* ctaWrap stays a PLAIN View: PrayerScreen's note explains that a
            Reanimated-owned wrapper can freeze the native hit region at its
            attach-time position. The arrival rides the decorative fill and the
            label; `disabled` is what gates the touch. */}
        {/* The a11y flags live HERE, not on the touchable:
            accessibilityElementsHidden hides an element's DESCENDANTS, so on the
            button itself VoiceOver could still stop on it and announce a dimmed
            control with no label. */}
        <View
          style={styles.ctaWrap}
          accessibilityElementsHidden={!ctaLive}
          importantForAccessibility={ctaLive ? 'auto' : 'no-hide-descendants'}
        >
          {/* Two layers on purpose: Rise owns the ARRIVAL (opacity + lift) and
              hands back at settle, the inner Animated.View owns the BREATH,
              which has to keep running long after everything has settled. */}
          <Rise at={T_CTA} settled={settled} style={styles.ctaPulseLayer} pointerEvents="none">
            <Animated.View style={[styles.ctaPulseBg, pulseStyle]} />
          </Rise>
          <TouchableOpacity
            style={styles.ctaHit}
            activeOpacity={0.85}
            onPress={onNextLevel}
            disabled={!ctaLive}
            accessibilityRole="button"
          >
            <Rise at={T_CTA} settled={settled}>
              <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {/* "Next level" would be a lie on the set that ends the day or the
                    bank — those commit the same way but land on the capped/finished
                    view, so the button says Continue there. */}
                {lastOfDay || lastEver ? t('quiz.action.continue') : t('quiz.action.nextLevel')}
              </Text>
            </Rise>
          </TouchableOpacity>
        </View>
        <Rise at={T_FOOTNOTE} settled={settled}>
          <Text style={styles.lastOfDay} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {lastEver
              ? t('quiz.done.title')
              : lastOfDay
                ? t('quiz.daily.lastOfDay')
                : t('quiz.daily.remaining', { n: setsLeftAfter, total: DAILY_SET_LIMIT })}
          </Text>
        </Rise>
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
  // The retry headline sits UNDER the ring, so it needs its own top margin —
  // the reward shape's headline is the first thing on screen and has none.
  retryHeadline: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 24,
    color: TXT, textAlign: 'center', letterSpacing: 0.3, marginTop: 22,
  },
  retryMystery: { marginTop: 40, width: '100%' },
  headline: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 24,
    color: TXT, textAlign: 'center', letterSpacing: 0.3,
  },
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
  // Positioning only — Rise puts the arrival on this, the pill inside carries
  // the fill so the breath survives the handback to a plain View.
  ctaPulseLayer: { ...StyleSheet.absoluteFillObject },
  ctaPulseBg: { ...StyleSheet.absoluteFillObject, borderRadius: BTN_RADIUS, backgroundColor: ROSE },
  ctaHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Kept separate from ctaText even though both buttons now pulse: only the
  // reward CTA was asked to match the home button's type, and sharing one style
  // would restyle this screen every time that one is tuned.
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
