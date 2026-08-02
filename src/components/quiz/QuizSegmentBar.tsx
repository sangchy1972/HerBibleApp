import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ROSE, GREEN_DONE, INK_10 } from '../../constants/theme';
import type { SegmentState } from '../../state/quizSession';

// The 5-segment quiz progress bar. Shared by the home card and the in-quiz
// header so the two can never drift.
//
// Geometry is carried over from DailyRhythmBar's track (height 6, radius 10,
// 10% ink track, white full-height ticks at the 5 boundaries, fills with radius
// 0 so interior edges sit flush against the ticks instead of notching dark
// slivers beside every one).
//
// ⚠️ Segments are POSITIONAL and deliberately NOT packed left, unlike
// packedRhythmFill in state/dailyRhythm.ts. That bar's steps are order-agnostic
// so packing reads as progress; here segment k IS question k, and a wrong answer
// at position 2 must show red at position 2 with position 3 still empty. Don't
// "fix" this to match the other bar.

export default function QuizSegmentBar({
  segments, height = 6, style,
}: {
  segments: SegmentState[];
  height?: number;
  style?: object;
}) {
  // Until the first onLayout the fills render at width 0 rather than at a
  // guessed width — no flash of wrong geometry.
  const [trackW, setTrackW] = useState(0);
  const count = segments.length || 1;
  const segW = trackW > 0 ? trackW / count : 0;

  return (
    <View
      style={[styles.track, { height, borderRadius: height + 4 }, style]}
      onLayout={e => setTrackW(e.nativeEvent.layout.width)}
    >
      {segments.map((s, i) => (
        s === 'empty' ? null : (
          <View
            key={i}
            style={[
              styles.fill,
              { left: i * segW, width: segW, backgroundColor: s === 'correct' ? GREEN_DONE : ROSE },
            ]}
          />
        )
      ))}
      {/* Ticks last so they stay visible over the fills. */}
      {Array.from({ length: count - 1 }, (_, n) => (
        <View key={`t${n}`} style={[styles.tick, { left: `${((n + 1) * 100) / count}%` }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: INK_10,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
});
