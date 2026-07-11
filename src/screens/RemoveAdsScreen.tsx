import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, BTN_RADIUS, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import Logo from '../components/shared/Logo';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';
import { initIap, fetchPrices, purchasePlan, restorePurchases } from '../services/iap';

type PlanId = 'lifetime' | 'annual' | 'monthly';

interface Plan {
  id: PlanId;
  label: string;
  priceLine: string;
  bestValue?: boolean;
  hint?: string;
}

// Real prices come from the StoreKit / Play Billing product IDs. These are
// just display strings until the IAP layer is wired up. Prices are
// region-fixed (NT$) for now — they'll come from the store metadata once
// IAP is wired, with no need for ad-hoc translation.
//
// `labelKey` / `hintKey` are i18n keys consumed at render time so the
// plan tier renders in the active UI language.
type PlanRow = {
  id: PlanId;
  labelKey: string;
  priceKey: string;
  hintKey?: string;
  bestValue?: boolean;
  pct?: number; // for annual.hint {pct} substitution
};
const PLANS: PlanRow[] = [
  { id: 'lifetime', labelKey: 'paywall.plan.lifetime', priceKey: 'paywall.plan.lifetime.priceLine', hintKey: 'paywall.plan.lifetime.hint', bestValue: true },
  { id: 'annual',   labelKey: 'paywall.plan.annual',   priceKey: 'paywall.plan.annual.priceLine',   hintKey: 'paywall.plan.annual.hint',   pct: 58 },
  { id: 'monthly',  labelKey: 'paywall.plan.monthly',  priceKey: 'paywall.plan.monthly.priceLine' },
];

// Static fallback display prices, only shown until (or if) the store answers
// with real localized prices via fetchPrices().
const FALLBACK_PRICES: Record<PlanId, string> = {
  lifetime: 'NT$670',
  annual:   'NT$420',
  monthly:  'NT$84',
};

export default function RemoveAdsScreen({ navigation }: RootStackScreenProps<'RemoveAds'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PlanId>('lifetime');
  const [prices, setPrices] = useState<Record<PlanId, string>>(FALLBACK_PRICES);
  const [busy, setBusy] = useState(false);

  // Localized store prices (StoreKit / Play Billing). initIap() is idempotent —
  // normally already connected from App launch, this is just the safety call.
  useEffect(() => {
    let alive = true;
    (async () => {
      await initIap();
      const p = await fetchPrices();
      if (alive && Object.keys(p).length) setPrices(prev => ({ ...prev, ...p }));
    })();
    return () => { alive = false; };
  }, []);

  const onSubscribe = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await purchasePlan(selected);
      if (outcome === 'purchased') {
        Alert.alert(
          t('paywall.alert.success.title'),
          t('paywall.alert.success.body'),
          [{ text: t('common.continue'), onPress: () => navigation.goBack() }],
        );
      } else if (outcome === 'pending') {
        Alert.alert(t('paywall.alert.pending.title'), t('paywall.alert.pending.body'));
      } else if (outcome === 'error' || outcome === 'unavailable') {
        Alert.alert(t('paywall.alert.error.title'), t('paywall.alert.error.body'));
      }
      // 'cancelled' → user closed the store sheet; no alert.
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert(
          t('paywall.alert.restore.done.title'),
          t('paywall.alert.restore.done.body'),
          [{ text: t('common.continue'), onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert(t('paywall.alert.restore.none.title'), t('paywall.alert.restore.none.body'));
      }
    } finally {
      setBusy(false);
    }
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
        <Text style={styles.body}>{t('paywall.body')}</Text>

        <View style={styles.featureRow}>
          <Feature label={t('paywall.feature.noAds')} />
          <Feature label={t('paywall.feature.future')} />
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
                  <Text style={styles.planLabel}>{t(p.labelKey)}</Text>
                  {p.bestValue && (
                    <View style={styles.badgeBest}>
                      <Text style={styles.badgeBestText}>{t('paywall.badge.bestValue')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planPrice}>{t(p.priceKey, { price: prices[p.id] })}</Text>
                {p.hintKey && (
                  <Text style={styles.planHint}>{t(p.hintKey, { pct: p.pct ?? 0 })}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.disclaimer}>{t('paywall.disclaimer')}</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={onSubscribe} activeOpacity={0.85} style={[styles.cta, busy && styles.ctaBusy]} disabled={busy}>
          {busy
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.ctaText}>{t('common.continue')}</Text>}
        </TouchableOpacity>
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => navigation.navigate('Policy', { id: 'terms' })}><Text style={styles.legal}>{t('paywall.terms')}</Text></TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Policy', { id: 'privacy' })}><Text style={styles.legal}>{t('paywall.privacy')}</Text></TouchableOpacity>
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
    // Mirrors PrayerScreen.startBtn — same primary-CTA radius as "Start Morning Prayer".
    height: 47.06,
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  legalRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 10, marginTop: 12,
  },
  legal: { color: TXTSUB, fontSize: 13, fontWeight: '500' },
  legalSep: { color: TXTSUB, fontSize: 13 },
});
