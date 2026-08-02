import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, AccessibilityInfo } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence,
  cancelAnimation, Easing, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useIsFocused } from '@react-navigation/native';
import { ROSE, BTN_RADIUS, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { RHYTHM_STEPS, isRhythmStepDone, packedRhythmFill, type RhythmDotState } from '../../state/dailyRhythm';

// Permanent Daily Rhythm bar (presentational). PrayerScreen computes the
// rhythm view (state machine in src/state/dailyRhythm.ts) and hands us the
// resolved text/action; this component owns only the visuals:
//   • a soft pink→white→lavender gradient card (borderless, per user) with
//     the suggestion text and — on actionable steps — a small rose "Start"
//     pill on the right (decorative: the WHOLE card is the touch target),
//   • a 5-SEGMENT progress bar hugging the card's inner bottom — one segment
//     per completed step (20% each), packed left,
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

// Completion choreography timeline (all from the moment focus lands back):
//   0 ──300──▶ segment sweep (1200ms, doubled per user) ──▶ 1500:
//   bubble pop on the whole card (400ms) + old text dissolves like sand
//   (380ms) ──▶ new task text assembles in (420ms).
const SWEEP_DELAY = 300;
const SWEEP_MS = 1200;                       // 600 → 1200 (half speed per user)
const SWEEP_END = SWEEP_DELAY + SWEEP_MS;    // 1500
const SAND_OUT_MS = 380;
const SAND_IN_MS = 420;

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
      // The sweep fires on focus regain (completion happened inside a flow).
      // Hold SWEEP_DELAY so it starts AFTER the navigation transition lands —
      // the user actually SEES it — then sweep over SWEEP_MS.
      w.value = 0;
      w.value = withDelay(SWEEP_DELAY, withTiming(segW, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) }));
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
  todayYmd, dots, doneCount, allDone, text, hintText, celebrate, onPress,
}: {
  todayYmd: string;
  dots: RhythmDotState[];              // length 5, canonical order
  doneCount: number;
  allDone: boolean;
  text: string;
  hintText: string | null;             // rest states: tap pops this instead of navigating
  celebrate?: { title: string; body: string; cta: string } | null;   // waiting-for-evening: tap opens a congrats dialog instead of the toast
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
  // Declared here, not beside the ceremony code below: the completion effect
  // pushes into it, and a reader tracing that effect shouldn't have to scroll
  // 60 lines to find out what it is.
  const ceremonyTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => { if (waveTimer.current) clearTimeout(waveTimer.current); }, []);
  // Armed by the completion effect for the text effect running in the SAME
  // commit — routes that text change through the ceremony instead of the
  // plain crossfade.
  const ceremonyArm = useRef(false);
  useEffect(() => {
    if (!isFocused) return;                       // reconcile only while visible
    const prev = snap.current;
    snap.current = { ymd: todayYmd, dots: [...dots] };
    const wasComplete = wasAllDone.current;
    wasAllDone.current = allDone;
    if (!prev || prev.ymd !== todayYmd) return;   // first render / day rolled → snap silently
    // Segments are POSITIONAL now, so the sweep belongs to the position that
    // just became filled — index prevDone → nowDone-1 — not to the step's own
    // slot. A range (not a single index) because two steps can land in one
    // commit, e.g. a gospel pair graduating together.
    const prevDone = prev.dots.filter(d => isRhythmStepDone(d)).length;
    const nowDone = dots.filter(d => isRhythmStepDone(d)).length;
    if (nowDone > prevDone) {
      setCelebrates(c => c.map((v, p) => (p >= prevDone && p < nowDone ? v + 1 : v)));
      // A completion just landed — if the suggestion text changes in this same
      // commit, the text effect below runs the full ceremony (wait for sweep →
      // bubble → sand swap) instead of the plain crossfade. Cleared next tick
      // so an unrelated later text change can't inherit it.
      ceremonyArm.current = true;
      // Tracked like every other timer here — an untracked one survives unmount.
      ceremonyTimers.current.push(setTimeout(() => { ceremonyArm.current = false; }, 50));
      // Whole-day sparkle chains once the segment sweep lands.
      if (allDone && !wasComplete) {
        if (waveTimer.current) clearTimeout(waveTimer.current);
        waveTimer.current = setTimeout(() => setWaveAt(w => w + 1), SWEEP_END + 300);
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

  // ── Completion ceremony: sweep lands → bubble pop + sand text swap ────────
  // Every animated value is a pure transform/opacity driven on the UI thread —
  // no layout thrash, low-end-device friendly. Each phase transition has a
  // runOnJS completion AND a timer watchdog (dropped runOnJS = stuck card).
  const cardScale = useSharedValue(1);
  const sand = useSharedValue(0);                        // master progress of the active sand phase
  const [sandPhase, setSandPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const sandPhaseRef = useRef<'idle' | 'out' | 'in'>('idle');
  useEffect(() => () => { ceremonyTimers.current.forEach(clearTimeout); }, []);
  const setPhase = (p: 'idle' | 'out' | 'in') => { sandPhaseRef.current = p; setSandPhase(p); };

  const endCeremony = () => {
    if (sandPhaseRef.current !== 'in') return;           // watchdog + callback are both routed here
    setPhase('idle');
    msgOpacity.value = 1; msgY.value = 0;
  };
  const beginSandIn = () => {
    if (sandPhaseRef.current !== 'out') return;
    setShown({ ...latest.current });                     // newest suggestion wins
    setPhase('in');
    sand.value = 0;
    sand.value = withTiming(1, { duration: SAND_IN_MS, easing: Easing.out(Easing.quad) }, (fin) => {
      if (fin) runOnJS(endCeremony)();
    });
    ceremonyTimers.current.push(setTimeout(endCeremony, SAND_IN_MS + 250));
  };
  const startCeremony = () => {
    ceremonyTimers.current.push(setTimeout(() => {
      // Bubble pop: a damped grow-shrink oscillation, each swing softer than
      // the last — reads as a bubble "boing". ~400ms total.
      cancelAnimation(cardScale);
      cardScale.value = withSequence(
        withTiming(1.045, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(0.985, { duration: 110, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.012, { duration: 90,  easing: Easing.inOut(Easing.quad) }),
        withTiming(1,     { duration: 70,  easing: Easing.out(Easing.quad) }),
      );
      // Old text crumbles into sand while the card pops.
      setPhase('out');
      sand.value = 0;
      sand.value = withTiming(1, { duration: SAND_OUT_MS, easing: Easing.in(Easing.quad) }, (fin) => {
        if (fin) runOnJS(beginSandIn)();
      });
      ceremonyTimers.current.push(setTimeout(beginSandIn, SAND_OUT_MS + 250));
    }, SWEEP_END));
  };
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  useEffect(() => {
    latest.current = { text };
    if (shown.text === text) return;
    if (reduceMotion) { setShown({ text }); return; }
    if (ceremonyArm.current) {
      // A step just completed AND the suggestion changed → full ceremony,
      // timed off the segment sweep. The old text stays on screen until then.
      ceremonyArm.current = false;
      startCeremony();
      return;
    }
    if (sandPhaseRef.current !== 'idle') return;         // mid-ceremony: latest.current will be picked up at swap
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
    // `shown` just swapped → slide the new line in from below. During a
    // ceremony the swap comes from beginSandIn and the grains own the motion —
    // the container must hold still.
    if (reduceMotion || sandPhaseRef.current !== 'idle') { msgOpacity.value = 1; msgY.value = 0; return; }
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

  // ── Waiting-for-evening celebration dialog (replaces the toast, per user) ──
  // Shared-value pop-in (never layout `entering` — project memory).
  const [celebOpen, setCelebOpen] = useState(false);
  const celebScale = useSharedValue(0.85);
  useEffect(() => {
    if (!celebOpen) return;
    celebScale.value = 0.85;
    celebScale.value = withSequence(
      withTiming(1.02, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
    );
  }, [celebOpen, celebScale]);
  const celebStyle = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));

  const handlePress = () => {
    if (onPress) { onPress(); return; }
    if (celebrate) { setCelebOpen(true); return; }
    if (!hintText) return;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(hintText);
    hintTimer.current = setTimeout(() => setHint(null), 3200);
  };

  const pct = Math.round((doneCount / SEGMENTS) * 100);
  // Filled segments, packed left — see packedRhythmFill. Position p is filled
  // iff p < packed.length; packed[p] carries that step's kind so a retired
  // (graduated) step still paints lavender after the repack.
  const packed = useMemo(() => packedRhythmFill(dots), [dots]);

  return (
    <View style={styles.wrap}>
      {/* Bubble-pop wrapper — pure transform, never re-layouts the card. The
          animated style is attached ONLY while the ceremony runs: a permanently
          Reanimated-owned wrapper freezes its subtree's native hit regions
          (Android/Fabric), which is what made the bar's taps unreliable when
          content above it reflowed. */}
      <Animated.View style={sandPhase !== 'idle' ? bubbleStyle : undefined}>
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
                with them); adjustsFontSizeToFit still guards the extremes.
                During the ceremony the line renders as per-character sand
                grains instead (same metrics, so the layout barely shifts). */}
            {sandPhase === 'idle' ? (
              <Text
                style={styles.title}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {shown.text}
              </Text>
            ) : (
              <SandTitle text={shown.text} mode={sandPhase} progress={sand} />
            )}
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

        {/* BOTTOM zone — the full-width 5-segment progress bar; its
            height is just the row's natural content height. Inside the
            touchable (never intercepts the tap) and hidden from the a11y
            tree (the card label already reads the %). Segments are POSITIONAL,
            not per-step: n completed steps fill the first n segments in any
            completion order (see packedRhythmFill). The sparkle is a SIBLING
            of the track — inside it, overflow:hidden would clip its rise. */}
        <View style={styles.trackRow} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <View style={styles.trackWrap}>
            <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
              {Array.from({ length: SEGMENTS }, (_, p) => (
                <SegmentFill
                  key={p}
                  filled={p < packed.length}
                  animateAt={celebrates[p]}
                  x={p * segW}
                  segW={segW}
                  color={packed[p] === 'retired' ? RETIRED_LAV : ROSE}
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
      </Animated.View>

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

      {/* "All done for now — see you at 6 pm" congrats dialog. Floating-shadow
          popup card (allowed for dialogs, unlike resident cards). */}
      {celebrate && (
        <Modal
          visible={celebOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setCelebOpen(false)}
        >
          <TouchableOpacity style={styles.celebOverlay} activeOpacity={1} onPress={() => setCelebOpen(false)}>
            <Animated.View style={[styles.celebCard, celebStyle]} onStartShouldSetResponder={() => true}>
              <View style={styles.celebIcon}>
                <Feather name="moon" size={22} color={ROSE} />
              </View>
              <Text style={styles.celebTitle}>{celebrate.title}</Text>
              <Text style={styles.celebBody}>{celebrate.body}</Text>
              <TouchableOpacity onPress={() => setCelebOpen(false)} activeOpacity={0.9} style={styles.celebBtn}>
                <Text style={styles.celebBtnText}>{celebrate.cta}</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

// ── Sand text ────────────────────────────────────────────────────────────────
// The suggestion line rendered as individual character "grains", all driven by
// ONE master shared value — each grain derives its own staggered window from
// deterministic per-index pseudo-randoms (no Math.random in this repo). Words
// stay unbreakable (a row View per word) so wrapping matches the real Text;
// CJK characters are their own tokens, which is also the correct wrap rule.
type SandGrain = { ch: string; delayFrac: number; dx: number; dy: number };
type SandToken = { space: boolean; grains: SandGrain[] };

// Deterministic 0..1 hash (same sin-hash family the codebase already uses).
const grainRnd = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;

function tokenizeSand(text: string): SandToken[] {
  const tokens: SandToken[] = [];
  let word: SandGrain[] = [];
  let index = 0;
  const flush = () => { if (word.length) { tokens.push({ space: false, grains: word }); word = []; } };
  for (const ch of text) {
    const i = index++;
    if (/\s/.test(ch)) { flush(); tokens.push({ space: true, grains: [] }); continue; }
    const grain: SandGrain = {
      ch,
      delayFrac: grainRnd(i * 7 + 1),                       // scatter order, not left→right
      dx: (grainRnd(i * 13 + 5) - 0.5) * 12,                // sideways drift −6..+6
      dy: -(4 + grainRnd(i * 29 + 11) * 7),                 // upward drift −4..−11
    };
    if (CJK_RE.test(ch)) { flush(); tokens.push({ space: false, grains: [grain] }); }
    else word.push(grain);
  }
  flush();
  return tokens;
}

function SandChar({ grain, mode, progress }: { grain: SandGrain; mode: 'out' | 'in'; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    // Each grain animates over a 55% window of the master timeline, offset by
    // its own delay fraction — the line crumbles/assembles grain by grain.
    const span = 0.55;
    const p = Math.min(1, Math.max(0, (progress.value - grain.delayFrac * (1 - span)) / span));
    if (mode === 'out') {
      return {
        opacity: 1 - p,
        transform: [{ translateX: grain.dx * p }, { translateY: grain.dy * p }, { scale: 1 - 0.3 * p }],
      };
    }
    return {
      opacity: p,
      transform: [
        { translateX: grain.dx * 0.5 * (1 - p) },
        { translateY: -grain.dy * 0.5 * (1 - p) },        // assembles rising INTO place
        { scale: 0.85 + 0.15 * p },
      ],
    };
  });
  return <Animated.Text style={[styles.sandChar, style]}>{grain.ch}</Animated.Text>;
}

function SandTitle({ text, mode, progress }: { text: string; mode: 'out' | 'in'; progress: SharedValue<number> }) {
  const tokens = useMemo(() => tokenizeSand(text), [text]);
  return (
    <View style={styles.sandWrap}>
      {tokens.map((tok, i) =>
        tok.space
          ? <View key={i} style={styles.sandSpace} />
          : (
            <View key={i} style={styles.sandWord}>
              {tok.grains.map((g, k) => <SandChar key={k} grain={g} mode={mode} progress={progress} />)}
            </View>
          ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same gutter as every section below (P=17 applied by the parent wrapper in
  // PrayerScreen). The card is a soft theme gradient (see the LinearGradient
  // in JSX) with NO border and NO shadow/elevation — Android's elevation
  // ambient shadow read as a "grey outline" around the old white card (user
  // report), so the card is deliberately flat.
  wrap: { marginTop: 4, marginBottom: 2 },   // below-greeting +5 (was -1), below-card 2 (per user)
  bar: {
    borderRadius: 20,
    minHeight: 68,                       // 59 → 68 (+15 % per user)
    paddingTop: 13,                      // 15 → 13 (per user)
    paddingBottom: 0,                    // flush — the bar sits on the card's bottom edge (per user)
    paddingHorizontal: 14,
    justifyContent: 'space-between',     // top zone up, progress row pinned down
    overflow: 'hidden',                  // rounds the gradient's corners
  },
  cardBg: { position: 'absolute', top: 0, left: 0 },
  // TOP zone: auto-height (1–2 title lines), split into title | Start (25%).
  // marginBottom 3 = +3px after the text block, before the progress bar (per user).
  topZone: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  // The right 25% belongs entirely to the Start pill, centered on the text.
  rightZone: { width: '25%', justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 4 },
  msg: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 16.1, lineHeight: 21, fontWeight: '400', color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.5, marginLeft: 3 },   // 17.5 → 16.1 (-8% per user), Lato regular 400, +3px left inset
  // Sand-mode counterparts — SAME metrics as `title` so the per-char layout
  // matches the native Text closely and the idle↔sand swap doesn't jump.
  sandWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', marginLeft: 3 },
  sandWord: { flexDirection: 'row' },
  sandSpace: { width: 4.4 },
  sandChar: { fontSize: 16.1, lineHeight: 21, fontWeight: '400', color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.5 },
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
    backgroundColor: 'rgba(255,255,255,0.9)',
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
  // Waiting-for-evening congrats dialog.
  celebOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,16,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  celebCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  celebIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FBE3EE',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  // Lora 600 (700 drops Lora on Android — project memory), rose like the badge
  // popup's CONGRATS.
  celebTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 22,
    color: ROSE, textAlign: 'center', marginBottom: 8, letterSpacing: 0.5,
  },
  celebBody: {
    fontFamily: FONTS.lato, letterSpacing: 0.4, fontSize: 15, lineHeight: 22,
    color: TXTSUB, textAlign: 'center', marginBottom: 20, paddingHorizontal: 4,
  },
  celebBtn: {
    alignSelf: 'stretch',
    backgroundColor: ROSE,
    borderRadius: BTN_RADIUS,
    paddingVertical: 13,
    alignItems: 'center',
  },
  celebBtnText: { fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.3 },
});
