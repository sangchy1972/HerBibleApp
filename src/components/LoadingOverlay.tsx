import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, Easing, interpolateColor,
} from 'react-native-reanimated';
import { FONTS, TXT, TXTSUB } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { useReminderInterstitial } from '../state/ReminderInterstitialContext';
import { useOnboarding } from '../state/OnboardingContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useActivity } from '../state/ActivityContext';
import { useT } from '../i18n/useT';
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
// The streak line and the daily verse then fade up below it. Nothing is
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

const ICON_TEXT_GAP = 22;                               // settled icon's bottom edge → wordmark
// Text column sits below the SETTLED icon: half the final icon + the gap, minus
// the lift (both measured from the screen's vertical centre).
const TEXT_TOP = -ICON_LIFT + ICON_FINAL / 2 + ICON_TEXT_GAP;

const NAME_SIZE = 32.4;                  // 36 × 0.9 — user: wordmark -10 %
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
const ZOOM_MS = 3300;           // spans the whole of stage 2 + the exit fade
const STREAK_DELAY_MS = 750;    // lands just as the brand finishes rising
const STREAK_FADE_MS = 500;
const VERSE_DELAY_MS = 1000;
const VERSE_FADE_MS = 600;
const RISE_UP_PX = 14;          // streak/verse drift up as they fade in

// Stage-1 floor: long enough that the full brand choreography always plays out
// (otherwise a fast-booting device would jump to stage 2 before the tagline
// ever appears).
const BRAND_MIN_MS = BRAND_ANIM_END_MS + 200;   // 2300
const CONTENT_HOLD_MS = 3000;  // stage-2: exactly 3s, never longer
const MAX_VISIBLE_MS = 11000;  // hard safety cap — never hang the launch

// English ordinal suffix ("17th"); other locales get a plain number and phrase
// the sentence their own way (see the `loading.streak` context note).
function enOrdinal(d: number): string {
  if (d >= 11 && d <= 13) return `${d}th`;
  return `${d}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[d % 10] || 'th'}`;
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
  const { streak } = useActivity();

  const [phase, setPhase] = useState<'brand' | 'content'>('brand');
  const [rot, setRot] = useState<number | null>(null);
  const [brandElapsed, setBrandElapsed] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const opacity = useSharedValue(1);          // whole-overlay fade at the very end
  const hidingRef = useRef(false);

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
  const streakOpacity = useSharedValue(0);
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
  useEffect(() => { advanceRotation().then(n => { setRot(n); warmLoadingPool(n).catch(() => {}); }); }, []);
  // Stage-1 minimum dwell.
  useEffect(() => { const tm = setTimeout(() => setBrandElapsed(true), BRAND_MIN_MS); return () => clearTimeout(tm); }, []);

  // "Real app is rendered" = nav ready AND both gating contexts hydrated
  // (RootNavigator returns null until these are ready) AND today's verse +
  // prayer are actually loaded, so the home screen shows real content the
  // instant we enter — never a blank/placeholder that fills in a beat later.
  const dailyVerseReady = getVerse(todayDay, 'morning') != null && getVerse(todayDay, 'evening') != null;
  const contextsReady = appReady && reminder.ready && onboarding.ready && dailyVerseReady;
  const contentReady = rot != null;

  // Stage 1 → Stage 2. Stage-1 absorbs ALL variable waiting, so stage 2 can be
  // a fixed-length showcase. Everything below fires off this one switch — the
  // brand lifts, the photo arrives and starts its slow push-in, and the streak
  // + verse fade up underneath.
  useEffect(() => {
    if (phase !== 'brand' || !brandElapsed || !contentReady || !contextsReady) return;
    setPhase('content');
    const soft = Easing.out(Easing.cubic);
    rise.value = withTiming(1, { duration: RISE_MS, easing: Easing.inOut(Easing.cubic) });
    stage2.value = withTiming(1, { duration: BG_FADE_MS, easing: soft });
    bgOpacity.value = withTiming(1, { duration: BG_FADE_MS, easing: soft });
    // Gentle slow → fast → slow push-in. quad (not cubic) keeps the curve mild,
    // per the user's "速度弧度不要太大".
    bgScale.value = withTiming(ZOOM_TO, { duration: ZOOM_MS, easing: Easing.inOut(Easing.quad) });
    taglineOpacity.value = withTiming(0, { duration: TAGLINE_OUT_MS, easing: Easing.in(Easing.quad) });
    streakOpacity.value = withDelay(STREAK_DELAY_MS, withTiming(1, { duration: STREAK_FADE_MS, easing: soft }));
    verseOpacity.value = withDelay(VERSE_DELAY_MS, withTiming(1, { duration: VERSE_FADE_MS, easing: soft }));
  }, [phase, brandElapsed, contentReady, contextsReady,
      rise, stage2, bgOpacity, bgScale, taglineOpacity, streakOpacity, verseOpacity]);

  // Single-shot fade-out → onHide. Guarded so the dismiss effect and the safety
  // cap can't restart the animation or call onHide twice.
  const fadeOut = useCallback(() => {
    if (hidingRef.current) return;
    hidingRef.current = true;
    opacity.value = withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(onHide)();
    });
  }, [opacity, onHide]);

  // Stage 2 → app: exactly CONTENT_HOLD_MS, then leave.
  useEffect(() => {
    if (phase !== 'content') return;
    const tm = setTimeout(fadeOut, CONTENT_HOLD_MS);
    return () => clearTimeout(tm);
  }, [phase, fadeOut]);

  // Hard safety cap — force away even if something never signals ready.
  useEffect(() => { const cap = setTimeout(fadeOut, MAX_VISIBLE_MS); return () => clearTimeout(cap); }, [fadeOut]);

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

  // Day 1 for a brand-new user; from launch 2 onward this is their real streak.
  const dayN = Math.max(1, streak);
  const streakLine = t('loading.streak', { n: lang === 'en' ? enOrdinal(dayN) : dayN });

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
  const streakStyle = useAnimatedStyle(() => ({
    opacity: streakOpacity.value,
    transform: [{ translateY: (1 - streakOpacity.value) * RISE_UP_PX }],
  }));
  const verseStyle = useAnimatedStyle(() => ({
    opacity: verseOpacity.value,
    transform: [{ translateY: (1 - verseOpacity.value) * RISE_UP_PX }],
  }));

  const onContent = phase === 'content';

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.root, fade]}>
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
            Her Bible
          </Animated.Text>
          <Animated.Text style={[styles.brandTagline, taglineStyle]}>{TAGLINE_TEXT}</Animated.Text>
        </View>
      </Animated.View>

      {/* LOWER BLOCK — streak, then the day's verse. Bottom-anchored so a long
          verse grows upward instead of colliding with the brand above. */}
      {onContent && (
        <View style={styles.lower} pointerEvents="none">
          <Animated.Text
            numberOfLines={2}
            style={[styles.streak, { color: fgSub }, onPhoto && styles.shadow, streakStyle]}
          >
            {streakLine}
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
    bottom: Math.round(height * 0.15),
    alignItems: 'center',
  },
  // Sits where the reference layout puts its award badge — one quiet line above
  // the headline.
  streak: {
    fontFamily: FONTS.lato, fontSize: 18, letterSpacing: 0.4,
    textAlign: 'center', marginBottom: 18,
  },
  // The verse is the headline of this card — bigger and bolder than before, to
  // carry the composition the way the reference does.
  sentence: {
    fontFamily: FONTS.merriweatherBold, fontSize: 27, lineHeight: 38,
    fontWeight: '700', textAlign: 'center',
  },
  source: { fontFamily: FONTS.merriweather, fontSize: 16.5, lineHeight: 25, textAlign: 'center', marginTop: 14 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
