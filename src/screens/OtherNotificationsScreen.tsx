import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { OTHER_NOTIFICATIONS } from '../state/NotificationsContext';
import { useT } from '../i18n/useT';
import type { RootStackScreenProps } from '../navigation/types';

// Read-only list of the always-on "extra" reminders (daily devotional pushes +
// win-back). No toggles, no time pickers — they're on by default and just shown
// here so the user knows what to expect (per product spec).
export default function OtherNotificationsScreen({ navigation }: RootStackScreenProps<'OtherNotifications'>) {
  const insets = useSafeAreaInsets();
  const t = useT();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('otherNotif.title')}</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]}
      >
        <Text style={styles.intro}>{t('otherNotif.intro')}</Text>

        <View style={styles.card}>
          {OTHER_NOTIFICATIONS.map((n, i) => (
            <View key={n.key}>
              {i > 0 && <View style={styles.rowDivider} />}
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <View style={styles.labelRow}>
                    <Text style={styles.rowLabel}>{t(n.labelKey)}</Text>
                    {n.time ? <Text style={styles.time}>{n.time}</Text> : null}
                  </View>
                  <Text style={styles.rowDesc}>{t(n.descKey)}</Text>
                </View>
                <View style={styles.onPill}>
                  <Text style={styles.onPillText}>{t('otherNotif.on')}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const LORA = { fontFamily: FONTS.lora } as const;
const LORA_BOLD = { fontFamily: FONTS.loraBold, fontWeight: '600' as const };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: P, paddingBottom: 14,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { ...LORA_BOLD, fontSize: 22, color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingTop: 4 },
  intro: { ...LORA, fontSize: 14, lineHeight: 20, color: TXTSUB, paddingHorizontal: P, paddingTop: 16, paddingBottom: 12 },
  card: { backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: P, paddingVertical: 16 },
  rowMain: { flex: 1, paddingRight: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { ...LORA_BOLD, fontSize: 16, color: TXT, flexShrink: 1 },
  time: { ...LORA_BOLD, fontSize: 13, color: ROSE },
  rowDesc: { ...LORA, fontSize: 13.5, lineHeight: 19, color: TXTSUB, marginTop: 3 },
  rowDivider: { height: 1, marginHorizontal: P, backgroundColor: 'rgba(30,27,46,0.06)' },
  // Static "On" pill — these reminders are always on (no toggle).
  onPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
    backgroundColor: 'rgba(232,97,154,0.12)',
  },
  onPillText: { ...LORA_BOLD, fontSize: 12.5, color: ROSE },
});
