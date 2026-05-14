import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { usePlans } from '../state/PlansContext';
import { usePlanProfile } from '../state/PlanProfileContext';
import { PLAN_SECTION_LABELS, PLAN_SECTION_DESC } from '../constants/plansApi';
import PlanRowCard from '../components/PlanRowCard';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlanCategory'>;
type Rt  = RouteProp<RootStackParamList, 'PlanCategory'>;

const ALL = '__all__';

// "See all" screen for a section. Top row of pills lets the user filter by
// `secondary` (sub-category). Pills are derived from data — no hardcoded list,
// so if a new sub-category is added later it just appears.
export default function PlanCategoryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const section = route.params.section;

  const { plansBySection } = usePlans();
  const { trackTap } = usePlanProfile();

  const plans = plansBySection[section] || [];

  // Build sub-tabs: All + unique secondary_label, in stable order of first appearance.
  const subTabs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of plans) {
      if (p.secondary && p.secondary_label && !seen.has(p.secondary)) {
        seen.set(p.secondary, p.secondary_label);
      }
    }
    return [
      { id: ALL, label: 'All' },
      ...Array.from(seen.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [plans]);

  // If routed in from a "How Are You Feeling Today?" tag, preselect that
  // secondary pill; otherwise default to the All view.
  const [activeTab, setActiveTab] = useState<string>(route.params.initialSecondary ?? ALL);

  // Match logic: exact OR token-substring (so the new singular pills `anger`
  // and `bitterness` both pick up plans whose source secondary is the
  // compound `anger-bitterness`; same for `anxiety` ↔ `anxiety-fear`, etc.).
  // Splitting on '-' avoids the over-match where `joy` would catch `nojoy`.
  const filtered = useMemo(() => {
    if (activeTab === ALL) return plans;
    return plans.filter(p => {
      if (!p.secondary) return false;
      if (p.secondary === activeTab) return true;
      const tokens = p.secondary.split('-');
      return tokens.includes(activeTab);
    });
  }, [plans, activeTab]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={8} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={TXT} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title}>{PLAN_SECTION_LABELS[section]}</Text>
          <Text style={styles.desc}>{PLAN_SECTION_DESC[section]} · {plans.length} plans</Text>
        </View>
      </View>

      {subTabs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          {subTabs.map(t => {
            const active = t.id === activeTab;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setActiveTab(t.id)}
                activeOpacity={0.85}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Animated.ScrollView
        key={activeTab}
        entering={FadeIn.duration(250)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No plans here yet.</Text>
        ) : filtered.map(p => (
          <PlanRowCard
            key={p.slug}
            plan={p}
            onPress={() => {
              trackTap(p.slug);
              nav.navigate('PlanDetail', { slug: p.slug });
            }}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: P,
    paddingBottom: 12,
  },
  backBtn: {
    width: 39, height: 39, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '500', color: TXT, lineHeight: 30 },
  desc: { fontSize: 13, color: TXTSUB, marginTop: 4 },
  tabsScroll: { flexGrow: 0, marginBottom: 12 },
  tabsContent: { paddingHorizontal: P, gap: 8, paddingBottom: 4 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
  },
  pillActive: { backgroundColor: ROSE, borderColor: ROSE },
  pillText: { fontSize: 13.5, fontWeight: '600', color: TXT },
  pillTextActive: { color: '#fff' },
  scroll: { paddingHorizontal: P, paddingTop: 4 },
  empty: { fontSize: 14, color: TXTSUB, textAlign: 'center', marginTop: 40 },
});
