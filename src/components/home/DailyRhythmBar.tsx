import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, AccessibilityInfo } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence,
  withDelay, withRepeat, cancelAnimation, Easing, runOnJS,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { RHYTHM_STEPS, type RhythmDotState } from '../../state/dailyRhythm';

// Permanent Daily Rhythm bar (presentational). PrayerScreen computes the
// rhythm view (state machine in src/state/dailyRhythm.ts) and hands us the
// resolved text/icon/action; this component owns only the visuals:
//   • white card matching the screen's other cards (no rose outline),
//   • 1–5 step dots where the old X button sat,
//   • "liquid pop" when a dot completes, a left→right wave + sparkle when the
//     whole day completes, and a soft crossfade when the suggestion changes.
// Animations only fire for a false→true completion on the SAME calendar day
// while the tab is focused — a midnight reset snaps silently.

const RETIRED_LAV = '#866BC059';   // LAV @ 35% — "graduated" gospel steps
const DOT = 18;

function DotGlyph({ state, index }: { state: RhythmDotState; index: number }) {
  if (state === 'done' || state === 'retired') {
    return <Feather name="check" size={11} color="#FFFFFF" />;
  }
  const color = state === 'current' ? ROSE
    : state === 'locked' ? 'rgba(30,27,46,0.28)'
    : TXTSUB;
  return <Text style={[styles.dotNum, { color }]}>{index + 1}</Text>;
}

function dotBase(state: RhythmDotState) {
  switch (state) {
    case 'done':    return { backgroundColor: ROSE };
    case 'retired': return { backgroundColor: RETIRED_LAV };
    case 'current': return { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: ROSE };
    case 'pending': return { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(30,27,46,0.18)' };
    case 'locked':  return { backgroundColor: 'rgba(30,27,46,0.05)' };
  }
}

// One rhythm dot. `celebrateAt`/`waveAt` are monotonically bumped counters —
// a change (from a non-zero baseline) triggers the respective choreography.
function RhythmDot({ state, index, celebrateAt, waveAt, reduceMotion }: {
  state: RhythmDotState; index: number; celebrateAt: number; waveAt: number; reduceMotion: boolean;
}) {
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const glyph = useSharedValue(1);
  const rippleScale = useSharedValue(1);
  const rippleOpacity = useSharedValue(0);

  // Liquid pop: squash/stretch with under-damped springs overshooting in
  // opposite axes + an expanding ring. (Spec §5a.)
  const prevCelebrate = useRef(celebrateAt);
  useEffect(() => {
    if (celebrateAt === prevCelebrate.current) return;
    prevCelebrate.current = celebrateAt;
    if (reduceMotion) return;
    sx.value = withSequence(
      withTiming(1.30, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 7, stiffness: 200, mass: 0.7 }),
    );
    sy.value = withSequence(
      withTiming(0.72, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 7, stiffness: 200, mass: 0.7 }),
    );
    glyph.value = 0;
    glyph.value = withDelay(120, withSpring(1, { damping: 10, stiffness: 260 }));
    rippleScale.value = 1;
    rippleOpacity.value = 0.35;
    rippleScale.value = withTiming(1.9, { duration: 450, easing: Easing.out(Easing.cubic) });
    rippleOpacity.value = withTiming(0, { duration: 450 });
  }, [celebrateAt, reduceMotion, sx, sy, glyph, rippleScale, rippleOpacity]);

  // All-done wave: gentle left→right swell across all five dots. (Spec §5b.)
  const prevWave = useRef(waveAt);
  useEffect(() => {
    if (waveAt === prevWave.current) return;
    prevWave.current = waveAt;
    if (reduceMotion) return;
    const swell = withDelay(index * 70, withSequence(
      withTiming(1.18, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 9, stiffness: 220 }),
    ));
    sx.value = swell;
    sy.value = withDelay(index * 70, withSequence(
      withTiming(1.18, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 9, stiffness: 220 }),
    ));
  }, [waveAt, index, reduceMotion, sx, sy]);

  // Idle pulse on the current dot only — the single allowed loop.
  useEffect(() => {
    if (state === 'current' && !reduceMotion) {
      sx.value = withRepeat(withSequence(
        withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 500 }),
      ), -1);
      sy.value = withRepeat(withSequence(
        withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 500 }),
      ), -1);
    }
    return () => {
      cancelAnimation(sx); cancelAnimation(sy);
      sx.value = 1; sy.value = 1;
    };
  }, [state, reduceMotion, sx, sy]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: sx.value }, { scaleY: sy.value }],
  }));
  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ scale: glyph.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [{ scale: rippleScale.value }],
  }));

  return (
    <View style={styles.dotSlot}>
      <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle]} />
      <Animated.View style={[styles.dot, dotBase(state), dotStyle]}>
        <Animated.View style={glyphStyle}>
          <DotGlyph state={state} index={index} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// Tiny 4-point sparkle (same visual language as the streak celebration star).
function Sparkle({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 1 L14.6 9.4 L23 12 L14.6 14.6 L12 23 L9.4 14.6 L1 12 L9.4 9.4 Z"
        fill="#FFFFFF" stroke="#F4D58A" strokeWidth={1.6}
      />
    </Svg>
  );
}

export default function DailyRhythmBar({
  todayYmd, dots, doneCount, allDone, icon, text, hintText, onPress,
}: {
  todayYmd: string;
  dots: RhythmDotState[];              // length 5, canonical order
  doneCount: number;
  allDone: boolean;
  icon: keyof typeof Feather.glyphMap;
  text: string;
  hintText: string | null;             // rest states: tap pops this instead of navigating
  onPress: (() => void) | null;        // step states: navigate
}) {
  const isFocused = useIsFocused();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setReduceMotion(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  // ── Completion detection (spec §5 guards) ─────────────────────────────────
  // Snapshot {ymd, dots}; animate a dot only on a not-done → done flip with an
  // UNCHANGED ymd while focused. Reconciled on focus regain so completing a
  // step inside a pushed flow celebrates when the user lands back here.
  const snap = useRef<{ ymd: string; dots: RhythmDotState[] } | null>(null);
  const [celebrates, setCelebrates] = useState<number[]>([0, 0, 0, 0, 0]);
  const [waveAt, setWaveAt] = useState(0);
  const wasAllDone = useRef(allDone);
  const waveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (waveTimer.current) clearTimeout(waveTimer.current); }, []);
  useEffect(() => {
    if (!isFocused) return;                       // reconcile only while visible
    const prev = snap.current;
    snap.current = { ymd: todayYmd, dots: [...dots] };
    const wasComplete = wasAllDone.current;
    wasAllDone.current = allDone;
    if (!prev || prev.ymd !== todayYmd) return;   // first render / day rolled → snap silently
    const isDone = (s: RhythmDotState) => s === 'done' || s === 'retired';
    const flipped = RHYTHM_STEPS.map((_, k) => !isDone(prev.dots[k]) && isDone(dots[k]));
    if (flipped.some(Boolean)) {
      setCelebrates(c => c.map((v, k) => (flipped[k] ? v + 1 : v)));
      // Whole-day completion chains 350ms after the dot pop finishes (~950ms).
      if (allDone && !wasComplete) {
        if (waveTimer.current) clearTimeout(waveTimer.current);
        waveTimer.current = setTimeout(() => setWaveAt(w => w + 1), 1300);
      }
    }
  }, [isFocused, todayYmd, dots, allDone]);

  // Sparkle rides the all-done wave.
  const sparkOpacity = useSharedValue(0);
  const sparkY = useSharedValue(0);
  const sparkScale = useSharedValue(0.6);
  const prevWave = useRef(waveAt);
  useEffect(() => {
    if (waveAt === prevWave.current) return;
    prevWave.current = waveAt;
    if (reduceMotion) return;
    sparkOpacity.value = 0; sparkY.value = 0; sparkScale.value = 0.6;
    sparkOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withDelay(330, withTiming(0, { duration: 150 })),
    );
    sparkY.value = withTiming(-12, { duration: 600, easing: Easing.out(Easing.cubic) });
    sparkScale.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
      withTiming(0.8, { duration: 300 }),
    );
  }, [waveAt, reduceMotion, sparkOpacity, sparkY, sparkScale]);
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: sparkOpacity.value,
    transform: [{ translateY: sparkY.value }, { scale: sparkScale.value }],
  }));

  // ── Text/icon crossfade on suggestion change (spec §5c) ───────────────────
  // Manual two-phase swap (out 160ms ↑, swap, in 200ms ↓) — no keyed remount,
  // so the row never double-stacks mid-transition. `latest` wins if the
  // suggestion changes again mid-flight.
  const [shown, setShown] = useState({ icon, text });
  const latest = useRef({ icon, text });
  const msgOpacity = useSharedValue(1);
  const msgY = useSharedValue(0);
  const applyLatest = () => setShown({ ...latest.current });
  useEffect(() => {
    latest.current = { icon, text };
    if (shown.icon === icon && shown.text === text) return;
    if (reduceMotion) { setShown({ icon, text }); return; }
    cancelAnimation(msgOpacity); cancelAnimation(msgY);
    msgOpacity.value = withTiming(0, { duration: 160 }, (fin) => { if (fin) runOnJS(applyLatest)(); });
    msgY.value = withTiming(-6, { duration: 160 });
  }, [icon, text]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // `shown` just swapped → slide the new line in from below.
    if (reduceMotion) { msgOpacity.value = 1; msgY.value = 0; return; }
    msgY.value = 6;
    msgOpacity.value = withDelay(40, withTiming(1, { duration: 200 }));
    msgY.value = withDelay(40, withTiming(0, { duration: 200 }));
  }, [shown]);        // eslint-disable-line react-hooks/exhaustive-deps
  const msgStyle = useAnimatedStyle(() => ({
    opacity: msgOpacity.value,
    transform: [{ translateY: msgY.value }],
  }));

  // ── Rest-state hint (toast via Modal, same pattern as the hero card) ──────
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  const handlePress = () => {
    if (onPress) { onPress(); return; }
    if (!hintText) return;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(hintText);
    hintTimer.current = setTimeout(() => setHint(null), 3200);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.bar}
        activeOpacity={0.85}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${shown.text}. ${doneCount} / 5.`}
      >
        <Animated.View style={[styles.msg, msgStyle]}>
          <Feather name={shown.icon} size={16} color={ROSE} />
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {shown.text}
          </Text>
        </Animated.View>
        <View style={styles.dotsRow} importantForAccessibility="no-hide-descendants">
          <Animated.View pointerEvents="none" style={[styles.spark, sparkStyle]}>
            <Sparkle size={20} />
          </Animated.View>
          {dots.map((d, k) => (
            <RhythmDot
              key={RHYTHM_STEPS[k]}
              state={d}
              index={k}
              celebrateAt={celebrates[k]}
              waveAt={waveAt}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      </TouchableOpacity>

      <Modal
        visible={!!hint}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setHint(null)}
      >
        <TouchableOpacity style={styles.hintOverlay} activeOpacity={1} onPress={() => setHint(null)}>
          <View style={styles.hintCard} pointerEvents="none">
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same gutter as every section below (P=17 applied by the parent wrapper in
  // PrayerScreen) — the bar itself is a plain white card matching the
  // PlanProgressCard/Continue-Reading card language: radius 9.8, soft shadow,
  // NO border.
  wrap: { marginTop: 6, marginBottom: 4 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 9.8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  msg: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 10 },
  title: { flex: 1, fontSize: 13.5, fontWeight: '600', color: TXT, fontFamily: FONTS.latoBold },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotSlot: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: DOT, height: DOT, borderRadius: DOT / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dotNum: { fontSize: 10, fontWeight: '600', fontFamily: FONTS.latoBold },
  ripple: {
    position: 'absolute',
    width: DOT, height: DOT, borderRadius: DOT / 2,
    borderWidth: 1.5, borderColor: ROSE,
  },
  spark: { position: 'absolute', top: -14, left: '50%', marginLeft: -10 },
  // Toast hint — mirrors the hero card's wait-state hint visuals.
  hintOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,16,28,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  hintCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 18,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  hintText: { color: TXT, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
