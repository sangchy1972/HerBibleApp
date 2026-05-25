import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { useNotifications, formatHHMM, type NotifKey } from '../state/NotificationsContext';
import TimePickerSheet from '../components/TimePickerSheet';
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
  const t = useT();

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
                  <Switch
                    value={cfg.enabled}
                    onValueChange={(v) => { void setEnabled(s.key, v); }}
                    trackColor={{ false: 'rgba(30,27,46,0.18)', true: ROSE }}
                    thumbColor="#FFFFFF"
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
  title: { fontSize: 22, fontWeight: '700', color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingTop: 4 },
  section: { marginBottom: 6 },
  sectionHeader: {
    backgroundColor: 'rgba(30,27,46,0.04)',
    paddingHorizontal: P,
    paddingVertical: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: TXT },
  sectionBody: { backgroundColor: '#FFFFFF' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingVertical: 18,
  },
  rowDivider: { height: 1, marginHorizontal: P, backgroundColor: 'rgba(30,27,46,0.06)' },
  rowLabel: { fontSize: 17, color: TXT },
  rowValue: { fontSize: 17, fontWeight: '700', color: TXT },
});
