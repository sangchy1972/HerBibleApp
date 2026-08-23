import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSheetPan, SheetBackdrop } from './shared/sheetPan';
import { useSheetSurface } from '../state/promptSurface';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import WideSwitch from './WideSwitch';
import {
  canDrawOverlays, openOverlaySettings,
  isMiuiDevice, openMiuiPermissionEditor, miuiBackgroundPopupAllowed,
} from '../../modules/expo-overlay-cards';
import {
  getOverlayCardsEnabled, setOverlayCardsEnabled, subscribeOverlayCardsEnabled,
} from '../state/overlayCardsPrefs';
import { useT } from '../i18n/useT';

// The overlay-cards mini settings sheet (owner 2026-08-16): a permanent entry
// whose PRIMARY job is reminding users who never enabled the daily screen cards
// to turn them on — and, once on, giving them the manual off switch. Two
// permission steps render as status rows: "Appear on top" for everyone, plus
// Xiaomi's own "background pop-up" gate on MIUI devices only.
// Moved out of ProfileScreen 2026-08-22 — the row now lives on Settings.
export default function OverlayCardsSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const pan = useSheetPan(onClose, true);
  // Register with the prompt-surface gate so a nudge can't ambush the sheet.
  useSheetSurface(true);
  const enabled = useSyncExternalStore(subscribeOverlayCardsEnabled, getOverlayCardsEnabled);
  const [granted, setGranted] = useState(() => canDrawOverlays());
  const [miuiOk, setMiuiOk] = useState<boolean | null>(() => (isMiuiDevice() ? miuiBackgroundPopupAllowed() : true));
  // Both grants happen in system settings — the return foreground is the only
  // moment we can learn the outcome and flip the status rows.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') {
        setGranted(canDrawOverlays());
        if (isMiuiDevice()) setMiuiOk(miuiBackgroundPopupAllowed());
      }
    });
    return () => sub.remove();
  }, []);

  const stepRow = (label: string, done: boolean, onPress: () => void, last: boolean) => (
    <TouchableOpacity
      style={[styles.stepRow, !last && styles.stepBorder]}
      activeOpacity={done ? 1 : 0.7}
      onPress={() => { if (!done) onPress(); }}
    >
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={[styles.stepState, !done && { color: ROSE }]}>
        {t(done ? 'overlayCards.on' : 'overlayCards.off')}
      </Text>
      {!done && <Feather name="chevron-right" size={18} color={TXTSUB} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.overlay}>
      <SheetBackdrop onClose={onClose} />
      <GestureDetector gesture={pan.gesture}>
        <Animated.View style={[styles.sheet, pan.sheetStyle]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('overlayCards.row')}</Text>
          <Text style={styles.desc}>{t('nudge.overlay.body')}</Text>
          <View style={[styles.stepRow, styles.stepBorder]}>
            <Text style={styles.stepLabel}>{t('overlayCards.master')}</Text>
            <WideSwitch value={enabled} onValueChange={setOverlayCardsEnabled} />
          </View>
          {stepRow(t('overlayCards.stepSaw'), granted, () => { openOverlaySettings(); }, !isMiuiDevice())}
          {/* miuiOk === null (unknowable) deliberately renders as not-done: the
              worst outcome of that guess is one redundant trip to a page where
              everything is already on. */}
          {isMiuiDevice() && stepRow(t('overlayCards.stepMiui'), miuiOk === true, () => { openMiuiPermissionEditor(); }, true)}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Values mirror the Profile sheet family (pickerOverlay/pickerSheet/…) so the
// sheet reads identical wherever it opens from.
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: P,
    paddingTop: 14,
    paddingBottom: 36,
  },
  handle: {
    width: 50,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center',
    marginTop: -7,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: TXT,
    marginBottom: 14,
    marginTop: 12,
  },
  desc: { fontSize: 14, lineHeight: 20.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.3, marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, gap: 8 },
  stepBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.05)',
  },
  stepLabel: { flex: 1, fontSize: 15.5, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.3 },
  stepState: { fontSize: 14, color: TXTSUB, fontWeight: '600' },
});
