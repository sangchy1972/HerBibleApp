import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { FONTS, TXT, TXTSUB } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { useReminderInterstitial } from '../state/ReminderInterstitialContext';
import { useOnboarding } from '../state/OnboardingContext';
import { localeFor } from '../i18n/locale';
import { LOADING_LINES } from '../constants/loadingContent';
import { LOADING_IMAGE_FILES } from '../constants/loadingImages';
import {
  advanceRotation, lineIndexFor, imageFileFor, cachedLoadingImage, warmLoadingPool,
} from '../services/loadingCache';

const { height } = Dimensions.get('window');
const APP_ICON = require('../../assets/icon.png');
const MIN_VISIBLE_MS = 2000;   // show for at least 2s (per user)
const MIN_SKIP_MS = 800;       // shorter floor when FollowHim is queued (avoid a sub-half-second flash)
const MAX_VISIBLE_MS = 6000;   // safety cap — never let the loading page hang

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

// Full-screen launch loading page: rotating background photo + a hymn/quote
// line under today's date, brand mark at the bottom. Stays up for ≥2s AND until
// the app is ready (slow devices never flash a half-built screen), then fades.
// When no CDN photo is cached yet (e.g. fresh install) it falls back to a
// white→pink silk gradient with dark text — the app's only launch screen now
// (the old "Connect with God" onboarding cover was removed). If the returning-
// user notification opt-in (FollowHim) is about to show, the 2s floor is
// skipped so the entry flow doesn't get too long.
export default function LoadingOverlay({ appReady, onHide }: Props) {
  const { lang } = useUILanguage();
  const reminder = useReminderInterstitial();
  const onboarding = useOnboarding();
  const [rot, setRot] = useState<number | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const opacity = useSharedValue(1);
  const hidingRef = useRef(false);

  const [shortElapsed, setShortElapsed] = useState(false);
  useEffect(() => { advanceRotation().then(n => { setRot(n); warmLoadingPool(n).catch(() => {}); }); }, []);
  useEffect(() => { const tm = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS); return () => clearTimeout(tm); }, []);
  useEffect(() => { const tm = setTimeout(() => setShortElapsed(true), MIN_SKIP_MS); return () => clearTimeout(tm); }, []);

  // Single-shot fade — guarded so the dismiss effect and the safety cap can't
  // restart the animation or call onHide twice.
  const fadeOut = React.useCallback(() => {
    if (hidingRef.current) return;
    hidingRef.current = true;
    opacity.value = withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(onHide)();
    });
  }, [opacity, onHide]);

  // "Real app is rendered" = nav reported ready AND both gating contexts have
  // hydrated (RootNavigator returns null until these are ready, so without this
  // the overlay could fade to a blank screen on a slow device).
  const contextsReady = appReady && reminder.ready && onboarding.ready;
  // Skip the 2s floor when FollowHim (notification opt-in) is queued, so we
  // don't stack loading + opt-in into a long entry.
  const skipFloor = reminder.ready && reminder.shouldShow;
  useEffect(() => {
    // Normal: ≥2s floor. FollowHim queued: shorter 0.8s floor (not 0, so the
    // brand page never flashes for a fraction of a second).
    if ((minElapsed || (skipFloor && shortElapsed)) && contextsReady) fadeOut();
  }, [minElapsed, skipFloor, shortElapsed, contextsReady, fadeOut]);

  // Hard safety cap — force away even if the app never signals ready.
  useEffect(() => { const cap = setTimeout(fadeOut, MAX_VISIBLE_MS); return () => clearTimeout(cap); }, [fadeOut]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const idx = rot != null ? lineIndexFor(rot) : 0;
  const line = LOADING_LINES[idx];
  const imgFile = rot != null ? imageFileFor(rot) : LOADING_IMAGE_FILES[0];
  const cachedUri = cachedLoadingImage(imgFile);
  const onPhoto = !!cachedUri && !imgBroken;   // a broken cached file falls back to the gradient
  const fg = onPhoto ? '#FFFFFF' : TXT;          // text color adapts to backdrop
  const fgSub = onPhoto ? 'rgba(255,255,255,0.85)' : TXTSUB;

  const sentence = line.text[lang] || line.text.en || '';
  const source = line.source ? (line.source[lang] || line.source.en || null) : null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.root, fade]}>
      {onPhoto ? (
        <ImageBackground source={{ uri: cachedUri! }} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={() => setImgBroken(true)}>
          <LinearGradient
            colors={['rgba(10,8,24,0.58)', 'rgba(10,8,24,0.42)', 'rgba(10,8,24,0.68)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
      ) : (
        // White → soft pink silk gradient (no hard colour boundary) — the
        // default backdrop when no photo is cached yet.
        <LinearGradient
          colors={['#FFFFFF', '#FFF6FA', '#FCE3EE', '#F6CFE0']}
          locations={[0, 0.4, 0.74, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Date + line, seated in the upper third like the reference design. */}
      <View style={[styles.textBlock, { top: height * 0.18 }]}>
        <Text style={[styles.date, { color: fg }, onPhoto && styles.shadow]}>{dateLine(lang)}</Text>
        <Text numberOfLines={6} style={[styles.sentence, { color: fg }, onPhoto && styles.shadow]}>{sentence}</Text>
        {source ? <Text numberOfLines={2} style={[styles.source, { color: fgSub }, onPhoto && styles.shadow]}>— {source}</Text> : null}
      </View>

      {/* Brand mark at the bottom: pink app logo + "Her Bible". */}
      <View style={styles.brand}>
        <Image source={APP_ICON} style={styles.brandLogo} />
        <Text style={[styles.brandName, { color: fg }]}>Her Bible</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', zIndex: 1000, elevation: 1000 },
  // Seated in the upper third (top set inline). numberOfLines on the sentence
  // (6) + source (2) is the hard cap that keeps a long line from reaching the
  // brand mark — so no `bottom` constraint is needed (which would otherwise
  // leave a big empty band below the text on tall screens).
  textBlock: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  // Soft shadow only over photos, for legibility on bright images.
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  date: {
    fontFamily: FONTS.merriweatherBold, fontSize: 26, fontWeight: '700',
    textAlign: 'center', marginBottom: 16,   // larger after-gap than the reference per user
  },
  sentence: { fontFamily: FONTS.merriweather, fontSize: 22, lineHeight: 32, textAlign: 'center' },
  source: { fontFamily: FONTS.merriweather, fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 14 },
  brand: { position: 'absolute', left: 0, right: 0, bottom: 79, alignItems: 'center', justifyContent: 'center' },   // 54 → 79 (+25 px from the bottom per user)
  brandLogo: { width: 44, height: 44, borderRadius: 12, marginBottom: 8 },
  brandName: { fontFamily: FONTS.loraBold, fontSize: 18, fontWeight: '600', letterSpacing: 0.4 },   // Lora 600 per user (700 drops Lora on Android)
});
