import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  withDelay, Easing, interpolate, useReducedMotion, cancelAnimation, runOnJS,
} from 'react-native-reanimated';
import { ROSE, TXT, FONTS, INK_06 } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { mysteryView } from '../../state/quizProgress';

// "Finish N more sets to open the mystery box", with the gift waiting at the
// end of the bar — the reference design's shape.
//
// The counter behind the mystery card draw. The cadence is load-bearing:
// hitting zero grants a real draw (see cardDraw.ts / MysteryDrawOverlay), so
// changing it changes the reward economy, not just a label.
//
// The bar is continuous, not segmented: it is a countdown, not a per-question
// record, and a second 5-segment bar next to the real one would read as the
// same information twice.

const GIFT = require('../../../assets/reward-gift.png');
// The processed asset is 160x180 (see the commit that added it); keep its
// aspect so the ribbon doesn't squash.
const GIFT_H = 52;
const GIFT_W = GIFT_H * (160 / 180);

/** Track height, +20% per user (20 → 24 → 28.8). */
const TRACK_H = 28.8;

// A REAL outline on the count, not a glow (owner 2026-08-10). RN has no
// text-stroke property, and `textShadow` is a blur however small the radius —
// at 4 it was the halo he asked to remove, and at 1 it just muddies the glyph
// edge instead of tracing it. So the label is drawn eight times in ROSE, one
// pixel around the glyphs, with the white text on top: that IS a stroke.
const STROKE = 1;
const STROKE_OFFSETS: readonly (readonly [number, number])[] = [
  [-STROKE, -STROKE], [0, -STROKE], [STROKE, -STROKE],
  [-STROKE, 0],                     [STROKE, 0],
  [-STROKE, STROKE],  [0, STROKE],  [STROKE, STROKE],
];

export default function MysteryRewardBar({
  completedSets, totalSets = 0, animate = false, fillDelayMs = 0,
  justEarned = false, hideGift = false, onFillDone,
}: {
  completedSets: number;
  /** Sets the bank allows in total. The FINAL cycle is longer than the rest —
   *  it absorbs the leftover so no set is dead — so the track reads x/4 there
   *  rather than x/3. Without it the bar would show 3/3 at set 129 and hand
   *  her nothing, then run set 130 with the counter already full. */
  totalSets?: number;
  /** Run the fill animation from the PREVIOUS step rather than painting the
   *  final width. Off by default so every other caller keeps a static bar. */
  animate?: boolean;
  /** When the fill starts, in ms FROM MOUNT — not from the bar's entrance.
   *  A React `entering` animation does not defer mount or effects, so a delay
   *  expressed relative to the entrance runs early and finishes unseen. The
   *  caller passes an absolute point on its own timeline. */
  fillDelayMs?: number;
  /**
   * The set that FILLS the bar (owner 2026-08-14: the third set used to jump
   * straight to the "unlocked" pill with no fill — no anticipation). Pass the
   * UN-incremented completedSets with this flag: the bar shows that cycle's
   * last step (e.g. 2/3), fills to FULL, and stops the gift's shake the moment
   * the fill lands. The caller then takes over with the burst celebration.
   */
  justEarned?: boolean;
  /** Blank the inline gift while the caller's blown-up copy owns the screen. */
  hideGift?: boolean;
  /** The fill's completion edge (fires once, watchdogged — a dropped
   *  reanimated callback must not strand the celebration mid-sequence). */
  onFillDone?: () => void;
}) {
  const t = useT();
  // Synchronous, unlike AccessibilityInfo's promise: an async read lands after
  // mount, and by then the entering configs are already captured — the first
  // playthrough would animate anyway, which is the run that matters.
  const reduceMotion = useReducedMotion();
  const view = mysteryView(completedSets, totalSets);
  const { target } = view;
  // justEarned: the caller passed the UN-incremented count, so `view` is the
  // cycle's LAST step (e.g. 2/3) — the bar starts there and fills to FULL.
  const current = justEarned ? target : view.current;
  // Headline stays "1 more to open" THROUGH the earn-fill — it is the sentence
  // the fill is completing; flipping it early would spoil the moment the caller
  // is building. (With the un-incremented count, view.remaining is that 1.)
  const remaining = view.remaining;
  const pct = Math.max(0, Math.min(1, current / target));
  // Where the bar stood BEFORE this set. current is 0..target-1 (a full bar is
  // the earnsCard branch upstream), so the previous step is one less. `target`
  // is 3 for every cycle but the LAST, which is 4 — see mysteryView.
  // Zero IS reachable — the retry screen passes completedSets un-incremented, so
  // a miss on the first set of a cycle asks for step -1. The clamp is what makes
  // that an empty bar instead of a negative width, and it is load-bearing, not
  // belt-and-braces.
  const prevPct = justEarned
    ? Math.max(0, Math.min(1, view.current / target))
    : Math.max(0, Math.min(1, (current - 1) / target));

  // 0 → 1 drives the fill's width between prevPct and pct. Starting at 1 when
  // not animating means the static callers paint the final width on frame one
  // with no layout pass, exactly as before.
  const shouldAnimate = animate && !reduceMotion;
  const grow = useSharedValue(shouldAnimate ? 0 : 1);
  // Declared HERE, above handleFillDone which captures it — the wobble that
  // drives it lives further down. Keeping the declaration above every reference
  // is ledger rule (the TDZ class), even where a closure would get away with it.
  const shake = useSharedValue(0);
  // Fill-completion edge, exactly once. The reanimated callback is the accurate
  // moment; the watchdog exists because a dropped runOnJS would otherwise
  // strand the earn celebration between "bar full" and "gift bursts" forever.
  const fillDoneRef = useRef(false);
  const handleFillDone = useCallback(() => {
    if (fillDoneRef.current) return;
    fillDoneRef.current = true;
    // The gift's twitch is anticipation; the bar has now ARRIVED. It must be
    // still before the caller's blown-up copy takes over (owner spec).
    cancelAnimation(shake);
    shake.value = withTiming(0, { duration: 120 });
    onFillDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFillDone]);
  useEffect(() => {
    if (!shouldAnimate) {
      grow.value = 1;
      // Reduce-motion still owes the caller its edge, or the celebration —
      // and the pill after it — would never arrive.
      if (justEarned) handleFillDone();
      return;
    }
    grow.value = 0;
    grow.value = withDelay(fillDelayMs, withTiming(1, {
      duration: 900,
      // Decelerating: the bar arrives at the new step and settles rather than
      // stopping dead, which is what makes it read as progress being credited.
      easing: Easing.out(Easing.cubic),
    }, (fin) => { if (fin && justEarned) runOnJS(handleFillDone)(); }));
    if (justEarned) {
      const wd = setTimeout(handleFillDone, fillDelayMs + 900 + 300);
      return () => clearTimeout(wd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate, fillDelayMs, grow, current, target]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(grow.value, [0, 1], [prevPct * 100, pct * 100])}%`,
  }));

  // The gift shakes twice, quickly, then rests — a 600 ms burst plus 400 ms of
  // stillness, so the burst repeats on a 1 s cycle as asked. (A first cut rested
  // a full second and gave a 1.6 s period.) The touch of scale is what makes it
  // read as something about to burst out rather than a wobbling sticker.
  //
  // Runs on its own clock from mount and NEVER waits for the entrance: per
  // user, the box keeps twitching whether or not the rest of the screen has
  // finished arriving. It DOES stop for reduce-motion — a perpetual wobble is
  // exactly what that setting exists to switch off, and this bar also renders
  // on the progress screen, where nothing else moves at all.
  useEffect(() => {
    if (reduceMotion) { shake.value = 0; return; }
    const wobble = (deg: number, ms: number) =>
      withTiming(deg, { duration: ms, easing: Easing.inOut(Easing.quad) });
    shake.value = withRepeat(
      withSequence(
        wobble(1, 90), wobble(-1, 150), wobble(1, 150), wobble(-0.6, 120), wobble(0, 90),  // 600 ms, two full shakes
        withTiming(0, { duration: 400 }),                                                  // rest → 1 s period
      ),
      -1,
      false,
    );
  }, [shake, reduceMotion]);
  const giftStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${shake.value * 9}deg` },
      // Peaks mid-shake, so the swell and the rotation are the same gesture.
      { scale: 1 + Math.abs(shake.value) * 0.09 },
    ],
  }));

  return (
    <View style={styles.root}>
      <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {t('quiz.mystery.away', { n: remaining })}
      </Text>
      <View style={styles.row}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
          {/* The count sits in the CENTRE OF THE TRACK, not inside the fill
              (per user). Inside the fill it moved as the bar grew and vanished
              below 1/3; centred it is always in the same place and always
              legible. The rose STROKE is what makes white text survive the
              stretch of track the fill has not reached yet — one treatment for
              both halves instead of switching colour at some threshold. */}
          <View style={styles.countLayer} pointerEvents="none">
            {/* Sized by the white label below; the stroke copies are absolute
                against this box, so [0,0] would land exactly on it and each
                offset traces one pixel out. Every copy must carry the SAME
                numberOfLines / maxFontSizeMultiplier or the outline desyncs
                from the glyphs it is tracing. */}
            <View>
              {STROKE_OFFSETS.map(([dx, dy]) => (
                <Text
                  key={`${dx},${dy}`}
                  style={[styles.count, styles.countStroke, { left: dx, top: dy }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                >
                  {current}/{target}
                </Text>
              ))}
              <Text style={styles.count} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {current}/{target}
              </Text>
            </View>
          </View>
        </View>
        {/* The gift sits over the end of the track — what the bar is filling
            toward, not a fourth segment of it. hideGift keeps the LAYOUT (the
            track must not stretch when the blown-up copy takes over) and blanks
            only the pixels. */}
        <Animated.View style={[giftStyle, hideGift && styles.giftHidden]}>
          <Image source={GIFT} style={styles.gift} accessibilityIgnoresInvertColors />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  // Same TYPEFACE as the retry screen's "N left to get right" (QuizReviewView's
  // `sub`, FONTS.lato) per user — the bold cut, because this is still the heading
  // over the bar and the two lines are told apart by weight + colour now that
  // they no longer differ by family. Colour deliberately unchanged (TXT).
  headline: {
    fontFamily: FONTS.latoBold, fontWeight: '700',
    fontSize: 17.85,                               // 17 → +5 % per user
    color: TXT, textAlign: 'center', letterSpacing: 0.2, marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  track: {
    flex: 1, height: TRACK_H, borderRadius: TRACK_H / 2,
    backgroundColor: INK_06, overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    ...StyleSheet.absoluteFillObject, right: undefined,
    borderRadius: TRACK_H / 2, backgroundColor: ROSE,
  },
  countLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: {
    fontFamily: FONTS.latoBold, fontWeight: '700',
    fontSize: 15.5,                                    // 13.5 → 15.5 (+15 % per user)
    color: '#FFFFFF', letterSpacing: 0.4,
    // No textShadow. It used to carry a ROSE halo at radius 4; the owner asked
    // for a stroke instead, which RN cannot express as a style — see
    // STROKE_OFFSETS at the top of the file for how it is drawn.
  },
  // One of the eight ROSE copies traced around the white label.
  countStroke: { position: 'absolute', color: ROSE },
  // Slight tuck over the track's end.
  gift: { width: GIFT_W, height: GIFT_H, marginLeft: -14 },
  giftHidden: { opacity: 0 },
});
