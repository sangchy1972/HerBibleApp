import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

// Per-section slide-up + fade for the bottom-tab screens. Each section calls
// this with its own `delay` so the screen lifts into place in waves.
//
// PERF NOTES (audit — Jan 2026): the old behaviour ran the entrance on
// EVERY focus event (including after popping back from a nested screen)
// with 480 ms duration + delays up to 290 ms — total cascade ~770 ms.
// Combined with the 320 ms stack transition, that's >1 s of "screen
// still loading" perception on every tap. Fixed by:
//   • Duration 480 → 220 ms (still reads as motion, no longer dominates).
//   • Translate distance 24 → 18 px (proportional finish).
//   • Animation runs ONCE per mount — subsequent focuses (returning from
//     a nested screen) are no-ops, so the user lands on a fully-rendered
//     screen instead of waiting for animations to play again.
// The wrapper screens scale their `delay` props down 3× to match — see
// PrayerScreen / PlanScreen edits.
const ENTRANCE_DURATION_MS = 220;
const TRANSLATE_FROM = 18;
export function useTabFocusEntrance(delay = 0) {
  const translateY = useSharedValue(TRANSLATE_FROM);
  const opacity = useSharedValue(0);
  // True until the FIRST focus has fired; subsequent focuses are no-ops so
  // the user isn't waiting for animations to finish before they can tap.
  const firstFocus = useRef(true);

  useFocusEffect(useCallback(() => {
    if (!firstFocus.current) return undefined;
    firstFocus.current = false;
    translateY.value = TRANSLATE_FROM;
    opacity.value = 0;
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );
    return undefined;
  }, [delay, translateY, opacity]));

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

// Resets the given scroll ref to y=0 every time the screen is focused. Kept
// separate from the entrance animation so callers can mix-and-match (e.g.
// BibleScreen, which has a focus-verse path that skips the reset).
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
export function useTabFocusScrollReset(scrollRef: RefObject<ScrollView | null>, enabled = true) {
  useFocusEffect(useCallback(() => {
    if (enabled) scrollRef.current?.scrollTo({ y: 0, animated: false });
    return undefined;
  }, [scrollRef, enabled]));
}
