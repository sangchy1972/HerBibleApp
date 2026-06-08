import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, AppState, useWindowDimensions, PanResponder, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay,
  interpolateColor, Easing,
  FadeIn, FadeOut, SlideInUp, SlideInDown,
} from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS, SERIF_BODY, SCREEN_BG } from '../constants/theme';
import { RECENT_SEARCHES } from '../constants/data';
import { useTranslation, TRANSLATIONS } from '../state/TranslationsContext';
import { useT } from '../i18n/useT';
import { useSavedVerses } from '../state/SavedVersesContext';
import { useActivity } from '../state/ActivityContext';
import { useHighlights } from '../state/HighlightsContext';
import { useBookmarks } from '../state/BookmarksContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import ShareVerseSheet from '../components/ShareVerseSheet';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import VerseNoteSheet from '../components/VerseNoteSheet';
import TabSection from '../components/shared/TabSection';
import { fetchTranslationIndex, fetchChapter, fetchCommentaryChapter, streamingSearchVerses, type BookSummary, type Verse, type VerseHit, type SearchProgress } from '../services/bibleService';
import { CORPUS_CDN_ROOT } from '../constants/corpus';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { bibleAudioUrl } from '../constants/bibleAudioCdn';
import { loadTimestamps, verseAtTime, type ChapterTimestamps } from '../services/bibleAudioService';
import BibleAudioPlayer from '../components/BibleAudioPlayer';
import { adjustFocus } from '../constants/versification';
import { HL_COLORS, getHighlightColor } from '../constants/highlightColors';
import type { BibleFocus, TabParamList } from '../navigation/types';

// Reader font picker — Merriweather sits first per user; Source Serif 4
// and Inter were retired (their entries no longer load on the reader). The
// remaining four cover serif (Merriweather + Lora display) and sans (Lato +
// Noto Sans for CJK) so the picker spans both genres for the seven UI
// languages the app supports.
type FontChoice = 'Merriweather' | 'Lora' | 'Lato' | 'Sans';
const FONT_CHOICES: FontChoice[] = ['Merriweather', 'Lora', 'Lato', 'Sans'];
const FONT_FAMILY: Record<FontChoice, string | undefined> = {
  Merriweather: FONTS.merriweather,
  Lora: FONTS.lora,
  Lato: FONTS.lato,
  Sans: FONTS.sans,
};

// Local-day key for the reading timer's per-day accumulator (`YYYY-MM-DD`).
// Local time intentionally — counters are user-local, not UTC.
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// HL_COLORS pulled from the shared module — was previously inlined here
// AND in PlanDayWalk + ProfileScreen, so a sixth color or a tint change
// required edits in three places. Now imported via top-of-file import.

const TOOLBAR_ACTIONS = [
  { label: 'Save', icon: 'heart' },     // matches the "Saved" stat tile + Saved Verses section in Profile
  { label: 'Copy', icon: 'copy' },
  { label: 'Notes', icon: 'edit-2' },
  { label: 'Share', icon: 'share-2' },
  { label: 'Explore', icon: 'zoom-in' },
] as const;

// Maps the internal toolbar `label` (used as a switch key) to its i18n key. The
// "Save" button flips to verseToolbar.saved while the verse is already saved.
const TOOLBAR_LABEL_KEY: Record<typeof TOOLBAR_ACTIONS[number]['label'], string> = {
  Save:    'verseToolbar.save',
  Copy:    'verseToolbar.copy',
  Notes:   'verseToolbar.notes',
  Share:   'verseToolbar.share',
  Explore: 'verseToolbar.explore',
};

function BookDrawer({ onClose, books, currentSlug, currentChapter, onPick }: {
  onClose: () => void;
  books: BookSummary[];
  currentSlug: string;
  currentChapter: number;
  onPick: (slug: string, chapter: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  // Chapter grid cell size — adapts to screen width so 6 cells fit per row on
  // every phone. Math: usable width = screen − drawer.paddingHorizontal × 2
  // − chapterStrip.paddingHorizontal × 2 (7 + 7); subtract 5 × gap (8 each)
  // for the 5 inter-cell gaps; divide by 6. Height = width × 0.9 per user.
  const { width: screenW } = useWindowDimensions();
  const CHAPTER_STRIP_PAD = 10;
  const CHAPTER_GAP = 8;
  const chapterCellW = Math.max(28, (screenW - P * 2 - CHAPTER_STRIP_PAD * 2 - CHAPTER_GAP * 5) / 6);
  const chapterCellH = chapterCellW * 0.9;
  const currentIdx = books.findIndex(b => b.slug === currentSlug);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [testament, setTestament] = useState<'OT' | 'NT'>(currentIdx >= 39 ? 'NT' : 'OT');

  // OT/NT slices memoized so they only re-allocate when the book index
  // changes (which only happens on translation switch). `visibleBooks` is
  // intentionally derived directly from `testament` toggle below so the
  // tab flip is instant without re-running the slice.
  const otBooks = useMemo(() => books.slice(0, 39), [books]);
  const ntBooks = useMemo(() => books.slice(39, 66), [books]);
  const visibleBooks = testament === 'OT' ? otBooks : ntBooks;
  const baseIdx = testament === 'OT' ? 0 : 39;
  const expandedBook = useMemo(
    () => books.find(b => b.slug === expandedSlug) || null,
    [books, expandedSlug],
  );

  // Sliding-pill animation for OT / NT (mirrors PrayerScreen morning/evening toggle)
  const tabProgress = useSharedValue(testament === 'OT' ? 0 : 1);
  const pillRowWidth = useSharedValue(0);
  useEffect(() => {
    tabProgress.value = withTiming(testament === 'OT' ? 0 : 1, { duration: 500 });
  }, [testament, tabProgress]);
  const indicatorStyle = useAnimatedStyle(() => {
    const w = Math.max(0, (pillRowWidth.value - 6) / 2);
    return {
      width: w,
      transform: [{ translateX: tabProgress.value * w }],
      backgroundColor: ROSE,                                                     // always ROSE per user — was interpolating to LAV when NT was selected
    };
  });
  const otTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tabProgress.value, [0, 1], ['#ffffff', TXTSUB]),
  }));
  const ntTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tabProgress.value, [0, 1], [TXTSUB, '#ffffff']),
  }));

  // Group books into rows of 3 so we can splice the chapter grid in after the row that contains the expanded book.
  const rows: { row: BookSummary[]; startIdx: number }[] = [];
  for (let i = 0; i < visibleBooks.length; i += 3) {
    rows.push({ row: visibleBooks.slice(i, i + 3), startIdx: i });
  }

  return (
    <View style={styles.drawerOverlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(30,27,46,0.30)' }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={SlideInUp.duration(500).delay(100).easing(Easing.out(Easing.cubic))}
        style={[styles.drawer, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>{t('bibleReader.drawerTitle')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={TXT} />
          </TouchableOpacity>
        </View>

        <View
          style={styles.pillRow}
          onLayout={(e) => { pillRowWidth.value = e.nativeEvent.layout.width; }}
        >
          <Animated.View pointerEvents="none" style={[styles.pillIndicator, indicatorStyle]} />
          <TouchableOpacity
            onPress={() => { setTestament('OT'); setExpandedSlug(null); }}
            style={styles.drawerPill}
            activeOpacity={0.85}
          >
            <Animated.Text
              style={[styles.drawerPillText, otTextStyle]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('bibleReader.ot.withCount', { n: otBooks.length })}
            </Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setTestament('NT'); setExpandedSlug(null); }}
            style={styles.drawerPill}
            activeOpacity={0.85}
          >
            <Animated.Text
              style={[styles.drawerPillText, ntTextStyle]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('bibleReader.nt.withCount', { n: ntBooks.length })}
            </Animated.Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {rows.map(({ row, startIdx }) => {
            const rowContainsExpanded = expandedBook && row.some(b => b.slug === expandedBook.slug);
            return (
              <React.Fragment key={startIdx}>
                <View style={styles.bookRow}>
                  {row.map((b, j) => {
                    const isCurrent = b.slug === currentSlug;
                    const isExpanded = b.slug === expandedSlug;
                    return (
                      <TouchableOpacity
                        key={b.slug}
                        onPress={() => setExpandedSlug(isExpanded ? null : b.slug)}
                        style={[
                          styles.bookCell,
                          isCurrent && styles.bookCellActive,
                          isExpanded && styles.bookCellExpanded,
                        ]}
                      >
                        <Text style={[styles.bookNum, isCurrent && { color: 'rgba(255,255,255,0.85)' }]}>{String(baseIdx + startIdx + j + 1).padStart(2, '0')}</Text>
                        <Text
                          style={[styles.bookName, isCurrent && { color: '#fff', fontWeight: '700' }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >{b.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {/* fill remainder of last partial row so flex spacing stays even */}
                  {row.length < 3 && Array.from({ length: 3 - row.length }, (_, k) => (
                    <View key={`spacer-${k}`} style={[styles.bookCell, { opacity: 0 }]} pointerEvents="none" />
                  ))}
                </View>

                {rowContainsExpanded && expandedBook && (
                  <View style={styles.chapterStrip}>
                    {Array.from({ length: expandedBook.chapters }, (_, i) => i + 1).map(ch => {
                      const isCurrent = expandedBook.slug === currentSlug && ch === currentChapter;
                      return (
                        <TouchableOpacity
                          key={ch}
                          onPress={() => onPick(expandedBook.slug, ch)}
                          style={[
                            styles.chapterCell,
                            { width: chapterCellW, height: chapterCellH },
                            isCurrent && styles.chapterCellActive,
                          ]}
                        >
                          <Text style={[styles.chapterNum, isCurrent && { color: '#fff', fontWeight: '700' }]}>{ch}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function SearchOverlay({
  onClose, books, onPick, onPickVerse,
  translationCode, translationSource, currentBookSlug,
}: {
  onClose: () => void;
  books: BookSummary[];
  onPick: (slug: string) => void;
  onPickVerse: (slug: string, chapter: number) => void;
  translationCode: string;
  translationSource: string;
  currentBookSlug: string;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState(RECENT_SEARCHES);
  const [verseHits, setVerseHits] = useState<VerseHit[]>([]);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const bookResults = q ? books.filter(b => b.name.toLowerCase().includes(q.toLowerCase())) : null;
  const bookBySlug = (slug: string) => books.find(b => b.slug === slug);

  // Delay the keyboard 400 ms so the overlay's slide-in finishes first.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  // Streaming cross-Bible search. Cached hits arrive instantly; uncached
  // chapters get fetched + searched in book order (current book first), with
  // progressive results streaming into `verseHits`. New keystrokes abort the
  // in-flight pass via the AbortController.
  useEffect(() => {
    setVerseHits([]);
    setDone(false);
    setProgress(null);
    if (!q.trim()) return;
    const ctrl = new AbortController();
    const debounce = setTimeout(() => {
      streamingSearchVerses(translationCode, translationSource, books, q, {
        signal: ctrl.signal,
        startBookSlug: currentBookSlug,
        onBatch: (batch) => setVerseHits((prev) => prev.concat(batch)),
        onProgress: setProgress,
        onComplete: () => setDone(true),
      });
    }, 250);
    return () => { clearTimeout(debounce); ctrl.abort(); };
  }, [q, translationCode, translationSource, books, currentBookSlug]);

  const highlight = (text: string) => {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <Text style={{ color: ROSE, fontWeight: '700' }}>{match}</Text>
        {after}
      </>
    );
  };

  return (
    <View style={styles.searchOverlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FBF7F6' }]}
      />
      <Animated.View entering={FadeIn.duration(500).delay(100)} style={StyleSheet.absoluteFillObject}>
        <View style={[styles.searchBar, { paddingTop: insets.top + 18 }]}>
          <View style={styles.searchInputWrap}>
            <Feather name="search" size={18} color={TXTSUB} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              value={q}
              onChangeText={setQ}
              placeholder={t('bibleReader.search.placeholder')}
              placeholderTextColor={TXTSUB}
              style={styles.searchInput}
            />
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={[styles.cancelText, { color: ROSE }]}>{t('bibleReader.search.cancel')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.searchScroll} keyboardShouldPersistTaps="handled">
        {!q && recents.length > 0 && (
          <View>
            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>{t('bibleReader.search.recent')}</Text>
              <TouchableOpacity onPress={() => setRecents([])} hitSlop={10}>
                <Text style={{ fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato }}>{t('bibleReader.search.clear')}</Text>
              </TouchableOpacity>
            </View>
            {recents.map(term => (
              <TouchableOpacity
                key={term}
                onPress={() => setQ(term)}
                style={styles.recentRow}
              >
                <Feather name="clock" size={16} color={TXTSUB} />
                <Text style={styles.recentTerm}>{term}</Text>
                <TouchableOpacity onPress={() => setRecents(r => r.filter(x => x !== term))} hitSlop={10}>
                  <Feather name="x" size={14} color={TXTSUB} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {q && bookResults && bookResults.length > 0 && (
          <View>
            <Text style={styles.resultsLabel}>{t('bibleReader.search.books', { n: bookResults.length })}</Text>
            {bookResults.map(b => (
              <TouchableOpacity key={b.slug} onPress={() => onPick(b.slug)} style={styles.resultRow}>
                <Text style={styles.resultBook}>{b.name}</Text>
                <Feather name="chevron-right" size={18} color={TXTSUB} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {q && (
          <View>
            <Text style={styles.resultsLabel}>
              {done
                ? t('bibleReader.search.verses', { n: verseHits.length })
                : t('bibleReader.search.verses.searching', { n: verseHits.length })}
            </Text>
            {!done && progress && (
              <Text style={styles.progressLine}>
                {t('bibleReader.search.scanning', { book: progress.currentBook, done: progress.done, total: progress.total })}
              </Text>
            )}
            {done && verseHits.length === 0 && (
              <Text style={styles.noResults}>{t('bibleReader.search.noResults', { query: q })}</Text>
            )}
            {verseHits.map(h => {
              const bookName = bookBySlug(h.bookSlug)?.name || h.bookSlug;
              return (
                <TouchableOpacity
                  key={`${h.bookSlug}:${h.chapter}:${h.verse}`}
                  onPress={() => onPickVerse(h.bookSlug, h.chapter)}
                  style={styles.verseHitRow}
                >
                  <Text style={styles.verseHitRef}>{bookName} {h.chapter}:{h.verse}</Text>
                  <Text style={styles.verseHitText} numberOfLines={3}>{highlight(h.text)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Theme picker swatches. Position 1 is a cool neutral gray-beige (was the
// warm `#FBF7F6` which read as cream-pink and visually overlapped with the
// rose option at position 3). Position 3 holds the actual pink swatch.
// `rose` was removed from position 2 (the user pointed out the duplicate
// pink); cream now sits at position 2 and the rest of the spectrum fills
// the row.
const THEME_OPTS = [
  { id: 'default', color: SCREEN_BG },                                           // matches the app screen bg (Prayer/Plan/Profile) exactly
  { id: 'cream',   color: '#FAF6E8' },
  { id: 'rose',    color: '#FBEEEE' },
  { id: 'sage',    color: '#EAF1E6' },
  { id: 'sky',     color: '#EAF2FB' },
  { id: 'dark',    color: '#1A1620' },
];

interface ReaderSheetProps {
  onClose: () => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  lineH: number;
  setLineH: (v: number) => void;
  paragraphSpacing: number;
  setParagraphSpacing: (v: number) => void;
  font: FontChoice;
  setFont: (v: FontChoice) => void;
  theme: string;
  setTheme: (v: string) => void;
}

// Custom slider — replaces @react-native-community/slider so all three
// rows in the reader sheet render byte-identical: same track thickness,
// same thumb size, same colours. The Community Slider used the native
// widget under the hood, whose track height + thumb diameter differ
// per platform and aren't exposed as props.
//
// Track is 6 px tall (50 % thicker than the Community Slider's ~4 px
// default per user); thumb is a 22 px white circle with a ROSE outline.
// Pan handler reads `locationX` so the thumb tracks the finger even on
// taps (no need to land directly on the thumb).
const SLIDER_TRACK_H = 6;
const SLIDER_THUMB_D = 22;
const SLIDER_THUMB_R = SLIDER_THUMB_D / 2;

function SliderRow({ label, value, display, min, max, step, onChange }: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);

  // Latest min/max/step/onChange need to be readable from inside the
  // PanResponder, which we keep stable across renders. Stash them in a
  // ref so the handlers always see fresh values without rebinding.
  const cfg = useRef({ min, max, step, onChange, trackWidth });
  cfg.current = { min, max, step, onChange, trackWidth };

  const apply = (locationX: number) => {
    const c = cfg.current;
    if (c.trackWidth <= 0) return;
    const usable = c.trackWidth;
    const clamped = Math.max(0, Math.min(usable, locationX));
    const pct = clamped / usable;
    const raw = c.min + pct * (c.max - c.min);
    const stepped = Math.round(raw / c.step) * c.step;
    c.onChange(Math.max(c.min, Math.min(c.max, stepped)));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => apply(e.nativeEvent.locationX),
      onPanResponderMove:  (e) => apply(e.nativeEvent.locationX),
    }),
  ).current;

  const span = Math.max(0.0001, max - min);
  const fillW = trackWidth > 0 ? ((value - min) / span) * trackWidth : 0;
  // Thumb centered on fill's right edge, clamped so it doesn't bleed past
  // the track on either end.
  const thumbLeft = Math.max(0, Math.min(trackWidth - SLIDER_THUMB_D, fillW - SLIDER_THUMB_R));

  return (
    <View style={styles.readerSection}>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{display}</Text>
      </View>
      <View
        {...panResponder.panHandlers}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={styles.slider}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: fillW }]} />
        <View style={[styles.sliderThumb, { left: thumbLeft }]} />
      </View>
    </View>
  );
}

function ReaderSheet({
  onClose, fontSize, setFontSize, lineH, setLineH,
  paragraphSpacing, setParagraphSpacing, font, setFont, theme, setTheme,
}: ReaderSheetProps) {
  const t = useT();
  // Theme swatches must always fit ONE row regardless of device width: 6 dots,
  // capped at 36 px (−10 % from the old 40), shrinking only on ultra-narrow
  // screens. Sheet inset is (P+4) each side; reserve ≥8 px between dots.
  const { width: winW } = useWindowDimensions();
  const themeDot = Math.min(36, Math.floor((winW - (P + 4) * 2 - 5 * 8) / 6));
  return (
    <View style={styles.readerOverlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(20,16,28,0.55)' }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))} style={styles.readerSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.readerHeader}>
          <Text style={styles.readerTitle}>{t('bibleReader.reader.title')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={TXT} />
          </TouchableOpacity>
        </View>

        <SliderRow
          label={t('bibleReader.reader.fontSize')}
          value={fontSize}
          display={`${Math.round(fontSize)}px`}
          min={16} max={25} step={1}                                              // 19→16 min, 26→25 max per user
          onChange={setFontSize}
        />
        <SliderRow
          label={t('bibleReader.reader.lineHeight')}
          value={lineH}
          display={lineH.toFixed(2)}
          min={1.5} max={2} step={0.05}
          onChange={(v) => setLineH(parseFloat(v.toFixed(2)))}
        />
        <SliderRow
          label={t('bibleReader.reader.paragraphSpacing')}
          value={paragraphSpacing}
          display={`${Math.round(paragraphSpacing)}px`}
          min={12} max={30} step={1}
          onChange={setParagraphSpacing}
        />

        <Text style={styles.readerSectionLabel}>{t('bibleReader.reader.font')}</Text>
        {/* Each chip is content-width (sized to its label) and the whole strip
            scrolls horizontally — so the long "Merriweather" never gets
            squeezed/shrunk to fit a fixed cell, and the row adapts to any
            device width. Every label renders IN ITS OWN typeface so the user
            previews the actual font before picking it. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.fontPills}
          contentContainerStyle={styles.fontPillsContent}
        >
          {FONT_CHOICES.map(f => {
            const active = font === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFont(f)}
                style={[styles.fontPill, active ? styles.fontPillActive : styles.fontPillInactive]}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.fontPillText, { color: active ? '#fff' : TXT, fontFamily: FONT_FAMILY[f] }]}
                  numberOfLines={1}
                >
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.readerSectionLabel}>{t('bibleReader.reader.theme')}</Text>
        <View style={styles.themeRow}>
          {THEME_OPTS.map(t => {
            const active = theme === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTheme(t.id)}
                style={[styles.themeCircle, {
                  width: themeDot,
                  height: themeDot,
                  borderRadius: themeDot / 2,
                  backgroundColor: t.color,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? ROSE : 'rgba(30,27,46,0.10)',
                }]}
                activeOpacity={0.85}
              >
                {active && (
                  <Feather name="check" size={14} color={t.id === 'dark' ? '#fff' : TXT} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const THEMES: Record<string, { bg: string; txt: string; sub: string }> = {
  default: { bg: SCREEN_BG, txt: TXT, sub: TXTSUB },                              // SCREEN_BG — unified with the Prayer/Plan/Profile background; picker swatch (THEME_OPTS[0]) stays in sync
  cream: { bg: '#FAF6E8', txt: '#3A2E1F', sub: '#7A6A52' },
  rose: { bg: '#FBEEEE', txt: '#4A2530', sub: '#876672' },
  sage: { bg: '#EAF1E6', txt: '#26331F', sub: '#5C6B53' },
  sky: { bg: '#EAF2FB', txt: '#1F2F4A', sub: '#6B7B96' },
  dark: { bg: '#1A1620', txt: '#F5F0EC', sub: '#9C95A6' },
};

export default function BibleScreen() {
  // Per-section entrance animations (header / verse list) — see the two
  // <TabSection> wrappers below. The per-chapter scroll-to-top (line ~1040)
  // already lands the user at the top of the verse list when the chapter
  // changes; the focus effect below adds a scroll-to-top on tab switch too,
  // so coming back to Bible after a side trip never leaves the user mid-scroll.
  const route = useRoute<RouteProp<TabParamList, 'bible'>>();
  const navigation = useNavigation();
  const t = useT();
  const { current: translation, pending: pendingDl } = useTranslation();
  // Heads-up shown when the user opens the reader while the Bible for the
  // newly-chosen language is still downloading — it auto-swaps in when ready.
  const [dlNotice, setDlNotice] = useState<string | null>(null);
  const dlNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { verses: savedList, addVerse, removeVerse, hasVerse } = useSavedVerses();
  const { markToday } = useActivity();
  const { setHighlight, getColor } = useHighlights();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { markRead, isRead, readDates } = useReadChapters();
  // Same prayer-bg context the home verse card consumes — used here to
  // pass the daily photo into ShareVerseSheet so its preview cards inherit
  // the live backdrop instead of falling back to the pink/lav gradient.
  const prayerBg = usePrayerBackgrounds();
  // Fresh-install default is Genesis 1 — the start of the whole Bible. Returning
  // users get jumped to their persisted last-read position by the mount effect
  // below, so they never actually see this default.
  const [bookSlug, setBookSlug] = useState('genesis');
  const [chapter, setChapter] = useState(1);
  // One-shot focus from the home-screen verse card. While set, we dim every
  // verse outside the range and scroll the start verse near the top. Cleared
  // on tab blur and whenever the user navigates to a different chapter, so
  // plain re-entries to the reader are unaffected.
  const [focusRange, setFocusRange] = useState<BibleFocus | null>(null);
  const verseYRef = useRef<Record<number, number>>({});
  const pendingScrollVerseRef = useRef<number | null>(null);
  // True for the duration of a single Bible-tab visit when that visit was
  // entered via a one-shot card focus. While this is set, the rehydrate
  // useFocusEffect below stays out of the way — we don't want to overwrite
  // the focused chapter back to the user's saved progress. Reset on blur.
  const focusVisitRef = useRef(false);
  // Restore the user's last-read position once on mount. We deliberately do
  // NOT mirror every state change back to AsyncStorage — persistence happens
  // only via `goToChapter` below, so opening a verse from the home-screen
  // card doesn't get recorded as reading progress.
  useEffect(() => {
    AsyncStorage.getItem('bible:last-read').then(raw => {
      // First-mount-via-card-focus race: the focus-consume effect runs
      // synchronously and sets the chapter; if this async getItem resolves
      // afterwards, it would overwrite the focused chapter back to the saved
      // progress (the original "tap → flashes psalms 23" bug). Skip when a
      // focus jump already owns the chapter.
      if (focusVisitRef.current) return;
      if (!raw) return;
      try {
        const v = JSON.parse(raw);
        if (v && typeof v.bookSlug === 'string' && typeof v.chapter === 'number') {
          setBookSlug(v.bookSlug);
          setChapter(v.chapter);
        }
      } catch {}
    });
  }, []);
  // Real navigation (drawer, search, saved-verse jump) flows through here so
  // we update last-read in lockstep with the state change. Card-driven focus
  // jumps bypass this on purpose.
  const goToChapter = useCallback((slug: string, ch: number) => {
    setBookSlug(slug);
    setChapter(ch);
    AsyncStorage.setItem('bible:last-read', JSON.stringify({ bookSlug: slug, chapter: ch })).catch(() => {});
  }, []);
  // When the tab is re-focused (e.g. after the user tapped a bookmark or
  // highlight from Profile), re-check last-read and jump to that chapter if
  // it changed. The mount effect above handles the very first load.
  useFocusEffect(
    React.useCallback(() => {
      // Skip during a focus-jump visit — the consume effect below owns state
      // and persistence is intentionally suppressed for the verse view.
      if (focusVisitRef.current || route.params?.focus) return;
      AsyncStorage.getItem('bible:last-read').then(raw => {
        if (!raw) return;
        try {
          const v = JSON.parse(raw);
          if (v && typeof v.bookSlug === 'string' && typeof v.chapter === 'number') {
            if (v.bookSlug !== bookSlug || v.chapter !== chapter) {
              setBookSlug(v.bookSlug);
              setChapter(v.chapter);
            }
          }
        } catch {}
      });
    }, [bookSlug, chapter, route.params?.focus]),
  );
  // Scroll the verse list back to the chapter title every time the Bible tab
  // gains focus — paired with the tab-entrance slide-up animation, so the
  // user always lands at the very top of the chapter, never mid-scroll.
  // Skipped when there's an inbound focus-verse param: the explicit jump
  // effect (line ~1050) targets the focused verse instead.
  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.focus) return;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return undefined;
    }, [route.params?.focus]),
  );
  // Consume a one-shot focus from the home-screen verse card. Sets state but
  // does NOT touch last-read — viewing a verse from the card is not reading
  // progress. The visit ref above blocks the rehydrate from clobbering us.
  useEffect(() => {
    const incoming = route.params?.focus;
    if (!incoming) return;
    // Incoming focus is in canonical (KJV-style) numbering. Translate it
    // into whatever the active translation's chapter file actually uses
    // (Lutherbibel/LSG diverge on Psalms with Hebrew titles, Joel, Malachi).
    const focus = adjustFocus(translation.code, incoming);
    focusVisitRef.current = true;
    setBookSlug(focus.bookSlug);
    setChapter(focus.chapter);
    setFocusRange(focus);
    navigation.setParams({ focus: undefined } as never);
  }, [route.params?.focus, navigation, translation.code]);
  // Drop the highlight when leaving the tab so a normal next visit reads
  // without dimming. Reset the visit flag too so the next entry rehydrates.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        setFocusRange(null);
        focusVisitRef.current = false;
      };
    }, []),
  );
  // Reminder #2: opening the reader in the brief window AFTER choosing a new
  // language but BEFORE its current chapter has been primed (so `translation`
  // still points at the old language). Once the priority chapter lands the
  // context swaps `current` → `pendingDl.code === translation.code` and this
  // notice is suppressed (the page already shows the new language). The rest of
  // the Bible keeps downloading silently in the background for offline use.
  useFocusEffect(
    React.useCallback(() => {
      if (pendingDl && pendingDl.code !== translation.code) {
        const name = TRANSLATIONS.find(x => x.code === pendingDl.code)?.nativeName ?? '';
        setDlNotice(t('bibleReader.stillDownloading', { name }));
        if (dlNoticeTimerRef.current) clearTimeout(dlNoticeTimerRef.current);
        dlNoticeTimerRef.current = setTimeout(() => setDlNotice(null), 5000);
      }
      return undefined;
    }, [pendingDl, translation.code, t]),
  );
  useEffect(() => () => { if (dlNoticeTimerRef.current) clearTimeout(dlNoticeTimerRef.current); }, []);
  // Auto-clear when the user navigates to a different chapter (drawer, search,
  // saved-verse jump), since the highlight no longer corresponds to anything
  // on screen.
  useEffect(() => {
    if (focusRange && (focusRange.bookSlug !== bookSlug || focusRange.chapter !== chapter)) {
      setFocusRange(null);
    }
  }, [bookSlug, chapter, focusRange]);

  const [bookList, setBookList] = useState<BookSummary[]>([]);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // New-user defaults per design: 18 px / 1.8 line-height / 24 px paragraph
  // spacing. (Existing installs keep whatever they persisted — see hydration
  // below; these initial values only apply on a fresh install.)
  const [fontSize, setFontSize] = useState(18);
  const [lineH, setLineH] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(24);
  // Merriweather is the default reader font — purpose-built for on-screen
  // reading (slab-influenced serif, generous x-height) and gives the Bible
  // body a warm, editorial feel out of the box. Users can still pick Serif
  // (Source Serif 4) or Inter from the type-controls sheet.
  const [font, setFont] = useState<FontChoice>('Merriweather');
  const [theme, setTheme] = useState('default');
  const [fontMenu, setFontMenu] = useState(false);

  // ─── Reader-settings persistence ──────────────────────────────────────
  // Hydrate from AsyncStorage on mount so the user's last-picked font /
  // size / line height / paragraph spacing / theme survive a cold start.
  // Same `useState` (not `useRef`) hydration-gate pattern as the 5-min
  // reading timer above — a ref-based gate would not re-run the persist
  // effect when hydration finishes asynchronously.
  const SETTINGS_KEY = 'bible:reader-settings:v1';
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) {
        try {
          const s = JSON.parse(raw) as Partial<{
            fontSize: number; lineH: number; paragraphSpacing: number;
            font: FontChoice; theme: string;
          }>;
          if (typeof s.fontSize === 'number') setFontSize(s.fontSize);
          if (typeof s.lineH === 'number') setLineH(s.lineH);
          if (typeof s.paragraphSpacing === 'number') setParagraphSpacing(s.paragraphSpacing);
          // 'Sans' was the previous body-font choice; existing users with
          // it persisted are migrated to Merriweather (the new default) so
          // they pick up the upgrade without a manual re-pick.
          // Tolerant of stale persisted values from the older Serif/Inter
          // trio — they fall back to Merriweather (the new default) so old
          // installs don't render with a missing fontFamily.
          if (s.font === 'Merriweather' || s.font === 'Lora' || s.font === 'Lato' || s.font === 'Sans') setFont(s.font);
          else if ((s.font as unknown) === 'Serif' || (s.font as unknown) === 'Inter') setFont('Merriweather');
          if (typeof s.theme === 'string' && s.theme in THEMES) setTheme(s.theme);
        } catch {}
      }
      setSettingsHydrated(true);
    });
  }, []);
  // Debounced persist: every change to any of the five settings schedules
  // a 300 ms timer; subsequent changes within the window cancel + reset
  // the timer. Prevents AsyncStorage thrashing during slider drags
  // (the slider fires onChange continuously, ~60/sec).
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!settingsHydrated) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
        fontSize, lineH, paragraphSpacing, font, theme,
      })).catch(() => {});
    }, 300);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [fontSize, lineH, paragraphSpacing, font, theme, settingsHydrated]);
  const [selVerse, setSelVerse] = useState<number | null>(null);
  const [toolbarTop, setToolbarTop] = useState(120);
  const scrollRef = useRef<ScrollView>(null);
  const verseRefs = useRef<Record<number, View | null>>({});
  const insets = useSafeAreaInsets();
  const TH = THEMES[theme];

  // Load translation index when language changes
  useEffect(() => {
    let cancelled = false;
    fetchTranslationIndex(translation.code, translation.source)
      .then(idx => { if (!cancelled) setBookList(idx.books); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [translation.code, translation.source]);

  // Load chapter when bookSlug / chapter / language changes.
  //
  // We clear `verses` synchronously at the start of the fetch so the user
  // sees a clean spinner-only state during the transition instead of the
  // previous chapter's text frozen on screen — that "stale text + delayed
  // swap" was the source of the laggy feel when picking from the book
  // drawer. Combined with `scrollTo({ y: 0 })` in the next effect, the
  // result is: drawer tap → spinner → fresh chapter from verse 1.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVerses([]);
    fetchChapter(translation.code, translation.source, bookSlug, chapter)
      .then(data => {
        if (!cancelled) {
          setVerses(data.verses);
          setSelVerse(null);
          setExploreIdx(null);
          // Note: `markToday()` + `markRead()` used to fire here on every
          // chapter open — that was the source of "open a chapter for one
          // second and Days Read +1". Triggering moved to the explicit
          // "Mark as Complete" button rendered after the last verse, so
          // counters only advance on confirmed user intent.
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [translation.code, translation.source, bookSlug, chapter]);

  // ─── 5-minute reading timer ────────────────────────────────────────────
  // Per v2.3 spec: a day counts as "Days Read" once the user has spent 5+
  // minutes in foreground on the Bible tab. Independent of the explicit
  // "Mark as Complete" button — either path counts the day; both paths fire
  // markRead(currentChapter) + markToday(). Persisted per-day key so a
  // backgrounded session resumes accumulating instead of resetting.
  const READ_TIMER_THRESHOLD_SECONDS = 300;
  const READ_TIMER_KEY_PREFIX = 'bible-reading-time:';
  const todayKey = ymdLocal(new Date());
  const [secondsToday, setSecondsToday] = useState(0);
  // `useState` (not `useRef`) — the timer effect's deps must include this
  // so the effect re-runs once hydration finishes. With a ref, the timer
  // bailed out on cold-start-with-Bible-focused (because hydration is
  // async, the ref was still false on first run, and `[navigation]` deps
  // never re-trigger). Using state here forces the effect to re-evaluate
  // when `hydrated` flips to true, and the gate disappears.
  const [hydrated, setHydrated] = useState(false);
  const timerThresholdFiredRef = useRef(false);
  // Hydrate the day's accumulator on mount; reset if the date key shifted
  // since last write (handles app left open across midnight).
  useEffect(() => {
    AsyncStorage.getItem(READ_TIMER_KEY_PREFIX + todayKey).then(raw => {
      const restored = raw ? parseInt(raw, 10) : 0;
      setSecondsToday(Number.isFinite(restored) ? restored : 0);
      setHydrated(true);
    });
  }, [todayKey]);
  // Tick at 1 Hz only while: (a) Bible tab is focused AND (b) the app is in
  // the foreground AND (c) hydration has landed. Listeners are attached /
  // detached cleanly so a cold start on a different tab doesn't accumulate.
  useEffect(() => {
    if (!hydrated) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (AppState.currentState === 'active') {
          setSecondsToday(s => s + 1);
        }
      }, 1000);
    };
    const stopTimer = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const focusUnsub = navigation.addListener('focus', startTimer);
    const blurUnsub  = navigation.addListener('blur', stopTimer);
    const appSub = AppState.addEventListener('change', state => {
      if (state !== 'active') stopTimer();
      else if ((navigation as { isFocused?: () => boolean }).isFocused?.()) startTimer();
    });
    if ((navigation as { isFocused?: () => boolean }).isFocused?.()) startTimer();
    return () => {
      stopTimer();
      focusUnsub();
      blurUnsub();
      appSub.remove();
    };
  }, [navigation, hydrated]);
  // Persist the accumulator (every 10 ticks is plenty — bounds disk writes
  // to ~6 / minute). Once past the threshold we no longer need to persist
  // (the firing already side-effected to ReadChaptersContext + ActivityContext
  // which have their own AsyncStorage layers). Skipping post-threshold
  // also keeps writes bounded for users who park on the Bible tab for hours.
  useEffect(() => {
    if (!hydrated) return;
    if (secondsToday >= READ_TIMER_THRESHOLD_SECONDS) return;
    if (secondsToday % 10 !== 0) return;
    AsyncStorage.setItem(READ_TIMER_KEY_PREFIX + todayKey, String(secondsToday)).catch(() => {});
  }, [secondsToday, todayKey, hydrated]);
  // Reset the threshold-fired ref when the calendar day rolls over so a
  // session that spans midnight can still fire on the new day's first
  // 5-minute crossing.
  useEffect(() => {
    timerThresholdFiredRef.current = false;
  }, [todayKey]);
  // Threshold-crossing side effect — when the user crosses 5 min today and
  // we haven't fired yet, mark current chapter + today as read. Idempotent
  // against the explicit Mark-as-Complete button (markRead is a Set-add and
  // markToday is a date-set add). The toast only fires when this is what
  // *caused* today to flip from unmarked to marked — avoids spamming the
  // user when they already tapped the button earlier.
  useEffect(() => {
    if (timerThresholdFiredRef.current) return;
    if (secondsToday < READ_TIMER_THRESHOLD_SECONDS) return;
    if (!verses.length) return;          // chapter still loading — wait
    timerThresholdFiredRef.current = true;
    const todayWasAlreadyMarked = readDates.has(todayKey);
    markRead(bookSlug, chapter);
    markToday();
    if (!todayWasAlreadyMarked) {
      showToast('5 minutes of reading · counted toward Days Read', { icon: 'check', ms: 2000 });
    }
  }, [secondsToday, verses.length, bookSlug, chapter, markRead, markToday, readDates, todayKey]);

  // Reset scroll to the top when the chapter changes. Without this, picking
  // a chapter from the drawer kept the previous chapter's scroll offset, so
  // the new chapter mid-rendered at e.g. verse 7 — the user had to scroll
  // up to find verse 1. Skipped when an active focus-jump is targeting a
  // specific verse in this exact chapter; the focus-scroll effect below
  // handles that case.
  useEffect(() => {
    const isFocusing = focusRange && focusRange.bookSlug === bookSlug && focusRange.chapter === chapter;
    if (isFocusing) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [bookSlug, chapter, focusRange]);

  // Reset measured layouts when the chapter changes so stale offsets from a
  // previous chapter don't mis-target a focus-scroll.
  useEffect(() => {
    verseYRef.current = {};
  }, [bookSlug, chapter, translation.code]);

  // Scroll the focused start-verse near the top once verses have rendered.
  // If the target verse hasn't measured yet, defer to its onLayout below.
  useEffect(() => {
    if (!focusRange) return;
    if (focusRange.bookSlug !== bookSlug || focusRange.chapter !== chapter) return;
    if (verses.length === 0) return;
    const target = focusRange.verseStart;
    const y = verseYRef.current[target];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    } else {
      pendingScrollVerseRef.current = target;
    }
    return () => { pendingScrollVerseRef.current = null; };
  }, [focusRange, verses, bookSlug, chapter]);

  const currentBook = bookList.find(b => b.slug === bookSlug);
  const bookTitle = currentBook ? currentBook.name : bookSlug;

  const TOOLBAR_HEIGHT = 140;
  const TOOLBAR_GAP = 15;

  const handleVerseTap = (idx: number) => {
    if (selVerse === idx) {
      setSelVerse(null);
      return;
    }
    const ref = verseRefs.current[idx];
    if (!ref) {
      setSelVerse(idx);
      return;
    }
    ref.measure((_x, _y, _w, h, _pageX, pageY) => {
      const aboveTop = pageY - TOOLBAR_HEIGHT - TOOLBAR_GAP;
      const minTop = insets.top + 60;
      setToolbarTop(aboveTop >= minTop ? aboveTop : pageY + h + TOOLBAR_GAP);
      setSelVerse(idx);
    });
  };

  const toggleHighlight = (color: string) => {
    if (selVerse === null) return;
    const v = verses[selVerse];
    if (!v) return;
    setHighlight({
      translation: translation.code,
      bookSlug,
      bookTitle,
      chapter,
      verse: v.verse,
      color,
      text: v.text,
    });
    setSelVerse(null);
  };

  const bookmarked = isBookmarked(translation.code, bookSlug, chapter);
  // Bookmark "add" animations: a small ROSE bookmark tag drops down from
  // beneath the header and a white toast slides up at the bottom. Both
  // fire ONLY on add — un-bookmarking is silent (no false-positive
  // celebration). bookmarkTagAnim drives both opacity and translateY in
  // a single shared value via interpolation in the animated style.
  const bookmarkTagAnim = useSharedValue(0);
  const onBookmark = () => {
    const wasBookmarked = bookmarked;
    toggleBookmark({ translation: translation.code, bookSlug, bookTitle, chapter });
    if (!wasBookmarked) {
      bookmarkTagAnim.value = 0;
      bookmarkTagAnim.value = withSequence(
        withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }),
        withDelay(1200, withTiming(0, { duration: 280, easing: Easing.in(Easing.cubic) })),
      );
      showToast(t('bibleReader.toast.bookmarkAdded'), { icon: 'bookmark', ms: 1700 });
    }
  };
  const bookmarkTagStyle = useAnimatedStyle(() => ({
    opacity: bookmarkTagAnim.value,
    transform: [{ translateY: -16 + 16 * bookmarkTagAnim.value }],
  }));

  // Chapter navigation — prev / next buttons in the floating bottom row.
  // Crosses book boundaries (last chapter of Genesis → Exodus 1) so the
  // user can keep tapping straight through the canon. Disabled at the
  // very first/last chapter of the whole Bible.
  const currentBookIdx = bookList.findIndex(b => b.slug === bookSlug);
  const totalChapters = currentBook?.chapters ?? 1;
  const canPrev = !(currentBookIdx <= 0 && chapter === 1);
  const canNext = !(currentBookIdx === bookList.length - 1 && chapter === totalChapters);
  const goToPrevChapter = () => {
    if (chapter > 1) {
      goToChapter(bookSlug, chapter - 1);
    } else if (currentBookIdx > 0) {
      const prev = bookList[currentBookIdx - 1];
      goToChapter(prev.slug, prev.chapters);
    }
  };
  const goToNextChapter = () => {
    if (chapter < totalChapters) {
      goToChapter(bookSlug, chapter + 1);
    } else if (currentBookIdx < bookList.length - 1) {
      const next = bookList[currentBookIdx + 1];
      goToChapter(next.slug, 1);
    }
  };

  // Chapter narration — streamed from the `herbible-audio-7languages` R2
  // bucket via expo-audio. Source URL is keyed by (translation lang, book
  // slug, chapter); we pass it directly to useAudioPlayer so the player
  // auto-reloads when any of those change. Errors (chapter not yet
  // recorded → 404 from the CDN) are swallowed by expo-audio — the
  // play button stays clickable but silent, which is the right
  // degradation while the narration backlog is being filled.
  const audioSrc = bibleAudioUrl(translation.code, bookSlug, chapter);
  const audioPlayer = useAudioPlayer(audioSrc);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const audioPlaying = audioStatus.playing;

  // Per-verse timestamps for karaoke-style highlighting. Fetched once per
  // chapter (cached in AsyncStorage by the service), then we binary-search
  // it on every status update — cheap even on long chapters because verse
  // counts top out around 50.
  const [audioTimestamps, setAudioTimestamps] = useState<ChapterTimestamps | null>(null);
  useEffect(() => {
    let alive = true;
    loadTimestamps(translation.code, bookSlug, chapter).then(ts => {
      if (alive) setAudioTimestamps(ts);
    });
    return () => { alive = false; };
  }, [translation.code, bookSlug, chapter]);

  // The verse number the audio is currently inside. `null` when audio is
  // paused, not playing this chapter, or has no timestamps. Used by the
  // verse renderer to apply a soft ROSE tint to the active line.
  const activeAudioVerse = useMemo(() => {
    if (!audioStatus.playing || !audioTimestamps) return null;
    return verseAtTime(audioTimestamps, audioStatus.currentTime || 0);
  }, [audioStatus.playing, audioStatus.currentTime, audioTimestamps]);

  // Auto-scroll the active verse into view as the audio walks through the
  // chapter. Only fires when the verse number CHANGES — otherwise every
  // status tick (~250 ms) would re-trigger a scrollTo at the same Y and
  // janks the reader. The 1/3-from-top target keeps the user looking at
  // the verse without losing context above/below; clamped to >=0 so the
  // top of the chapter never tries to scroll negative.
  const lastScrolledVerseRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeAudioVerse == null) {
      lastScrolledVerseRef.current = null;
      return;
    }
    if (lastScrolledVerseRef.current === activeAudioVerse) return;
    lastScrolledVerseRef.current = activeAudioVerse;
    const y = verseYRef.current[activeAudioVerse];
    if (typeof y === 'number') {
      // Aim ~1/3 from the top of the viewport — readable but not at the edge.
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }
  }, [activeAudioVerse]);
  const [shareVerse, setShareVerse]   = useState<{ ref: string; text: string } | null>(null);
  const [noteVerse, setNoteVerse]     = useState<{ ref: string; text: string } | null>(null);
  // Index into `verses` for the verse whose Explanation is currently open.
  // Inlined under that verse, so we only need an index — no copy of the text.
  const [exploreIdx, setExploreIdx]   = useState<number | null>(null);
  // Commentary state machine. Reset every time the user opens Explore on a
  // new verse (or changes chapter/book/translation). Caches the parsed
  // chapter so navigating between two verses in the same chapter doesn't
  // re-fetch — the AsyncStorage cache in fetchCommentaryChapter also
  // handles process restarts. 'error' covers any failure including the
  // 5-second timeout below: every KJV verse is supposed to have data, so a
  // miss is a real error rather than a graceful "no data for this verse".
  const [commentaryState, setCommentaryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [commentaryByVerse, setCommentaryByVerse] = useState<Record<number, string>>({});
  // Track the (book, chapter, lang) currently loaded so we know when to
  // invalidate. Keep as a single string key so the useEffect dep array
  // stays primitive.
  const commentaryKey = `${translation.code}:${bookSlug}:${chapter}`;
  const loadedCommentaryKey = useRef<string | null>(null);
  useEffect(() => {
    if (exploreIdx == null) return;                                             // no card open → don't fetch
    if (loadedCommentaryKey.current === commentaryKey && commentaryState === 'ready') return;
    let cancelled = false;
    setCommentaryState('loading');
    // 5-second timeout — feels like a hung request beyond that and is the
    // copy the user sees as "network error". Aborting via Promise.race so
    // a slow fetch resolving later doesn't stomp a cancelled request.
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), 5000)
    );
    Promise.race([
      fetchCommentaryChapter(CORPUS_CDN_ROOT, translation.code, bookSlug, chapter),
      timeout,
    ])
      .then((data) => {
        if (cancelled) return;
        const lookup: Record<number, string> = {};
        for (const v of data.verses) lookup[v.verse] = v.text;
        setCommentaryByVerse(lookup);
        loadedCommentaryKey.current = commentaryKey;
        setCommentaryState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setCommentaryState('error');
      });
    return () => { cancelled = true; };
  }, [exploreIdx, commentaryKey, translation.code, bookSlug, chapter]);
  // Toast supports an optional Feather icon — a soft white card variant
  // is rendered when `icon` is set (used by the bookmark-added confirm),
  // otherwise the default dark pill renders for plain text messages.
  const [toast, setToast] = useState<{ text: string; icon?: keyof typeof Feather.glyphMap } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, opts: { icon?: keyof typeof Feather.glyphMap; ms?: number } = {}) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text: msg, icon: opts.icon });
    toastTimerRef.current = setTimeout(() => setToast(null), opts.ms ?? 1400);
  };
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  // Full-screen audio player (the pink listen button opens it). Reuses this
  // screen's audioPlayer so opening doesn't restart/duplicate playback, and
  // closing leaves audio running (karaoke highlight continues here).
  const [showPlayer, setShowPlayer] = useState(false);
  const openPlayer = () => {
    setShowPlayer(true);
    if (!audioStatus.playing) { try { audioPlayer.play(); } catch {} }
  };
  // Player verse-nav at a chapter boundary advances the chapter AND flags it
  // to auto-resume — the chapter-change effect below pauses on the swap, and
  // the resume effect re-plays once the new chapter's source is in.
  const resumeOnChapterLoadRef = useRef(false);
  const playerPrevChapter = () => { resumeOnChapterLoadRef.current = true; goToPrevChapter(); };
  const playerNextChapter = () => { resumeOnChapterLoadRef.current = true; goToNextChapter(); };

  // Pause the narration when the user navigates to a different chapter.
  // Without this the previous chapter's audio keeps playing in the
  // background even though the source URL has changed — expo-audio
  // doesn't auto-stop on source swap. Triggering pause here ALSO covers
  // tab-away, since `audioPlayer` is held only by this screen instance.
  useEffect(() => {
    if (audioPlayer.playing) audioPlayer.pause();
    // Intentional: react to slug/chapter changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSlug, chapter, translation.code]);

  // Auto-resume after a player-initiated chapter crossing. Runs AFTER the
  // pause effect above (definition order) on the same chapter change, so the
  // net result is: pause the old, then play the new. play() before the new
  // source finishes loading is fine — expo-audio starts it once ready.
  useEffect(() => {
    if (!resumeOnChapterLoadRef.current) return;
    resumeOnChapterLoadRef.current = false;
    try { audioPlayer.play(); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSlug, chapter]);

  return (
    <View style={[styles.container, { backgroundColor: TH.bg === 'transparent' ? '#FBF7F6' : TH.bg }]}>
      {dlNotice && (
        <View style={[styles.dlNotice, { bottom: insets.bottom + 78 }]} pointerEvents="none">
          <Feather name="download" size={15} color="#fff" />
          <Text style={styles.dlNoticeText}>{dlNotice}</Text>
        </View>
      )}
      {/* Pinned header */}
      <TabSection delay={0}>
      <View style={[styles.bibleHeader, {
        paddingTop: insets.top + 8,
        borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(30,27,46,0.05)',
        backgroundColor: TH.bg === 'transparent' ? '#FBF7F6' : TH.bg,
      }]}>
        <TouchableOpacity onPress={() => setDrawer(true)} style={styles.headerBtn} hitSlop={8}>
          <Feather name="menu" size={22} color={TH.txt} />
        </TouchableOpacity>
        <Text style={[styles.bookTitle, { color: TH.txt }]}>{bookTitle} {chapter}</Text>
        <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.headerBtn} hitSlop={8}>
          <Feather name="search" size={22} color={TH.txt} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onBookmark} style={styles.headerBtn} hitSlop={8}>
          <Feather name="bookmark" size={22} color={bookmarked ? ROSE : TH.txt} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFontMenu(v => !v)} style={styles.headerBtn} hitSlop={8}>
          <Text style={[styles.headerT, { color: TH.txt }]}>T</Text>
        </TouchableOpacity>
      </View>
      </TabSection>

      {/* Scrollable verses — wrapped in its own TabSection so it lifts in
          slightly after the pinned header, giving the screen a layered feel
          instead of one slab of motion. flex:1 on the wrapper preserves the
          fill-the-rest behaviour the ScrollView had as a direct child. */}
      <TabSection delay={50} style={{ flex: 1 }}>{/* 140 → 50 */}
      <ScrollView
        ref={scrollRef}
        style={styles.verseScroll}
        contentContainerStyle={styles.verseContent}
        showsVerticalScrollIndicator={false}
        onScroll={() => setSelVerse(null)}
        scrollEventThrottle={16}
      >
        <Text style={[styles.chapterTitle, { color: TH.txt }]}>{bookTitle} {chapter}</Text>

        {loading && verses.length === 0 && (
          // Larger ROSE spinner during chapter transitions. iOS renders this
          // as the rotating circle-of-pink-dashes the user asked for; Android
          // uses its system equivalent at the same accent colour.
          <View style={styles.chapterLoader}>
            <ActivityIndicator size="large" color={ROSE} />
          </View>
        )}

        {error && (
          <Text style={{ fontSize: 15, color: '#C84444', textAlign: 'center', paddingVertical: 40 }}>
            {t('bibleReader.chapterLoadError', { error })}
          </Text>
        )}

        {verses.map((v, i) => {
          const hl = getColor(translation.code, bookSlug, chapter, v.verse);
          // Map-backed O(1) lookup via getHighlightColor — replaces a
          // per-verse .find() that was O(N) every render. Same change
          // applied in PlanDayWalk's verse-page renderer.
          const hlColor = getHighlightColor(hl)?.bg;
          const isSel = selVerse === i;
          // True when the audio narration is currently inside this verse
          // (per the timestamps file). Triggers a soft ROSE tint that walks
          // verse-by-verse as the chapter plays — a karaoke-style cue.
          // Yields to user-applied highlights (`hlColor`) so an explicit
          // colour choice isn't overridden, and yields to selection
          // (`isSel`) so the menu always reads as "this one is selected".
          const isAudioActive = activeAudioVerse === v.verse;
          // When a one-shot focus is active for this chapter, every verse
          // outside the range is dimmed so the eye lands on the cited verses.
          const focusActive = focusRange
            && focusRange.bookSlug === bookSlug
            && focusRange.chapter === chapter;
          const dimmed = !!focusActive
            && (v.verse < focusRange!.verseStart || v.verse > focusRange!.verseEnd);
          return (
            <View
              key={i}
              ref={(r) => { verseRefs.current[i] = r; }}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                verseYRef.current[v.verse] = y;
                if (pendingScrollVerseRef.current === v.verse) {
                  pendingScrollVerseRef.current = null;
                  scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
                }
              }}
              style={{ marginBottom: paragraphSpacing }}
            >
              <TouchableOpacity onPress={() => handleVerseTap(i)} activeOpacity={0.7}>
                <Text style={[
                  styles.verse,
                  {
                    fontFamily: FONT_FAMILY[font],
                    fontSize,
                    lineHeight: fontSize * lineH,
                    color: TH.txt,
                    // Source Serif 4 only: pin opsz/wght to the SERIF_BODY
                    // master (35 / 500) so the chapter body shape stays
                    // consistent regardless of where the user drags the
                    // size slider — and matches the plan-reader styles.
                    // Sans / Inter ignore this prop, so it's safe.
                    // Source Serif 4 was retired from the picker — no font
                    // variation settings needed; the remaining four faces
                    // (Merriweather / Lora / Lato / Noto Sans SC) ship as
                    // static TTFs without variable-axis support.
                  },
                  (hlColor || isSel) && { backgroundColor: hlColor || 'rgba(30,27,46,0.04)', borderRadius: 6 },
                  // Audio-active tint only when the user hasn't applied a
                  // highlight or selected this verse — both of those are
                  // explicit intents that should win visually.
                  isAudioActive && !hlColor && !isSel && {
                    backgroundColor: 'rgba(232,97,154,0.14)',                  // ROSE @ 14 % alpha
                    borderRadius: 6,
                  },
                  dimmed && { opacity: 0.32 },
                ]}>
                  <Text style={[styles.verseNum, { color: LAV, fontSize: fontSize * 0.72 }]}>{v.verse}  </Text>
                  {v.text}
                </Text>
              </TouchableOpacity>
              {exploreIdx === i && (
                <View style={styles.explainInline}>
                  <View style={styles.explainHeader}>
                    <Text style={styles.explainLabel}>{t('bible.explanation.title')}</Text>
                    <TouchableOpacity onPress={() => setExploreIdx(null)} hitSlop={10}>
                      <Feather name="x" size={18} color={TXTSUB} />
                    </TouchableOpacity>
                  </View>
                  {/* Render the commentary in the user's chosen reader font /
                      size / line-height. Three render branches:
                        loading → soft spinner + "Loading commentary…"
                        error   → muted "Network error. Try again."
                        ready   → Tyndale text for ~99 % of verses, Claude
                                  devotional fill for the 266 gap verses
                                  (all CC BY-SA 4.0, see About → Acknowledgments). */}
                  {commentaryState === 'loading' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                      <ActivityIndicator size="small" color={ROSE} />
                      <Text style={{ fontFamily: FONT_FAMILY[font], fontSize: fontSize - 2, color: TXTSUB }}>
                        Loading commentary…
                      </Text>
                    </View>
                  )}
                  {commentaryState === 'error' && (
                    <Text style={{ fontFamily: FONT_FAMILY[font], fontSize: fontSize - 2, color: TXTSUB }}>
                      Network error. Tap Explore again to retry.
                    </Text>
                  )}
                  {commentaryState === 'ready' && (
                    <Text
                      style={{
                        fontFamily: FONT_FAMILY[font],
                        fontSize: fontSize - 1,
                        lineHeight: (fontSize - 1) * lineH,
                        color: ROSE,
                      }}
                    >
                      {commentaryByVerse[v.verse] || 'No commentary available for this verse.'}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Mark-as-Complete CTA — replaces the old "open chapter → counters
            auto-increment" trigger. The user explicitly confirms they read
            by tapping this. First tap fires markToday() + markRead() (which
            in turn drive ProfileScreen "Days Read", scripture.streak7/30,
            scripture.first/read*, scripture.books*). Subsequent taps on a
            chapter already marked complete are no-ops — `isRead()` flips
            the button into a muted "Chapter completed" state on next mount.
            Hidden while the chapter is still loading. */}
        {verses.length > 0 && (() => {
          const completed = isRead(bookSlug, chapter);
          const onMark = () => {
            if (completed) return;
            markRead(bookSlug, chapter);
            markToday();
            showToast(t('bibleReader.toast.daysRead'), { icon: 'check', ms: 2000 });
          };
          return (
            <TouchableOpacity
              onPress={onMark}
              disabled={completed}
              activeOpacity={completed ? 1 : 0.85}
              style={[styles.markCompleteBtn, completed && styles.markCompleteBtnDone]}
            >
              <Feather name={completed ? 'check' : 'check-circle'} size={20} color="#FFFFFF" />
              <Text style={styles.markCompleteBtnText}>
                {completed ? t('bibleReader.chapterCompleted') : t('bibleReader.markComplete')}
              </Text>
            </TouchableOpacity>
          );
        })()}
      </ScrollView>
      </TabSection>

      {/* Verse toolbar */}
      {selVerse !== null && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(220)}
          style={[styles.verseToolbar, { top: toolbarTop }]}
        >
          <View style={styles.toolbarColors}>
            {HL_COLORS.map(c => {
              const v = verses[selVerse];
              const currentColor = v ? getColor(translation.code, bookSlug, chapter, v.verse) : undefined;
              return (
                <View key={c.name} style={styles.colorDotSlot}>
                  <TouchableOpacity
                    onPress={() => toggleHighlight(c.name)}
                    style={[styles.colorDot, { backgroundColor: c.dot },
                      currentColor === c.name && styles.colorDotSelected,
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.toolbarDivider} />
          <View style={styles.toolbarActions}>
            {TOOLBAR_ACTIONS.map(({ label, icon }) => {
              const v = selVerse !== null ? verses[selVerse] : null;
              const verseRef = v ? `${bookTitle} ${chapter}:${v.verse}` : '';
              const isSaved = label === 'Save' && !!v && hasVerse(verseRef);

              const onPress = () => {
                if (!v) { setSelVerse(null); return; }
                if (label === 'Save') {
                  // Toggle and keep the toolbar open so the user sees the heart fill / unfill.
                  // Gray toast confirms either direction so the user gets the
                  // same feedback affordance as Copy.
                  const existing = savedList.find(s => s.ref === verseRef);
                  if (existing) {
                    removeVerse(existing.id);
                    showToast('Removed');
                  } else {
                    addVerse(verseRef, v.text);
                    showToast('Saved');
                  }
                  return;
                }
                if (label === 'Copy') {
                  Clipboard.setStringAsync(`${v.text}\n— ${verseRef}`).catch(() => {});
                  // Android 13+ (and Samsung One UI on any version) shows its
                  // own black "Copied to clipboard" snackbar automatically when
                  // anything writes to the clipboard. Showing our app toast on
                  // top of that produces the two-pills-stacked artifact the
                  // user reported. iOS has no system confirmation, so we keep
                  // the toast there.
                  if (Platform.OS === 'ios') showToast('Copied');
                  setSelVerse(null);
                  return;
                }
                if (label === 'Notes') {
                  setNoteVerse({ ref: verseRef, text: v.text });
                  setSelVerse(null);
                  return;
                }
                if (label === 'Share') {
                  setShareVerse({ ref: verseRef, text: v.text });
                  setSelVerse(null);
                  return;
                }
                if (label === 'Explore') {
                  setExploreIdx(selVerse);
                  setSelVerse(null);
                  return;
                }
                setSelVerse(null);
              };

              return (
                <TouchableOpacity key={label} onPress={onPress} style={styles.toolbarAction}>
                  {label === 'Save'
                    ? <Ionicons
                        name={isSaved ? 'heart' : 'heart-outline'}
                        size={22}
                        color={isSaved ? ROSE : TXT}
                      />
                    : <Feather name={icon} size={20} color={TXT} />}
                  <Text style={[styles.toolbarActionText, isSaved && { color: ROSE, fontWeight: '700' }]}>
                    {label === 'Save' && isSaved ? t('verseToolbar.saved') : t(TOOLBAR_LABEL_KEY[label])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      )}

      {/* Bookmark "tag" indicator — drops down beneath the header on add,
          holds briefly, then slides back up. Pinned to the same right
          column as the header bookmark icon so the eye links the two. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bookmarkTag,
          { top: insets.top + 50 },
          bookmarkTagStyle,
        ]}
      >
        <Feather name="bookmark" size={20} color={ROSE} />
      </Animated.View>

      {/* Chapter-nav floating pair — Prev anchors bottom-LEFT corner,
          Next anchors bottom-RIGHT corner. Matches the natural thumb-arc
          for page-turn gestures (back-left / forward-right) and keeps both
          controls reachable one-handed. Glass-style translucent circles
          so they sit above the verse text without dominating it. Disabled
          at the very start / end of the canon. */}
      <TouchableOpacity
        onPress={goToPrevChapter}
        disabled={!canPrev}
        activeOpacity={0.85}
        style={[styles.chapterNavBtn, styles.chapterNavBtnLeft, !canPrev && styles.chapterNavBtnDisabled]}
        hitSlop={6}
      >
        <Feather name="chevron-left" size={22} color={canPrev ? TH.txt : 'rgba(30,27,46,0.25)'} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={goToNextChapter}
        disabled={!canNext}
        activeOpacity={0.85}
        style={[styles.chapterNavBtn, styles.chapterNavBtnRight, !canNext && styles.chapterNavBtnDisabled]}
        hitSlop={6}
      >
        <Feather name="chevron-right" size={22} color={canNext ? TH.txt : 'rgba(30,27,46,0.25)'} />
      </TouchableOpacity>

      {/* Floating audio button — its glyph mirrors player state, so a single
          tap always reads as the obvious next action:
            • idle (or paused) → headphones, tap opens the player + starts
              playback (loading spinner shows in the sheet if the chapter
              audio is still buffering)
            • playing → pause bars, tap stops audio immediately and reverts
              to the headphones glyph WITHOUT opening the player. The user
              never needs the sheet just to stop. */}
      <TouchableOpacity
        onPress={() => {
          if (audioPlaying) {
            try { audioPlayer.pause(); } catch {}
          } else {
            openPlayer();
          }
        }}
        style={styles.audioBtn}
        activeOpacity={0.85}
      >
        <Feather name={audioPlaying ? 'pause' : 'headphones'} size={26} color="#fff" />
      </TouchableOpacity>

      {/* Full-screen narration player (Modal — covers the tab bar). */}
      <BibleAudioPlayer
        visible={showPlayer}
        bookName={currentBook?.name || bookSlug}
        chapter={chapter}
        player={audioPlayer}
        status={audioStatus}
        timestamps={audioTimestamps}
        onClose={() => setShowPlayer(false)}
        onPrevChapter={playerPrevChapter}
        onNextChapter={playerNextChapter}
        onQueue={() => { setShowPlayer(false); setDrawer(true); }}
      />

      {/* Drawers/overlays */}
      {drawer && (
        <BookDrawer
          onClose={() => setDrawer(false)}
          books={bookList}
          currentSlug={bookSlug}
          currentChapter={chapter}
          onPick={(slug, ch) => { goToChapter(slug, ch); setDrawer(false); }}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          books={bookList}
          translationCode={translation.code}
          translationSource={translation.source}
          currentBookSlug={bookSlug}
          onPick={slug => { goToChapter(slug, 1); setSearchOpen(false); }}
          onPickVerse={(slug, ch) => { goToChapter(slug, ch); setSearchOpen(false); }}
        />
      )}
      {fontMenu && (
        <ReaderSheet
          onClose={() => setFontMenu(false)}
          fontSize={fontSize} setFontSize={setFontSize}
          lineH={lineH} setLineH={setLineH}
          paragraphSpacing={paragraphSpacing} setParagraphSpacing={setParagraphSpacing}
          font={font} setFont={setFont}
          theme={theme} setTheme={setTheme}
        />
      )}
      {shareVerse && (
        <ShareVerseSheet
          reference={shareVerse.ref}
          text={shareVerse.text}
          // Use the same daily prayer-bg photo as the home verse card so
          // the share image inherits the live photo backdrop (was falling
          // through to the pink/lav gradient — wrong per user). Slot
          // picked by time-of-day: morning bucket 5–17, evening otherwise.
          bgSource={prayerBg.imageFor(new Date().getHours() >= 5 && new Date().getHours() < 18 ? 'morning' : 'evening')}
          onClose={() => setShareVerse(null)}
        />
      )}
      {noteVerse && (
        <VerseNoteSheet
          verseRef={noteVerse.ref}
          verseText={noteVerse.text}
          onClose={() => setNoteVerse(null)}
          onSaved={() => showToast(t('verseNote.toast.saved'))}
        />
      )}
      {toast && (
        toast.icon ? (
          // White-card variant — small ROSE-tinted icon dot + dark text.
          // Used when the toast carries semantic info (Bookmark Added).
          <Animated.View
            // 500 ms slide-up + 500 ms fade-out — chapter-complete toast needs
            // to feel like a proper celebration, not a flicker. SlideInDown in
            // Reanimated means "enters from the bottom moving up", so the
            // banner pops up from below the tab bar. Same easing for entry,
            // straight fade on exit (no slide-down) so it dissolves in place.
            entering={SlideInDown.duration(500).easing(Easing.out(Easing.cubic))}
            exiting={FadeOut.duration(500)}
            pointerEvents="none"
            style={[styles.softToast, { bottom: insets.bottom + 90 }]}
          >
            <View style={styles.softToastIcon}>
              <Feather name={toast.icon} size={12} color="#FFFFFF" />
            </View>
            <Text style={styles.softToastText}>{toast.text}</Text>
          </Animated.View>
        ) : (
          // Default dark pill — for plain confirmations (Copied, Saved).
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(180)}
            pointerEvents="none"
            style={[styles.toast, { bottom: insets.bottom + 90 }]}
          >
            <Text style={styles.toastText}>{toast.text}</Text>
          </Animated.View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    inset: 0,
  } as any,
  bibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingVertical: 9,
    paddingBottom: 14,
    gap: 14,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerT: {
    fontSize: 21,
    fontWeight: '700',
  },
  bookTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  verseScroll: {
    flex: 1,
  },
  verseContent: {
    paddingHorizontal: P + 4,
    paddingBottom: 150,
    paddingTop: 14,
  },
  chapterTitle: {
    fontSize: 31.45,                                                             // 37 → 31.45 (-15 % per user)
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 30,
    marginTop: 14,
  },
  verse: {
    // wght comes from `fontVariationSettings` per-instance so the static
    // `fontWeight` is unset here — letting Reanimated/Yoga apply the
    // axis cleanly without a competing weight token.
    lineHeight: 32,
    color: TXT,
  },
  // Centred ROSE spinner shown while a chapter is fetching. Padded so it
  // sits roughly where the first verse would, giving a stable visual
  // anchor instead of a tiny indicator at the very top.
  chapterLoader: {
    paddingVertical: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "Mark as Complete" — the only entry point now for incrementing Days
  // Read + chapter / book scripture badges. Visual template mirrors
  // PlanDayWalk's "Finish Reading" CTA so the gesture feels familiar.
  markCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 28,
    backgroundColor: ROSE,
    marginTop: 40,
    marginHorizontal: P,
    marginBottom: 28,
    shadowColor: ROSE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  // Muted-green "done" state once `isRead` returns true for this chapter.
  // Same dimensions so the layout doesn't jump after the tap.
  markCompleteBtnDone: {
    backgroundColor: 'rgba(125,184,125,0.85)',
    shadowOpacity: 0.10,
  },
  markCompleteBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  verseNum: {
    fontWeight: '600',
    color: LAV,
  },
  verseToolbar: {
    position: 'absolute',
    left: 22,
    right: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 30,
  },
  toolbarColors: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  colorDotSlot: {
    flex: 1,
    alignItems: 'center',
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotSelected: {
    transform: [{ scale: 1.1 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  toolbarDivider: {
    height: 1,
    backgroundColor: 'rgba(30,27,46,0.06)',
    marginHorizontal: -18,
    marginBottom: 12,
  },
  toolbarActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolbarAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  toolbarActionText: {
    fontSize: 14,
    color: TXT,
    fontWeight: '500',
  },
  explainInline: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: ROSE,
    backgroundColor: 'rgba(232,97,154,0.06)',
    borderRadius: 8,
  },
  explainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  explainLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 50,
  },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  // "Bible still downloading" heads-up — wider than a normal toast (two lines
  // of copy), pinned above the tab bar, dark translucent pill.
  dlNotice: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.78)',
    zIndex: 60,
  },
  dlNoticeText: { flex: 1, color: '#FFFFFF', fontSize: 13.5, lineHeight: 19, fontFamily: FONTS.lato },
  // Soft white-card toast variant — matches the app's translucent Glass
  // pattern (rgba 0.92 + soft border) for in-context confirmations.
  softToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 50,
  },
  softToastIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  softToastText: { color: TXT, fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
  // Bookmark indicator that drops in from above the header on add.
  // Right-aligned under the header bookmark button (P + 8 ≈ same column
  // as `headerBtn`'s glyph centerline). Animated translateY + opacity
  // come from `bookmarkTagStyle`.
  bookmarkTag: {
    position: 'absolute',
    right: P + 8,
    width: 28, height: 36,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 60,
  },
  // Floating page-nav + audio buttons. All three share size (52×52) so the
  // control cluster reads as one family — Prev anchors the bottom-LEFT
  // corner, Next anchors the bottom-RIGHT corner (matches the user's
  // page-turn muscle memory — left thumb back, right thumb forward), and
  // the pink Audio button sits stacked above Next on the right column.
  //
  // Adaptive-safe across device sizes: the bottom-tab navigator already
  // inserts its own bottom inset (TabBar.tsx — paddingBottom: max(insets.bottom, 11)),
  // so `bottom: 24` puts the buttons exactly 24 px above the tab bar on
  // every iPhone from SE (no home indicator) to 14 Pro Max (with home
  // indicator) — no clipping, no extra inset math needed here.
  chapterNavBtn: {
    position: 'absolute',
    bottom: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1, borderColor: 'rgba(30,27,46,0.06)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 40,
  },
  chapterNavBtnLeft:  { left:  P + 4 },
  chapterNavBtnRight: { right: P + 4 },
  chapterNavBtnDisabled: { opacity: 0.45 },
  audioBtn: {
    position: 'absolute',
    // Stacked above the bottom-right Next button: 24 (Next bottom)
    // + 52 (Next height) + 16 (gap) = 92.
    bottom: 92,
    right: P + 4,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FBF7F6',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: P,
    paddingBottom: P,
    maxHeight: '85%',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  drawerTitle: {
    // Mirrors PlanScreen's `heading` (the "My Plans" title) 1:1 per user.
    fontSize: 25.31,
    fontWeight: '600',
    color: TXT,
    fontFamily: FONTS.loraBold,
  },
  pillRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 23,
    padding: 3,
    marginBottom: 18,
    marginHorizontal: -3,                 // pull strip 3 px outward each side per user — same trick as PlanScreen.tabs
    position: 'relative',
  },
  pillIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 18,
  },
  drawerPill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerPillText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: FONTS.latoBold,           // Lato bold per user
  },
  bookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bookCell: {
    width: '31.5%',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  bookCellActive: {
    // Solid ROSE fill + white text per user — no more translucent wash with
    // outline + accent underline. Drops bookAccent from JSX too.
    backgroundColor: ROSE,
    borderColor: ROSE,
  },
  bookCellExpanded: {
    borderColor: ROSE,
    borderWidth: 2,
  },
  bookNum: {
    fontSize: 13,
    color: TXTSUB,
    marginBottom: 3,
    fontWeight: '600',
    fontFamily: FONTS.latoBold,           // bold per user — matches bookName's Lato bold treatment
  },
  bookName: {
    fontSize: 15,
    fontWeight: '600',                    // 500 → 600 per user
    color: TXT,
    lineHeight: 19,
    fontFamily: FONTS.latoBold,           // Lato bold per user
  },
  chapterStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,                                // 10 → 8 (-2 px per user — cells closer together)
    paddingVertical: 12,
    paddingHorizontal: 10,                 // 4 → 7 → 10 (+3 px more per user — 1 and 6 sit even further from the pink frame)
    marginBottom: 10,
    backgroundColor: 'rgba(232,97,154,0.06)',
    borderRadius: 12,
  },
  // width / height supplied inline by BookDrawer (responsive 6-per-row grid).
  chapterCell: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',                  // solid white per user (no transparency)
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterCellActive: {
    backgroundColor: ROSE,
    borderColor: ROSE,
  },
  chapterNum: {
    fontSize: 14.88,                     // 16 → 14.88 (-7 % per user)
    fontWeight: '600',
    color: TXT,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 130,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: P,
    paddingBottom: 14,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 11,
    paddingLeft: 15,
  },
  searchIcon: { marginRight: 4 },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 9,
    fontSize: 17,                     // +15% from 15
    color: TXT,
    fontFamily: FONTS.lato,           // Lato per user
  },
  cancelText: { fontSize: 17, fontWeight: '600', paddingHorizontal: 4, fontFamily: FONTS.latoBold },   // Lato bold per user
  searchScroll: {
    flex: 1,
    paddingHorizontal: P,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    marginBottom: 9,
  },
  recentLabel: {
    fontSize: 14,                     // +15% from 12
    fontWeight: '600',                // Lora bold + 600 (project rule — 700 + loraBold → Android system sans)
    color: TXTSUB,
    letterSpacing: 1.4,
    fontFamily: FONTS.loraBold,       // Lora bold per user
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  recentTerm: { flex: 1, fontSize: 17, color: TXT, fontFamily: FONTS.lato },     // Lato per user
  resultsLabel: {
    fontSize: 14,                                                          // +15% from 12
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginVertical: 12,
    marginBottom: 9,
  },
  noResults: { fontSize: 16, color: TXTSUB, padding: 32, textAlign: 'center' },   // +15% from 14
  progressLine: { fontSize: 13, color: TXTSUB, paddingHorizontal: 4, paddingBottom: 8, fontStyle: 'italic' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  resultBook: { flex: 1, fontSize: 17, color: TXT, fontWeight: '500' },   // +15%
  verseHitRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  verseHitRef: {
    fontSize: 13,
    fontWeight: '700',
    color: ROSE,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  verseHitText: {
    fontSize: 16,
    lineHeight: 23,
    color: TXT,
  },
  readerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    justifyContent: 'flex-end',
  },
  readerSheet: {
    backgroundColor: '#FBF7F6',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: P + 4,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 53,                                                                  // 43 → 53 (+10 px per user)
    height: 4.5,                                                                // 5 → 4.5 (-10 % per user)
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.18)',
    alignSelf: 'center',
    marginTop: -7,                                                              // -7 px from sheet top per user
    marginBottom: 18,
  },
  readerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  readerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: TXT,
  },
  readerSection: {
    marginBottom: 18,
  },
  readerSectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: TXT,
    marginBottom: 12,
    marginTop: 4,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  sliderLabel: { fontSize: 16, fontWeight: '700', color: TXT },
  sliderValue: { fontSize: 14, color: TXTSUB },
  // Custom slider container. Height covers the thumb (22 px) + a few px
  // of breathing room for the tap target. Track + fill + thumb sit on top
  // of each other via position: absolute inside this relative wrapper.
  slider: {
    width: '100%',
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    position: 'absolute',
    left: 0, right: 0,
    height: SLIDER_TRACK_H,
    borderRadius: SLIDER_TRACK_H / 2,
    backgroundColor: `${ROSE}1F`,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: SLIDER_TRACK_H,
    borderRadius: SLIDER_TRACK_H / 2,
    backgroundColor: ROSE,
  },
  sliderThumb: {
    position: 'absolute',
    width: SLIDER_THUMB_D,
    height: SLIDER_THUMB_D,
    borderRadius: SLIDER_THUMB_R,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: ROSE,
    // Subtle elevation/shadow so the thumb lifts off the track — identical
    // across all three sliders since they all use this style object.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  fontPills: {
    marginBottom: 22,
  },
  fontPillsContent: {
    gap: 10,
    paddingRight: 4,                                                            // breathing room at the scroll end
  },
  // Content-width chips (no flex). Height 36 (+20 % per user); text centers
  // via align/justify. radius ≥ height/2 keeps it a full pill.
  fontPill: {
    paddingHorizontal: 20,
    height: 36,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontPillActive: {
    backgroundColor: ROSE,
  },
  fontPillInactive: {
    backgroundColor: `${ROSE}14`,
  },
  fontPillText: {
    fontSize: 14.9,                        // −7 % per user (was 16)
    // 400 to match the per-font *_400Regular files (FONT_FAMILY). Forcing 700
    // here would make Android fail to find a bold variant and fall back to
    // system sans — breaking the in-its-own-typeface preview (the Lora trap).
    fontWeight: '400',
    // Sans (system font) carries extra intrinsic top padding on Android, so it
    // rendered low/clipped vs the bundled serif fonts. Killing includeFontPadding
    // + centering vertically lines every font up the same way inside the pill.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  // Single row of 6 swatches (was 6 with flexWrap → dark sat alone on a
  // second line). Circle size reduced 52 → 44 + smaller gap so the full
  // row clears 360 px screens without wrapping.
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeCircle: {
    // Size applied inline (adaptive — see ReaderSheet `themeDot`) so all 6
    // swatches always sit on one row; capped at 36 (−10 % from 40) per user.
    alignItems: 'center',
    justifyContent: 'center',
  },
});
