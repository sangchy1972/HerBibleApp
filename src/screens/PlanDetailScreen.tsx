import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Animated, { SlideInRight, Easing } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { usePlans } from '../state/PlansContext';
import { usePlanProfile } from '../state/PlanProfileContext';
import { useActivity } from '../state/ActivityContext';
import PlanCover from '../components/PlanCover';
import type { RootStackParamList } from '../navigation/types';
import type { FullPlan } from '../services/plansService';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlanDetail'>;
type Rt  = RouteProp<RootStackParamList, 'PlanDetail'>;

// Detail page. Rendered entirely from the cached summary on mount — no network
// needed to show the intro, key verses, or per-day outlines.
//
// The full plan (with every day's teaching, reflection, prayer …) is fetched
// lazily when the user taps "Start Reading" or a Day chip. This keeps the
// initial paint instant even on slow connections.
export default function PlanDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const slug = route.params.slug;

  const { getPlanBySlug, loadFull } = usePlans();
  const { trackStart } = usePlanProfile();
  const { markToday } = useActivity();

  const summary = getPlanBySlug(slug);

  const [activeDay, setActiveDay] = useState(0);
  const [fullPlan, setFullPlan] = useState<FullPlan | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { markToday(); }, [markToday]);

  const ensureFullLoaded = async () => {
    if (fullPlan || loadingFull) return fullPlan;
    setLoadingFull(true);
    setLoadError(null);
    try {
      const data = await loadFull(slug);
      setFullPlan(data);
      return data;
    } catch (e: any) {
      setLoadError(String(e?.message || e));
      return null;
    } finally {
      setLoadingFull(false);
    }
  };

  const onStart = async () => {
    trackStart(slug);
    await ensureFullLoaded();
  };

  if (!summary) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={8} style={[styles.backBtn, { marginLeft: P }]}>
          <Feather name="chevron-left" size={22} color={TXT} />
        </TouchableOpacity>
        <Text style={[styles.notFound]}>This plan isn't available right now.</Text>
      </View>
    );
  }

  const dayOutline = summary.day_outlines[activeDay];
  const fullDay = fullPlan?.days?.[activeDay];

  return (
    <Animated.ScrollView
      entering={SlideInRight.duration(700).easing(Easing.out(Easing.cubic))}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={8} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={TXT} />
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{summary.title}</Text>

      <PlanCover cover={summary.cover} width="100%" height={230} radius={17} style={{ marginBottom: 18 }} />

      {!!summary.subtitle && <Text style={styles.subtitle}>{summary.subtitle}</Text>}
      {!!summary.goal && <Text style={styles.goal}>{summary.goal}</Text>}

      {/* Key verses pulled from summary — no network round-trip */}
      {summary.key_verses?.length > 0 && (
        <View style={styles.keyVerses}>
          <Text style={styles.sectionLabel}>KEY VERSES</Text>
          {summary.key_verses.slice(0, 5).map((v, i) => (
            <View key={i} style={styles.keyVerseRow}>
              <Feather name="book-open" size={14} color={TXTSUB} />
              <Text style={styles.keyVerseText}>{v.display}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.dailyPlanLabel}>Daily Plan</Text>

      {/* Horizontal day-chip strip from day_outlines (cached) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip} contentContainerStyle={styles.dayStripContent}>
        {summary.day_outlines.map((d, i) => {
          const sel = i === activeDay;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => {
                setActiveDay(i);
                ensureFullLoaded();
              }}
              activeOpacity={0.8}
              style={[styles.dayBtn, { backgroundColor: sel ? ROSE : 'rgba(255,255,255,0.7)', borderColor: sel ? 'transparent' : 'rgba(30,27,46,0.08)' }]}
            >
              <Text style={[styles.dayNum, { color: sel ? '#fff' : TXT }]}>{d.day}</Text>
              <Text style={[styles.dayHint, { color: sel ? 'rgba(255,255,255,0.9)' : TXTSUB }]} numberOfLines={1}>
                Day {d.day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Day card. Outline data is always available; expanded teaching arrives
          after lazy load. */}
      <View style={styles.dayContent}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>{dayOutline?.title || `Day ${activeDay + 1}`}</Text>
          {!!dayOutline?.estimated_minutes && (
            <View style={[styles.timeBadge, { backgroundColor: `${ROSE}18` }]}>
              <Text style={[styles.timeBadgeText, { color: ROSE }]}>~{dayOutline.estimated_minutes} MIN</Text>
            </View>
          )}
        </View>

        {!!dayOutline?.subtitle && <Text style={styles.daySubtitle}>{dayOutline.subtitle}</Text>}

        {!!dayOutline?.scripture_ref && (
          <View style={styles.scriptureRow}>
            <Feather name="book-open" size={16} color={ROSE} />
            <Text style={styles.scriptureRef}>{dayOutline.scripture_ref}</Text>
          </View>
        )}

        {loadingFull && (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={ROSE} />
            <Text style={styles.loadingText}>Loading today's reading…</Text>
          </View>
        )}

        {loadError && (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={ensureFullLoaded} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {fullDay && Array.isArray(fullDay.sections) && (
          <View style={{ marginTop: 14 }}>
            {fullDay.sections.map((s: any, i: number) => (
              <DaySection key={i} section={s} />
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity style={[styles.startReadingBtn, { backgroundColor: ROSE }]} onPress={onStart} activeOpacity={0.9}>
        <Text style={styles.startReadingText}>{fullPlan ? 'Continue Reading' : 'Start Reading Plan'}</Text>
      </TouchableOpacity>

      <View style={{ height: 23 }} />
    </Animated.ScrollView>
  );
}

// Renders one section from the full plan's days[].sections[] array. We support
// the common types (scripture_focus / teaching / reflection / action / prayer /
// verse_wall / additional_scriptures) and silently skip unknown ones.
function DaySection({ section }: { section: any }) {
  const type = section?.type;
  const heading = section?.heading;

  if (type === 'scripture_focus' && section.verse) {
    return (
      <View style={styles.sectionCard}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        <Text style={styles.verseDisplay}>{section.verse.display}</Text>
        {section.verse.text && <Text style={styles.verseText}>"{section.verse.text}"</Text>}
      </View>
    );
  }

  if (type === 'teaching' && Array.isArray(section.paragraphs)) {
    return (
      <View style={styles.sectionCard}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        {section.paragraphs.map((p: string, i: number) => (
          <Text key={i} style={styles.bodyText}>{p}</Text>
        ))}
      </View>
    );
  }

  if (type === 'reflection') {
    const prompts = section.prompts || section.questions || [];
    return (
      <View style={styles.sectionCard}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        {prompts.map((q: string, i: number) => (
          <Text key={i} style={styles.bodyText}>• {q}</Text>
        ))}
      </View>
    );
  }

  if (type === 'action') {
    return (
      <View style={styles.sectionCard}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        {section.text && <Text style={styles.bodyText}>{section.text}</Text>}
        {Array.isArray(section.steps) && section.steps.map((s: string, i: number) => (
          <Text key={i} style={styles.bodyText}>{i + 1}. {s}</Text>
        ))}
      </View>
    );
  }

  if (type === 'prayer') {
    return (
      <View style={[styles.sectionCard, { backgroundColor: 'rgba(232,97,154,0.08)' }]}>
        {heading && <Text style={[styles.sectionHeading, { color: ROSE }]}>{heading}</Text>}
        {section.text && <Text style={[styles.bodyText, { fontStyle: 'italic' }]}>{section.text}</Text>}
        {Array.isArray(section.paragraphs) && section.paragraphs.map((p: string, i: number) => (
          <Text key={i} style={[styles.bodyText, { fontStyle: 'italic' }]}>{p}</Text>
        ))}
      </View>
    );
  }

  if (type === 'verse_wall' || type === 'additional_scriptures') {
    const verses = section.verses || [];
    return (
      <View style={styles.sectionCard}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        {verses.map((v: any, i: number) => (
          <View key={i} style={styles.verseListRow}>
            <Feather name="book-open" size={13} color={TXTSUB} />
            <Text style={styles.verseListText}>{v.display || v.ref}</Text>
          </View>
        ))}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: P, paddingTop: 0 },
  nav: { paddingTop: 7, marginBottom: 16 },
  backBtn: {
    width: 39, height: 39, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 25, fontWeight: '500', color: TXT, lineHeight: 32, marginBottom: 16 },
  subtitle: { fontSize: 18, fontWeight: '600', color: TXT, marginBottom: 6, lineHeight: 26 },
  goal: { fontSize: 16, color: TXTSUB, lineHeight: 26, marginBottom: 22 },
  keyVerses: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#0E0E0E',
    letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10,
  },
  keyVerseRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  keyVerseText: { fontSize: 15, fontWeight: '500', color: TXT },
  dailyPlanLabel: { fontSize: 18, fontWeight: '600', color: TXT, marginBottom: 12 },
  dayStrip: { marginHorizontal: -P, marginBottom: 0 },
  dayStripContent: { paddingHorizontal: P, gap: 9, paddingBottom: 7 },
  dayBtn: {
    flexShrink: 0, width: 64, paddingVertical: 12,
    borderRadius: 11, borderWidth: 1, alignItems: 'center',
  },
  dayNum: { fontSize: 20, fontWeight: '700', lineHeight: 25 },
  dayHint: { fontSize: 11, marginTop: 2 },
  dayContent: { marginTop: 23 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dayTitle: { fontSize: 19, fontWeight: '700', color: TXT, flex: 1, marginRight: 12 },
  daySubtitle: { fontSize: 15, color: TXTSUB, lineHeight: 22, marginBottom: 12 },
  timeBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 11 },
  timeBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  scriptureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 13, marginBottom: 6,
  },
  scriptureRef: { fontSize: 15.5, fontWeight: '600', color: TXT, flex: 1 },
  loadingBlock: { paddingVertical: 24, alignItems: 'center' },
  loadingText: { color: TXTSUB, fontSize: 13, marginTop: 8 },
  errorBlock: { paddingVertical: 16 },
  errorText: { color: TXTSUB, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  retryBtn: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8, backgroundColor: 'rgba(30,27,46,0.06)', borderRadius: 16 },
  retryText: { fontSize: 13, fontWeight: '700', color: TXT },
  sectionCard: {
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
    marginBottom: 9,
  },
  sectionHeading: { fontSize: 13, fontWeight: '700', color: TXT, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  verseDisplay: { fontSize: 15, fontWeight: '700', color: TXT, marginBottom: 6 },
  verseText: { fontSize: 15, color: TXT, lineHeight: 24, fontStyle: 'italic' },
  bodyText: { fontSize: 15, color: TXT, lineHeight: 24, marginBottom: 8 },
  verseListRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  verseListText: { fontSize: 14, color: TXT, fontWeight: '500' },
  startReadingBtn: {
    height: 55, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginTop: 30,
  },
  startReadingText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  notFound: { textAlign: 'center', marginTop: 60, color: TXTSUB, fontSize: 15 },
});
