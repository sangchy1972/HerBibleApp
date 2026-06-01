import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, StyleSheet, Easing, type ViewStyle } from 'react-native';
import { ROSE } from '../constants/theme';

// A toggle whose pink track is intentionally larger than the platform default
// while the white knob keeps the stock size — RN's built-in <Switch> scales the
// whole control (track AND thumb) together, so a bigger track with an unchanged
// thumb is only achievable with a custom component.
//
// Sizing (relative to the iOS stock 51×31 track / 27 knob the design references):
//   • track width  : 66 × 0.90 ≈ 59  (was +30%, then trimmed 10% per design)
//   • track height : 34 × 0.90 ≈ 31  (was +10%, then trimmed 10% per design)
//   • knob         : 27               (UNCHANGED — stays the stock size)
const TRACK_W = 59;
const TRACK_H = 31;
const KNOB = 27;
const PAD = (TRACK_H - KNOB) / 2;          // vertical/horizontal inset so the knob centres
const TRAVEL = TRACK_W - KNOB - PAD * 2;    // knob slide distance, off → on

const OFF_TRACK = 'rgba(30,27,46,0.18)';    // same neutral the RN Switch used before

interface Props {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function WideSwitch({ value, onValueChange, disabled, style }: Props) {
  // 0 = off, 1 = on. Drives both the track colour and the knob position so the
  // two stay in lockstep through the animation.
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      // Colour interpolation can't run on the native driver, and we want the
      // track colour + knob slide perfectly synced off one value → JS driver.
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [OFF_TRACK, ROSE],
  });
  const knobX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAVEL],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={[{ opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: knobX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    // Subtle lift so the white knob reads against the pink track, matching the
    // platform switch's drop shadow.
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
