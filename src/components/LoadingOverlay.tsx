import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, Easing, interpolateColor,
} from 'react-native-reanimated';
import { FONTS, TXT, TXTSUB, ROSE } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { useReminderInterstitial } from '../state/ReminderInterstitialContext';
import { useOnboarding } from '../state/OnboardingContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { localeFor } from '../i18n/locale';
import { useT } from '../i18n/useT';
import { startFirstOpenAdGate, getFirstOpenGateState, subscribeFirstOpenGate } from '../services/firstOpenAdGate';
import { LOADING_LINES } from '../constants/loadingContent';
import { LOADING_IMAGE_FILES } from '../constants/loadingImages';
import {
  advanceRotation, lineIndexFor, imageFileFor, cachedLoadingImage, warmLoadingPool,
} from '../services/loadingCache';

const { height } = Dimensions.get('window');
// The SAME asset + size the native splash shows (app.json expo-splash-screen:
// image splash-icon.png, imageWidth 150, background #F9D9E6). Stage-1 renders
// an EXACT replica so the OS splash → overlay hand-off is invisible — the user
// perceives ONE icon screen, not two (the Android 12+ system splash can't be
// removed, so we make it seamless instead).
const SPLASH_ICON = require('../../assets/splash-icon.png');
// FIRST-LAUNCH backdrop for stage 2. None of the 10 CDN loading photos are
// bundled (~25 MB — see constants/loadingImages), and they're only downloaded in
// the BACKGROUND on first run, so a brand-new user used to land on a bare pink
// gradient and never saw the verse photo at all. This already-bundled
// atmospheric photo (90 KB, also the verse-card fallback) fills that gap at zero
// added app size; the rotating CDN art takes over from the second launch.
const BUNDLED_LOADING_BG = require('../../assets/follow_him_day.webp');

// ─── Launch, in ONE continuous move (per user 2026-07-11) ────────────────────
// It used to be two screens that cross-faded: a pink brand card, then a
// separate verse-on-photo card with its own little logo pinned to the bottom.
// Now it's a single scene. The brand (icon + wordmark) is the SAME element
// throughout: it settles in the middle of the pink card, then RISES to the top
// while the photo fades in underneath it and slowly pushes in from 100 % → 110 %.
// Today's date and the daily verse then fade up below it. Nothing is
// duplicated, nothing cross-dissolves into a copy of itself.
const BRAND_BG = '#F9D9E6';
const BRAND_GRADIENT = ['#F9D9E6', '#F4A6C0'] as const;

// ── Stage 1: pink brand card ────────────────────────────────────────────────
// The icon MUST start at the native splash's exact size/position (150 px,
// dead-centre — see app.json expo-splash-screen) or the OS-splash hand-off pops.
// So instead of statically re-positioning it, we START matched and ANIMATE it
// up + down to its resting scale: the hand-off stays invisible AND it lands
// where the user wants.
const ICON_BASE = 150;                                  // matches the native splash exactly
const ICON_SCALE = 0.68;                                // 0.85 × 0.8 — user: logo -20 %
const ICON_FINAL = ICON_BASE * ICON_SCALE;              // 102
// Lift is PROPORTIONAL to screen height so it adapts across phones.
const ICON_LIFT = Math.round(height * 0.06);
const ICON_MOVE_MS = 600;                               // icon rise + shrink

const NAME_DELAY_MS = ICON_MOVE_MS;                     // wordmark starts as the icon settles
const NAME_FADE_MS = 600;
const TAGLINE_GAP_MS = 300;
const TAGLINE_DELAY_MS = NAME_DELAY_MS + NAME_FADE_MS + TAGLINE_GAP_MS;   // 1500
const TAGLINE_FADE_MS = 600;
const BRAND_ANIM_END_MS = TAGLINE_DELAY_MS + TAGLINE_FADE_MS;             // 2100

const ICON_TEXT_GAP = 17.6;                             // 22 × 0.8 — user: tighten the icon↔wordmark gap 20 %
// Text column sits below the SETTLED icon: half the final icon + the gap, minus
// the lift (both measured from the screen's vertical centre).
const TEXT_TOP = -ICON_LIFT + ICON_FINAL / 2 + ICON_TEXT_GAP;

const NAME_SIZE = 24.75;                 // 36 → 32.4 (-10 %) → 27.5 (-15 %) → 24.75 (-10 % again, per user)
const TAGLINE_SIZE = NAME_SIZE / 2;      // user: half the wordmark
const TAGLINE_TEXT = "Lifted by God's Word";

// ── Stage 2: the brand rises, the photo arrives ─────────────────────────────
// Where the icon's CENTRE ends up (fraction of screen height) — the top-centre
// slot from the reference layout the user sent.
const BRAND_TARGET_Y = Math.round(height * 0.24);
// Travel = target − where stage 1 left it (screen centre, minus the stage-1 lift).
const BRAND_RISE = BRAND_TARGET_Y - (height / 2 - ICON_LIFT);

const RISE_MS = 750;            // brand centre → top. Slow-fast-slow (inOut cubic).
const BG_FADE_MS = 700;         // photo crosses in under the rising brand
const TAGLINE_OUT_MS = 260;     // tagline belongs to the pink card only
const ZOOM_TO = 1.10;           // user: 100 % → 110 %
const ZOOM_MS = 4300;           // spans the whole of stage 2 + the exit fade (3300 → 4300, tracks CONTENT_HOLD_MS)
const DATE_DELAY_MS = 750;      // lands just as the brand finishes rising
const DATE_FADE_MS = 500;
const VERSE_DELAY_MS = 1000;
const VERSE_FADE_MS = 600;
const RISE_UP_PX = 14;          // date/verse drift up as they fade in

// Stage-1 floor: long enough that the full brand choreography always plays out
// (otherwise a fast-booting device would jump to stage 2 before the tagline
// ever appears).
const BRAND_MIN_MS = 2000;      // brand-card floor (per user 2026-07-18: → 2s)
const CONTENT_HOLD_MS = 3000;  // stage-2 dwell (per user 2026-07-18: 4000 → 3000)
const MAX_VISIBLE_MS = 11000;  // hard safety cap — never hang the launch

// English ordinal suffix ("July 17th"); other locales use their own date format.
function enOrdinal(d: number): string {
  if (d >= 11 && d <= 13) return `${d}th`;
  return `${d}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[d % 10] || 'th'}`;
}
// Capitalize the MONTH NAME inside a formatted date (per user). Romance locales
// render it lowercase and mid-string — "25 de julio", "25 juillet" — so
// upper-casing the string's first character would do nothing. Instead we format
// the month on its own, capitalize that, and swap it back in. en/de are already
// capitalized by grammar and CJK has no case, so those are no-ops.
function capitalizeMonth(full: string, month: string): string {
  if (!month) return full;
  const capped = month.charAt(0).toUpperCase() + month.slice(1);
  return capped === month ? full : full.replace(month, capped);
}

function dateLine(lang: string): string {
  const now = new Date();
  if (lang === 'en') {
    return `${now.toLocaleDateString('en-US', { month: 'long' })} ${enOrdinal(now.getDate())}`;
  }
  const loc = localeFor(lang as Parameters<typeof localeFor>[0]);
  return capitalizeMonth(
    now.toLocaleDateString(loc, { month: 'long', day: 'numeric' }),
    now.toLocaleDateString(loc, { month: 'long' }),
  );
}

interface Props {
  /** Main UI is mounted/ready (NavigationContainer onReady). */
  appReady: boolean;
  /** Called after the overlay finishes fading out. */
  onHide: () => void;
}

export default function LoadingOverlay({ appReady, onHide }: Props) {
  const { lang } = useUILanguage();
  const t = useT();
  const reminder = useReminderInterstitial();
  const onboarding = useOnboarding();
  const { getVerse, todayDay } = useDailyVerses();

  const [phase, setPhase] = useState<'brand' | 'content'>('brand');
  const [rot, setRot] = useState<number | null>(null);
  const [brandElapsed, setBrandElapsed] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const opacity = useSharedValue(1);          // whole-overlay fade at the very end
  const hidingRef = useRef(false);
  const contentStartRef = useRef<number | null>(null);  // when stage 2 began

  // Stage-1 choreography. The icon starts EXACTLY where/how big the native
  // splash drew it (translateY 0, scale 1) so the hand-off is invisible, then
  // rises + shrinks into place; the wordmark and tagline fade in after it.
  const iconY = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const nameOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);

  // Stage-2 choreography.
  const rise = useSharedValue(0);             // 0 = centred (pink card), 1 = docked at top
  const stage2 = useSharedValue(0);           // drives the brand's dark → white text colour
  const bgOpacity = useSharedValue(0);
  const bgScale = useSharedValue(1);
  const dateOpacity = useSharedValue(0);
  const verseOpacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    iconY.value = withTiming(-ICON_LIFT, { duration: ICON_MOVE_MS, easing: ease });
    iconScale.value = withTiming(ICON_SCALE, { duration: ICON_MOVE_MS, easing: ease });
    nameOpacity.value = withDelay(NAME_DELAY_MS, withTiming(1, { duration: NAME_FADE_MS, easing: ease }));
    taglineOpacity.value = withDelay(TAGLINE_DELAY_MS, withTiming(1, { duration: TAGLINE_FADE_MS, easing: ease }));
  }, [iconY, iconScale, nameOpacity, taglineOpacity]);

  // Resolve which line + photo to show (async — reads storage). The line is
  // NEVER shown until this resolves (stage 2 only), so it can't visibly switch.
  // .catch is not optional: rot stays null on a rejection → contentReady never
  // flips → stage 2 never runs, and the user sits on the pink card until the 11s
  // MAX_VISIBLE_MS cap force-hides it. Falling back to rotation 0 keeps the
  // verse card.
  useEffect(() => {
    advanceRotation()
      .then(n => { setRot(n); warmLoadingPool(n).catch(() => {}); })
      .catch(() => setRot(0));
  }, []);
  // Stage-1 minimum dwell.
  useEffect(() => { const tm = setTimeout(() => setBrandElapsed(true), BRAND_MIN_MS); return () => clearTimeout(tm); }, []);

  // "Real app is rendered" = nav ready AND both gating contexts hydrated
  // (RootNavigator returns null until these are ready) AND today's verse +
  // prayer are actually loaded, so the home screen shows real content the
  // instant we enter — never a blank/placeholder that fills in a beat later.
  const dailyVerseReady = getVerse(todayDay, 'morning') != null && getVerse(todayDay, 'evening') != null;
  const contextsReady = appReady && reminder.ready && onboarding.ready && dailyVerseReady;
  const contentReady = rot != null;

  // First-run progress bar. New users cold-start every time and can read the
  // launch as "stuck"; a determinate 7px bar with a % reassures them we really
  // are loading. Driven in JS (not Reanimated) so the % text is trivial. It
  // eases toward 90 % on a timer so it always creeps forward, then snaps to
  // 100 % the moment the app is genuinely ready. Shown on the brand card only,
  // and only for brand-new users (returning users don't see a slow cold start).
  const isNewUser = onboarding.ready && !onboarding.done;

  // First-open ad gate (owner 2026-08-22): a brand-new user's overlay also
  // waits for the loading-screen ad to resolve — shown, no-fill grace, or a
  // network hold with a visible message. Returning users never start it.
  const gateState = useSyncExternalStore(subscribeFirstOpenGate, getFirstOpenGateState);
  // Guarded on hidingRef: if onboarding hydration outlived the 11s cap the
  // overlay is already leaving — starting the gate then would pop the ad at a
  // random onboarding moment instead of during loading (swarm 2026-08-22).
  useEffect(() => { if (isNewUser && !hidingRef.current) startFirstOpenAdGate(); }, [isNewUser]);
  const gateHolding = isNewUser && gateState !== 'idle' && gateState !== 'done';

  const allReady = contentReady && contextsReady && !gateHolding;
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!isNewUser) return;
    const id = setInterval(() => {
      setProgress(prev => {
        const target = allReady ? 100 : 90;
        if (prev >= target) return prev;
        const next = prev + Math.max(0.7, (target - prev) * 0.12);
        return Math.min(next, target);
      });
    }, 55);
    return () => clearInterval(id);
  }, [isNewUser, allReady]);

  // Stage 1 → Stage 2. Entry is gated ONLY on the overlay's OWN content being
  // ready (brand animation done + rotation resolved — both fast & local). It is
  // deliberately NOT gated on `contextsReady`/`appReady`: on a cold start the
  // full provider tree takes several seconds to mount, and gating stage-2 ENTRY
  // on it made brand-new users sit on the pink brand card for the whole cold
  // start. The app-ready wait now lives on the DISMISS side instead — the user
  // watches the verse scene (not a static logo) while the app finishes loading.
  useEffect(() => {
    if (phase !== 'brand' || !brandElapsed || !contentReady) return;
    setPhase('content');
    contentStartRef.current = Date.now();
    const soft = Easing.out(Easing.cubic);
    rise.value = withTiming(1, { duration: RISE_MS, easing: Easing.inOut(Easing.cubic) });
    stage2.value = withTiming(1, { duration: BG_FADE_MS, easing: soft });
    bgOpacity.value = withTiming(1, { duration: BG_FADE_MS, easing: soft });
    // Gentle slow → fast → slow push-in. quad (not cubic) keeps the curve mild,
    // per the user's "速度弧度不要太大".
    bgScale.value = withTiming(ZOOM_TO, { duration: ZOOM_MS, easing: Easing.inOut(Easing.quad) });
    taglineOpacity.value = withTiming(0, { duration: TAGLINE_OUT_MS, easing: Easing.in(Easing.quad) });
    dateOpacity.value = withDelay(DATE_DELAY_MS, withTiming(1, { duration: DATE_FADE_MS, easing: soft }));
    verseOpacity.value = withDelay(VERSE_DELAY_MS, withTiming(1, { duration: VERSE_FADE_MS, easing: soft }));
  }, [phase, brandElapsed, contentReady,
      rise, stage2, bgOpacity, bgScale, taglineOpacity, dateOpacity, verseOpacity]);

  // Single-shot fade-out → onHide. Guarded so the dismiss effect and the safety
  // cap can't restart the animation or call onHide twice.
  const fadeOut = useCallback(() => {
    if (hidingRef.current) return;
    hidingRef.current = true;
    opacity.value = withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(onHide)();
    });
    // Belt to the animation's braces. `hidingRef` makes this function single-shot,
    // which also NEUTERS the MAX_VISIBLE_MS cap below once the fade has started —
    // so if the completion callback is ever dropped, nothing else calls onHide,
    // `loadingDone` stays false, setLaunchOverlayUp(true) is never cleared and
    // promptSurfaceSafe() refuses every blocking prompt for the whole session.
    // onHide is an idempotent setState, so calling it twice is free.
    setTimeout(onHide, 900);
  }, [opacity, onHide]);

  // Stage 2 → app: play the verse for at least CONTENT_HOLD_MS, then leave — but
  // never dismiss INTO a half-built app, so also wait for `contextsReady`. On a
  // cold start the app usually isn't ready yet when the dwell ends; holding on
  // the verse a beat longer is far nicer than the pink logo. The dwell is counted
  // from when stage 2 actually began, so a slow-to-ready app adds no extra time
  // beyond what it genuinely needs. MAX_VISIBLE_MS still hard-caps everything.
  useEffect(() => {
    if (phase !== 'content' || !contextsReady || gateHolding) return;
    const started = contentStartRef.current ?? Date.now();
    const remaining = Math.max(0, CONTENT_HOLD_MS - (Date.now() - started));
    const tm = setTimeout(fadeOut, remaining);
    return () => clearTimeout(tm);
  }, [phase, contextsReady, gateHolding, fadeOut]);

  // Hard safety cap — force away even if something never signals ready.
  useEffect(() => {
    if (gateHolding) return;   // first-open gate owns its own exits (12s pending watchdog, 3s grace; network holds by design)
    const cap = setTimeout(fadeOut, MAX_VISIBLE_MS);
    return () => clearTimeout(cap);
  }, [fadeOut, gateHolding]);

  // Stage-2 content (only computed/shown once resolved).
  const idx = rot != null ? lineIndexFor(rot) : 0;
  const line = LOADING_LINES[idx];
  const imgFile = rot != null ? imageFileFor(rot) : LOADING_IMAGE_FILES[0];
  const cachedUri = cachedLoadingImage(imgFile);
  // Cached CDN art when we have it (2nd launch onward), otherwise the bundled
  // photo — so there is ALWAYS a photo behind the verse, never a bare gradient.
  const photoSource = cachedUri ? { uri: cachedUri } : BUNDLED_LOADING_BG;
  const onPhoto = !imgBroken;
  const fg = onPhoto ? '#FFFFFF' : TXT;
  const fgSub = onPhoto ? 'rgba(255,255,255,0.88)' : TXTSUB;
  const sentence = line.text[lang] || line.text.en || '';
  const source = line.source ? (line.source[lang] || line.source.en || null) : null;

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const riseStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value * BRAND_RISE }] }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: iconY.value }, { scale: iconScale.value }],
  }));
  // The wordmark is the SAME element on both cards, so its colour has to travel
  // from ink-on-pink to white-on-photo in step with the backdrop.
  const nameStyle = useAnimatedStyle(() => ({
    opacity: nameOpacity.value,
    color: interpolateColor(stage2.value, [0, 1], [TXT, fg]),
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));
  const bgFade = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const bgZoom = useAnimatedStyle(() => ({ transform: [{ scale: bgScale.value }] }));
  const dateStyle = useAnimatedStyle(() => ({
    opacity: dateOpacity.value,
    transform: [{ translateY: (1 - dateOpacity.value) * RISE_UP_PX }],
  }));
  const verseStyle = useAnimatedStyle(() => ({
    opacity: verseOpacity.value,
    transform: [{ translateY: (1 - verseOpacity.value) * RISE_UP_PX }],
  }));

  const onContent = phase === 'content';

  return (
    // pointerEvents="none": nothing in here is interactive, but a full-screen
    // 'auto' View with no responder SWALLOWS touches instead of passing them
    // down — so taps during the 700 ms fade-out (overlay already invisible)
    // used to die, and a stalled ready-flag could eat them far longer.
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.root, fade]} pointerEvents="none">
      {/* BACKDROP — fades in under the rising brand and pushes in 100 % → 110 %. */}
      {onContent && (
        <Animated.View style={[StyleSheet.absoluteFillObject, bgFade]} pointerEvents="none">
          {onPhoto ? (
            // The zoom lives on a wrapper so the photo AND its readability veil
            // scale together — the veil can't drift off the edges mid-push-in.
            <Animated.View style={[StyleSheet.absoluteFillObject, bgZoom]}>
              <ImageBackground
                source={photoSource}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
                onError={() => setImgBroken(true)}
              >
                <LinearGradient
                  colors={['rgba(10,8,24,0.58)', 'rgba(10,8,24,0.42)', 'rgba(10,8,24,0.68)']}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
              </ImageBackground>
            </Animated.View>
          ) : (
            <LinearGradient colors={BRAND_GRADIENT} style={StyleSheet.absoluteFillObject} />
          )}
        </Animated.View>
      )}

      {/* BRAND — one element for the whole launch. Centred on the pink card,
          then lifted to the top-centre slot as the photo arrives. */}
      <Animated.View style={[styles.brandCenter, riseStyle]} pointerEvents="none">
        <Animated.Image source={SPLASH_ICON} style={[styles.brandIcon, iconStyle]} resizeMode="contain" />
        <View style={styles.brandTextBlock}>
          <Animated.Text style={[styles.brandName, onContent && onPhoto && styles.shadow, nameStyle]}>
            HER BIBLE
          </Animated.Text>
          <Animated.Text style={[styles.brandTagline, taglineStyle]}>{TAGLINE_TEXT}</Animated.Text>
        </View>
      </Animated.View>

      {/* FIRST-RUN PROGRESS — new users only, BOTH stages (owner 2026-08-22):
          bottom-anchored so it rides under the pink card AND the photo scene.
          The ads notice keeps the loading-screen ad honest; a network hold
          swaps it for the check-your-connection line. */}
      {isNewUser && (
        <View style={styles.progressWrap} pointerEvents="none">
          <View style={[styles.progressTrack, onContent && onPhoto && styles.progressTrackOnPhoto]}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={[styles.progressPct, onContent && onPhoto && { color: '#FFFFFF' }, onContent && onPhoto && styles.shadow]}>
            {Math.round(progress)}%
          </Text>
          {gateState === 'network' ? (
            <Text style={[styles.noNetwork, onContent && onPhoto && styles.shadow]}>
              {t('loading.noNetwork')}
            </Text>
          ) : (
            <Text style={[styles.adsNotice, onContent && onPhoto && { color: 'rgba(255,255,255,0.82)' }, onContent && onPhoto && styles.shadow]}>
              {t('loading.adsNotice')}
            </Text>
          )}
        </View>
      )}

      {/* LOWER BLOCK — today's date, then the day's verse. Bottom-anchored so a
          long verse grows upward instead of colliding with the brand above. */}
      {onContent && (
        <View style={styles.lower} pointerEvents="none">
          <Animated.Text
            numberOfLines={1}
            style={[styles.date, { color: fg }, onPhoto && styles.shadow, dateStyle]}
          >
            {dateLine(lang)}
          </Animated.Text>
          <Animated.Text
            numberOfLines={5}
            style={[styles.sentence, { color: fg }, onPhoto && styles.shadow, verseStyle]}
          >
            {sentence}
          </Animated.Text>
          {source ? (
            <Animated.Text
              numberOfLines={2}
              style={[styles.source, { color: fgSub }, onPhoto && styles.shadow, verseStyle]}
            >
              — {source}
            </Animated.Text>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BRAND_BG, zIndex: 1000, elevation: 1000 },
  // Centred on the pink card; the rise transform takes the whole block up.
  brandCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // Laid out at the NATIVE splash size (150) and centred; the animated
  // transform (translateY + scale) lifts it and takes it to ICON_SCALE.
  brandIcon: { width: ICON_BASE, height: ICON_BASE },
  // Text column pinned below the SETTLED icon (see TEXT_TOP) so the icon's own
  // transform never shifts it.
  brandTextBlock: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: TEXT_TOP,
    alignItems: 'center',
  },
  brandName: {
    // NOTE: FONTS.loraBold must pair with fontWeight '600' — '700' makes Android
    // drop Lora and fall back to system sans (project memory).
    fontFamily: FONTS.loraBold, fontSize: NAME_SIZE, fontWeight: '600',
    letterSpacing: 0.4, textAlign: 'center',
  },
  brandTagline: {
    fontFamily: FONTS.lora, fontSize: TAGLINE_SIZE, fontWeight: '400',
    letterSpacing: 0.3, color: TXTSUB, textAlign: 'center', marginTop: 10,
  },
  lower: {
    position: 'absolute',
    left: 26,
    right: 26,
    bottom: Math.round(height * 0.15) + 100,                                    // +100 px per user — the verse sat too low
    alignItems: 'center',
  },
  // Today's date, in the slot the reference layout gives its award badge.
  // Same treatment it had on the old verse card.
  date: {
    fontFamily: FONTS.merriweatherBold, fontSize: 28.6, fontWeight: '700',
    letterSpacing: 0.2, textAlign: 'center', marginBottom: 16,
  },
  // The verse is the headline of this card — bigger and bolder than before, to
  // carry the composition the way the reference does.
  sentence: {
    // 30 → 27 → 24.3 (-10 % per user). lineHeight scales WITH it (38 → 34.2):
    // shrinking the glyphs while leaving the leading fixed makes the block look
    // airy and broken, not smaller.
    fontFamily: FONTS.merriweatherBold, fontSize: 24.3, lineHeight: 34.2,
    fontWeight: '700', textAlign: 'center',
  },
  source: { fontFamily: FONTS.merriweather, fontSize: 16.5, lineHeight: 25, textAlign: 'center', marginTop: 14 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  // First-run progress — sits a little below the brand's resting centre.
  progressWrap: {
    // Bottom-anchored so the SAME bar persists from the pink card into the
    // photo scene (owner 2026-08-22) without colliding with the verse block
    // (which bottoms out ~height*0.15+100 above it).
    position: 'absolute', left: 0, right: 0, bottom: Math.round(height * 0.045),
    alignItems: 'center',
  },
  progressTrack: {
    width: '56%', height: 7, borderRadius: 3.5,
    backgroundColor: 'rgba(30,27,46,0.12)', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3.5, backgroundColor: ROSE },
  progressTrackOnPhoto: { backgroundColor: 'rgba(255,255,255,0.28)' },
  adsNotice: {
    marginTop: 8, fontSize: 11.5, color: TXTSUB,
    fontFamily: FONTS.lato, letterSpacing: 0.3,
  },
  noNetwork: {
    marginTop: 8, fontSize: 12.5, color: ROSE,
    fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.3,
    textAlign: 'center', paddingHorizontal: 30,
  },
  progressPct: {
    marginTop: 10, fontFamily: FONTS.merriweatherBold, fontSize: 13,
    fontWeight: '700', letterSpacing: 0.3, color: TXTSUB,
  },
});
