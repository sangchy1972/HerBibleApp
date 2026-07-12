import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, AccessibilityInfo } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence,
  cancelAnimation, Easing, runOnJS,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { ROSE, BTN_RADIUS, TXT, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { RHYTHM_STEPS, isRhythmStepDone, type RhythmDotState } from '../../state/dailyRhythm';

// Permanent Daily Rhythm bar (presentational). PrayerScreen computes the
// rhythm view (state machine in src/state/dailyRhythm.ts) and hands us the
// resolved text/action; this component owns only the visuals:
//   • a soft pink→white→lavender gradient card (borderless, per user) with
//     the suggestion text and — on actionable steps — a small rose "Start"
//     pill on the right (decorative: the WHOLE card is the touch target),
//   • a 5-SEGMENT progress bar hugging the card's inner bottom with a live
//     percentage at its right — one segment per rhythm step (20% each),
//     replacing the old 1–5 numbered dots AND the screen's separate
//     "Today's Progress" section (merged per user). Track/fill/tick styles
//     carried over from that section verbatim (height 6, rose fill, white
//     ticks) — only the tick count changed (1→4).
//   • a left→right fill sweep when a step completes, a sparkle when the whole
//     day completes, and a soft crossfade when the suggestion changes.
// Animations only fire for a false→true completion on the SAME calendar day
// while the tab is focused — a midnight reset snaps silently.

const RETIRED_LAV = '#866BC059';   // LAV @ 35% — "graduated" gospel steps
const SEGMENTS = RHYTHM_STEPS.length;   // 5

// Silk backdrop — five soft radial color pools (theme pinks/lavenders/white)
// that overlap with no hard boundaries, mesh-gradient style (per user: "more
// Apple"). Positions/radii are fractions of the card's measured size; each
// pool fades to fully transparent at its rim so the blends stay seamless.
const SILK_BASE = '#FDF4F8';
const SILK_POOLS: ReadonlyArray<{ cx: number; cy: number; r: number; color: string }> = [
  { cx: 0.10, cy: 0.10, r: 0.55, color: '#F9D9E6' },   // pink, top-left
  { cx: 0.46, cy: -0.15, r: 0.55, color: '#FFFFFF' },  // white light, top-center
  { cx: 0.90, cy: 0.15, r: 0.60, color: '#E3DAF5' },   // lavender, top-right
  { cx: 0.26, cy: 1.10, r: 0.60, color: '#EFE2F3' },   // soft violet, bottom-left
  { cx: 0.68, cy: 0.95, r: 0.55, color: '#FBDCEB' },   // rose, bottom-right
  { cx: 1.02, cy: 0.90, r: 0.45, color: '#EBE3F8' },   // lavender, bottom-right corner
];

// One segment's rose fill. `animateAt` is a monotonically bumped counter — a
// change (from a non-zero baseline) sweeps the fill in; every other change of
// `filled` (hydration, day rollover, reduce-motion) snaps instantly so a
// completed step can NEVER render an empty segment.
function SegmentFill({ filled, animateAt, x, segW, color, reduceMotion }: {
  filled: boolean; animateAt: number; x: number; segW: number; color: string; reduceMotion: boolean;
}) {
  const w = useSharedValue(filled ? segW : 0);
  const prevAnimate = useRef(animateAt);
  useEffect(() => {
    const shouldSweep = animateAt !== prevAnimate.current && filled && !reduceMotion && segW > 0;
    prevAnimate.current = animateAt;
    cancelAnimation(w);
    if (shouldSweep) {
      w.value = 0;
      w.value = withTiming(segW, { duration: 540, easing: Easing.out(Easing.cubic) });
    } else {
      w.value = filled ? segW : 0;   // snap — includes layout width changes
    }
  }, [filled, animateAt, segW, reduceMotion, w]);
  const fillStyle = useAnimatedStyle(() => ({ width: w.value }));
  return <Animated.View style={[styles.segFill, { left: x, backgroundColor: color }, fillStyle]} />;
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
  todayYmd, dots, doneCount, allDone, text, hintText, onPress,
}: {
  todayYmd: string;
  dots: RhythmDotState[];              // length 5, canonical order
  doneCount: number;
  allDone: boolean;
  text: string;
  hintText: string | null;             // rest states: tap pops this instead of navigating
  onPress: (() => void) | null;        // step states: navigate
}) {
  const t = useT();
  const isFocused = useIsFocused();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setReduceMotion(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  // Track width, measured once — segment geometry derives from it. Until the
  // first onLayout, fills render at width 0 (segW=0 → snap path), then snap to
  // the correct widths on measure; no flash of wrong geometry.
  const [trackW, setTrackW] = useState(0);
  const segW = trackW > 0 ? trackW / SEGMENTS : 0;
  // Card size for the gradient backdrop — measured explicitly because an
  // absolute-filled Svg does NOT re-size when the card grows (it froze at the
  // pre-track layout, leaving the bottom strip unpainted).
  const [card, setCard] = useState({ w: 0, h: 0 });

  // ── Completion detection (spec §5 guards) ─────────────────────────────────
  // Snapshot {ymd, dots}; animate a segment only on a not-done → done flip
  // with an UNCHANGED ymd while focused. Reconciled on focus regain so
  // completing a step inside a pushed flow sweeps when the user lands back.
  const snap = useRef<{ ymd: string; dots: RhythmDotState[] } | null>(null);
  const [celebrates, setCelebrates] = useState<number[]>(() => Array(SEGMENTS).fill(0));
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
    const flipped = RHYTHM_STEPS.map((_, k) => !isRhythmStepDone(prev.dots[k]) && isRhythmStepDone(dots[k]));
    if (flipped.some(Boolean)) {
      setCelebrates(c => c.map((v, k) => (flipped[k] ? v + 1 : v)));
      // Whole-day sparkle chains once the segment sweep lands (~540ms).
      if (allDone && !wasComplete) {
        if (waveTimer.current) clearTimeout(waveTimer.current);
        waveTimer.current = setTimeout(() => setWaveAt(w => w + 1), 800);
      }
    }
  }, [isFocused, todayYmd, dots, allDone]);

  // Sparkle rises from the bar on whole-day completion.
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

  // ── Text crossfade on suggestion change (spec §5c) ────────────────────────
  // Manual two-phase swap (out 160ms ↑, swap, in 200ms ↓) — no keyed remount,
  // so the row never double-stacks mid-transition. `latest` wins if the
  // suggestion changes again mid-flight.
  const [shown, setShown] = useState({ text });
  const latest = useRef({ text });
  const msgOpacity = useSharedValue(1);
  const msgY = useSharedValue(0);
  const swapWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyLatest = () => {
    if (swapWatchdog.current) { clearTimeout(swapWatchdog.current); swapWatchdog.current = null; }
    setShown({ ...latest.current });
  };
  useEffect(() => () => { if (swapWatchdog.current) clearTimeout(swapWatchdog.current); }, []);
  useEffect(() => {
    latest.current = { text };
    if (shown.text === text) return;
    if (reduceMotion) { setShown({ text }); return; }
    cancelAnimation(msgOpacity); cancelAnimation(msgY);
    msgOpacity.value = withTiming(0, { duration: 160 }, (fin) => { if (fin) runOnJS(applyLatest)(); });
    msgY.value = withTiming(-6, { duration: 160 });
    // Watchdog: if the animation-completion runOnJS gets dropped (saturated
    // UI thread, dev fast-refresh), the text would stay at opacity 0 FOREVER
    // — the card reads as empty. Force the swap shortly after the nominal
    // out-phase; applyLatest re-triggers the in-phase, which is idempotent.
    if (swapWatchdog.current) clearTimeout(swapWatchdog.current);
    swapWatchdog.current = setTimeout(applyLatest, 400);
  }, [text]);   // eslint-disable-line react-hooks/exhaustive-deps
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

  const pct = Math.round((doneCount / SEGMENTS) * 100);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.bar}
        activeOpacity={0.85}
        onPress={handlePress}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCard((c) => (c.w === width && c.h === height ? c : { w: width, h: height }));
        }}
        accessibilityRole="button"
        accessibilityLabel={`${shown.text}. ${pct}%.`}
      >
        {/* Silk backdrop — SVG at the MEASURED card size, NOT
            expo-linear-gradient and NOT an absolute-filled Svg: the former
            leaked past the card and washed the whole screen (Android HWUI
            clip bug), the latter froze at the first layout and left the
            card's bottom strip unpainted. A light base + six overlapping
            radial pools = boundary-less multi-point blend. */}
        {card.w > 0 && (
          <Svg width={card.w} height={card.h} style={styles.cardBg} pointerEvents="none">
            <Defs>
              {SILK_POOLS.map((p, i) => (
                <RadialGradient
                  key={i}
                  id={`rhythmSilk${i}`}
                  gradientUnits="userSpaceOnUse"
                  cx={p.cx * card.w}
                  cy={p.cy * card.h}
                  r={p.r * card.w}
                >
                  <Stop offset="0" stopColor={p.color} stopOpacity={0.9} />
                  <Stop offset="1" stopColor={p.color} stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            <Rect x="0" y="0" width={card.w} height={card.h} fill={SILK_BASE} />
            {SILK_POOLS.map((_, i) => (
              <Rect key={i} x="0" y="0" width={card.w} height={card.h} fill={`url(#rhythmSilk${i})`} />
            ))}
          </Svg>
        )}

        {/* TOP zone — auto-height with the text (1–2 lines). Split left/right:
            title takes the left, the right 25% is reserved for the Start pill
            (a plain View, decorative — the whole card is the touch target;
            hidden in rest states, letting the title span the full width). */}
        <View style={styles.topZone}>
          <Animated.View style={[styles.msg, msgStyle]}>
            {/* Two lines allowed (longer de/fr strings wrap and the card grows
                with them); adjustsFontSizeToFit still guards the extremes. */}
            <Text
              style={styles.title}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {shown.text}
            </Text>
          </Animated.View>
          {onPress != null && (
            <View style={styles.rightZone}>
              <View style={styles.startBtn}>
                {/* ALWAYS one line, any locale: long labels (es "Empezar",
                    pt "Começar") auto-shrink to fit rather than wrapping. */}
                <Text
                  style={styles.startBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {t('rhythm.start')}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* BOTTOM zone — the full-width 5-segment progress bar + live %; its
            height is just the row's natural content height. Inside the
            touchable (never intercepts the tap) and hidden from the a11y
            tree (the card label already reads the %). Segment k =
            RHYTHM_STEPS[k]; filled ⇔ done/retired, so completing ANY flow
            always advances exactly its own segment. The sparkle is a SIBLING
            of the track — inside it, overflow:hidden would clip its rise. */}
        <View style={styles.trackRow} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <View style={styles.trackWrap}>
            <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
              {RHYTHM_STEPS.map((id, k) => (
                <SegmentFill
                  key={id}
                  filled={isRhythmStepDone(dots[k])}
                  animateAt={celebrates[k]}
                  x={k * segW}
                  segW={segW}
                  color={dots[k] === 'retired' ? RETIRED_LAV : ROSE}
                  reduceMotion={reduceMotion}
                />
              ))}
              {/* Four structural ticks (20/40/60/80%) — same white midline
                  the old bar drew at 50%, generalized to the 5 segments.
                  Rendered last so they stay visible over the fills. */}
              {[1, 2, 3, 4].map(n => (
                <View key={n} style={[styles.tick, { left: `${(n * 100) / SEGMENTS}%` }]} />
              ))}
            </View>
            <Animated.View style={[styles.spark, sparkStyle]}>
              <Sparkle size={23} />
            </Animated.View>
          </View>
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
  // PrayerScreen). The card is a soft theme gradient (see the LinearGradient
  // in JSX) with NO border and NO shadow/elevation — Android's elevation
  // ambient shadow read as a "grey outline" around the old white card (user
  // report), so the card is deliberately flat.
  wrap: { marginTop: -1, marginBottom: 2 },   // below-greeting -1, below-card 2 (per user)
  bar: {
    borderRadius: 20,
    minHeight: 68,                       // 59 → 68 (+15 % per user)
    paddingTop: 15,                      // 12 → 15 (per user)
    paddingBottom: 0,                    // flush — the bar sits on the card's bottom edge (per user)
    paddingHorizontal: 14,
    justifyContent: 'space-between',     // top zone up, progress row pinned down
    overflow: 'hidden',                  // rounds the gradient's corners
  },
  cardBg: { position: 'absolute', top: 0, left: 0 },
  // TOP zone: auto-height (1–2 title lines), split into title | Start (25%).
  topZone: { flexDirection: 'row', alignItems: 'center' },
  // The right 25% belongs entirely to the Start pill, centered on the text.
  rightZone: { width: '25%', justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 4 },
  msg: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 17.5, lineHeight: 22.8, fontWeight: '400', color: TXT, fontFamily: FONTS.lato, marginLeft: 3 },   // 17.5, Lato regular 400, +3px left inset (per user)
  // Decorative Start pill (whole card is tappable) — rose, canonical CTA
  // radius, bold label like every other rose button.
  startBtn: {
    backgroundColor: ROSE,
    borderRadius: BTN_RADIUS,
    paddingHorizontal: 20,
    paddingVertical: 7.5,
    maxWidth: '100%',                    // never spills out of the 25% zone
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', fontFamily: FONTS.latoBold, letterSpacing: 0.2 },   // 16 (per user)
  // Track / fill / tick — carried over VERBATIM from PrayerScreen's removed
  // "Today's Progress" bar (height 6, radius 7, 10% ink track, rose fill,
  // white 1.5px ticks inset 0.9). Only the tick count changed (1 → 4).
  // Segment fills use radius 0 — the track's overflow:hidden rounds the outer
  // ends, and interior edges must sit flush against the ticks (a per-segment
  // radius would notch dark slivers beside every tick).
  trackRow: { flexDirection: 'row', alignItems: 'center', marginTop: 0 },   // no gap above the bar (per user); % readout removed — bar spans the full width
  trackWrap: { flex: 1, position: 'relative' },
  track: {
    height: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.10)',
    overflow: 'hidden',
    position: 'relative',
  },
  segFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,                                      // 2.5 → 4, full-height (per user)
    backgroundColor: 'rgba(255,255,255,1)',
    borderRadius: 2,
  },
  spark: { position: 'absolute', top: -14, left: '50%', marginLeft: -11.5 },   // centers the 23px sparkle
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
    borderRadius: 20,
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
