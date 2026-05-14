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
import { usePlanCompletion } from '../state/PlanCompletionContext';
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
  const { trackStart, trackComplete } = usePlanProfile();
  const { markToday } = useActivity();
  const { isDayComplete, markDayComplete, planProgress } = usePlanCompletion();

  const summary = getPlanBySlug(slug);

  const [activeDay, setActiveDay] = useState(0);
  const [fullPlan, setFullPlan] = useState<FullPlan | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { markToday(); }, [markToday]);

  // Plan-level progress. day_outlines[].day is the 1-indexed day number that
  // PlanCompletionContext stores against; we read it for both the day-strip
  // check overlays and the bottom-CTA state machine.
  const total = summary?.duration_days || summary?.day_outlines?.length || 0;
  const progress = total > 0 ? planProgress(slug, total) : { completed: 0, total: 0, complete: false };
  const currentDayNum = summary?.day_outlines?.[activeDay]?.day ?? activeDay + 1;
  const thisDayDone = isDayComplete(slug, currentDayNum);

  // Fire trackComplete (behavior signal) exactly once when the plan flips to
  // fully complete. PlanCompletionContext also stamps `finishedAt` and
  // AchievementsContext re-evaluates as soon as `completedPlans` grows.
  useEffect(() => {
    if (progress.complete) trackComplete(slug);
  }, [progress.complete, slug, trackComplete]);

  const onMarkDayComplete = () => {
    if (!summary) return;
    markDayComplete(slug, currentDayNum, total);
    // Auto-advance to the next un-finished day so the user can keep reading.
    const next = summary.day_outlines.findIndex(d => !isDayComplete(slug, d.day));
    if (next >= 0 && next !== activeDay) {
      setActiveDay(next);
      ensureFullLoaded();
    }
  };

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

      <View style={styles.dailyPlanHeader}>
        <Text style={styles.dailyPlanLabel}>Daily Plan</Text>
        {total > 0 && (
          <Text style={styles.progressText}>
            {progress.completed} / {total} days
          </Text>
        )}
      </View>

      {/* Slim progress bar — visualises the same fraction as the text above. */}
      {total > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(progress.completed / total) * 100}%` }]} />
        </View>
      )}

      {/* Horizontal day-chip strip. A small check overlay marks days the user
          has already finished — they can still tap them to re-read. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip} contentContainerStyle={styles.dayStripContent}>
        {summary.day_outlines.map((d, i) => {
          const sel = i === activeDay;
          const done = isDayComplete(slug, d.day);
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
              {done && (
                <View style={styles.dayCheckBadge}>
                  <Feather name="check" size={11} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Day card. Outline data (walk title + verse list) is always available
          from the cached summary; the long teaching/reflection bodies arrive
          after lazy-load. */}
      <View style={styles.dayContent}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>Day {currentDayNum} of {total}</Text>
          {!!dayOutline?.estimated_minutes && (
            <View style={[styles.timeBadge, { backgroundColor: `${ROSE}18` }]}>
              <Text style={[styles.timeBadgeText, { color: ROSE }]}>~{dayOutline.estimated_minutes} MIN</Text>
            </View>
          )}
        </View>

        {/* DAILY WALK row — day title, tap to load the full body. */}
        {!!dayOutline?.title && (
          <TouchableOpacity style={styles.walkRow} activeOpacity={0.8} onPress={onStart}>
            <View style={[styles.walkIcon, { backgroundColor: `${ROSE}22` }]}>
              <Feather name="arrow-right" size={16} color={ROSE} />
            </View>
            <View style={styles.walkMeta}>
              <Text style={[styles.walkCaption, { color: ROSE }]}>DAILY WALK</Text>
              <Text style={styles.walkTitle} numberOfLines={2}>{dayOutline.title}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={TXTSUB} />
          </TouchableOpacity>
        )}

        {!!dayOutline?.subtitle && <Text style={styles.daySubtitle}>{dayOutline.subtitle}</Text>}

        {/* Today's scripture list — pulled from `scripture_refs` (1.1.0+).
            Falls back to the legacy single `scripture_ref` on older
            summaries. Each row taps to load the full plan so DaySection
            below can render the verse text. */}
        {(() => {
          const refs: string[] = dayOutline?.scripture_refs && dayOutline.scripture_refs.length > 0
            ? dayOutline.scripture_refs
            : (dayOutline?.scripture_ref ? [dayOutline.scripture_ref] : []);
          return refs.map((ref, i) => (
            <TouchableOpacity key={`${currentDayNum}-${i}`} style={styles.verseRow} activeOpacity={0.8} onPress={onStart}>
              <View style={styles.verseIcon}>
                <Feather name="book-open" size={15} color={TXTSUB} />
              </View>
              <Text style={styles.verseName}>{ref}</Text>
              <Feather name="chevron-right" size={18} color={TXTSUB} />
            </TouchableOpacity>
          ));
        })()}

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

      {/* Bottom CTA state machine. Plan flow is:
            ① not yet loaded   → "Start Reading Plan" (fetches the full plan)
            ② loaded, day open → "Mark Day N Complete" (writes completion + auto-advances)
            ③ this day done    → "Day N Completed" (idle, mark already counted)
            ④ all days done    → "Plan Completed" with check ribbon.
          Completion is per-day; the plan flips to `finished` only when every
          day's check has been set. AchievementsContext keys off that flip. */}
      {progress.complete ? (
        <View style={[styles.startReadingBtn, styles.completedBtn]}>
          <Feather name="check-circle" size={20} color="#fff" />
          <Text style={styles.startReadingText}>Plan Completed</Text>
        </View>
      ) : !fullPlan ? (
        <TouchableOpacity style={[styles.startReadingBtn, { backgroundColor: ROSE }]} onPress={onStart} activeOpacity={0.9}>
          <Text style={styles.startReadingText}>Start Reading Plan</Text>
        </TouchableOpacity>
      ) : thisDayDone ? (
        <View style={[styles.startReadingBtn, styles.dayDoneBtn]}>
          <Feather name="check" size={18} color={ROSE} />
          <Text style={[styles.startReadingText, { color: ROSE }]}>Day {currentDayNum} Completed</Text>
        </View>
      ) : (
        <TouchableOpacity style={[styles.startReadingBtn, { backgroundColor: ROSE }]} onPress={onMarkDayComplete} activeOpacity={0.9}>
          <Text style={styles.startReadingText}>Mark Day {currentDayNum} Complete</Text>
        </TouchableOpacity>
      )}

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

  if (type === 'verse_wall' || type === 'additional_scriptures' || type === 'scriptures' || type === 'scriptures_to_carry') {
    const verses = section.verses || [];
    // Some shapes have `verses` as objects with `display`/`ref`/`text`;
    // others (verse_to_memorize / scriptures) put the verse text inline
    // in paragraphs[]. Render both.
    return (
      <View style={styles.sectionCard}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        {verses.map((v: any, i: number) => (
          <View key={i} style={styles.verseListRow}>
            <Feather name="book-open" size={13} color={TXTSUB} />
            <Text style={styles.verseListText}>{v.display || v.ref}</Text>
          </View>
        ))}
        {Array.isArray(section.paragraphs) && section.paragraphs.map((p: string, i: number) => (
          <Text key={`p${i}`} style={[styles.bodyText, { fontStyle: 'italic' }]}>{p}</Text>
        ))}
      </View>
    );
  }

  // Generic fallback: any section type with a `heading` + (`paragraphs[]` or
  // `body`) gets rendered as a teaching card. This catches `opening`,
  // `today_as_you_read`, `one_line_intro`, `verse_to_memorize`, `why_matters`,
  // `memory_method`, `carry_today`, `before_we_begin`, `todays_scripture`,
  // `what_this_means`, `small_step` etc. — the walking-with-god plans rely
  // on these names. Without this catch-all the screen would silently drop
  // ~390 sections per language.
  const paras: string[] = Array.isArray(section?.paragraphs)
    ? section.paragraphs
    : (typeof section?.body === 'string' ? [section.body] : []);
  if (paras.length > 0) {
    const calloutTint = section?.ui_hint === 'card.callout' || section?.ui_hint === 'card.verse_hero';
    return (
      <View style={[styles.sectionCard, calloutTint && { backgroundColor: 'rgba(232,97,154,0.06)' }]}>
        {heading && <Text style={styles.sectionHeading}>{heading}</Text>}
        {paras.map((p: string, i: number) => (
          <Text key={i} style={styles.bodyText}>{p}</Text>
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
  dailyPlanHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  dailyPlanLabel: { fontSize: 18, fontWeight: '600', color: TXT },
  progressText: { fontSize: 13, fontWeight: '600', color: TXTSUB },
  progressTrack: {
    height: 5, borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.08)',
    overflow: 'hidden', marginBottom: 14,
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: ROSE },
  dayStrip: { marginHorizontal: -P, marginBottom: 0 },
  dayStripContent: { paddingHorizontal: P, gap: 9, paddingBottom: 7 },
  dayBtn: {
    flexShrink: 0, width: 64, paddingVertical: 12,
    borderRadius: 11, borderWidth: 1, alignItems: 'center',
    position: 'relative',
  },
  dayNum: { fontSize: 20, fontWeight: '700', lineHeight: 25 },
  dayHint: { fontSize: 11, marginTop: 2 },
  dayCheckBadge: {
    position: 'absolute', top: -5, right: -5,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#7DB87D',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FBF7F6',
  },
  dayContent: { marginTop: 23 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  dayTitle: { fontSize: 19, fontWeight: '700', color: TXT, flex: 1, marginRight: 12 },
  daySubtitle: { fontSize: 14, color: TXTSUB, lineHeight: 21, marginTop: 4, marginBottom: 14 },
  timeBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 11 },
  timeBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  // DAILY WALK row — primary action row at the top of the day card.
  walkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingHorizontal: 15, paddingVertical: 15,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 13, marginBottom: 9,
  },
  walkIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  walkMeta: { flex: 1 },
  walkCaption: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  walkTitle: { fontSize: 15, fontWeight: '600', color: TXT, lineHeight: 21 },
  // Verse rows — one per scripture_ref in the day outline.
  verseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingHorizontal: 15, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 13, marginBottom: 9,
  },
  verseIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.05)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  verseName: { flex: 1, fontSize: 15, fontWeight: '500', color: TXT },
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
    flexDirection: 'row', gap: 9,
    alignItems: 'center', justifyContent: 'center', marginTop: 30,
  },
  startReadingText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  // "Day N Completed" idle state — ROSE on the rim, white fill. Looks
  // closed-out without being a dead grey button.
  dayDoneBtn: {
    backgroundColor: 'rgba(232,97,154,0.08)',
    borderWidth: 1.5,
    borderColor: ROSE,
  },
  // "Plan Completed" — green so the celebration reads at a glance.
  completedBtn: { backgroundColor: '#7DB87D' },
  notFound: { textAlign: 'center', marginTop: 60, color: TXTSUB, fontSize: 15 },
});
