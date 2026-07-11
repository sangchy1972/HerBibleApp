import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList, type LayoutChangeEvent, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, BTN_RADIUS, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import type { PlanSummary } from '../constants/featuredPlansSummary';
import { useT } from '../i18n/useT';
import { SUBTAB_ORDER, SUBTAB_OVERRIDE, type PlanSectionId } from '../constants/plansApi';
import PlanCover, { PLAN_ROW_COVER } from '../components/PlanCover';
import type { RootStackScreenProps } from '../navigation/types';

// Full-screen list for one (primary) bucket of the corpus. Organises plans
// by the sub-tab schema in `SUBTAB_ORDER` / `SUBTAB_OVERRIDE` so users
// browse "Walking with God → Draw Near | Living Faith | Her Story |
// God's Presence" rather than a flat 11-row dump. An "All" pill on the
// left keeps the whole list one tap away.
//
// Routing inputs:
//   • `primary`   — required, drives the sub-tab schema lookup.
//   • `secondary` — optional, pre-selects the matching sub-tab (e.g.
//                   when arriving from a "How are you feeling today?"
//                   mood pill on the Plan tab).

const ALL_TAB = '__all__';

export default function PlanCategoryScreen({ route, navigation }: RootStackScreenProps<'PlanCategory'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { primary, secondary, title } = route.params;
  const { summary } = useFeaturedPlans();

  // Which sub-tab is currently active. `__all__` shows every plan in this
  // primary; otherwise filter by the slug→sub-tab map.
  const subtabs = SUBTAB_ORDER[primary as string] || [];
  const overrides = SUBTAB_OVERRIDE[primary as string] || {};

  // If we arrived with a `secondary` hint, find the sub-tab whose id matches
  // it (e.g. `anxiety` → emotions sub-tab `anxiety`). Otherwise start on All.
  const initialTab = useMemo(() => {
    if (!secondary) return ALL_TAB;
    // For emotions, sub-tab id IS the secondary id (anxiety / anger / …).
    const direct = subtabs.find(st => st.id === secondary);
    if (direct) return direct.id;
    return ALL_TAB;
  }, [secondary, subtabs]);

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Re-sync when route params change (e.g. user backs out and re-enters
  // from a different mood pill).
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  // Auto-scroll the pill strip so the chip matching the incoming `secondary`
  // route param (e.g. arriving via the "How are you feeling today?" Shame
  // pill) is brought into view AND visibly highlighted. Without this the
  // strip stays scrolled to "All" on the left, making it look like nothing
  // is selected even though `activeTab` is set correctly — exactly the
  // confusion users hit on the SHAME category.
  //
  // Implementation: each pill reports its x/width via onLayout into a Map;
  // we also measure the strip viewport width. As soon as both are known we
  // scroll once to center the active chip (no animation — instant on
  // first render, so it feels like the screen "opens to" Shame rather than
  // sliding to it after the fact). The `hasAutoScrolledFor` ref prevents
  // the autoscroll from re-firing every render or when the user manually
  // taps another chip.
  const stripRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Map<string, { x: number; w: number }>>(new Map());
  const stripViewportW = useRef(0);
  const hasAutoScrolledFor = useRef<string | null>(null);

  const tryAutoScroll = useCallback((tabId: string) => {
    if (hasAutoScrolledFor.current === tabId) return;
    const layout = chipLayouts.current.get(tabId);
    const viewportW = stripViewportW.current;
    if (!layout || viewportW === 0) return;
    hasAutoScrolledFor.current = tabId;
    // Center the chip in the viewport when there's room; otherwise scroll
    // just enough to bring it fully into view from the right edge.
    const centered = layout.x + layout.w / 2 - viewportW / 2;
    stripRef.current?.scrollTo({ x: Math.max(0, centered), animated: false });
  }, []);

  // When the route brings us to a new chip, allow another autoscroll.
  useEffect(() => { hasAutoScrolledFor.current = null; }, [initialTab]);

  const onChipLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    chipLayouts.current.set(id, { x, w: width });
    if (id === initialTab) tryAutoScroll(id);
  }, [initialTab, tryAutoScroll]);

  const onStripLayout = useCallback((e: LayoutChangeEvent) => {
    stripViewportW.current = e.nativeEvent.layout.width;
    tryAutoScroll(initialTab);
  }, [initialTab, tryAutoScroll]);

  // Plans for THIS primary, then optionally filtered by the active sub-tab.
  const allInPrimary = useMemo(() => {
    return summary.filter(p => p.primary === primary);
  }, [summary, primary]);

  const filteredPlans = useMemo(() => {
    if (activeTab === ALL_TAB) return allInPrimary;
    return allInPrimary.filter(p => {
      // For the 4 non-emotion primaries, look up the sub-tab via slug.
      const override = overrides[p.slug];
      if (override) return override.id === activeTab;
      // For emotions, the sub-tab id equals the plan's `secondary`.
      return p.secondary === activeTab;
    });
  }, [allInPrimary, activeTab, overrides]);

  const open = useCallback((slug: string) =>
    navigation.navigate('FeaturedPlanDetail', { slug }),
  [navigation]);
  // Row renderer captured once via useCallback — passed to FlatList so the
  // list doesn't tear down + remount rows on parent re-renders.
  const renderRow = useCallback<ListRenderItem<PlanSummary>>(
    ({ item }) => <PlanCategoryRow plan={item} onOpen={open} />,
    [open],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerBtn} />
      </View>
      <View style={styles.divider} />

      {/* Sub-tab pill strip — only shown when this primary has sub-tabs
          defined in SUBTAB_ORDER (all 5 currently do). Always opens with
          "All" on the left so the full list stays one tap away.

          The strip lives inside a plain View wrapper rather than relying on
          a `height`/`maxHeight` on the ScrollView itself — Android was
          clipping the top of each pill when the ScrollView's outer style
          set a height bound, because its horizontal-scroll layout treated
          the bound as the content viewport rather than the row container.
          Wrapping in a View with vertical padding gives the pills room to
          breathe regardless of platform. */}
      {subtabs.length > 0 && (
        <View style={styles.pillStripWrap} onLayout={onStripLayout}>
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillStripContent}
          >
            {[{ id: ALL_TAB, label: 'plan.subtab.all' }, ...subtabs].map(st => {
              const active = st.id === activeTab;
              return (
                <TouchableOpacity
                  key={st.id}
                  onPress={() => setActiveTab(st.id)}
                  onLayout={(e) => onChipLayout(st.id, e)}
                  activeOpacity={0.85}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                    {t(st.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {filteredPlans.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={36} color={TXTSUB} />
          <Text style={styles.emptyText}>{t('plan.category.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPlans}
          keyExtractor={planKeyExtractor}
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          ListHeaderComponent={
            <Text style={styles.subhead}>
              {t('planCategory.count', { n: filteredPlans.length })}
            </Text>
          }
          // Virtualization tuning. Each row is ~110 px tall, so an iPhone
          // SE viewport (~640 px) shows about 6; rendering 4 extra ahead
          // keeps scroll smooth without blowing up initial mount cost.
          initialNumToRender={6}
          windowSize={5}
          maxToRenderPerBatch={6}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

// Row renderer factored out of the parent so FlatList can keep stable
// references for `keyExtractor` and `renderItem`. The `open` callback is
// closed over per-render — that's fine because FlatList re-renders rows
// only when the row's data changes (the memoized PlanCover absorbs the
// per-frame churn).
function PlanCategoryRow({ plan, onOpen }: { plan: PlanSummary; onOpen: (slug: string) => void }) {
  const t = useT();
  const press = useCallback(() => onOpen(plan.slug), [onOpen, plan.slug]);
  return (
    <TouchableOpacity onPress={press} activeOpacity={0.75} style={styles.planRow}>
      <PlanCover
        slug={plan.slug}
        gradient={[plan.colorPrimary, plan.colorSecondary]}
        {...PLAN_ROW_COVER}
      />
      <View style={styles.planMeta}>
        <Text style={styles.planDays}>{t('plan.row.daysLabel', { n: plan.duration })}</Text>
        <Text style={styles.planTitle} numberOfLines={2}>{plan.title}</Text>
      </View>
      <TouchableOpacity onPress={press} style={styles.startBtn}>
        <Text style={styles.startBtnText}>{t('plan.startFallback')}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
const planKeyExtractor = (p: PlanSummary) => p.slug;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: P, paddingBottom: 14,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  // Lora 600 (weight MUST be 600, never 700 — 700 makes Android drop Lora and
  // fall back to system sans, which is why this header wasn't rendering Lora).
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '600', color: TXT, textAlign: 'center', paddingHorizontal: 8, fontFamily: FONTS.loraBold },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },

  // Wrapper View carries the vertical padding so each pill renders fully
  // inside its own row, without relying on the ScrollView's height bound.
  // Pill itself bumped to paddingVertical: 9 so the active background
  // chip has visible breathing room around the text (the previous 7 made
  // active pills look squished against the chip edges on Android).
  pillStripWrap: { paddingTop: 14, paddingBottom: 16 },
  pillStripContent: { paddingHorizontal: P, gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(30,27,46,0.05)',
  },
  pillActive: { backgroundColor: ROSE },
  pillText: { fontSize: 14, fontWeight: '700', color: TXTSUB, fontFamily: FONTS.latoBold },   // bolder + +8% per user (13→14)
  pillTextActive: { color: '#fff' },

  scroll: { paddingHorizontal: P, paddingTop: 4 },
  subhead: { fontSize: 15, color: TXTSUB, fontWeight: '600', marginBottom: 8 },   // +15% per user (13→15)

  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    marginBottom: -4,
  },
  planMeta: { flex: 1, minWidth: 0 },
  planDays: { fontSize: 13, color: TXTSUB, marginBottom: 3, fontWeight: '500', fontFamily: FONTS.lato },
  planTitle: { fontSize: 15.5, fontWeight: '600', color: TXT, lineHeight: 21, fontFamily: FONTS.loraBold },
  startBtn: {
    flexShrink: 0,
    paddingHorizontal: 19,
    paddingVertical: 9,
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,                 // pink Start buttons per user (was neutral gray)
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: FONTS.latoBold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 36 },
  emptyText: { fontSize: 15, color: TXTSUB, textAlign: 'center' },
});
