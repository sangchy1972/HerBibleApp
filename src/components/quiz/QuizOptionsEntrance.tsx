import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';

// Slide-in entrance for a question's option list: each option enters from off
// the RIGHT edge, staggered 100ms apart, the whole sequence done at 500ms
// (per user). Mount-keyed by the parent (round + position), so every new
// question — including a retry round re-asking the same one — replays it.
//
// One shared value drives all options through per-index interpolation windows:
//   per-option slide = TOTAL − (count−1)·STAGGER   (200ms for 4 options,
//   400ms for a 2-option true/false), so the LAST option always lands exactly
//   at 500ms no matter how many there are.
//
// Shared values, never `entering=` (repo rule — layout animations have burned
// this codebase repeatedly), and the wrappers HAND BACK to plain Views once the
// entrance settles: Reanimated-owned views can freeze native touch regions on
// Android/Fabric, and these wrap the only tappable things on the screen. The
// watchdog makes a dropped timing settle visible-and-tappable rather than
// stranding the options off-screen.

const TOTAL_MS = 500;
const STAGGER_MS = 100;
// Everything must be at rest by TOTAL_MS; the margin covers a dropped frame
// before the handback.
const SETTLE_MS = TOTAL_MS + 150;

function OptionSlide({
  index, count, progress, fromX, settled, children,
}: {
  index: number;
  count: number;
  progress: SharedValue<number>;
  fromX: number;
  settled: boolean;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const per = TOTAL_MS - (count - 1) * STAGGER_MS;
    const start = (index * STAGGER_MS) / TOTAL_MS;
    const end = (index * STAGGER_MS + per) / TOTAL_MS;
    const t = interpolate(progress.value, [start, end], [0, 1], Extrapolation.CLAMP);
    const eased = 1 - (1 - t) ** 3;                 // outCubic decel per option
    return {
      opacity: Math.min(1, eased * 1.4),            // fully opaque by ~70% of the slide
      transform: [{ translateX: (1 - eased) * fromX }],
    };
  });
  // Settled → plain RN owns the touch region again.
  if (settled) return <View>{children}</View>;
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function QuizOptionsEntrance({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const items = React.Children.toArray(children);
  const progress = useSharedValue(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // Linear master clock — each option applies its own easing inside its
    // window, so easing the master would double-ease the stagger.
    progress.value = withTiming(1, { duration: TOTAL_MS, easing: Easing.linear });
    const wd = setTimeout(() => { progress.value = 1; setSettled(true); }, SETTLE_MS);
    return () => clearTimeout(wd);
  }, [progress]);

  return (
    <>
      {items.map((child, i) => (
        <OptionSlide
          key={i}
          index={i}
          count={items.length}
          progress={progress}
          fromX={width}
          settled={settled}
        >
          {child}
        </OptionSlide>
      ))}
    </>
  );
}
