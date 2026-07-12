import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal,
  useWindowDimensions, Platform, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeOut, Easing, useSharedValue, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { ROSE, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { maybeShowInterstitial } from '../services/ads';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { useTranslation } from '../state/TranslationsContext';
import { useHighlights } from '../state/HighlightsContext';
import { useSavedVerses } from '../state/SavedVersesContext';
import { bookCodeToSlug, parseVerseRange } from '../constants/bibleBookCode';
import { localizeBookName } from '../constants/bibleBookNames';
import { fetchChapter, fetchCommentaryChapter, type Chapter, type Verse } from '../services/bibleService';
import { CORPUS_CDN_ROOT } from '../constants/corpus';
import VerseNoteSheet from '../components/VerseNoteSheet';
import ShareVerseSheet from '../components/ShareVerseSheet';
import { HL_COLORS, getHighlightColor } from '../constants/highlightColors';
import type { FullPlan, PlanSection, PlanVerseRef } from '../services/featuredPlansService';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';

// Daily reader for a single plan day. Each plan day is a sequence of
// "pages" the user swipes through. Sections present in the day's content
// drive how many pages there are — plans are heterogeneous (some skip
// `prayer`, some have a much longer `verse_wall`), so the count is
// computed not hardcoded.
//
// Page kinds:
//   • scripture_focus  — single verse rendered Bible-reader style (1 page)
//   • teaching         — heading + paragraph prose                 (1 page)
//   • prayer           — heading + body prose                      (1 page; optional)
//   • verse            — one verse_wall entry, rendered as that verse's
//                        Bible chapter with the focus verse fully opaque
//                        and the surrounding verses dimmed. Multiple
//                        per day, one per verse_wall entry.
//
// Chrome:
//   • TOP: segmented progress bar (one segment per page, current+earlier
//          filled). Plus an X-close button on the right.
//   • BOTTOM: round play button (chapter narration via expo-audio) + pill
//          showing chapter:verse ref with prev/next chevrons. The next
//          chevron flips to a check on the final page and marks the day
//          complete.
//   • Tap any verse → popup with 5 highlight colours + Save / Copy /
//     Notes / Share / Explore actions. Wired into the same
//     HighlightsContext / SavedVersesContext the Bible reader uses, so
//     highlights set here also show up in the standalone reader.

// HL_COLORS imported from the shared module — see constants/highlightColors.ts.

type Page =
  | { kind: 'scripture_focus'; section: Extract<PlanSection, { type: 'scripture_focus' }> }
  | { kind: 'teaching';        section: Extract<PlanSection, { type: 'teaching' }> }
  | { kind: 'prayer';          section: Extract<PlanSection, { type: 'prayer' }> }
  | { kind: 'verse';           ref: PlanVerseRef; bookSlug: string; verseStart: number; verseEnd: number };

interface SelectedVerse {
  bookSlug: string;
  bookTitle: string;
  chapter: number;
  verse: number;
  text: string;
  anchorY?: number;   // window-Y of the tapped verse — popup anchors to it
  anchorH?: number;   // tapped verse height
}

export default function PlanDayWalk({ route, navigation }: RootStackScreenProps<'PlanDayWalk'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { slug, day } = route.params;
  const { loadPlan, loadedPlans } = useFeaturedPlans();
  const { markDayComplete } = usePlanCompletion();
  const { current: translation } = useTranslation();
  const { setHighlight, getColor } = useHighlights();
  const { verses: savedList, addVerse, removeVerse, hasVerse } = useSavedVerses();

  const [plan, setPlan] = useState<FullPlan | null>(loadedPlans[slug] || null);
  const [error, setError] = useState<string | null>(null);

  // Mirror the user's Bible-reader typography (size / line-height / paragraph
  // spacing) so plan reading copy matches the reader exactly. Font face is
  // pinned to Merriweather per design. Defaults match the reader's new-user
  // defaults (18 / 1.8 / 24).
  const [readPrefs, setReadPrefs] = useState({ fontSize: 18, lineH: 1.8, paragraphSpacing: 24 });
  useEffect(() => {
    AsyncStorage.getItem('bible:reader-settings:v1').then(raw => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        setReadPrefs(p => ({
          fontSize: typeof s.fontSize === 'number' ? s.fontSize : p.fontSize,
          lineH: typeof s.lineH === 'number' ? s.lineH : p.lineH,
          paragraphSpacing: typeof s.paragraphSpacing === 'number' ? s.paragraphSpacing : p.paragraphSpacing,
        }));
      } catch { /* keep defaults */ }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (plan) return;
    loadPlan(slug)
      .then(setPlan)
      .catch(() => setError(t('plan.dayLoadError')));
  }, [slug, plan, loadPlan]);

  const dayContent = useMemo(() => plan?.days.find(d => d.day === day), [plan, day]);

  // Build the page list. Sections present become pages in fixed order
  // (scripture_focus → teaching → prayer); the verse_wall — if present —
  // contributes one page per verse, so the user reads each one with
  // full Bible-style context.
  const pages = useMemo<Page[]>(() => {
    if (!dayContent) return [];
    const out: Page[] = [];
    for (const t of ['scripture_focus', 'teaching', 'prayer'] as const) {
      const s = dayContent.sections.find(ss => ss.type === t);
      if (!s) continue;
      // Narrow per branch — TS can't follow the loop variable into the union.
      if (t === 'scripture_focus' && s.type === 'scripture_focus') out.push({ kind: 'scripture_focus', section: s });
      if (t === 'teaching'        && s.type === 'teaching')        out.push({ kind: 'teaching',        section: s });
      if (t === 'prayer'          && s.type === 'prayer')          out.push({ kind: 'prayer',          section: s });
    }
    const vw = dayContent.sections.find(s => s.type === 'verse_wall');
    if (vw && vw.type === 'verse_wall') {
      for (const v of vw.verses) {
        const bookSlug = bookCodeToSlug(v.bookCode);
        if (!bookSlug) continue;
        const { start, end } = parseVerseRange(v.verses);
        out.push({ kind: 'verse', ref: v, bookSlug, verseStart: start, verseEnd: end });
      }
    }
    return out;
  }, [dayContent]);

  // Pager state
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    setPage(clamped);
    scrollRef.current?.scrollTo({ x: clamped * winWidth, animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, winWidth));
    if (i !== page) {
      setPage(i);
      setSelected(null);                                                          // drop verse popup on page change
      setExploreTarget(null);                                                     // and close any open Explore card
    }
  };

  // Verse selection (powers the popup overlay). Stored separately from
  // the verse_wall page index so user can tap any visible verse on a
  // verse page, not just the focused one.
  const [selected, setSelected] = useState<SelectedVerse | null>(null);
  // Verse whose inline Explore commentary is open (mirrors the Bible reader:
  // Explore expands a CDN-fetched explanation in place rather than navigating).
  const [exploreTarget, setExploreTarget] = useState<{ bookSlug: string; chapter: number; verse: number } | null>(null);
  const [noteVerse, setNoteVerse] = useState<{ ref: string; text: string } | null>(null);
  const [shareVerse, setShareVerse] = useState<{ ref: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const onNext = () => {
    if (page < pages.length - 1) {
      goTo(page + 1);
    } else if (plan) {
      markDayComplete(slug, day, plan.duration);
      navigation.replace('PlanDayDone', { slug, day });
      // Interstitial at the end of a plan day's reading — shows over the
      // just-pushed PlanDayDone screen; frequency-capped + remove-ads-aware.
      maybeShowInterstitial('plan_end');
    }
  };
  const onPrev = () => {
    // First page → no-op. The left chevron is disabled + greyed there; it must
    // NOT double as a "return" button (the X close button is the way out).
    if (page > 0) goTo(page - 1);
  };

  // Current page's chapter:verse reference for the bottom pill label.
  const currentRef = useMemo(() => {
    const cur = pages[page];
    if (!cur) return '';
    const bookName = (slug: string, fallback: string) => localizeBookName(translation.code, slug, fallback);
    if (cur.kind === 'scripture_focus') return cur.section.verse.display;
    if (cur.kind === 'verse') {
      const bn = bookName(cur.bookSlug, cur.ref.display.split(' ')[0]);
      const range = cur.verseStart === cur.verseEnd ? `${cur.verseStart}` : `${cur.verseStart}-${cur.verseEnd}`;
      return `${bn} ${cur.ref.chapter}:${range}`;
    }
    return cur.section.heading;
  }, [pages, page, translation.code]);

  // --- Render branches ---

  if (!plan && !error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 14 }]}>
        <ProgressBar count={1} index={0} />
        <CloseBtn onPress={() => navigation.goBack()} top={insets.top + 4} />
        <View style={styles.loading}><ActivityIndicator color={ROSE} /></View>
      </View>
    );
  }
  if (error || !plan || !dayContent || pages.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 14 }]}>
        <CloseBtn onPress={() => navigation.goBack()} top={insets.top + 4} />
        <View style={styles.empty}>
          <Feather name="cloud-off" size={42} color={TXTSUB} />
          <Text style={styles.emptyText}>{error || t('plan.dayEmpty')}</Text>
        </View>
      </View>
    );
  }

  const isLast = page === pages.length - 1;

  return (
    <View style={styles.root}>
      {/* Top: segmented progress + close. ProgressBar sits right below the
          status bar; the close button overlays the right edge. */}
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: P }}>
        <ProgressBar count={pages.length} index={page} />
      </View>
      <CloseBtn onPress={() => navigation.goBack()} top={insets.top + 24} />{/* +10 px lower so it clears the progress bar */}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {pages.map((p, i) => (
          <View key={i} style={{ width: winWidth }}>
            <PageContent
              page={p}
              dayTitle={dayContent.title}
              isFirstPage={i === 0}
              active={i === page}
              readPrefs={readPrefs}
              exploreTarget={exploreTarget}
              onCloseExplore={() => setExploreTarget(null)}
              insetTop={20}
              insetBottom={insets.bottom + 120}                                  // 110 → 120 — tracks the bottom bar's +10 px lift so text keeps the same clearance above the pill
              translationCode={translation.code}
              translationSource={translation.source}
              getColor={getColor}
              onSelectVerse={setSelected}
              onScrollDismiss={() => setSelected(null)}
            />
          </View>
        ))}
      </ScrollView>

      {/* Verse popup — anchored to the tapped verse (like the Bible reader):
          sits just below it, or flips above when that'd collide with the nav
          bar. Falls back to a fixed bottom slot if no anchor was measured. */}
      {selected && (() => {
        const POPUP_H = 168;                            // approx height (color row + actions)
        const navZone = insets.bottom + 88;             // bottom bar + breathing room
        const minTop = insets.top + 52;                 // clear the progress bar + close
        let top: number | null = null;
        if (selected.anchorY != null) {
          const below = selected.anchorY + (selected.anchorH ?? 24) + 8;
          top = (below + POPUP_H <= winHeight - navZone)
            ? below                                       // room below the verse
            : selected.anchorY - POPUP_H - 8;             // else flip above
          top = Math.max(minTop, Math.min(top, winHeight - navZone - POPUP_H));
        }
        return (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          style={[styles.popup, top != null ? { top } : { bottom: insets.bottom + 78 }]}
        >
          <View style={styles.colorRow}>
            {HL_COLORS.map(c => {
              const current = getColor(translation.code, selected.bookSlug, selected.chapter, selected.verse);
              const isCur = current === c.name;
              return (
                <TouchableOpacity
                  key={c.name}
                  onPress={() => {
                    setHighlight({
                      translation: translation.code,
                      bookSlug: selected.bookSlug,
                      bookTitle: selected.bookTitle,
                      chapter: selected.chapter,
                      verse: selected.verse,
                      color: isCur ? '' : c.name,                                 // empty string clears the highlight
                      text: selected.text,
                    });
                  }}
                  style={[styles.colorDot, { backgroundColor: c.dot }, isCur && styles.colorDotSelected]}
                />
              );
            })}
          </View>
          <View style={styles.popupDivider} />
          <View style={styles.actionRow}>
            {(() => {
              const ref = `${selected.bookTitle} ${selected.chapter}:${selected.verse}`;
              const isSaved = hasVerse(ref);
              const actions = [
                { key: 'Save', icon: 'heart' as const, onPress: () => {
                    // Gray-pill confirmation in both directions, matching the
                    // verse toolbar on BibleScreen.
                    const existing = savedList.find(s => s.ref === ref);
                    if (existing) {
                      removeVerse(existing.id);
                      showToast(t('common.removed'));
                    } else {
                      addVerse(ref, selected.text);
                      showToast(t('common.saved'));
                    }
                  } },
                { key: 'Copy', icon: 'copy' as const, onPress: () => {
                    Clipboard.setStringAsync(`${selected.text}\n— ${ref}`).catch(() => {});
                    // Android shows its own system snackbar on clipboard write
                    // (Android 13+/Samsung One UI) — suppress our app pill on
                    // Android so the two don't stack. See BibleScreen for the
                    // matching gate.
                    if (Platform.OS === 'ios') showToast(t('common.copied'));
                    setSelected(null);
                  } },
                { key: 'Notes', icon: 'edit-2' as const, onPress: () => {
                    setNoteVerse({ ref, text: selected.text });
                    setSelected(null);
                  } },
                { key: 'Share', icon: 'share-2' as const, onPress: () => {
                    setShareVerse({ ref, text: selected.text });
                    setSelected(null);
                  } },
                { key: 'Explore', icon: 'zoom-in' as const, onPress: () => {
                    // Expand the CDN-fetched explanation INLINE (same flow as
                    // the Bible reader) instead of navigating to another screen.
                    setExploreTarget({ bookSlug: selected.bookSlug, chapter: selected.chapter, verse: selected.verse });
                    setSelected(null);
                  } },
              ];
              return actions.map(a => (
                <TouchableOpacity key={a.key} onPress={a.onPress} style={styles.actionBtn}>
                  {/* Fixed-height icon box so the 20px Save heart and the 18px
                      Feather glyphs share one baseline (Save used to sit taller). */}
                  <View style={styles.actionIcon}>
                    {a.key === 'Save'
                      ? <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={20} color={isSaved ? ROSE : TXT} />
                      : <Feather name={a.icon} size={18} color={TXT} />}
                  </View>
                  <Text style={[styles.actionLabel, a.key === 'Save' && isSaved && { color: ROSE, fontWeight: '700' }]}>
                    {a.key}
                  </Text>
                </TouchableOpacity>
              ));
            })()}
          </View>
        </Animated.View>
        );
      })()}

      {/* Bottom: white pill (back chevron + chapter:verse) + a SEPARATE round
          next button to its right (independent of the pill, per user). The
          play button was removed — no narration audio is wired yet.
          Icons are custom bold SVGs (2× Feather's stroke — per user, the
          stock glyphs read too thin), and the round button flips ROSE →
          green on the last page so finishing the day is visibly different. */}
      {/* 13 → 23 (+10 px per user — pill + next button sat too close to the bottom edge). */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 23 }]}>
        <View style={styles.pillNav}>
          <TouchableOpacity onPress={onPrev} disabled={page === 0} style={styles.pillNavBtn} hitSlop={6}>
            {/* First page → greyed + disabled (can't go back a page). */}
            <BoldChevron dir="left" size={20} color={page === 0 ? 'rgba(30,27,46,0.25)' : TXT} />
          </TouchableOpacity>
          <Text style={styles.pillRef} numberOfLines={1}>{currentRef}</Text>
          {/* Spacer matching the chevron width so the label stays centered. */}
          <View style={styles.pillNavBtn} pointerEvents="none" />
        </View>
        <TouchableOpacity
          onPress={onNext}
          style={[styles.nextBtn, isLast && styles.nextBtnDone]}
          hitSlop={8}
          activeOpacity={0.85}
        >
          {isLast
            ? <BoldCheck size={22} color="#fff" />
            : <BoldChevron dir="right" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Note + Share sheets — same components the Bible reader uses, so
          the UX matches verbatim. */}
      <Modal visible={!!noteVerse} animationType="slide" transparent onRequestClose={() => setNoteVerse(null)}>
        {noteVerse && (
          <VerseNoteSheet
            verseRef={noteVerse.ref}
            verseText={noteVerse.text}
            onClose={() => setNoteVerse(null)}
            onSaved={() => {
              // Close the sheet AND surface a gray "Saved" pill — matches
              // the confirmation the Save action on the verse toolbar shows.
              setNoteVerse(null);
              showToast(t('common.saved'));
            }}
          />
        )}
      </Modal>
      <Modal visible={!!shareVerse} animationType="fade" transparent onRequestClose={() => setShareVerse(null)}>
        {shareVerse && (
          <ShareVerseSheet
            reference={shareVerse.ref}
            text={shareVerse.text}
            onClose={() => setShareVerse(null)}
          />
        )}
      </Modal>

      {toast && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(220)} style={[styles.toast, { bottom: insets.bottom + 150 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// --- Components ---

function ProgressBar({ count, index }: { count: number; index: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressSeg,
            i <= index ? styles.progressSegFilled : styles.progressSegEmpty,
          ]}
        />
      ))}
    </View>
  );
}

function CloseBtn({ onPress, top }: { onPress: () => void; top: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={10}
      style={[styles.closeBtn, { top }]}
    >
      <Feather name="x" size={20} color={TXT} />
    </TouchableOpacity>
  );
}

// Bottom-bar glyphs at 2× Feather's stroke weight (4 vs 2 on a 24-px
// viewBox) — the stock Feather chevron/check looked too thin in the nav
// pill and round next button (per user). Same geometry as Feather's paths.
function BoldChevron({ dir, size, color }: { dir: 'left' | 'right'; size: number; color: string }) {
  const d = dir === 'left' ? 'M15 18 L9 12 L15 6' : 'M9 18 L15 12 L9 6';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function BoldCheck({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 L9 17 L4 12" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// One page of the pager. Either a prose section (verse / teaching /
// prayer) or a verse page — which fetches the chapter so it can render
// the surrounding context dimmed, focus the target range, and surface
// the same tap-popup the Bible reader has.
interface ReadPrefs { fontSize: number; lineH: number; paragraphSpacing: number; }

// Staggered fade + slide-up wrapper. All wrappers share one `anim` (0→1 over
// 0.6 s); each starts a little later by `index` so the blocks reveal top-to-
// bottom, sliding up into place. Used to animate a page on entry / page switch.
function Stagger({ anim, index, style, children }: { anim: SharedValue<number>; index: number; style?: any; children: React.ReactNode }) {
  const st = useAnimatedStyle(() => {
    const start = Math.min(0.55, index * 0.1);
    const local = Math.max(0, Math.min(1, (anim.value - start) / Math.max(0.001, 1 - start)));
    return { opacity: local, transform: [{ translateY: (1 - local) * 16 }] };
  });
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

function PageContent({
  page, dayTitle, isFirstPage, active, readPrefs, exploreTarget, onCloseExplore, insetTop, insetBottom,
  translationCode, translationSource, getColor, onSelectVerse, onScrollDismiss,
}: {
  page: Page;
  dayTitle: string;
  isFirstPage: boolean;
  active: boolean;
  readPrefs: ReadPrefs;
  exploreTarget: { bookSlug: string; chapter: number; verse: number } | null;
  onCloseExplore: () => void;
  insetTop: number;
  insetBottom: number;
  translationCode: string;
  translationSource: string;
  getColor: (tr: string, b: string, ch: number, v: number) => string | undefined;
  onSelectVerse: (sv: SelectedVerse) => void;
  onScrollDismiss: () => void;
}) {
  // Replays the staggered entrance every time this page becomes the active one
  // (initial mount + each swipe to it). 0.6 s → 1.2 s per user — the rise-up
  // reveal felt too fast / flashy, so the whole stagger now plays at half speed.
  const anim = useSharedValue(0);
  useEffect(() => {
    if (active) {
      anim.value = 0;
      anim.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    }
  }, [active, anim]);
  const base = isFirstPage ? 1 : 0;          // dayTitle occupies stagger slot 0 on the first page
  // Body copy mirrors the Bible reader's typography, in Merriweather.
  const bodyType = { fontFamily: FONTS.merriweather, fontSize: readPrefs.fontSize, lineHeight: readPrefs.fontSize * readPrefs.lineH };

  if (page.kind === 'scripture_focus') {
    const v = page.section.verse;
    const bookSlug = bookCodeToSlug(v.bookCode);
    const bookTitle = bookSlug ? localizeBookName(translationCode, bookSlug, v.display.split(' ')[0]) : v.display.split(' ')[0];
    const onTap = () => {
      if (!bookSlug) return;
      onSelectVerse({ bookSlug, bookTitle, chapter: v.chapter, verse: parseVerseRange(v.verses).start, text: v.text });
    };
    return (
      <ScrollView showsVerticalScrollIndicator={false} onScrollBeginDrag={onScrollDismiss} contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        {isFirstPage && <Stagger anim={anim} index={0}><Text style={styles.dayTitle}>{dayTitle}</Text></Stagger>}
        <Stagger anim={anim} index={base}><Text style={styles.sectionCaption}>{page.section.heading.toUpperCase()}</Text></Stagger>
        <Stagger anim={anim} index={base + 1}><Text style={styles.verseRef}>{v.display}</Text></Stagger>
        <Stagger anim={anim} index={base + 2}>
          <TouchableOpacity activeOpacity={0.85} onPress={onTap}>
            <Text style={[styles.verseBodyLarge, bodyType]}>{v.text}</Text>
          </TouchableOpacity>
        </Stagger>
      </ScrollView>
    );
  }
  if (page.kind === 'teaching') {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        {isFirstPage && <Stagger anim={anim} index={0}><Text style={styles.dayTitle}>{dayTitle}</Text></Stagger>}
        <Stagger anim={anim} index={base}><Text style={[styles.sectionCaption, styles.captionWide]}>{page.section.heading.toUpperCase()}</Text></Stagger>
        {page.section.paragraphs.map((para, i) => (
          <Stagger key={i} anim={anim} index={base + 1 + i} style={i > 0 ? { marginTop: readPrefs.paragraphSpacing } : undefined}>
            <Text style={[styles.paragraph, bodyType]}>{renderMarkdownBolds(para)}</Text>
          </Stagger>
        ))}
      </ScrollView>
    );
  }
  if (page.kind === 'prayer') {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        {isFirstPage && <Stagger anim={anim} index={0}><Text style={styles.dayTitle}>{dayTitle}</Text></Stagger>}
        <Stagger anim={anim} index={base}><Text style={[styles.sectionCaption, styles.captionWide]}>{page.section.heading.toUpperCase()}</Text></Stagger>
        <Stagger anim={anim} index={base + 1}><Text style={[styles.prayerBody, bodyType]}>{page.section.body}</Text></Stagger>
      </ScrollView>
    );
  }
  // Verse page — fetch the chapter + render context.
  return (
    <VersePage
      bookSlug={page.bookSlug}
      chapter={page.ref.chapter}
      verseStart={page.verseStart}
      verseEnd={page.verseEnd}
      translationCode={translationCode}
      translationSource={translationSource}
      readPrefs={readPrefs}
      exploreTarget={exploreTarget}
      onCloseExplore={onCloseExplore}
      insetTop={insetTop}
      insetBottom={insetBottom}
      getColor={getColor}
      onSelectVerse={onSelectVerse}
      onScrollDismiss={onScrollDismiss}
    />
  );
}

function VersePage({
  bookSlug, chapter, verseStart, verseEnd,
  translationCode, translationSource, readPrefs, exploreTarget, onCloseExplore,
  insetTop, insetBottom, getColor, onSelectVerse, onScrollDismiss,
}: {
  bookSlug: string; chapter: number; verseStart: number; verseEnd: number;
  translationCode: string; translationSource: string;
  readPrefs: ReadPrefs;
  exploreTarget: { bookSlug: string; chapter: number; verse: number } | null;
  onCloseExplore: () => void;
  insetTop: number; insetBottom: number;
  getColor: (tr: string, b: string, ch: number, v: number) => string | undefined;
  onSelectVerse: (sv: SelectedVerse) => void;
  onScrollDismiss: () => void;
}) {
  const t = useT();
  const [chapterData, setChapterData] = useState<Chapter | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const focusYRef = useRef<number | null>(null);
  // Per-verse view refs so the popup can anchor to the exact verse the user
  // tapped (window coords via measureInWindow), like the Bible reader.
  const verseRefs = useRef<Record<number, View | null>>({});

  useEffect(() => {
    let alive = true;
    fetchChapter(translationCode, translationSource, bookSlug, chapter)
      .then(c => { if (alive) setChapterData(c); })
      .catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [translationCode, translationSource, bookSlug, chapter]);

  // Inline Explore commentary — SAME CDN endpoint + AsyncStorage cache + 5 s
  // timeout as the Bible reader (fetchCommentaryChapter). Only this VersePage's
  // chapter fetches, and only when its verse is the Explore target.
  const exploreMatch = !!exploreTarget && exploreTarget.bookSlug === bookSlug && exploreTarget.chapter === chapter;
  const [commentaryState, setCommentaryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [commentaryByVerse, setCommentaryByVerse] = useState<Record<number, string>>({});
  const loadedKey = useRef<string | null>(null);
  const commentaryKey = `${translationCode}:${bookSlug}:${chapter}`;
  useEffect(() => {
    if (!exploreMatch) return;
    if (loadedKey.current === commentaryKey && commentaryState === 'ready') return;
    let cancelled = false;
    setCommentaryState('loading');
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
    Promise.race([fetchCommentaryChapter(CORPUS_CDN_ROOT, translationCode, bookSlug, chapter), timeout])
      .then((data) => {
        if (cancelled) return;
        const lookup: Record<number, string> = {};
        for (const vv of (data as Chapter).verses) lookup[vv.verse] = vv.text;
        setCommentaryByVerse(lookup);
        loadedKey.current = commentaryKey;
        setCommentaryState('ready');
      })
      .catch(() => { if (!cancelled) setCommentaryState('error'); });
    return () => { cancelled = true; };
  }, [exploreMatch, commentaryKey, translationCode, bookSlug, chapter]);

  // `Chapter` doesn't carry the book display name (just the verses), so
  // we fall back to the slug as the English title and let `localizeBookName`
  // override it per UI language.
  const bookTitle = useMemo(
    () => localizeBookName(translationCode, bookSlug, prettifySlug(bookSlug)),
    [translationCode, bookSlug],
  );

  // Verse body matches the Bible reader: Merriweather at the reader's size + line-height.
  const bodyType = { fontFamily: FONTS.merriweather, fontSize: readPrefs.fontSize, lineHeight: readPrefs.fontSize * readPrefs.lineH };

  if (loadErr) {
    return (
      <View style={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom, alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
        <Feather name="cloud-off" size={42} color={TXTSUB} />
        <Text style={styles.emptyText}>{t('plan.dayWalk.chapterLoadError')}</Text>
      </View>
    );
  }
  if (!chapterData) {
    return (
      <View style={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom, flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={ROSE} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={onScrollDismiss}
      contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}
    >
      <Text style={styles.chapterHeader}>{bookTitle} {chapter}</Text>
      {chapterData.verses.map((v: Verse) => {
        const inRange = v.verse >= verseStart && v.verse <= verseEnd;
        const hl = getColor(translationCode, bookSlug, chapter, v.verse);
        // Map-backed O(1) lookup via getHighlightColor — replaces a per-
        // verse .find() that was O(N=5) every render. Tiny win per verse,
        // but with 30+ verses in long chapters and re-renders on scroll,
        // measurable. Same change applied in BibleScreen.tsx.
        const hlColor = getHighlightColor(hl)?.bg;
        return (
          <View
            key={v.verse}
            ref={(r) => { verseRefs.current[v.verse] = r; }}
            onLayout={inRange && v.verse === verseStart
              ? (e) => {
                  if (focusYRef.current == null) {
                    focusYRef.current = e.nativeEvent.layout.y;
                    // Land the focused verse ~80 px from top for breathing room.
                    scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 80), animated: false });
                  }
                }
              : undefined
            }
            style={{ marginBottom: 18 }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                const sel = { bookSlug, bookTitle, chapter, verse: v.verse, text: v.text };
                const node = verseRefs.current[v.verse];
                if (node && typeof node.measureInWindow === 'function') {
                  node.measureInWindow((_x: number, y: number, _w: number, h: number) =>
                    onSelectVerse({ ...sel, anchorY: y, anchorH: h }));
                } else {
                  onSelectVerse(sel);
                }
              }}
            >
              <Text style={[
                styles.bibleVerse,
                bodyType,                                                           // Merriweather @ reader size/line-height
                { color: inRange ? TXT : 'rgba(30,27,46,0.35)' },                  // dim verses outside the focus range
                hlColor ? { backgroundColor: hlColor, borderRadius: 6 } : null,
              ]}>
                <Text style={[styles.bibleVerseNum, { color: inRange ? ROSE : 'rgba(230,63,105,0.45)' }]}>{v.verse}{'  '}</Text>
                {v.text}
              </Text>
            </TouchableOpacity>

            {/* Inline Explore card — expands under the tapped verse (no nav),
                same look + CDN flow as the Bible reader. */}
            {exploreMatch && exploreTarget!.verse === v.verse && (
              <View style={styles.explainInline}>
                <View style={styles.explainHeader}>
                  <Text style={styles.explainLabel}>{t('bible.explanation.title')}</Text>
                  <TouchableOpacity onPress={onCloseExplore} hitSlop={10}>
                    <Feather name="x" size={18} color={TXTSUB} />
                  </TouchableOpacity>
                </View>
                {commentaryState === 'loading' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <ActivityIndicator size="small" color={ROSE} />
                    <Text style={{ fontFamily: FONTS.merriweather, fontSize: readPrefs.fontSize - 2, color: TXTSUB }}>
                      {t('bible.explanation.loading')}
                    </Text>
                  </View>
                )}
                {commentaryState === 'error' && (
                  <Text style={{ fontFamily: FONTS.merriweather, fontSize: readPrefs.fontSize - 2, color: TXTSUB }}>
                    {t('bible.explanation.error')}
                  </Text>
                )}
                {commentaryState === 'ready' && (
                  <Text style={{
                    fontFamily: FONTS.merriweather,
                    fontSize: readPrefs.fontSize - 1,
                    lineHeight: (readPrefs.fontSize - 1) * readPrefs.lineH,
                    color: ROSE,
                  }}>
                    {commentaryByVerse[v.verse] || t('bible.explanation.none')}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// Title-case a Bible-book slug: `i-corinthians` → `I Corinthians`,
// `song-of-solomon` → `Song of Solomon`. Used as the English fallback
// when `localizeBookName` has no override for the current UI language.
function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .map(w => (w === 'i' || w === 'ii' || w === 'iii') ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Renders **bold** runs inside an otherwise plain string.
function renderMarkdownBolds(s: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  const re = /\*\*(.+?)\*\*/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > cursor) out.push(s.slice(cursor, m.index));
    // Merriweather bold per user — matches the Merriweather body face so the
    // bold run reads as the same serif, just heavier. Weight 600, NOT 700:
    // merriweatherBold + fontWeight '700' makes Android drop the face and fall
    // back to system sans (same quirk as the Lora 600 rule).
    out.push(<Text key={m.index} style={{ fontFamily: FONTS.merriweatherBold, fontWeight: '600' }}>{m[1]}</Text>);
    cursor = m.index + m[0].length;
  }
  if (cursor < s.length) out.push(s.slice(cursor));
  return out;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },

  // Progress
  progressRow: { flexDirection: 'row', gap: 4 },
  progressSeg: { flex: 1, height: 3.5, borderRadius: 2 },
  progressSegFilled: { backgroundColor: ROSE },
  progressSegEmpty: { backgroundColor: 'rgba(30,27,46,0.12)' },

  // Close button
  closeBtn: {
    position: 'absolute',
    right: 14,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1, borderColor: 'rgba(30,27,46,0.06)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  // Page content
  pageScroll: { paddingHorizontal: P + 4 },
  dayTitle: {
    fontFamily: FONTS.loraBold, fontSize: 25, fontWeight: '600', color: TXT,    // Lora 600 per user (loraBold pairs with 600, not 700)
    lineHeight: 33, letterSpacing: 0.2, marginTop: 30, marginBottom: 22,         // marginTop 15 → 30 (+15 px per user — clears the close button)
  },
  sectionCaption: {
    fontSize: 16.2, fontWeight: '800', fontFamily: FONTS.latoBold, color: ROSE, // 13.5 → 16.2 (+20 % per user — applies to the whole TODAY'S VERSE / PRAYER / … caption series)
    letterSpacing: 1.6, marginTop: 20, marginBottom: 20,                         // +20 px before, +8 px after (12 → 20) per user
  },
  captionWide: { marginBottom: 20 },                                            // unified to 20 to match sectionCaption (was 22 — 2px inconsistency across page types)
  verseRef: { fontSize: 18.4, fontWeight: '700', fontFamily: FONTS.loraBold, color: ROSE, marginBottom: 26, letterSpacing: 0.4 },
  verseBodyLarge: {
    fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY,
    fontSize: 23, lineHeight: 35, color: TXT,
    paddingLeft: 14, borderLeftWidth: 4, borderLeftColor: ROSE,
  },
  paragraph: { fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY, fontSize: 19.5, lineHeight: 32, color: TXT },
  prayerBody: { fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY, fontSize: 19.5, lineHeight: 33, color: TXT },

  chapterHeader: {
    fontFamily: FONTS.loraBold, fontSize: 14, fontWeight: '700',
    color: TXTSUB, letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 16,
  },
  // Bible-style verse rendering. Matches BibleScreen.styles.verse — same
  // serif body, same verse-number treatment in ROSE, so a verse the user
  // highlights here also looks identical in the standalone reader.
  bibleVerse: {
    fontFamily: FONTS.serif, fontVariationSettings: SERIF_BODY,
    fontSize: 19.5, lineHeight: 32, color: TXT,
  },
  bibleVerseNum: {
    fontWeight: '700', fontFamily: FONTS.latoBold, fontSize: 14,
  },

  // Inline Explore commentary card — mirrors BibleScreen.styles.explainInline.
  explainInline: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: ROSE,
    backgroundColor: 'rgba(230,63,105,0.06)',
    borderRadius: 10.4,
  },
  explainHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  explainLabel: { fontSize: 12, fontWeight: '700', color: TXTSUB, letterSpacing: 1.4, textTransform: 'uppercase' },

  // Popup
  popup: {
    position: 'absolute',
    left: 16, right: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6,
    zIndex: 10,
  },
  colorRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  colorDot: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 2, borderColor: 'transparent',
  },
  colorDotSelected: { borderColor: TXT },
  popupDivider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)', marginVertical: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4, minWidth: 56 },
  actionIcon: { height: 22, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, color: TXT, fontFamily: FONTS.lato, fontWeight: '500' },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    backgroundColor: 'transparent',
  },
  pillNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25.5,
    height: 51,                                                                 // 46 → 51 (+10 % per user)
    paddingHorizontal: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  pillNavBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  // Standalone next button, OUTSIDE the pill (right of it) per user — same
  // height as the pill so the two read as a balanced pair.
  nextBtn: {
    width: 51, height: 51, borderRadius: 25.5,
    backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ROSE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  // Last page — ROSE flips to green so "this day is finished" registers
  // at a glance (per user). Shadow tracks the new fill.
  nextBtnDone: { backgroundColor: '#3FAE6A', shadowColor: '#3FAE6A' },
  pillRef: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT,
  },

  // Toast
  toast: {
    position: 'absolute', left: 40, right: 40,
    backgroundColor: 'rgba(30,27,46,0.92)',
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10,
    alignItems: 'center',
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: FONTS.latoBold },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
  emptyText: { fontSize: 15, lineHeight: 22, fontFamily: FONTS.lato, color: TXTSUB, textAlign: 'center' },
});
