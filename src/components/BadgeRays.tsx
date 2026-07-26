import React, { useEffect } from 'react';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing,
} from 'react-native-reanimated';
import Svg, { Polygon, Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

// Eight white light-beams radiating from behind an unlocked badge, turning
// slowly. Purely decorative — always rendered with pointerEvents="none" by its
// host, and deliberately NOT part of BadgeCardArt so the shareable capture of
// that card stays deterministic (an animated node would snapshot at whatever
// frame the capture happened to land on).
//
// Each beam is a triangle with its apex at the centre, so it naturally tapers
// from a point to a wide outer end. A soft radial wash sits underneath to stop
// the eight apexes reading as a hard star at the middle.

const RAY_COUNT = 8;
/** Half-angle of a beam, degrees. Wide enough to read as light, narrow enough
 *  that the eight stay clearly separate. */
const RAY_HALF_DEG = 10;
/** One full turn. Slow — this should feel like a drift, never a spin. */
const SPIN_MS = 26000;

function rayPoints(size: number, index: number): string {
  const c = size / 2;
  const r = size / 2;
  const mid = (360 / RAY_COUNT) * index - 90;          // -90 → first beam points up
  const a1 = ((mid - RAY_HALF_DEG) * Math.PI) / 180;
  const a2 = ((mid + RAY_HALF_DEG) * Math.PI) / 180;
  return [
    `${c},${c}`,
    `${c + r * Math.cos(a1)},${c + r * Math.sin(a1)}`,
    `${c + r * Math.cos(a2)},${c + r * Math.sin(a2)}`,
  ].join(' ');
}

export default function BadgeRays({ size, opacity = 0.3 }: { size: number; opacity?: number }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(1, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(spin);
  }, [spin]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="badgeRayCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={opacity * 0.9} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={opacity * 0.28} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#badgeRayCore)" />
        {Array.from({ length: RAY_COUNT }, (_, i) => (
          <Polygon
            key={i}
            points={rayPoints(size, i)}
            fill="#FFFFFF"
            // Alternating strength gives the fan a little depth instead of a
            // mechanical, evenly-lit pinwheel.
            fillOpacity={i % 2 === 0 ? opacity : opacity * 0.62}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}
