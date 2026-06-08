import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { HELP_ITEMS, SUPPORT_EMAIL } from '../constants/helpContent';
import { useT } from '../i18n/useT';
import type { RootStackScreenProps } from '../navigation/types';

const NOTO_REG = 'Lato_400Regular';   // Noto Sans SC no longer bundled; Latin → Lato, CJK → system font
const NOTO_BOLD = 'Lato_700Bold';

export default function HelpCenterScreen({ navigation }: RootStackScreenProps<'HelpCenter'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const onContact = () => {
    const subject = encodeURIComponent('Her Bible support');
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('help.title')}</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
      >
        {HELP_ITEMS.map((item, i) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => navigation.navigate('HelpAnswer', { id: item.id })}
            activeOpacity={0.85}
            style={[styles.row, i < HELP_ITEMS.length - 1 && styles.rowBorder]}
          >
            <Text style={styles.rowText}>{t(item.questionKey)}</Text>
            <Feather name="chevron-right" size={20} color={TXTSUB} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* +20 px bottom clearance per user — the CTA sat too close to the screen edge. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
        <TouchableOpacity onPress={onContact} activeOpacity={0.85} style={styles.contactBtn}>
          <Feather name="edit-3" size={20} color="#FFFFFF" />
          <Text style={styles.contactText}>{t('help.contactUs')}</Text>
        </TouchableOpacity>
      </View>
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
  title: { fontSize: 22, fontFamily: NOTO_BOLD, color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingHorizontal: P + 4, paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 22,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  rowText: {
    flex: 1,
    fontSize: 17,
    fontFamily: NOTO_REG,
    color: TXT,
    paddingRight: 14,
  },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 4, paddingTop: 12,
    backgroundColor: '#FBF7F6',
  },
  contactBtn: {
    backgroundColor: ROSE,
    borderRadius: 22.4,                  // 28 → 22.4 (-20 % per user)
    paddingVertical: 13.2,               // 16 → 13.2 — total button height ≈ 56 → 50.4 (-10 % per user)
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  contactText: { color: '#FFFFFF', fontSize: 18, fontFamily: NOTO_BOLD },
});
