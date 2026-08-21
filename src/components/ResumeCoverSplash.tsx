import React, { useEffect, useState } from 'react';
import { View, Text, Image, ImageBackground, StyleSheet, BackHandler } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, runOnJS, Easing } from 'react-native-reanimated';
import { FONTS } from '../constants/theme';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import { useSheetSurface, setResumeSplashUp } from '../state/promptSurface';
import { LOADING_LINES } from '../constants/loadingContent';
import { peekRotation, lineIndexFor, imageFileFor, cachedLoadingImage } from '../services/loadingCache';

const SPLASH_ICON = require('../../assets/splash-icon.png');
const BUNDLED_LOADING_BG = require('../../assets/follow_him_day.webp');

// The >3-minute-away resume ritual's cover moment (owner 2026-08-21): a short
// replay of the launch loading's stage-2 scene — the SAME photo and line the
// cold start showed this session (peekRotation, no counter burn), brand at the
// top, date + line in the middle. Deliberately a lightweight sibling of
// LoadingOverlay rather than a mode inside it: that component's state machine
// is tuned around the OS-splash hand-off, and the stability playbook says
// don't destabilize cold-start machinery for a resume feature.
//
// Surface registration (swarm r1): useSheetSurface holds the nudge coordinator
// back so the streak ritual's choreography can't burn invisibly underneath us,
// and setResumeSplashUp lets adFrequency defer the hot-start ad one beat so
// the cover moment isn't cut in half at 600 ms.
const FADE_IN_MS = 260;
const HOLD_MS = 1250;
const FADE_OUT_MS = 380;

export default function ResumeCoverSplash({ onHide }: { onHide: () => void }) {
  const { lang } = useUILanguage();
  // null until the persisted rotation resolves — the text block renders only
  // then, so a slow AsyncStorage read can't visibly swap the line mid-fade.
  const [rot, setRot] = useState<number | null>(null);
  const [bgUri, setBgUri] = useState<string | null>(null);
  const opacity = useSharedValue(0);

  useSheetSurface(true);

  useEffect(() => {
    setResumeSplashUp(true);
    let live = true;
    peekRotation().then(r => {
      if (!live) return;
      setBgUri(cachedLoadingImage(imageFileFor(r)));
      setRot(r);
    }).catch(() => { if (live) setRot(0); });
    // ONE assignment: a second `opacity.value =` in the same block would
    // CANCEL the fade-in before it ran a single frame (swarm r1 HIGH — the
    // classic shared-value mistake this repo's own memory warns about).
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.quad) }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.quad) }, (fin) => {
          if (fin) runOnJS(onHide)();
        }),
      ),
    );
    // Watchdog — a dropped completion callback must never strand a full-screen
    // cover over the app.
    const cap = setTimeout(onHide, FADE_IN_MS + HOLD_MS + FADE_OUT_MS + 600);
    // The 1.9s window must also swallow hardware BACK — it would otherwise act
    // on the covered navigation stack underneath.
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      live = false;
      clearTimeout(cap);
      back.remove();
      setResumeSplashUp(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const line = rot != null ? LOADING_LINES[lineIndexFor(rot)] : null;
  const text = line ? (line.text[lang] ?? line.text.en ?? '') : '';
  const source = line?.source ? (line.source[lang] ?? line.source.en) : null;
  const dateLine = new Date().toLocaleDateString(localeFor(lang), { month: 'long', day: 'numeric' });

  return (
    <Animated.View style={[styles.root, rootStyle]} pointerEvents="auto">
      <ImageBackground
        source={bgUri ? { uri: bgUri } : BUNDLED_LOADING_BG}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.brandRow}>
          <Image source={SPLASH_ICON} style={styles.brandIcon} />
          <Text style={styles.brandName}>Her Bible</Text>
        </View>
        {line && (
          <View style={styles.center}>
            <Text style={styles.date}>{dateLine}</Text>
            <Text style={styles.line}>{text}</Text>
            {source ? <Text style={styles.source}>— {source}</Text> : null}
          </View>
        )}
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Above the whole app, below nothing — same layer discipline as the launch
  // overlay (opaque image ground, no background+elevation combo on one view).
  root: { ...StyleSheet.absoluteFillObject, zIndex: 990, elevation: 990 },
  brandRow: { alignItems: 'center', marginTop: 84 },
  brandIcon: { width: 44, height: 44, borderRadius: 11 },
  brandName: {
    marginTop: 10, fontSize: 22, color: '#FFFFFF',
    fontFamily: FONTS.loraBold, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingBottom: 60 },
  date: {
    fontSize: 15, color: 'rgba(255,255,255,0.92)',
    fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.6,
  },
  line: {
    marginTop: 14, fontSize: 20, lineHeight: 30, color: '#FFFFFF', textAlign: 'center',
    fontFamily: FONTS.lora,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  source: {
    marginTop: 10, fontSize: 14.5, color: 'rgba(255,255,255,0.85)',
    fontFamily: FONTS.lato, letterSpacing: 0.4,
  },
});
