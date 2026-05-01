import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';

// Drop your hero artwork at assets/paywall-hero.png and uncomment.
const HERO_SOURCE: number | null = null;
// const HERO_SOURCE = require('../../assets/paywall-hero.png');

type PlanId = 'lifetime' | 'annual' | 'monthly';

interface Plan {
  id: PlanId;
  label: string;
  priceLine: string;
  bestValue?: boolean;
  hint?: string;
}

// Real prices come from the StoreKit / Play Billing product IDs. These are
// just display strings until the IAP layer is wired up.
const PLANS: Plan[] = [
  { id: 'lifetime', label: 'Lifetime',  priceLine: 'NT$670 one-time payment',  bestValue: true, hint: 'Pay once · keep forever' },
  { id: 'annual',   label: 'Annual',    priceLine: 'NT$420 / year',  hint: 'Save 58%' },
  { id: 'monthly',  label: 'Monthly',   priceLine: 'NT$84 / month' },
];

export default function RemoveAdsScreen({ navigation }: RootStackScreenProps<'RemoveAds'>) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PlanId>('lifetime');

  const onSubscribe = () => {
    // TODO: integrate expo-in-app-purchases (or react-native-iap) and trigger
    // the purchase flow for the chosen product. Until then we surface a clear
    // placeholder so testers can confirm the wiring without crashing.
    const plan = PLANS.find(p => p.id === selected);
    Alert.alert(
      'Subscriptions coming soon',
      `Once StoreKit / Play Billing is wired up, this will purchase the ${plan?.label} plan (${plan?.priceLine}).`,
    );
  };

  const onRestore = () => {
    Alert.alert('Restore purchases', 'Once IAP is wired, this will restore any active subscription tied to your store account.');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.closeBtn}>
          <Feather name="x" size={20} color={TXT} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRestore} hitSlop={10}>
          <Text style={styles.restore}>Restore</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 130 }]}
      >
        <Hero />

        <Text style={styles.title}>Reading without distractions</Text>
        <Text style={styles.body}>
          Subscribe and turn off all in-app ads, unlock early access to new study tools,
          and support the team building Her Bible.
        </Text>

        <View style={styles.featureRow}>
          <Feature label="No ads" />
          <Feature label="Early access" />
          <Feature label="Future features" />
        </View>

        <View style={styles.planList}>
          {PLANS.map(p => (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.85}
              onPress={() => setSelected(p.id)}
              style={[styles.planCard, selected === p.id && styles.planCardActive]}
            >
              <View style={styles.planRadio}>
                {selected === p.id && <View style={styles.planRadioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.planHeaderRow}>
                  <Text style={styles.planLabel}>{p.label}</Text>
                  {p.bestValue && (
                    <View style={styles.badgeBest}>
                      <Text style={styles.badgeBestText}>Best value</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planPrice}>{p.priceLine}</Text>
                {p.hint && <Text style={styles.planHint}>{p.hint}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.disclaimer}>
          Subscriptions auto-renew until cancelled. You can manage or cancel anytime from your store account.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={onSubscribe} activeOpacity={0.85} style={styles.cta}>
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://example.com/terms')}><Text style={styles.legal}>Terms</Text></TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://example.com/privacy')}><Text style={styles.legal}>Privacy</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function Hero() {
  if (HERO_SOURCE) {
    return <ImageBackground source={HERO_SOURCE} style={styles.hero} resizeMode="contain" />;
  }
  return (
    <LinearGradient
      colors={[`${ROSE}26`, `${LAV}26`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroRing}>
        <Feather name="heart" size={42} color={ROSE} />
      </View>
      <View style={styles.heroPlaceholderRow} pointerEvents="none">
        <Feather name="image" size={14} color={TXTSUB} />
        <Text style={styles.heroPlaceholderText}>assets/paywall-hero.png</Text>
      </View>
    </LinearGradient>
  );
}

function Feature({ label }: { label: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureCheck}><Feather name="check" size={14} color="#FFFFFF" /></View>
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  restore: { color: ROSE, fontSize: 16, fontWeight: '700', paddingHorizontal: 6 },

  scroll: { paddingHorizontal: P + 4, paddingTop: 16 },

  hero: {
    height: 220,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 18,
  },
  heroRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
    elevation: 4,
  },
  heroPlaceholderRow: {
    position: 'absolute', bottom: 14, flexDirection: 'row',
    alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  heroPlaceholderText: { fontSize: 12, color: TXTSUB, fontWeight: '500' },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: TXT,
    lineHeight: 34,
    marginBottom: 10,
  },
  body: { fontSize: 16, lineHeight: 23, color: TXTSUB, marginBottom: 18 },

  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 22,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${ROSE}14`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  featureCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { fontSize: 14, color: ROSE, fontWeight: '700' },

  planList: { gap: 12, marginBottom: 18 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: 'rgba(30,27,46,0.08)',
  },
  planCardActive: { borderColor: ROSE, backgroundColor: `${ROSE}0A` },
  planRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  planRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ROSE },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planLabel: { fontSize: 17, fontWeight: '700', color: TXT },
  planPrice: { fontSize: 14, color: TXTSUB, marginTop: 4 },
  planHint:  { fontSize: 13, color: ROSE, fontWeight: '600', marginTop: 4 },
  badgeBest: {
    backgroundColor: ROSE,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  badgeBestText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.4 },

  disclaimer: { fontSize: 12, lineHeight: 18, color: TXTSUB, textAlign: 'center', paddingHorizontal: 8 },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 4, paddingTop: 12,
    backgroundColor: '#FBF7F6',
    borderTopWidth: 1, borderTopColor: 'rgba(30,27,46,0.06)',
  },
  cta: {
    backgroundColor: ROSE,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  legalRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 10, marginTop: 12,
  },
  legal: { color: TXTSUB, fontSize: 13, fontWeight: '500' },
  legalSep: { color: TXTSUB, fontSize: 13 },
});
