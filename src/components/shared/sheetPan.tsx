import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn, Easing, useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

// The app's bottom-sheet pan pattern — dim + slide-up, swipe-down dismiss.
// Extracted from ProfileScreen (2026-08-22) when its sheets started living on
// more than one screen; the mechanics are unchanged.

export const SHEET_OFFSET = 1000;

export function useSheetPan(onClose: () => void, visible: boolean) {
  const dragY = useSharedValue(SHEET_OFFSET);
  // The slide-IN is driven by this shared value too — NOT a reanimated
  // `entering` layout animation. A shared SlideInDown builder reused across
  // remounts intermittently failed to replay, leaving the sheet parked
  // off-screen under the backdrop (the "every-other-tap nothing appears" bug).
  // Driving translateY ourselves replays reliably every open and always
  // resets, so the bug can't recur.
  useEffect(() => {
    if (visible) {
      dragY.value = SHEET_OFFSET;
      dragY.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) });
    } else {
      dragY.value = SHEET_OFFSET;          // park off-screen, ready for the next open
    }
  }, [visible, dragY]);
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        dragY.value = withTiming(SHEET_OFFSET, { duration: 280 }, (f) => { if (f) runOnJS(onClose)(); });
      } else {
        dragY.value = withTiming(0, { duration: 240 });
      }
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  return { gesture: pan, sheetStyle };
}

export function SheetBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
    >
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
    </Animated.View>
  );
}
