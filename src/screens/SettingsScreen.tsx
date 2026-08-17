import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Glass from '../components/shared/Glass';
import { TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import type { RootStackScreenProps } from '../navigation/types';

type FeatherIcon = keyof typeof Feather.glyphMap;

// The app's Settings hub. Was a "coming soon" toast on the Profile row; now a
// real screen so that row leads somewhere. Notifications moved IN HERE (owner
// 2026-08-16) rather than sitting as its own top-level Profile row. Reuses the
// existing `profile.account.*` labels as-is — no new i18n keys — and the same
// row visuals as the Profile Account card so the two read as one system.
// `go` is a literal route name (only param-less routes belong here) so
// navigate(row.go) stays fully typed against RootStackParamList.
type SettingsRow = { icon: FeatherIcon; labelKey: string; go: 'Notifications' };

const ROWS: SettingsRow[] = [
  { icon: 'bell', labelKey: 'profile.account.notifications', go: 'Notifications' },
];

export default function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const insets = useSafeAreaInsets();
  const t = useT();

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
          {ROWS.map((row, i) => (
            <TouchableOpacity
              key={row.labelKey}
              style={[styles.row, i < ROWS.length - 1 && styles.rowBorder]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(row.go)}
            >
              <View style={styles.rowIcon}>
                <Feather name={row.icon} size={18} color={TXT} />
              </View>
              <Text style={styles.rowLabel}>{t(row.labelKey)}</Text>
              <Feather name="chevron-right" size={18} color={TXTSUB} />
            </TouchableOpacity>
          ))}
        </Glass>
      </ScrollView>
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
});
