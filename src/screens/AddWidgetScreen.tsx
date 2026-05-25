import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import WidgetPreview from '../components/WidgetPreview';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useT } from '../i18n/useT';
import { requestPin as requestPinWidget, isPinSupported } from '../../modules/expo-pin-widget';
import { WIDGET_VERSE_KEY } from '../../widgets/widget-task-handler';
import { VerseOfDayWidget } from '../../widgets/VerseOfDayWidget';
import type { RootStackScreenProps } from '../navigation/types';

export default function AddWidgetScreen({ navigation }: RootStackScreenProps<'AddWidget'>) {
  const insets = useSafeAreaInsets();
  const { getVerse, todayDay } = useDailyVerses();
  const t = useT();

  const onInstall = async () => {
    // Day's verse — default to morning segment so a freshly pinned widget
    // never lands blank. Persisted to WIDGET_VERSE_KEY so the widget's task
    // handler can re-read it the next time Android renders the widget.
    const segment: 'morning' | 'evening' =
      new Date().getHours() < 16 ? 'morning' : 'evening';
    const dailyVerse = getVerse(todayDay, segment);
    if (dailyVerse) {
      try {
        await AsyncStorage.setItem(WIDGET_VERSE_KEY, JSON.stringify({
          verse: dailyVerse.modernText,
          reference: dailyVerse.reference.full_reference,
        }));
      } catch {}
    }
    // Refresh any already-pinned instance with the latest verse so the user
    // immediately sees the right content after pinning.
    try {
      await requestWidgetUpdate({
        widgetName: 'verseOfDay',
        renderWidget: (info) => (
          <VerseOfDayWidget
            verse={dailyVerse?.modernText ?? null}
            reference={dailyVerse?.reference.full_reference ?? null}
            cellWidth={Math.max(2, Math.round(info.width / 70))}
            cellHeight={Math.max(1, Math.round(info.height / 70))}
          />
        ),
      });
    } catch {}
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

        {/* All three previews share the same cell size, so 2×2 / 4×2 / 5×2
            render at proportional widths — exactly how they'd lay out next to
            each other on a real home screen. Cell size scales with screen
            width so 5×2 always fits even on iPhone SE. */}
        {(() => {
          const screenW = Dimensions.get('window').width;
          const cellSize = Math.min(70, Math.floor((screenW - 56) / 5));
          return (
            <>
              <View style={styles.previewBlock}>
                <SizeLabel text={t('addWidget.size.small')} />
                <View style={styles.previewCenter}>
                  <WidgetPreview size="2x2" width={cellSize * 2} />
                </View>
              </View>

              <View style={styles.previewBlock}>
                <SizeLabel text={t('addWidget.size.medium')} />
                <View style={styles.previewCenter}>
                  <WidgetPreview size="4x2" width={cellSize * 4} />
                </View>
              </View>

              <View style={styles.previewBlock}>
                <SizeLabel text={t('addWidget.size.wide')} />
                <View style={styles.previewCenter}>
                  <WidgetPreview size="5x2" width={cellSize * 5} />
                </View>
              </View>
            </>
          );
        })()}

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>{t('addWidget.howTitle')}</Text>
          <Step n={1} text={t('addWidget.step1')} />
          <Step n={2} text={t('addWidget.step2')} />
          <Step n={3} text={t('addWidget.step3')} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={onInstall} activeOpacity={0.85} style={styles.installBtn}>
          <Text style={styles.installText}>{t('addWidget.installBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLater} hitSlop={10} style={styles.laterBtn}>
          <Text style={styles.laterText}>{t('addWidget.laterBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SizeLabel({ text }: { text: string }) {
  return <Text style={styles.sizeLabel}>{text}</Text>;
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
  sizeLabel: { fontSize: 13, fontWeight: '700', color: TXTSUB, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
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
});
