import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { TXT, FONTS } from '../constants/theme';
import { useOnboarding } from '../state/OnboardingContext';

// First-open welcome screen (2026-06: replaces the old "Connect with God"
// cover + notification-permission step). New users now see ONLY this calm
// brand splash — app icon, wordmark, tagline on a silk-like white→pink
// gradient — then auto-fade into the app. NO notification prompt here:
// the opt-in moved to the user's SECOND cold start (see
// ReminderInterstitialContext, which gates FollowHimScreen).
const ICON = require('../../assets/icon.png');

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// How long the splash holds before fading into the app. Long enough to
// register the brand, short enough to never feel like a loading stall.
const HOLD_MS = 2500;
const FADE_OUT_MS = 450;

export default function OnboardingScreen() {
  const { finish } = useOnboarding();
  const fade = useSharedValue(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      fade.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(finish)();
        },
      );
    }, HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[styles.root, fadeStyle]}>
      {/* Base wash — white melting into the brand pink, top to bottom. */}
      <LinearGradient
        colors={['#FFFFFF', '#FFF7FA', '#FCE4EE', '#F6CFE0']}
        locations={[0, 0.38, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Two oversized diagonal sheens layered over the wash give the
          flowing-silk feel: one rose ribbon sweeping down-right, one white
          highlight sweeping up-left. Pure gradients — no image assets. */}
      <LinearGradient
        colors={['transparent', 'rgba(232,97,154,0.10)', 'rgba(232,97,154,0.04)', 'transparent']}
        locations={[0.1, 0.45, 0.62, 0.95]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.ribbon, { transform: [{ rotate: '-14deg' }, { translateY: -SCREEN_H * 0.12 }] }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
        locations={[0.2, 0.5, 0.8]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.ribbon, { transform: [{ rotate: '18deg' }, { translateY: SCREEN_H * 0.18 }] }]}
        pointerEvents="none"
      />

      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(650)}>
          <Image source={ICON} style={styles.icon} />
        </Animated.View>
        <Animated.Text
          entering={FadeIn.duration(650).delay(180)}
          style={styles.title}
        >
          Her Bible
        </Animated.Text>
        <Animated.Text
          entering={FadeIn.duration(650).delay(330)}
          style={styles.tagline}
        >
          {/* Brand line — intentionally not localized. */}
          Take God's Word with you, wherever you go
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  ribbon: {
    position: 'absolute',
    width: SCREEN_W * 1.8,
    height: SCREEN_H * 0.9,
    left: -SCREEN_W * 0.4,
    top: SCREEN_H * 0.05,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Optical centering — nudge the block slightly above true center so the
    // icon+text group reads centered (true center looks low on tall screens).
    paddingBottom: SCREEN_H * 0.06,
  },
  icon: {
    width: 118,
    height: 118,
    // icon.png ships its own rounded-square mask; the shadow just lifts it
    // off the pale background.
    shadowColor: '#E8619A',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginBottom: 26,
  },
  title: {
    fontSize: 34,
    fontFamily: FONTS.loraBold,
    fontWeight: '600',                       // loraBold pairs with 600 (700 drops Lora on Android)
    color: TXT,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 14.5,
    lineHeight: 21,
    color: 'rgba(30,27,46,0.45)',
    fontFamily: FONTS.lato,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
