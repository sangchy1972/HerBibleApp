import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolateColor, Easing,
  FadeIn, FadeOut, SlideInUp, SlideInDown,
} from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { RECENT_SEARCHES } from '../constants/data';
import { useTranslation } from '../state/TranslationsContext';
import { useSavedVerses } from '../state/SavedVersesContext';
import { useActivity } from '../state/ActivityContext';
import { useHighlights } from '../state/HighlightsContext';
import { useBookmarks } from '../state/BookmarksContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import ShareVerseSheet from '../components/ShareVerseSheet';
import VerseNoteSheet from '../components/VerseNoteSheet';
import { fetchTranslationIndex, fetchChapter, streamingSearchVerses, type BookSummary, type Verse, type VerseHit, type SearchProgress } from '../services/bibleService';
import { adjustFocus } from '../constants/versification';
import type { BibleFocus, TabParamList } from '../navigation/types';

type FontChoice = 'Serif' | 'Sans' | 'Inter';
const FONT_CHOICES: FontChoice[] = ['Serif', 'Sans', 'Inter'];
const FONT_FAMILY: Record<FontChoice, string | undefined> = {
  Serif: FONTS.serif,
  Sans: undefined,
  Inter: 'Inter_400Regular',
};

const HL_COLORS = [
  { name: 'rose', bg: 'rgba(245,194,213,0.55)', dot: '#F5C2D5' },
  { name: 'lav', bg: 'rgba(203,192,232,0.55)', dot: '#CBC0E8' },
  { name: 'amber', bg: 'rgba(244,221,158,0.55)', dot: '#F4DD9E' },
  { name: 'sage', bg: 'rgba(186,224,198,0.55)', dot: '#BAE0C6' },
  { name: 'sky', bg: 'rgba(184,210,238,0.55)', dot: '#B8D2EE' },
];

const TOOLBAR_ACTIONS = [
  { label: 'Save', icon: 'heart' },     // matches the "Saved" stat tile + Saved Verses section in Profile
  { label: 'Copy', icon: 'copy' },
  { label: 'Notes', icon: 'edit-2' },
  { label: 'Share', icon: 'share-2' },
  { label: 'Explore', icon: 'zoom-in' },
] as const;

function BookDrawer({ onClose, books, currentSlug, currentChapter, onPick }: {
  onClose: () => void;
  books: BookSummary[];
  currentSlug: string;
  currentChapter: number;
  onPick: (slug: string, chapter: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const currentIdx = books.findIndex(b => b.slug === currentSlug);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [testament, setTestament] = useState<'OT' | 'NT'>(currentIdx >= 39 ? 'NT' : 'OT');

  const otBooks = books.slice(0, 39);
  const ntBooks = books.slice(39, 66);
  const visibleBooks = testament === 'OT' ? otBooks : ntBooks;
  const baseIdx = testament === 'OT' ? 0 : 39;
  const expandedBook = books.find(b => b.slug === expandedSlug) || null;

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
      backgroundColor: interpolateColor(tabProgress.value, [0, 1], [ROSE, LAV]),
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
          <Text style={styles.drawerTitle}>Books</Text>
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
            <Animated.Text style={[styles.drawerPillText, otTextStyle]}>
              Old Testament · {otBooks.length}
            </Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setTestament('NT'); setExpandedSlug(null); }}
            style={styles.drawerPill}
            activeOpacity={0.85}
          >
            <Animated.Text style={[styles.drawerPillText, ntTextStyle]}>
              New Testament · {ntBooks.length}
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
                        <Text style={styles.bookNum}>{String(baseIdx + startIdx + j + 1).padStart(2, '0')}</Text>
                        <Text style={[styles.bookName, isCurrent && { color: ROSE, fontWeight: '700' }]} numberOfLines={2}>{b.name}</Text>
                        {isCurrent && <View style={styles.bookAccent} />}
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
                          style={[styles.chapterCell, isCurrent && styles.chapterCellActive]}
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
              placeholder="Search books or verses"
              placeholderTextColor={TXTSUB}
              style={styles.searchInput}
            />
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={[styles.cancelText, { color: ROSE }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.searchScroll} keyboardShouldPersistTaps="handled">
        {!q && recents.length > 0 && (
          <View>
            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>RECENT</Text>
              <TouchableOpacity onPress={() => setRecents([])} hitSlop={10}>
                <Text style={{ fontSize: 15, color: TXTSUB }}>Clear</Text>
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
            <Text style={styles.resultsLabel}>Books · {bookResults.length}</Text>
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
              Verses · {verseHits.length}{!done ? ' · searching…' : ''}
            </Text>
            {!done && progress && (
              <Text style={styles.progressLine}>
                Scanning {progress.currentBook} ({progress.done}/{progress.total} chapters)
              </Text>
            )}
            {done && verseHits.length === 0 && (
              <Text style={styles.noResults}>No verses found for "{q}".</Text>
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

const THEME_OPTS = [
  { id: 'default', color: '#FBF7F6' },
  { id: 'cream', color: '#FAF6E8' },
  { id: 'rose', color: '#FBEEEE' },
  { id: 'sage', color: '#EAF1E6' },
  { id: 'sky', color: '#EAF2FB' },
  { id: 'dark', color: '#1A1620' },
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

function SliderRow({ label, value, display, min, max, step, onChange }: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.readerSection}>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{display}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={ROSE}
        maximumTrackTintColor={`${ROSE}1F`}
        thumbTintColor="#fff"
      />
    </View>
  );
}

function ReaderSheet({
  onClose, fontSize, setFontSize, lineH, setLineH,
  paragraphSpacing, setParagraphSpacing, font, setFont, theme, setTheme,
}: ReaderSheetProps) {
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
          <Text style={styles.readerTitle}>Reader</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={TXT} />
          </TouchableOpacity>
        </View>

        <SliderRow
          label="Font size"
          value={fontSize}
          display={`${Math.round(fontSize)}px`}
          min={16} max={26} step={1}
          onChange={setFontSize}
        />
        <SliderRow
          label="Line height"
          value={lineH}
          display={lineH.toFixed(2)}
          min={1.3} max={2} step={0.05}
          onChange={(v) => setLineH(parseFloat(v.toFixed(2)))}
        />
        <SliderRow
          label="Paragraph spacing"
          value={paragraphSpacing}
          display={`${Math.round(paragraphSpacing)}px`}
          min={4} max={30} step={1}
          onChange={setParagraphSpacing}
        />

        <Text style={styles.readerSectionLabel}>Font</Text>
        <View style={styles.fontPills}>
          {FONT_CHOICES.map(f => {
            const active = font === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFont(f)}
                style={[styles.fontPill, active ? styles.fontPillActive : styles.fontPillInactive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.fontPillText, { color: active ? '#fff' : TXT }]}>
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.readerSectionLabel}>Theme</Text>
        <View style={styles.themeRow}>
          {THEME_OPTS.map(t => {
            const active = theme === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTheme(t.id)}
                style={[styles.themeCircle, {
                  backgroundColor: t.color,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? ROSE : 'rgba(30,27,46,0.10)',
                }]}
                activeOpacity={0.85}
              >
                {active && (
                  <Feather name="check" size={16} color={t.id === 'dark' ? '#fff' : TXT} />
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
  default: { bg: 'transparent', txt: TXT, sub: TXTSUB },
  cream: { bg: '#FAF6E8', txt: '#3A2E1F', sub: '#7A6A52' },
  rose: { bg: '#FBEEEE', txt: '#4A2530', sub: '#876672' },
  sage: { bg: '#EAF1E6', txt: '#26331F', sub: '#5C6B53' },
  sky: { bg: '#EAF2FB', txt: '#1F2F4A', sub: '#6B7B96' },
  dark: { bg: '#1A1620', txt: '#F5F0EC', sub: '#9C95A6' },
};

export default function BibleScreen() {
  const route = useRoute<RouteProp<TabParamList, 'bible'>>();
  const navigation = useNavigation();
  const { current: translation } = useTranslation();
  const { verses: savedList, addVerse, removeVerse, hasVerse } = useSavedVerses();
  const { markToday } = useActivity();
  const { setHighlight, getColor } = useHighlights();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { markRead } = useReadChapters();
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
  const [fontSize, setFontSize] = useState(20);
  const [lineH, setLineH] = useState(1.7);
  const [paragraphSpacing, setParagraphSpacing] = useState(20);
  const [font, setFont] = useState<FontChoice>('Sans');
  const [theme, setTheme] = useState('default');
  const [fontMenu, setFontMenu] = useState(false);
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

  // Load chapter when bookSlug / chapter / language changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChapter(translation.code, translation.source, bookSlug, chapter)
      .then(data => {
        if (!cancelled) {
          setVerses(data.verses);
          setSelVerse(null);
          setExploreIdx(null);
          markToday();
          markRead(bookSlug, chapter);
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [translation.code, translation.source, bookSlug, chapter, markToday, markRead]);

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
  const onBookmark = () => {
    toggleBookmark({ translation: translation.code, bookSlug, bookTitle, chapter });
  };

  // Audio playback for the chapter being read.
  // Hooked into local state for now; the actual `expo-audio` (or `expo-av`)
  // wiring lands once the user uploads narration files. The button below
  // toggles between Play and Pause icons either way so the UI is final.
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [shareVerse, setShareVerse]   = useState<{ ref: string; text: string } | null>(null);
  const [noteVerse, setNoteVerse]     = useState<{ ref: string; text: string } | null>(null);
  // Index into `verses` for the verse whose Explanation is currently open.
  // Inlined under that verse, so we only need an index — no copy of the text.
  const [exploreIdx, setExploreIdx]   = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, ms = 1400) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  const toggleAudio = () => {
    // TODO: integrate audio source per (translation, book, chapter) once
    // narration files are available. For now, just flip the visual state so
    // the play/pause UI is testable.
    setAudioPlaying(p => !p);
  };

  return (
    <View style={[styles.container, { backgroundColor: TH.bg === 'transparent' ? '#FBF7F6' : TH.bg }]}>
      {/* Pinned header */}
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

      {/* Scrollable verses */}
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
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator color={ROSE} />
          </View>
        )}

        {error && (
          <Text style={{ fontSize: 15, color: '#C84444', textAlign: 'center', paddingVertical: 40 }}>
            Failed to load chapter: {error}
          </Text>
        )}

        {verses.map((v, i) => {
          const hl = getColor(translation.code, bookSlug, chapter, v.verse);
          const hlColor = hl ? HL_COLORS.find(c => c.name === hl)?.bg : undefined;
          const isSel = selVerse === i;
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
                  },
                  (hlColor || isSel) && { backgroundColor: hlColor || 'rgba(30,27,46,0.04)', borderRadius: 6 },
                  dimmed && { opacity: 0.32 },
                ]}>
                  <Text style={[styles.verseNum, { color: LAV, fontSize: fontSize * 0.72 }]}>{v.verse}  </Text>
                  {v.text}
                </Text>
              </TouchableOpacity>
              {exploreIdx === i && (
                <View style={styles.explainInline}>
                  <View style={styles.explainHeader}>
                    <Text style={styles.explainLabel}>Explanation</Text>
                    <TouchableOpacity onPress={() => setExploreIdx(null)} hitSlop={10}>
                      <Feather name="x" size={18} color={TXTSUB} />
                    </TouchableOpacity>
                  </View>
                  <Text
                    style={[
                      {
                        fontFamily: FONT_FAMILY[font],
                        fontSize: fontSize - 1,
                        lineHeight: (fontSize - 1) * lineH,
                        color: ROSE,
                      },
                    ]}
                  >
                    {/* TODO: replace placeholder with the real commentary keyed
                        on (translation, bookSlug, chapter, v.verse) when the corpus is ready. */}
                    A short reflection on this verse will appear here once the commentary
                    corpus lands. We're scaffolding the experience now so the explore
                    action shows up under the verse you tapped, in your reader font and size.
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

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
                  const existing = savedList.find(s => s.ref === verseRef);
                  if (existing) removeVerse(existing.id);
                  else addVerse(verseRef, v.text);
                  return;
                }
                if (label === 'Copy') {
                  Clipboard.setStringAsync(`${v.text}\n— ${verseRef}`).catch(() => {});
                  showToast('Copied');
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
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      )}

      {/* Floating audio button */}
      <TouchableOpacity onPress={toggleAudio} style={styles.audioBtn} activeOpacity={0.85}>
        {audioPlaying
          ? <Feather name="pause" size={26} color="#fff" />
          : <Feather name="headphones" size={26} color="#fff" />
        }
      </TouchableOpacity>

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
          onClose={() => setShareVerse(null)}
        />
      )}
      {noteVerse && (
        <VerseNoteSheet
          verseRef={noteVerse.ref}
          verseText={noteVerse.text}
          onClose={() => setNoteVerse(null)}
          onSaved={() => showToast('Saved')}
        />
      )}
      {toast && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          pointerEvents="none"
          style={[styles.toast, { bottom: insets.bottom + 90 }]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
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
    fontSize: 37,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 30,
    marginTop: 14,
  },
  verse: {
    lineHeight: 32,
    color: TXT,
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
  audioBtn: {
    position: 'absolute',
    bottom: 75,                  // 115 → 75 (moved 40 px lower per request)
    right: P + 2,
    width: 62,                   // square — width = height = 62
    height: 62,
    borderRadius: 31,
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
    fontSize: 28,
    fontWeight: '600',
    color: TXT,
  },
  pillRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 23,
    padding: 3,
    marginBottom: 18,
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
    backgroundColor: 'rgba(249,168,201,0.45)',
    borderColor: 'rgba(232,97,154,0.35)',
  },
  bookCellExpanded: {
    borderColor: ROSE,
    borderWidth: 2,
  },
  bookNum: {
    fontSize: 13,
    color: TXTSUB,
    marginBottom: 3,
  },
  bookName: {
    fontSize: 15,
    fontWeight: '500',
    color: TXT,
    lineHeight: 19,
  },
  bookAccent: {
    marginTop: 6,
    height: 3,
    width: '60%',
    borderRadius: 2,
    backgroundColor: ROSE,
  },
  chapterStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 10,
    backgroundColor: 'rgba(232,97,154,0.06)',
    borderRadius: 12,
  },
  chapterCell: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.65)',
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
    fontSize: 16,
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
  },
  cancelText: { fontSize: 17, fontWeight: '600', paddingHorizontal: 4 },   // +15% from 15
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
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1.4,
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
  recentTerm: { flex: 1, fontSize: 17, color: TXT },                     // +15%
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
    width: 43,
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.18)',
    alignSelf: 'center',
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
  slider: {
    width: '100%',
    height: 36,
  },
  fontPills: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  fontPill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: 'center',
  },
  fontPillActive: {
    backgroundColor: ROSE,
  },
  fontPillInactive: {
    backgroundColor: `${ROSE}14`,
  },
  fontPillText: {
    fontSize: 16,
    fontWeight: '700',
  },
  themeRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  themeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
