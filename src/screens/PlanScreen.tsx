import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { PLANS_EXPLORE } from '../constants/data';

type Plan = typeof PLANS_EXPLORE[0];

function ImagePlaceholder({ ac, width = 100, height = 66.6, radius = 5 }: {
  ac: string; width?: number; height?: number; radius?: number;
}) {
  return (
    <View style={{ width, height, borderRadius: radius, backgroundColor: `${ac}22`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Feather name="image" size={22} color={ac} style={{ opacity: 0.55 }} />
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

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
      {/* Back */}
      <View style={styles.detailNav}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={TXT} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={styles.detailTitle}>{plan.title}</Text>

      {/* Hero image placeholder */}
      <View style={[styles.heroImagePlaceholder, { borderColor: `${plan.ac}55`, backgroundColor: `${plan.ac}18` }]}>
        <Feather name="image" size={40} color={plan.ac} style={{ opacity: 0.4 }} />
        <Text style={[styles.heroImageLabel, { color: plan.ac }]}>HERO IMAGE</Text>
      </View>

      {/* Subtitle + Goal */}
      <Text style={styles.detailSubtitle}>{plan.subtitle}</Text>
      <Text style={styles.detailGoal}>{plan.goal}</Text>

      {/* Daily Plan strip */}
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

      {/* Selected day content */}
      <View style={styles.dayContent}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>Day {cur.n} of {plan.days}</Text>
          <View style={[styles.timeBadge, { backgroundColor: `${plan.ac}18` }]}>
            <Text style={[styles.timeBadgeText, { color: plan.ac }]}>~8 MIN</Text>
          </View>
        </View>

        {/* Daily walk */}
        <TouchableOpacity style={styles.walkRow} activeOpacity={0.8}>
          <View style={[styles.walkIcon, { backgroundColor: `${plan.ac}22` }]}>
            <Feather name="arrow-right" size={14} color={plan.ac} />
          </View>
          <View style={styles.walkMeta}>
            <Text style={[styles.walkCaption, { color: plan.ac }]}>DAILY WALK</Text>
            <Text style={styles.walkTitle}>{cur.walk}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={TXTSUB} />
        </TouchableOpacity>

        {/* Verses */}
        {cur.verses.map((v, i) => (
          <TouchableOpacity key={i} style={styles.verseRow} activeOpacity={0.8}>
            <View style={styles.verseIcon}>
              <Feather name="book-open" size={12} color={TXTSUB} style={{ opacity: 0.6 }} />
            </View>
            <Text style={styles.verseName}>{v}</Text>
            <Feather name="chevron-right" size={16} color={TXTSUB} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Start button */}
      <TouchableOpacity style={[styles.startReadingBtn, { backgroundColor: plan.ac }]}>
        <Text style={styles.startReadingText}>Start Reading Plan</Text>
      </TouchableOpacity>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const EMOTION_TAGS = [
  { label: 'LOVE', grad: ['#E8619A', '#9D2D5C'] as const },
  { label: 'HEALING', grad: ['#F4856B', '#C94A36'] as const },
  { label: 'ANXIETY', grad: ['#7BA3E0', '#3D5FA8'] as const },
  { label: 'ANGER', grad: ['#5BA8A0', '#2E6B6B'] as const },
  { label: 'GRIEF', grad: ['#9D7FE0', '#5C3FA0'] as const },
  { label: 'JOY', grad: ['#F4B860', '#D4862A'] as const },
  { label: 'FEAR', grad: ['#6B7B96', '#3F4A66'] as const },
  { label: 'PEACE', grad: ['#88B898', '#4A7A5E'] as const },
];

const CATEGORIES = [
  { name: 'Walking with God', desc: 'Prayer, devotion & spiritual rhythms', plans: [PLANS_EXPLORE[0], PLANS_EXPLORE[1]] },
  { name: 'Personal Growth', desc: 'Identity, courage & wisdom', plans: [PLANS_EXPLORE[2], PLANS_EXPLORE[3]] },
  { name: 'Roles & Identity', desc: 'Womanhood, marriage & motherhood', plans: [PLANS_EXPLORE[0], PLANS_EXPLORE[1]] },
  { name: 'Life Seasons', desc: 'Singleness, transitions & waiting', plans: [PLANS_EXPLORE[2], PLANS_EXPLORE[3]] },
];

export default function PlanScreen() {
  const [tab, setTab] = useState<'current' | 'explore' | 'completed'>('current');
  const [detail, setDetail] = useState<Plan | null>(null);

  if (detail) return <PlanDetail plan={detail} onBack={() => setDetail(null)} />;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>My Plans</Text>
          <Text style={styles.subheading}>Your reading journey</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['current', 'explore', 'completed'] as const).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, { backgroundColor: tab === t ? ROSE : 'transparent' }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, { color: tab === t ? '#fff' : TXTSUB }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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

            <Text style={[styles.sectionLabel, { marginTop: 22 }]}>TODAY'S READING</Text>
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
            {/* Featured carousel */}
            <Text style={styles.sectionLabel}>FEATURED</Text>
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

            {/* Emotion garden */}
            <Text style={[styles.sectionLabel, { color: '#202020' }]}>HOW ARE YOU FEELING TODAY?</Text>
            <Text style={styles.emotionDesc}></Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emotionStrip} contentContainerStyle={styles.emotionContent}>
              {EMOTION_TAGS.map((e, i) => (
                <TouchableOpacity key={i} activeOpacity={0.85}>
                  <LinearGradient colors={e.grad} style={styles.emotionTag}>
                    <Text style={styles.emotionLabel}>{e.label}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Category sections */}
            {CATEGORIES.map((cat, ci) => (
              <View key={ci} style={styles.category}>
                <View style={styles.catHeader}>
                  <Text style={styles.catName}>{cat.name}</Text>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={[styles.seeAll, { color: ROSE }]}>See all</Text>
                    <Feather name="chevron-right" size={12} color={ROSE} />
                  </TouchableOpacity>
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
                    <Feather name="check" size={10} color="#fff" />
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
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Explore Plans</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: P, paddingTop: 0 },
  header: { paddingTop: 8, marginBottom: 16 },
  heading: { fontSize: 28, fontWeight: '500', color: TXT, marginBottom: 2 },
  subheading: { fontSize: 13, color: TXTSUB },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E0E0E',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.05)',
  },
  planMeta: { flex: 1, minWidth: 0 },
  planDays: { fontSize: 12, color: TXTSUB, marginBottom: 3, fontWeight: '500' },
  planTitle: { fontSize: 14.5, fontWeight: '600', color: TXT, lineHeight: 19 },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.08)',
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  startBtn: {
    flexShrink: 0,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  startBtnText: { fontSize: 13, fontWeight: '700', color: TXT },
  checkBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7DB87D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carousel: { marginBottom: 24 },
  carouselContent: { gap: 12, paddingBottom: 6 },
  featuredCard: { width: 260 },
  featuredGrad: {
    height: 150,
    borderRadius: 10,
    padding: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  featuredTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  featuredTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#fff',
    lineHeight: 22,
  },
  emotionDesc: { fontSize: 13, color: TXT, marginBottom: 12 },
  emotionStrip: { marginBottom: 26 },
  emotionContent: { gap: 10, paddingBottom: 4 },
  emotionTag: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 10,
  },
  emotionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.4,
  },
  category: { marginBottom: 26 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catName: { fontSize: 19, fontWeight: '600', color: TXT },
  seeAll: { fontSize: 12, fontWeight: '600' },
  catDesc: { fontSize: 12, color: TXTSUB, marginBottom: 12 },
  emptyHint: { textAlign: 'center', paddingVertical: 20, alignItems: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: TXT, marginBottom: 4 },
  emptyDesc: { fontSize: 13, color: TXTSUB, textAlign: 'center' },
  exploreCta: {
    marginTop: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  // Detail
  detailScroll: { paddingHorizontal: P, paddingBottom: 100, paddingTop: 0 },
  detailNav: { paddingTop: 6, marginBottom: 14 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 24, color: TXT, lineHeight: 30 },
  detailTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: TXT,
    lineHeight: 26,
    marginBottom: 14,
  },
  heroImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroImageLabel: { fontSize: 11, fontWeight: '600', marginTop: 8, letterSpacing: 1 },
  detailSubtitle: { fontSize: 15, fontWeight: '600', color: TXT, marginBottom: 5, lineHeight: 21 },
  detailGoal: { fontSize: 13, color: TXTSUB, lineHeight: 21, marginBottom: 22 },
  dailyPlanLabel: { fontSize: 15, fontWeight: '600', color: TXT, marginBottom: 10 },
  dayStrip: { marginHorizontal: -P, marginBottom: 0 },
  dayStripContent: { paddingHorizontal: P, gap: 8, paddingBottom: 6, marginBottom: 20 },
  dayBtn: {
    flexShrink: 0,
    width: 56,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayNum: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  dayDate: { fontSize: 10, marginTop: 2 },
  dayContent: { marginBottom: 16, marginTop: 20 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayTitle: { fontSize: 15, fontWeight: '700', color: TXT },
  timeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  timeBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    marginBottom: 8,
  },
  walkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  walkMeta: { flex: 1 },
  walkCaption: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  walkTitle: { fontSize: 14, fontWeight: '600', color: TXT },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    marginBottom: 8,
  },
  verseIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(30,27,46,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  verseName: { flex: 1, fontSize: 14, fontWeight: '500', color: TXT },
  startReadingBtn: {
    height: 40,
    borderRadius: 20,
    width: 330,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    marginBottom: 0,
  },
  startReadingText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
});
