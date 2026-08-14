import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence,
  Easing, runOnJS, cancelAnimation,
} from 'react-native-reanimated';
import { GOLD } from '../../constants/theme';

// The gift box's send-off, played the moment the mystery bar arrives at it
// (owner spec 2026-08-14): the inline gift goes still and blank, THIS copy
// takes over at centre screen at half the screen's width, golden light bursts
// behind it, and the whole thing vanishes — the "unlocked" pill lands in the
// bar's place and the cards come next.
//
// Shared values throughout, never `entering=` (house rule). pointerEvents:
// none on everything — the CTA underneath stays tappable the whole time, so a
// user who has seen this before can skip past it mid-burst.
//
// Timeline (≈1.5s; the bar's 0.9s fill runs before it, ≈3s felt total):
//   0        gift pops in at centre (0.55 → 1.0, spring-ish out-back)
//   380ms    rays + glow bloom behind it, slow expand
//   1050ms   everything swells a beat further and burns out to 0 opacity
//   1470ms   onDone

const GIFT = require('../../../assets/reward-gift.png');
const GIFT_ASPECT = 160 / 180;   // the processed asset's true ratio — keep it

const APPEAR_MS = 420;
const RAYS_AT = 380;
const OUT_AT = 1050;
const OUT_MS = 420;
const DONE_AT = OUT_AT + OUT_MS;
const RAY_COUNT = 12;

export default function MysteryGiftBurst({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  // "About half the screen" (owner). Height follows the asset's own ratio.
  const giftW = Math.round(width * 0.5);
  const giftH = Math.round(giftW / GIFT_ASPECT);
  const haloSize = Math.round(giftW * 2.1);

  const gift = useSharedValue(0);
  const rays = useSharedValue(0);
  const out = useSharedValue(0);

  // Exactly-once completion: the reanimated callback is the accurate edge, the
  // timer is the watchdog for a dropped runOnJS — the celebration must never
  // strand the review screen without its "unlocked" pill.
  const doneRef = useRef(false);
  const fireDone = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  const fireDoneRef = useRef(fireDone);
  fireDoneRef.current = fireDone;

  useEffect(() => {
    gift.value = withTiming(1, { duration: APPEAR_MS, easing: Easing.out(Easing.back(1.4)) });
    rays.value = withDelay(RAYS_AT, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    out.value = withDelay(OUT_AT, withTiming(1, { duration: OUT_MS, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(fireDoneRef.current)();
    }));
    const wd = setTimeout(() => fireDoneRef.current(), DONE_AT + 350);
    return () => {
      clearTimeout(wd);
      cancelAnimation(gift); cancelAnimation(rays); cancelAnimation(out);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const giftStyle = useAnimatedStyle(() => ({
    opacity: gift.value * (1 - out.value),
    transform: [{ scale: (0.55 + gift.value * 0.45) * (1 + out.value * 0.18) }],
  }));
  const raysStyle = useAnimatedStyle(() => ({
    opacity: rays.value * (1 - out.value),
    transform: [
      { scale: (0.7 + rays.value * 0.45) * (1 + out.value * 0.25) },
      { rotate: `${rays.value * 14}deg` },       // a slow turn is what makes it read as light, not a sticker
    ],
  }));

  // 12 tapering wedges around the centre — drawn once, rotated by transform.
  const R = haloSize / 2;
  const wedges = Array.from({ length: RAY_COUNT }, (_, i) => {
    const a = (i / RAY_COUNT) * Math.PI * 2;
    const spread = 0.055;                        // half-width of a wedge, radians
    const inner = R * 0.34;
    const x = (r: number, ang: number) => R + r * Math.cos(ang);
    const y = (r: number, ang: number) => R + r * Math.sin(ang);
    return `M${x(inner, a - spread)} ${y(inner, a - spread)} L${x(R, a)} ${y(R, a)} L${x(inner, a + spread)} ${y(inner, a + spread)} Z`;
  }).join(' ');

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.centre, raysStyle]}>
        <Svg width={haloSize} height={haloSize}>
          <Circle cx={R} cy={R} r={R * 0.5} fill={GOLD} opacity={0.22} />
          <Circle cx={R} cy={R} r={R * 0.33} fill={GOLD} opacity={0.3} />
          <Path d={wedges} fill={GOLD} opacity={0.8} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.centre, giftStyle]}>
        <Image source={GIFT} style={{ width: giftW, height: giftH }} accessibilityIgnoresInvertColors />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the scroll content and the footer CTA visually; pointerEvents none
  // keeps every touch falling through — this layer must never be a shield.
  root: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 40 },
  centre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
