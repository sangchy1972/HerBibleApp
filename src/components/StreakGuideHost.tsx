import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, BackHandler, AppState,
  useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withDelay, withRepeat,
  cancelAnimation, runOnJS, Easing,
} from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, FONTS, P, BTN_RADIUS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useFirstRunTour, measureRefInWindow, type Rect } from '../state/FirstRunTourContext';
import { useStreakGuide } from '../state/StreakGuideContext';
import { usePrayer } from '../state/PrayerContext';
import { streakScenario } from '../state/streakGuide';
import InlineBold from './shared/InlineBold';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ── The rookie streak guide's overlay ────────────────────────────────────────
// Same visual system as FirstRunTourHost — ink scrim, one rounded evenodd hole,
// a coach bubble with a caret — but each step is a SINGLE spotlight on its own
// screen (home's flame pill, then the streak screen's milestone card), so there
// is no hole-travel choreography: the overlay re-mounts per step and plays a
// fresh close-in. All the hard-won safety rules from the tour apply verbatim:
// no <Modal>, shared values not `entering=`, coordinates normalized against the
// overlay's own root, bubble handed back to plain RN once settled, watchdog.

const SCRIM_IN_MS = 600;
const CLOSE_MS = 750;
const TIP_IN_MS = 650;
const TIP_IN_DELAY_MS = 380;
const EXIT_MS = 600;
const HALO_MS = 1400;
const START_INFLATE = 220;
const START_RADIUS = 48;
const CARET = 9;
const TIP_GAP = 10;
const TIP_MAX_W = 300;
const SCRIM_ALPHA = 0.72;
const TEXT_SCALE = 1.08;
const ts = (px: number) => Math.round(px * TEXT_SCALE * 10) / 10;

const CLOSE_EASE = Easing.bezier(0.33, 0, 0.15, 1);
const SOFT_IN = Easing.out(Easing.cubic);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inflate = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });

// Per-step spotlight framing: the flame pill is a 34px chip, the milestone
// card is a full-width r=20 card.
const STEP_SHAPE = {
  step1: { pad: 6, radius: 23 },
  step2: { pad: 8, radius: 28 },
} as const;

export default function StreakGuideHost() {
  const guide = useStreakGuide();
  if (guide.stage === 'idle') return null;
  return <StepOverlay key={guide.stage} />;
}

// Remounted per stage (key above) → every shared value starts fresh and the
// close-in replays on the new screen. No cross-step state to reset.
function StepOverlay() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const guide = useStreakGuide();
  const tour = useFirstRunTour();
  const { mDone, eDone } = usePrayer();

  const step: 'step1' | 'step2' = guide.stage === 'step2' ? 'step2' : 'step1';
  // Each step only renders over its own screen; while navigating between them
  // this returns null and the ~350ms gap is just the screen transition.
  const focusedOnOwnScreen = step === 'step1' ? guide.homeFocused : guide.streakFocused;

  // The scenario decides both bodies and the final CTA. Evaluated LIVE at
  // render — if the clock crosses 18:00 between steps, the button upgrades
  // itself from "come back tonight" to "start night prayer".
  const scenario = streakScenario(mDone, eDone, new Date().getHours());

  // ── Geometry ──────────────────────────────────────────────────────────────
  const rootRef = useRef<View>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  const [measureEpoch, setMeasureEpoch] = useState(0);

  useEffect(() => {
    if (!focusedOnOwnScreen) return;
    let live = true;
    (async () => {
      const [origin, raw] = await Promise.all([
        measureRefInWindow(rootRef),
        step === 'step1' ? tour.measureAnchor('streak') : guide.measureMilestone(),
      ]);
      if (!live) return;
      if (!raw || raw.w <= 0 || raw.h <= 0) return;      // retry effect below
      const o = origin ?? { x: 0, y: 0, w: 0, h: 0 };
      setTarget(inflate({ x: raw.x - o.x, y: raw.y - o.y, w: raw.w, h: raw.h }, STEP_SHAPE[step].pad));
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedOnOwnScreen, step, measureEpoch, tour.measureAnchor, guide.measureMilestone]);

  // The anchor can be a beat late (screen still mounting, entrance animations
  // settling). Retry a few times, then bail out rather than stranding a scrim
  // with no hole — the guide is a nicety, never a trap.
  const retries = useRef(0);
  useEffect(() => {
    if (target || !focusedOnOwnScreen) return;
    if (retries.current >= 8) { guide.dismiss('anchor_unmeasurable'); return; }
    const tm = setTimeout(() => { retries.current += 1; setMeasureEpoch(e => e + 1); }, 350);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, focusedOnOwnScreen, measureEpoch, guide.dismiss]);

  // ── Choreography ──────────────────────────────────────────────────────────
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);
  const sr = useSharedValue(START_RADIUS);
  const scrim = useSharedValue(0);
  const halo = useSharedValue(0);
  const tipOpacity = useSharedValue(0);
  const tipY = useSharedValue(0);
  const [tipH, setTipH] = useState(0);
  const [tipSettled, setTipSettled] = useState(false);

  const put = useCallback((r: Rect, radius: number) => {
    sx.value = r.x; sy.value = r.y; sw.value = r.w; sh.value = r.h; sr.value = radius;
  }, [sx, sy, sw, sh, sr]);

  const playedRef = useRef(false);
  useEffect(() => {
    if (!target || tipH === 0 || playedRef.current) return;
    playedRef.current = true;
    const radius = STEP_SHAPE[step].radius;
    put(inflate(target, START_INFLATE), START_RADIUS);
    scrim.value = withTiming(1, { duration: SCRIM_IN_MS, easing: Easing.out(Easing.quad) });
    const opts = { duration: CLOSE_MS, easing: CLOSE_EASE };
    sx.value = withTiming(target.x, opts);
    sy.value = withTiming(target.y, opts);
    sw.value = withTiming(target.w, opts);
    sh.value = withTiming(target.h, opts);
    sr.value = withTiming(radius, opts);
    tipOpacity.value = withDelay(TIP_IN_DELAY_MS, withTiming(1, { duration: TIP_IN_MS, easing: SOFT_IN }));
    tipY.value = 14;
    tipY.value = withDelay(TIP_IN_DELAY_MS, withTiming(0, { duration: TIP_IN_MS, easing: SOFT_IN }, (fin) => {
      if (fin) runOnJS(setTipSettled)(true);
    }));
    halo.value = withDelay(CLOSE_MS + 300, withRepeat(
      withTiming(0.35, { duration: HALO_MS, easing: Easing.inOut(Easing.quad) }), -1, true,
    ));
    // Watchdog: a dropped runOnJS must not leave the buttons Reanimated-owned.
    const wd = setTimeout(() => setTipSettled(true), TIP_IN_DELAY_MS + TIP_IN_MS + 400);
    return () => clearTimeout(wd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, tipH, step]);

  // ── Leaving ───────────────────────────────────────────────────────────────
  const leaving = useRef(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const leave = useCallback((after: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    setIsLeaving(true);
    // Exactly-once: the scrim callback AND the fallback timer both funnel here,
    // and under load the callback can be dropped — the action must not be, but
    // it must not run twice either.
    let fired = false;
    const fire = () => { if (fired) return; fired = true; try { after(); } catch {} };
    cancelAnimation(halo);
    halo.value = withTiming(0, { duration: 150 });
    tipOpacity.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.quad) });
    scrim.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(fire)();
    });
    setTimeout(fire, EXIT_MS + 250);
  }, [halo, tipOpacity, scrim]);

  const onSkip = useCallback(() => leave(() => guide.dismiss('skip')), [leave, guide]);
  const onPrimary = useCallback(() => {
    if (step === 'step1') {
      leave(() => guide.advanceToStreak());
      return;
    }
    if (scenario === 'startNight' || scenario === 'startMorning') {
      const kind = scenario === 'startNight' ? 'evening' : 'morning';
      leave(() => {
        guide.dismiss(`start_${kind}`);
        // Mirrors the first-run tour's hand-off: fire the flow as the scrim
        // tail is still fading so the tap feels instant.
        setTimeout(() => guide.startPrayer(kind), 120);
      });
    } else {
      leave(() => guide.dismiss(scenario === 'nightLater' ? 'come_back_tonight' : 'done'));
    }
  }, [step, scenario, leave, guide]);

  // Android hardware back = skip.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onSkip(); return true; });
    return () => sub.remove();
  }, [onSkip]);

  // Backgrounding mid-flight: freeze, snap on return, re-measure.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (leaving.current) return;
      if (s !== 'active') {
        cancelAnimation(sx); cancelAnimation(sy); cancelAnimation(sw);
        cancelAnimation(sh); cancelAnimation(sr); cancelAnimation(halo);
      } else if (target) {
        put(target, STEP_SHAPE[step].radius);
        scrim.value = 1;
        setMeasureEpoch(e => e + 1);
      }
    });
    return () => sub.remove();
  }, [target, step, put, scrim, sx, sy, sw, sh, sr, halo]);

  // Last-resort watchdog — bypasses `leaving` on purpose (see the tour host).
  useEffect(() => {
    const cap = setTimeout(() => { leaving.current = false; guide.dismiss('watchdog'); }, 30000);
    return () => clearTimeout(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide.dismiss]);

  // ── Copy ──────────────────────────────────────────────────────────────────
  const bodyKey = step === 'step1'
    ? (mDone ? 'streakGuide.step1.night' : 'streakGuide.step1.morning')
    : 'streakGuide.step2.body';
  const titleKey = step === 'step1' ? 'streakGuide.step1.title' : 'streakGuide.step2.title';
  const primaryLabel = step === 'step1'
    ? t('streakGuide.continue')
    : scenario === 'startNight' ? t('prayer.startNight')
    : scenario === 'startMorning' ? t('prayer.startMorning')
    : scenario === 'nightLater' ? t('streakGuide.btn.tonight')
    : t('streakGuide.btn.done');

  // ── Layout ────────────────────────────────────────────────────────────────
  const tabBarish = insets.bottom + 64;
  const spaceBelow = target ? H - tabBarish - (target.y + target.h) - CARET - TIP_GAP : 0;
  const below = !!target && tipH > 0 && tipH + 12 <= spaceBelow;
  const tipW = Math.min(TIP_MAX_W, W - 2 * P);
  const centerX = target ? target.x + target.w / 2 : W / 2;
  const tipLeft = clamp(centerX - tipW / 2, P, Math.max(P, W - P - tipW));
  const tipTop = target
    ? (below ? target.y + target.h + CARET + TIP_GAP : target.y - CARET - TIP_GAP - tipH)
    : 0;
  const caretLeft = clamp(centerX - tipLeft - CARET, 16, Math.max(16, tipW - 16 - 2 * CARET));

  const pathProps = useAnimatedProps(() => {
    const x = sx.value, y = sy.value, w = sw.value, h = sh.value;
    const r = Math.min(sr.value, w / 2, h / 2);
    const outer = `M0 0 H${W} V${H} H0 Z`;
    const inner =
      `M${x + r} ${y}` +
      ` H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
      ` V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
      ` H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
      ` V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
    return {
      d: `${outer} ${inner}`,
      fillOpacity: scrim.value * SCRIM_ALPHA,
      strokeOpacity: halo.value * scrim.value,
    };
  });

  const tipStyle = useAnimatedStyle(() => ({
    opacity: tipOpacity.value,
    transform: [{ translateY: tipY.value }],
  }));
  const SETTLED = { opacity: 1 } as const;

  if (!focusedOnOwnScreen || !target) return null;

  return (
    <View style={styles.root} ref={rootRef} collapsable={false} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFillObject} pointerEvents={isLeaving ? 'none' : 'auto'} />
      <Svg width={W} height={H} style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <AnimatedPath animatedProps={pathProps} fill={TXT} fillRule="evenodd" stroke={ROSE} strokeWidth={2} />
      </Svg>

      <Animated.View
        style={[
          styles.tipWrap,
          { left: tipLeft, top: tipTop, width: tipW, opacity: tipH === 0 ? 0 : undefined },
          tipSettled ? SETTLED : tipStyle,
        ]}
        onLayout={(e: LayoutChangeEvent) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== tipH) setTipH(h);
        }}
      >
        {!below && <View style={[styles.caretDown, { left: caretLeft }]} />}
        {below && <View style={[styles.caretUp, { left: caretLeft }]} />}
        <View style={styles.card}>
          <Text style={styles.counter}>{t('tour.progress', { n: step === 'step1' ? 1 : 2, total: 2 })}</Text>
          <Text style={styles.title}>{t(titleKey)}</Text>
          <InlineBold text={t(bodyKey)} style={styles.body} boldStyle={styles.bodyBold} />
          <View style={styles.row}>
            <TouchableOpacity onPress={onSkip} hitSlop={12} activeOpacity={0.7}>
              <Text style={styles.skip}>{t('tour.skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onPrimary} hitSlop={10} activeOpacity={0.9} style={styles.cta}>
              <Text style={styles.ctaText}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same layer band as FirstRunTourHost (the two can never be up together —
  // the coordinator's tour gate suppresses this guide while the tour is owed).
  root: { ...StyleSheet.absoluteFillObject, zIndex: 90, elevation: 90 },
  tipWrap: { position: 'absolute' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 18, elevation: 8,
  },
  caretDown: {
    position: 'absolute', bottom: -CARET + 0.5, width: 0, height: 0,
    borderLeftWidth: CARET, borderRightWidth: CARET, borderTopWidth: CARET,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF',
    zIndex: 1,
  },
  caretUp: {
    position: 'absolute', top: -CARET + 0.5, width: 0, height: 0,
    borderLeftWidth: CARET, borderRightWidth: CARET, borderBottomWidth: CARET,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF',
    zIndex: 1,
  },
  counter: { fontFamily: FONTS.lato, fontSize: ts(12), color: TXTSUB, letterSpacing: 0.6, marginBottom: 6 },
  // Lora bold pairs with '600' — '700' drops to system sans on Android.
  title: { fontFamily: FONTS.loraBold, fontSize: ts(18), fontWeight: '600', color: TXT, marginBottom: 6 },
  body: { fontFamily: FONTS.lato, letterSpacing: 0.4, fontSize: ts(14.5), lineHeight: ts(21), color: TXTSUB },
  bodyBold: { fontFamily: FONTS.latoBold, fontWeight: '700', color: TXT },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  skip: { fontFamily: FONTS.lato, letterSpacing: 0.4, fontSize: ts(14), color: TXTSUB },
  cta: { backgroundColor: ROSE, borderRadius: BTN_RADIUS, paddingHorizontal: 20, paddingVertical: 9 },
  ctaText: { fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: ts(15), color: '#FFFFFF', letterSpacing: 0.2 },
});
