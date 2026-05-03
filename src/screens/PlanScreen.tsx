import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeIn,
} from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { PLANS_EXPLORE } from '../constants/data';
import { useActivity } from '../state/ActivityContext';

type Plan = typeof PLANS_EXPLORE[0];

const TABS = ['current', 'explore', 'completed'] as const;
type TabId = typeof TABS[number];

function ImagePlaceholder({ ac, width = 124, height = 88, radius = 6 }: {
  ac: string; width?: number; height?: number; radius?: number;
}) {
  return (
    <View style={{ width, height, borderRadius: radius, backgroundColor: `${ac}22`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Feather name="image" size={26} color={`${ac}99`} />
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
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.detailScroll, { paddingTop: insets.top + 8 }]}
    >
      <Animated.View entering={FadeIn.duration(360)}>
        <View style={styles.detailNav}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={TXT} />
          </TouchableOpacity>
        </View>
        <Text style={styles.detailTitle}>{plan.title}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(140).duration(420)}>
        <View style={[styles.heroImagePlaceholder, { borderColor: `${plan.ac}55`, backgroundColor: `${plan.ac}18` }]}>
          <Feather name="image" size={44} color={`${plan.ac}88`} />
          <Text style={[styles.heroImageLabel, { color: plan.ac }]}>HERO IMAGE</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(280).duration(420)}>
        <Text style={styles.detailSubtitle}>{plan.subtitle}</Text>
        <Text style={styles.detailGoal}>{plan.goal}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(420).duration(420)}>
        <Text style={styles.dailyPlanLabel}>Daily Plan</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip} contentContainerStyle={styles.dayStripContent}>
          {days.map((d, i) => {
            const sel = i === activeDay;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setActiveDay(i)}
                style={[styles.dayBtn, { backgroundColor: sel ? plan.ac : 'rgba(255,255,255,0.7)', borderColor: sel ? 'transparent' : 'rgba(30,27,46,0.08)' }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.dayNum, { color: sel ? '#fff' : TXT }]}>{d.n}</Text>
                <Text style={[styles.dayDate, { color: sel ? 'rgba(255,255,255,0.9)' : TXTSUB }]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(560).duration(420)}>
        <View style={styles.dayContent}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>Day {cur.n} of {plan.days}</Text>
            <View style={[styles.timeBadge, { backgroundColor: `${plan.ac}18` }]}>
              <Text style={[styles.timeBadgeText, { color: plan.ac }]}>~8 MIN</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.walkRow} activeOpacity={0.8}>
            <View style={[styles.walkIcon, { backgroundColor: `${plan.ac}22` }]}>
              <Feather name="arrow-right" size={16} color={plan.ac} />
            </View>
            <View style={styles.walkMeta}>
              <Text style={[styles.walkCaption, { color: plan.ac }]}>DAILY WALK</Text>
              <Text style={styles.walkTitle}>{cur.walk}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={TXTSUB} />
          </TouchableOpacity>

          {cur.verses.map((v, i) => (
            <TouchableOpacity key={i} style={styles.verseRow} activeOpacity={0.8}>
              <View style={styles.verseIcon}>
                <Feather name="book-open" size={15} color={TXTSUB} />
              </View>
              <Text style={styles.verseName}>{v}</Text>
              <Feather name="chevron-right" size={18} color={TXTSUB} />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(720).duration(400)}>
        <TouchableOpacity style={[styles.startReadingBtn, { backgroundColor: plan.ac }]}>
          <Text style={styles.startReadingText}>Start Reading Plan</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ height: 23 }} />
    </ScrollView>
  );
}

const EMOTION_TAGS: { label: string; color: string }[] = [
  { label: 'LOVE', color: '#F2A6BF' },
  { label: 'HEALING', color: '#F4AC93' },
  { label: 'ANXIETY', color: '#A8C0E0' },
  { label: 'ANGER', color: '#88C2B9' },
  { label: 'GRIEF', color: '#B6A6E0' },
  { label: 'JOY', color: '#F0CC85' },
  { label: 'FEAR', color: '#9AAAC0' },
  { label: 'PEACE', color: '#A5C9AE' },
];

const CATEGORIES = [
  { name: 'Walking with God', desc: 'Prayer, devotion & spiritual rhythms', plans: [PLANS_EXPLORE[0], PLANS_EXPLORE[1]] },
  { name: 'Personal Growth', desc: 'Identity, courage & wisdom', plans: [PLANS_EXPLORE[2], PLANS_EXPLORE[3]] },
  { name: 'Roles & Identity', desc: 'Womanhood, marriage & motherhood', plans: [PLANS_EXPLORE[0], PLANS_EXPLORE[1]] },
  { name: 'Life Seasons', desc: 'Singleness, transitions & waiting', plans: [PLANS_EXPLORE[2], PLANS_EXPLORE[3]] },
];

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('current');
  const [detail, setDetail] = useState<Plan | null>(null);

  const tabIdx = TABS.indexOf(tab);
  const progress = useSharedValue(tabIdx);
  const tabsWidth = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(tabIdx, { duration: 500 });
  }, [tabIdx, progress]);

  const indicatorStyle = useAnimatedStyle(() => {
    const w = Math.max(0, (tabsWidth.value - 6) / 3);
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
          {tab === 'current' && (
            <View>
              <Text style={styles.sectionLabel}>IN PROGRESS</Text>
              <TouchableOpacity style={styles.planRow} activeOpacity={0.75}>
                <ImagePlaceholder ac={LAV} />
                <View style={styles.planMeta}>
                  <Text style={styles.planDays}>Day 12 of 30</Text>
                  <Text style={styles.planTitle}>30-Day Psalms</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: '40%', backgroundColor: ROSE }]} />
                  </View>
                </View>
                <TouchableOpacity style={[styles.startBtn, { backgroundColor: ROSE }]}>
                  <Text style={[styles.startBtnText, { color: '#fff' }]}>Continue</Text>
                </TouchableOpacity>
              </TouchableOpacity>

              <Text style={[styles.sectionLabel, { marginTop: 25 }]}>TODAY'S READING</Text>
              {[
                { title: 'Psalm 118', time: '~5 min', ac: ROSE },
                { title: 'Psalm 119:1–48', time: '~8 min', ac: LAV },
              ].map((r, i) => (
                <TouchableOpacity key={i} style={styles.planRow} activeOpacity={0.75}>
                  <ImagePlaceholder ac={r.ac} />
                  <View style={styles.planMeta}>
                    <Text style={styles.planDays}>{r.time}</Text>
                    <Text style={styles.planTitle}>{r.title}</Text>
                  </View>
                  <TouchableOpacity style={styles.startBtn}>
                    <Text style={styles.startBtnText}>Read</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {tab === 'explore' && (
            <View>
              <Text style={styles.bigSectionLabel}>FEATURED</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselContent}>
                {[
                  { grad: ['#F9A8C9', '#E8619A'] as const },
                  { grad: ['#C4B5FD', '#9D7FE0'] as const },
                  { grad: ['#FBBF77', '#E89243'] as const },
                ].map((p, i) => (
                  <View key={i} style={styles.featuredCard}>
                    <LinearGradient colors={p.grad} style={styles.featuredGrad}>
                      <View style={styles.featuredTag}>
                        <Text style={styles.featuredTagText}>50-DAY PLAN</Text>
                      </View>
                      <Text style={styles.featuredTitle}>Everyday Faith</Text>
                    </LinearGradient>
                  </View>
                ))}
              </ScrollView>

              <Text style={styles.bigSectionLabel}>HOW ARE YOU FEELING TODAY?</Text>
              <View style={{ height: 9 }} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emotionStrip} contentContainerStyle={styles.emotionContent}>
                <View style={styles.emotionGrid}>
                  {[EMOTION_TAGS.slice(0, 4), EMOTION_TAGS.slice(4)].map((row, ri) => (
                    <View key={ri} style={styles.emotionRow}>
                      {row.map(e => (
                        <TouchableOpacity key={e.label} activeOpacity={0.85} style={[styles.emotionTag, { backgroundColor: e.color }]}>
                          <Text style={styles.emotionLabel}>{e.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>

              {CATEGORIES.map((cat, ci) => (
                <View key={ci} style={styles.category}>
                  <View style={styles.catHeader}>
                    <Text style={styles.catName}>{cat.name}</Text>
                    <Text style={[styles.seeAll, { color: ROSE }]}>See all ›</Text>
                  </View>
                  <Text style={styles.catDesc}>{cat.desc}</Text>
                  {cat.plans.map((plan, i) => (
                    <PlanRow key={i} plan={plan} onPress={() => setDetail(plan)} />
                  ))}
                </View>
              ))}
            </View>
          )}

          {tab === 'completed' && (
            <View>
              {[
                { title: 'Advent Journey 2024', days: 25, date: 'Dec 25, 2024', ac: '#7DB87D' },
                { title: 'Women of Faith', days: 14, date: 'Mar 8, 2025', ac: LAV },
              ].map((p, i) => (
                <TouchableOpacity key={i} style={styles.planRow} activeOpacity={0.75}>
                  <View style={{ position: 'relative' }}>
                    <ImagePlaceholder ac={p.ac} />
                    <View style={styles.checkBadge}>
                      <Feather name="check" size={12} color="#fff" />
                    </View>
                  </View>
                  <View style={styles.planMeta}>
                    <Text style={styles.planDays}>{p.days} Days · {p.date}</Text>
                    <Text style={styles.planTitle}>{p.title}</Text>
                  </View>
                  <TouchableOpacity style={styles.startBtn}>
                    <Text style={styles.startBtnText}>Review</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              <View style={styles.emptyHint}>
                <Text style={styles.emptyTitle}>More plans await</Text>
                <Text style={styles.emptyDesc}>Explore new plans to continue your journey</Text>
                <TouchableOpacity onPress={() => setTab('explore')} style={[styles.exploreCta, { backgroundColor: ROSE }]}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Explore Plans</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>

        <View style={{ height: 23 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: P, paddingTop: 0 },
  header: { paddingTop: 9, marginBottom: 18 },
  heading: { fontSize: 30, fontWeight: '500', color: TXT, marginBottom: 2 },
  subheading: { fontSize: 14, color: TXTSUB },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 22,
    padding: 3,
    marginBottom: 21,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 18,
    backgroundColor: ROSE,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 15, fontWeight: '600' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0E0E0E',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  bigSectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0E0E0E',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    marginBottom: 6,
  },
  planMeta: { flex: 1, minWidth: 0 },
  planDays: { fontSize: 13, color: TXTSUB, marginBottom: 3, fontWeight: '500' },
  planTitle: { fontSize: 15.5, fontWeight: '600', color: TXT, lineHeight: 21 },
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
  startBtnText: { fontSize: 14, fontWeight: '700', color: TXT },
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
  featuredCard: { width: 281 },
  featuredGrad: {
    height: 173,
    borderRadius: 11,
    padding: 17,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  featuredTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 2,
  },
  featuredTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  featuredTitle: {
    fontSize: 19,
    fontWeight: '400',
    color: '#fff',
    lineHeight: 24,
  },
  emotionStrip: { marginBottom: 30 },
  emotionContent: { paddingBottom: 6 },
  emotionGrid: { flexDirection: 'column', gap: 10 },
  emotionRow: { flexDirection: 'row', gap: 11 },
  emotionTag: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emotionLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.4,
  },
  category: { marginBottom: 30 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  catName: { fontSize: 21, fontWeight: '600', color: TXT },
  seeAll: { fontSize: 14 },
  catDesc: { fontSize: 13, color: TXTSUB, marginBottom: 14 },
  emptyHint: { textAlign: 'center', paddingVertical: 23, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: TXT, marginBottom: 5 },
  emptyDesc: { fontSize: 14, color: TXTSUB, textAlign: 'center' },
  exploreCta: {
    marginTop: 16,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 11,
  },
  // Detail
  detailScroll: { paddingHorizontal: P, paddingBottom: 115, paddingTop: 0 },
  detailNav: { paddingTop: 7, marginBottom: 16 },
  backBtn: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: {
    fontSize: 25,                      // +15% from 22
    fontWeight: '500',
    color: TXT,
    lineHeight: 32,
    marginBottom: 16,
  },
  heroImagePlaceholder: {
    width: '100%',
    height: 230,
    borderRadius: 17,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  heroImageLabel: { fontSize: 14, fontWeight: '600', marginTop: 9, letterSpacing: 1 },     // +15% from 12
  detailSubtitle: { fontSize: 18, fontWeight: '600', color: TXT, marginBottom: 6, lineHeight: 26 },  // +15% from 16
  detailGoal: { fontSize: 17, color: TXTSUB, lineHeight: 26, marginBottom: 25 },           // +5 % bump (16 → 17), line-height held
  dailyPlanLabel: { fontSize: 18, fontWeight: '600', color: TXT, marginBottom: 12 },       // +15% from 16
  dayStrip: { marginHorizontal: -P, marginBottom: 0 },
  dayStripContent: { paddingHorizontal: P, gap: 9, paddingBottom: 7, marginBottom: 23 },
  dayBtn: {
    flexShrink: 0,
    width: 72,                                                                             // +20% from 60
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayNum: { fontSize: 20, fontWeight: '700', lineHeight: 25 },                             // +15% from 17
  dayDate: { fontSize: 13, marginTop: 2 },                                                 // +15% from 11
  dayContent: { marginBottom: 18, marginTop: 15 },                                         // −8 px gap below day strip
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dayTitle: { fontSize: 18, fontWeight: '700', color: TXT },                               // +15% from 16
  timeBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 11 },
  timeBadgeText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },                  // +15% from 13
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 13,
    marginBottom: 9,
  },
  walkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  walkMeta: { flex: 1 },
  walkCaption: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },  // +15% from 11
  walkTitle: { fontSize: 17, fontWeight: '600', color: TXT },                              // +15% from 15
  verseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 13,
    marginBottom: 9,
  },
  verseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  verseName: { flex: 1, fontSize: 17, fontWeight: '500', color: TXT },                     // +15% from 15
  startReadingBtn: {
    height: 55,
    borderRadius: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 46,
  },
  startReadingText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },  // +15% from 16
});
