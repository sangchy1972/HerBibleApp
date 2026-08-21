import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, BG, P, BTN_RADIUS, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';

// "Well Done" moment after Mark-as-Complete in the Bible reader (owner
// 2026-08-21, modeled on the competitor's screen but in our own skin): rose
// medallion, Lora title, one short Word-themed verse rotating by day, today's
// date, and a Return pill. Lives in a Modal, so the intro uses shared values
// reset at open — never `entering` (the Modal-tree rule in dev-guide).
const VERSES = [
  { refKey: 'wellDone.r1', textKey: 'wellDone.v1' },
  { refKey: 'wellDone.r2', textKey: 'wellDone.v2' },
  { refKey: 'wellDone.r3', textKey: 'wellDone.v3' },
  { refKey: 'wellDone.r4', textKey: 'wellDone.v4' },
  { refKey: 'wellDone.r5', textKey: 'wellDone.v5' },
] as const;

export default function ChapterDoneCelebration({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const badge = useSharedValue(0);
  const body = useSharedValue(0);

  // Reset-at-open (the documented sheet pattern): every show replays the
  // little bloom instead of inheriting last time's finished values.
  useEffect(() => {
    if (!visible) return;
    badge.value = 0;
    body.value = 0;
    badge.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.6)) });
    body.value = withDelay(160, withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }));
  }, [visible, badge, body]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.6 + 0.4 * badge.value }],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: body.value,
    transform: [{ translateY: 14 * (1 - body.value) }],
  }));

  const pick = VERSES[new Date().getDate() % VERSES.length];
  const dateLine = new Date().toLocaleDateString(localeFor(lang), { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.center}>
          <Animated.View style={[styles.medal, badgeStyle]}>
            <View style={styles.medalRing} />
            <Feather name="check" size={44} color="#FFFFFF" />
          </Animated.View>

          <Animated.View style={[styles.textBlock, bodyStyle]}>
            <Text style={styles.title}>{t('wellDone.title')}</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>{t('wellDone.subtitle')}</Text>
            <Text style={styles.verseRef}>{t(pick.refKey)}</Text>
            <Text style={styles.verseText}>{t(pick.textKey)}</Text>
            <Text style={styles.date}>{dateLine}</Text>
          </Animated.View>
        </View>

        <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={styles.cta}>
          <Text style={styles.ctaText}>{t('wellDone.return')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingHorizontal: P + 8, paddingBottom: 34, paddingTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  medal: {
    width: 108, height: 108, borderRadius: 54, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  medalRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 54, borderWidth: 5, borderColor: 'rgba(230,63,105,0.18)',
    transform: [{ scale: 1.16 }],
  },
  textBlock: { alignItems: 'center', marginTop: 28 },
  title: {
    fontSize: 32, color: TXT,
    fontFamily: FONTS.loraBold, fontWeight: '600',
  },
  divider: {
    width: 148, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(30,27,46,0.22)',
    marginTop: 18, marginBottom: 18,
  },
  subtitle: {
    fontSize: 19, color: TXT, textAlign: 'center',
    fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.4,
  },
  // Owner: the small text must not be small — the verse is the heart of the
  // screen, so it reads at body-plus size.
  verseRef: {
    fontSize: 15, color: TXTSUB, marginTop: 20,
    fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.5,
  },
  verseText: {
    fontSize: 18, lineHeight: 28, color: TXT, textAlign: 'center',
    fontFamily: FONTS.lora, marginTop: 8, paddingHorizontal: 10,
  },
  date: {
    fontSize: 15, color: TXTSUB, marginTop: 18,
    fontFamily: FONTS.lato, letterSpacing: 0.4,
  },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontFamily: FONTS.sansBold, fontWeight: '700', letterSpacing: 0.4 },
});
