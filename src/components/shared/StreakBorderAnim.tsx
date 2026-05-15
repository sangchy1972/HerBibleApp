import React, { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, withDelay, Easing,
  SharedValue,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Pill width in px. */
  width: number;
  /** Pill height in px. */
  height: number;
  /** Pill corner radius in px. */
  borderRadius: number;
  /** Total ms for sweep + fade. Default 5000. */
  duration?: number;
  /** Full laps the head makes around the perimeter. Default 2. */
  laps?: number;
}

// --- Trail tuning ---
// PARTICLE_COUNT: more = smoother trail, slightly more worklet cost.
// HEAD_R / TAIL_R: radius at the head (i = 0) vs the tail (i = LAST). The
//   head dot has 5-px diameter (radius 2.5), the tail melts to ~0.8 px so
//   the very last dot is invisible by the time opacity fades.
// HEAD_OP / TAIL_OP: per-dot opacity multipliers — the tail opacity goes
//   to zero so the trail truly disappears at its end.
// TRAIL_FRACTION: how much of the perimeter the trail spans (0–1). 0.3 is
//   a tight comet head; 0.5+ feels like a long ribbon.
// HEAD_COLOR / TAIL_COLOR: bright orange flame-tip → deep red ember tail.
const PARTICLE_COUNT = 24;
const HEAD_R = 2.5;
const TAIL_R = 0.4;
const HEAD_OP = 1.0;
const TAIL_OP = 0.0;
const TRAIL_FRACTION = 0.32;
const HEAD_COLOR: [number, number, number] = [255, 180, 84]; // #FFB454
const TAIL_COLOR: [number, number, number] = [196, 35, 35];  // #C42323

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rgbAt(t: number) {
  const r = Math.round(lerp(HEAD_COLOR[0], TAIL_COLOR[0], t));
  const g = Math.round(lerp(HEAD_COLOR[1], TAIL_COLOR[1], t));
  const b = Math.round(lerp(HEAD_COLOR[2], TAIL_COLOR[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

// One particle of the trail. Captures its index-derived static props
// (radius, fill, base-opacity, lag-along-the-trail) at render and reads
// the shared head progress on every frame to compute its (cx, cy).
function TrailDot({
  i, headProgress, containerOp, ix, iy, iw, ih, ir,
}: {
  i: number;
  headProgress: SharedValue<number>;
  containerOp: SharedValue<number>;
  ix: number; iy: number; iw: number; ih: number; ir: number;
}) {
  const t = i / (PARTICLE_COUNT - 1);
  const radius = lerp(HEAD_R, TAIL_R, t);
  const baseOp = lerp(HEAD_OP, TAIL_OP, t);
  const fill = rgbAt(t);
  const lag = t * TRAIL_FRACTION;

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    // Position along the rounded-rect perimeter, parameterised in [0, 1).
    // The head is at headProgress (mod 1); each dot trails by its own lag
    // so the trail extends backward along the path.
    const progress = headProgress.value - lag;
    const wrapped = progress - Math.floor(progress); // mod 1

    const flatLen = iw - 2 * ir;
    const arcLen = Math.PI * ir;
    const total = 2 * flatLen + 2 * arcLen;
    let s = wrapped * total;

    // Walk the four segments clockwise from the top-flat starting point
    // (ix + ir, iy). flat → right-arc → flat → left-arc.
    let cx = 0, cy = 0;
    if (s < flatLen) {
      cx = ix + ir + s;
      cy = iy;
    } else if ((s -= flatLen) < arcLen) {
      const a = -Math.PI / 2 + (s / arcLen) * Math.PI;
      cx = ix + iw - ir + ir * Math.cos(a);
      cy = iy + ir + ir * Math.sin(a);
    } else if ((s -= arcLen) < flatLen) {
      cx = ix + iw - ir - s;
      cy = iy + ih;
    } else {
      s -= flatLen;
      const a = Math.PI / 2 + (s / arcLen) * Math.PI;
      cx = ix + ir + ir * Math.cos(a);
      cy = iy + ir + ir * Math.sin(a);
    }

    // Hide dots whose lag exceeds the head's progress — without this the
    // trail "pre-spawns" wrapped behind the head before the first lap is
    // even underway, looking like a phantom orbit at t = 0.
    const fadeIn = lag > 0
      ? Math.min(1, Math.max(0, headProgress.value / lag))
      : 1;

    return {
      cx,
      cy,
      opacity: baseOp * fadeIn * containerOp.value,
    };
  });

  return <AnimatedCircle r={radius} fill={fill} animatedProps={animatedProps} />;
}

// Tapered comet trail that orbits a rounded-rect badge once or twice on
// screen focus, then fades. Used for the streak chip in the Prayer header.
//
// Why particles instead of a stroke: SVG strokes have uniform thickness
// and uniform opacity, so a continuous "border" sweep can't taper from a
// 5-px bright head to a hair-thin transparent tail. Rendering N circles
// along the path gives full per-position control over radius, opacity,
// and color — at the cost of a handful more worklet evaluations per frame
// (PARTICLE_COUNT × 60 fps ≈ 1.4 k/sec, negligible on modern hardware).
export default function StreakBorderAnim({
  width, height, borderRadius, duration = 5000, laps = 2,
}: Props) {
  // Inset by HEAD_R so the fattest particle (head, 5-px diameter) sits
  // fully inside the badge edge — no overhang clipped by the parent.
  const ix = HEAD_R;
  const iy = HEAD_R;
  const iw = Math.max(0, width - 2 * HEAD_R);
  const ih = Math.max(0, height - 2 * HEAD_R);
  const ir = Math.max(0, borderRadius - HEAD_R);

  // Timing strategy — three overlapping phases inside `duration`:
  //   • Sweep (0 → 95 %): head orbits the perimeter at constant speed.
  //   • Fade  (55 % → 100 %): container opacity eases to zero with a soft
  //     out-cubic curve. The fade starts well BEFORE the sweep ends so the
  //     comet "burns out" while still moving — no abrupt cut at the end,
  //     and no awkward static-trail-dimming after the head stops.
  //   • Overlap (55 % → 95 %): both running together — the visible trail
  //     dims gracefully as it completes its second lap.
  // The previous version used a 90 % / 10 % linear-fade split that snapped
  // off in the last 500 ms — exactly the abruptness called out in the spec.
  const sweepMs   = Math.round(duration * 0.95);
  const fadeStart = Math.round(duration * 0.55);
  const fadeMs    = duration - fadeStart;

  const headProgress = useSharedValue(0);
  const containerOp = useSharedValue(0);

  useFocusEffect(useCallback(() => {
    // Hard-reset before re-arming so quick re-focuses restart cleanly.
    headProgress.value = 0;
    containerOp.value = 1;
    headProgress.value = withTiming(laps, { duration: sweepMs, easing: Easing.linear });
    // out-cubic: fast initial dim then asymptotic approach to 0 — the
    // tail lingers very faintly instead of snapping off the screen.
    containerOp.value = withDelay(
      fadeStart,
      withTiming(0, { duration: fadeMs, easing: Easing.out(Easing.cubic) }),
    );
    return () => {
      // Mid-sweep blur — kill the overlay so it doesn't pop back on refocus.
      containerOp.value = 0;
    };
  }, [headProgress, containerOp, laps, sweepMs, fadeStart, fadeMs]));

  // Render the static index list once; the dots animate without React re-renders.
  const indices = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => i),
    [],
  );

  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {indices.map(i => (
        <TrailDot
          key={i}
          i={i}
          headProgress={headProgress}
          containerOp={containerOp}
          ix={ix}
          iy={iy}
          iw={iw}
          ih={ih}
          ir={ir}
        />
      ))}
    </Svg>
  );
}
