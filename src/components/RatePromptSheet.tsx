import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Image, Pressable, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as StoreReview from 'expo-store-review';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { TXT, ROSE, BTN_RADIUS, FONTS } from '../constants/theme';
import { useRatePrompt } from '../state/RatePromptContext';
import { useT } from '../i18n/useT';

// Bottom-sheet rate prompt (slides up from the bottom). Shown on the HOME
// screen by RatePromptHost — never over the prayer-end scene anymore, so the
// praying-hands Lottie can no longer bleed through behind it.
const EMOJI = require('../../assets/rate-emoji.png');
// How far the sheet starts below its resting position.
const SHEET_TRAVEL = 420;

export default function RatePromptSheet({ onClose }: { onClose: () => void }) {
  const { markYes, markNo, markRated } = useRatePrompt();
  const t = useT();
  const insets = useSafeAreaInsets();

  // Shared-value entrance (see the note in the JSX for why this cannot be
  // `entering=`). The watchdog snaps the sheet into place if the timing is
  // dropped, so a saturated UI thread can never leave it off-screen.
  const dim = useSharedValue(0);
  const ty = useSharedValue(SHEET_TRAVEL);
  useEffect(() => {
    dim.value = withTiming(1, { duration: 250 });
    ty.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
    const wd = setTimeout(() => { dim.value = 1; ty.value = 0; }, 900);
    return () => clearTimeout(wd);
  }, [dim, ty]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  const onYes = () => {
    markYes();
    // Dismiss OUR sheet first: it's an RN Modal (its own native window), and
    // the Play in-app review panel attaches to the Activity BELOW it — firing
    // the request while our Modal is up leaves Google's sheet hidden behind
    // it / unable to present. Classic RN + ReviewManager pitfall.
    onClose();
    setTimeout(async () => {
      try {
        // Play in-app review (Android) / SKStoreReview (iOS). NOTE: the Play
        // dialog only actually renders when the app was INSTALLED BY the Play
        // Store for this account (internal-testing installs count; sideloads
        // "succeed" silently by design) and Play quota-caps how often it shows.
        if (await StoreReview.isAvailableAsync()) {
          await StoreReview.requestReview();
          markRated();
        } else {
          // No in-app dialog on this install (no Play Store, dev build, iOS
          // simulator) — open the store listing instead so Yes is never a
          // dead end.
          const url = Platform.OS === 'android'
            ? 'market://details?id=com.holy.bible.kjv.audio.prayer'
            : StoreReview.storeUrl();
          if (url) await Linking.openURL(url);
          markRated();
        }
      } catch { /* never block the user */ }
    }, 400);
  };

  const onNo = () => { markNo(); onClose(); };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {/* CRITICAL: entrances are driven by SHARED VALUES, never `entering=`.
            Reanimated LAYOUT animations do not reliably run inside an RN Modal
            on the new architecture (see CommentsSheet + PrayerFlow, which hit
            this before) — and a Modal is a native window that swallows every
            touch in the app. When these two `entering` animations didn't run,
            this sheet was up over the whole app with 100% transparent content
            and NO touch target anywhere: home rendered perfectly and nothing
            responded, with no escape on iOS at all. `useAnimatedStyle` DOES
            work inside a Modal, so that is what we use.
            The dismiss Pressable also sits OUTSIDE any animated wrapper now,
            so even a total animation failure leaves a blind tap that closes. */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.dim, dimStyle]} pointerEvents="none" />

        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 20 }, sheetStyle]}
        >
          {/* Emoji badge — a white disc overlapping the sheet's top edge with
              the sparkly smiley on top (sparkles overflow the disc). */}
          <View style={styles.emojiWrap} pointerEvents="none">
            <View style={styles.emojiCircle} />
            <Image source={EMOJI} style={styles.emojiImg} resizeMode="contain" />
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10} activeOpacity={0.7}>
            <Feather name="x" size={20} color="rgba(30,27,46,0.45)" />
          </TouchableOpacity>

          <Text style={styles.title}>{t('rate.title')}</Text>
          <Text style={styles.body}>{t('rate.body')}</Text>

          <TouchableOpacity onPress={onYes} activeOpacity={0.9} style={[styles.btn, styles.btnYes]}>
            <Text style={styles.btnText}>{t('rate.yes')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNo} activeOpacity={0.9} style={[styles.btn, styles.btnNo]}>
            <Text style={styles.btnText}>{t('rate.no')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(20,16,28,0.5)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 62,
    paddingHorizontal: 24,
  },
  // 132-wide box floating half above the sheet's top edge.
  emojiWrap: {
    position: 'absolute', top: -58, alignSelf: 'center',
    width: 132, height: 132, alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  // 84 → 100.8 (+20 % per user); offsets recentered so the disc keeps the same
  // midpoint under the emoji (center 66, 79 of the 132 box).
  emojiCircle: {
    position: 'absolute', left: 15.6, top: 28.6, width: 100.8, height: 100.8, borderRadius: 50.4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 4,
  },
  emojiImg: { width: 132, height: 132 },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.05)',
  },
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 22, color: TXT,
    textAlign: 'center', lineHeight: 30, marginBottom: 8, paddingHorizontal: 8,
  },
  body: {
    fontFamily: FONTS.lato, fontSize: 15, color: 'rgba(30,27,46,0.55)',
    textAlign: 'center', lineHeight: 22, marginBottom: 24,
  },
  // Two stacked full-width CTAs in the brand rose — no shadow (per user).
  btn: { height: 54, borderRadius: BTN_RADIUS, alignItems: 'center', justifyContent: 'center', backgroundColor: ROSE },
  btnYes: {},
  btnNo: { marginTop: 12 },
  btnText: { color: '#FFFFFF', fontFamily: FONTS.sansBold, fontWeight: '700', fontSize: 18, letterSpacing: 0.4 },
});
