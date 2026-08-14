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
import { ROSE, TXT, TXTSUB, FONTS, P, BTN_RADIUS } from '../../constants/theme';
import { measureRefInWindow, type Rect } from '../../state/FirstRunTourContext';
import InlineBold from './InlineBold';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ── One spotlight step: scrim, rounded hole, coach bubble ───────────────────
// The generic half of the guided-tour system, extracted from the streak guide
// so every guide draws the same overlay (FirstRunTourHost keeps its bespoke
// hole-travel choreography; everything single-anchor uses this).
//
// The hard-won safety rules live HERE, once:
//   • no <Modal> — a plain absolute-fill View can never freeze the app;
//   • shared values, never `entering=`;
//   • anchor rects normalized against this overlay's own root, so the
//     device-specific measureInWindow origin (Samsung/OneUI status bar)
//     cancels exactly;
//   • the bubble hands back to plain RN once its entrance lands (Android/
//     Fabric hit-region safety), with a watchdog for dropped callbacks;
//   • an unmeasurable anchor bails out via onUnmeasurable instead of
//     stranding a scrim; a 30s watchdog force-exits, BYPASSING the leaving
//     latch (the case it exists for is an exit that started and never
//     finished);
//   • the primary/skip actions run exactly once, after the exit animation,
//     with a fallback timer in case the scrim callback is dropped.
//
// Mount one instance per STEP (key it by step id): every shared value starts
// fresh and the close-in replays on the new anchor.

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

export interface SpotlightCoachProps {
  /** Render/measure only while the anchor's own screen is focused. */
  focused: boolean;
  /** Raw window-space rect of the anchor (the overlay normalizes it). */
  measure: () => Promise<Rect | null>;
  /** Spotlight padding around the anchor and the hole's corner radius. */
  pad: number;
  radius: number;
  /** Omit on a SINGLE-step guide. Rendered only when non-empty — an empty string
   *  would still lay out a text row. */
  counter?: string;
  title: string;
  /** Supports **bold** spans (InlineBold). */
  body: string;
  primaryLabel: string;
  /** Omit when the guide has ONE button. Rendered only when non-empty: an empty
   *  label left a hitSlop-12 invisible touch target sitting to the left of the
   *  CTA, which is exactly the hazard dev-guide §2 is about. */
  skipLabel?: string;
  /**
   * Let touches through the spotlight HOLE so she can actually use the control
   * being highlighted; everything outside it is still blocked. Use it whenever a
   * step invites her to try the thing — highlighting a button that then ignores
   * her tap is the dead-tap failure this app has shipped before.
   *
   * The step that turns this on owns what happens next: the control it exposes
   * usually opens something (a drawer, a sheet) that will paint OVER this
   * overlay, so the guide must hide itself while that is up and pick the step
   * back up when it closes.
   */
  interactiveHole?: boolean;
  /** Both fire AFTER the exit animation, exactly once. */
  onPrimary: () => void;
  onSkip: () => void;
  /** The anchor never produced a usable rect (~3s of retries). */
  onUnmeasurable: () => void;
}

export default function SpotlightCoach({
  focused, measure, pad, radius, counter, title, body, primaryLabel, skipLabel,
  interactiveHole, onPrimary, onSkip, onUnmeasurable,
}: SpotlightCoachProps) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  // ── Geometry ──────────────────────────────────────────────────────────────
  const rootRef = useRef<View>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  const [measureEpoch, setMeasureEpoch] = useState(0);

  // Rects agree when every edge is within a pixel — the settle criterion used
  // by both the acquisition below and the drift sampler further down.
  const agree = useCallback((a: Rect, b: Rect) =>
    Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1, []);
  // The anchor must actually be IN the viewport before anything arms. The
  // Bible guide's final step measures a button that lives at the BOTTOM of a
  // chapter mid-scrollToEnd: accepting its below-the-screen rect put the hole
  // and the bubble off-screen while the scrim and the full-screen shield armed
  // anyway — a black screen with no visible way out (owner screenshots,
  // 2026-08-14). Off-viewport is treated exactly like unmeasurable: keep
  // sampling, never arm.
  const inViewport = useCallback((r: Rect) =>
    r.y + r.h > insets.top + 12 && r.y < H - (insets.bottom + 64) - 12,
  [insets.top, insets.bottom, H]);

  // ── ACQUISITION: settle first, arm second ─────────────────────────────────
  // The old flow measured ONCE, played the entrance on whatever came back, and
  // corrected later. Screens measure mid-motion constantly — the header rides
  // a TabSection entrance, the plan guide scrolls its anchor into place, the
  // Bible guide rides a chapter to its end — so the first frame was routinely
  // wrong (a hole a status-bar height below the icons it framed). Now the hole
  // does not EXIST until two consecutive samples agree within 1px AND the rect
  // is actually on screen. Until then the root has no children and every touch
  // goes to the ordinary app. ~14 samples ≈ 4s, then bail — never a trap.
  useEffect(() => {
    if (target || !focused) return;
    let live = true;
    let tm: ReturnType<typeof setTimeout> | null = null;
    // Local to the run, NOT refs: a blur/foreground cycle restarts acquisition
    // with a full budget instead of inheriting a half-spent counter and bailing
    // out of a perfectly measurable step.
    let samples = 0;
    let prev: Rect | null = null;
    const sample = async () => {
      if (!live) return;
      samples += 1;
      const [origin, raw] = await Promise.all([measureRefInWindow(rootRef), measure()]);
      if (!live) return;
      if (raw && raw.w > 0 && raw.h > 0) {
        const o = origin ?? { x: 0, y: 0, w: 0, h: 0 };
        const r = inflate({ x: raw.x - o.x, y: raw.y - o.y, w: raw.w, h: raw.h }, pad);
        if (prev && agree(prev, r) && inViewport(r)) { setTarget(r); return; }
        prev = r;
      } else {
        prev = null;                    // gaps must not let two distant samples "agree"
      }
      if (samples >= 14) { onUnmeasurable(); return; }
      tm = setTimeout(sample, 280);
    };
    sample();
    return () => { live = false; if (tm) clearTimeout(tm); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, focused, measureEpoch, measure]);

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

  const put = useCallback((r: Rect, rad: number) => {
    sx.value = r.x; sy.value = r.y; sw.value = r.w; sh.value = r.h; sr.value = rad;
  }, [sx, sy, sw, sh, sr]);

  const playedRef = useRef(false);
  const animatedRectRef = useRef<Rect | null>(null);
  useEffect(() => {
    if (!target || tipH === 0 || playedRef.current) return;
    playedRef.current = true;
    animatedRectRef.current = target;
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
  }, [target, tipH]);

  // ── DRIFT SAMPLER — the acquired anchor can still move LATER ──────────────
  // Content reflows (covers land, translated rows re-wrap), and a foreground
  // return (measureEpoch bump) can find the layout shifted. Re-measure every
  // 300ms and snap ONCE, only when two consecutive samples agree AND the rect
  // is still in the viewport — never onto a moving anchor, which is what read
  // as the bubble "jittering in place". Intermediate samples touch no state;
  // the one snap goes through the equality-guarded snap effect above.
  useEffect(() => {
    if (!target) return;
    let live = true;
    let tm: ReturnType<typeof setTimeout> | null = null;
    let prev: Rect | null = null;
    let samples = 0;
    const sample = async () => {
      if (!live) return;
      samples += 1;
      const [origin, raw] = await Promise.all([measureRefInWindow(rootRef), measure()]);
      if (!live) return;
      if (raw && raw.w > 0 && raw.h > 0) {
        const o = origin ?? { x: 0, y: 0, w: 0, h: 0 };
        const r = inflate({ x: raw.x - o.x, y: raw.y - o.y, w: raw.w, h: raw.h }, pad);
        if (prev && agree(prev, r) && inViewport(r)) {
          setTarget(t => (t && agree(t, r) ? t : r));   // settled → one snap, stop
          return;
        }
        prev = r;
      } else {
        prev = null;
      }
      if (samples >= 10) return;                        // quiet cap — keep what we have
      tm = setTimeout(sample, 300);
    };
    tm = setTimeout(sample, 350);
    return () => { live = false; if (tm) clearTimeout(tm); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target != null, measureEpoch]);

  // A re-measure (the confirming pass, foregrounding) that MOVES the rect after
  // the entrance already played → snap the hole and bubble onto the fresh
  // position. The equality check keeps this from fighting the entrance that
  // just ran with this very rect.
  useEffect(() => {
    if (!playedRef.current || !target) return;
    const a = animatedRectRef.current;
    if (a && a.x === target.x && a.y === target.y && a.w === target.w && a.h === target.h) return;
    animatedRectRef.current = target;
    put(target, radius);
  }, [target, radius, put]);

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

  const handleSkip = useCallback(() => leave(onSkip), [leave, onSkip]);
  const handlePrimary = useCallback(() => leave(onPrimary), [leave, onPrimary]);

  // Android hardware back = skip — but ONLY while the overlay is actually on
  // screen. This component stays mounted (rendering null) through screen
  // transitions and while an anchor is still being measured; intercepting the
  // hardware back then would swallow presses aimed at a perfectly normal app.
  useEffect(() => {
    if (!focused || !target) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { handleSkip(); return true; });
    return () => sub.remove();
  }, [focused, target, handleSkip]);

  // Backgrounding mid-flight: freeze, snap on return, re-measure.
  useEffect(() => {
    if (!focused) return;
    const sub = AppState.addEventListener('change', s => {
      if (leaving.current) return;
      if (s !== 'active') {
        cancelAnimation(sx); cancelAnimation(sy); cancelAnimation(sw);
        cancelAnimation(sh); cancelAnimation(sr); cancelAnimation(halo);
      } else if (target) {
        put(target, radius);
        scrim.value = 1;
        setMeasureEpoch(e => e + 1);
      }
    });
    return () => sub.remove();
  }, [focused, target, radius, put, scrim, sx, sy, sw, sh, sr, halo]);

  // Last-resort watchdog — bypasses `leaving` on purpose: the case it exists
  // for is an exit that STARTED but never completed.
  useEffect(() => {
    const cap = setTimeout(() => { leaving.current = false; onUnmeasurable(); }, 30000);
    return () => clearTimeout(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const tabBarish = insets.bottom + 64;
  const spaceBelow = target ? H - tabBarish - (target.y + target.h) - CARET - TIP_GAP : 0;
  const spaceAbove = target ? target.y - CARET - TIP_GAP - (insets.top + 6) : 0;
  // Pick the side that FITS; when neither does, the roomier one. The old rule
  // only ever asked "does below fit?" and sent everything else above with no
  // clamp — a tall translated bubble over a high anchor rode straight off the
  // top of the screen, status bar included (owner screenshot 2026-08-14).
  const fitsBelow = tipH > 0 && tipH + 12 <= spaceBelow;
  const fitsAbove = tipH > 0 && tipH <= spaceAbove;
  const below = !!target && (fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove));
  const tipW = Math.min(TIP_MAX_W, W - 2 * P);
  const centerX = target ? target.x + target.w / 2 : W / 2;
  const tipLeft = clamp(centerX - tipW / 2, P, Math.max(P, W - P - tipW));
  // Clamped into the safe viewport WHATEVER the side says: Pular/Próximo must
  // be reachable on every language length and every anchor position. A clamp
  // may slide the bubble over part of the hole — reachable-but-overlapping
  // beats perfectly-spaced-but-off-screen.
  const tipTopRaw = target
    ? (below ? target.y + target.h + CARET + TIP_GAP : target.y - CARET - TIP_GAP - tipH)
    : 0;
  const tipTop = target
    ? clamp(tipTopRaw, insets.top + 6, Math.max(insets.top + 6, H - tabBarish - tipH - 6))
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

  if (!focused) return null;

  return (
    // The ROOT mounts the moment the step's screen has focus — BEFORE the
    // anchor is measured — because it is the coordinate-space origin every
    // hole position is normalized against; measuring the anchor without it
    // painted the first frame a status-bar-height off on Samsung/OneUI.
    // It is box-none and, until `target` exists, has NO children: a user mid-
    // measurement is touching the ordinary app, not an invisible shield. The
    // touch shield below only exists alongside a VISIBLE scrim — this app has
    // been burned by invisible full-screen layers before; never again.
    <View style={styles.root} ref={rootRef} collapsable={false} pointerEvents="box-none">
      {/* `tipH === 0` is load-bearing, not defensive. The scrim's darkness comes
          from the sibling SVG, whose opacity only starts animating once the tip
          has laid out — so between mount and that first layout this shield was a
          FULLY TRANSPARENT full-screen touch blocker, and if a step's bubble
          happened to lay out to the same height as the previous one, RN never
          fires onLayout again and it stayed that way until the 30 s watchdog.
          Invisible-and-dead is exactly "the screen sometimes stops responding,
          then recovers on its own". */}
      {target != null && !interactiveHole && (
        <View
          style={StyleSheet.absoluteFillObject}
          pointerEvents={isLeaving || tipH === 0 ? 'none' : 'auto'}
        />
      )}
      {/* interactiveHole: the same shield as four bands AROUND the hole, so the
          highlighted control stays tappable and nothing else is. Strictly less
          blocking than the full-screen version, so it cannot introduce a new
          dead zone — and the bands come from the SETTLED `target`, not the
          animated shared values, which during the close-in makes the touch hole
          SMALLER than the visible one. Erring that way is deliberate: a tap that
          lands early is blocked rather than passed to a control the scrim has not
          finished framing. */}
      {target != null && interactiveHole && (() => {
        const off = isLeaving || tipH === 0;
        const band = (s: object, key: string) => (
          <View key={key} style={[styles.band, s]} pointerEvents={off ? 'none' : 'auto'} />
        );
        const bx = Math.max(0, target.x);
        const bw = Math.max(0, target.w);
        const by = Math.max(0, target.y);
        const bh = Math.max(0, target.h);
        return [
          band({ left: 0, right: 0, top: 0, height: by }, 'top'),
          band({ left: 0, right: 0, top: by + bh, bottom: 0 }, 'bottom'),
          band({ left: 0, top: by, width: bx, height: bh }, 'left'),
          band({ left: bx + bw, right: 0, top: by, height: bh }, 'right'),
        ];
      })()}
      {target != null && (
        <Svg width={W} height={H} style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <AnimatedPath animatedProps={pathProps} fill={TXT} fillRule="evenodd" stroke={ROSE} strokeWidth={2} />
        </Svg>
      )}

      {target != null && <Animated.View
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
          {counter ? <Text style={styles.counter}>{counter}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          <InlineBold text={body} style={styles.body} boldStyle={styles.bodyBold} />
          <View style={[styles.row, !skipLabel && styles.rowSingle]}>
            {skipLabel ? (
              <TouchableOpacity onPress={handleSkip} hitSlop={12} activeOpacity={0.7}>
                <Text style={styles.skip}>{skipLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={handlePrimary} hitSlop={10} activeOpacity={0.9} style={styles.cta}>
              <Text style={styles.ctaText}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>}
    </View>
  );
}


const styles = StyleSheet.create({
  // Same layer band as FirstRunTourHost — the coordinator guarantees at most
  // one guide is up at a time.
  root: { ...StyleSheet.absoluteFillObject, zIndex: 90, elevation: 90 },
  // One of the four touch bands that fence off an interactive hole. NO
  // background: these must stay invisible, and they only ever exist alongside a
  // visible scrim (same rule as the full-screen shield above).
  band: { position: 'absolute' },
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
  // One button → it owns the row, right-aligned like the CTA always is.
  rowSingle: { justifyContent: 'flex-end' },
  skip: { fontFamily: FONTS.lato, letterSpacing: 0.4, fontSize: ts(14), color: TXTSUB },
  cta: { backgroundColor: ROSE, borderRadius: BTN_RADIUS, paddingHorizontal: 20, paddingVertical: 9 },
  ctaText: { fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: ts(15), color: '#FFFFFF', letterSpacing: 0.2 },
});
