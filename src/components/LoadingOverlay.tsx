import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS, Easing } from 'react-native-reanimated';
import { FONTS, TXT, TXTSUB } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { useReminderInterstitial } from '../state/ReminderInterstitialContext';
import { useOnboarding } from '../state/OnboardingContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { localeFor } from '../i18n/locale';
import { LOADING_LINES } from '../constants/loadingContent';
import { LOADING_IMAGE_FILES } from '../constants/loadingImages';
import {
  advanceRotation, lineIndexFor, imageFileFor, cachedLoadingImage, warmLoadingPool,
} from '../services/loadingCache';

const { height } = Dimensions.get('window');
const APP_ICON = require('../../assets/icon.png');
// The SAME asset + size the native splash shows (app.json expo-splash-screen:
// image splash-icon.png, imageWidth 150, background #F9D9E6). Stage-1 renders
// an EXACT replica so the OS splash → overlay hand-off is invisible — the user
// perceives ONE icon screen, not two (per user 2026-07-09: the Android 12+
// system splash can't be removed, so we make it seamless instead).
const SPLASH_ICON = require('../../assets/splash-icon.png');
// FIRST-LAUNCH backdrop for stage 2. None of the 10 CDN loading photos are
// bundled (~25 MB — see constants/loadingImages), and they're only downloaded in
// the BACKGROUND on first run, so a brand-new user used to land on a bare pink
// gradient and never saw the verse photo at all. This already-bundled
// atmospheric photo (90 KB, also the verse-card fallback) fills that gap at zero
// added app size; the rotating CDN art takes over from the second launch.
const BUNDLED_LOADING_BG = require('../../assets/follow_him_day.webp');

// Two-segment launch (per user 2026-07-09):
//   • STAGE 1 "brand" — splash-icon at the EXACT native size/position (so the
//     OS splash hands off invisibly) + the "Her Bible" wordmark below it. This
//     stage absorbs ALL variable waiting: it stays up until the app underneath
//     is fully ready (nav + contexts + today's verse) AND the quote/photo have
//     resolved. One perceived screen: icon + wordmark.
//   • STAGE 2 "content" — the verse-on-photo screen, shown for EXACTLY
//     CONTENT_HOLD_MS (3s, per user "不能超过 3s") and then it leaves — no
//     readiness checks here anymore, everything was ready before we entered.
const BRAND_TOP = '#F9D9E6';
const BRAND_GRADIENT = ['#F9D9E6', '#F4A6C0'] as const;

// ── Stage-1 brand layout + choreography (per user 2026-07-10) ────────────────
// The icon MUST start at the native splash's exact size/position (150 px,
// dead-centre — see app.json expo-splash-screen) or the OS-splash hand-off pops.
// So instead of statically re-positioning it, we START matched and ANIMATE it
// up + down to 85 %: the hand-off stays invisible AND it lands where the user
// wants. The wordmark/tagline then fade in beneath the settled icon.
const ICON_BASE = 150;                                  // matches the native splash exactly
const ICON_SCALE = 0.85;                                // user: 85 % of current size
const ICON_FINAL = ICON_BASE * ICON_SCALE;              // 127.5
// Lift is PROPORTIONAL to screen height so it adapts across phones (~50 px on a
// typical ~850 dp-tall device, which is what the user eyeballed).
const ICON_LIFT = Math.round(height * 0.06);
const ICON_MOVE_MS = 600;                               // icon rise + shrink

const NAME_DELAY_MS = ICON_MOVE_MS;                     // wordmark starts as the icon settles
const NAME_FADE_MS = 600;                               // 1000 → 600 (user: launch was too long)
const TAGLINE_GAP_MS = 300;                             // 1000 → 300 (user)
const TAGLINE_DELAY_MS = NAME_DELAY_MS + NAME_FADE_MS + TAGLINE_GAP_MS;   // 1500
const TAGLINE_FADE_MS = 600;                            // same as the wordmark
const BRAND_ANIM_END_MS = TAGLINE_DELAY_MS + TAGLINE_FADE_MS;             // 2100

// Gap between the settled icon's bottom edge and the wordmark.
const ICON_TEXT_GAP = 22;
// Text block sits below the SETTLED icon: half the final icon + the gap, minus
// the lift (both measured from the screen's vertical centre).
const TEXT_TOP = -ICON_LIFT + ICON_FINAL / 2 + ICON_TEXT_GAP;

const NAME_SIZE = 36;                    // 24 → 36 (+50 % per user)
const TAGLINE_SIZE = NAME_SIZE / 2;      // user: half the wordmark — 18
const TAGLINE_TEXT = "Lifted by God's Word";

// Stage-1 floor: long enough that the full brand choreography always plays out
// (otherwise a fast-booting device would jump to stage 2 before the tagline
// ever appears).
const BRAND_MIN_MS = BRAND_ANIM_END_MS + 200;   // 3800
const CONTENT_HOLD_MS = 3000;  // stage-2: exactly 3s, never longer
const MAX_VISIBLE_MS = 11000;  // hard safety cap — never hang the launch

// English ordinal suffix ("17th"); other locales use their own date format.
function enOrdinal(d: number): string {
  if (d >= 11 && d <= 13) return `${d}th`;
  return `${d}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[d % 10] || 'th'}`;
}
function dateLine(lang: string): string {
  const now = new Date();
  if (lang === 'en') {
    return `${now.toLocaleDateString('en-US', { month: 'long' })} ${enOrdinal(now.getDate())}`;
  }
  return now.toLocaleDateString(localeFor(lang as Parameters<typeof localeFor>[0]), { month: 'long', day: 'numeric' });
}

interface Props {
  /** Main UI is mounted/ready (NavigationContainer onReady). */
  appReady: boolean;
  /** Called after the overlay finishes fading out. */
  onHide: () => void;
}

export default function LoadingOverlay({ appReady, onHide }: Props) {
  const { lang } = useUILanguage();
  const reminder = useReminderInterstitial();
  const onboarding = useOnboarding();
  const { getVerse, todayDay } = useDailyVerses();

  const [phase, setPhase] = useState<'brand' | 'content'>('brand');
  const [rot, setRot] = useState<number | null>(null);
  const [brandElapsed, setBrandElapsed] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const opacity = useSharedValue(1);          // whole-overlay fade at the very end
  const contentOpacity = useSharedValue(0);   // stage-1 → stage-2 cross-fade
  const hidingRef = useRef(false);

  // Stage-1 choreography. The icon starts EXACTLY where/how big the native
  // splash drew it (translateY 0, scale 1) so the hand-off is invisible, then
  // rises + shrinks into place; the wordmark and tagline fade in after it.
  const iconY = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const nameOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    iconY.value = withTiming(-ICON_LIFT, { duration: ICON_MOVE_MS, easing: ease });
    iconScale.value = withTiming(ICON_SCALE, { duration: ICON_MOVE_MS, easing: ease });
    nameOpacity.value = withDelay(NAME_DELAY_MS, withTiming(1, { duration: NAME_FADE_MS, easing: ease }));
    taglineOpacity.value = withDelay(TAGLINE_DELAY_MS, withTiming(1, { duration: TAGLINE_FADE_MS, easing: ease }));
  }, [iconY, iconScale, nameOpacity, taglineOpacity]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: iconY.value }, { scale: iconScale.value }],
  }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));

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
  // Content can be shown without any switch once the rotation has resolved.
  const contentReady = rot != null;

  // Stage 1 → Stage 2: ONLY once everything is ready (quote resolved AND the
  // app underneath fully loaded) — stage-1 absorbs all variable waiting, so
  // stage-2 can be a fixed-length showcase.
  useEffect(() => {
    if (phase !== 'brand' || !brandElapsed || !contentReady || !contextsReady) return;
    setPhase('content');
    contentOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [phase, brandElapsed, contentReady, contextsReady, contentOpacity]);

  // Single-shot fade-out → onHide. Guarded so the dismiss effect and the safety
  // cap can't restart the animation or call onHide twice.
  const fadeOut = useCallback(() => {
    if (hidingRef.current) return;
    hidingRef.current = true;
    opacity.value = withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(onHide)();
    });
  }, [opacity, onHide]);

  // Stage 2 → app: exactly CONTENT_HOLD_MS, then leave. No readiness checks —
  // stage-2 is only entered once the app is ready (see the transition above).
  useEffect(() => {
    if (phase !== 'content') return;
    const tm = setTimeout(fadeOut, CONTENT_HOLD_MS);
    return () => clearTimeout(tm);
  }, [phase, fadeOut]);

  // Hard safety cap — force away even if something never signals ready.
  useEffect(() => { const cap = setTimeout(fadeOut, MAX_VISIBLE_MS); return () => clearTimeout(cap); }, [fadeOut]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentFade = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  // Stage-2 content (only computed/shown once resolved).
  const idx = rot != null ? lineIndexFor(rot) : 0;
  const line = LOADING_LINES[idx];
  const imgFile = rot != null ? imageFileFor(rot) : LOADING_IMAGE_FILES[0];
  const cachedUri = cachedLoadingImage(imgFile);
  // Cached CDN art when we have it (2nd launch onward), otherwise the bundled
  // photo — so there is ALWAYS a photo behind the verse, never a bare gradient.
  // The pink gradient now only appears if even the bundled image fails to decode.
  const photoSource = cachedUri ? { uri: cachedUri } : BUNDLED_LOADING_BG;
  const onPhoto = !imgBroken;
  const fg = onPhoto ? '#FFFFFF' : TXT;
  const fgSub = onPhoto ? 'rgba(255,255,255,0.85)' : TXTSUB;
  const sentence = line.text[lang] || line.text.en || '';
  const source = line.source ? (line.source[lang] || line.source.en || null) : null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.root, fade]}>
      {/* STAGE 1 — the icon pixel-matches the native splash (flat pink, same
          splash-icon at 150px, same centered position), so the OS splash hands
          off invisibly; the "Her Bible" wordmark simply appears beneath the
          unmoving icon — reads as the SAME screen completing, not a new one. */}
      <View style={styles.brandCenter}>
        <Animated.Image source={SPLASH_ICON} style={[styles.brandCenterIcon, iconStyle]} resizeMode="contain" />
        <View style={styles.brandTextBlock}>
          <Animated.Text style={[styles.brandCenterName, nameStyle]}>Her Bible</Animated.Text>
          <Animated.Text style={[styles.brandTagline, taglineStyle]}>{TAGLINE_TEXT}</Animated.Text>
        </View>
      </View>

      {/* STAGE 2 — verse on photo (or pink), cross-faded in once ready. */}
      {phase === 'content' && (
        <Animated.View style={[StyleSheet.absoluteFillObject, contentFade]}>
          {onPhoto ? (
            <ImageBackground source={photoSource} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={() => setImgBroken(true)}>
              <LinearGradient
                colors={['rgba(10,8,24,0.58)', 'rgba(10,8,24,0.42)', 'rgba(10,8,24,0.68)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </ImageBackground>
          ) : (
            <LinearGradient colors={BRAND_GRADIENT} style={StyleSheet.absoluteFillObject} />
          )}

          <View style={[styles.textBlock, { top: height * 0.18 }]}>
            <Text style={[styles.date, { color: fg }, onPhoto && styles.shadow]}>{dateLine(lang)}</Text>
            <Text numberOfLines={6} style={[styles.sentence, { color: fg }, onPhoto && styles.shadow]}>{sentence}</Text>
            {source ? <Text numberOfLines={2} style={[styles.source, { color: fgSub }, onPhoto && styles.shadow]}>— {source}</Text> : null}
          </View>

          <View style={styles.brand}>
            <Image source={APP_ICON} style={styles.brandLogo} />
            <Text style={[styles.brandName, { color: fg }]}>Her Bible</Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BRAND_TOP, zIndex: 1000, elevation: 1000 },
  // Stage-1: icon pixel-matches the native splash (150px contain, dead
  // center); the wordmark hangs below WITHOUT shifting the icon (absolute,
  // pushed down from center) so the OS-splash hand-off stays invisible.
  brandCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // Laid out at the NATIVE splash size (150) and centred; the animated
  // transform (translateY + scale) lifts it and takes it to 85 %.
  brandCenterIcon: { width: ICON_BASE, height: ICON_BASE },
  // Text column pinned below the SETTLED icon (see TEXT_TOP).
  brandTextBlock: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: TEXT_TOP,
    alignItems: 'center',
  },
  brandCenterName: {
    // NOTE: FONTS.loraBold must pair with fontWeight '600' — '700' makes Android
    // drop Lora and fall back to system sans (project memory).
    fontFamily: FONTS.loraBold, fontSize: NAME_SIZE, fontWeight: '600',
    letterSpacing: 0.4, color: TXT, textAlign: 'center',
  },
  brandTagline: {
    fontFamily: FONTS.lora, fontSize: TAGLINE_SIZE, fontWeight: '400',
    letterSpacing: 0.3, color: TXTSUB, textAlign: 'center', marginTop: 10,
  },
  // Stage-2 text block (upper third).
  textBlock: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  date: {
    fontFamily: FONTS.merriweatherBold, fontSize: 28.6, fontWeight: '700',      // 26 → 28.6 (+10 % per user)
    textAlign: 'center', marginBottom: 16,
  },
  sentence: { fontFamily: FONTS.merriweather, fontSize: 24.2, lineHeight: 35.2, textAlign: 'center' },   // 22/32 → 24.2/35.2 (+10 %)
  source: { fontFamily: FONTS.merriweather, fontSize: 17.6, lineHeight: 26.4, textAlign: 'center', marginTop: 14 },   // 16/24 → 17.6/26.4 (+10 %)
  brand: { position: 'absolute', left: 0, right: 0, bottom: 89, alignItems: 'center', justifyContent: 'center' },   // 79 → 89 (+10 px per user)
  brandLogo: { width: 48.4, height: 48.4, borderRadius: 13.2, marginBottom: 8 },   // 44 → 48.4 (+10 %)
  brandName: { fontFamily: FONTS.loraBold, fontSize: 19.8, fontWeight: '600', letterSpacing: 0.4 },   // 18 → 19.8 (+10 %)
});
