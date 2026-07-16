import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, BackHandler, AppState,
  AccessibilityInfo, useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withDelay, withRepeat,
  cancelAnimation, runOnJS, Easing, type WithTimingConfig,
} from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, FONTS, P, BTN_RADIUS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useFirstRunTour, TOUR_STEPS, type Rect } from '../state/FirstRunTourContext';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ── The first-run home tour overlay ─────────────────────────────────────────
// A dark scrim with a single rounded hole punched through it. The hole TRAVELS
// and RESIZES from anchor to anchor — it never cuts — and a coach-mark bubble
// rides along underneath (or above) it.
//
// The hole is ONE <Path> with fillRule="evenodd": an outer full-screen rect plus
// an inner rounded rect as a second subpath, which evenodd renders as a hole.
// Four absolutely-positioned Views would have been the other option, but they
// cannot round the hole's corners (a square hole against our 20 px cards reads
// as broken) and four independently-animated bars desync at sub-pixel level
// while travelling, flashing 1 px seams at the corners on every frame. One fill
// cannot seam, and it reads as a single aperture moving — which is the point.
//
// NOT a <Modal>. An RN Modal is a native window that swallows every touch in the
// app while visible, no matter what pointerEvents its children set — a stuck one
// froze this app once already (see the note in PrayerScreen). A plain
// absolute-fill View plus a watchdog can never do that.

// Every landing motion is 600–800 ms, per user: nothing here should feel snappy.
const SCRIM_IN_MS = 700;
const CLOSE_MS = 800;          // the opening shrinking down onto the first anchor
const TRAVEL_MS = 780;         // anchor → anchor
const TRAVEL_DELAY_MS = 180;   // let the old bubble get out of the way first
const TIP_IN_MS = 700;
const TIP_IN_DELAY_MS = 420;   // overlaps the still-settling hole — sequential feels stiff
const TIP_OUT_MS = 320;        // the ONE sub-600 motion: nothing LANDS here, it only leaves
const TIP_REENTER_AT_MS = 700; // after a travel starts
const EXIT_MS = 700;
const EXIT_DELAY_MS = 120;
const HALO_MS = 1400;

// A long, lazy glide — this is what makes the scrim "settle" onto the target
// rather than snap to it.
const CLOSE_EASE = Easing.bezier(0.33, 0, 0.15, 1);
// Accelerates out of the old anchor, decelerates into the new one, so the hole
// reads as one physical object moving.
const TRAVEL_EASE = Easing.inOut(Easing.cubic);
const SOFT_IN = Easing.out(Easing.cubic);

const START_INFLATE = 220;     // the hole starts bigger than the screen and closes in
const EXIT_INFLATE = 80;
const START_RADIUS = 48;
const EXIT_RADIUS = 44;

const CARET = 9;
const TIP_GAP = 10;
const TIP_MAX_W = 300;
const SCRIM_COLOR = TXT;       // plum ink, not black — it's our ink colour
const SCRIM_ALPHA = 0.72;

// Per-anchor spotlight padding + corner radius (card radius + the padding).
const SHAPE: Record<string, { pad: number; radius: number }> = {
  rhythm: { pad: 8, radius: 26 },   // DailyRhythmBar card is r=20
  streak: { pad: 6, radius: 23 },   // streak chip is a 34px-tall pill
  verse:  { pad: 8, radius: 18 },   // hero card is r≈9.2 — keep it tight
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inflate = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });
const valid = (r: Rect | undefined, screenH: number): r is Rect =>
  !!r && r.w > 0 && r.h > 0 && r.y > -r.h && r.y < screenH;

export default function FirstRunTourHost() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const tour = useFirstRunTour();
  const { active, step, anchors, startPrayer } = tour;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // Geometry of the hole.
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);
  const sr = useSharedValue(START_RADIUS);
  const scrim = useSharedValue(0);
  const halo = useSharedValue(0);
  // Coach-mark bubble.
  const tipOpacity = useSharedValue(0);
  const tipY = useSharedValue(0);
  const tipScale = useSharedValue(0.96);

  // The bubble's own height decides whether it sits above or below its anchor,
  // so we must MEASURE it — a guess breaks the moment German or French wraps to
  // three lines. It renders invisible until we know.
  const [tipH, setTipH] = useState(0);
  // Android/Fabric: while a view carries a Reanimated animated style, Reanimated
  // owns it and its subtree's native touch regions can go stale (this codebase
  // has been bitten — see useTabFocusEntrance). Skip/Next live inside the
  // bubble, so once the entrance lands we hand the bubble back to plain RN.
  const [tipSettled, setTipSettled] = useState(false);

  const stepId = TOUR_STEPS[step];
  const rect = anchors[stepId];
  const isLast = step === TOUR_STEPS.length - 1;

  // Padded target rect for the current step.
  const target = useMemo<Rect | null>(() => {
    if (!valid(rect, H)) return null;
    const s = SHAPE[stepId] ?? { pad: 8, radius: 20 };
    return inflate(rect, s.pad);
  }, [rect, stepId, H]);
  const targetRadius = (SHAPE[stepId] ?? { radius: 20 }).radius;

  const put = useCallback((r: Rect, radius: number) => {
    sx.value = r.x; sy.value = r.y; sw.value = r.w; sh.value = r.h; sr.value = radius;
  }, [sx, sy, sw, sh, sr]);

  type Ease = NonNullable<WithTimingConfig['easing']>;
  const move = useCallback((r: Rect, radius: number, dur: number, easing: Ease, delay = 0) => {
    const opts = { duration: dur, easing };
    sx.value = withDelay(delay, withTiming(r.x, opts));
    sy.value = withDelay(delay, withTiming(r.y, opts));
    sw.value = withDelay(delay, withTiming(r.w, opts));
    sh.value = withDelay(delay, withTiming(r.h, opts));
    sr.value = withDelay(delay, withTiming(radius, opts));
  }, [sx, sy, sw, sh, sr]);

  const pulseHalo = useCallback((delay: number) => {
    cancelAnimation(halo);
    halo.value = 0;
    if (reduceMotion) return;
    halo.value = withDelay(delay, withRepeat(
      withTiming(0.35, { duration: HALO_MS, easing: Easing.inOut(Easing.quad) }), -1, true,
    ));
  }, [halo, reduceMotion]);

  const enterTip = useCallback((below: boolean, delay: number) => {
    setTipSettled(false);
    tipOpacity.value = 0;
    tipY.value = below ? 14 : -14;
    tipScale.value = 0.96;
    if (reduceMotion) {
      tipOpacity.value = withDelay(delay, withTiming(1, { duration: 150 }));
      tipY.value = 0; tipScale.value = 1;
      setTipSettled(true);
      return;
    }
    tipOpacity.value = withDelay(delay, withTiming(1, { duration: 600, easing: SOFT_IN }));
    tipScale.value = withDelay(delay, withTiming(1, { duration: TIP_IN_MS, easing: SOFT_IN }));
    tipY.value = withDelay(delay, withTiming(0, { duration: TIP_IN_MS, easing: SOFT_IN }, (fin) => {
      if (fin) runOnJS(setTipSettled)(true);
    }));
  }, [tipOpacity, tipY, tipScale, reduceMotion]);

  const exitTip = useCallback((below: boolean, dist: number, dur: number) => {
    setTipSettled(false);
    const opts = { duration: dur, easing: Easing.in(Easing.quad) };
    tipOpacity.value = withTiming(0, opts);
    tipY.value = withTiming(below ? -dist : dist, opts);
  }, [tipOpacity, tipY]);

  // ── Placement: below the anchor when there's room under it, else above ─────
  const tabBarish = insets.bottom + 64;
  const spaceBelow = target ? H - tabBarish - (target.y + target.h) - CARET - TIP_GAP : 0;
  const below = !!target && tipH > 0 && tipH + 12 <= spaceBelow;
  const tipW = Math.min(TIP_MAX_W, W - 2 * P);
  const centerX = target ? target.x + target.w / 2 : W / 2;
  const tipLeft = clamp(centerX - tipW / 2, P, Math.max(P, W - P - tipW));
  const tipTop = target
    ? (below ? target.y + target.h + CARET + TIP_GAP : target.y - CARET - TIP_GAP - tipH)
    : 0;
  // Keep the caret inside the bubble's 20px corner radius while still aiming at
  // the hole. For the streak chip (hard right) it slides to its right-hand limit.
  const caretLeft = clamp(centerX - tipLeft - CARET, 16, Math.max(16, tipW - 16 - 2 * CARET));

  useEffect(() => { setTipH(0); }, [step]);

  // ── Choreography ──────────────────────────────────────────────────────────
  const shownStepRef = useRef(-1);
  const belowRef = useRef(true);
  belowRef.current = below;

  // Step 0 → open. Later steps → travel.
  useEffect(() => {
    if (!active || !target || tipH === 0) return;
    if (shownStepRef.current === step) return;
    const first = shownStepRef.current < 0;
    shownStepRef.current = step;

    if (reduceMotion) {
      put(target, targetRadius);
      scrim.value = withTiming(1, { duration: 150 });
      enterTip(below, 0);
      return;
    }

    if (first) {
      // The scrim fades up while the opening closes in around the bar.
      put(inflate(target, START_INFLATE), START_RADIUS);
      scrim.value = withTiming(1, { duration: SCRIM_IN_MS, easing: Easing.out(Easing.quad) });
      move(target, targetRadius, CLOSE_MS, CLOSE_EASE);
      enterTip(below, TIP_IN_DELAY_MS);
      pulseHalo(CLOSE_MS + 320);
    } else {
      // Old bubble leaves, the aperture glides across, the new bubble arrives.
      cancelAnimation(halo);
      halo.value = withTiming(0, { duration: 200 });
      move(target, targetRadius, TRAVEL_MS, TRAVEL_EASE, TRAVEL_DELAY_MS);
      enterTip(below, TIP_REENTER_AT_MS);
      pulseHalo(TRAVEL_DELAY_MS + TRAVEL_MS + 320);
    }
    // `below` is derived from tipH which is in the deps; belowRef keeps the exit
    // path in sync without re-running this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, target, targetRadius, tipH, reduceMotion]);

  // ── Leaving ───────────────────────────────────────────────────────────────
  const leaving = useRef(false);
  // Mirrored into state ONLY to drive pointerEvents below — a ref read during
  // render wouldn't re-render when it flips.
  const [isLeaving, setIsLeaving] = useState(false);

  const leave = useCallback((how: 'skip' | 'finish') => {
    if (leaving.current) return;
    leaving.current = true;
    setIsLeaving(true);
    const b = belowRef.current;
    cancelAnimation(halo);
    halo.value = withTiming(0, { duration: 200 });
    exitTip(b, 10, 300);

    const done = () => (how === 'finish' ? tour.finish() : tour.skip());
    if (reduceMotion) { scrim.value = withTiming(0, { duration: 150 }, (f) => { if (f) runOnJS(done)(); }); return; }

    const cur = target;
    if (cur) {
      move(inflate(cur, EXIT_INFLATE), EXIT_RADIUS, EXIT_MS, Easing.inOut(Easing.quad), EXIT_DELAY_MS);
    }
    scrim.value = withDelay(EXIT_DELAY_MS, withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(done)();
    }));
    // The prayer flow is a fullScreenModal that slides up over 320 ms, so firing
    // it mid-exit means the tap feels instant and its slide covers our tail.
    if (how === 'finish') setTimeout(startPrayer, 300);
  }, [halo, exitTip, target, move, scrim, reduceMotion, tour, startPrayer]);

  // An anchor that never measured (collapsed view, odd device) must not strand
  // the tour on a blank scrim — step over it, or end if it was the last one.
  useEffect(() => {
    if (!active || target || leaving.current) return;
    const tm = setTimeout(() => {
      if (isLast) leave('skip'); else tour.next();
    }, 60);
    return () => clearTimeout(tm);
  }, [active, target, isLast, leave, tour]);

  const onNext = useCallback(() => {
    if (leaving.current) return;
    if (isLast) { leave('finish'); return; }
    exitTip(belowRef.current, 8, TIP_OUT_MS);
    // Swap the copy only once the old bubble is fully transparent.
    setTimeout(() => tour.next(), TIP_OUT_MS + 20);
  }, [isLast, leave, exitTip, tour]);

  // Android hardware back ends the tour.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leave('skip'); return true; });
    return () => sub.remove();
  }, [active, leave]);

  // A timing that was in flight across a backgrounding can land on garbage, so
  // freeze on the way out and snap (don't replay) on the way back.
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', s => {
      // NEVER touch the scrim while the exit is in flight. Backgrounding during
      // the ~820ms exit and returning used to clobber its withTiming(0), so the
      // completion callback fired with finished=false, done() never ran, and
      // `active` stayed true — a brand-new user left staring at a full-screen
      // touch-eating scrim on her first session, with both escape hatches
      // (watchdog, hardware back) already spent on leaving.current.
      if (leaving.current) return;
      if (s !== 'active') {
        cancelAnimation(sx); cancelAnimation(sy); cancelAnimation(sw);
        cancelAnimation(sh); cancelAnimation(sr); cancelAnimation(halo);
      } else if (target) {
        put(target, targetRadius);
        scrim.value = 1;
        pulseHalo(0);
      }
    });
    return () => sub.remove();
  }, [active, target, targetRadius, put, pulseHalo, sx, sy, sw, sh, sr, halo, scrim]);

  // Last-resort watchdog. It's a plain View, so a stuck overlay is cosmetic
  // rather than fatal — but it should still never happen.
  useEffect(() => {
    if (!active) return;
    // AUTHORITATIVE — deliberately bypasses leave()'s `leaving.current` guard.
    // The whole point of a watchdog is the case where the normal exit STARTED
    // but never completed; routing it back through leave() would just early-
    // return and leave the scrim up forever, which is exactly what happened.
    const cap = setTimeout(() => { leaving.current = false; tour.skip(); }, 30000);
    return () => clearTimeout(cap);
  }, [active, tour]);

  // Reset for a clean re-entry (shouldn't happen — the tour is once-ever — but
  // an aborted+restarted session must not inherit stale animation state).
  useEffect(() => {
    if (active) return;
    leaving.current = false;
    setIsLeaving(false);
    shownStepRef.current = -1;
    scrim.value = 0;
    tipOpacity.value = 0;
    cancelAnimation(halo);
    halo.value = 0;
  }, [active, scrim, tipOpacity, halo]);

  // ── Rendering ─────────────────────────────────────────────────────────────
  const pathProps = useAnimatedProps(() => {
    const x = sx.value, y = sy.value, w = sw.value, h = sh.value;
    const r = Math.min(sr.value, w / 2, h / 2);
    // Outer: the whole screen. Inner: a rounded rect. fillRule="evenodd" turns
    // the inner subpath into a hole regardless of winding direction.
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
    transform: [{ translateY: tipY.value }, { scale: tipScale.value }],
  }));
  const SETTLED = { opacity: 1 } as const;

  if (!active) return null;
  if (!target) return null;   // PrayerScreen aborts the tour if nothing measures

  return (
    <View style={styles.root}>
      {/* The scrim eats every touch outside the hole. It does NOT advance the
          step — users double-tap and would blow straight through the tour.
          Once we're leaving it stops intercepting: if anything ever strands the
          exit, a stuck scrim is then cosmetic rather than a frozen app, which is
          the guarantee this file's header promises. */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents={isLeaving ? 'none' : 'auto'} />
      <Svg
        width={W}
        height={H}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        <AnimatedPath
          animatedProps={pathProps}
          fill={SCRIM_COLOR}
          fillRule="evenodd"
          stroke={ROSE}
          strokeWidth={2}
        />
      </Svg>

      {/* Bubble. The animated style lives on the WRAPPER; the buttons are deeper
          children, and the wrapper drops back to a plain style once the entrance
          lands (Android hit-region safety — see the note up top). */}
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
          <Text style={styles.counter}>
            {t('tour.progress', { n: step + 1, total: TOUR_STEPS.length })}
          </Text>
          <Text style={styles.title}>{t(`tour.${stepId}.title`)}</Text>
          <Text style={styles.body}>{t(`tour.${stepId}.body`)}</Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => leave('skip')} hitSlop={12} activeOpacity={0.7}>
              <Text style={styles.skip}>{t('tour.skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} hitSlop={10} activeOpacity={0.9} style={styles.cta}>
              <Text style={styles.ctaText}>{t(isLast ? 'tour.finish' : 'tour.next')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above every other in-app surface (SetReminderTimeHost sits at 60) but below
  // the launch LoadingOverlay's 1000.
  root: { ...StyleSheet.absoluteFillObject, zIndex: 90, elevation: 90 },
  tipWrap: { position: 'absolute' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  // Downward triangle via the 4-borders trick — same as the home screen's
  // more-menu caret. Sits BELOW the card (bubble is above its anchor).
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
  counter: {
    fontFamily: FONTS.lato, fontSize: 12, color: TXTSUB,
    letterSpacing: 0.6, marginBottom: 6,
  },
  // NOTE: FONTS.loraBold must pair with fontWeight '600' — '700' makes Android
  // drop Lora and fall back to system sans (project memory).
  title: {
    fontFamily: FONTS.loraBold, fontSize: 18, fontWeight: '600',
    color: TXT, marginBottom: 6,
  },
  body: { fontFamily: FONTS.lato, letterSpacing: 0.4, fontSize: 14.5, lineHeight: 21, color: TXTSUB },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 16,
  },
  skip: { fontFamily: FONTS.lato, letterSpacing: 0.4, fontSize: 14, color: TXTSUB },
  cta: {
    backgroundColor: ROSE, borderRadius: BTN_RADIUS,
    paddingHorizontal: 20, paddingVertical: 9,
  },
  ctaText: {
    fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: 15,
    color: '#FFFFFF', letterSpacing: 0.2,
  },
});
