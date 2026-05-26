import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import Logo from '../components/shared/Logo';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';

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
  const t = useT();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PlanId>('lifetime');

  const onSubscribe = () => {
    // TODO: wire StoreKit / Play Billing. Library choice is deliberately
    // deferred — `react-native-iap` was removed from deps because its
    // autolinked native module triggers Play Integrity checks on
    // non-certified Android emulators, surfacing a verbose `-17
    // CLIENT_TRANSIENT_ERROR`. Add the chosen lib (expo-iap when stable
    // for SDK 54, or react-native-iap behind an explicit init guard) at
    // the same time the real product IDs land.
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
          <Text style={styles.restore}>{t('common.restore')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 130 }]}
      >
        <View style={styles.titleRow}>
          <Logo size={64} />
          <Text style={styles.title}>{t('paywall.title')}</Text>
        </View>
        <Text style={styles.body}>
          Subscribe and turn off all in-app ads, unlock early access to new study tools,
          and support the team building Her Bible.
        </Text>

        <View style={styles.featureRow}>
          <Feature label="No ads" />
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
                      <Text style={styles.badgeBestText}>{t('paywall.badge.bestValue')}</Text>
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
          <Text style={styles.ctaText}>{t('common.continue')}</Text>
        </TouchableOpacity>
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://example.com/terms')}><Text style={styles.legal}>{t('paywall.terms')}</Text></TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://example.com/privacy')}><Text style={styles.legal}>{t('paywall.privacy')}</Text></TouchableOpacity>
        </View>
      </View>
    </View>
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

  // Extra paddingTop now that the hero placeholder is gone — gives the
  // title some breathing room below the close button instead of butting
  // straight up against it.
  scroll: { paddingHorizontal: P + 4, paddingTop: 28 },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  title: {
    flex: 1,                                                                     // wraps to 2 lines next to the 64-px logo on small phones
    fontSize: 22,                                                                // 26.6 → 22 (-17 %) per user — sits comfortably next to the logo and matches the page's overall weight
    fontWeight: '600',                                                           // 700 → 600 to keep Lora bold rendering on Android (loraBold + 700 falls back to system sans)
    fontFamily: FONTS.loraBold,
    color: TXT,
    lineHeight: 28,                                                              // 34 → 28 to keep proportional to the new 22-px size
  },
  body: { fontSize: 15, lineHeight: 22, color: TXTSUB, marginBottom: 18 },       // 16 → 15 — slightly tighter so the page settles, since title is now smaller too

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
  planLabel: { fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },        // matches ProfileScreen.sectionTitle (My Notes / Faith Achievement) 1:1
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
    // Mirrors PrayerScreen.startBtn 1:1 — same height + radius so the
    // "Continue" CTA reads as the same primary button as "Start Morning Prayer".
    height: 47.06,
    borderRadius: 24.39,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  legalRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 10, marginTop: 12,
  },
  legal: { color: TXTSUB, fontSize: 13, fontWeight: '500' },
  legalSep: { color: TXTSUB, fontSize: 13 },
});
