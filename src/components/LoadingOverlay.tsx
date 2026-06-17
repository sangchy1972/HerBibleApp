import React, { useEffect, useState } from 'react';
import { View, Text, Image, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { FONTS } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import { LOADING_LINES } from '../constants/loadingContent';
import { LOADING_FALLBACK_IMG, LOADING_IMAGE_FILES } from '../constants/loadingImages';
import {
  advanceRotation, lineIndexFor, imageFileFor, cachedLoadingImage, warmLoadingPool,
} from '../services/loadingCache';

const { height } = Dimensions.get('window');
const APP_ICON = require('../../assets/icon.png');
const MIN_VISIBLE_MS = 2000;   // show for at least 2s (per user)

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
// line under today's date, brand mark at the bottom. Stays up for at least 2s
// AND until the app is ready (so slow devices never flash a half-built screen),
// then fades out. Lines are bundled; images are CDN-cached with a tiny bundled
// fallback for the very first launch.
export default function LoadingOverlay({ appReady, onHide }: Props) {
  const { lang } = useUILanguage();
  const [rot, setRot] = useState<number | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const opacity = useSharedValue(1);

  // Advance rotation once, then warm the image pool (current + next) in bg.
  useEffect(() => { advanceRotation().then(n => { setRot(n); warmLoadingPool(n).catch(() => {}); }); }, []);
  useEffect(() => { const tm = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS); return () => clearTimeout(tm); }, []);

  // Dismiss once BOTH the floor time has passed and the app is ready.
  useEffect(() => {
    if (minElapsed && appReady) {
      opacity.value = withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }, (fin) => {
        if (fin) runOnJS(onHide)();
      });
    }
  }, [minElapsed, appReady, opacity, onHide]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const idx = rot != null ? lineIndexFor(rot) : 0;
  const line = LOADING_LINES[idx];
  const imgFile = rot != null ? imageFileFor(rot) : LOADING_IMAGE_FILES[0];
  const cachedUri = cachedLoadingImage(imgFile);
  const bgSource = cachedUri ? { uri: cachedUri } : LOADING_FALLBACK_IMG;

  const sentence = line.text[lang] || line.text.en || '';
  const source = line.source ? (line.source[lang] || line.source.en || null) : null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.root, fade]}>
      <ImageBackground source={bgSource} style={StyleSheet.absoluteFillObject} resizeMode="cover">
        {/* Dark scrim top→bottom so white text stays legible on any photo. */}
        <LinearGradient
          colors={['rgba(10,8,24,0.55)', 'rgba(10,8,24,0.30)', 'rgba(10,8,24,0.65)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Date + line, seated in the upper third like the reference design. */}
        <View style={[styles.textBlock, { top: height * 0.20 }]}>
          <Text style={styles.date}>{dateLine(lang)}</Text>
          <Text style={styles.sentence}>{sentence}</Text>
          {source ? <Text style={styles.source}>— {source}</Text> : null}
        </View>

        {/* Brand mark at the bottom: pink app logo + "Her Bible". */}
        <View style={styles.brand}>
          <Image source={APP_ICON} style={styles.brandLogo} />
          <Text style={styles.brandName}>Her Bible</Text>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#0A0818', zIndex: 1000, elevation: 1000 },
  textBlock: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  date: {
    fontFamily: FONTS.merriweatherBold, fontSize: 26, fontWeight: '700',
    color: '#FFFFFF', textAlign: 'center', marginBottom: 16,   // larger after-gap than the reference per user
  },
  sentence: {
    fontFamily: FONTS.merriweather, fontSize: 22, lineHeight: 32,
    color: 'rgba(255,255,255,0.96)', textAlign: 'center',
  },
  source: {
    fontFamily: FONTS.merriweather, fontSize: 16, lineHeight: 24,
    color: 'rgba(255,255,255,0.82)', textAlign: 'center', marginTop: 14,
  },
  brand: {
    position: 'absolute', left: 0, right: 0, bottom: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  brandLogo: { width: 44, height: 44, borderRadius: 12, marginBottom: 8 },
  brandName: { fontFamily: FONTS.merriweatherBold, fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },
});
