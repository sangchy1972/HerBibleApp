import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ROSE, GREEN_DONE, INK_10, TXT, FONTS } from '../../constants/theme';
import type { SegmentState } from '../../state/quizSession';

// The five-arc score ring for the retry screen.
//
// Same information as QuizSegmentBar and the same rules — one arc per question,
// POSITIONAL, so a wrong answer at position 2 stays red at position 2 with
// position 3 still empty. Do not pack them left.
//
// Why a ring and not the bar: on the retry screen the score IS the screen. A
// 6px bar under a headline reads as a footnote; a ring with the count in the
// middle reads as the result, which is what it is. The bar keeps its job in the
// home card and the in-quiz header, where the score is genuinely secondary.
//
// Drawn as one <Circle> per arc via strokeDasharray rather than five <Path>s:
// arcs on a circle are exactly what dash arrays describe, and a path per
// segment would need its own trig and would round its caps differently at the
// seams.

/**
 * The gap you actually SEE between two arcs, in degrees.
 *
 * Not the gap in the dash array — `strokeLinecap="round"` adds half a stroke
 * width of arc beyond each end, so a naive 7° dash gap on a 15px stroke at this
 * radius rendered as a 4.2° OVERLAP: the ring read as one continuous circle,
 * which is the exact thing five arcs exist to avoid. Worse, later arcs paint
 * over earlier ones, so a grey empty arc ate the trailing edge of the green one
 * next to it and the erosion changed shape with every score.
 *
 * Deriving the dash from this and the measured cap width means the constant
 * means what it says at any size or stroke.
 */
const VISIBLE_GAP_DEG = 5;

export default function QuizSegmentRing({
  segments, size = 168, stroke = 15, label,
}: {
  segments: SegmentState[];
  /** Outer box. The ring is inset by half the stroke so nothing clips. */
  size?: number;
  stroke?: number;
  /** Spoken instead of the glyphs. "2/5" is read as "two slash five", and the
   *  per-question right/wrong is carried by colour alone — so the caller passes
   *  the sentence the old score line used to say. */
  label?: string;
}) {
  const count = segments.length || 1;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const segDeg = 360 / count;
  // How far ONE round cap juts past the dash it terminates.
  const capDeg = ((stroke / 2) / circumference) * 360;
  // Shrink the drawn dash by both caps AND the gap we want to remain visible.
  // Floored at a hairline so a pathological stroke/size can't produce a
  // negative dash (which SVG renders as nothing at all).
  const arcDeg = Math.max(1, segDeg - VISIBLE_GAP_DEG - capDeg * 2);
  const arcLen = circumference * (arcDeg / 360);
  const gapLen = circumference - arcLen;

  const correct = segments.filter(s => s === 'correct').length;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Svg width={size} height={size}>
        {segments.map((s, i) => (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            // Empty still draws, in the track tint — the ring must always show
            // five marks, or "2 of 5" loses the "of 5".
            stroke={s === 'correct' ? GREEN_DONE : s === 'wrong' ? ROSE : INK_10}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            // One dash of arcLen then a gap that swallows the rest of the
            // circle, rotated into this segment's slot. Half the gap of offset
            // centres each arc in its slice.
            strokeDasharray={`${arcLen} ${gapLen}`}
            // Centre the drawn arc in its slice: skip the half-slot of padding,
            // then the cap that will jut back into it.
            strokeDashoffset={-(circumference * (i * segDeg + (segDeg - arcDeg) / 2 + capDeg)) / 360}
            // -90 puts segment 0 at twelve o'clock; without it the ring starts
            // at three o'clock and the first question reads as the second.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </Svg>
      <View style={styles.centre} pointerEvents="none">
        <Text style={styles.count} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no">
          {correct}/{count}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 30,
    color: TXT, letterSpacing: 0.3,
  },
});
