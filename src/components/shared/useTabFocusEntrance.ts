import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

// Per-section slide-up + fade for the bottom-tab screens. Each section calls
// this with its own `delay` so the screen lifts into place in waves.
//
// TIMING (2026-07-19, per user): the entrance plays on EVERY focus — landing
// on a tab (including programmatic jumps like the rhythm bar's "Discover a
// reading plan" → Plans/Explore) always shows the sections arriving one by
// one — and the whole cascade takes ~0.8 s. A Jan-2026 perf audit had cut
// this to a once-per-mount 220 ms flash; the user explicitly wants the
// ceremony back, uniformly on every screen.
//
// Call sites still pass the audit-era delays (scaled ÷3 back then) — they're
// re-inflated by STAGGER_SCALE here so every screen slows down in lockstep
// without touching each wrapper. (PrayerScreen's waves land 0–225 ms apart →
// last section settles ≈ 725 ms; Plans ≈ 650 ms.)
const ENTRANCE_DURATION_MS = 500;
const STAGGER_SCALE = 3;
const TRANSLATE_FROM = 22;
// Extra slack after the timing nominally ends before we hand the view back to
// plain RN — covers the delay + duration + a couple of frames of jitter.
const SETTLE_SLACK_MS = 80;
// The resting style. A PLAIN object (not a worklet style) on purpose — see the
// long note below.
const RESTING_STYLE = { opacity: 1 } as const;

export function useTabFocusEntrance(delay = 0) {
  const translateY = useSharedValue(TRANSLATE_FROM);
  const opacity = useSharedValue(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // ANDROID TOUCH BUG (the "visible but untappable" home-screen cards).
  //
  // While a view carries a Reanimated animated style, Reanimated OWNS that
  // view: it pushes props straight to the native view off the React commit
  // path. On Fabric/Android the native TOUCH REGIONS of that view's subtree
  // then stay pinned to the layout that existed when the animation attached.
  // That is fine for a static subtree — but PrayerScreen's block GROWS after
  // mount (GospelPsalmCards renders null until AsyncStorage resolves, then
  // pushes ~250 px of content in). Result: everything is DRAWN in the right
  // place, but the hit regions below the growth point are stale —
  //   • the Gospel & Psalm cards never had a hit region (didn't exist at
  //     first layout) → completely dead,
  //   • Plans In Progress / Continue Reading kept the region they had ~250 px
  //     higher up → taps on the real button land nowhere.
  // Which is exactly the reported symptom, and why it used to be flaky
  // ("sometimes") — a warm AsyncStorage read landed before first layout.
  //
  // Fix: the entrance is a ONE-SHOT. Once it's done we drop the animated
  // style entirely and return a plain style object, which detaches the view
  // from Reanimated and hands layout + hit-testing back to RN. Any later
  // growth is then measured normally. We keep the same <Animated.View>
  // element type so the swap doesn't remount the subtree.
  // ─────────────────────────────────────────────────────────────────────────
  const [settled, setSettled] = useState(false);

  // Landing the view back on plain RN has ONE hard requirement: Reanimated's
  // LAST native write must already be the resting value.
  //
  // Reanimated pushes props straight to the native view, bypassing RN's shadow
  // tree. So if we detach while the timing is still ramping, RN diffs its own
  // (unchanged) opacity, finds nothing to commit, and the native alpha stays
  // frozen wherever the animation happened to be — the sections render at ~35 %
  // and the whole screen looks washed out. That is exactly what a plain
  // setTimeout did: on a cold start the UI thread is busy decoding images so the
  // animation runs late, while the JS timer fires dead on time.
  //
  // Cancelling and assigning the final values makes Reanimated write 1 / 0
  // natively itself, so the hand-off is clean no matter who won the race.
  const settle = useCallback(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateY);
    opacity.value = 1;
    translateY.value = 0;
    setSettled(true);
  }, [opacity, translateY]);

  useFocusEffect(useCallback(() => {
    const d = delay * STAGGER_SCALE;
    // Re-arm: hand the view back to Reanimated for this focus's play-through.
    setSettled(false);
    cancelAnimation(translateY);
    cancelAnimation(opacity);
    translateY.value = TRANSLATE_FROM;
    opacity.value = 0;
    translateY.value = withDelay(
      d,
      withTiming(0, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );
    // PRIMARY settle signal: the animation itself says when it's done, so we can
    // never detach mid-ramp.
    opacity.value = withDelay(
      d,
      withTiming(1, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(settle)();
      }),
    );
    // Watchdog, in case that callback never lands (a stalled JS thread, dev fast
    // refresh resuming with frozen shared values). `settle` cancels first, so
    // firing early is harmless — it just ends the entrance sooner.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, d + ENTRANCE_DURATION_MS + SETTLE_SLACK_MS + 500);
    // Blur mid-entrance → land on the resting values so the section can never
    // stick semi-transparent while the tab is away.
    return () => settle();
  }, [delay, translateY, opacity, settle]));

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return settled ? RESTING_STYLE : animStyle;
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
