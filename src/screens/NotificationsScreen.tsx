import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, AppState, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Notifications from 'expo-notifications';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useNotifications, formatHHMM, type NotifKey } from '../state/NotificationsContext';
import TimePickerSheet from '../components/TimePickerSheet';
import WideSwitch from '../components/WideSwitch';
import { useT } from '../i18n/useT';
import type { RootStackScreenProps } from '../navigation/types';

// Quiz section removed 2026-05-22 — feature not yet implemented; reviewer-
// safe to hide until the actual quiz flow ships. Restore between morning
// and plan when ready.
const SECTIONS: { key: NotifKey; titleKey: string }[] = [
  { key: 'morning', titleKey: 'notif.section.morning' },
  { key: 'night',   titleKey: 'notif.section.night'   },
  { key: 'plan',    titleKey: 'notif.section.plan'    },
];

export default function NotificationsScreen({ navigation }: RootStackScreenProps<'Notifications'>) {
  const insets = useSafeAreaInsets();
  const { settings, setEnabled, setSchedule } = useNotifications();
  const [editing, setEditing] = useState<NotifKey | null>(null);
  // OS-level permission state. null = not checked yet (don't flash the banner
  // before we know). false = the device blocks notifications, so NONE of these
  // reminders can actually be delivered no matter what the toggles say.
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const t = useT();

  const refreshPermission = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(p => setPermGranted(p.granted))
      .catch(() => setPermGranted(null));
  }, []);

  // OEM background-restriction escape hatch. Samsung (Sleeping apps), Xiaomi
  // (MIUI/HyperOS autostart + battery saver), Huawei, OPPO/vivo (ColorOS) etc.
  // each kill or defer background work on top of stock Android — which silences
  // or delays our scheduled reminders even though everything is wired correctly.
  // The Play-safe remedy is to send the user to the battery-optimization list so
  // they can mark Her Bible "unrestricted". ACTION_IGNORE_BATTERY_OPTIMIZATION_
  // SETTINGS (the list, not the direct REQUEST_ dialog) is allowed without the
  // restricted permission. sendIntent is Android-only; fall back to the app's
  // own settings page if the OEM doesn't expose that screen.
  const openBatterySettings = useCallback(() => {
    if (Platform.OS !== 'android') { Linking.openSettings().catch(() => {}); return; }
    Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')
      .catch(() => Linking.openSettings().catch(() => {}));
  }, []);

  // Check on mount, again every time the screen regains focus, and whenever the
  // app returns to the foreground — so flipping the OS switch in Settings and
  // coming back instantly clears the banner without a manual refresh.
  useEffect(() => {
    refreshPermission();
    const navSub = navigation.addListener('focus', refreshPermission);
    const appSub = AppState.addEventListener('change', s => {
      if (s === 'active') refreshPermission();
    });
    return () => { navSub(); appSub.remove(); };
  }, [navigation, refreshPermission]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('notif.title')}</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]}
      >
        {/* OS-permission banner. When the phone blocks notifications, the
            in-app toggles are cosmetic — nothing can be delivered — so we
            surface that plainly and give a one-tap route into system Settings
            to actually turn the OS notification permission on. */}
        {permGranted === false && (
          <TouchableOpacity
            style={styles.banner}
            activeOpacity={0.85}
            onPress={() => Linking.openSettings().catch(() => {})}
          >
            <Feather name="bell-off" size={20} color={ROSE} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>{t('notif.permBanner.title')}</Text>
              <Text style={styles.bannerBody}>{t('notif.permBanner.body')}</Text>
              <View style={styles.bannerCtaRow}>
                <Text style={styles.bannerCta}>{t('common.openSettings')}</Text>
                <Feather name="chevron-right" size={16} color={ROSE} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* OEM background-restriction helper (Android only). Even with the OS
            permission granted, Samsung/Xiaomi/Huawei/OPPO/vivo background limits
            can delay or drop reminders — surface a one-tap route to mark the app
            "unrestricted" so the pull-back flow actually fires on time. */}
        {Platform.OS === 'android' && (
          <TouchableOpacity
            style={styles.reliabilityCard}
            activeOpacity={0.85}
            onPress={openBatterySettings}
          >
            <Feather name="battery-charging" size={20} color={ROSE} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>{t('notif.reliability.title')}</Text>
              <Text style={styles.bannerBody}>{t('notif.reliability.body')}</Text>
              <View style={styles.bannerCtaRow}>
                <Text style={styles.bannerCta}>{t('notif.reliability.cta')}</Text>
                <Feather name="chevron-right" size={16} color={ROSE} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {SECTIONS.map(s => {
          const cfg = settings[s.key];
          return (
            <View key={s.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t(s.titleKey)}</Text>
              </View>
              <View style={styles.sectionBody}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('notif.row.activated')}</Text>
                  <WideSwitch
                    value={cfg.enabled}
                    onValueChange={(v) => {
                      // setEnabled runs the permission flow; refresh our banner
                      // state afterward so granting/denying reflects immediately.
                      void setEnabled(s.key, v).finally(refreshPermission);
                    }}
                  />
                </View>
                <View style={styles.rowDivider} />
                <TouchableOpacity
                  onPress={() => setEditing(s.key)}
                  style={styles.row}
                  activeOpacity={0.7}
                  disabled={!cfg.enabled}
                >
                  <Text style={[styles.rowLabel, !cfg.enabled && { color: TXTSUB }]}>{t('notif.row.schedule')}</Text>
                  <Text style={[styles.rowValue, !cfg.enabled && { color: TXTSUB }]}>
                    {formatHHMM(cfg.hour, cfg.minute)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {editing && (
        <TimePickerSheet
          initialHour={settings[editing].hour}
          initialMinute={settings[editing].minute}
          title={t('notif.sheet.scheduleTitle', { section: t(SECTIONS.find(s => s.key === editing)?.titleKey ?? '') })}
          onConfirm={(h, m) => { setSchedule(editing, h, m); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

// Lora throughout, per design. NOTE (project memory): FONTS.loraBold must pair
// with fontWeight '600' — at '700' Android drops Lora and falls back to system
// sans. Regular copy uses FONTS.lora with the default weight.
const LORA = { fontFamily: FONTS.lora } as const;
const LORA_BOLD = { fontFamily: FONTS.loraBold, fontWeight: '600' as const };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingBottom: 14,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { ...LORA_BOLD, fontSize: 22, color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingTop: 4 },

  // Permission banner.
  banner: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginHorizontal: P,
    marginTop: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(232,97,154,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,97,154,0.22)',
  },
  bannerTitle: { ...LORA_BOLD, fontSize: 16, color: TXT },
  bannerBody: { ...LORA, fontSize: 14, lineHeight: 20, color: TXTSUB, marginTop: 3 },
  bannerCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  bannerCta: { ...LORA_BOLD, fontSize: 14, color: ROSE },
  // Same visual language as the permission banner but in a calmer neutral tint —
  // it's helpful guidance, not an error state.
  reliabilityCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginHorizontal: P,
    marginTop: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(30,27,46,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.10)',
  },

  section: { marginBottom: 6 },
  sectionHeader: {
    backgroundColor: 'rgba(30,27,46,0.04)',
    paddingHorizontal: P,
    paddingVertical: 14,
  },
  sectionTitle: { ...LORA_BOLD, fontSize: 18, color: TXT },
  sectionBody: { backgroundColor: '#FFFFFF' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingVertical: 18,
  },
  rowDivider: { height: 1, marginHorizontal: P, backgroundColor: 'rgba(30,27,46,0.06)' },
  rowLabel: { ...LORA, fontSize: 17, color: TXT },
  rowValue: { ...LORA_BOLD, fontSize: 17, color: TXT },
});
