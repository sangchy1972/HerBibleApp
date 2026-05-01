import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { POLICIES, SUPPORT_EMAIL, type PolicyId } from '../constants/aboutContent';
import type { RootStackScreenProps } from '../navigation/types';

const ITEMS: { id: PolicyId; label: string }[] = [
  { id: 'terms',   label: 'Terms of Service' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'content', label: 'Content Policy' },
];

export default function AboutUsScreen({ navigation }: RootStackScreenProps<'AboutUs'>) {
  const insets = useSafeAreaInsets();
  const onEmail = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>About Us</Text>
        <View style={styles.divider} />

        <View style={styles.list}>
          {ITEMS.map(item => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Policy', { id: item.id })}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.emailBlock, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.emailIntro}>For any other suggestions or issues, our email is:</Text>
          <TouchableOpacity onPress={onEmail} hitSlop={6}>
            <Text style={styles.emailLink}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// Pull POLICIES into the bundle so the dynamic require can be tree-shaken.
void POLICIES;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  scroll: { paddingHorizontal: P + 8, paddingTop: 60 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: TXT,
    textAlign: 'center',
    marginBottom: 14,
  },
  divider: {
    alignSelf: 'center',
    width: '60%',
    height: 1,
    backgroundColor: 'rgba(30,27,46,0.18)',
    marginBottom: 36,
  },
  list: { gap: 18 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardLabel: { fontSize: 18, fontWeight: '600', color: TXT },
  emailBlock: { marginTop: 32, alignItems: 'center', paddingHorizontal: 16 },
  emailIntro: { fontSize: 14, color: TXTSUB, textAlign: 'center', marginBottom: 6 },
  emailLink: { fontSize: 15, color: ROSE, fontWeight: '600', textDecorationLine: 'underline' },
});
