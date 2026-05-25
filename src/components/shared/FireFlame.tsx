import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

// Static SVG flame for the streak badge. Replaced an earlier Lottie that
// was lost during the worktree recovery (the .json on disk is a placeholder
// with no layers) — a vector beats fetching/decoding Lottie JSON for a
// 28-px decorative icon, and the streak number anchored beside it carries
// the dynamic weight already.
//
// Two-tone fill: a warm amber-to-rose gradient gives the badge the same
// energetic glow as the target design, without needing animation. The path
// is a stylized teardrop with a small inner highlight to fake volume.
interface Props {
  size?: number;
  opacity?: number;
}

export default function FireFlame({ size = 18, opacity = 1 }: Props) {
  return (
    <View style={{ width: size, height: size, opacity }}>
      <Svg viewBox="0 0 24 24" width={size} height={size}>
        <Defs>
          <LinearGradient id="flameOuter" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFB347" />
            <Stop offset="0.55" stopColor="#FF7A45" />
            <Stop offset="1" stopColor="#E0285A" />
          </LinearGradient>
          <LinearGradient id="flameInner" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFE8A8" />
            <Stop offset="1" stopColor="#FFB347" />
          </LinearGradient>
        </Defs>
        {/* Outer flame silhouette */}
        <Path
          d="M12 2c1.4 3.1 3.9 4.4 4.3 7.2.5 3-1.5 4.6-1.5 4.6s1.7-.4 2.5-2c.9 1.5 1.3 3.2 1.1 4.8-.4 3.3-3.4 5.7-6.5 5.7-3.6 0-6.8-2.7-6.8-6.4 0-2.8 1.7-4.6 2.8-5.7C9.6 8.4 11 5.6 12 2z"
          fill="url(#flameOuter)"
        />
        {/* Inner highlight — small teardrop nested toward the base */}
        <Path
          d="M12.2 13c.6 1 1.4 1.7 1.4 3 0 1.5-1.1 2.6-2.6 2.6S8.4 17.5 8.4 16c0-1 .6-1.8 1.1-2.4.5.7 1 1 1.3.6.4-.6.6-1.4 1.4-1.2z"
          fill="url(#flameInner)"
        />
      </Svg>
    </View>
  );
}
