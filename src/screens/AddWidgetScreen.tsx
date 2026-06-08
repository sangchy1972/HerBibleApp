import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, Dimensions, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import WidgetPreview from '../components/WidgetPreview';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useDailyVerses } from '../state/DailyVersesContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useT } from '../i18n/useT';
import { requestPin as requestPinWidget, isPinSupported } from '../../modules/expo-pin-widget';
import { syncVerseWidget } from '../../widgets/syncVerseWidget';
import type { RootStackScreenProps } from '../navigation/types';

export default function AddWidgetScreen({ navigation }: RootStackScreenProps<'AddWidget'>) {
  const insets = useSafeAreaInsets();
  const { getVerse, todayDay } = useDailyVerses();
  const prayerBg = usePrayerBackgrounds();
  const t = useT();
  // Preview reflects the live widget: same clock→segment rule (evening after
  // 6 pm / before 4 am), same verse + same card background.
  const hr = new Date().getHours();
  const previewSegment: 'morning' | 'evening' = hr >= 18 || hr < 4 ? 'evening' : 'morning';
  const previewVerse = getVerse(todayDay, previewSegment);
  // Pretty in-app confirmation BEFORE invoking the OS pin dialog — gives the
  // user a heads-up that matches our UI (the system dialog that follows is the
  // launcher's own, which is what keeps this Google-Play-compliant).
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onInstall = async () => {
    setConfirmOpen(false);
    // Seed both segments of today's verse so a freshly pinned widget never
    // lands blank and can switch morning⇄evening by clock on its own. This
    // also refreshes any already-pinned instance immediately.
    const m = getVerse(todayDay, 'morning');
    const e = getVerse(todayDay, 'evening');
    await syncVerseWidget({
      morning: m ? { verse: m.modernText, reference: m.reference.full_reference } : null,
      evening: e ? { verse: e.modernText, reference: e.reference.full_reference } : null,
      amenLabel: t('widget.amen'),
    });
    // One-tap pin via AppWidgetManager.requestPinAppWidget (Android 8+, supported
    // launchers). Defaults to the verseOfDay provider, which is registered as a
    // 4×2 cell in widgetprovider_verseofday.xml.
    const pinned = isPinSupported() ? await requestPinWidget() : false;
    if (!pinned) {
      Alert.alert(
        t('prayer.widget.add.title'),
        Platform.OS === 'android'
          ? t('prayer.widget.add.bodyAndroid')
          : t('prayer.widget.add.bodyIos'),
      );
    }
  };

  const onLater = () => navigation.goBack();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} hitSlop={10}>
          <Feather name="x" size={20} color={TXT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 140 }]}
      >
        <Text style={styles.title}>{t('addWidget.title')}</Text>
        <Text style={styles.body}>{t('addWidget.body')}</Text>

        {/* Live 4×2 preview — the exact verse + background the widget will
            show (same as the home-screen hero card). */}
        <View style={styles.previewBlock}>
          <View style={styles.previewCenter}>
            <WidgetPreview
              size="4x2"
              width={Math.min(Dimensions.get('window').width - 48, 360)}
              body={previewVerse?.modernText}
              reference={previewVerse?.reference.full_reference}
              segment={previewSegment}
              bgSource={prayerBg.imageFor(previewSegment)}
            />
          </View>
        </View>

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>{t('addWidget.howTitle')}</Text>
          <Step n={1} text={t('addWidget.step1')} />
          <Step n={2} text={t('addWidget.step2')} />
          <Step n={3} text={t('addWidget.step3')} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 15 }]}>
        <TouchableOpacity onPress={() => setConfirmOpen(true)} activeOpacity={0.85} style={styles.installBtn}>
          <Text style={styles.installText}>{t('addWidget.installBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLater} hitSlop={10} style={styles.laterBtn}>
          <Text style={styles.laterText}>{t('addWidget.laterBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Confirm sheet — branded rationale before the OS pin dialog. */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.mOverlay}>
          <View style={styles.mCard}>
            <View style={styles.mIcon}>
              <Feather name="grid" size={26} color={ROSE} />
            </View>
            <Text style={styles.mTitle}>{t('addWidget.confirm.title')}</Text>
            <Text style={styles.mBody}>{t('addWidget.confirm.body')}</Text>
            <View style={styles.mActions}>
              <TouchableOpacity onPress={() => setConfirmOpen(false)} style={styles.mCancel} activeOpacity={0.8}>
                <Text style={styles.mCancelText}>{t('addWidget.confirm.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onInstall} style={styles.mAdd} activeOpacity={0.85}>
                <Text style={styles.mAddText}>{t('addWidget.confirm.add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: P,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  scroll: { paddingHorizontal: P + 4, paddingTop: 0 },                          // 12 → 0 (was 12, -20 px overall after also dropping closeBtn padding)  // top breathing room comes from the header below
  title: {
    fontSize: 26,
    fontWeight: '600',                                                           // loraBold + 600 — never 700 (Android Lora_700Bold + fontWeight 700 falls back to system sans)
    fontFamily: FONTS.loraBold,
    color: TXT,
    lineHeight: 34,
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: TXTSUB,
    marginBottom: 22,
  },
  previewBlock: { marginBottom: 22 },
  previewCenter: { alignItems: 'center' },
  howCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.06)',
    marginTop: 4,
  },
  howTitle: { fontSize: 17, fontWeight: '700', color: TXT, marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21, color: TXT },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 4, paddingTop: 12,
    backgroundColor: '#FBF7F6',
    borderTopWidth: 1, borderTopColor: 'rgba(30,27,46,0.06)',
  },
  installBtn: {
    // Mirrors PrayerScreen.startBtn 1:1 — same height + radius so this CTA
    // reads as the same primary button as "Start Morning Prayer".
    height: 47.06,
    borderRadius: 24.39,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  laterBtn: { paddingVertical: 12, alignItems: 'center' },
  laterText: { color: ROSE, fontSize: 16, fontWeight: '600' },

  // Confirm modal — centered branded card.
  mOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,12,24,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  mCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  mIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: `${ROSE}16`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  mTitle: {
    fontSize: 20,
    fontWeight: '600',                 // loraBold + 600 (never 700 on Android)
    fontFamily: FONTS.loraBold,
    color: TXT,
    textAlign: 'center',
    marginBottom: 8,
  },
  mBody: {
    fontSize: 14.5,
    lineHeight: 21,
    color: TXTSUB,
    textAlign: 'center',
    fontFamily: FONTS.lato,
    marginBottom: 20,
  },
  mActions: { flexDirection: 'row', alignSelf: 'stretch', gap: 10 },
  mCancel: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  mCancelText: { color: TXTSUB, fontSize: 15.5, fontWeight: '700', fontFamily: FONTS.latoBold },
  mAdd: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ROSE,
  },
  mAddText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700', fontFamily: FONTS.latoBold },
});
