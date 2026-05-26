import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal,
  useWindowDimensions, Platform, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { useTranslation } from '../state/TranslationsContext';
import { useHighlights } from '../state/HighlightsContext';
import { useSavedVerses } from '../state/SavedVersesContext';
import { bookCodeToSlug, parseVerseRange } from '../constants/bibleBookCode';
import { localizeBookName } from '../constants/bibleBookNames';
import { bibleAudioUrl } from '../constants/bibleAudioCdn';
import { fetchChapter, type Chapter, type Verse } from '../services/bibleService';
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
}

export default function PlanDayWalk({ route, navigation }: RootStackScreenProps<'PlanDayWalk'>) {
  const insets = useSafeAreaInsets();
  const { slug, day } = route.params;
  const { loadPlan, loadedPlans, getSummary } = useFeaturedPlans();
  const { markDayComplete } = usePlanCompletion();
  const { current: translation } = useTranslation();
  const { setHighlight, getColor } = useHighlights();
  const { verses: savedList, addVerse, removeVerse, hasVerse } = useSavedVerses();
  const summary = getSummary(slug);

  const [plan, setPlan] = useState<FullPlan | null>(loadedPlans[slug] || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (plan) return;
    loadPlan(slug)
      .then(setPlan)
      .catch(() => setError('Plan content is not available yet. Please try again later.'));
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

  // Anchor chapter for the bottom audio button. Picked from scripture_focus
  // if present; otherwise the first verse_wall reference.
  const anchorChapter = useMemo(() => {
    const first = pages.find(p => p.kind === 'scripture_focus') as Extract<Page, { kind: 'scripture_focus' }> | undefined;
    if (first) {
      const bs = bookCodeToSlug(first.section.verse.bookCode);
      if (bs) return { bookSlug: bs, chapter: first.section.verse.chapter };
    }
    const v = pages.find(p => p.kind === 'verse') as Extract<Page, { kind: 'verse' }> | undefined;
    if (v) return { bookSlug: v.bookSlug, chapter: v.ref.chapter };
    return null;
  }, [pages]);

  const audioSrc = anchorChapter
    ? bibleAudioUrl(translation.code, anchorChapter.bookSlug, anchorChapter.chapter)
    : '';
  const audioPlayer = useAudioPlayer(audioSrc || null);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  useEffect(() => () => {
    try { if (audioPlayer.playing) audioPlayer.pause(); } catch {}
  }, [audioPlayer]);
  const toggleAudio = () => {
    if (!anchorChapter) return;
    if (audioStatus.playing) audioPlayer.pause(); else audioPlayer.play();
  };

  // Pager state
  const { width: winWidth } = useWindowDimensions();
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
    }
  };

  // Verse selection (powers the popup overlay). Stored separately from
  // the verse_wall page index so user can tap any visible verse on a
  // verse page, not just the focused one.
  const [selected, setSelected] = useState<SelectedVerse | null>(null);
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
    }
  };
  const onPrev = () => {
    if (page > 0) goTo(page - 1);
    else navigation.goBack();
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
          <Text style={styles.emptyText}>{error || 'This day has no content.'}</Text>
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
      <CloseBtn onPress={() => navigation.goBack()} top={insets.top + 14} />

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
              insetTop={20}
              insetBottom={insets.bottom + 110}
              translationCode={translation.code}
              translationSource={translation.source}
              getColor={getColor}
              onSelectVerse={setSelected}
            />
          </View>
        ))}
      </ScrollView>

      {/* Verse popup — fixed near the bottom above the nav bar so it never
          covers the verse being acted on. */}
      {selected && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          style={[styles.popup, { bottom: insets.bottom + 78 }]}
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
                      showToast('Removed');
                    } else {
                      addVerse(ref, selected.text);
                      showToast('Saved');
                    }
                  } },
                { key: 'Copy', icon: 'copy' as const, onPress: () => {
                    Clipboard.setStringAsync(`${selected.text}\n— ${ref}`).catch(() => {});
                    // Android shows its own system snackbar on clipboard write
                    // (Android 13+/Samsung One UI) — suppress our app pill on
                    // Android so the two don't stack. See BibleScreen for the
                    // matching gate.
                    if (Platform.OS === 'ios') showToast('Copied');
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
                    // Pass the user through to the full Bible reader where
                    // Explore opens its inline commentary card — duplicating
                    // that flow here would mean porting fetchCommentaryChapter.
                    navigation.navigate('PlanVerseRead', {
                      focus: {
                        bookSlug: selected.bookSlug,
                        chapter: selected.chapter,
                        verseStart: selected.verse,
                        verseEnd: selected.verse,
                      },
                      planSlug: slug,
                      day,
                    });
                    setSelected(null);
                  } },
              ];
              return actions.map(a => (
                <TouchableOpacity key={a.key} onPress={a.onPress} style={styles.actionBtn}>
                  {a.key === 'Save'
                    ? <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={20} color={isSaved ? ROSE : TXT} />
                    : <Feather name={a.icon} size={18} color={TXT} />}
                  <Text style={[styles.actionLabel, a.key === 'Save' && isSaved && { color: ROSE, fontWeight: '700' }]}>
                    {a.key}
                  </Text>
                </TouchableOpacity>
              ));
            })()}
          </View>
        </Animated.View>
      )}

      {/* Bottom: round play button + chapter:verse pill with prev/next */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          onPress={toggleAudio}
          activeOpacity={0.8}
          disabled={!anchorChapter}
          style={[styles.playBtn, !anchorChapter && { opacity: 0.4 }]}
          hitSlop={8}
        >
          <Feather name={audioStatus.playing ? 'pause' : 'play'} size={18} color={TXT} />
        </TouchableOpacity>

        <View style={styles.pillNav}>
          <TouchableOpacity onPress={onPrev} style={styles.pillNavBtn} hitSlop={6}>
            <Feather name="chevron-left" size={20} color={TXT} />
          </TouchableOpacity>
          <Text style={styles.pillRef} numberOfLines={1}>{currentRef}</Text>
          <TouchableOpacity onPress={onNext} style={[styles.pillNavBtn, styles.pillNavBtnNext]} hitSlop={6}>
            <Feather name={isLast ? 'check' : 'chevron-right'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
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
              showToast('Saved');
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

// One page of the pager. Either a prose section (verse / teaching /
// prayer) or a verse page — which fetches the chapter so it can render
// the surrounding context dimmed, focus the target range, and surface
// the same tap-popup the Bible reader has.
function PageContent({
  page, dayTitle, isFirstPage, insetTop, insetBottom,
  translationCode, translationSource, getColor, onSelectVerse,
}: {
  page: Page;
  dayTitle: string;
  isFirstPage: boolean;
  insetTop: number;
  insetBottom: number;
  translationCode: string;
  translationSource: string;
  getColor: (tr: string, b: string, ch: number, v: number) => string | undefined;
  onSelectVerse: (sv: SelectedVerse) => void;
}) {
  if (page.kind === 'scripture_focus') {
    const v = page.section.verse;
    const bookSlug = bookCodeToSlug(v.bookCode);
    const bookTitle = bookSlug ? localizeBookName(translationCode, bookSlug, v.display.split(' ')[0]) : v.display.split(' ')[0];
    const onTap = () => {
      if (!bookSlug) return;
      onSelectVerse({ bookSlug, bookTitle, chapter: v.chapter, verse: parseVerseRange(v.verses).start, text: v.text });
    };
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        {isFirstPage && <Text style={styles.dayTitle}>{dayTitle}</Text>}
        <Text style={styles.sectionCaption}>{page.section.heading.toUpperCase()}</Text>
        <Text style={styles.verseRef}>{v.display}</Text>
        <TouchableOpacity activeOpacity={0.85} onPress={onTap}>
          <Text style={styles.verseBodyLarge}>&ldquo;{v.text}&rdquo;</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
  if (page.kind === 'teaching') {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        {isFirstPage && <Text style={styles.dayTitle}>{dayTitle}</Text>}
        <Text style={[styles.sectionCaption, styles.captionWide]}>{page.section.heading.toUpperCase()}</Text>
        {page.section.paragraphs.map((para, i) => (
          <Text key={i} style={[styles.paragraph, i > 0 && { marginTop: 16 }]}>
            {renderMarkdownBolds(para)}
          </Text>
        ))}
      </ScrollView>
    );
  }
  if (page.kind === 'prayer') {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
        {isFirstPage && <Text style={styles.dayTitle}>{dayTitle}</Text>}
        <Text style={[styles.sectionCaption, styles.captionWide]}>{page.section.heading.toUpperCase()}</Text>
        <Text style={styles.prayerBody}>{page.section.body}</Text>
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
      insetTop={insetTop}
      insetBottom={insetBottom}
      getColor={getColor}
      onSelectVerse={onSelectVerse}
    />
  );
}

function VersePage({
  bookSlug, chapter, verseStart, verseEnd,
  translationCode, translationSource, insetTop, insetBottom, getColor, onSelectVerse,
}: {
  bookSlug: string; chapter: number; verseStart: number; verseEnd: number;
  translationCode: string; translationSource: string;
  insetTop: number; insetBottom: number;
  getColor: (tr: string, b: string, ch: number, v: number) => string | undefined;
  onSelectVerse: (sv: SelectedVerse) => void;
}) {
  const t = useT();
  const [chapterData, setChapterData] = useState<Chapter | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const focusYRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChapter(translationCode, translationSource, bookSlug, chapter)
      .then(c => { if (alive) setChapterData(c); })
      .catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [translationCode, translationSource, bookSlug, chapter]);

  // `Chapter` doesn't carry the book display name (just the verses), so
  // we fall back to the slug as the English title and let `localizeBookName`
  // override it per UI language.
  const bookTitle = useMemo(
    () => localizeBookName(translationCode, bookSlug, prettifySlug(bookSlug)),
    [translationCode, bookSlug],
  );

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
              onPress={() => onSelectVerse({ bookSlug, bookTitle, chapter, verse: v.verse, text: v.text })}
            >
              <Text style={[
                styles.bibleVerse,
                { color: inRange ? TXT : 'rgba(30,27,46,0.35)' },                  // dim verses outside the focus range
                hlColor ? { backgroundColor: hlColor, borderRadius: 6 } : null,
              ]}>
                <Text style={[styles.bibleVerseNum, { color: inRange ? ROSE : 'rgba(232,97,154,0.45)' }]}>{v.verse}{'  '}</Text>
                {v.text}
              </Text>
            </TouchableOpacity>
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
    out.push(<Text key={m.index} style={{ fontWeight: '700' }}>{m[1]}</Text>);
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
    fontFamily: FONTS.sansBold, fontSize: 25, fontWeight: '700', color: TXT,
    lineHeight: 32, letterSpacing: 0.2, marginBottom: 12,
  },
  sectionCaption: {
    fontSize: 13.5, fontWeight: '800', fontFamily: FONTS.latoBold, color: ROSE,
    letterSpacing: 1.6, marginBottom: 12,
  },
  captionWide: { marginBottom: 22 },
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
  playBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  pillNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 23,
    height: 46,
    paddingLeft: 8, paddingRight: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  pillNavBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  pillNavBtnNext: {
    backgroundColor: ROSE,
    shadowColor: ROSE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 2,
  },
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
