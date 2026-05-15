import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ROSE, LAV } from '../constants/theme';

type Variant = 'morning' | 'evening';

type Palette = {
  base: readonly [string, string, string];
  blobs: { color: string; opacity: number }[];
};

// `ROSE` / `LAV` are the brand accents reused across the app shell — pulling
// the mid-blob color from theme keeps prayer-flow background in lockstep with
// any future palette tweak. The other three blobs (highlight / accent / deep)
// are hand-picked to flank the brand color without competing for attention.
const PALETTES: Record<Variant, Palette> = {
  morning: {
    base: ['#3A1230', '#7B2255', '#2D0A1A'],
    blobs: [
      { color: '#FFB8D0', opacity: 0.55 }, // soft pink highlight
      { color: '#F7C56B', opacity: 0.40 }, // warm gold caustic
      { color: ROSE,      opacity: 0.50 }, // brand rose, mid
      { color: '#5E1840', opacity: 0.55 }, // deep wine
    ],
  },
  evening: {
    base: ['#1B0A3A', '#2D1660', '#100525'],
    blobs: [
      { color: '#A78BFA', opacity: 0.50 }, // light violet
      { color: '#7DD3FC', opacity: 0.35 }, // moonlight sky
      { color: LAV,      opacity: 0.55 }, // brand lavender, mid
      { color: '#2A1052', opacity: 0.55 }, // night
    ],
  },
};

// One soft-edged radial blob, drifting on independent X/Y periods.
// Sized as a square in screen-width units so it scales across devices.
function Blob({
  size,
  color,
  opacity,
  startX,
  startY,
  driftX,
  driftY,
  periodX,
  periodY,
}: {
  size: number;
  color: string;
  opacity: number;
  startX: number;
  startY: number;
  driftX: number;
  driftY: number;
  periodX: number;
  periodY: number;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Reset shared values at mount — they survive remounts and could carry
    // stale values from a previous open. (See mistakes_to_never_repeat #3.)
    tx.value = 0;
    ty.value = 0;
    scale.value = 1;
    tx.value = withRepeat(
      withSequence(
        withTiming(driftX, { duration: periodX, easing: Easing.inOut(Easing.sin) }),
        withTiming(-driftX, { duration: periodX, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    ty.value = withRepeat(
      withSequence(
        withTiming(driftY, { duration: periodY, easing: Easing.inOut(Easing.sin) }),
        withTiming(-driftY, { duration: periodY, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: periodX + 1300, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.92, { duration: periodX + 1300, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [tx, ty, scale, driftX, driftY, periodX, periodY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          left: startX - size / 2,
          top: startY - size / 2,
        },
        animStyle,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="g" cx="50" cy="50" rx="50" ry="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.4} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#g)" />
      </Svg>
    </Animated.View>
  );
}

export default function AuroraBackground({ variant }: { variant: Variant }) {
  const { width, height } = useWindowDimensions();
  const palette = PALETTES[variant];
  // One blob is ~1.4× screen width — soft enough to fill the canvas without
  // sharp edges showing during drift.
  const big = width * 1.4;
  const med = width * 1.15;
  const drift = width * 0.18;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={palette.base}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Blob
        size={big}
        color={palette.blobs[0].color}
        opacity={palette.blobs[0].opacity}
        startX={width * 0.25}
        startY={height * 0.28}
        driftX={drift}
        driftY={drift * 0.7}
        periodX={11000}
        periodY={9000}
      />
      <Blob
        size={med}
        color={palette.blobs[1].color}
        opacity={palette.blobs[1].opacity}
        startX={width * 0.85}
        startY={height * 0.22}
        driftX={drift * 0.9}
        driftY={drift * 1.1}
        periodX={13000}
        periodY={10500}
      />
      <Blob
        size={big}
        color={palette.blobs[2].color}
        opacity={palette.blobs[2].opacity}
        startX={width * 0.20}
        startY={height * 0.78}
        driftX={drift}
        driftY={drift}
        periodX={12500}
        periodY={11500}
      />
      <Blob
        size={med}
        color={palette.blobs[3].color}
        opacity={palette.blobs[3].opacity}
        startX={width * 0.82}
        startY={height * 0.82}
        driftX={drift * 1.1}
        driftY={drift * 0.85}
        periodX={10500}
        periodY={12000}
      />
      {/* Bottom vignette — subtle, keeps body text legible over moving light. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.22)']}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
    </View>
  );
}
