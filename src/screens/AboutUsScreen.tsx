import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { POLICIES, SUPPORT_EMAIL } from '../constants/aboutContent';
import Logo from '../components/shared/Logo';
import { useT } from '../i18n/useT';
import type { RootStackScreenProps } from '../navigation/types';

// Four cards exposed in About: the three legal docs plus the Acknowledgments
// credit for verse explanations (Tyndale Open Study Notes + CC BY-SA 4.0).
// Order matters — legal docs first, attribution last; the narrowed id type
// matches RootStackParamList['Policy'].
type AboutPolicyId = 'terms' | 'privacy' | 'content' | 'acknowledgments';
const ITEMS: { id: AboutPolicyId; labelKey: string }[] = [
  { id: 'terms',           labelKey: 'about.row.terms'           },
  { id: 'privacy',         labelKey: 'about.row.privacy'         },
  { id: 'content',         labelKey: 'about.row.content'         },
  { id: 'acknowledgments', labelKey: 'about.row.acknowledgments' },
];

export default function AboutUsScreen({ navigation }: RootStackScreenProps<'AboutUs'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
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
        <Logo size={84} style={styles.heroLogo} />
        <Text style={styles.title}>{t('about.title')}</Text>
        <View style={styles.divider} />

        <View style={styles.list}>
          {ITEMS.map(item => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Policy', { id: item.id })}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>{t(item.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.emailBlock, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.emailIntro}>{t('about.emailIntro')}</Text>
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
  scroll: { paddingHorizontal: P + 8, paddingTop: 16 },                          // 60 → 16 — logo now sits at the top of the scroll content and provides its own visual weight, so we don't need a big offset under the back-button header
  heroLogo: {
    alignSelf: 'center',
    marginBottom: 14,                                                            // tight gap to the title — reads as a single header block
  },
  title: {
    fontSize: 23,                                                                // 26 → 23 (-12 %) — sits more harmoniously below the 84-px logo and matches the other in-app screen titles' visual weight
    fontWeight: '700',
    color: TXT,
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    alignSelf: 'center',
    width: '60%',
    height: 1,
    backgroundColor: 'rgba(30,27,46,0.18)',
    marginBottom: 32,
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
