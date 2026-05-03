import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image, StyleSheet, Alert, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Animated, {
  SlideInDown, SlideInUp, FadeIn, FadeOut, Easing,
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import Glass from '../components/shared/Glass';
import WidgetPreview from '../components/WidgetPreview';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { TRANSLATIONS, useTranslation, type LanguageCode } from '../state/TranslationsContext';
import { useAuth } from '../state/AuthContext';
import { useSavedVerses } from '../state/SavedVersesContext';
import { useActivity } from '../state/ActivityContext';
import { usePrayer } from '../state/PrayerContext';
import { useHighlights } from '../state/HighlightsContext';
import { useBookmarks } from '../state/BookmarksContext';
import { useReadChapters, TOTAL_BIBLE_BOOKS } from '../state/ReadChaptersContext';
import { useNotes, type Note } from '../state/NotesContext';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useAchievements } from '../state/AchievementsContext';
import BadgeIcon from '../components/BadgeIcon';
import { ACHIEVEMENTS } from '../constants/achievements';
import SignInSheet from '../components/SignInSheet';
import { GridTile, NotesTile, FaithBadgeCard } from '../components/ProfileTiles';
import { downloadFullTranslation, getDownloadState, type DownloadState } from '../services/bibleService';
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

// Three stat colors — Day Streak (rose), Days Read (lavender), Calendar (amber).
// Widget lives in its own banner card below the row.
const STAT_COLORS = [ROSE, LAV, '#F4B860'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatNoteDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// Mirror of HL_COLORS in BibleScreen — keeps the swatch consistent across screens.
function highlightSwatch(name: string): string {
  switch (name) {
    case 'rose':  return '#F5C2D5';
    case 'lav':   return '#CBC0E8';
    case 'amber': return '#F4DD9E';
    case 'sage':  return '#BAE0C6';
    case 'sky':   return '#B8D2EE';
    default:      return '#999999';
  }
}

function MonthGrid({ year, month, activeSet }: { year: number; month: number; activeSet: Set<string> }) {
  const firstDay = new Date(year, month, 1).getDay();        // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
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
function useSheetPan(onClose: () => void, visible: boolean) {
  const dragY = useSharedValue(0);
  useEffect(() => { if (visible) dragY.value = 0; }, [visible, dragY]);
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        dragY.value = withTiming(800, { duration: 280 }, (f) => { if (f) runOnJS(onClose)(); });
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

const SHEET_ENTERING = SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic));

function CalendarSheet({ activityDates, onClose }: { activityDates: Set<string>; onClose: () => void }) {
  const today = new Date();
  // Show current month and 11 previous months
  const months: { y: number; m: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return (
    <View style={styles.pickerOverlay}>
      <SheetBackdrop onClose={onClose} />
      <Animated.View entering={SHEET_ENTERING} style={[styles.pickerSheet, { maxHeight: '88%' }]}>
        <View style={styles.sheetHandle} />
        <Text style={[styles.pickerTitle, styles.calSheetTitle]}>Days Read · {activityDates.size}</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {months.map(({ y, m }) => (
            <MonthGrid key={`${y}-${m}`} year={y} month={m} activeSet={activityDates} />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export default function ProfileScreen({ navigation }: TabScreenProps<'profile'>) {
  const insets = useSafeAreaInsets();
  const { user, signOut, updateProfile } = useAuth();
  const { verses: savedVerses, removeVerse } = useSavedVerses();
  const { dates: activityDates } = useActivity();
  const { totalComplete } = usePrayer();
  const { highlights: highlightMap, count: highlightsCount, removeHighlight } = useHighlights();
  const { bookmarks, count: bookmarksCount, removeBookmark } = useBookmarks();
  const { notes, removeNote } = useNotes();
  const { totalCheckIns } = useMoodCheckIn();
  const { earned, earnedCount } = useAchievements();
  const { booksTouched, percent: readPercent } = useReadChapters();
  const { current: currentTranslation, setTranslation } = useTranslation();
  const [showTranslationPicker, setShowTranslationPicker] = useState(false);
  const [showSignInSheet, setShowSignInSheet] = useState(false);
  const [showEditNameSheet, setShowEditNameSheet] = useState(false);
  const [showSavedSheet, setShowSavedSheet] = useState(false);
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);
  const [showNotesSheet, setShowNotesSheet] = useState(false);
  const [showBookmarksSheet, setShowBookmarksSheet] = useState(false);
  const [showHighlightsSheet, setShowHighlightsSheet] = useState(false);
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
    { n: String(totalComplete),         label: 'Day Streak', render: (c: string) => <Ionicons name="flame" size={26} color={c} /> },
    { n: String(activityDates.size),    label: 'Days Read',  render: (c: string) => <Feather name="book-open" size={22} color={c} /> },
    { n: String(totalCheckIns),         label: 'Calendar',   render: (c: string) => <Feather name="calendar" size={22} color={c} /> },
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
    Alert.alert('Profile', undefined, [
      { text: 'Change photo', onPress: pickPhoto },
      { text: 'Edit name', onPress: () => { setEditingName(user.name); setShowEditNameSheet(true); } },
      { text: 'Cancel', style: 'cancel' },
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
          'Use your photo as profile picture?',
          'Her Bible will read only the single photo you pick. We don’t scan or upload your library, and you can change or remove the picture anytime.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Allow', onPress: () => resolve(true) },
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
        'Photo access is off',
        'You’ve previously denied photo access. Open Settings to grant access, then come back to pick a picture.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
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

  const pickTranslation = (code: LanguageCode) => {
    const t = TRANSLATIONS.find(x => x.code === code);
    if (!t) return;
    // Re-tapping the active translation just dismisses the sheet.
    if (code === currentTranslation.code) {
      setShowTranslationPicker(false);
      return;
    }
    // Block the switch unless the full Bible has been cached locally.
    // Per-chapter on-demand fetching works in dev, but in production users
    // expect "switching" to mean their device actually has the content.
    const dl = dlStates[code];
    if (dl?.status !== 'complete') {
      showToast(`Download ${t.nativeName} first to switch`, 2400);
      return;
    }
    setTranslation(code);
    setShowTranslationPicker(false);
    showToast(`Switched to ${t.nativeName}`);
  };

  // Per-translation download state tracking
  const [dlStates, setDlStates] = useState<Record<string, DownloadState>>({});
  const dlAbortRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    // Load existing download status for all translations on mount
    Promise.all(
      TRANSLATIONS.map(t => getDownloadState(t.code).then(s => [t.code, s] as const))
    ).then(entries => setDlStates(Object.fromEntries(entries)));
  }, []);

  const [activeCodes, setActiveCodes] = useState<Set<string>>(new Set());

  const startDownload = (code: LanguageCode) => {
    const t = TRANSLATIONS.find(x => x.code === code);
    if (!t) return;
    if (activeCodes.has(code)) return;
    const ctl = new AbortController();
    dlAbortRef.current[code] = ctl;
    setActiveCodes(prev => { const n = new Set(prev); n.add(code); return n; });
    setDlStates(prev => ({
      ...prev,
      [code]: { status: 'in-progress', fetched: prev[code]?.fetched || 0, total: prev[code]?.total || 0, updatedAt: new Date().toISOString() },
    }));
    downloadFullTranslation(code, t.source, (fetched, total) => {
      setDlStates(prev => ({ ...prev, [code]: { status: 'in-progress', fetched, total, updatedAt: new Date().toISOString() } }));
    }, ctl.signal).then(final => {
      setDlStates(prev => ({ ...prev, [code]: final }));
      setActiveCodes(prev => { const n = new Set(prev); n.delete(code); return n; });
    });
  };

  const pauseDownload = (code: LanguageCode) => {
    const ctl = dlAbortRef.current[code];
    if (ctl) ctl.abort();
    setActiveCodes(prev => { const n = new Set(prev); n.delete(code); return n; });
  };

  // Swipe-down-to-dismiss for the Bible-versions sheet.
  const transPan = useSheetPan(() => setShowTranslationPicker(false), showTranslationPicker);
  // Same for the Saved-verses sheet.
  const savedPan = useSheetPan(() => setShowSavedSheet(false), showSavedSheet);
  const notesPan = useSheetPan(() => setShowNotesSheet(false), showNotesSheet);
  const bookmarksPan = useSheetPan(() => setShowBookmarksSheet(false), showBookmarksSheet);
  const highlightsPan = useSheetPan(() => setShowHighlightsSheet(false), showHighlightsSheet);

  // Highlights are stored as { id → Highlight }; produce a sortable array for the sheet.
  const highlightList = useMemo(
    () => Object.values(highlightMap).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [highlightMap],
  );

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
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
    >
      {/* Hero */}
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
                <Text style={[styles.name, styles.welcomeText]}>Welcome</Text>
                <Text style={styles.email}>Sign in to sync your progress</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
        {!user && (
          <TouchableOpacity style={styles.loginBtn} onPress={() => setShowSignInSheet(true)} activeOpacity={0.85}>
            <Text style={styles.loginText}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats — Day Streak + Days Read share the row; Widget gets its own
          banner card below since "add to home screen" isn't a count and
          deserves richer affordances than a stat tile can give it. */}
      <View style={styles.statsRow}>
        {STATS.map((s, i) => (
          <TouchableOpacity key={i} onPress={onStatTap[i]} activeOpacity={0.85} style={{ flex: 1 }}>
            <Glass style={styles.statCard}>
              <View style={styles.statIcon}>{s.render(STAT_COLORS[i])}</View>
              <Text style={styles.statNum}>{s.n}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Glass>
          </TouchableOpacity>
        ))}
      </View>

      {/* Widget banner — horizontal layout with a real mini WidgetPreview on
          the left so users can see exactly what they'd be installing. */}
      <TouchableOpacity
        onPress={() => navigation.navigate('AddWidget')}
        activeOpacity={0.85}
        style={styles.widgetBanner}
      >
        <LinearGradient
          colors={[`${ROSE}1A`, `${LAV}1A`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.widgetBannerInner}
        >
          <View style={styles.widgetBannerThumb}>
            <WidgetPreview
              size="2x2"
              width={72}
              title="Morning"
              body="The Lord is my shepherd."
              reference="Psalm 23:1"
            />
          </View>
          <View style={styles.widgetBannerCopy}>
            <Text style={styles.widgetBannerEyebrow}>HOME SCREEN WIDGET</Text>
            <Text style={styles.widgetBannerTitle}>Daily verse, one tap away</Text>
            <Text style={styles.widgetBannerSub}>Pick a size and add it in seconds.</Text>
          </View>
          <View style={styles.widgetBannerCta}>
            <Feather name="plus" size={20} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Faith Achievement — preview up to 4 most-recent badges + a CTA into
          the full gallery. Hidden until the user has earned at least one. */}
      {earnedCount > 0 && (
        <>
          <View style={[styles.sectionHeader, { marginBottom: 14 }]}>
            <Text style={styles.sectionTitle}>Faith Achievement</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Achievement')} hitSlop={8}>
              <Text style={[styles.seeAll, { color: ROSE }]}>See all →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Achievement')}
            activeOpacity={0.85}
            style={styles.achievementPreview}
          >
            {ACHIEVEMENTS
              .filter(a => !!earned[a.id])
              .sort((a, b) => (earned[b.id]!.lastAwardedAt - earned[a.id]!.lastAwardedAt))
              .slice(0, 4)
              .map(a => (
                <View key={a.id} style={styles.achievementPreviewTile}>
                  <BadgeIcon
                    iconKey={a.iconKey}
                    rarity={a.rarity}
                    size={64}
                    count={earned[a.id]?.count || 1}
                  />
                </View>
              ))}
            <View style={styles.achievementPreviewMore}>
              <Text style={styles.achievementPreviewCount}>{earnedCount}</Text>
              <Text style={styles.achievementPreviewMoreLabel}>earned</Text>
            </View>
          </TouchableOpacity>
        </>
      )}

      {/* My Reflections — pulled from the notes store, filtered to entries
          saved from the prayer flow's "Write a reflection" sheet. */}
      <View style={[styles.sectionHeader, { marginTop: 28 }]}>
        <Text style={styles.sectionTitle}>My Reflections</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Reflections')} hitSlop={8}>
          <Text style={[styles.seeAll, { color: ROSE }]}>See all →</Text>
        </TouchableOpacity>
      </View>
      {(() => {
        const reflections = notes.filter(n => n.kind === 'reflection');
        if (reflections.length === 0) {
          return (
            <View style={styles.savedEmpty}>
              <Text style={styles.savedEmptyText}>
                Reflections you write after a prayer flow will live here.
              </Text>
            </View>
          );
        }
        return reflections.slice(0, 2).map(r => (
          <TouchableOpacity
            key={r.id}
            onPress={() => navigation.navigate('Reflections')}
            style={styles.savedVerse}
            activeOpacity={0.85}
          >
            {r.verseRef ? <Text style={styles.savedRef}>{r.verseRef}</Text> : null}
            <Text style={styles.savedText} numberOfLines={2}>{r.text}</Text>
          </TouchableOpacity>
        ));
      })()}

      {/* My Notes — moved above Learning Bible per design feedback. Each tile
          opens a real list sheet now (no more 'coming soon' toasts). */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>My Notes</Text>
      <View style={styles.notesRow}>
        <NotesTile label="Notes"     icon="edit-2"   onPress={() => setShowNotesSheet(true)} />
        <NotesTile label="Bookmarks" icon="bookmark" onPress={() => setShowBookmarksSheet(true)} />
        <NotesTile label="Highlight" icon="type"     onPress={() => setShowHighlightsSheet(true)} />
      </View>

      {/* Saved Verses */}
      <View style={[styles.sectionHeader, { marginTop: 28 }]}>
        <Text style={styles.sectionTitle}>Saved Verses</Text>
        <TouchableOpacity onPress={() => setShowSavedSheet(true)} hitSlop={8}>
          <Text style={[styles.seeAll, { color: ROSE }]}>See all →</Text>
        </TouchableOpacity>
      </View>
      {savedVerses.length === 0 ? (
        <View style={styles.savedEmpty}>
          <Text style={styles.savedEmptyText}>No saved verses yet. Tap a verse while reading to save it here.</Text>
        </View>
      ) : (
        savedVerses.slice(0, 2).map(v => (
          <TouchableOpacity key={v.id} onPress={() => setShowSavedSheet(true)} style={styles.savedVerse} activeOpacity={0.85}>
            <Text style={styles.savedRef}>{v.ref}</Text>
            <Text style={styles.savedText}>{v.text}</Text>
          </TouchableOpacity>
        ))
      )}

      {/* Learning Bible — Calendar moved up to the stats row, leaving these
          three tiles in a 3-up grid. */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>Learning Bible</Text>
      <View style={styles.gridRow}>
        <GridTile label="My Plan"      icon="check-square" onPress={() => navigation.navigate('Tabs', { screen: 'plan' })} />
        <GridTile label="Quiz"         icon="help-circle"  onPress={() => showToast('Quiz coming soon')} />
        <GridTile label="Did you know" icon="book-open" badge onPress={() => showToast('Did you know coming soon')} />
      </View>

      {/* Study Progress (renamed from Faith Journey) */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>Study Progress</Text>
      <Glass style={styles.journeyCard}>
        <View style={styles.journeyInner}>
          <LinearGradient
            colors={[`${ROSE}25`, `${LAV}25`]}
            style={styles.journeyIcon}
          >
            <Feather name="book" size={26} color={ROSE} />
          </LinearGradient>
          <View style={styles.journeyMeta}>
            <Text style={styles.journeyTitle}>Through the Bible</Text>
            <View style={styles.journeyTrack}>
              <LinearGradient
                colors={[ROSE, LAV]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.journeyFill, { width: `${Math.max(readPercent, 0)}%` }]}
              />
            </View>
            <Text style={styles.journeySub}>
              {booksTouched} of {TOTAL_BIBLE_BOOKS} books · {readPercent}% complete
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={TXTSUB} />
        </View>
      </Glass>

      {/* Remove Ads — promoted out of the Account list so it can carry its own
          paywall CTA. Same card silhouette as Study Progress for a consistent rhythm. */}
      <TouchableOpacity
        onPress={() => navigation.navigate('RemoveAds')}
        activeOpacity={0.85}
        style={{ marginTop: 14 }}
      >
        <Glass style={styles.journeyCard}>
          <View style={styles.journeyInner}>
            <LinearGradient
              colors={[`${ROSE}25`, `${LAV}25`]}
              style={styles.journeyIcon}
            >
              <Feather name="heart" size={26} color={ROSE} />
            </LinearGradient>
            <View style={styles.journeyMeta}>
              <Text style={styles.journeyTitle}>Remove Ads</Text>
              <Text style={[styles.journeySub, { marginTop: 4 }]}>
                Subscribe for an ad-free, focused reading experience.
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={TXTSUB} />
          </View>
        </Glass>
      </TouchableOpacity>

      {/* Account — settings-style list of horizontal rows. */}
      <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>Account</Text>
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
          <Text style={styles.settingLabel}>Bible versions</Text>
          <Text style={styles.settingValue}>{currentTranslation.nativeName}</Text>
          <Feather name="chevron-right" size={18} color={TXTSUB} />
        </TouchableOpacity>
        <SettingRow icon="bell"          label="Notifications" onPress={() => navigation.navigate('Notifications')} />
        <SettingRow icon="sun"           label="Appearance"   onPress={() => showToast('Appearance coming soon')} />
        <SettingRow icon="bell"          label="Sounds"       onPress={() => showToast('Sounds coming soon')} />
        <SettingRow icon="settings"      label="Settings"     onPress={() => showToast('Settings coming soon')} />
        <SettingRow icon="message-circle" label="Help Center" onPress={() => navigation.navigate('HelpCenter')} />
        <SettingRow icon="info"          label="About Us"     isLast onPress={() => navigation.navigate('AboutUs')} />
      </Glass>

      {user && (
        <Glass style={[styles.settingsCard, { marginTop: 16 }]}>
          <SettingRow icon="log-out" label="Sign out" danger isLast onPress={() => Alert.alert('Sign out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: signOut },
          ])} />
        </Glass>
      )}

      <Text style={styles.version}>Her Bible · v1.0.0</Text>
      <View style={{ height: 23 }} />
    </ScrollView>

    {/* Sheets sit outside the ScrollView so they stay pinned to the screen. */}
    {showSignInSheet && (
      <SignInSheet
        onClose={() => setShowSignInSheet(false)}
        onError={(msg) => showToast(msg, 2800)}
      />
    )}

      {showEditNameSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowEditNameSheet(false)} />
          <Animated.View entering={SHEET_ENTERING} style={styles.pickerSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>Edit name</Text>
            <TextInput
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Your name"
              placeholderTextColor={TXTSUB}
              style={styles.signInInput}
              autoFocus
              autoCapitalize="words"
            />
            <TouchableOpacity onPress={submitEditName} style={[styles.signInBtn, { backgroundColor: ROSE }]}>
              <Text style={styles.signInBtnText}>Save</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {showSavedSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowSavedSheet(false)} />
          <GestureDetector gesture={savedPan.gesture}>
          <Animated.View entering={SHEET_ENTERING} style={[styles.pickerSheet, styles.savedSheet, savedPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>Saved verses · {savedVerses.length}</Text>
            {savedVerses.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="heart" size={32} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>No saved verses yet</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Open any chapter, tap a verse, and choose{' '}
                  <Text style={{ fontWeight: '700', color: TXT }}>Save</Text>
                  {' '}to keep it here.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                {savedVerses.map(v => (
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
            )}
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showNotesSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowNotesSheet(false)} />
          <GestureDetector gesture={notesPan.gesture}>
          <Animated.View entering={SHEET_ENTERING} style={[styles.pickerSheet, styles.savedSheet, notesPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>Notes · {notes.length}</Text>
            {notes.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="edit-2" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>No notes yet</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Open any chapter, tap a verse, choose{' '}
                  <Text style={{ fontWeight: '700', color: TXT }}>Note</Text>
                  {' '}and write what God is speaking to you.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                {notes.map(n => (
                  <View key={n.id} style={styles.savedSheetItem}>
                    <View style={{ flex: 1 }}>
                      {n.verseRef && <Text style={styles.savedSheetRef}>{n.verseRef}</Text>}
                      <Text style={styles.savedSheetText}>{n.text}</Text>
                      <Text style={styles.metaSmall}>{formatNoteDate(n.savedAt)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeNote(n.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
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

      {showBookmarksSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowBookmarksSheet(false)} />
          <GestureDetector gesture={bookmarksPan.gesture}>
          <Animated.View entering={SHEET_ENTERING} style={[styles.pickerSheet, styles.savedSheet, bookmarksPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>Bookmarks · {bookmarksCount}</Text>
            {bookmarks.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="bookmark" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>No bookmarks yet</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Open any chapter and tap the bookmark icon in the header to save it here.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                {bookmarks.map(b => (
                  <View key={b.id} style={styles.savedSheetItem}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => { setShowBookmarksSheet(false); goToChapter(b.bookSlug, b.chapter); }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.savedSheetText}>{b.bookTitle} {b.chapter}</Text>
                      <Text style={styles.metaSmall}>{formatNoteDate(b.savedAt)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeBookmark(b.id)} hitSlop={10} style={{ paddingLeft: 8 }}>
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

      {showHighlightsSheet && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowHighlightsSheet(false)} />
          <GestureDetector gesture={highlightsPan.gesture}>
          <Animated.View entering={SHEET_ENTERING} style={[styles.pickerSheet, styles.savedSheet, highlightsPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>Highlights · {highlightsCount}</Text>
            {highlightList.length === 0 ? (
              <View style={styles.savedSheetEmpty}>
                <View style={styles.savedSheetEmptyIcon}>
                  <Feather name="type" size={28} color={ROSE} />
                </View>
                <Text style={styles.savedSheetEmptyTitle}>No highlights yet</Text>
                <Text style={styles.savedSheetEmptyHint}>
                  Tap a verse while reading and pick a colour dot to highlight it.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.savedSheetScroll}>
                {highlightList.map(h => (
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

      {showTranslationPicker && (
        <View style={styles.pickerOverlay}>
          <SheetBackdrop onClose={() => setShowTranslationPicker(false)} />
          <GestureDetector gesture={transPan.gesture}>
          <Animated.View entering={SHEET_ENTERING} style={[styles.pickerSheet, transPan.sheetStyle]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.pickerTitle, styles.translationSheetTitle]}>Bible versions</Text>
            <Text style={styles.translationSheetHint}>Only fully-downloaded versions can be selected.</Text>
            {TRANSLATIONS.map((t, i) => {
              const active = t.code === currentTranslation.code;
              const isLast = i === TRANSLATIONS.length - 1;
              const dl = dlStates[t.code];
              const pct = dl && dl.total > 0 ? Math.floor((dl.fetched / dl.total) * 100) : 0;
              const downloaded = dl?.status === 'complete';
              const selectable = active || downloaded;
              return (
                <View
                  key={t.code}
                  style={[styles.pickerRow, !isLast && styles.pickerRowBorder]}
                >
                  <TouchableOpacity
                    style={[{ flex: 1 }, !selectable && { opacity: 0.55 }]}
                    onPress={() => pickTranslation(t.code)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.translationPickerName, active && { color: ROSE, fontWeight: '700' }]}>
                      {t.nativeName}
                    </Text>
                    <Text style={styles.translationPickerEdition}>{t.edition}</Text>
                    {dl?.status === 'in-progress' && activeCodes.has(t.code) && (
                      <Text style={styles.translationPickerProgress}>Downloading… {pct}%</Text>
                    )}
                    {dl?.status === 'in-progress' && !activeCodes.has(t.code) && (
                      <Text style={styles.translationPickerProgress}>Paused · {pct}% downloaded</Text>
                    )}
                    {downloaded && (
                      <Text style={styles.translationPickerComplete}>Downloaded · tap to switch</Text>
                    )}
                    {!downloaded && dl?.status !== 'in-progress' && !active && (
                      <Text style={styles.translationPickerLocked}>Download required to switch</Text>
                    )}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {active && <Feather name="check" size={22} color={ROSE} />}
                    {downloaded ? (
                      <Feather name="check-circle" size={24} color="#7DB87D" />
                    ) : activeCodes.has(t.code) ? (
                      <TouchableOpacity onPress={() => pauseDownload(t.code)} hitSlop={10} style={styles.translationPickerDlBtn}>
                        <Feather name="pause" size={18} color={ROSE} />
                        <Text style={styles.translationPickerDlBtnPct}>{pct}%</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => startDownload(t.code)} hitSlop={10} style={styles.translationPickerDlBtn}>
                        <Feather name={dl?.status === 'in-progress' ? 'play' : 'download'} size={20} color={ROSE} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </Animated.View>
          </GestureDetector>
        </View>
      )}
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
    paddingTop: 18,
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
    width: 84,
    height: 84,
    borderRadius: 42,
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
  avatarText: { fontSize: 35, fontWeight: '600', color: '#fff' },
  name: { fontSize: 26, fontWeight: '500', color: TXT, marginBottom: 3 },
  welcomeText: { fontSize: 23 },         // -10% from 26 (logged-out state only)
  email: { fontSize: 15, color: TXTSUB },
  loginBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: ROSE,
  },
  loginText: { fontSize: 15, fontWeight: '700', color: ROSE, letterSpacing: 0.3 },
  statsRow: {
    flexDirection: 'row',
    gap: 11,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    padding: 15,
    paddingHorizontal: 11,
    alignItems: 'center',
  },
  statIcon: { marginBottom: 6, height: 28, justifyContent: 'center' },
  statNum: { fontSize: 24, fontWeight: '700', color: TXT, marginBottom: 2 },
  statLabel: { fontSize: 13, color: TXTSUB },
  widgetBanner: {
    marginBottom: 25,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(232,97,154,0.18)',
  },
  widgetBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  widgetBannerThumb: {
    width: 72,
    height: 72,
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
  },
  widgetBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TXT,
    marginBottom: 2,
  },
  widgetBannerSub: {
    fontSize: 13,
    color: TXTSUB,
    lineHeight: 18,
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
    borderWidth: 1,
    borderColor: 'rgba(232,97,154,0.14)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 6,
  },
  achievementPreviewTile: { flex: 1, alignItems: 'center' },
  achievementPreviewMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    minWidth: 56,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(30,27,46,0.06)',
    marginLeft: 4,
  },
  achievementPreviewCount: { fontSize: 22, fontWeight: '800', color: ROSE, lineHeight: 26 },
  achievementPreviewMoreLabel: { fontSize: 11, color: TXTSUB, letterSpacing: 0.4, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 19,                  // +6 px (was 13) to give the cards room to breathe
  },
  sectionTitle: { fontSize: 21, fontWeight: '600', color: TXT },     // +15% from 18
  seeAll: { fontSize: 16, fontWeight: '600' },                       // +15% from 14
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  notesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  // Through-the-Bible card — +30% taller, with more breathing room around
  // the progress bar so it isn't pinched between the title and the caption.
  journeyCard: {
    marginBottom: 0,
    padding: 0,
    overflow: 'hidden',
  },
  journeyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 24,         // 17 → 24 (+~40%) so the card grows ≈ 30% in height
    paddingHorizontal: 18,       // 15 → 18
  },
  journeyIcon: {
    width: 60,                   // 56 → 60
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  journeyMeta: { flex: 1, minWidth: 0 },
  journeyTitle: { fontSize: 17, fontWeight: '600', color: TXT, marginBottom: 11 },  // +6 px below title
  journeyTrack: {
    height: 8,                   // 6 → 8 — slightly fatter
    borderRadius: 5,
    backgroundColor: 'rgba(30,27,46,0.07)',
    overflow: 'hidden',
    marginBottom: 11,            // 6 → 11 — give the caption more breathing room
  },
  journeyFill: {
    height: '100%',
    borderRadius: 5,
  },
  journeySub: { fontSize: 13, color: TXTSUB },
  savedVerse: {
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 13,
    marginBottom: 10,
  },
  savedRef: {
    fontSize: 12,
    color: ROSE,
    fontWeight: '700',
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  savedText: {
    fontSize: 16,
    color: 'rgba(30,27,46,0.72)',
    lineHeight: 25,
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
    paddingVertical: 15,
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
  settingLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: TXT },
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
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center',
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
  translationSheetTitle: { fontSize: 22, marginBottom: 6 },                                          // 20 → 22
  translationSheetHint: { fontSize: 14, color: TXTSUB, marginBottom: 14, lineHeight: 20 },
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
  savedEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(30,27,46,0.04)',
    borderRadius: 12,
    marginBottom: 10,
  },
  savedEmptyText: {
    fontSize: 17,                // +20% from 14
    color: TXTSUB,
    lineHeight: 24,              // +20% from 20
    textAlign: 'center',
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
  calSheetTitle: { fontSize: 23, marginBottom: 19 },        // +15% from 20, +5px gap above first month
  calMonthTitle: { fontSize: 18, fontWeight: '700', color: TXT, marginBottom: 17 },  // +15% font, +5px gap to weekday row
  calWeekdayRow: { flexDirection: 'row', marginBottom: 6 },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 13, color: TXTSUB, fontWeight: '600' },  // +15% from 11
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  calDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calDotActive: { backgroundColor: ROSE },
  calDotToday: { borderWidth: 1.5, borderColor: ROSE },
  calDay: { fontSize: 15, color: TXT },                      // +15% from 13
  version: {
    fontSize: 12,
    color: TXTSUB,
    textAlign: 'center',
    marginTop: 21,
    opacity: 0.7,
  },
});
