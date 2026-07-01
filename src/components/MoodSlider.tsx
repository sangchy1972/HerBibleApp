import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MoodEmoji, { MOOD_SLIDER_ORDER, MOOD_COLOR } from './MoodEmoji';

// Horizontal mood slider: a rainbow track (heavy → radiant) with a draggable
// thumb that snaps to one of the 9 mood positions. Built on gesture-handler +
// reanimated (the app's existing idiom) rather than the native community slider
// so the track can be a full gradient and the emoji/label can update live.

const COUNT = MOOD_SLIDER_ORDER.length;   // 9
const THUMB = 30;
const TRACK_H = 12;
const GRADIENT = MOOD_SLIDER_ORDER.map(m => MOOD_COLOR[m]) as [string, string, ...string[]];

interface Props {
  index: number;                       // controlled 0..8 into MOOD_SLIDER_ORDER
  onIndexChange: (i: number) => void;  // fired on every crossing + snap
}

export default function MoodSlider({ index, onIndexChange }: Props) {
  const trackW = useSharedValue(0);    // travel width (thumb centre range)
  const x = useSharedValue(0);         // thumb centre in [0, trackW]
  const startX = useSharedValue(0);

  // Worklet-safe (also callable from the JS thread) so snapTo can use it on the
  // UI thread without the "non-worklet on UI thread" runtime crash.
  const ratioFor = (i: number) => { 'worklet'; return COUNT > 1 ? i / (COUNT - 1) : 0; };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackW.value = w;
    x.value = ratioFor(index) * w;     // place thumb from the controlled index
  };

  // Reflect external index changes (initial value / edit-mode preset).
  useEffect(() => {
    if (trackW.value > 0) {
      x.value = withTiming(ratioFor(index) * trackW.value, { duration: 160 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // JS-thread emitter (only fires on an actual index change).
  const emit = (i: number) => { if (i !== index) onIndexChange(i); };

  const indexFromX = (px: number) => {
    'worklet';
    const w = trackW.value || 1;
    const r = Math.max(0, Math.min(1, px / w));
    return Math.round(r * (COUNT - 1));
  };
  const snapTo = (i: number) => {
    'worklet';
    x.value = withTiming(ratioFor(i) * trackW.value, { duration: 160, easing: Easing.out(Easing.cubic) });
  };

  const pan = Gesture.Pan()
    .onStart(() => { startX.value = x.value; })
    .onUpdate((e) => {
      const nx = Math.max(0, Math.min(trackW.value, startX.value + e.translationX));
      x.value = nx;
      runOnJS(emit)(indexFromX(nx));
    })
    .onEnd(() => { snapTo(indexFromX(x.value)); });

  const tap = Gesture.Tap()
    .onEnd((e) => {
      const nx = Math.max(0, Math.min(trackW.value, e.x));
      const i = indexFromX(nx);
      snapTo(i);
      runOnJS(emit)(i);
    });

  // Exclusive: a drag activates pan and suppresses the tap, so lifting after a
  // drag can't snap the thumb to the raw lift position. A plain tap (no movement)
  // still recognises because pan never activates.
  const gesture = Gesture.Exclusive(pan, tap);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - THUMB / 2 }] }));

  return (
    <View>
      {/* Tiny emoji previews above the bar so users see the whole range at a
          glance. Each sits exactly over its snap position; the active one pops
          up + fully opaque. Tapping one jumps the thumb there. */}
      <View style={styles.demos}>
        {MOOD_SLIDER_ORDER.map((m, i) => {
          const active = i === index;
          const sz = active ? 27 : 19;
          return (
            <TouchableOpacity
              key={m}
              activeOpacity={0.7}
              hitSlop={8}
              onPress={() => onIndexChange(i)}
              style={[styles.demoItem, { left: `${(i / (COUNT - 1)) * 100}%`, marginLeft: -sz / 2, opacity: active ? 1 : 0.4 }]}
            >
              <MoodEmoji mood={m} size={sz} />
            </TouchableOpacity>
          );
        })}
      </View>

      <GestureDetector gesture={gesture}>
        <View style={styles.wrap}>
          <View style={styles.track} onLayout={onLayout}>
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: TRACK_H / 2 }]}
            />
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // Preview row: inset by THUMB/2 to match the thumb's travel, so each demo's
  // left% lands exactly on its snap position. Children are absolutely placed;
  // they align to the bottom so the enlarged active one grows upward.
  demos: { height: 34, marginHorizontal: THUMB / 2, marginBottom: 8 },
  demoItem: { position: 'absolute', bottom: 0, alignItems: 'center', justifyContent: 'flex-end' },
  // Horizontal padding = half the thumb so the thumb sits flush at both ends
  // without clipping. Extra vertical height gives a comfortable drag target.
  wrap: { paddingHorizontal: THUMB / 2, height: THUMB + 16, justifyContent: 'center' },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2, justifyContent: 'center' },
  thumb: {
    position: 'absolute', left: 0,
    width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    top: (TRACK_H - THUMB) / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22, shadowRadius: 4, elevation: 4,
  },
});
