import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB } from '../../constants/theme';
import FireFlame from './FireFlame';

interface DayCircleProps {
  label: string;
  done: boolean;
  half: boolean;
  isToday: boolean;
  morning: boolean;
}

const SZ = 28;

// Slowly-rotating dashed ring marking TODAY when nothing's been prayed yet.
// The rotation makes the dashes appear to march "一截一截" (per user) so the
// day reads as live/waiting without implying completion.
function TodayRing({ color }: { color: string }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    // 6 s per full turn — gentle, just enough motion to feel alive.
    spin.value = withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
        <Circle
          cx={SZ / 2}
          cy={SZ / 2}
          r={SZ / 2 - 2}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

export default function DayCircle({ label, done, half, isToday, morning }: DayCircleProps) {
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: isToday ? TXT : TXTSUB, fontWeight: isToday ? '700' : '500' }]}>
        {label}
      </Text>
      <View style={styles.circle}>
        {done ? (
          // Both prayers done → full flame.
          <FireFlame size={SZ} opacity={1} />
        ) : half ? (
          // Exactly one prayer done → clearly FAINT flame so it never reads as
          // "completed" (per user: a near-solid flame gave a false done signal).
          <FireFlame size={SZ} opacity={0.38} />
        ) : isToday ? (
          // Today, nothing prayed yet → slowly-rotating accent ring.
          <TodayRing color={morning ? ROSE : LAV} />
        ) : (
          // Past/future empty day → static faint dashed ring.
          <Svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
            <Circle
              cx={SZ / 2}
              cy={SZ / 2}
              r={SZ / 2 - 2}
              fill="none"
              stroke="rgba(30,27,46,0.22)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight: 12,
  },
  circle: {
    width: SZ,
    height: SZ,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flame: {
    fontSize: 18,
    lineHeight: 24,
  },
});
