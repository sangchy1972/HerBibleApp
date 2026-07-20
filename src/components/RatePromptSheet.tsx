import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Image, Pressable, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as StoreReview from 'expo-store-review';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { TXT, ROSE, BTN_RADIUS, FONTS } from '../constants/theme';
import { useRatePrompt } from '../state/RatePromptContext';
import { useT } from '../i18n/useT';

// Bottom-sheet rate prompt (slides up from the bottom). Shown on the HOME
// screen by RatePromptHost — never over the prayer-end scene anymore, so the
// praying-hands Lottie can no longer bleed through behind it.
const EMOJI = require('../../assets/rate-emoji.png');

export default function RatePromptSheet({ onClose }: { onClose: () => void }) {
  const { markYes, markNo, markRated } = useRatePrompt();
  const t = useT();
  const insets = useSafeAreaInsets();

  const onYes = async () => {
    markYes();
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
    onClose();
  };

  const onNo = () => { markNo(); onClose(); };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        <Animated.View entering={FadeIn.duration(250)} style={[StyleSheet.absoluteFillObject, styles.dim]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(380).easing(Easing.out(Easing.cubic))}
          style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
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
