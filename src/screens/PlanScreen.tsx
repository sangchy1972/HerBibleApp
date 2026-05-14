import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeIn,
} from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { usePlans } from '../state/PlansContext';
import { usePlanProfile } from '../state/PlanProfileContext';
import { PLAN_SECTIONS, PLAN_SECTION_LABELS, PLAN_SECTION_DESC, PlanSectionId, EMOTION_TAGS } from '../constants/plansApi';
import PlanCover from '../components/PlanCover';
import PlanRowCard from '../components/PlanRowCard';
import type { RootStackParamList, TabScreenProps } from '../navigation/types';
import type { PlanSummary } from '../services/plansService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS = ['current', 'explore', 'completed'] as const;
type TabId = typeof TABS[number];

export default function PlanScreen(_: TabScreenProps<'plan'>) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [tab, setTab] = useState<TabId>('explore');

  const { loading, error, featured, plansBySection, refresh } = usePlans();
  const { ready: profileReady, hasProfile } = usePlanProfile();

  // First visit to the Plan tab + no profile yet → push the 3-question intake.
  useEffect(() => {
    if (profileReady && !hasProfile) {
      nav.navigate('PlanProfile');
    }
  }, [profileReady, hasProfile, nav]);

  const tabIdx = TABS.indexOf(tab);
  const progress = useSharedValue(tabIdx);
  const tabsWidth = useSharedValue(0);
  useEffect(() => { progress.value = withTiming(tabIdx, { duration: 500 }); }, [tabIdx, progress]);

  const indicatorStyle = useAnimatedStyle(() => {
    const w = Math.max(0, (tabsWidth.value - 6) / 3);
    return { width: w, transform: [{ translateX: progress.value * w }] };
  });

  const onTabsLayout = (e: LayoutChangeEvent) => { tabsWidth.value = e.nativeEvent.layout.width; };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>My Plans</Text>
        </View>

        <View style={styles.tabs} onLayout={onTabsLayout}>
          <Animated.View pointerEvents="none" style={[styles.tabIndicator, indicatorStyle]} />
          {TABS.map(t => {
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={styles.tab}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, { color: active ? '#fff' : TXTSUB }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Animated.View key={tab} entering={FadeIn.duration(440)}>
          {tab === 'current' && <CurrentTab />}
          {tab === 'explore' && (
            <ExploreTab
              featured={featured}
              plansBySection={plansBySection}
              loading={loading}
              error={error}
              onRetry={refresh}
            />
          )}
          {tab === 'completed' && <CompletedTab onExplore={() => setTab('explore')} />}
        </Animated.View>

        <View style={{ height: 23 }} />
      </ScrollView>
    </View>
  );
}

// ---- Explore tab (the redesigned 6-section layout) ----

function ExploreTab({
  featured, plansBySection, loading, error, onRetry,
}: {
  featured: PlanSummary[];
  plansBySection: Record<PlanSectionId, PlanSummary[]>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const nav = useNavigation<Nav>();
  const { trackTap } = usePlanProfile();

  const goDetail = (slug: string) => {
    trackTap(slug);
    nav.navigate('PlanDetail', { slug });
  };

  if (loading && featured.length === 0) {
    return (
      <View style={styles.centerBlock}>
        <ActivityIndicator color={ROSE} />
        <Text style={styles.centerText}>Loading plans…</Text>
      </View>
    );
  }

  if (error && featured.length === 0) {
    return (
      <View style={styles.centerBlock}>
        <Text style={styles.centerText}>{error}</Text>
        <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {/* FEATURED carousel — algorithm-chosen 5 picks for this week */}
      <Text style={styles.bigSectionLabel}>FEATURED</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselContent}>
        {featured.map((p) => (
          <TouchableOpacity key={p.slug} style={styles.featuredCard} onPress={() => goDetail(p.slug)} activeOpacity={0.85}>
            <PlanCover cover={p.cover} width={281} height={173} radius={11} />
            <View style={styles.featuredOverlay}>
              <View style={styles.featuredTag}>
                <Text style={styles.featuredTagText}>{p.duration_days}-DAY PLAN</Text>
              </View>
              <Text style={styles.featuredTitle} numberOfLines={2}>{p.title}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* The 5 real sections. `emotions` is rendered as the tappable mood grid;
          the other 4 use the standard "title + 2 plans + See all" Section. */}
      {PLAN_SECTIONS.map(section => {
        const plans = plansBySection[section] || [];
        if (plans.length === 0) return null;
        if (section === 'emotions') {
          return (
            <EmotionsSection
              key={section}
              onTagPress={(secondary) => nav.navigate('PlanCategory', { section: 'emotions', initialSecondary: secondary })}
            />
          );
        }
        return (
          <Section
            key={section}
            title={PLAN_SECTION_LABELS[section]}
            desc={PLAN_SECTION_DESC[section]}
            plans={plans.slice(0, 2)}
            onSeeAll={() => nav.navigate('PlanCategory', { section })}
            onOpenPlan={goDetail}
          />
        );
      })}
    </View>
  );
}

// "How Are You Feeling Today?" — 11 mood tags arranged 4-4-3. Tap routes to
// PlanCategoryScreen with the matching cloud `secondary` preselected.
function EmotionsSection({ onTagPress }: { onTagPress: (secondary: string) => void }) {
  const rows = [EMOTION_TAGS.slice(0, 4), EMOTION_TAGS.slice(4, 8), EMOTION_TAGS.slice(8, 11)];
  return (
    <View style={styles.category}>
      <Text style={styles.bigSectionLabel}>HOW ARE YOU FEELING TODAY?</Text>
      <View style={styles.emotionGrid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.emotionRow}>
            {row.map(tag => (
              <TouchableOpacity
                key={tag.label}
                onPress={() => onTagPress(tag.secondary)}
                activeOpacity={0.85}
                style={[styles.emotionTag, { backgroundColor: tag.color }]}
              >
                <Text style={styles.emotionLabel} numberOfLines={1}>{tag.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Section({ title, desc, plans, onSeeAll, onOpenPlan }: {
  title: string; desc: string; plans: PlanSummary[];
  onSeeAll: () => void; onOpenPlan: (slug: string) => void;
}) {
  return (
    <View style={styles.category}>
      <View style={styles.catHeader}>
        <Text style={styles.catName}>{title}</Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={6}>
          <Text style={[styles.seeAll, { color: ROSE }]}>See all ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.catDesc}>{desc}</Text>
      {plans.map((p) => (
        <PlanRowCard key={p.slug} plan={p} onPress={() => onOpenPlan(p.slug)} />
      ))}
    </View>
  );
}

// ---- Current tab. Placeholder until "started plans" state lands; the explore
// tab is the focus of this release.
function CurrentTab() {
  return (
    <View>
      <Text style={styles.sectionLabel}>IN PROGRESS</Text>
      <View style={styles.emptyHint}>
        <Text style={styles.emptyTitle}>You haven't started a plan yet</Text>
        <Text style={styles.emptyDesc}>Pick one from Explore and your reading will show up here.</Text>
      </View>
    </View>
  );
}

function CompletedTab({ onExplore }: { onExplore: () => void }) {
  return (
    <View>
      <View style={styles.emptyHint}>
        <Text style={styles.emptyTitle}>No completed plans yet</Text>
        <Text style={styles.emptyDesc}>Finish a plan and it'll show up here.</Text>
        <TouchableOpacity onPress={onExplore} style={[styles.exploreCta, { backgroundColor: ROSE }]}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Explore Plans</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: P, paddingTop: 0 },
  header: { paddingTop: 9, marginBottom: 18 },
  heading: { fontSize: 30, fontWeight: '500', color: TXT, marginBottom: 2 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 22, padding: 3, marginBottom: 21,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute', top: 3, bottom: 3, left: 3,
    borderRadius: 18, backgroundColor: ROSE,
  },
  tab: {
    flex: 1, paddingVertical: 11, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  tabText: { fontSize: 15, fontWeight: '600' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#0E0E0E',
    letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 12,
  },
  bigSectionLabel: {
    fontSize: 16, fontWeight: '700', color: '#0E0E0E',
    letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 14,
  },
  carousel: { marginBottom: 28 },
  carouselContent: { gap: 13, paddingBottom: 7 },
  featuredCard: { width: 281, height: 173 },
  featuredOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    padding: 17, justifyContent: 'space-between',
  },
  featuredTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6, paddingHorizontal: 11, paddingVertical: 2,
  },
  featuredTagText: { fontSize: 10.5, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  featuredTitle: { fontSize: 19, fontWeight: '400', color: '#fff', lineHeight: 24, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 3 },
  category: { marginBottom: 30 },
  catHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 },
  catName: { fontSize: 21, fontWeight: '600', color: TXT },
  seeAll: { fontSize: 14 },
  catDesc: { fontSize: 13, color: TXTSUB, marginBottom: 14 },
  emptyHint: { paddingVertical: 23, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: TXT, marginBottom: 5 },
  emptyDesc: { fontSize: 14, color: TXTSUB, textAlign: 'center' },
  exploreCta: { marginTop: 16, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 11 },
  centerBlock: { paddingVertical: 40, alignItems: 'center' },
  centerText: { fontSize: 14, color: TXTSUB, marginTop: 10, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(30,27,46,0.06)' },
  retryText: { fontSize: 14, fontWeight: '700', color: TXT },
  emotionGrid: { gap: 10 },
  emotionRow: { flexDirection: 'row', gap: 10 },
  emotionTag: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionLabel: { fontSize: 11.5, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
});
