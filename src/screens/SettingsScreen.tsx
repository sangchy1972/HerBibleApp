import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import Glass from '../components/shared/Glass';
import LanguageBibleSheet from '../components/LanguageBibleSheet';
import OverlayCardsSheet from '../components/OverlayCardsSheet';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useTranslation } from '../state/TranslationsContext';
import { overlayCardsSupported, canDrawOverlays } from '../../modules/expo-overlay-cards';
import {
  getOverlayCardsEnabled, hydrateOverlayCardsEnabled, subscribeOverlayCardsEnabled,
} from '../state/overlayCardsPrefs';
import type { RootStackScreenProps } from '../navigation/types';

// The app's Settings hub. Was a "coming soon" toast on the Profile row; now a
// real screen so that row leads somewhere. Notifications moved IN HERE (owner
// 2026-08-16); Bible versions + the daily overlay cards followed (owner
// 2026-08-22), so the Profile Account card keeps only navigation rows. Reuses
// the existing `profile.account.*` / `overlayCards.*` labels as-is — no new
// i18n keys — and the same row visuals as the Profile Account card so the two
// read as one system.
export default function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { current: currentTranslation } = useTranslation();

  const [showLangSheet, setShowLangSheet] = useState(false);
  const [showOverlaySheet, setShowOverlaySheet] = useState(false);

  // Overlay-cards row status. The master switch comes straight from its store;
  // the system grant lives in OS settings, so it is re-read on the foreground
  // that follows a settings trip (and when the sheet closes).
  const overlayEnabled = useSyncExternalStore(subscribeOverlayCardsEnabled, getOverlayCardsEnabled);
  const [overlayGranted, setOverlayGranted] = useState(() => canDrawOverlays());
  useEffect(() => { void hydrateOverlayCardsEnabled(); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') setOverlayGranted(canDrawOverlays());
    });
    return () => sub.remove();
  }, []);

  // Minimal toast (same chrome as Profile's version toast) — hosts the
  // "Bible downloading in the background" notice from the language sheet.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, ms = 2000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const overlayOn = overlayGranted && overlayEnabled;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.account.settings')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Glass style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Notifications')}
          >
            <View style={styles.rowIcon}>
              <Feather name="bell" size={18} color={TXT} />
            </View>
            <Text style={styles.rowLabel}>{t('profile.account.notifications')}</Text>
            <Feather name="chevron-right" size={18} color={TXTSUB} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, overlayCardsSupported() && styles.rowBorder]}
            activeOpacity={0.7}
            onPress={() => setShowLangSheet(true)}
          >
            <View style={styles.rowIcon}>
              <Feather name="globe" size={18} color={TXT} />
            </View>
            <Text style={styles.rowLabel}>{t('profile.account.bibleVersions')}</Text>
            <Text style={styles.rowValue}>{currentTranslation.nativeName}</Text>
            <Feather name="chevron-right" size={18} color={TXTSUB} />
          </TouchableOpacity>

          {/* Daily overlay cards — the permanent entry whose main job is
              reminding users who never enabled them (owner 2026-08-16). Status
              text goes ROSE while off, so the row itself does the inviting. */}
          {overlayCardsSupported() && (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => setShowOverlaySheet(true)}
            >
              <View style={styles.rowIcon}>
                <Feather name="layers" size={18} color={TXT} />
              </View>
              <Text style={styles.rowLabel}>{t('overlayCards.row')}</Text>
              <Text style={[styles.rowValue, !overlayOn && { color: ROSE }]}>
                {t(overlayOn ? 'overlayCards.on' : 'overlayCards.off')}
              </Text>
              <Feather name="chevron-right" size={18} color={TXTSUB} />
            </TouchableOpacity>
          )}
        </Glass>
      </ScrollView>

      {toast && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={[styles.toast, { top: insets.top + 12 }]}
        >
          <Feather name="check-circle" size={18} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      {showLangSheet && (
        <LanguageBibleSheet onClose={() => setShowLangSheet(false)} onToast={showToast} />
      )}
      {showOverlaySheet && (
        <OverlayCardsSheet
          onClose={() => { setShowOverlaySheet(false); setOverlayGranted(canDrawOverlays()); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  scroll: { paddingHorizontal: P + 4, paddingTop: 16 },
  card: { borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(30,27,46,0.06)' },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15.5, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.3 },
  rowValue: { fontSize: 14, color: TXTSUB, marginRight: 2, maxWidth: 120 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: 'rgba(20,16,28,0.9)',
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
