import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ROSE, LAV, TXT, TXTSUB } from '../../constants/theme';

interface DayCircleProps {
  label: string;
  done: boolean;
  half: boolean;
  isToday: boolean;
  morning: boolean;
}

const SZ = 28;

export default function DayCircle({ label, done, half, isToday, morning }: DayCircleProps) {
  const isActive = done || half;
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: isToday ? TXT : TXTSUB, fontWeight: isToday ? '700' : '500' }]}>
        {label}
      </Text>
      <View style={styles.circle}>
        {isActive ? (
          <Text style={[styles.flame, { opacity: half ? 0.7 : 1 }]}>🔥</Text>
        ) : (
          <Svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
            <Circle
              cx={SZ / 2}
              cy={SZ / 2}
              r={SZ / 2 - 2}
              fill="none"
              stroke={isToday ? (morning ? ROSE : LAV) : 'rgba(30,27,46,0.22)'}
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
