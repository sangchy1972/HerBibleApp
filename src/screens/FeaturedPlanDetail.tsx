import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { TXT, TXTSUB, ROSE } from '../constants/theme';

// Unified plan accent. Per user: every plan uses the SAME palette — pink for
// the selected / active state, green for completed days — instead of a
// per-plan brown/blue/green accent. PLAN_DONE is the app's standard
// "complete" green (matches the check badges elsewhere).
const PLAN_DONE = '#7DB87D';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { useTranslation } from '../state/TranslationsContext';
import { bookCodeToSlug, parseVerseRange } from '../constants/bibleBookCode';
import { fetchChapter } from '../services/bibleService';
import type { FullPlan, PlanSection, PlanVerseRef } from '../services/featuredPlansService';
import type { RootStackScreenProps } from '../navigation/types';
import { detailStyles as ds } from './planDetailStyles';
import { Image, Dimensions } from 'react-native';
import { cfImage } from '../services/cfImage';
import { LinearGradient } from 'expo-linear-gradient';
import { PLAN_COVER_CDN_BASE } from '../constants/plansApi';
import { useT } from '../i18n/useT';
import { localeFor } from '../i18n/locale';
import { useUILanguage } from '../state/UILanguageContext';

// Corpus-backed plan detail screen. Layout mirrors the demo PlanDetail
// (the "Identity in Christ" placeholder inside PlanScreen.tsx) byte-for-
// byte by importing `detailStyles` from the shared `planDetailStyles.ts`.
// Any spacing / type tweak made there ripples to both screens — that is
// the whole point of the extraction.
//
// The plan's `colorPrimary` plays the same role as the demo's `plan.ac`
// accent, threaded through hero placeholder, day-strip selection, time
// badge, walk row icon + caption, and the Start Reading Plan button.

// Full-width detail hero with Cloudflare right-sizing + original-URL fallback.
function HeroCover({ uri }: { uri: string }) {
  const [transformFailed, setTransformFailed] = useState(false);
  const src = transformFailed ? uri : cfImage(uri, Dimensions.get('window').width);
  return (
    <Image
      source={{ uri: src }}
      style={{ width: '100%', height: '100%' }}
      resizeMode="cover"
      onError={() => { if (!transformFailed) setTransformFailed(true); }}
    />
  );
}

export default function FeaturedPlanDetail({ route, navigation }: RootStackScreenProps<'FeaturedPlanDetail'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { slug } = route.params;
  const { getSummary, loadPlan, loadedPlans } = useFeaturedPlans();
  const { isDayComplete, records } = usePlanCompletion();
  const { current: translation } = useTranslation();
  const { lang: uiLang } = useUILanguage();
  const summary = getSummary(slug);

  // Lazy-fetch the full plan body (sections, walk titles, verse_wall) once;
  // the bundled summary already powers the hero / strip / button.
  const [plan, setPlan] = useState<FullPlan | null>(loadedPlans[slug] || null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (plan) return;
    loadPlan(slug).then(setPlan).catch(() => setLoadError(true));
  }, [slug, plan, loadPlan]);

  // Tap-to-retry for the error card. loadPlan is bounded by a network timeout
  // now, so a failed/slow fetch lands here instead of spinning forever; this
  // gives the user a way out without leaving + re-entering the screen.
  const retryLoad = useCallback(() => {
    setLoadError(false);
    loadPlan(slug).then(setPlan).catch(() => setLoadError(true));
  }, [slug, loadPlan]);

  // Warm the per-chapter fetchChapter cache for every verse_wall reference
  // the moment the plan body lands. PlanDayWalk re-uses the SAME cache key
  // (`bible:ch:<CACHE_TAG>:<code>:<slug>:<n>`), so by the time the user
  // taps "Start Reading Plan" the chapters are already on disk and the
  // verse-wall page renders without a spinner. Cost: N parallel CDN
  // requests (typically 5–10 per plan), all backgrounded; benefit: the
  // single most-complained-about wait in the app disappears.
  useEffect(() => {
    if (!plan) return;
    const seen = new Set<string>();
    const refs: { bookSlug: string; chapter: number }[] = [];
    for (const day of plan.days) {
      for (const section of day.sections) {
        const verses: PlanVerseRef[] = section.type === 'verse_wall'
          ? section.verses
          : section.type === 'scripture_focus' ? [section.verse] : [];
        for (const v of verses) {
          const bookSlug = bookCodeToSlug(v.bookCode);
          if (!bookSlug) continue;
          const key = `${bookSlug}:${v.chapter}`;
          if (seen.has(key)) continue;
          seen.add(key);
          refs.push({ bookSlug, chapter: v.chapter });
        }
      }
    }
    // Best-effort, fully detached — failures are silent because the user
    // path doesn't depend on the warm-up succeeding (PlanDayWalk's own
    // useEffect re-fetches and renders the chapter-load-error state).
    for (const { bookSlug, chapter } of refs) {
      fetchChapter(translation.code, translation.source, bookSlug, chapter).catch(() => {});
    }
  }, [plan, translation.code, translation.source]);

  // null = no manual selection yet → fall back to the computed default day
  // (first incomplete). A day tap sets it and pins the user's choice.
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // Day pending an out-of-schedule read confirmation (null = dialog hidden).
  const [confirmDay, setConfirmDay] = useState<number | null>(null);

  if (!summary) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ds.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={22} color={TXT} />
        </TouchableOpacity>
        <Text style={{ marginTop: 16, color: TXTSUB }}>{t('plan.notFound')}</Text>
      </View>
    );
  }

  // Unified pink accent for all plans (selected day, time badge, walk row,
  // Start button); completed days use PLAN_DONE green — see the day strip.
  const ac = ROSE;

  // Day cells: number, calendar date, walk title (from full plan when loaded),
  // verses. The date strip is ANCHORED to the day the plan was started
  // (firstStartedAt = when Day 1 was first completed): Day 1 keeps its real
  // date and Day N = start + (N-1). So if you began yesterday, Day 1 reads
  // yesterday's date and today is Day 2 — the strip no longer slides Day 1
  // onto "today" every time you open it. Before the plan is started there's no
  // record, so we anchor to today (a preview of the schedule from now).
  //
  // Memoized so the per-day Date()/toLocaleDateString() chain doesn't re-run
  // every render — only when the duration, plan body, language, or completion
  // record (which moves the anchor + the "today" cell) changes.
  const days = useMemo(() => {
    const startedAt = records[slug]?.firstStartedAt;
    const anchor = startedAt ? new Date(startedAt) : new Date();
    const todayStr = new Date().toDateString();
    const locale = localeFor(uiLang);
    return Array.from({ length: summary.duration }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      const content = plan?.days.find(x => x.day === i + 1);
      const verseWall = content?.sections.find(s => s.type === 'verse_wall') as
        Extract<PlanSection, { type: 'verse_wall' }> | undefined;
      return {
        n: i + 1,
        // Locale-aware date label (zh-CN "5月26日", de-DE "26. Mai", …).
        label: d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
        isToday: d.toDateString() === todayStr,
        walk: content?.title || `Day ${i + 1}`,
        verses: (verseWall?.verses || []) as PlanVerseRef[],
      };
    });
  }, [summary.duration, plan, uiLang, records, slug]);

  // Default selected day = first day not yet completed, so a returning user
  // lands on the reading they owe next (Day 1 done → Day 2), not always Day 1.
  // Once every day is done, falls back to the last day. A manual tap
  // (activeIdx) overrides; until then selIdx tracks this as the record hydrates.
  const defaultIdx = useMemo(() => {
    const done = records[slug]?.completedDays || [];
    for (let i = 0; i < summary.duration; i++) {
      if (!done.includes(i + 1)) return i;
    }
    return Math.max(0, summary.duration - 1);
  }, [records, slug, summary.duration]);
  const selIdx = activeIdx ?? defaultIdx;
  const cur = days[selIdx];
  // The day whose calendar date is today = the reading the user is meant to do
  // now. Opening any other day prompts a confirm (see startActiveDay).
  const todayIdx = useMemo(() => days.findIndex(d => d.isToday), [days]);

  const goToDay = (n: number) => navigation.navigate('PlanDayWalk', { slug, day: n });
  const startActiveDay = () => {
    // Reading out of schedule → custom confirm dialog ("This is not today's
    // reading…") instead of the OS Alert, so we control the look + button order.
    if (todayIdx >= 0 && selIdx !== todayIdx) {
      setConfirmDay(cur.n);
      return;
    }
    goToDay(cur.n);
  };

  const onVerseTap = (v: PlanVerseRef) => {
    const bookSlug = bookCodeToSlug(v.bookCode);
    if (!bookSlug) return;
    const { start, end } = parseVerseRange(v.verses);
    navigation.navigate('PlanVerseRead', {
      focus: { bookSlug, chapter: v.chapter, verseStart: start, verseEnd: end },
      planSlug: slug,
      day: cur.n,
    });
  };

  return (
    <>
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[ds.scroll, { paddingTop: insets.top + 8 }]}
    >
      <Animated.View entering={FadeIn.duration(220)}>{/* 360 → 220 — see audit note in useTabFocusEntrance */}
        <View style={ds.nav}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={ds.backBtn} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={TXT} />
          </TouchableOpacity>
        </View>
        <Text style={ds.title}>{summary.title}</Text>
        {/* Plan meta line — "N days · M min/day", localized via plan.metaLine.
            The day count itself is pre-formatted through plan.dayCount.*
            (handles singular/plural per language); minutes are passed as an
            integer placeholder. Falls back to a days-only string when the
            plan JSON doesn't carry an estimated_minutes_per_day. */}
        <Text style={ds.planInfo}>
          {summary.minutes
            ? t('plan.metaLine', {
                days: summary.duration === 1
                  ? t('plan.dayCount.one')
                  : t('plan.dayCount.other', { n: summary.duration }),
                min: summary.minutes,
              })
            : (summary.duration === 1
                ? t('plan.dayCount.one')
                : t('plan.dayCount.other', { n: summary.duration }))}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(50).duration(260)}>{/* 140/420 → 50/260 */}
        {/* Full-width hero. We can't reuse <PlanCover> here because it
            assumes a fixed pixel width; the hero stretches to the parent
            (screen minus horizontal padding). Inline the same layered
            gradient + Image pattern instead. */}
        <View style={ds.heroWrap}>
          <LinearGradient
            colors={[summary.colorPrimary, summary.colorSecondary] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          {/* Hero renders near screen width → ask Cloudflare for that width
              instead of the full original; on transform error (e.g. zone
              feature disabled) fall back to the untransformed URL. */}
          <HeroCover uri={`${PLAN_COVER_CDN_BASE}/${summary.slug}.webp`} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(100).duration(260)}>{/* 280/420 → 100/260 */}
        {/* Worker plan JSON returns identical strings for `subtitle` and
            `goal` on most plans — show only one in that case. The goal
            phrasing is the canonical one, so when they collide we keep
            goal and drop subtitle. */}
        {!!summary.subtitle && summary.subtitle !== summary.goal && (
          <Text style={ds.subtitle}>{summary.subtitle}</Text>
        )}
        {!!summary.goal && <Text style={ds.goal}>{summary.goal}</Text>}
      </Animated.View>

      {/* Start Reading Plan — placed BEFORE the Daily Plan list (per user),
          with 20px top + bottom margin. */}
      <Animated.View entering={FadeIn.delay(130).duration(260)}>
        <TouchableOpacity
          style={[ds.startReadingBtn, { backgroundColor: ac, marginTop: 20, marginBottom: 20 }, !plan && { opacity: 0.5 }]}
          onPress={startActiveDay}
          disabled={!plan}
          activeOpacity={0.9}
        >
          <Text style={ds.startReadingText}>{t('plan.startReading')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(150).duration(260)}>{/* 420/420 → 150/260 */}
        <Text style={ds.dailyPlanLabel}>{t('plan.dailyPlanLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ds.dayStrip} contentContainerStyle={ds.dayStripContent}>
          {days.map((d, i) => {
            const sel = i === selIdx;
            const done = isDayComplete(slug, d.n);
            // Completed → GREEN, full stop — no selection ring even when it's the
            // active day (per user: "done is done, just show green"). Selected-
            // but-not-done → pink. Upcoming → white with a hairline border.
            const filled = sel || done;
            const bg = done ? PLAN_DONE : sel ? ROSE : 'rgba(255,255,255,0.7)';
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setActiveIdx(i)}
                style={[ds.dayBtn, {
                  backgroundColor: bg,
                  borderWidth: 1,
                  borderColor: filled ? 'transparent' : 'rgba(30,27,46,0.08)',
                }]}
                activeOpacity={0.8}
              >
                <Text style={[ds.dayNum, { color: filled ? '#fff' : TXT }]}>{d.n}</Text>
                <Text style={[ds.dayDate, { color: filled ? 'rgba(255,255,255,0.9)' : TXTSUB }]}>{d.label}</Text>
                {done && (
                  <View style={[ds.dayCheck, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
                    <MaterialCommunityIcons name="check-bold" size={12} color={PLAN_DONE} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(200).duration(260)}>{/* 560/420 → 200/260 */}
        <View style={ds.dayContent}>
          <View style={ds.dayHeader}>
            <Text style={ds.dayTitle}>{t('plan.row.dayOfTotal', { n: cur.n, total: summary.duration })}</Text>
            <View style={[ds.timeBadge, { backgroundColor: `${ac}18` }]}>
              <Text style={[ds.timeBadgeText, { color: ac }]}>{t('planDetail.dayMin', { min: summary.minutes })}</Text>
            </View>
          </View>

          {/* Loading + error states sit in place of the walk row + verse rows
              while the full plan body fetches. They share the row-card chrome
              so vertical rhythm doesn't jump. */}
          {!plan && !loadError && (
            <View style={ds.loading}><ActivityIndicator color={ac} /></View>
          )}
          {loadError && (
            <TouchableOpacity style={ds.errorCard} onPress={retryLoad} activeOpacity={0.7}>
              <Feather name="refresh-cw" size={20} color={ac} />
              <Text style={ds.errorText}>{t('plan.loadFailed')}</Text>
            </TouchableOpacity>
          )}

          {plan && (
            <>
              <TouchableOpacity style={ds.walkRow} activeOpacity={0.8} onPress={startActiveDay}>
                <View style={[ds.walkIcon, { backgroundColor: `${ac}22` }]}>
                  <Feather name="arrow-right" size={16} color={ac} />
                </View>
                <View style={ds.walkMeta}>
                  <Text style={[ds.walkCaption, { color: ac }]}>{t('plan.dailyWalkCaption')}</Text>
                  <Text style={ds.walkTitle} numberOfLines={2}>{cur.walk}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={TXTSUB} />
              </TouchableOpacity>

              {cur.verses.map((v, i) => (
                <TouchableOpacity key={i} style={ds.verseRow} activeOpacity={0.8} onPress={() => onVerseTap(v)}>
                  <View style={ds.verseIcon}>
                    <Feather name="book-open" size={15} color={TXTSUB} />
                  </View>
                  <Text style={ds.verseName}>{v.display}</Text>
                  <Feather name="chevron-right" size={18} color={TXTSUB} />
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </Animated.View>

      <View style={{ height: 23 }} />
    </ScrollView>

    {/* Custom "not today's reading" confirm — styled card (not the OS Alert),
        with No on the LEFT and Yes on the RIGHT per user. */}
    <Modal
      visible={confirmDay != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setConfirmDay(null)}
    >
      <View style={ds.dialogOverlay}>
        <View style={ds.dialogCard}>
          <Text style={ds.dialogBody}>{t('planDetail.dialog.body')}</Text>
          <View style={ds.dialogDivider} />
          <View style={ds.dialogActions}>
            <TouchableOpacity style={ds.dialogBtn} activeOpacity={0.7} onPress={() => setConfirmDay(null)}>
              <Text style={ds.dialogBtnNo}>{t('planDetail.dialog.no')}</Text>
            </TouchableOpacity>
            <View style={ds.dialogVDivider} />
            <TouchableOpacity
              style={ds.dialogBtn}
              activeOpacity={0.7}
              onPress={() => { const d = confirmDay; setConfirmDay(null); if (d != null) goToDay(d); }}
            >
              <Text style={ds.dialogBtnYes}>{t('planDetail.dialog.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}
