import React, { useState } from 'react';
import { View, Text, ImageBackground, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useOnboarding } from '../state/OnboardingContext';
import { useT } from '../i18n/useT';

// Drop your hero artwork at assets/onboarding-hero.png and uncomment the require below.
// Until then we render a warm gradient placeholder so the screen still composes.
const HERO_SOURCE: number | null = null;
// const HERO_SOURCE = require('../../assets/onboarding-hero.png');

type Step = 'cover' | 'permission';

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('cover');
  const { finish } = useOnboarding();
  const insets = useSafeAreaInsets();
  const t = useT();

  const requestNotifications = async () => {
    try {
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await Notifications.requestPermissionsAsync();
      }
      if (!perm.granted && Platform.OS !== 'web') {
        // Permanently denied — best we can do is route to Settings, but we
        // still finish onboarding so the user isn't stuck.
        Linking.openSettings().catch(() => {});
      }
    } catch {
      // Notification API can throw on simulators / unsupported environments.
      // Don't block the user from entering the app.
    } finally {
      finish();
    }
  };

  return (
    <View style={styles.root}>
      <Hero />
      <LinearGradient
        colors={['rgba(40,20,10,0)', 'rgba(40,20,10,0.55)', 'rgba(30,15,8,0.95)']}
        locations={[0, 0.45, 1]}
        style={styles.fade}
      />

      {step === 'cover' && (
        <TouchableOpacity
          onPress={finish}
          hitSlop={12}
          style={[styles.skip, { top: insets.top + 14 }]}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      )}

      <Animated.View
        key={step}
        entering={FadeIn.duration(360)}
        style={[styles.bottom, { paddingBottom: insets.bottom + 38 }]}
      >
        {step === 'cover' ? (
          <>
            <Text style={styles.title}>{t('onboarding.title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>
            <TouchableOpacity
              onPress={() => setStep('permission')}
              activeOpacity={0.85}
              style={styles.continueBtn}
            >
              <Text style={styles.continueText}>{t('onboarding.continue')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <PermissionSheet
            onAllow={requestNotifications}
            onSkip={finish}
          />
        )}
      </Animated.View>
    </View>
  );
}

function Hero() {
  if (HERO_SOURCE) {
    return <ImageBackground source={HERO_SOURCE} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
  }
  // Placeholder — warm field-like gradient + a small note so it's obvious
  // this is a temp asset slot, not the final art.
  return (
    <LinearGradient
      colors={['#F4D58A', '#E8A85C', '#A86A2A', '#3A2410']}
      locations={[0, 0.35, 0.7, 1]}
      style={StyleSheet.absoluteFillObject}
    >
      <View style={styles.placeholderTag} pointerEvents="none">
        <Feather name="image" size={18} color="rgba(255,255,255,0.85)" />
        <Text style={styles.placeholderText}>assets/onboarding-hero.png</Text>
      </View>
    </LinearGradient>
  );
}

function PermissionSheet({ onAllow, onSkip }: { onAllow: () => void; onSkip: () => void }) {
  const t = useT();
  return (
    <Animated.View
      entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))}
      style={styles.sheet}
    >
      <View style={styles.sheetIcon}>
        <Feather name="bell" size={22} color={ROSE} />
      </View>
      <Text style={styles.sheetTitle}>{t('onboarding.permission.title')}</Text>
      <Text style={styles.sheetDesc}>{t('onboarding.permission.desc')}</Text>
      <TouchableOpacity onPress={onAllow} activeOpacity={0.85} style={styles.allowBtn}>
        <Text style={styles.allowText}>{t('onboarding.permission.allow')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} hitSlop={10} style={styles.notNowBtn}>
        <Text style={styles.notNowText}>{t('onboarding.permission.notNow')}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fade: { ...StyleSheet.absoluteFillObject },
  skip: {
    position: 'absolute',
    right: P + 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  skipText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.4 },
  placeholderTag: {
    position: 'absolute',
    bottom: '52%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  placeholderText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: P + 7,
    paddingTop: 28,
  },
  title: {
    fontSize: 30,
    fontFamily: FONTS.loraBold,                                                  // Lora bold per user; weight 600 per project rule (700 + loraBold falls back to system sans on Android)
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 28,
  },
  continueBtn: {
    // Matches PrayerScreen.startBtn radius (17.07); height 56 → 53.2 (-5 %).
    // Bottom spacing handled via the parent `bottom` view's paddingBottom
    // (insets.bottom + 38, was 28 — extra 10 px per user).
    alignSelf: 'stretch',
    height: 53.2,
    borderRadius: 17.07,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: { color: '#3A2410', fontSize: 17, fontWeight: '700', letterSpacing: 1.2 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    paddingTop: 24,
  },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: `${ROSE}1A`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: TXT,
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetDesc: {
    fontSize: 14,
    lineHeight: 21,
    color: TXTSUB,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  allowBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  notNowBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  notNowText: { color: TXTSUB, fontSize: 15, fontWeight: '500' },
});
