import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeIn,
} from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { PLANS_EXPLORE } from '../constants/data';
import { useActivity } from '../state/ActivityContext';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { PLAN_SECTIONS, PLAN_SECTION_LABELS, EMOTION_TAGS, type PlanSectionId } from '../constants/plansApi';
import PlanCover from '../components/PlanCover';
import type { PlanSummary } from '../constants/featuredPlansSummary';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { detailStyles as ds } from './planDetailStyles';
import TabSection from '../components/shared/TabSection';
import { useT } from '../i18n/useT';

type Plan = typeof PLANS_EXPLORE[0];

const TABS = ['current', 'explore', 'completed'] as const;
type TabId = typeof TABS[number];

function ImagePlaceholder({ ac, width = 136, height = 97, radius = 7 }: {                  // +10 % from 124×88
  ac: string; width?: number; height?: number; radius?: number;
}) {
  return (
    <View style={{ width, height, borderRadius: radius, backgroundColor: `${ac}22`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Feather name="image" size={26} color={`${ac}99`} />
    </View>
  );
}

// Corpus-plan list row — same visual shape as PlanRow but reads PlanSummary
// fields and uses the gradient cover instead of the demo color tint.
function CorpusPlanRow({ plan, onPress }: { plan: PlanSummary; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.planRow} activeOpacity={0.75}>
      <PlanCover
        slug={plan.slug}
        gradient={[plan.colorPrimary, plan.colorSecondary]}
        width={136}
        height={97}
        radius={7}
      />
      <View style={styles.planMeta}>
        <Text style={styles.planDays}>{plan.duration} Days</Text>
        <Text style={styles.planTitle} numberOfLines={2}>{plan.title}</Text>
      </View>
      <TouchableOpacity onPress={onPress} style={styles.startBtn}>
        <Text style={styles.startBtnText}>Start</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function CorpusCategorySection({ title, plans, onOpen, onSeeAll }: {
  title: string;
  plans: PlanSummary[];
  onOpen: (slug: string) => void;
  onSeeAll?: () => void;
}) {
  if (plans.length === 0) return null;
  // No subtitle row — per user feedback the one-liner description under the
  // category title was visual noise; the title + plan covers below carry
  // the section's identity well enough.
  return (
    <View style={styles.category}>
      <View style={styles.catHeader}>
        <Text style={styles.catName}>{title}</Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: ROSE }]}>See all ›</Text>
        </TouchableOpacity>
      </View>
      {plans.map(p => (
        <CorpusPlanRow key={p.slug} plan={p} onPress={() => onOpen(p.slug)} />
      ))}
    </View>
  );
}

function PlanRow({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.planRow} activeOpacity={0.75}>
      <ImagePlaceholder ac={plan.ac} />
      <View style={styles.planMeta}>
        <Text style={styles.planDays}>{plan.days} Days</Text>
        <Text style={styles.planTitle} numberOfLines={2}>{plan.title}</Text>
      </View>
      <TouchableOpacity onPress={onPress} style={styles.startBtn}>
        <Text style={styles.startBtnText}>Start</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function PlanDetail({ plan, onBack }: { plan: Plan; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { markToday } = useActivity();
  useEffect(() => { markToday(); }, [markToday]);
  const [activeDay, setActiveDay] = useState(0);
  const today = new Date();
  const days = Array.from({ length: plan.days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const sched = plan.schedule && plan.schedule[i]
      ? plan.schedule[i]
      : { walk: `Day ${i + 1}`, verses: [] };
    return {
      n: i + 1,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...sched,
    };
  });
  const cur = days[activeDay];

  // Phased fade-in on each section after the page mounts. Walks the eye from
  // top to bottom rather than sliding the whole view from the right.
  // Layout + spacing live in `planDetailStyles.ts` and are shared with the
  // corpus-backed FeaturedPlanDetail so the two screens stay byte-aligned.
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[ds.scroll, { paddingTop: insets.top + 8 }]}
    >
      <Animated.View entering={FadeIn.duration(360)}>
        <View style={ds.nav}>
          <TouchableOpacity onPress={onBack} style={ds.backBtn} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={TXT} />
          </TouchableOpacity>
        </View>
        <Text style={ds.title}>{plan.title}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(140).duration(420)}>
        {/* Demo plans have no CDN cover, just a single accent colour —
            render a flat hero wash with the book icon for visual continuity
            with the live FeaturedPlanDetail hero. */}
        <View style={[ds.heroWrap, { backgroundColor: `${plan.ac}18`, alignItems: 'center', justifyContent: 'center' }]}>
          <Feather name="book-open" size={44} color={`${plan.ac}88`} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(280).duration(420)}>
        <Text style={ds.subtitle}>{plan.subtitle}</Text>
        <Text style={ds.goal}>{plan.goal}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(420).duration(420)}>
        <Text style={ds.dailyPlanLabel}>Daily Plan</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ds.dayStrip} contentContainerStyle={ds.dayStripContent}>
          {days.map((d, i) => {
            const sel = i === activeDay;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setActiveDay(i)}
                style={[ds.dayBtn, { backgroundColor: sel ? plan.ac : 'rgba(255,255,255,0.7)', borderColor: sel ? 'transparent' : 'rgba(30,27,46,0.08)' }]}
                activeOpacity={0.8}
              >
                <Text style={[ds.dayNum, { color: sel ? '#fff' : TXT }]}>{d.n}</Text>
                <Text style={[ds.dayDate, { color: sel ? 'rgba(255,255,255,0.9)' : TXTSUB }]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(560).duration(420)}>
        <View style={ds.dayContent}>
          <View style={ds.dayHeader}>
            <Text style={ds.dayTitle}>Day {cur.n} of {plan.days}</Text>
            <View style={[ds.timeBadge, { backgroundColor: `${plan.ac}18` }]}>
              <Text style={[ds.timeBadgeText, { color: plan.ac }]}>~8 MIN</Text>
            </View>
          </View>

          <TouchableOpacity style={ds.walkRow} activeOpacity={0.8}>
            <View style={[ds.walkIcon, { backgroundColor: `${plan.ac}22` }]}>
              <Feather name="arrow-right" size={16} color={plan.ac} />
            </View>
            <View style={ds.walkMeta}>
              <Text style={[ds.walkCaption, { color: plan.ac }]}>DAILY WALK</Text>
              <Text style={ds.walkTitle}>{cur.walk}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={TXTSUB} />
          </TouchableOpacity>

          {cur.verses.map((v, i) => (
            <TouchableOpacity key={i} style={ds.verseRow} activeOpacity={0.8}>
              <View style={ds.verseIcon}>
                <Feather name="book-open" size={15} color={TXTSUB} />
              </View>
              <Text style={ds.verseName}>{v}</Text>
              <Feather name="chevron-right" size={18} color={TXTSUB} />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(720).duration(400)}>
        <TouchableOpacity style={[ds.startReadingBtn, { backgroundColor: plan.ac }]}>
          <Text style={ds.startReadingText}>Start Reading Plan</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ height: 23 }} />
    </ScrollView>
  );
}

// Per-emotion-secondary saturated brand color. White text on these reads
// cleanly; the pastel `colorPrimary` from the plan cover did not.
const EMOTION_TAG_COLOR: Record<string, string> = {
  'anger-bitterness':     '#D9762A',  // burnt orange — fire/heat, sits warm next to the pink palette
  'anxiety-fear':         '#4F8AC2',
  'grief-disappointment': '#9560C2',
  'joy-gratitude':        '#E25C8C',  // pink — joy/gratitude reads warm/bright
  'loneliness-emptiness': '#5078A1',
  'weariness-burnout':    '#3DA386',
};

const CATEGORIES = [
  { name: 'Walking with God', desc: 'Prayer, devotion & spiritual rhythms', plans: [PLANS_EXPLORE[0], PLANS_EXPLORE[1]] },
  { name: 'Personal Growth', desc: 'Identity, courage & wisdom', plans: [PLANS_EXPLORE[2], PLANS_EXPLORE[3]] },
  { name: 'Roles & Identity', desc: 'Womanhood, marriage & motherhood', plans: [PLANS_EXPLORE[0], PLANS_EXPLORE[1]] },
  { name: 'Life Seasons', desc: 'Singleness, transitions & waiting', plans: [PLANS_EXPLORE[2], PLANS_EXPLORE[3]] },
];

export default function PlanScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'plan'>>();
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<TabId>('current');
  const [detail, setDetail] = useState<Plan | null>(null);
  // Bumped each time the screen comes into focus (and each time the
  // Profile "My Plan" tile re-enters with a fresh `reset` param). Used
  // as the key on the page-level Animated.View so React Native remounts
  // it and replays its FadeIn — softens the abrupt tab-switch transition
  // the user flagged. First mount also fades in cleanly because the
  // initial key value is 0.
  const [fadeKey, setFadeKey] = useState(0);
  const resetSignal = route.params?.reset;
  // Corpus-backed plans for the Featured carousel + emotion tags + the
  // bottom two category sections (Roles & Identity, Life Seasons). The
  // existing PLANS_EXPLORE demo data still feeds Walking with God +
  // Personal Growth; the two paths coexist.
  const { summary, getSummary } = useFeaturedPlans();
  const { records: planRecords } = usePlanCompletion();

  // In-progress / completed plans — derived from PlanCompletionContext's
  // per-slug records. "In progress" = ≥1 day completed but not finished
  // (no `finishedAt`); "completed" = `finishedAt` is set. Sorted newest-
  // first by `firstStartedAt` so the most recent activity sits on top.
  // Each slug is hydrated to a real PlanSummary via `getSummary` and any
  // unknown slugs (plan retired upstream) drop out via the filter.
  const inProgressPlanRows = useMemo(() => {
    return Object.entries(planRecords)
      .filter(([, r]) => r.completedDays.length > 0 && !r.finishedAt)
      .sort(([, a], [, b]) => (b.firstStartedAt || 0) - (a.firstStartedAt || 0))
      .map(([slug]) => getSummary(slug))
      .filter((p): p is NonNullable<ReturnType<typeof getSummary>> => !!p);
  }, [planRecords, getSummary]);
  const completedPlanRows = useMemo(() => {
    return Object.entries(planRecords)
      .filter(([, r]) => !!r.finishedAt)
      .sort(([, a], [, b]) => (b.finishedAt || 0) - (a.finishedAt || 0))
      .map(([slug]) => ({ summary: getSummary(slug), finishedAt: planRecords[slug].finishedAt! }))
      .filter(x => !!x.summary) as { summary: NonNullable<ReturnType<typeof getSummary>>; finishedAt: number }[];
  }, [planRecords, getSummary]);

  // Group corpus plans by primary category for fast lookup. Featured
  // carousel pulls 5 picks; the four non-emotion sections render their
  // primaries. The emotion grid uses the curated EMOTION_TAGS constant
  // (9 fixed mood pills) instead of deriving from data, so colours +
  // ordering stay stable across content republishes.
  const corpusByPrimary = useMemo(() => {
    const map = new Map<string, PlanSummary[]>();
    for (const p of summary) {
      const list = map.get(p.primary) || [];
      list.push(p);
      map.set(p.primary, list);
    }
    return map;
  }, [summary]);

  // Featured = first 5 plans (one per category-ish). Bundled summary is
  // already ordered by curation rank, so slice is enough.
  const featuredPlans = useMemo(() => summary.slice(0, 5), [summary]);

  const openCorpusPlan = (slug: string) =>
    navigation.navigate('FeaturedPlanDetail', { slug });

  const tabIdx = TABS.indexOf(tab);
  const progress = useSharedValue(tabIdx);
  const tabsWidth = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(tabIdx, { duration: 500 });
  }, [tabIdx, progress]);

  // Replay the page-level fade-in every time the screen gains focus —
  // not just first mount. Without this, tab-switching back to Plan
  // shows the previous render instantly (the user described this as
  // "切进去太直接".) `useFocusEffect` fires on initial focus AND on
  // every re-focus.
  useFocusEffect(
    useCallback(() => {
      setFadeKey(k => k + 1);
    }, []),
  );

  // Profile "My Plan" tile entry: navigation.navigate(..., { reset: Date.now() })
  // gives us a fresh timestamp every tap. When that changes, reset the
  // tab to 'current' and scroll the page to the top so the user always
  // lands at the same starting point. Regular tab-switches don't send
  // `reset`, so this effect is a no-op for them — their state is
  // preserved.
  useEffect(() => {
    if (resetSignal !== undefined) {
      setTab('current');
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [resetSignal]);

  const indicatorStyle = useAnimatedStyle(() => {
    const w = Math.max(0, (tabsWidth.value - 4) / 3);                            // outer padding shrunk 3 → 2, so subtract 4 px (2 × 2) not 6 — keeps the indicator's right edge flush with the right tab on Completed

    return {
      width: w,
      transform: [{ translateX: progress.value * w }],
    };
  });

  const onTabsLayout = (e: LayoutChangeEvent) => {
    tabsWidth.value = e.nativeEvent.layout.width;
  };

  if (detail) return <PlanDetail plan={detail} onBack={() => setDetail(null)} />;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
      >
        {/* Page-level fade-in. `key={fadeKey}` forces a remount every time
            the screen gains focus or the Profile My-Plan tile re-enters
            with a fresh `reset` param — so the FadeIn replays. 500 ms is
            slow enough to read as a soft transition, fast enough that
            quick tab-switchers aren't stalled. */}
        <TabSection delay={0}>
        <View style={styles.header}>
          <Text style={styles.heading}>{t('plan.myPlans')}</Text>
        </View>

        <View style={styles.tabs} onLayout={onTabsLayout}>
          <Animated.View pointerEvents="none" style={[styles.tabIndicator, indicatorStyle]} />
          {TABS.map(tabId => {
            const active = tab === tabId;
            return (
              <TouchableOpacity
                key={tabId}
                onPress={() => setTab(tabId)}
                style={styles.tab}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, { color: active ? '#fff' : TXTSUB }]}>
                  {t(`plan.tab.${tabId}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        </TabSection>

        <TabSection delay={50}>{/* 140 → 50 */}
        <Animated.View key={tab} entering={FadeIn.duration(440)}>
          {tab === 'current' && (
            <View>
              {inProgressPlanRows.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>{t('plan.section.inProgress')}</Text>
                  {inProgressPlanRows.map(p => {
                    const rec = planRecords[p.slug];
                    const done = rec?.completedDays.length || 0;
                    const total = p.duration_days;
                    const pct = Math.min(100, Math.round((done / total) * 100));
                    return (
                      <TouchableOpacity
                        key={p.slug}
                        style={styles.planRow}
                        activeOpacity={0.75}
                        onPress={() => openCorpusPlan(p.slug)}
                      >
                        <PlanCover
                          slug={p.slug}
                          gradient={[p.colorPrimary, p.colorSecondary]}
                          width={136}
                          height={97}
                          radius={7}
                        />
                        <View style={styles.planMeta}>
                          <Text style={styles.planDays}>Day {done} of {total}</Text>
                          <Text style={styles.planTitle} numberOfLines={2}>{p.title}</Text>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: ROSE }]} />
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => openCorpusPlan(p.slug)}
                          style={[styles.startBtn, { backgroundColor: ROSE }]}
                        >
                          <Text style={[styles.startBtnText, { color: '#fff' }]}>Continue</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : (
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyTitle}>{t('plan.empty.notStarted.title')}</Text>
                  <Text style={styles.emptyDesc}>{t('plan.empty.notStarted.desc')}</Text>
                  <TouchableOpacity onPress={() => setTab('explore')} style={[styles.exploreCta, { backgroundColor: ROSE }]}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{t('plan.empty.notStarted.cta')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {tab === 'explore' && (
            <View>
              {/* FEATURED — top 5 picks from the bundled summary. Each card
                  shows the real cover image (CDN-served webp) with a gradient
                  fallback during load. Card 281×173 — same size as the May 14
                  design and noticeably tighter than the 355-wide gradient-
                  only cards that preceded it. */}
              <Text style={styles.bigSectionLabel}>{t('plan.tab.featured')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselContent}>
                {featuredPlans.map(plan => (
                  <TouchableOpacity
                    key={plan.slug}
                    activeOpacity={0.85}
                    onPress={() => openCorpusPlan(plan.slug)}
                    style={styles.featuredCard}
                  >
                    <PlanCover
                      slug={plan.slug}
                      gradient={[plan.colorPrimary, plan.colorSecondary]}
                      width={281}
                      height={173}
                      radius={11}
                    />
                    <View style={styles.featuredOverlay}>
                      <View style={styles.featuredTag}>
                        <Text style={styles.featuredTagText}>{(plan.duration === 1 ? t('plan.dayCount.one') : t('plan.dayCount.other', { n: plan.duration })).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.featuredTitle} numberOfLines={2}>{plan.title}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* HOW ARE YOU FEELING TODAY? — 9 curated mood pills in two
                  rows (5 + 4). The number of tags is fixed by EMOTION_TAGS
                  (palette + ordering pinned in plansApi.ts); the layout
                  arrangement here is what makes the strip read as a
                  compact 2-line grid rather than a horizontal scroll. */}
              <Text style={styles.bigSectionLabel}>{t('plansMeta.section.emotions')}</Text>
              <View style={[styles.emotionGrid, { marginBottom: 28 }]}>
                {[EMOTION_TAGS.slice(0, 5), EMOTION_TAGS.slice(5)].map((row, ri) => (
                  <View key={ri} style={styles.emotionRow}>
                    {row.map(tag => (
                      <TouchableOpacity
                        key={tag.secondary}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('PlanCategory', { primary: 'emotions', secondary: tag.secondary, title: t(tag.label) })}
                        style={[styles.emotionTag, { backgroundColor: tag.color, flex: 1 }]}
                      >
                        <Text style={styles.emotionLabel} numberOfLines={1}>{t(tag.label)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>

              {/* The four non-emotion sections, driven by the centralized
                  PLAN_SECTIONS list. No one-liner under the title per user —
                  the cover stack carries the visual identity. */}
              {PLAN_SECTIONS.filter(s => s !== 'emotions').map((section: PlanSectionId) => {
                const plans = (corpusByPrimary.get(section) || []).slice(0, 4);
                if (plans.length === 0) return null;
                const title = t(PLAN_SECTION_LABELS[section]);
                return (
                  <CorpusCategorySection
                    key={section}
                    title={title}
                    plans={plans}
                    onOpen={openCorpusPlan}
                    onSeeAll={() => navigation.navigate('PlanCategory', { primary: section, title })}
                  />
                );
              })}
            </View>
          )}

          {tab === 'completed' && (
            <View>
              {completedPlanRows.length > 0 ? (
                completedPlanRows.map(({ summary: p, finishedAt }) => {
                  const dateStr = new Date(finishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                  return (
                    <TouchableOpacity
                      key={p.slug}
                      style={styles.planRow}
                      activeOpacity={0.75}
                      onPress={() => openCorpusPlan(p.slug)}
                    >
                      <View style={{ position: 'relative' }}>
                        <PlanCover
                          slug={p.slug}
                          gradient={[p.colorPrimary, p.colorSecondary]}
                          width={136}
                          height={97}
                          radius={7}
                        />
                        <View style={styles.checkBadge}>
                          <Feather name="check" size={12} color="#fff" />
                        </View>
                      </View>
                      <View style={styles.planMeta}>
                        <Text style={styles.planDays}>{p.duration_days} Days · {dateStr}</Text>
                        <Text style={styles.planTitle} numberOfLines={2}>{p.title}</Text>
                      </View>
                      <TouchableOpacity onPress={() => openCorpusPlan(p.slug)} style={styles.startBtn}>
                        <Text style={styles.startBtnText}>Review</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyTitle}>{t('plan.empty.completed.title')}</Text>
                  <Text style={styles.emptyDesc}>{t('plan.empty.completed.desc')}</Text>
                  <TouchableOpacity onPress={() => setTab('explore')} style={[styles.exploreCta, { backgroundColor: ROSE }]}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{t('plan.empty.completed.cta')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </Animated.View>
        </TabSection>

        <View style={{ height: 23 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: P, paddingTop: 0 },
  header: { paddingTop: 9, marginBottom: 18 },
  heading: { fontSize: 28, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, marginBottom: 2 },   // -7 % from 30
  subheading: { fontSize: 14, fontFamily: FONTS.lato, color: TXTSUB },
  // Outer wrap shrunk -15 % per user — mirrors PrayerScreen's Morning /
  // Evening toggle so both strips read at identical height. Inner button
  // paddingVertical drops to 7, outer padding 3 → 2, borderRadius 22 → 18.
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 18,
    padding: 2,
    marginBottom: 21,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 15,
    backgroundColor: ROSE,
  },
  // Tab inner pill +10 % height + text 15 → 16 per user — kept in lockstep
  // with PrayerScreen.toggleBtn / toggleText so the two tab strips remain
  // visually identical across the app.
  tab: {
    flex: 1,
    paddingVertical: 8.5,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 15 → 16 — matches PrayerScreen.toggleText for visual parity.
  tabText: { fontSize: 16, fontWeight: '600', fontFamily: FONTS.latoBold },
  // Unified section title — shares the exact treatment with
  // ProfileScreen.sectionTitle (20 / weight 600 / TXT) and PlanScreen.catName
  // below so every header in the app sits at the same visual rank. Used to
  // be a small uppercase eyebrow (12 / 1.6 letter-spacing); the textTransform
  // and letter-spacing are gone, and the text content was de-uppercased in
  // the JSX ("IN PROGRESS" → "In Progress" etc.).
  sectionLabel: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginBottom: 14,
  },
  // bigSectionLabel collapses to the same unified style — "Featured" used
  // to be a slightly larger uppercase eyebrow (18.4); now identical to
  // sectionLabel. Kept as its own key so the JSX call sites don't churn.
  bigSectionLabel: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginBottom: 14,
  },
  // -5 px more between rows (the second iteration of this tweak). Negative
  // marginBottom keeps the per-row paddingVertical at 12 (preserving the
  // tap target around the cover) while pulling the next row up by 4 px;
  // gap between visible content drops from 25 → 20 (12 + -4 + 12 = 20).
  // Affects both demo PlanRow and CorpusPlanRow — and mirrored in
  // PlanCategoryScreen.styles.planRow so the full-screen category list
  // stays aligned with the main Plan tab.
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    marginBottom: -4,
  },
  planMeta: { flex: 1, minWidth: 0 },
  planDays: { fontSize: 13, fontFamily: FONTS.lato, color: TXTSUB, marginBottom: 3, fontWeight: '500' },
  planTitle: { fontSize: 15.5, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, lineHeight: 21 },
  progressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.08)',
    overflow: 'hidden',
    marginTop: 7,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  startBtn: {
    flexShrink: 0,
    paddingHorizontal: 19,
    paddingVertical: 9,
    borderRadius: 19,
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  startBtnText: { fontSize: 14, fontWeight: '700', fontFamily: FONTS.latoBold, color: TXT },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#7DB87D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carousel: { marginBottom: 28 },
  carouselContent: { gap: 13, paddingBottom: 7 },
  // 355 → 281 per user — the previous size dominated the screen; this
  // matches the May 14 reference design. PlanCover renders the cover image
  // at 281×173, and `featuredOverlay` paints the tag + title on top.
  featuredCard: { width: 281, height: 173, position: 'relative' },
  featuredOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 16,
    justifyContent: 'space-between',
    borderRadius: 11,
    // Subtle bottom-to-top dark gradient would be ideal here, but a flat
    // semi-transparent overlay on the bottom half keeps text legible on
    // covers with bright bottoms without pulling in another gradient.
    // For now a plain transparent wrapper is enough; the tag + title both
    // sit on their own opaque backgrounds.
  },
  featuredTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  featuredTagText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: FONTS.latoBold,
    color: '#fff',
    letterSpacing: 1,
  },
  featuredTitle: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: '#fff',
    lineHeight: 22,
    // Drop shadow so the title stays legible over high-key cover images.
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  emotionStrip: { marginBottom: 30 },
  emotionContent: { paddingBottom: 6 },
  emotionGrid: { flexDirection: 'column', gap: 10 },
  emotionRow: { flexDirection: 'row', gap: 11 },
  emotionTag: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    minHeight: 56,                                                              // +15 % vs the old ~48 px
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionLabel: {
    fontSize: 14,                                                               // +10 % from 12.5
    fontWeight: '800',
    fontFamily: FONTS.latoBold,
    color: '#fff',
    letterSpacing: 1.4,
  },
  // 30 → 25 — the -5 between consecutive category sections lets Personal
  // Growth, Roles & Identity, and Life Seasons sit a touch closer to the
  // category above them (per design spec). Walking with God's +5 top
  // margin is added inline at its render site to balance the visual.
  category: { marginBottom: 25 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  // catName matches the unified section title (20). Was 21 (-5 % per spec).
  catName: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  seeAll: { fontSize: 15.4, fontFamily: FONTS.lato },                          // +10 %
  catDesc: { fontSize: 14.3, fontFamily: FONTS.lato, color: TXTSUB, marginBottom: 14 },  // +10 %
  emptyHint: { textAlign: 'center', paddingVertical: 23, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, marginBottom: 5 },
  emptyDesc: { fontSize: 14, fontFamily: FONTS.lato, color: TXTSUB, textAlign: 'center' },
  exploreCta: {
    marginTop: 16,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 11,
  },
  // Detail
  // Plan-detail layout styles live in `./planDetailStyles.ts` (shared with
  // FeaturedPlanDetail). Don't add detail-specific keys here.
});
