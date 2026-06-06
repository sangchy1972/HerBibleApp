import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTabFocusScrollReset } from '../components/shared/useTabFocusEntrance';
import TabSection from '../components/shared/TabSection';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image, StyleSheet, Alert, Linking, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import FireFlame from '../components/shared/FireFlame';
import Animated, {
  FadeIn, FadeOut, Easing,
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import Glass from '../components/shared/Glass';
import Logo from '../components/shared/Logo';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { getHighlightColor } from '../constants/highlightColors';
import { TRANSLATIONS, useTranslation } from '../state/TranslationsContext';
import { useUILanguage, UI_LANGUAGES, type UILanguageCode } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import { useT } from '../i18n/useT';
import { useAuth } from '../state/AuthContext';
import { useSavedVerses } from '../state/SavedVersesContext';
import { useActivity } from '../state/ActivityContext';
import { usePrayer } from '../state/PrayerContext';
import { useHighlights } from '../state/HighlightsContext';
import { useBookmarks } from '../state/BookmarksContext';
import { useNotes, type Note } from '../state/NotesContext';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useAchievements } from '../state/AchievementsContext';
import { useBadges } from '../state/BadgesContext';
import BadgeIcon from '../components/BadgeIcon';
import { ACHIEVEMENTS } from '../constants/achievements';
import SignInSheet from '../components/SignInSheet';
import VerseNoteSheet from '../components/VerseNoteSheet';
import { NotesTile } from '../components/ProfileTiles';
import { getDownloadState, type DownloadState } from '../services/bibleService';
import type { TabScreenProps } from '../navigation/types';

type FeatherIcon = keyof typeof Feather.glyphMap;

function SettingRow({ label, icon, danger, isLast, onPress }: {
  label: string;
  icon: FeatherIcon;
  danger?: boolean;
  isLast?: boolean;
  onPress?: () => void;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} activeOpacity={0.7} style={[styles.settingRow, !isLast && styles.settingBorder]}>
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Feather name={icon} size={18} color={danger ? '#C84444' : TXT} />
      </View>
      <Text style={[styles.settingLabel, danger && { color: '#C84444' }]}>{label}</Text>
      {!danger && <Feather name="chevron-right" size={18} color={TXTSUB} />}
    </Wrapper>
  );
}

// Reusable search field for the My-Notes / Bookmarks / Highlights / Saved-
// Verses sheets. Self-contained (no external state) — caller passes value
// and onChangeText. Shows an inline clear button when there's content.
function SheetSearch({ value, onChangeText, placeholder }: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <Feather name="search" size={16} color={TXTSUB} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TXTSUB}
        style={styles.searchField}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={10}>
          <Feather name="x-circle" size={18} color={TXTSUB} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Shown inside a sheet's ScrollView when the search query yields no matches.
function SheetSearchEmpty({ query }: { query: string }) {
  const t = useT();
  return (
    <View style={{ paddingTop: 36, alignItems: 'center' }}>
      <Feather name="search" size={22} color={TXTSUB} />
      <Text style={{ marginTop: 8, color: TXTSUB, fontSize: 14 }}>
        {t('profile.sheet.noMatches', { query })}
      </Text>
    </View>
  );
}

// Three stat colors — Day Streak (rose), Days Read (lavender), Calendar (amber).
// Widget lives in its own banner card below the row.
const STAT_COLORS = [ROSE, LAV, '#F4B860'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatNoteDate(iso: string, lang: UILanguageCode): string {
  try {
    return new Date(iso).toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// Swatch lookup hits the shared HL_COLORS table — was previously a
// hardcoded switch with hex codes copy-pasted from BibleScreen, which
// silently went stale every time the palette was tweaked. Sixth color
// added in highlightColors.ts → Profile picks it up automatically.
function highlightSwatch(name: string): string {
  return getHighlightColor(name)?.dot ?? '#999999';
}

function MonthGrid({ year, month, activeSet }: { year: number; month: number; activeSet: Set<string> }) {
  // Cell layout only depends on year/month — memoize so the loop doesn't
  // re-run every time the parent re-renders (e.g. when activeSet flips
  // for a different month). With 12 months in the calendar sheet this
  // saves ~12 × (firstDay + daysInMonth) push() calls per render.
  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();   // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);
  const today = new Date();
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={styles.calMonthTitle}>{MONTH_NAMES[month]} {year}</Text>
      <View style={styles.calWeekdayRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.calWeekday}>{w}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.calCell} />;
          const key = dateKey(year, month, d);
          const isActive = activeSet.has(key);
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
          return (
            <View key={i} style={styles.calCell}>
              <View style={[
                styles.calDot,
                isActive && styles.calDotActive,
                isToday && styles.calDotToday,
              ]}>
                <Text style={[styles.calDay, isActive && { color: '#fff', fontWeight: '700' }]}>
                  {d}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Pan gesture + animated translateY for swipe-down-to-dismiss on a sheet.
// Returns the gesture and the style to apply to the sheet's outer Animated.View.
// Resets translateY whenever `visible` flips on so a previously-dismissed sheet
// re-opens at its natural position.
// Off-screen distance the sheet starts/exits at. Larger than any sheet height
// so it's fully below the screen edge before sliding up.
const SHEET_OFFSET = 1000;

function useSheetPan(onClose: () => void, visible: boolean) {
  const dragY = useSharedValue(SHEET_OFFSET);
  // The slide-IN is driven by this shared value too — NOT a reanimated
  // `entering` layout animation. A shared SlideInDown builder reused across
  // remounts intermittently failed to replay, leaving the sheet parked
  // off-screen under the backdrop (the "every-other-tap nothing appears" bug).
  // Driving translateY ourselves replays reliably every open and always
  // resets, so the bug can't recur.
  useEffect(() => {
    if (visible) {
      dragY.value = SHEET_OFFSET;
      dragY.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) });
    } else {
      dragY.value = SHEET_OFFSET;          // park off-screen, ready for the next open
    }
  }, [visible, dragY]);
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        dragY.value = withTiming(SHEET_OFFSET, { duration: 280 }, (f) => { if (f) runOnJS(onClose)(); });
      } else {
        dragY.value = withTiming(0, { duration: 240 });
      }
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  return { gesture: pan, sheetStyle };
}

function SheetBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
    >
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
    </Animated.View>
  );
}


function CalendarSheet({ activityDates, onClose }: { activityDates: Set<string>; onClose: () => void }) {
  const t = useT();
  const today = new Date();
  // Show current month and 11 previous months
  const months: { y: number; m: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  // Pull-down-to-dismiss — matches every other sheet on this screen. The
  // sheet was missing this and the user had no way to swipe it closed.
  const pan = useSheetPan(onClose, true);
  return (
    <View style={styles.pickerOverlay}>
      <SheetBackdrop onClose={onClose} />
      <GestureDetector gesture={pan.gesture}>
        <Animated.View style={[styles.pickerSheet, { maxHeight: '88%' }, pan.sheetStyle]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.pickerTitle, styles.calSheetTitle]}>{t('profile.stats.daysRead')} · {activityDates.size}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {months.map(({ y, m }) => (
              <MonthGrid key={`${y}-${m}`} year={y} month={m} activeSet={activityDates} />
            ))}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function ProfileScreen({ navigation }: TabScreenProps<'profile'>) {
  const insets = useSafeAreaInsets();
  // Tab-entrance scroll-to-top — paired with the per-section <TabSection>
  // animations below so the user always lands at the top of the Profile tab
  // and the content lifts into place in waves on every focus.
  const mainScrollRef = useRef<ScrollView>(null);
  useTabFocusScrollReset(mainScrollRef);
  const { user, signOut, updateProfile } = useAuth();
  const { verses: savedVerses, removeVerse } = useSavedVerses();
  const { dates: activityDates } = useActivity();
  const { totalComplete } = usePrayer();
  const { highlights: highlightMap, count: highlightsCount, removeHighlight } = useHighlights();
  const { bookmarks, count: bookmarksCount, removeBookmark } = useBookmarks();
  const { notes, removeNote } = useNotes();
  const { totalCheckIns } = useMoodCheckIn();
  const { earned, earnedCount } = useAchievements();
  // Second prefetch channel: warm the badge-art cache on the first Profile
  // visit too (the badge wall lives here). Idempotent with the home-screen one.
  const { prefetchAll: prefetchBadges } = useBadges();
  useEffect(() => { prefetchBadges(); }, [prefetchBadges]);
  const { current: currentTranslation, pending: dlPending, setTranslation, pauseDownload, resumeDownload } = useTranslation();
  const { lang: uiLang, meta: uiMeta, setLang: setUILang } = useUILanguage();
  const t = useT();
  const [showTranslationPicker, setShowTranslationPicker] = useState(false);
  const [langExpanded, setLangExpanded] = useState(true);
  const [showSignInSheet, setShowSignInSheet] = useState(false);
  const [showEditNameSheet, setShowEditNameSheet] = useState(false);
  const [showSavedSheet, setShowSavedSheet] = useState(false);
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);
  const [showNotesSheet, setShowNotesSheet] = useState(false);
  const [showBookmarksSheet, setShowBookmarksSheet] = useState(false);
  const [showHighlightsSheet, setShowHighlightsSheet] = useState(false);
  const [showReflectionsSheet, setShowReflectionsSheet] = useState(false);
  // When non-null, the VerseNoteSheet opens in edit mode for this note.
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  // Per-sheet search queries. Each sheet owns its own state so closing one
  // sheet doesn't carry the query into another. The filter is plain
  // case-insensitive substring matching via useMemo (further down).
  const [notesQuery, setNotesQuery] = useState('');
  const [bookmarksQuery, setBookmarksQuery] = useState('');
  const [highlightsQuery, setHighlightsQuery] = useState('');
  const [savedVersesQuery, setSavedVersesQuery] = useState('');
  const [versionToast, setVersionToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, ms = 2000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setVersionToast(msg);
    toastTimerRef.current = setTimeout(() => setVersionToast(null), ms);
  };
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const [editingName, setEditingName] = useState('');

  const STATS = [
    // First stat: lifetime count of fully-completed prayer days. Was
    // labeled "Day Streak" but the value is `totalComplete` (lifetime),
    // not the active consecutive run — relabeled "Days Prayed" so the
    // word matches the number.
    // FireFlame is absolutely-positioned so it floats above the in-flow
    // statIcon slot without pulling it. top: -5 = 5 px below the card's top
    // edge (= wrapper-top -5; wrapper sits at card.paddingVertical 10, so
    // flame ends up at card-top + 5 per user).
    { n: String(totalComplete),         label: t('profile.stats.daysPrayed'), render: (_c: string) => (
        <View style={{ position: 'absolute', top: -5, left: 0, right: 0, alignItems: 'center' }}>
          <FireFlame size={36.8} />
        </View>
      ) },

    { n: String(activityDates.size),    label: t('profile.stats.daysRead'),   render: (c: string) => <Ionicons name="book" size={25} color={c} /> },     // Feather → Ionicons filled (+25 % visual weight) + 22 → 25 (+15 %)
    { n: String(totalCheckIns),         label: t('profile.stats.calendar'),   render: (c: string) => <Ionicons name="calendar" size={25} color={c} /> }, // Feather → Ionicons filled (+25 % weight) + 22 → 25 (+15 %)
  ];

  const onStatTap = [
    () => navigation.navigate('Streak'),
    () => setShowCalendarSheet(true),
    () => navigation.navigate('MoodCalendar'),
  ];

  // Earliest entry in activityDates → "First Prayer awarded on …".
  // Returns null when the user has never prayed (badge section is hidden).
  const firstPrayerDate = activityDates.size > 0
    ? [...activityDates].sort()[0]
    : null;

  // Logged in → user's first initial (uppercase). Logged out → "H" for Herbible.
  const initials = user?.name?.trim().slice(0, 1).toUpperCase() || 'H';

  const openAvatarMenu = () => {
    if (!user) {
      setShowSignInSheet(true);
      return;
    }
    Alert.alert(t('profile.menu.title'), undefined, [
      { text: t('profile.menu.changePhoto'), onPress: pickPhoto },
      { text: t('profile.menu.editName'), onPress: () => { setEditingName(user.name); setShowEditNameSheet(true); } },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const pickPhoto = async () => {
    // Google Play / iOS App Store guidance: surface a clear in-app rationale
    // BEFORE invoking the OS permission prompt, so the user understands what
    // they're consenting to and why. Only after they tap "Allow" do we call
    // the OS API. We also handle the "permanently denied" case by routing to
    // Settings instead of looping the user through dead OS dialogs.
    const explain = (): Promise<boolean> =>
      new Promise((resolve) => {
        Alert.alert(
          t('profile.photo.consent.title'),
          t('profile.photo.consent.body'),
          [
            { text: t('profile.photo.consent.notNow'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('profile.photo.consent.allow'), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });

    const consented = await explain();
    if (!consented) return;

    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!perm.granted) {
      Alert.alert(
        t('profile.photo.permission.title'),
        t('profile.photo.permission.body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ photoUri: result.assets[0].uri });
    }
  };

  const submitEditName = () => {
    const name = editingName.trim();
    if (!name) return;
    updateProfile({ name });
    setShowEditNameSheet(false);
  };

  // Committing a UI language. The Bible version FOLLOWS the UI language, so this
  // ALSO kicks off the matching Bible download (storage + mobile data). Only
  // reached after the user confirms in pickLanguage's alert.
  const commitLanguage = (code: UILanguageCode) => {
    setUILang(code);
    const tr = TRANSLATIONS.find(x => x.code === code);
    if (!tr) return;
    setTranslation(code);
    if (dlStates[code]?.status !== 'complete' && code !== currentTranslation.code) {
      showToast(t('sheet.langBible.toast.bibleDownloading', { name: tr.nativeName }), 3800);
    }
  };

  // Picking a UI language. Switching the whole UI + downloading a second Bible
  // is heavy and (for the UI part) hard to undo if you land on a script you
  // can't read — so a stray or curious tap must NOT commit silently. We gate the
  // commit behind a confirmation alert that renders in the CURRENT (pre-switch)
  // language, so it's always readable. Nothing changes until the user confirms.
  // If that language's Bible is already cached, the prompt is a lightweight
  // switch with no download warning.
  // Pending language to confirm (null = dialog closed). Drives a branded
  // in-app dialog (see the <Modal> in the render) instead of the OS Alert —
  // the confirmation text is rendered in the CURRENT UI language via t().
  const [langConfirm, setLangConfirm] = useState<UILanguageCode | null>(null);
  const pickLanguage = (code: UILanguageCode) => {
    if (code === uiLang) return;
    if (!TRANSLATIONS.find(x => x.code === code)) return;
    setLangConfirm(code);
  };

  // Download status per translation — loaded once on mount so the version row
  // can show "Downloaded / available offline" without re-querying. Live
  // progress while a switch is downloading comes from the context's `pending`.
  const [dlStates, setDlStates] = useState<Record<string, DownloadState>>({});
  useEffect(() => {
    Promise.all(
      TRANSLATIONS.map(tr => getDownloadState(tr.code).then(s => [tr.code, s] as const))
    ).then(entries => setDlStates(Object.fromEntries(entries)));
  }, []);
  // Reflect a completed background download into dlStates so the row flips to
  // the "downloaded" state once the context finishes + clears `pending`.
  const prevPendingRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPendingRef.current;
    if (prev && !dlPending) {
      getDownloadState(prev).then(s => setDlStates(p => ({ ...p, [prev]: s })));
    }
    prevPendingRef.current = dlPending?.code ?? null;
  }, [dlPending]);

  // Swipe-down-to-dismiss for the Bible-versions sheet.
  const transPan = useSheetPan(() => setShowTranslationPicker(false), showTranslationPicker);
  // Same for the Saved-verses sheet.
  const savedPan = useSheetPan(() => setShowSavedSheet(false), showSavedSheet);
  const notesPan = useSheetPan(() => setShowNotesSheet(false), showNotesSheet);
  const bookmarksPan = useSheetPan(() => setShowBookmarksSheet(false), showBookmarksSheet);
  const highlightsPan = useSheetPan(() => setShowHighlightsSheet(false), showHighlightsSheet);
  const reflectionsPan = useSheetPan(() => setShowReflectionsSheet(false), showReflectionsSheet);
  const editNamePan = useSheetPan(() => setShowEditNameSheet(false), showEditNameSheet);

  // Highlights are stored as { id → Highlight }; produce a sortable array for the sheet.
  const highlightList = useMemo(
    () => Object.values(highlightMap).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [highlightMap],
  );

  // Filtered views for each My-Notes sheet. Empty query → unfiltered.
  // Substring match is case-insensitive across the most-relevant text fields
  // for that sheet (see the test plan TC-N-007 spec).
  const filteredNotes = useMemo(() => {
    const q = notesQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n =>
      n.text.toLowerCase().includes(q) ||
      (n.verseRef ?? '').toLowerCase().includes(q),
    );
  }, [notes, notesQuery]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarksQuery.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(b =>
      b.bookTitle.toLowerCase().includes(q) ||
      String(b.chapter).includes(q),
    );
  }, [bookmarks, bookmarksQuery]);

  const filteredHighlights = useMemo(() => {
    const q = highlightsQuery.trim().toLowerCase();
    if (!q) return highlightList;
    return highlightList.filter(h =>
      h.text.toLowerCase().includes(q) ||
      h.bookTitle.toLowerCase().includes(q) ||
      String(h.chapter).includes(q),
    );
  }, [highlightList, highlightsQuery]);

  const filteredSavedVerses = useMemo(() => {
    const q = savedVersesQuery.trim().toLowerCase();
    if (!q) return savedVerses;
    return savedVerses.filter(v =>
      v.text.toLowerCase().includes(q) ||
      v.ref.toLowerCase().includes(q),
    );
  }, [savedVerses, savedVersesQuery]);

  // Reflections — `notes` filtered to the `kind === 'reflection'` subset.
  // The standalone ReflectionsScreen used to host this list; lifted in
  // here (2026-05-22 per user) so the My-Notes row's 5 tiles all open the
  // same slide-up sheet pattern instead of one routing to a separate
  // screen. No search field — reflections are typically long paragraphs
  // the user wrote themselves, scanning by date is fast enough.
  const reflections = useMemo(() => notes.filter(n => n.kind === 'reflection'), [notes]);

  // Jump to a specific chapter in the Bible tab. We persist the target via the
  // last-read key, then navigate; BibleScreen's focus effect picks it up.
  const goToChapter = async (slug: string, ch: number) => {
    try {
      await AsyncStorage.setItem('bible:last-read', JSON.stringify({ bookSlug: slug, chapter: ch }));
    } catch {}
    navigation.navigate('Tabs', { screen: 'bible' });
  };

  return (
    <View style={{ flex: 1 }}>
    {versionToast && (
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        pointerEvents="none"
        style={[styles.versionToast, { top: insets.top + 12 }]}
      >
        <Feather name="check-circle" size={18} color="#fff" />
        <Text style={styles.versionToastText}>{versionToast}</Text>
      </Animated.View>
    )}
    <ScrollView
      ref={mainScrollRef}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
    >
      {/* Hero */}
      <TabSection delay={0}>
      <View style={styles.hero}>
        <TouchableOpacity style={styles.heroLeft} onPress={openAvatarMenu} activeOpacity={0.8}>
          <View>
            {user?.photoUri ? (
              <Image source={{ uri: user.photoUri }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={['#F9A8C9', '#E8619A']} style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </LinearGradient>
            )}
            {user && (
              <View style={styles.cameraBadge}>
                <Feather name="camera" size={14} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.heroMeta}>
            {user ? (
              <>
                <Text style={styles.name}>{user.name}</Text>
                <Text style={styles.email}>{user.email}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.name, styles.welcomeText]}>{t('profile.welcome')}</Text>
                <Text style={styles.email}>{t('profile.welcomeSub')}</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
        {!user && (
          <TouchableOpacity style={styles.loginBtn} onPress={() => setShowSignInSheet(true)} activeOpacity={0.85}>
            <Text style={styles.loginText}>{t('common.signIn')}</Text>
          </TouchableOpacity>
        )}
      </View>
      </TabSection>

      {/* Stats — Day Streak + Days Read share the row; Widget gets its own
          banner card below since "add to home screen" isn't a count and
          deserves richer affordances than a stat tile can give it. */}
      <TabSection delay={30}>{/* 90 → 30 — cuts the 7-section cascade tail from 550 ms to ~180 ms */}
      <View style={styles.statsRow}>
        {STATS.map((s, i) => (
          <TouchableOpacity key={i} onPress={onStatTap[i]} activeOpacity={0.85} style={{ flex: 1 }}>
            <Glass style={styles.statCard}>
              <View style={styles.statIcon}>{s.render(STAT_COLORS[i])}</View>
              <View style={styles.statBottomRow}>
                <Text style={styles.statNum}>{s.n}</Text>
                <Text style={styles.statLabel} numberOfLines={2}>{s.label}</Text>
              </View>
            </Glass>
          </TouchableOpacity>
        ))}
      </View>
      </TabSection>

      {/* Remove Ads — promoted out of the Account list to sit above the
          Widget banner. Same card silhouette as the widget banner so the two
          adjacent CTAs read as siblings rather than competing styles. */}
      <TabSection delay={60}>{/* 180 → 60 */}
      <TouchableOpacity
        onPress={() => navigation.navigate('RemoveAds')}
        activeOpacity={0.85}
        style={[styles.removeAdsBanner]}
      >
        <LinearGradient
          colors={[`${ROSE}1A`, `${LAV}1A`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.widgetBannerInner}
        >
          <LinearGradient
            colors={[`${ROSE}25`, `${LAV}25`]}
            style={styles.removeAdsIcon}
          >
            {/* "AD" glyph with a coral slash crossed through it. Reads as
                "no ads" without ambiguity (shield felt like privacy /
                protection generally; heart felt like favourites). The
                slash uses a ROSE-leaning warm red so the whole icon stays
                inside the app's pink palette instead of clashing with a
                pure-red prohibition glyph. */}
            <Text style={styles.removeAdsAd}>{t('profile.adPlaceholder')}</Text>
            <View style={styles.removeAdsSlash} />
          </LinearGradient>
          <View style={styles.widgetBannerCopy}>
            <Text style={[styles.widgetBannerTitle, styles.removeAdsTitle]}>{t('profile.removeAds.title')}</Text>
            <Text style={styles.widgetBannerSub}>{t('profile.removeAds.sub')}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={TXTSUB} />
        </LinearGradient>
      </TouchableOpacity>
      </TabSection>

      {/* Faith Achievement — preview up to 4 most-recent badges + a CTA into
          the full gallery. Hidden until the user has earned at least one. */}
      {earnedCount > 0 && (
        <TabSection delay={90}>{/* 270 → 90 */}
          <View style={[styles.sectionHeader, { marginTop: 20, marginBottom: 14 }]}>
            <Text style={styles.sectionTitle}>{t('profile.section.faithAchievement')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Achievement')} hitSlop={8}>
              <Text style={[styles.seeAll, { color: ROSE }]}>{t('plan.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Achievement')}
            activeOpacity={0.85}
            style={styles.achievementPreview}
          >
            {/* Show 1–3 most-recent badges (was 4). Three is enough to
                hint at variety without crowding the row, and lets the
                "Earned" column claim a chunkier ~24 % share. */}
            {ACHIEVEMENTS
              .filter(a => !!earned[a.id])
              .sort((a, b) => (earned[b.id]!.lastAwardedAt - earned[a.id]!.lastAwardedAt))
              .slice(0, 3)
              .map(a => (
                <View key={a.id} style={styles.achievementPreviewTile}>
                  <BadgeIcon
                    id={a.id}
                    iconKey={a.iconKey}
                    rarity={a.rarity}
                    size={64}
                    count={earned[a.id]?.count || 1}
                  />
                </View>
              ))}
            <View style={styles.achievementPreviewMore}>
              <Text style={styles.achievementPreviewCount}>{earnedCount}</Text>
              <Text style={styles.achievementPreviewMoreLabel}>{t('profile.achievement.earnedLabel')}</Text>
            </View>
          </TouchableOpacity>
        </TabSection>
      )}

      {/* My Notes — five identical NotesTiles in one wrapping row. Row 1
          (Saved Verses / Highlight / Bookmarks) is the most-read-back
          content; row 2 (Notes / Reflections) is the user-authored
          content. They were previously rendered as quieter subsection
          lists, but the design now treats all five as the same kind of
          shortcut card — single visual rank, no nested headings. Each
          tile's `onPress` still routes to the relevant full-screen sheet
          or screen. */}
      <TabSection delay={120}>{/* 360 → 120 */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>{t('profile.section.myNotes')}</Text>
      <View style={styles.notesRow}>
        <NotesTile label={t('profile.notes.tile.saved')}       icon="heart"          onPress={() => setShowSavedSheet(true)} />
        <NotesTile label={t('profile.notes.tile.highlight')}   icon="type"           onPress={() => setShowHighlightsSheet(true)} />
        <NotesTile label={t('profile.notes.tile.bookmarks')}   icon="bookmark"       onPress={() => setShowBookmarksSheet(true)} />
        <NotesTile label={t('profile.notes.tile.notes')}       icon="edit-2"         onPress={() => setShowNotesSheet(true)} />
        <NotesTile label={t('profile.notes.tile.reflections')} icon="message-square" onPress={() => setShowReflectionsSheet(true)} />
      </View>
      </TabSection>

      {/* Learning Bible — uses the same NotesTile component as My Notes so
          the two rows look like siblings (white card + centered icon + label).
          The previous GridTile carried a soft-rose icon background that made
          this row read as a different tier of UI. */}
      <TabSection delay={150}>{/* 450 → 150 */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>{t('profile.section.learningBible')}</Text>
      <View style={styles.notesRow}>
        <NotesTile label="My Plan"      icon="check-square" onPress={() => navigation.navigate('Tabs', { screen: 'plan', params: { reset: Date.now() } })} />
        <NotesTile label="Quiz"         icon="help-circle"  onPress={() => showToast('Quiz coming soon')} />
        <NotesTile label="Did You Know" icon="book-open"    badge onPress={() => showToast('Did You Know coming soon')} />
      </View>

      {/* Widget banner — moved here (was previously between Remove Ads and
          Faith Achievement). Sits below Learning Bible so the page flow
          reads: identity → upgrade → achievements → notes → tools → widget
          → account. Left thumbnail is a big bold "+" so it reads
          language-agnostically across locales (was a mini WidgetPreview
          but sample verse text in 72 px got cramped/clipped in every
          non-en lang). */}
      <TouchableOpacity
        onPress={() => navigation.navigate('AddWidget')}
        activeOpacity={0.85}
        style={[styles.widgetBanner, { marginTop: 22, marginBottom: 0 }]}
      >
        <LinearGradient
          colors={[`${ROSE}1A`, `${LAV}1A`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.widgetBannerInner}
        >
          {/* Left thumbnail — was a mini WidgetPreview rendering sample verse +
              ref, but the cross-language text inside that 72-px tile rendered
              cramped/clipped on every non-en locale. Replaced with a bold
              "+" affordance (per user 2026-05-22) so the thumbnail reads
              language-agnostically as "tap to add a widget". */}
          <View style={styles.widgetBannerThumb}>
            <Feather name="plus" size={42} color={ROSE} strokeWidth={3} />
          </View>
          <View style={styles.widgetBannerCopy}>
            <Text style={styles.widgetBannerEyebrow} numberOfLines={1} ellipsizeMode="tail">{t('profile.widget.eyebrow')}</Text>
            <Text style={styles.widgetBannerTitle} numberOfLines={2} ellipsizeMode="tail">{t('profile.widget.title')}</Text>
            <Text style={styles.widgetBannerSub} numberOfLines={2} ellipsizeMode="tail">{t('profile.widget.sub')}</Text>
          </View>
          <View style={styles.widgetBannerCta}>
            <Feather name="plus" size={20} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </TouchableOpacity>
      </TabSection>

      {/* Account — settings-style list of horizontal rows. */}
      <TabSection delay={180}>{/* 550 → 180 */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>{t('profile.section.account')}</Text>
      <Glass style={styles.settingsCard}>
        <SettingRow icon="share-2"     label="Share Her Bible"  onPress={() => showToast('Share App coming soon')} />
        <TouchableOpacity
          style={[styles.settingRow, styles.settingBorder]}
          onPress={() => setShowTranslationPicker(true)}
          activeOpacity={0.85}
        >
          <View style={styles.settingIcon}>
            <Feather name="globe" size={18} color={TXT} />
          </View>
          <Text style={styles.settingLabel}>{t('profile.account.bibleVersions')}</Text>
          <Text style={styles.settingValue}>{currentTranslation.nativeName}</Text>
          <Feather name="chevron-right" size={18} color={TXTSUB} />
        </TouchableOpacity>
        <SettingRow icon="bell"          label={t('profile.account.notifications')} onPress={() => navigation.navigate('Notifications')} />
        <SettingRow icon="settings"      label={t('profile.account.settings')}     onPress={() => showToast(t('toast.comingSoon', { feature: t('profile.account.settings') }))} />
        <SettingRow icon="message-circle" label={t('profile.account.helpCenter')} onPress={() => navigation.navigate('HelpCenter')} />
        <SettingRow icon="info"          label={t('profile.account.aboutUs')}     isLast onPress={() => navigation.navigate('AboutUs')} />
      </Glass>

      {user && (
        <Glass style={[styles.settingsCard, { marginTop: 16 }]}>
          <SettingRow icon="log-out" label={t('profile.signOut.row')} danger isLast onPress={() => Alert.alert(t('profile.signOut.title'), t('profile.signOut.body'), [
            { text: t('profile.signOut.confirmCancel'), style: 'cancel' },
            { text: t('profile.signOut.confirmConfirm'), style: 'destructive', onPress: signOut },
          ])} />
        </Glass>
      )}

      <View style={styles.versionFooter}>
        <Logo size={44} style={styles.versionLogo} />
        <Text style={styles.version}>{t('profile.version', { version: '1.0.0' })}</Text>
      </View>
      </TabSection>
      <View style={{ height: 23 }} />
    </ScrollView>

    {/* Sheets sit outside the ScrollView so they stay pinned to the screen. */}
    {showSignInSheet && (
      <SignInSheet
        onClose={() => setShowSignInSheet(false)}
        onError={(msg) => showToast(msg, 2800)}
      />
    )}

    {editingNote && (
      <VerseNoteSheet
        verseRef={editingNote.verseRef ?? ''}
        verseText={editingNote.verseText ?? ''}
        existingNote={editingNote}
        onClose={() => setEditingNote(null)}
      />
    )}

      {showEditNameSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowEditNameSheet(false)} />
          <GestureDetector gesture={editNamePan.gesture}>
          <Animated.View style={[styles.pickerSheet, editNamePan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{t('profile.editName.title')}</Text>
            <TextInput
              value={editingName}
              onChangeText={setEditingName}
              placeholder={t('profile.editName.placeholder')}
              placeholderTextColor={TXTSUB}
              style={styles.signInInput}
              autoFocus
              autoCapitalize="words"
            />
            <TouchableOpacity onPress={submitEditName} style={[styles.signInBtn, { backgroundColor: ROSE }]}>
              <Text style={styles.signInBtnText}>{t('profile.editName.save')}</Text>
            </TouchableOpacity>
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showSavedSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowSavedSheet(false)} />
          <GestureDetector gesture={savedPan.gesture}>
          <Animated.View style={[styles.pickerSheet, styles.savedSheet, savedPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{t('profile.savedSheet.title', { n: savedVerses.length })}</Text>
            {savedVerses.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="heart" size={32} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>{t('profile.saved.empty')}</Text>
                <Text style={styles.savedSheetEmptyHint}>{t('profile.saved.emptyHint')}</Text>
              </View>
            ) : (
              <>
                <SheetSearch
                  value={savedVersesQuery}
                  onChangeText={setSavedVersesQuery}
                  placeholder="Search saved verses"
                />
                <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                  {filteredSavedVerses.length === 0 ? (
                    <SheetSearchEmpty query={savedVersesQuery} />
                  ) : filteredSavedVerses.map(v => (
                    <View key={v.id} style={styles.savedSheetItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.savedSheetRef}>{v.ref}</Text>
                        <Text style={styles.savedSheetText}>{v.text}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeVerse(v.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
                        <Feather name="trash-2" size={20} color={TXTSUB} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showNotesSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowNotesSheet(false)} />
          <GestureDetector gesture={notesPan.gesture}>
          <Animated.View style={[styles.pickerSheet, styles.savedSheet, notesPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{t('profile.notes.label', { n: notes.length })}</Text>
            {notes.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="edit-2" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>{t('profile.notes.empty')}</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Open any chapter, tap a verse, choose{' '}
                  <Text style={{ fontWeight: '700', color: TXT }}>{t('profile.notes.wordLabel')}</Text>
                  {' '}and write what God is speaking to you.
                </Text>
              </View>
            ) : (
              <>
                <SheetSearch
                  value={notesQuery}
                  onChangeText={setNotesQuery}
                  placeholder="Search notes"
                />
                <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                  {filteredNotes.length === 0 ? (
                    <SheetSearchEmpty query={notesQuery} />
                  ) : filteredNotes.map(n => (
                    <View key={n.id} style={styles.savedSheetItem}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => setEditingNote(n)}
                        activeOpacity={0.7}
                      >
                        {n.verseRef && <Text style={styles.savedSheetRef}>{n.verseRef}</Text>}
                        <Text style={styles.savedSheetText}>{n.text}</Text>
                        <Text style={styles.metaSmall}>{formatNoteDate(n.savedAt, uiLang)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeNote(n.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
                        <Feather name="trash-2" size={20} color={TXTSUB} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showBookmarksSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowBookmarksSheet(false)} />
          <GestureDetector gesture={bookmarksPan.gesture}>
          <Animated.View style={[styles.pickerSheet, styles.savedSheet, bookmarksPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{t('profile.bookmarks.label', { n: bookmarksCount })}</Text>
            {bookmarks.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="bookmark" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>{t('profile.bookmarks.empty')}</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Open any chapter and tap the bookmark icon in the header to save it here.
                </Text>
              </View>
            ) : (
              <>
                <SheetSearch
                  value={bookmarksQuery}
                  onChangeText={setBookmarksQuery}
                  placeholder="Search bookmarks"
                />
                <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                  {filteredBookmarks.length === 0 ? (
                    <SheetSearchEmpty query={bookmarksQuery} />
                  ) : filteredBookmarks.map(b => (
                    <View key={b.id} style={styles.savedSheetItem}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => { setShowBookmarksSheet(false); goToChapter(b.bookSlug, b.chapter); }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.savedSheetText}>{b.bookTitle} {b.chapter}</Text>
                        <Text style={styles.metaSmall}>{formatNoteDate(b.savedAt, uiLang)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeBookmark(b.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
                        <Feather name="trash-2" size={20} color={TXTSUB} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showHighlightsSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowHighlightsSheet(false)} />
          <GestureDetector gesture={highlightsPan.gesture}>
          <Animated.View style={[styles.pickerSheet, styles.savedSheet, highlightsPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{t('profile.highlights.label', { n: highlightsCount })}</Text>
            {highlightList.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="type" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>{t('profile.highlights.empty')}</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Tap a verse while reading and pick a colour dot to highlight it.
                </Text>
              </View>
            ) : (
              <>
                <SheetSearch
                  value={highlightsQuery}
                  onChangeText={setHighlightsQuery}
                  placeholder="Search highlights"
                />
                <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                  {filteredHighlights.length === 0 ? (
                    <SheetSearchEmpty query={highlightsQuery} />
                  ) : filteredHighlights.map(h => (
                    <View key={h.id} style={styles.savedSheetItem}>
                      <View style={[styles.colorSwatch, { backgroundColor: highlightSwatch(h.color) }]} />
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => { setShowHighlightsSheet(false); goToChapter(h.bookSlug, h.chapter); }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.savedSheetRef}>{h.bookTitle} {h.chapter}:{h.verse}</Text>
                        <Text style={styles.savedSheetText} numberOfLines={3}>{h.text}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeHighlight(h.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
                        <Feather name="trash-2" size={20} color={TXTSUB} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showCalendarSheet && (
        <CalendarSheet
          activityDates={activityDates}
          onClose={() => setShowCalendarSheet(false)}
        />
      )}

      {showReflectionsSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowReflectionsSheet(false)} />
          <GestureDetector gesture={reflectionsPan.gesture}>
          <Animated.View style={[styles.pickerSheet, styles.savedSheet, reflectionsPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{t('profile.reflectionsSheet.title', { n: reflections.length })}</Text>
            {reflections.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="message-square" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>{t('reflections.empty.title')}</Text>
                <Text style={styles.savedSheetEmptyHint}>{t('reflections.empty.hint')}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                {reflections.map(r => (
                  <View key={r.id} style={styles.savedSheetItem}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => setEditingNote(r)}
                      activeOpacity={0.7}
                    >
                      {r.verseRef && <Text style={styles.savedSheetRef}>{r.verseRef}</Text>}
                      <Text style={styles.savedSheetText}>{r.text}</Text>
                      <Text style={styles.metaSmall}>{formatNoteDate(r.savedAt, uiLang)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeNote(r.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
                      <Feather name="trash-2" size={20} color={TXTSUB} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showTranslationPicker && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowTranslationPicker(false)} />
          <GestureDetector gesture={transPan.gesture}>
          {/* maxHeight 88% + inner ScrollView — without these the 7-row list
              renders taller than the screen and the handle gets pushed above
              the status bar where it can't be reached for swipe-dismiss.
              See feedback_sheet_swipe_dismiss.md. */}
          <Animated.View style={[styles.pickerSheet, { maxHeight: '88%' }, transPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.pickerTitle, styles.translationSheetTitle]}>{t('sheet.langBible.title')}</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>

              {/* Language section — collapsible. Drives UI strings (and via
                  UILanguageContext, the plans CDN locale). When collapsed, only the
                  header + current-language chip stay visible so the Bible-
                  versions list below dominates the sheet. */}
              <TouchableOpacity
                style={styles.langSectionHeader}
                onPress={() => setLangExpanded(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.langSectionTitle}>{t('sheet.langBible.languageHeader')}</Text>
                <View style={styles.langSectionTrigger}>
                  <Text style={styles.langSectionCurrent}>{uiMeta.nativeName}</Text>
                  <Feather name={langExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={ROSE} />
                </View>
              </TouchableOpacity>

              {langExpanded && (
                <>
                  <View style={styles.langChipGrid}>
                    {UI_LANGUAGES.map(l => {
                      const active = l.code === uiLang;
                      return (
                        <TouchableOpacity
                          key={l.code}
                          style={[styles.langChip, active && styles.langChipActive]}
                          onPress={() => pickLanguage(l.code)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                            {l.nativeName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Bible version — there's exactly one: the edition for the
                  selected UI language (the Bible follows the language). We show
                  only that row instead of the whole list, with its download
                  status + a pause/resume control so the user can stop the
                  background download on mobile data and resume on Wi-Fi. */}
              <Text style={styles.bibleSubHeader}>{t('sheet.langBible.versionsHeader')}</Text>

              {(() => {
                const tr = TRANSLATIONS.find(x => x.code === uiLang) ?? currentTranslation;
                const isPending = dlPending?.code === tr.code;
                const isPaused = !!(isPending && dlPending?.paused);
                const pct = isPending && dlPending && dlPending.total > 0
                  ? Math.floor((dlPending.fetched / dlPending.total) * 100) : 0;
                const downloaded = !isPending && dlStates[tr.code]?.status === 'complete';
                return (
                  <View style={styles.pickerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.translationPickerName, { color: ROSE, fontWeight: '700' }]}>
                        {tr.nativeName}
                      </Text>
                      <Text style={styles.translationPickerEdition}>{tr.edition}</Text>
                      {isPending && !isPaused && (
                        <Text style={styles.translationPickerProgress}>{t('sheet.langBible.downloading', { pct })}</Text>
                      )}
                      {isPaused && (
                        <Text style={styles.translationPickerProgress}>{t('sheet.langBible.paused', { pct })}</Text>
                      )}
                      {downloaded && (
                        <Text style={styles.translationPickerComplete}>{t('sheet.langBible.readyOffline')}</Text>
                      )}
                      {!downloaded && !isPending && (
                        <Text style={styles.translationPickerProgress}>{t('sheet.langBible.downloadRequired')}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      {downloaded ? (
                        <Feather name="check-circle" size={24} color="#7DB87D" />
                      ) : isPaused ? (
                        <TouchableOpacity onPress={resumeDownload} hitSlop={12} style={styles.translationPickerDlBtn}>
                          <Feather name="play" size={22} color={ROSE} />
                        </TouchableOpacity>
                      ) : isPending ? (
                        <TouchableOpacity onPress={pauseDownload} hitSlop={12} style={styles.translationPickerDlBtn}>
                          <Feather name="pause" size={22} color={ROSE} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => setTranslation(tr.code)} hitSlop={12} style={styles.translationPickerDlBtn}>
                          <Feather name="download" size={20} color={ROSE} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {/* Language-switch confirmation — branded in-app dialog (replaces the OS
          Alert). Text is localized to the CURRENT UI language via t(). */}
      {langConfirm && (() => {
        const tr = TRANSLATIONS.find(x => x.code === langConfirm);
        if (!tr) return null;
        const ready = dlStates[langConfirm]?.status === 'complete';
        const close = () => setLangConfirm(null);
        return (
          <Modal visible transparent animationType="fade" onRequestClose={close}>
            <View style={styles.langDlgOverlay}>
              <View style={styles.langDlgCard}>
                <Text style={styles.langDlgTitle}>{t('sheet.langConfirm.title', { lang: tr.nativeName })}</Text>
                <Text style={styles.langDlgBody}>
                  {ready
                    ? t('sheet.langConfirm.bodyReady', { lang: tr.nativeName })
                    : t('sheet.langConfirm.bodyDownload', { lang: tr.nativeName, edition: tr.edition })}
                </Text>
                <View style={styles.langDlgActions}>
                  <TouchableOpacity onPress={close} style={styles.langDlgCancel} activeOpacity={0.85}>
                    <Text style={styles.langDlgCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {t('sheet.langConfirm.cancel')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { const c = langConfirm; close(); commitLanguage(c); }}
                    style={styles.langDlgConfirm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.langDlgConfirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {ready ? t('sheet.langConfirm.confirm') : t('sheet.langConfirm.confirmDownload')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: P,
    paddingTop: 0,
    paddingBottom: 28,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 9,                                                               // 18 → 14 → 9 (cumulative -9 px from baseline per user)
    paddingBottom: 24,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  heroMeta: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 64.26,                                                                // 84 → 75.6 → 64.26 (-15 % per user)
    height: 64.26,
    borderRadius: 32.13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FBF7F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarText: { fontSize: 26.78, fontWeight: '600', color: '#fff' },            // 35 → 31.5 → 26.78 (proportional to avatar -15 %)
  name: { fontSize: 26, fontWeight: '500', color: TXT, marginBottom: 3 },
  // "Welcome" — Lora bold, matches PrayerScreen.greetText size (24.77) per user.
  welcomeText: { fontSize: 24.77, fontFamily: FONTS.loraBold, fontWeight: '600' },
  email: { fontSize: 13.5, color: TXTSUB, fontFamily: FONTS.lato },              // 15 → 13.5 (-10 %) + Lato per user
  loginBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10.45,                                                      // 11 → 10.45 (-5 % height per user)
    borderRadius: 22,
    backgroundColor: ROSE,                                                       // solid rose fill (was outlined) per user
  },
  loginText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  statsRow: {
    flexDirection: 'row',
    gap: 11,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    height: 92,                                                                  // unified height across all 4 main Profile cards per user (statCard, achievementPreview, widgetBanner, removeAdsBanner)
    backgroundColor: '#FFFFFF',
    borderRadius: 11.2,
    borderWidth: 0,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 11,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    // No Android elevation — it renders as an ugly gray frame during
    // react-navigation screen transitions. iOS shadow is enough.
  },
  // Icon hugs the top center of the card; container height bumped to fit
  // the +15 % icons. marginBottom 0 per user — no gap between icon and the
  // number+label row below it.
  statIcon: { alignSelf: 'center', marginBottom: 0, height: 38, justifyContent: 'center' },
  // Bottom row splits 1 : 3 — number occupies the left 1/4 (right-aligned
  // inside that slot), label occupies the right 3/4 (left-aligned).
  statBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 },
  statNum: { flex: 1, fontSize: 22, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold, textAlign: 'right' },
  statLabel: { flex: 3, fontSize: 12.14, color: TXTSUB, fontFamily: FONTS.lato, textAlign: 'center', lineHeight: 15.18 },
  widgetBanner: {
    // Matches notesTile (My Notes cards) 1:1 per user — same radius/height/
    // shadow AND elevation:1 so it lifts off the page on Android too (the iOS
    // shadow props alone render flat on Android — Android shadows need elevation).
    marginBottom: 25,
    height: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 11.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  widgetBannerInner: {
    flex: 1,                                                                     // fills the outer banner's locked 92 px height — the gradient now matches the card outline exactly
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,                                                         // 14 → 10 so a 72 px icon + 2×10 padding == 92 (the locked card height) without clipping
    paddingHorizontal: 14,
    gap: 14,
    // Round the gradient fill itself, since the outer wrapper no longer uses
    // overflow:hidden (which would clash with shadow on Android).
    borderRadius: 11.2,
    overflow: 'hidden',
  },
  // Was a 72-px frame wrapping the mini WidgetPreview; now wraps a bold
  // "+" icon (language-agnostic — doesn't need to render localized sample
  // text inside a small thumbnail). Soft ROSE-tinted fill + rounded corners
  // match the surrounding pill aesthetic.
  widgetBannerThumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: `${ROSE}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  widgetBannerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: ROSE,
    letterSpacing: 1.4,
    marginBottom: 4,
    fontFamily: FONTS.latoBold,
  },
  widgetBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TXT,
    marginBottom: 2,
    fontFamily: FONTS.latoBold,
  },
  widgetBannerSub: {
    fontSize: 13,
    color: TXTSUB,
    lineHeight: 18,
    fontFamily: FONTS.lato,
  },
  widgetBannerCta: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ROSE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  achievementPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 11.2,
    height: 92,                                                                  // unified height per user — same as statCard / widgetBanner / removeAdsBanner
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    // Android elevation removed — see statCard note.
  },
  achievementPreviewTile: { flex: 1, alignItems: 'center' },
  achievementPreviewMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    // ~24 % of the card width on a typical 393-px phone (card content
    // area ≈ 335 px → 80 px ≈ 23.9 %). Was 56 (~17 %).
    minWidth: 80,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(30,27,46,0.06)',
    marginLeft: 4,
  },
  achievementPreviewCount: { fontSize: 22, fontWeight: '800', color: ROSE, lineHeight: 26, fontFamily: FONTS.latoBold },
  // 11 → 12.1 (+10 % per spec).
  achievementPreviewMoreLabel: { fontSize: 12.1, color: TXTSUB, letterSpacing: 0.4, marginTop: 2, fontFamily: FONTS.lato },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    // Unified with sectionTitle below — every title block reads at the
    // same vertical rhythm whether it's wrapped in sectionHeader (with a
    // see-all link) or used standalone with an inline `marginBottom: 14`.
    marginBottom: 14,
  },
  // Unified section-title style — shared with PlanScreen.sectionLabel /
  // bigSectionLabel / catName so every section header on the app uses one
  // visual treatment: 20 / weight 600 / TXT, no uppercase, no letter-spacing.
  // Was 21 (-5 % per spec).
  // Mirrors PrayerScreen's sectionTitle (Continue Reading) 1:1 per user —
  // same Lora bold face, same 19.85 size, same weight. Every Profile
  // section header (Faith Achievement / My Notes / Learning Bible / Account)
  // reads with the home-screen heading voice.
  sectionTitle: { fontSize: 19.85, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
  seeAll: { fontSize: 16.94, fontWeight: '600', fontFamily: FONTS.latoBold },   // mirrors PlanScreen.seeAll 1:1 (Explore "See all ›" links) per user
  notesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    // Same gap on both axes — column gap matches the visual spacing of
    // the previous space-between layout (≈ 12 px on a 393-px screen),
    // and the row gap kicks in once tiles wrap to a second row (e.g.
    // My Notes' Reflections + Saved Verses sitting under Notes / Bookmarks
    // / Highlight). NotesTile keeps its 31 % width.
    columnGap: 12,
    rowGap: 12,
  },
  metaSmall: {
    fontSize: 12,
    color: TXTSUB,
    marginTop: 4,
  },
  colorSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  // Same chrome as widgetBanner / notesTile — radius, height, shadow AND
  // elevation:1 so it lifts on Android the same way the My Notes cards do.
  removeAdsBanner: {
    marginBottom: 12,
    height: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 11.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  // Override on top of widgetBannerTitle — Lato 600 per user (reverted from
  // Lora 600). Color matches the slash on the AD icon (#D54A6E) so the whole
  // banner reads in the same warm-red palette. fontSize +5 % per user.
  removeAdsTitle: { fontSize: 17.64, fontWeight: '600', fontFamily: FONTS.latoBold, color: ROSE },                     // ROSE matches "See all" link color per user; 16 → 16.8 → 17.64 (cumulative +10 %)
  removeAdsIcon: {
    // 72 × 71 — height net -1 px from the 72 baseline. widgetBannerInner uses
    // `alignItems: 'center'` so the badge sits vertically centered inside the
    // locked 92 px card. marginLeft -3 nudges the badge closer to the card's
    // left edge per user (shared widgetBannerInner padding stays at 14 so the
    // Widget banner is unaffected).
    marginLeft: -3,
    width: 72,
    height: 71,
    borderRadius: 10.08,                                                         // 18 → 12.6 → 10.08 (cumulative -44 % from baseline)
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  removeAdsAd: {
    fontSize: 18.2,                                                              // 26 → 18.2 (-30 % per user)
    fontWeight: '800',
    color: ROSE,
    letterSpacing: 1.5,
  },
  // Diagonal strikethrough — sits on top of the "AD" via absolute
  // positioning. Width is wider than the glyph so the slash visibly
  // extends past both letters; rotation -22° feels like a natural
  // hand-drawn cancel mark rather than a perfect ⊘ symbol. Scaled
  // proportionally with the glyph (-30 %) so it still over-extends by the
  // same ratio.
  removeAdsSlash: {
    position: 'absolute',
    width: 39.2,                                                                 // 56 → 39.2 (-30 % to match AD shrink)
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D54A6E',          // warm app-palette red, not a pure browser red
    transform: [{ rotate: '-22deg' }],
  },
  settingsCard: {
    overflow: 'hidden',
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingHorizontal: 17,
    paddingVertical: 12.4,                                                       // 20 → 17.4 → 12.4 (-10 px row height per user — 5 px off each side)
  },
  settingBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.05)',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingIconDanger: {
    backgroundColor: 'rgba(216,82,82,0.10)',
  },
  settingLabel: { flex: 1, fontSize: 16.26, fontWeight: '500', color: TXT, fontFamily: FONTS.lato },                                 // 17.12 → 16.26 (-5 % per user)
  settingValue: { fontSize: 14, color: TXTSUB, marginRight: 6, maxWidth: 120 },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  versionToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: 'rgba(20,16,28,0.9)',
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  versionToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: P,
    paddingTop: 14,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 50,                                                                  // 40 → 50 (+10 px per user)
    height: 4.5,                                                                // 5 → 4.5 (-10 % per user)
    borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center',
    marginTop: -7,                                                              // -7 px from sheet top per user
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TXT,
    marginBottom: 14,
    marginTop: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  pickerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  pickerName: { fontSize: 16, fontWeight: '600', color: TXT, marginBottom: 3 },
  pickerEdition: { fontSize: 13, color: TXTSUB },
  pickerProgress: { fontSize: 12, color: ROSE, fontWeight: '600', marginTop: 4 },
  pickerComplete: { fontSize: 12, color: '#7DB87D', fontWeight: '600', marginTop: 4 },
  pickerDlBtn: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: `${ROSE}14`,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  pickerDlBtnText: { fontSize: 12, fontWeight: '700', color: ROSE },
  pickerDlBtnPct: { fontSize: 12, fontWeight: '700', color: ROSE },
  // Bible-versions picker — every text/control bumped 10% per request, plus a
  // hint line and a muted "locked" caption for translations not yet downloaded.
  translationSheetTitle: { fontSize: 22, marginBottom: 14 },                                         // 20 → 22; extra bottom space now that "Language" section sits between title and Bible list
  translationSheetHint: { fontSize: 14, color: TXTSUB, marginBottom: 14, lineHeight: 20 },
  // ── Language section (top of the Language & Bible Versions sheet) ──
  // Collapsible: header row shows the current language chip + chevron;
  // expanded body shows all 7 chips in a wrap-grid.
  langSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  langSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TXT,
    fontFamily: FONTS.loraBold,
  },
  langSectionTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  langSectionCurrent: {
    fontSize: 15,
    fontWeight: '600',
    color: ROSE,
  },
  langChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  // Language chips — same pink "pill" pattern as RemoveAdsScreen's feature
  // chips (No ads / Future features) and the translation-picker download
  // buttons. Unselected = ROSE @ 8 % fill + ROSE text (tone-on-tone, soft).
  // Selected = solid ROSE + white text. Replaces an earlier cream/tan
  // palette that didn't match the app's ROSE-centric brand.
  langChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: `${ROSE}14`,
  },
  langChipActive: {
    backgroundColor: ROSE,
  },
  langChipText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: ROSE,
  },
  langChipTextActive: {
    color: '#FFFFFF',
  },
  langSectionHint: {
    fontSize: 13,
    color: TXTSUB,
    lineHeight: 19,
    marginBottom: 22,
  },
  bibleSubHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: TXT,
    fontFamily: FONTS.loraBold,
    marginTop: 6,
    marginBottom: 6,
  },
  translationPickerName: { fontSize: 18, fontWeight: '600', color: TXT, marginBottom: 4 },           // 16 → 18
  translationPickerEdition: { fontSize: 14, color: TXTSUB },                                         // 13 → 14
  translationPickerProgress: { fontSize: 13, color: ROSE, fontWeight: '600', marginTop: 5 },         // 12 → 13
  translationPickerComplete: { fontSize: 13, color: '#7DB87D', fontWeight: '600', marginTop: 5 },    // 12 → 13
  translationPickerLocked: { fontSize: 13, color: TXTSUB, fontWeight: '500', marginTop: 5 },
  translationPickerDlBtn: {
    minWidth: 48,                       // 44 → 48
    height: 36,                         // 32 → 36
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: `${ROSE}14`,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  translationPickerDlBtnPct: { fontSize: 13, fontWeight: '700', color: ROSE },
  signInInput: {
    backgroundColor: 'rgba(30,27,46,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: TXT,
    marginBottom: 12,
  },
  signInBtn: {
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(30,27,46,0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchField: {
    flex: 1,
    fontSize: 15,
    color: TXT,
    padding: 0,
  },
  savedSheetItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.05)',
  },
  // Saved-verses sheet: 88 % proportional so it adapts to every screen size,
  // leaves a 12 % backdrop strip for tap-to-dismiss, and never bleeds into the
  // status bar / dynamic island.
  savedSheet: {
    height: '88%',
  },
  savedSheetScroll: {
    flex: 1,
  },
  savedSheetRef: {                       // +15% from savedRef.fontSize 12
    fontSize: 14,
    color: ROSE,
    fontWeight: '700',
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  savedSheetText: {                      // +15% from savedText.fontSize 16
    fontSize: 18,
    color: 'rgba(30,27,46,0.72)',
    lineHeight: 28,
  },
  savedSheetEmpty: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 60,
    alignItems: 'center',
  },
  savedSheetEmptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${ROSE}1A`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  savedSheetEmptyTitle: {                // +15% from 17
    fontSize: 20,
    fontWeight: '700',
    color: TXT,
    marginBottom: 10,
  },
  savedSheetEmptyHint: {                 // +15% from 14
    fontSize: 16,
    lineHeight: 24,
    color: TXTSUB,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  // Days-Read sheet title — mirrors PlanScreen.heading ("My Plans") per user.
  // Overrides pickerTitle's defaults (20 / 700 / no family).
  calSheetTitle: { fontSize: 25.31, fontWeight: '600', fontFamily: FONTS.loraBold, marginBottom: 19 },
  // Month title — same Lora 600 face but -20 % on font size per user.
  calMonthTitle: { fontSize: 20.25, fontWeight: '600', color: TXT, marginBottom: 17, fontFamily: FONTS.loraBold },
  calWeekdayRow: { flexDirection: 'row', marginBottom: 6 },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 13, color: TXTSUB, fontWeight: '600' },  // +15% from 11
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  calDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calDotActive: { backgroundColor: ROSE },
  calDotToday: { borderWidth: 1.5, borderColor: ROSE },
  calDay: { fontSize: 15, color: TXT },                      // +15% from 13
  versionFooter: {
    alignItems: 'center',
    marginTop: 32,                                                              // 21 → 32 — logo needs more breathing room from the Sign-out card / About row above
  },
  versionLogo: { marginBottom: 8, opacity: 0.85 },
  version: {
    fontSize: 12,
    color: TXTSUB,
    textAlign: 'center',
    opacity: 0.7,
  },

  // Language-switch confirm dialog — branded, centered card (replaces the OS Alert).
  langDlgOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,12,24,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  langDlgCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  langDlgTitle: {
    fontSize: 20,
    fontWeight: '600',                     // loraBold + 600 (never 700 on Android)
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginBottom: 10,
  },
  langDlgBody: {
    fontSize: 14.5,
    lineHeight: 21,
    color: TXTSUB,
    fontFamily: FONTS.lato,
    marginBottom: 22,
  },
  langDlgActions: { flexDirection: 'row', alignSelf: 'stretch', gap: 10 },
  langDlgCancel: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  langDlgCancelText: { color: TXTSUB, fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold },
  langDlgConfirm: {
    flex: 1.4,
    height: 46,
    borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ROSE,
    paddingHorizontal: 8,
  },
  langDlgConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold },
});
