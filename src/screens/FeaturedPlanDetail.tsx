import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { TXT, TXTSUB } from '../constants/theme';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { bookCodeToSlug, parseVerseRange } from '../constants/bibleBookCode';
import type { FullPlan, PlanSection, PlanVerseRef } from '../services/featuredPlansService';
import type { RootStackScreenProps } from '../navigation/types';
import { detailStyles as ds } from './planDetailStyles';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PLAN_COVER_CDN_BASE } from '../constants/plansApi';
import { useT } from '../i18n/useT';

// Corpus-backed plan detail screen. Layout mirrors the demo PlanDetail
// (the "Identity in Christ" placeholder inside PlanScreen.tsx) byte-for-
// byte by importing `detailStyles` from the shared `planDetailStyles.ts`.
// Any spacing / type tweak made there ripples to both screens — that is
// the whole point of the extraction.
//
// The plan's `colorPrimary` plays the same role as the demo's `plan.ac`
// accent, threaded through hero placeholder, day-strip selection, time
// badge, walk row icon + caption, and the Start Reading Plan button.

export default function FeaturedPlanDetail({ route, navigation }: RootStackScreenProps<'FeaturedPlanDetail'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { slug } = route.params;
  const { getSummary, loadPlan, loadedPlans } = useFeaturedPlans();
  const { isDayComplete } = usePlanCompletion();
  const summary = getSummary(slug);

  // Lazy-fetch the full plan body (sections, walk titles, verse_wall) once;
  // the bundled summary already powers the hero / strip / button.
  const [plan, setPlan] = useState<FullPlan | null>(loadedPlans[slug] || null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (plan) return;
    loadPlan(slug).then(setPlan).catch(() => setLoadError(true));
  }, [slug, plan, loadPlan]);

  const [activeIdx, setActiveIdx] = useState(0);

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

  // Accent color = the saturated dark of the cover gradient. The plan JSON's
  // `color_primary` is a pastel tint (great as a soft cover wash) while
  // `color_secondary` is the saturated brand color — this is the one that
  // matches the demo's hand-picked `plan.ac` (e.g., LAV `#9560C2`). Using the
  // pastel as button bg made the CTA read as "disabled" — verified on the
  // anger plan where `color_primary: #E0BCA0` produced a near-white button.
  const ac = summary.colorSecondary;

  // Day cells: number, today-anchored date label, walk title (from full plan
  // when loaded), verses (verse_wall display strings + their ref payload for
  // Bible-jump). Falls back to "Day N" label until plan body is in.
  const today = new Date();
  const days = Array.from({ length: summary.duration }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const content = plan?.days.find(x => x.day === i + 1);
    const verseWall = content?.sections.find(s => s.type === 'verse_wall') as
      Extract<PlanSection, { type: 'verse_wall' }> | undefined;
    return {
      n: i + 1,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      walk: content?.title || `Day ${i + 1}`,
      verses: (verseWall?.verses || []) as PlanVerseRef[],
    };
  });
  const cur = days[activeIdx];

  const startActiveDay = () => navigation.navigate('PlanDayWalk', { slug, day: cur.n });

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
        {/* Plan meta line — "N days · M min/day". Replaces the old
            in-card "time badge" that only showed minutes per day; surfacing
            both numbers up here means the user sees the commitment before
            scrolling. */}
        <Text style={ds.planInfo}>
          {summary.duration} {summary.duration === 1 ? 'day' : 'days'}
          {summary.minutes ? `  ·  ${summary.minutes} min/day` : ''}
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
          <Image
            source={{ uri: `${PLAN_COVER_CDN_BASE}/${summary.slug}.webp` }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(100).duration(260)}>{/* 280/420 → 100/260 */}
        {/* Worker plan JSON returns identical strings for `subtitle` and
            `goal` on most plans — show only one in that case. The goal
            phrasing is the canonical one (it's what drives the plans
            audience match in featuredForWeek), so when they collide we
            keep goal and drop subtitle. */}
        {!!summary.subtitle && summary.subtitle !== summary.goal && (
          <Text style={ds.subtitle}>{summary.subtitle}</Text>
        )}
        {!!summary.goal && <Text style={ds.goal}>{summary.goal}</Text>}
      </Animated.View>

      <Animated.View entering={FadeIn.delay(150).duration(260)}>{/* 420/420 → 150/260 */}
        <Text style={ds.dailyPlanLabel}>{t('plan.dailyPlanLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ds.dayStrip} contentContainerStyle={ds.dayStripContent}>
          {days.map((d, i) => {
            const sel = i === activeIdx;
            const done = isDayComplete(slug, d.n);
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setActiveIdx(i)}
                style={[ds.dayBtn, { backgroundColor: sel ? ac : 'rgba(255,255,255,0.7)', borderColor: sel ? 'transparent' : 'rgba(30,27,46,0.08)' }]}
                activeOpacity={0.8}
              >
                <Text style={[ds.dayNum, { color: sel ? '#fff' : TXT }]}>{d.n}</Text>
                <Text style={[ds.dayDate, { color: sel ? 'rgba(255,255,255,0.9)' : TXTSUB }]}>{d.label}</Text>
                {done && (
                  <View style={[ds.dayCheck, { backgroundColor: sel ? 'rgba(255,255,255,0.9)' : ac }]}>
                    <Feather name="check" size={9} color={sel ? ac : '#fff'} />
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
              <Text style={[ds.timeBadgeText, { color: ac }]}>~{summary.minutes} MIN</Text>
            </View>
          </View>

          {/* Loading + error states sit in place of the walk row + verse rows
              while the full plan body fetches. They share the row-card chrome
              so vertical rhythm doesn't jump. */}
          {!plan && !loadError && (
            <View style={ds.loading}><ActivityIndicator color={ac} /></View>
          )}
          {loadError && (
            <View style={ds.errorCard}>
              <Feather name="cloud-off" size={20} color={TXTSUB} />
              <Text style={ds.errorText}>{t('plan.loadFailed')}</Text>
            </View>
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

      <Animated.View entering={FadeIn.delay(250).duration(260)}>{/* 720/400 → 250/260 — Start button reaches resting state ~510 ms after mount instead of 1120 ms */}
        <TouchableOpacity
          style={[ds.startReadingBtn, { backgroundColor: ac }, !plan && { opacity: 0.5 }]}
          onPress={startActiveDay}
          disabled={!plan}
          activeOpacity={0.9}
        >
          <Text style={ds.startReadingText}>{t('plan.startReading')}</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ height: 23 }} />
    </ScrollView>
  );
}
