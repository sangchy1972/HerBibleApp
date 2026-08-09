import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent, Keyboard, BackHandler, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeIn,
} from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { ROSE, BTN_RADIUS, TXT, TXTSUB, P, FONTS, GREEN_DONE } from '../constants/theme';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { PLAN_SECTIONS, PLAN_SECTION_LABELS, EMOTION_TAGS, type PlanSectionId } from '../constants/plansApi';
import PlanCover, { PLAN_ROW_COVER } from '../components/PlanCover';
import type { PlanSummary } from '../constants/featuredPlansSummary';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { detailStyles as ds } from './planDetailStyles';
import TabSection from '../components/shared/TabSection';
import { useT } from '../i18n/useT';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import { useOnboarding } from '../state/OnboardingContext';
import { scorePlan, recommendPlans } from '../services/planRecommendations';
import { usePlanGuide } from '../state/PlanGuideContext';
import PlanGuideSelfTrigger from '../components/PlanGuideSelfTrigger';
import { useSheetSurface } from '../state/promptSurface';
import { buildPlanSearchIndex, searchPlanIndex, isSearchable } from '../services/planSearch';
import PlanSearchField from '../components/plan/PlanSearchField';
import PlanSearchResults from '../components/plan/PlanSearchResults';
import { logEvent } from '../services/firebase';

const TABS = ['current', 'explore', 'completed'] as const;
type TabId = typeof TABS[number];

// Plan list row — gradient cover + day count + title + a Start button.
function CorpusPlanRow({ plan, onPress }: { plan: PlanSummary; onPress: () => void }) {
  const t = useT();
  return (
    <TouchableOpacity onPress={onPress} style={styles.planRow} activeOpacity={0.75}>
      <PlanCover
        slug={plan.slug}
        gradient={[plan.colorPrimary, plan.colorSecondary]}
        {...PLAN_ROW_COVER}
      />
      <View style={styles.planMeta}>
        <Text style={styles.planDays}>{t('plan.row.daysLabel', { n: plan.duration })}</Text>
        <Text style={styles.planTitle} numberOfLines={2}>{plan.title}</Text>
      </View>
      <TouchableOpacity onPress={onPress} style={styles.startBtn}>
        <Text style={styles.startBtnText}>{t('plan.startFallback')}</Text>
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
  const t = useT();
  if (plans.length === 0) return null;
  // No subtitle row — per user feedback the one-liner description under the
  // category title was visual noise; the title + plan covers below carry
  // the section's identity well enough.
  return (
    <View style={styles.category}>
      <View style={styles.catHeader}>
        <Text style={styles.catName}>{title}</Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: ROSE }]}>{t('common.seeAll')} ›</Text>
        </TouchableOpacity>
      </View>
      {plans.map(p => (
        <CorpusPlanRow key={p.slug} plan={p} onPress={() => onOpen(p.slug)} />
      ))}
    </View>
  );
}

export default function PlanScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'plan'>>();
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<TabId>('current');

  // ── Plan-discovery guide wiring ───────────────────────────────────────────
  // This screen owns two of the guide's anchors (the Explore pill, the
  // how-are-you-feeling row), the segment switcher, and the scroll-into-view.
  // The trigger/focus/visited logic lives in <PlanGuideSelfTrigger>.
  const guide = usePlanGuide();
  const explorePillRef = useRef<View>(null);
  const moodSectionRef = useRef<View>(null);
  // Current scroll offset — revealMood turns a window-space delta into an
  // absolute scrollTo target.
  const scrollYRef = useRef(0);
  useEffect(() => {
    guide.registerExploreMeasurer(explorePillRef);
    guide.registerMoodMeasurer(moodSectionRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setShowExplore = guide.setShowExploreHandler;
  useEffect(() => {
    setShowExplore(() => setTab('explore'));
  }, [setShowExplore]);
  const setRevealMood = guide.setRevealMoodHandler;
  useEffect(() => {
    // Bring the mood row to ~130dp from the top of the window. Retries while
    // the Explore content is still mounting (the guide switches the segment in
    // the same breath); resolves once scrolled — the overlay's own confirming
    // re-measure then locks the hole onto the settled position.
    setRevealMood(async () => {
      for (let i = 0; i < 8; i += 1) {
        const scrolled = await new Promise<boolean>(res => {
          const node = moodSectionRef.current;
          if (!node) { res(false); return; }
          let fired = false;
          const cap = setTimeout(() => { if (!fired) res(false); }, 250);
          node.measureInWindow((x, y, w, h) => {
            fired = true;
            clearTimeout(cap);
            if (!(h > 0)) { res(false); return; }
            const delta = y - 130;
            if (Math.abs(delta) > 8) {
              scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
            }
            res(true);
          });
        });
        if (scrolled) { await new Promise(r => setTimeout(r, 480)); return; }
        await new Promise(r => setTimeout(r, 250));
      }
    });
  }, [setRevealMood]);
  const { lang } = useUILanguage();
  // Bumped each time the screen comes into focus (and each time the
  // Profile "My Plan" tile re-enters with a fresh `reset` param). Used
  // as the key on the page-level Animated.View so React Native remounts
  // it and replays its FadeIn — softens the abrupt tab-switch transition
  // the user flagged. First mount also fades in cleanly because the
  // initial key value is 0.
  const [fadeKey, setFadeKey] = useState(0);
  const resetSignal = route.params?.reset;
  // Corpus-backed plans powering the Featured carousel, emotion tags, and the
  // category sections — all from the bundled summary (no demo data anymore).
  const { summary, getSummary, loadPlan } = useFeaturedPlans();
  const { records: planRecords } = usePlanCompletion();
  // Onboarding answers drive the personalized ordering of the Featured
  // carousel and the four category sections (same scoring engine as the home
  // "My Reading Plans" card). If onboarding was skipped, every plan scores 0
  // and the ordering collapses back to the original curation order — so
  // non-onboarded users see exactly today's layout (no regression).
  const { answers } = useOnboarding();
  const todayYmd = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  // Only reorder when onboarding actually gave us something to key off. This
  // keeps the feature purely additive: users who skipped onboarding (or
  // onboarded before topics existed) keep the exact curation order — we do NOT
  // want scorePlan's editorial `starter +1` silently reshuffling their tab.
  const hasSignal = !!(answers.topics?.length || answers.goal || answers.age || answers.bibleLevel || answers.timeCommitment);
  // Whole catalog, stably re-sorted by onboarding fit (desc). Stable: ties keep
  // their original curation index. Feeds the category sections below (each
  // sliced to its top 4 per primary).
  const personalizedSummary = useMemo(() => {
    if (!hasSignal) return summary;
    return summary
      .map((p, i) => ({ p, i, s: scorePlan(p, answers).score }))
      .sort((a, b) => (b.s - a.s) || (a.i - b.i))
      .map(x => x.p);
  }, [summary, answers, hasSignal]);

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
    for (const p of personalizedSummary) {
      const list = map.get(p.primary) || [];
      list.push(p);
      map.set(p.primary, list);
    }
    return map;
  }, [personalizedSummary]);

  // Featured = a personalized top-5 via the shared recommender, so it gets the
  // engine's diversity rules (≤2 per section, no duplicate tag) and gentle
  // per-day rotation for free — rather than 5 look-alikes from one topic. With
  // no onboarding signal we keep the original curated first-5 (no regression).
  const featuredPlans = useMemo(
    () => hasSignal
      ? recommendPlans({ answers, summaries: summary, excludeSlugs: [], todayYmd, count: 5 })
      : summary.slice(0, 5),
    [answers, summary, todayYmd, hasSignal],
  );

  const openCorpusPlan = (slug: string) =>
    navigation.navigate('FeaturedPlanDetail', { slug });

  // Prefetch full plan bodies the moment the Plans tab mounts, for the plans the
  // user is most likely to open next: the featured carousel + anything already
  // in progress. The summary itself is bundled (instant), but the DETAIL screen
  // otherwise fetches each plan's body from the CDN only on tap — which is what
  // makes it sit on a spinner. Warming them here means loadPlan caches into
  // FeaturedPlansContext, so the detail screen finds loadedPlans[slug] already
  // populated and renders instantly. Best-effort + detached: failures are silent
  // (the detail screen still fetches on demand, now with a timeout + retry).
  // Guarded to run once per mount so the load-driven loadPlan identity change
  // doesn't re-trigger it.
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current || summary.length === 0) return;
    prefetchedRef.current = true;
    const slugs = new Set<string>();
    featuredPlans.forEach(p => slugs.add(p.slug));
    inProgressPlanRows.forEach(p => slugs.add(p.slug));
    slugs.forEach(slug => { loadPlan(slug).catch(() => {}); });
  }, [summary, featuredPlans, inProgressPlanRows, loadPlan]);

  // ── Explore search ────────────────────────────────────────────────────────
  // The field is always visible at the top of Explore; the query decides what
  // the page shows below it (browse → chips+categories → results).
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showAllHits, setShowAllHits] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const trimmed = query.trim();
  const searchActive = searchFocused || trimmed !== '';
  // A guide is running. Its spotlight anchors are the Explore pill and the mood
  // row, and it BURNS its once-ever flag the moment it shows — so if results
  // replaced the browse content and unmounted moodSectionRef, the tutorial would
  // be spent having taught nothing (the overlay would show a scrim with no hole
  // until its 30s watchdog fired). Disable the field and drop any live query.
  const guideBusy = guide.stage !== 'idle';
  // Declared here, above every effect that reads it — a const referenced by an
  // effect defined earlier in the file is a TDZ crash (dev-guide §3).
  const tabFocused = useIsFocused();
  const blurSearch = useCallback(() => {
    setSearchFocused(false);
    searchRef.current?.blur();     // BEFORE dismiss: on Android the input keeps
    Keyboard.dismiss();            // focus through a bare dismiss, so no onBlur
  }, []);
  useEffect(() => {
    if (!guideBusy) return;
    setQuery('');
    blurSearch();
  }, [guideBusy, blurSearch]);
  // Switching segments unmounts the field. React Native does NOT reliably fire
  // onBlur for a TextInput that unmounts while focused, so without this
  // `searchFocused` stays true for a field that no longer exists — and the
  // global sheetDepth stays held. Her query survives; only the focus does not.
  useEffect(() => {
    if (tab !== 'explore' || !tabFocused) blurSearch();
  }, [tab, tabFocused, blurSearch]);
  // Hold the prompt surface while the FIELD IS FOCUSED on a focused tab. `plan` IS
  // in TAB_ROUTES, so without this a nudge can paint over a live search field
  // with the keyboard up — and QuizPromoHost is a real RN <Modal>, i.e. a native
  // window that swallows every touch in the app while it is visible.
  //
  // Both conditions are load-bearing, because `sheetDepth` is a GLOBAL counter
  // and this screen never unmounts:
  //   • `searchFocused`, not `searchActive` — gating on "has text" would keep the
  //     hold forever the moment she leaves a word in the field, and a prompt over
  //     a result list she is calmly reading is ordinary app behaviour, not an
  //     ambush. The ambush window is exactly "keyboard up, mid-typing".
  //   • `isFocused` — otherwise switching tabs with the field still focused
  //     leaks the count and silences EVERY blocking prompt in the app (mood,
  //     login, widget, rate, both guides, badge unlocks) for the rest of the
  //     session. Same failure the Follow-Him gate caused in 2026-08-08.
  useSheetSurface(searchFocused && tabFocused);
  // 180ms — the catalog is 113 bundled objects, so this is not protecting the
  // main thread (a full pass is sub-millisecond), it stops the list flickering
  // mid-word. Tighter than the Bible reader's 250ms because there is no network.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(trimmed), 180);
    return () => clearTimeout(id);
  }, [trimmed]);
  // Fold the catalog once per (catalog, language); keystrokes then only run
  // `includes` over the folded haystacks. Built from `personalizedSummary`, so
  // equal-scoring results are tie-broken by onboarding fit — the same ordering
  // the rest of this tab already uses (and plain curation order when onboarding
  // gave us nothing).
  const searchIndex = useMemo(() => buildPlanSearchIndex(personalizedSummary, lang), [personalizedSummary, lang]);
  const hits = useMemo(() => searchPlanIndex(searchIndex, debouncedQuery), [searchIndex, debouncedQuery]);
  useEffect(() => { setShowAllHits(false); }, [debouncedQuery]);

  // Analytics — one event per SETTLED query, never per keystroke, deduped so a
  // re-render can't double-log. `plan_search_no_results` is the one that earns
  // its keep: it is the only channel through which "she keeps looking for X and
  // we don't have it" reaches us.
  const loggedQueryRef = useRef('');
  useEffect(() => {
    if (!isSearchable(debouncedQuery) || debouncedQuery === loggedQueryRef.current) return;
    loggedQueryRef.current = debouncedQuery;
    const term = debouncedQuery.slice(0, 100);                                   // Firebase caps string params at 100
    logEvent('search', { search_term: term, content_type: 'plan', lang, result_count: hits.length });
    if (hits.length === 0) logEvent('plan_search_no_results', { search_term: term, query_len: debouncedQuery.length, lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, hits.length]);

  // Android hardware back leaves SEARCH first (the repo pattern — see
  // MoodCheckInSheet / SignInSheet). Registered only while searching and torn
  // down the instant she isn't, so it can never become a trap: without it, back
  // closes the keyboard and the next press leaves the tab entirely with her
  // results still on screen. The guide clears the query before it shows, so this
  // and SpotlightCoach's own handler are never armed at the same time.
  useEffect(() => {
    // `tabFocused && tab === 'explore'` is the whole point. Gating on
    // `searchActive` alone was a real bug: PlanScreen never unmounts and the query
    // deliberately survives navigation, so a word left in the field kept this
    // handler registered while she was on a plan detail, a category, or another
    // tab entirely — and BackHandler runs subscriptions LAST-REGISTERED-FIRST,
    // ahead of the navigator's own. Every one of those screens lost its first
    // back press, and that press silently wiped her query. Same lesson as the
    // sheetDepth hold two effects up: never gate on "there is text".
    if (!searchActive || !tabFocused || tab !== 'explore') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setQuery('');
      blurSearch();
      return true;
    });
    return () => sub.remove();
  }, [searchActive, tabFocused, tab, blurSearch]);

  const openedSearchRef = useRef(false);
  const onSearchFocus = () => {
    setSearchFocused(true);
    if (!openedSearchRef.current) {
      openedSearchRef.current = true;
      logEvent('plan_search_open', { entry: 'explore' });
    }
  };
  const cancelSearch = () => {
    setQuery('');
    blurSearch();
  };
  // A result tap leaves the keyboard behind and warms the plan body, so the
  // detail screen renders from cache instead of a spinner (same prefetch the
  // Featured carousel gets on mount).
  const openSearchHit = (slug: string, rank: number) => {
    logEvent('select_item', {
      item_list_name: 'plan_search', item_id: slug,
      search_term: debouncedQuery.slice(0, 100), rank, result_count: hits.length,
    });
    blurSearch();
    loadPlan(slug).catch(() => {});
    openCorpusPlan(slug);
  };

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
      // The search query deliberately SURVIVES a re-focus: she searches, opens a
      // plan, comes back — and her results are still there. (The guide's mood
      // anchor is protected by the guideBusy effect above, not by clearing here.)
      // Always land at the very top of the page on every (re)focus, per user —
      // switching to the Plans tab must not preserve the previous scroll
      // position. The ScrollView itself isn't remounted by fadeKey, so its
      // offset has to be reset explicitly.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  // Profile "My Plan" tile entry: navigation.navigate(..., { reset: Date.now() })
  // gives us a fresh timestamp every tap. When that changes, jump to the
  // requested tab (`route.params.tab`, default 'current') and scroll to the
  // top so the user always lands at the same starting point. The Profile "My
  // Plan" tile sends no `tab` → 'current' (unchanged); the home "Explore Plans"
  // button sends `tab: 'explore'`. Regular tab-switches don't send `reset`, so
  // this is a no-op for them — their state is preserved.
  useEffect(() => {
    if (resetSignal !== undefined) {
      const nextTab = route.params?.tab ?? 'current';
      setTab(nextTab);
      // Bump the fade key in the SAME commit as the tab change so the entrance
      // replays over the tab we're landing on (e.g. home's "More Plans" →
      // Explore) rather than over whatever tab was showing before.
      setFadeKey(k => k + 1);
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

  return (
    <View style={styles.container}>
      <PlanGuideSelfTrigger />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        // The search chips and result rows live in this scroll with the keyboard
        // up. Without "handled", the first tap on one of them is swallowed as a
        // keyboard dismissal — and the blur that follows would unmount the very
        // chip she was reaching for.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
        onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={32}
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
                // The guide spotlights the Explore pill — measured off the
                // touchable itself so the hole frames exactly the hit area.
                ref={tabId === 'explore' ? explorePillRef : undefined}
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
                          {...PLAN_ROW_COVER}
                        />
                        <View style={styles.planMeta}>
                          <Text style={styles.planDays}>{t('plan.row.dayOfTotal', { n: done, total })}</Text>
                          <Text style={styles.planTitle} numberOfLines={2}>{p.title}</Text>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: ROSE }]} />
                          </View>
                        </View>
                        {/* Continue affordance is a compact chevron, not a
                            pill — the labelled button crowded the title out of
                            its two lines. The whole row is already tappable. */}
                        <TouchableOpacity
                          onPress={() => openCorpusPlan(p.slug)}
                          style={styles.continueArrow}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={t('plan.continue')}
                        >
                          <Feather name="chevron-right" size={26} color={ROSE} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                  {/* Explore-more CTA — the in-progress list has no bottom
                      affordance, so guide users on to the catalog (per user).
                      Same pill as the empty state, just centered. */}
                  <TouchableOpacity
                    onPress={() => setTab('explore')}
                    style={[styles.exploreCta, { backgroundColor: ROSE, alignSelf: 'center' }]}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: '#fff', fontSize: 15.1, fontWeight: '700' }}>{t('plan.exploreMore.cta')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyTitle}>{t('plan.empty.notStarted.title')}</Text>
                  <Text style={styles.emptyDesc}>{t('plan.empty.notStarted.desc')}</Text>
                  <TouchableOpacity onPress={() => setTab('explore')} style={[styles.exploreCta, { backgroundColor: ROSE }]}>
                    <Text style={{ color: '#fff', fontSize: 15.1, fontWeight: '700' }}>{t('plan.empty.notStarted.cta')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {tab === 'explore' && (
            <View>
              {/* Search — persistent at the top of Explore (owner 2026-08-09).
                  Focused-and-empty shows the suggestion chips + every category;
                  a query shows results; otherwise the browse layout below. */}
              <PlanSearchField
                inputRef={searchRef}
                value={query}
                onChangeText={setQuery}
                onFocus={onSearchFocus}
                onBlur={() => setSearchFocused(false)}
                active={searchActive}
                onCancel={cancelSearch}
                disabled={guideBusy}
              />

              {searchActive ? (
                <PlanSearchResults
                  query={debouncedQuery}
                  hits={hits}
                  showAll={showAllHits}
                  onShowAll={() => setShowAllHits(true)}
                  // Rendered here so the row component and its styles stay in
                  // one place — the in-progress and completed lists use them too.
                  renderPlanRow={(plan, rank) => (
                    <CorpusPlanRow plan={plan} onPress={() => openSearchHit(plan.slug, rank)} />
                  )}
                  onPickTopic={(topic, label) => {
                    logEvent('plan_search_suggestion_tap', { topic });
                    setQuery(label);
                  }}
                  onOpenCategory={(section, title) => {
                    blurSearch();
                    navigation.navigate('PlanCategory', { primary: section, title });
                  }}
                />
              ) : (
                <>
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
                      radius={20}
                    />
                    <View style={styles.featuredOverlay}>
                      <View style={styles.featuredTag}>
                        <Text style={styles.featuredTagText}>{plan.duration === 1 ? t('plan.dayCount.one') : t('plan.dayCount.other', { n: plan.duration })}</Text>
                      </View>
                      <Text style={styles.featuredTitle} numberOfLines={2}>{plan.title}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* HOW ARE YOU FEELING TODAY? — 9 curated mood pills in two
                  rows (5 + 4), pinned in EMOTION_TAGS (plansApi.ts). The strip
                  scrolls HORIZONTALLY: each pill sizes to its own label (no
                  flex:1, no numberOfLines truncation), so the full word always
                  reads — the old fixed 5-up grid squashed them to "WE…/FE…". */}
              <View ref={moodSectionRef} collapsable={false} style={{ marginBottom: 28 }}>
              <Text style={[styles.bigSectionLabel, { marginTop: -7 }]}>{t('plansMeta.section.emotions')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emotionScrollContent}
              >
                <View style={styles.emotionGrid}>
                  {[EMOTION_TAGS.slice(0, 5), EMOTION_TAGS.slice(5)].map((row, ri) => (
                    <View key={ri} style={styles.emotionRow}>
                      {row.map(tag => (
                        <TouchableOpacity
                          key={tag.secondary}
                          activeOpacity={0.85}
                          onPress={() => navigation.navigate('PlanCategory', { primary: 'emotions', secondary: tag.secondary, title: t(tag.label) })}
                          style={[styles.emotionTag, { backgroundColor: tag.color }]}
                        >
                          <Text style={styles.emotionLabel}>{t(tag.label)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
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
                </>
              )}
            </View>
          )}

          {tab === 'completed' && (
            <View>
              {completedPlanRows.length > 0 ? (
                completedPlanRows.map(({ summary: p, finishedAt }) => {
                  const dateStr = new Date(finishedAt).toLocaleDateString(localeFor(lang), { year: 'numeric', month: 'short', day: 'numeric' });
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
                          {...PLAN_ROW_COVER}
                        />
                        <View style={styles.checkBadge}>
                          <Feather name="check" size={12} color="#fff" />
                        </View>
                      </View>
                      <View style={styles.planMeta}>
                        <Text style={styles.planDays}>{t('plan.row.daysLabel', { n: p.duration_days })} · {dateStr}</Text>
                        <Text style={styles.planTitle} numberOfLines={2}>{p.title}</Text>
                      </View>
                      <TouchableOpacity onPress={() => openCorpusPlan(p.slug)} style={styles.startBtn}>
                        <Text style={styles.startBtnText}>{t('plan.review')}</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyTitle}>{t('plan.empty.completed.title')}</Text>
                  <Text style={styles.emptyDesc}>{t('plan.empty.completed.desc')}</Text>
                  <TouchableOpacity onPress={() => setTab('explore')} style={[styles.exploreCta, { backgroundColor: ROSE }]}>
                    <Text style={{ color: '#fff', fontSize: 15.1, fontWeight: '700' }}>{t('plan.empty.completed.cta')}</Text>
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
  tabText: { fontSize: 16, fontWeight: '600', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
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
  planDays: { fontSize: 13, fontFamily: FONTS.lato, letterSpacing: 0.4, color: TXTSUB, marginBottom: 3, fontWeight: '500' },
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
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,                                                      // app accent (primary action) per user — was grey
  },
  startBtnText: { fontSize: 14, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.4, color: '#fff' },
  // Compact "continue" affordance for in-progress rows — replaces the wide
  // pill button so the plan title keeps its two full lines.
  continueArrow: { flexShrink: 0, paddingLeft: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GREEN_DONE,
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
    borderRadius: 20,
    // Subtle bottom-to-top dark gradient would be ideal here, but a flat
    // semi-transparent overlay on the bottom half keeps text legible on
    // covers with bright bottoms without pulling in another gradient.
    // For now a plain transparent wrapper is enough; the tag + title both
    // sit on their own opaque backgrounds.
  },
  featuredTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10.1,                                                         // +30 % more (was 7.8)
    paddingHorizontal: 10,
    paddingVertical: 4.4,                                                       // +10 % more (was 4)
  },
  featuredTagText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: FONTS.latoBold,
    color: '#fff',
    letterSpacing: 1,
  },
  featuredTitle: {
    fontSize: 16.6,                                                            // -7 % (was 17.9)
    fontWeight: '400',                                                         // regular per user (loraBold→lora, since loraBold must pair with 600)
    fontFamily: FONTS.lora,
    color: '#fff',
    lineHeight: 22,
    marginBottom: -3,                                                          // pull 3 px closer to the card bottom

    // Drop shadow so the title stays legible over high-key cover images.
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Right breathing room at the end of the horizontal strip.
  emotionScrollContent: { paddingRight: 4 },
  emotionGrid: { flexDirection: 'column', gap: 10 },
  emotionRow: { flexDirection: 'row', gap: 11 },
  emotionTag: {
    paddingHorizontal: 20,
    paddingVertical: 10.8,                                                      // -10 % more (was 12)
    minHeight: 40,                                                            // -10 % more (was 45)
    borderRadius: 18,                                                          // +25 % more (was 14.4) — near pill
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionLabel: {
    fontSize: 12.6,                                                            // -10 % (was 14)
    fontWeight: '800',
    fontFamily: FONTS.latoBold,
    color: '#fff',
    letterSpacing: 1.2,
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
  seeAll: { fontSize: 15.4, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },   // bold per user
  emptyHint: { textAlign: 'center', paddingVertical: 23, alignItems: 'center' },
  emptyTitle: { fontSize: 17.3, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, marginBottom: 5 },   // +8 % then +7 % (was 15)
  emptyDesc: { fontSize: 16.2, fontFamily: FONTS.lato, letterSpacing: 0.4, color: TXTSUB, textAlign: 'center' },                    // +8 % then +7 % (was 14)
  exploreCta: {
    marginTop: 21,                                                             // +5 px per user (was 16)
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: BTN_RADIUS,
  },
  // Detail
  // Plan-detail layout styles live in `./planDetailStyles.ts` (shared with
  // FeaturedPlanDetail). Don't add detail-specific keys here.
});
