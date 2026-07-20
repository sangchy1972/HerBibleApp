import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Dimensions,
  Keyboard, Platform, Linking, Modal, AppState,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageBackground } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import Svg, { Path, Circle } from 'react-native-svg';
import LottieView from 'lottie-react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, withSequence,
  Easing, FadeIn, runOnJS, interpolateColor,
} from 'react-native-reanimated';
import { ROSE, BTN_RADIUS, LAV, TXT, TXTSUB, FONTS } from '../constants/theme';
import { maybeShowInterstitial } from '../services/ads';
import { logEvent } from '../services/firebase';
import { usePrayer } from '../state/PrayerContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useNotes } from '../state/NotesContext';
import { useNotifications } from '../state/NotificationsContext';
import { useActivity } from '../state/ActivityContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useT } from '../i18n/useT';
import { useOnboarding } from '../state/OnboardingContext';
import { localizeReference } from '../services/parseReference';
import { dailyLabels } from '../constants/dailyVersesLabels';
import WeeklyProgressView from '../components/WeeklyProgressView';
import ShareVerseSheet from '../components/ShareVerseSheet';
import VerseNoteSheet from '../components/VerseNoteSheet';
import { useSavedVerses } from '../state/SavedVersesContext';
import { useUILanguage } from '../state/UILanguageContext';

// Post-Amen celebration Lotties (both extracted from the user's dotLottie
// uploads into plain JSON so Metro bundles them like any other asset).
// Shown on BOTH morning and evening flows — the Amen screen is shared.
//   • prayer-hands.json — replaces the old static <PrayingHand /> SVG.
//   • confetti.json     — plays ONCE, full-screen over the Amen canvas,
//     at the same moment the hands animation appears.
const LOTTIE_PRAYER_HANDS = require('../../assets/lottie/prayer-hands.json');
const LOTTIE_CONFETTI = require('../../assets/lottie/confetti.json');
import { prepareVerseAudio, prepareHolidayVerseAudio, verseIdFor } from '../services/dailyVerseAudioService';
import { DAILY_VERSE_AUDIO_LANG, resolveDailyVerseAudioLang, isDailyVerseAudioAvailable, isHolidayVerseAudioAvailable } from '../constants/dailyVerseAudioCdn';
import { fetchStepTimings, type SentenceTiming } from '../services/verseHighlight';
import HighlightedText from '../components/HighlightedText';
import type { RootStackScreenProps } from '../navigation/types';

const { width, height } = Dimensions.get('window');
const SECTIONS = ['verse', 'meditation', 'action', 'prayer'];

// Top padding for the deep pages (Reflection / Today's Practice / Closing
// Prayer), measured BELOW the safe-area inset. Scales with screen height so
// short phones don't get a huge top gap: ~100 px on a tall phone (height
// ≈910), ~73 px on a small one (≈667), clamped to a sane 64–104 range so
// tablets don't overshoot. Was a fixed 140 (too low on every device per user).
const DEEP_PAGE_TOP = Math.round(Math.max(64, Math.min(104, height * 0.11)));

// Animated page indicator. Two shared values drive two independent animations
// so a single change to `page` reads as one smooth motion instead of a stack
// of step-changes:
//   • `activeT`   — 0 (circle, 9 px tall) ↔ 1 (pill, 35 px tall)
//   • `visitedT`  — 0 (translucent) ↔ 1 (white) for "have I been here yet?"
// Going forward (page 0 → 1): the old dot eases down to a circle while
// keeping its white color; the new dot fades in to white AND grows up to a
// pill in parallel. Going backward, both animations reverse — no jumpy
// color flash because color and shape live on separate timelines.
const DOT_DURATION = 280;
const DOT_EASING = Easing.out(Easing.cubic);
function PageDot({ isActive, isPast }: { isActive: boolean; isPast: boolean }) {
  const activeT  = useSharedValue(isActive ? 1 : 0);
  const visitedT = useSharedValue(isActive || isPast ? 1 : 0);
  useEffect(() => {
    activeT.value  = withTiming(isActive ? 1 : 0,                 { duration: DOT_DURATION, easing: DOT_EASING });
    visitedT.value = withTiming(isActive || isPast ? 1 : 0,       { duration: DOT_DURATION, easing: DOT_EASING });
  }, [isActive, isPast]);

  const animStyle = useAnimatedStyle(() => ({
    height: 9 + (35 - 9) * activeT.value,
    backgroundColor: interpolateColor(visitedT.value, [0, 1], ['rgba(255,255,255,0.35)', '#ffffff']),
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE = 5;

function ScrollWheel<T>({ values, value, onChange, format }: {
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const idx = Math.max(0, values.indexOf(value));
  const padding = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_HEIGHT;
  const handleEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const newIdx = Math.max(0, Math.min(values.length - 1, Math.round(y / WHEEL_ITEM_HEIGHT)));
    if (newIdx !== idx) onChange(values[newIdx]);
  };
  return (
    <View style={{ flex: 1, height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE }}>
      <View pointerEvents="none" style={styles.wheelHighlight} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingTop: padding, paddingBottom: padding }}
        contentOffset={{ x: 0, y: idx * WHEEL_ITEM_HEIGHT }}
        onMomentumScrollEnd={handleEnd}
        scrollEventThrottle={16}
      >
        {values.map((v, i) => (
          <View key={i} style={styles.wheelItemBox}>
            <Text style={[styles.wheelText, i === idx ? styles.wheelActive : styles.wheelInactive]}>
              {format ? format(v) : String(v)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function TimePickerSheet({ slot, onConfirm, onClose }: { slot: 'morning' | 'night'; onConfirm: (hour: number, minute: number) => void; onClose: () => void }) {
  const t = useT();
  const night = slot === 'night';
  const [hour, setHour] = useState<number>(8);
  const [minute, setMinute] = useState<number>(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(night ? 'PM' : 'AM');

  // 18:00 is the boundary (the evening prayer window opens then): a night
  // reminder only offers 6–11 PM; a morning one anything BEFORE 6 PM
  // (all of AM, and 12–5 PM). The wheels simply never show invalid hours.
  const hours = night
    ? [6, 7, 8, 9, 10, 11]
    : ampm === 'PM' ? [12, 1, 2, 3, 4, 5] : [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const periods: ('AM' | 'PM')[] = night ? ['PM'] : ['AM', 'PM'];
  // Switching a morning pick to PM shrinks the hour list — clamp a now-invalid
  // hour (e.g. 8) onto the latest valid one so the wheel never points nowhere.
  const onPeriod = (p: 'AM' | 'PM') => {
    setAmpm(p);
    if (!night && p === 'PM' && hour !== 12 && hour > 5) setHour(5);
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>{t('prayerFlow.time.title')}</Text>
      <View style={styles.wheelRow}>
        <ScrollWheel values={hours} value={hour} onChange={setHour} />
        <Text style={styles.wheelColon}>:</Text>
        <ScrollWheel values={minutes} value={minute} onChange={setMinute}
          format={v => String(v).padStart(2, '0')} />
        <ScrollWheel values={periods} value={ampm} onChange={onPeriod} />
      </View>
      <View style={styles.sheetBtns}>
        <TouchableOpacity onPress={onClose} style={styles.sheetBtnBack}>
          <Text style={[styles.sheetBtnText, { color: TXTSUB }]}>{t('prayerFlow.time.back')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const h24 = ampm === 'PM' ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
            onConfirm(h24, minute);
          }}
          style={[styles.sheetBtnConfirm, { backgroundColor: ROSE }]}
        >
          <Text style={[styles.sheetBtnText, { color: '#fff', fontWeight: '700' }]}>{t('prayerFlow.time.confirm')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Deterministic daily count for "N prayed with you today" — the number is
// stable within a calendar day but shifts between roughly 150k and 250k
// across days, so it feels alive without ever being a hard-coded literal.
function prayedTodayCount(): number {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const variation = Math.floor(Math.abs(Math.sin(seed)) * 100000);
  return 150000 + variation;
}

function formatThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Side-view praying-hands silhouette per user redesign. Two palms together
// seen from the side read as a single curved profile — pointed at the top
// (fingertips meeting), bulging gently through the palm/knuckle area,
// tapering to a narrow wrist with a soft rounded cuff. No fingertip arches,
// no thumb bump, no left/right mirror — one iconic shape, much cleaner than
// the previous four-fingertip top-down view.
const HAND_PATH =
  'M32 4 ' +
  // Left side: top tip down to palm bulge
  'C26 6, 20 14, 18 28 ' +
  'C14 50, 10 78, 14 110 ' +
  // Continuing left side: taper to wrist
  'C16 130, 20 150, 22 168 ' +
  'L22 184 ' +
  // Rounded cuff (bottom)
  'C22 190, 26 192, 32 192 ' +
  'C38 192, 42 190, 42 184 ' +
  'L42 168 ' +
  // Right side: wrist back up to palm bulge
  'C44 150, 48 130, 50 110 ' +
  'C54 78, 50 50, 46 28 ' +
  'C44 14, 38 6, 32 4 ' +
  'Z';

function PrayingHand() {
  return (
    <Svg width={64} height={196} viewBox="0 0 64 196">
      <Path d={HAND_PATH} fill="#FFFFFF" opacity={0.95} />
      {/* Subtle wrist cuff line — keeps the bottom from reading as a sealed bag */}
      <Path d="M22 172 L42 172" stroke="rgba(0,0,0,0.10)" strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

// 4-point sparkle star
function Sparkle({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 0 C12.6 8, 16 11.4, 24 12 C16 12.6, 12.6 16, 12 24 C11.4 16, 8 12.6, 0 12 C8 11.4, 11.4 8, 12 0 Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

// "Person reading aloud" — head + shoulders + two sound-wave arcs. Replaces
// the old headphones glyph on the narration (Listen) button per user.
function ReaderGlyph({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={3} fill={color} />
      {/* shoulders / upper body */}
      <Path d="M3.5 19c0-3.3 2.4-5.5 5.5-5.5s5.5 2.2 5.5 5.5Z" fill={color} />
      {/* sound waves to the right (speaking) */}
      <Path d="M17.5 8.5c1.3 1.3 1.3 5.7 0 7" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M20 6.5c2.2 2.2 2.2 8.8 0 11" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

// Narration highlight, ISOLATED. The audio status subscription lives HERE — in a
// small leaf — instead of in PrayerFlow. expo-audio pushes status ~10×/s while
// the narration plays; subscribing in the parent re-rendered the entire flow
// (outer pager + 3 nested ScrollViews) every tick, which on Android stuttered
// scrolling AND reset the nested-scroll hand-off so pages couldn't advance.
// Now only this block re-renders per tick; the ScrollViews stay mounted/stable.
function NarratedBody({ player, active, text, timings, style, highlightStyle }: {
  player: any;
  active: boolean;
  text: string;
  timings: SentenceTiming[] | null;
  style?: any;
  highlightStyle?: any;
}) {
  const status = useAudioPlayerStatus(player);
  const time = active ? (status?.currentTime ?? -1) : -1;
  return (
    <HighlightedText text={text} timings={timings} time={time} active={active} style={style} highlightStyle={highlightStyle} />
  );
}

// Invisible auto-advance driver. Owns its own status subscription so the
// didJustFinish edge fires `onFinish` WITHOUT re-rendering the parent every
// status tick. The per-step guard (advancedFromRef) still lives in the parent.
function NarrationAdvancer({ player, active, onFinish }: { player: any; active: boolean; onFinish: () => void }) {
  const status = useAudioPlayerStatus(player);
  const justFinished = !!status?.didJustFinish;
  const firedRef = useRef(false);
  useEffect(() => {
    if (!active) { firedRef.current = false; return; }
    if (justFinished && !firedRef.current) { firedRef.current = true; onFinish(); }
    else if (!justFinished) { firedRef.current = false; }
  }, [justFinished, active, onFinish]);
  return null;
}

export default function PrayerFlow({ route, navigation }: RootStackScreenProps<'PrayerFlow'>) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { markDone, mDone, eDone, everPrayed } = usePrayer();
  const { addNote } = useNotes();
  const { markToday } = useActivity();
  const { notifRationaleShown, markNotifRationaleShown } = useOnboarding();
  const { enableReminderAt, permissionGranted } = useNotifications();
  const { kind } = route.params;
  const morning = kind === 'morning';
  // Past-day replay: when a specific `day` is passed (from See Past Days), we
  // render THAT day's devotional from the CDN and treat the whole session as a
  // pure re-read — no completion recorded, no streak, no ad, no celebration.
  // The Amen button still works, it just exits without counting (per user:
  // "can re-read, just can't Amen [for credit]").
  const replayDay = route.params.day ?? null;
  const isReplay = replayDay != null;
  // Capture whether this slot was already completed BEFORE this flow started.
  // If so (or if this is a past-day replay), it's a re-do and the celebration
  // screens (weekly progress + set reminder sheet) are skipped.
  const isRedoRef = useRef<boolean>(isReplay || (morning ? mDone : eDone));
  // Capture whether this is the user's first-ever prayer of any kind. We
  // freeze the value at flow mount so markDone (which fires inside the flow)
  // doesn't flip it before we get to the Continue branch.
  const isFirstEverRef = useRef<boolean>(!everPrayed && !notifRationaleShown);
  const { current: translation } = useTranslation();
  const prayerBg = usePrayerBackgrounds();
  // Daily prayer background image (slot-specific). Used as the backdrop for
  // ShareVerseSheet so the verse card matches what the user was looking at
  // before opening share.
  const bgImage = prayerBg.imageFor(morning ? 'morning' : 'evening');
  const { getVerse, todayDay } = useDailyVerses();
  const labels = dailyLabels(translation.code);
  // Pull today's verse for the segment we entered with. Bundled fallback
  // covers the first 3 days offline; the CDN file expands to 60 once cached.
  const dailyVerse = getVerse(replayDay ?? todayDay, morning ? 'morning' : 'evening');
  // The corpus stores English book names; localize for the active translation
  // so Chinese / Spanish / Portuguese / etc. readers see "創世記 1:2" instead
  // of "Genesis 1:2" under the daily-verse heading.
  const verseRef = dailyVerse?.reference.full_reference
    ? localizeReference(translation.code, dailyVerse.reference.full_reference)
    : '';
  const verseText = dailyVerse?.modernText || '';

  // Verse action-row state — same trio of affordances as the home verse
  // card (Save / Notes / Share). The Save toggle mirrors the home card's
  // saved-list source, so the verse stays saved whether the user heart-ed
  // it from the home screen or here.
  const { verses: savedVerses, addVerse, removeVerse, hasVerse } = useSavedVerses();
  const verseIsSaved = !!verseRef && hasVerse(verseRef);
  const toggleVerseSaved = () => {
    if (!verseRef || !verseText) return;
    if (verseIsSaved) {
      const existing = savedVerses.find(s => s.ref === verseRef);
      if (existing) removeVerse(existing.id);
    } else {
      addVerse(verseRef, verseText);
    }
  };
  const [showVerseShare, setShowVerseShare] = useState(false);
  const [showVerseNote, setShowVerseNote] = useState(false);
  const meditationParas = (dailyVerse?.meditation || '').split('\n\n').filter(Boolean);
  const actionBody = dailyVerse?.actionStep || '';
  const prayerBody = dailyVerse?.prayer || '';
  // Keep mixed-case so the label matches the PrayerScreen hero-card label
  // ("Verse of the Day" — heroLabel) exactly. Meditation / action / prayer
  // captions stay uppercased: they're flow-specific section headers, not
  // mirrors of a card label.
  const verseCaption = morning ? labels.verseOfDay : labels.verseOfNight;
  // Title-case (matches the source labels exactly) per user — no more
  // .toUpperCase(), so "Reflection" / "Today's Practice" / "Closing Prayer"
  // render as authored.
  const meditationCaption = labels.meditationTitle;
  const actionCaption = morning ? labels.actionTitleMorning : labels.actionTitleEvening;
  const prayerCaption = labels.prayerTitle;
  const colors = morning
    ? (['#C2547A', '#7B2255', '#2D0A1A'] as const)
    : (['#5B3A9E', '#2D1660', '#100525'] as const);
  // Dark scrim laid over the photo backdrop so the white verse text + chrome
  // stays legible regardless of how bright the image is. Two stops so the
  // bottom half (where action labels sit) reads cleanly even on near-white
  // skies. Skipped entirely when no image is available — the gradient
  // fallback below carries enough contrast on its own.
  const scrimColors = morning
    // Wine-red (burgundy) instead of the old magenta-pink. Strength history:
    // original 0.30/0.58 & 0.40/0.70 → halved (read as "no scrim" on bright
    // photos) → settled midway per user: morning 0.22/0.44, evening
    // 0.30/0.52. Kept in sync with the home card's veil (PrayerScreen).
    ? (['rgba(74,20,36,0.22)', 'rgba(28,8,16,0.44)'] as const)
    : (['rgba(45,22,96,0.30)', 'rgba(16,5,37,0.52)'] as const);
  // Follow-along narration highlight — brand ROSE in the morning, LAV in the
  // evening (per user; the old rgba(0,0,0,0.32) dark pill read muddy over the
  // photos). 0.55 keeps the white sentence text at comfortable contrast.
  const spokenHl = [
    styles.spokenLine,
    { backgroundColor: morning ? 'rgba(230,63,105,0.55)' : 'rgba(134,107,192,0.55)' },
  ];
  // Background-music source for this slot. `audioFor` returns either a
  // local cached `file://` URI (prefetched on app launch via
  // PrayerBackgroundsContext) or null when no audio is available yet.
  // We pass the source straight to `useAudioPlayer`; on null it leaves the
  // player idle and `toggleMusic` becomes a no-op.
  const audioSource = prayerBg.audioFor(morning ? 'morning' : 'evening');
  const audioPlayer = useAudioPlayer(audioSource ?? null);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  // Auto-loop + auto-play. Setting `loop` on every render is safe — it's
  // idempotent — and covers the case where the player swaps source on
  // morning↔evening toggle. We only nudge `play()` when the source first
  // becomes available; the user's toggleMusic action below takes over from
  // there. Pause on unmount so the music doesn't follow the user to the
  // congrats screen.
  // Explicit user intent for the bg music. A SINGLE effect drives the player
  // from `musicOn` — so a stray re-render can no longer silently resume music
  // the user turned off (the bug where the bg-music button "wouldn't turn
  // off": the old auto-play effect re-fired and overrode the pause). Auto-on
  // when a source is available.
  const [musicOn, setMusicOn] = useState(true);
  useEffect(() => {
    if (!audioSource) return;
    try {
      audioPlayer.loop = true;
      audioPlayer.volume = 0.8;        // bg music −20% per user (sits under the voice)
      if (musicOn) audioPlayer.play();
      else audioPlayer.pause();
    } catch {}
  }, [musicOn, audioSource, audioPlayer]);
  useEffect(() => () => {
    try { audioPlayer.pause(); } catch {}
  }, [audioPlayer]);
  const toggleMusic = () => {
    if (!audioSource) return;
    setMusicOn(v => !v);
  };
  const [amened, setAmened] = useState(false);
  // Set true the instant Amen is tapped — a synchronous guard so the AppState
  // foreground handler (and any late effect) never auto-resumes audio after the
  // flow has ended (e.g. when an interstitial closes and the app returns).
  const endedRef = useRef(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [showNotifRationale, setShowNotifRationale] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNoteSheet, setShowNoteSheet] = useState(false);
  const [noteText, setNoteText] = useState('');
  // Keyboard height for the reflection sheet — drives a deterministic lift so
  // the Save button always clears the keyboard on EVERY device. The old
  // KeyboardAvoidingView behavior="height" was unreliable across Androids
  // (worked on the dev's Samsung, hidden the button on many others).
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!showNoteSheet) { setKbHeight(0); return; }
    // Seed an estimated keyboard height the moment the sheet opens. The input
    // autoFocuses, so the keyboard WILL be up — the sheet must be laid out for
    // that from the first frame. Without this seed there's a window where
    // kbHeight=0, the 92% sheet sits flush at the bottom, and the Save/Cancel
    // buttons render UNDER the keyboard until keyboardDidShow fires — which on
    // the first-ever open can arrive late/be missed on some Androids, leaving
    // the buttons stuck off-screen. The real height refines this ~250 ms later.
    setKbHeight(prev => (prev > 0 ? prev : Math.round(height * 0.36)));
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, [showNoteSheet]);
  const [page, setPage] = useState(0);
  const [buttonReady, setButtonReady] = useState(false);
  const pagerRef = useRef<PagerView>(null);
  // Each page that can overflow has its own inner ScrollView. Reset whichever
  // one is no longer active so swiping back into it lands on its caption,
  // not on whatever scroll offset the user last left there.
  const meditationScrollRef = useRef<ScrollView>(null);
  const actionScrollRef = useRef<ScrollView>(null);
  const prayerScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (page !== 1) meditationScrollRef.current?.scrollTo({ y: 0, animated: false });
    if (page !== 2) actionScrollRef.current?.scrollTo({ y: 0, animated: false });
    if (page !== 3) prayerScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [page]);

  // ── Daily-verse "listen / 导读" narration (English only) ────────────────
  // A SECOND, independent audio player layered over the looping background
  // music: tapping Listen reads the four prayer-flow steps aloud (Google
  // TTS). The model is PAGE-DRIVEN — the clip that plays always matches the
  // currently-visible page:
  //   • a clip finishing auto-advances to the next page + plays its clip
  //     (hands-free continuous read-through), and
  //   • a manual swipe (forward OR back) re-points the narration to the
  //     landed page and plays that clip from the top.
  // Pause/resume keeps position (same page); changing page restarts the new
  // page's clip from 0. The bg music keeps playing throughout — separate
  // players, separate controls.
  const { lang: uiLang } = useUILanguage();
  // Narration language for this UI language (en/es/pt today), or null when
  // none is recorded. The full Listen gate ALSO checks per-verse availability
  // below (`listenOk`) once today's verseId is known.
  const audioLang = resolveDailyVerseAudioLang(uiLang);
  const [listenOn, setListenOn] = useState(false);
  // Audio cursor — the page whose clip the narrator is on. Converges to the
  // settled page (never drives an animated scroll except on auto-advance).
  const [listenStep, setListenStep] = useState(0);
  const [readUris, setReadUris] = useState<string[] | null>(null);
  // Guards auto-advance so a re-surfaced didJustFinish for the same step
  // can't double-skip a page.
  const advancedFromRef = useRef(-1);
  // Mirror of listenStep read INSIDE the advance effect, so that effect
  // doesn't need listenStep as a dependency (see the advance effect below).
  const listenStepRef = useRef(0);
  useEffect(() => { listenStepRef.current = listenStep; }, [listenStep]);

  // One-time audio session setup: play through the iOS silent switch and
  // mix (so our two players — bg music + narration — coexist instead of
  // one ducking the other). Set once at mount, never per-clip.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }, []);

  // The verse to narrate, as a STABLE string id + day number. Keying the
  // load effect on these primitives (not the dailyVerse OBJECT) is critical:
  // DailyVersesContext swaps its `verses` array bundled→cache→CDN, which
  // hands back a fresh dailyVerse reference with the SAME content. If the
  // effect depended on that object it would re-run mid-listen, re-set
  // readUris, swap the audio source, and CUT OFF the playing clip. Keying on
  // verseId/verseDay re-runs only when the verse genuinely changes.
  // Per-step sentence timings for follow-along highlight (4 arrays in page
  // order; any step null = no highlight for it). Loaded alongside the audio.
  const [stepTimings, setStepTimings] = useState<(SentenceTiming[] | null)[] | null>(null);

  const verseDay = dailyVerse?.day ?? null;
  // Holiday verses carry a `holidayId` and live in a SEPARATE audio
  // folder/manifest (their m_NNN/e_NNN ids collide with the regular set), so
  // route narration to the holiday pipeline when today's verse is a holiday.
  const isHolidayVerse = !!dailyVerse && (dailyVerse as { holidayId?: string }).holidayId != null;
  // Listen availability = language recorded AND per-verse: the holiday bucket
  // is English-only, and the regular set may have per-language upload holes
  // (isDailyVerseAudioAvailable) — a visible button that 404s is worse than
  // no button. verseId stays null when unavailable, which disables the whole
  // download/timings pipeline below.
  const verseIdRaw = dailyVerse ? verseIdFor(dailyVerse.day, dailyVerse.segment) : null;
  const listenOk = !!audioLang && !!verseIdRaw && (
    isHolidayVerse
      ? isHolidayVerseAudioAvailable(audioLang)
      : isDailyVerseAudioAvailable(audioLang, verseIdRaw)
  );
  const verseId = listenOk ? verseIdRaw : null;

  // Resolve + download today's narration. keepIds = today's morning + evening
  // so doing one slot's flow doesn't prune the other's cached files;
  // everything older than today is pruned inside prepareVerseAudio so the
  // device never accumulates stale audio.
  useEffect(() => {
    if (!verseId || verseDay == null) { setReadUris(null); setStepTimings(null); return; }
    let alive = true;
    // Always protect TODAY's morning+evening narration from pruning — even in a
    // past-day replay (verseDay = replayDay), so replaying an old day doesn't
    // evict today's prefetched audio.
    const keep = Array.from(new Set([
      verseIdFor(verseDay, 'morning'), verseIdFor(verseDay, 'evening'),
      verseIdFor(todayDay, 'morning'), verseIdFor(todayDay, 'evening'),
    ]));
    // verseId is only non-null when listenOk passed, which guarantees
    // audioLang; the ?? fallback just satisfies the type.
    const lang = audioLang ?? DAILY_VERSE_AUDIO_LANG;
    (isHolidayVerse ? prepareHolidayVerseAudio(verseId, keep, lang) : prepareVerseAudio(verseId, keep, lang))
      .then(uris => { if (alive) setReadUris(uris); })
      .catch(() => { if (alive) setReadUris(null); });
    // Sentence timings for highlight — best-effort, independent of audio so a
    // timings failure never blocks playback.
    setStepTimings(null);
    fetchStepTimings(verseId, isHolidayVerse, lang)
      .then(ts => { if (alive) setStepTimings(ts); })
      .catch(() => { if (alive) setStepTimings(null); });
    return () => { alive = false; };
  }, [verseId, verseDay, isHolidayVerse, todayDay, audioLang]);

  // Source is keyed on the cursor (NOT on listenOn) so pausing keeps the
  // clip mounted at its position — resume continues mid-clip. Changing the
  // cursor swaps the source, which restarts the new page's clip from 0.
  const readSource = useMemo(
    () => (readUris ? { uri: readUris[listenStep] } : null),
    [readUris, listenStep],
  );
  const readPlayer = useAudioPlayer(readSource);

  // Per-step sentence-timings selector. The narration TIME is now read inside
  // each <NarratedBody> (one tiny leaf), so audio-status ticks no longer
  // re-render this whole component — only the block currently being spoken.
  const timingFor = (step: number): SentenceTiming[] | null =>
    (stepTimings && stepTimings[step]) || null;

  // Pause BOTH players when the app leaves the foreground (backgrounded, call,
  // lock) and resume per the user's intent when it returns — so audio never
  // keeps playing in the background and the button state can't desync from the
  // native player after an interruption.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        try { audioPlayer.pause(); } catch {}
        try { readPlayer.pause(); } catch {}
      } else {
        // Don't resume once the flow has ended (e.g. returning from the
        // interstitial) — the prayer is over, audio must stay silent.
        try { if (!endedRef.current && musicOn && audioSource) audioPlayer.play(); } catch {}
        try { if (!endedRef.current && listenOn && readUris) readPlayer.play(); } catch {}
      }
    });
    return () => sub.remove();
  }, [audioPlayer, readPlayer, musicOn, listenOn, audioSource, readUris]);

  // Hard stop on unmount / exit. expo-audio's useAudioPlayer does NOT reliably
  // stop a LOOPING player when the component unmounts, so leaving the flow
  // (the X button → closeFlow → navigation.goBack, or any unmount) left the
  // background music still playing on the home screen. Refs hold the latest
  // player instances; the cleanup pauses both the moment the screen goes away.
  const audioPlayerRef = useRef(audioPlayer);
  audioPlayerRef.current = audioPlayer;
  const readPlayerRef = useRef(readPlayer);
  readPlayerRef.current = readPlayer;
  useEffect(() => {
    return () => {
      try { audioPlayerRef.current?.pause(); } catch {}
      try { readPlayerRef.current?.pause(); } catch {}
    };
  }, []);

  // Play/pause follows `listenOn`; also (re)plays when the cursor moves to a
  // new clip while listening. Pausing (listenOn=false) holds position so a
  // resume on the same page continues where it left off.
  useEffect(() => {
    if (!readUris) return;
    try {
      // Voice tuning per user: 1.1× speed (pitch-corrected so it doesn't
      // sound sped-up) and full volume (caps at 1.0 — louder than the 0.8 bg
      // music, realizing the "voice up / music down" balance).
      readPlayer.volume = 1.0;
      try { readPlayer.setPlaybackRate(1.1, 'high'); } catch { try { (readPlayer as any).playbackRate = 1.1; } catch {} }
      if (listenOn) readPlayer.play();
      else readPlayer.pause();
    } catch {}
  }, [listenOn, listenStep, readUris, readPlayer]);

  // Auto-start narration 1s after the clips are ready — no tap needed (per
  // user). Fires once; the bg music already auto-plays via musicOn. If the
  // narration isn't available (non-EN UI, fetch failed) this simply no-ops.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!readUris || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const t = setTimeout(() => setListenOn(true), 1000);
    return () => clearTimeout(t);
  }, [readUris]);

  // Auto-advance: a finished clip scrolls to + plays the next step. Stops
  // (without auto-Amen) after the closing prayer.
  //
  // Reads the current step from listenStepRef and DOES NOT list listenStep
  // as a dependency. That matters: if listenStep were a dep, advancing it
  // would re-run this effect while readStatus.didJustFinish is still true
  // from the clip that just ended (the new source hasn't loaded yet) — and
  // it would advance AGAIN, skipping the next clip (that's why Reflection,
  // the step right after the first finish, was getting silently skipped).
  // With the ref, this only fires on a real didJustFinish transition.
  const handleNarrationFinish = useCallback(() => {
    const cur = listenStepRef.current;
    if (advancedFromRef.current === cur) return;
    advancedFromRef.current = cur;
    if (cur < SECTIONS.length - 1) {
      const next = cur + 1;
      setListenStep(next);
      setPage(next);
      pagerRef.current?.setPage(next);
    } else {
      setListenOn(false);            // finished the closing prayer — stop
    }
  }, []);

  // Tapping Amen ends the flow — make sure narration stops before the
  // congrats scene (the topbar Listen button is already hidden by !amened).
  useEffect(() => {
    if (amened && listenOn) setListenOn(false);
  }, [amened, listenOn]);

  // Stop narration if the user leaves the flow (unconditional — covers the
  // case where the status snapshot says paused but native is mid-buffer).
  useEffect(() => () => {
    try { readPlayer.pause(); } catch {}
  }, [readPlayer]);

  const toggleListen = () => {
    if (!readUris) return;
    if (listenOn) {
      setListenOn(false);            // effect pauses; position kept for resume
    } else {
      // Start/resume from the page the user is on. If they swiped while
      // paused, jump the cursor to the current page (new clip from 0); if
      // they're still on the same page, resume from where it paused.
      advancedFromRef.current = -1;
      if (listenStep !== page) {
        setListenStep(page);
        pagerRef.current?.setPage(page);
      }
      setListenOn(true);             // the play effect picks it up
    }
  };

  // PagerView lands exactly on a page (native), so there's no sub-page snapping
  // to do. On every settle: sync `page`, pin the landed deep page's inner scroll
  // to the top, and — if narrating — re-point the narration cursor to the page
  // the user swiped to (plays that clip from the top).
  const onPageSelected = (e: { nativeEvent: { position: number } }) => {
    const landed = e.nativeEvent.position;
    setPage(landed);
    const inner = landed === 1 ? meditationScrollRef
      : landed === 2 ? actionScrollRef
      : landed === 3 ? prayerScrollRef
      : null;
    inner?.current?.scrollTo({ y: 0, animated: false });
    if (listenOn && landed !== listenStep) {
      advancedFromRef.current = -1;  // fresh clip — let its finish advance
      setListenStep(landed);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // EDGE HAND-OFF: swipe past the end of a deep page → next page, in one go.
  //
  // Why this is needed. Android's ScrollView.onInterceptTouchEvent only lets a
  // vertical drag through to its parent when the view CANNOT scroll at all
  // ("if (getScrollY() == 0 && !canScrollVertically(1)) return false"). The
  // moment a deep page has been scrolled even one pixel, scrollY != 0, so the
  // inner ScrollView claims every subsequent vertical gesture and calls
  // requestDisallowInterceptTouchEvent(true) on its parents — PagerView never
  // sees the swipe. iOS behaves the same way (the inner UIScrollView's pan wins).
  // overScrollMode="never" / bounces={false} killed the overscroll animation
  // that used to eat the gesture, but NOT this: sitting at the bottom of
  // Reflection or Today's Practice, the pager stays starved and the user swipes
  // over and over with nothing happening.
  //
  // So we do the hand-off in JS. A drag that STARTS and ENDS at the same edge
  // moved the content nowhere — meaning the user pushed against the end of the
  // page — so we drive the pager ourselves. Direction falls out for free: at the
  // bottom, a downward drag DOES move the offset, so it ends away from the edge
  // and we correctly do nothing. Same, mirrored, at the top for going back.
  // Pages whose content fits the screen are left alone: they can't scroll, so
  // Android already hands those to the pager natively.
  const PAGE_COUNT = 4;
  const EDGE_EPS = 2;                                   // px slop for "at the edge"
  const dragStart = useRef<{ top: boolean; bottom: boolean; scrollable: boolean } | null>(null);

  const edgeState = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const max = contentSize.height - layoutMeasurement.height;
    return {
      top: contentOffset.y <= EDGE_EPS,
      bottom: contentOffset.y >= max - EDGE_EPS,
      scrollable: max > EDGE_EPS,
    };
  };

  // A deep page whose content FITS the screen needs no inner scrolling at all.
  // Leaving the ScrollView enabled in that case still lets its pan gesture win
  // over PagerView on iOS (the pan recognizes even when there's nothing to
  // scroll), which swallows the swipe. Measuring the overflow and switching
  // scrollEnabled off means the gesture goes straight to the pager — those
  // pages now turn on the FIRST swipe.
  const [pageScrollable, setPageScrollable] = useState<Record<number, boolean>>({});
  const pageMetrics = useRef<Record<number, { layoutH: number; contentH: number }>>({});
  const measurePage = (i: number, patch: { layoutH?: number; contentH?: number }) => {
    const prev = pageMetrics.current[i] ?? { layoutH: 0, contentH: 0 };
    const m = { ...prev, ...patch };
    pageMetrics.current[i] = m;
    if (!m.layoutH || !m.contentH) return;
    const scrollable = m.contentH > m.layoutH + EDGE_EPS;
    setPageScrollable(prev => (prev[i] === scrollable ? prev : { ...prev, [i]: scrollable }));
  };

  const deepPageScrollProps = (pageIndex: number) => ({
    scrollEnabled: pageScrollable[pageIndex] ?? true,
    onLayout: (e: LayoutChangeEvent) => measurePage(pageIndex, { layoutH: e.nativeEvent.layout.height }),
    onContentSizeChange: (_w: number, h: number) => measurePage(pageIndex, { contentH: h }),
    onScrollBeginDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      dragStart.current = edgeState(e);
    },
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const start = dragStart.current;
      dragStart.current = null;
      if (!start || !start.scrollable) return;           // short page — pager has it
      const end = edgeState(e);
      // Pushed against the bottom with nowhere to go → advance.
      if (start.bottom && end.bottom && pageIndex < PAGE_COUNT - 1) {
        pagerRef.current?.setPage(pageIndex + 1);
        return;
      }
      // Pushed against the top with nowhere to go → go back.
      if (start.top && end.top && pageIndex > 0) {
        pagerRef.current?.setPage(pageIndex - 1);
      }
    },
  });

  // Closing scene timing: hands move in, then 8 sparkles twinkle continuously
  // for ~4s (6 cycles × ~700ms each) before fading out. Closing text appears
  // in two phases: heading (0.7s) → 0.8s breathing pause → Continue button
  // (0.5s). The "In Jesus' name" middle line was removed per user (2026-05-22)
  // and its old 1.5s of timing (GAP_1 + T_JESUS + GAP_2) collapsed to 0.8s —
  // long enough for the heading to settle but tight enough that there isn't
  // dead air now that nothing fills the gap.
  const HAND_CLOSE = 700;
  const TWINKLE_HALF = 350;          // up-time = down-time of one twinkle pulse
  const TWINKLE_LOOPS = 6;            // 6 × 700ms ≈ 4.2s of twinkling
  const T_HEAD = 700;
  const GAP_AFTER_HEAD = 800;
  const T_BTN = 500;

  const handsOpacity = useSharedValue(0);
  const star1 = useSharedValue(0);
  const star2 = useSharedValue(0);
  const star3 = useSharedValue(0);
  const star4 = useSharedValue(0);
  const star5 = useSharedValue(0);
  const star6 = useSharedValue(0);
  const star7 = useSharedValue(0);
  const star8 = useSharedValue(0);
  const headingOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  // Music icon spin
  const musicSpin = useSharedValue(0);
  useEffect(() => {
    musicSpin.value = withRepeat(
      withTiming(360, { duration: 9000, easing: Easing.linear }),
      -1,
      false
    );
  }, [musicSpin]);
  const musicSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${musicSpin.value}deg` }],
  }));

  // NOTE: the per-page slide/fade entrance was removed. PagerView already does a
  // native page transition; layering a translateY+fade on the page CONTENT made
  // the incoming page's text sit 110px low / transparent mid-swipe — a visible
  // gap/tear in the middle and janky "double motion". The native pager slide is
  // the only transition now → smooth, no tear.

  useEffect(() => {
    if (!amened) return;
    // Single side-view praying-hand silhouette fades in from 0 → 1 opacity.
    handsOpacity.value = withTiming(1, { duration: HAND_CLOSE, easing: Easing.out(Easing.cubic) });

    // 8 sparkles: each does TWINKLE_LOOPS in/out cycles, then settles at
    // full opacity per user — sparkles must STAY visible after twinkling,
    // not fade away (was withTiming(0, …)).
    const twinkleSeq = () => withSequence(
      withRepeat(
        withSequence(
          withTiming(1, { duration: TWINKLE_HALF, easing: Easing.out(Easing.cubic) }),
          withTiming(0.35, { duration: TWINKLE_HALF, easing: Easing.in(Easing.cubic) }),
        ),
        TWINKLE_LOOPS,
        false,
      ),
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );
    const stars = [star1, star2, star3, star4, star5, star6, star7, star8];
    const offsets = [0, 90, 180, 60, 150, 240, 30, 210];
    stars.forEach((sv, i) => { sv.value = withDelay(HAND_CLOSE + offsets[i], twinkleSeq()); });

    // Phased fade-in: heading 0.7s → 0.8s breathing pause → button 0.5s.
    headingOpacity.value = withDelay(HAND_CLOSE,
      withTiming(1, { duration: T_HEAD, easing: Easing.out(Easing.cubic) }));
    buttonOpacity.value = withDelay(HAND_CLOSE + T_HEAD + GAP_AFTER_HEAD,
      withTiming(1, { duration: T_BTN, easing: Easing.out(Easing.cubic) }));

    // Lock in "this prayer is done" immediately so a force-close still counts.
    // Skipped entirely for a past-day replay — it must not mark TODAY's slot
    // complete or touch the streak.
    if (!isReplay) {
      markDone(kind);
      markToday();
    }

    // Enable the Continue button only once it's visible
    const btnTimer = setTimeout(
      () => setButtonReady(true),
      HAND_CLOSE + T_HEAD + GAP_AFTER_HEAD,
    );
    return () => clearTimeout(btnTimer);
  }, [amened]);

  const handsContainerStyle = useAnimatedStyle(() => ({ opacity: handsOpacity.value }));
  const star1Style = useAnimatedStyle(() => ({ opacity: star1.value, transform: [{ scale: 0.6 + star1.value * 0.5 }] }));
  const star2Style = useAnimatedStyle(() => ({ opacity: star2.value, transform: [{ scale: 0.6 + star2.value * 0.5 }] }));
  const star3Style = useAnimatedStyle(() => ({ opacity: star3.value, transform: [{ scale: 0.6 + star3.value * 0.5 }] }));
  const star4Style = useAnimatedStyle(() => ({ opacity: star4.value, transform: [{ scale: 0.6 + star4.value * 0.5 }] }));
  const star5Style = useAnimatedStyle(() => ({ opacity: star5.value, transform: [{ scale: 0.6 + star5.value * 0.5 }] }));
  const star6Style = useAnimatedStyle(() => ({ opacity: star6.value, transform: [{ scale: 0.6 + star6.value * 0.5 }] }));
  const star7Style = useAnimatedStyle(() => ({ opacity: star7.value, transform: [{ scale: 0.6 + star7.value * 0.5 }] }));
  const star8Style = useAnimatedStyle(() => ({ opacity: star8.value, transform: [{ scale: 0.6 + star8.value * 0.5 }] }));
  const headingStyle = useAnimatedStyle(() => ({ opacity: headingOpacity.value }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }));

  const handleAmen = () => {
    setAmened(true);
    setMusicOn(false);
    setListenOn(false);
    // Stop BOTH players SYNCHRONOUSLY, before the interstitial. The state→effect
    // pause chain only runs on the next render — too late: the ad would pop with
    // the bg music + narration still playing, and the post-ad foreground event
    // would resume them. endedRef blocks that resume; this hard-pauses now so
    // nothing bleeds into the ad / congrats / weekly / reminder screens.
    endedRef.current = true;
    try { audioPlayer.pause(); } catch {}
    try { readPlayer.pause(); } catch {}
    if (!isReplay) {
      // is_redo lets BigQuery separate first-of-day completions from same-day
      // redos (which still count an ad per product decision). markDone/streak
      // are unaffected — they key on calendar day, not session.
      logEvent('prayer_complete', { slot: morning ? 'morning' : 'evening', is_redo: isRedoRef.current });
      // Interstitial at this natural break — the congrats scene renders beneath
      // it, so closing the ad returns the user straight to it. Frequency-capped +
      // remove-ads-aware inside the service.
      maybeShowInterstitial('prayer_end');
    }
  };

  const closeFlow = () => navigation.goBack();

  // End of the prayer flow → return to the home screen. The rate prompt is no
  // longer shown here (it used to bleed the praying-hands scene behind it);
  // RatePromptHost now asks on the home screen instead.
  const finishFlow = () => navigation.goBack();

  const handleWeeklyOpenReminder = () => {
    // Keep the weekly/sapling celebration visible — the habit sheet overlays it.
    // (Previously this hid the weekly screen, which re-exposed the maroon Amen
    // screen underneath, so the sheet appeared to "jump back" a screen.)
    // Entrance rides habitDragY: start off-screen BEFORE showing (no
    // first-frame flash — see openNoteSheet), then slide up.
    habitDragY.value = height;
    habitBackdropO.value = 0;
    setShowSheet(true);
    habitDragY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    habitBackdropO.value = withTiming(1, { duration: 220 });
  };

  // Set the daily reminder to the chosen time + request permission, then close
  // the sheet back to the weekly screen.
  const handleHabitConfirm = async (hour: number, minute: number) => {
    // Arm the slot matching the prayer the user just finished (morning vs night).
    try { await enableReminderAt(morning ? 'morning' : 'night', hour, minute); } catch { /* API may throw on unsupported runtimes */ }
    handleSheetClose();
  };

  const handleWeeklyBack = () => {
    setShowWeekly(false);
    setTimeout(finishFlow, 200);
  };

  // "Start" on the Gospel & Psalms next card — dismiss the weekly screen and
  // open today's reader for the matching slot. replace() so the prayer flow
  // doesn't linger under the reader.
  const handleStartGospelPsalm = () => {
    setShowWeekly(false);
    navigation.replace('GospelPsalm', { slot: morning ? 'morning' : 'evening' });
  };

  const handleSheetClose = () => {
    // Return to the weekly/sapling screen (still mounted underneath) rather than
    // exiting the whole flow — the user reaches it FROM weekly and expects to
    // land back there, then leaves via that screen's own Back / Continue.
    setShowSheet(false);
    setShowTimePicker(false);
  };

  const closeNoteSheet = () => {
    Keyboard.dismiss();
    setNoteText('');
    setShowNoteSheet(false);
  };

  const saveNote = () => {
    Keyboard.dismiss();
    addNote(
      noteText,
      verseRef ? { ref: verseRef, text: verseText } : undefined,
      'reflection',
    );
    setNoteText('');
    setShowNoteSheet(false);
  };

  // Swipe-down gesture for note sheet. The SAME shared value drives the
  // ENTRANCE: it is set to `height` (off-screen) synchronously BEFORE the
  // visibility flag flips, so the sheet's first committed frame is already
  // below the viewport, then it slides up. This replaces the old layout
  // `entering={SlideInDown}` — on the new architecture that painted one frame
  // at the FINAL position before the animation started (user-reported flash:
  // sheet appears → vanishes → slides in). Same class of fix as CommentsSheet.
  const noteDragY = useSharedValue(0);
  const noteBackdropO = useSharedValue(0);
  const openNoteSheet = () => {
    noteDragY.value = height;
    noteBackdropO.value = 0;
    setShowNoteSheet(true);
    noteDragY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    noteBackdropO.value = withTiming(1, { duration: 220 });
  };
  const noteBackdropStyle = useAnimatedStyle(() => ({ opacity: noteBackdropO.value }));
  const notePan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) noteDragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        noteDragY.value = withTiming(800, { duration: 560 }, (f) => {
          if (f) runOnJS(closeNoteSheet)();
        });
      } else {
        noteDragY.value = withTiming(0, { duration: 480 });
      }
    });
  const noteSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: noteDragY.value }],
  }));

  // Swipe-down dismiss for the habit/time-picker sheet — same pan pattern as
  // the note sheet above (project convention: every bottom sheet must be
  // swipe-dismissible; backdrop tap + handle alone is a regression). A swipe
  // on the TIME PICKER steps back to the habit sheet (mirroring its explicit
  // close affordance); on the habit sheet it dismisses the whole overlay.
  const habitDragY = useSharedValue(0);
  const habitBackdropO = useSharedValue(0);
  const habitBackdropStyle = useAnimatedStyle(() => ({ opacity: habitBackdropO.value }));
  const habitSwipeClose = () => {
    habitDragY.value = 0;
    if (showTimePicker) setShowTimePicker(false);
    else handleSheetClose();
  };
  const habitPan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) habitDragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        habitDragY.value = withTiming(800, { duration: 560 }, (f) => {
          if (f) runOnJS(habitSwipeClose)();
        });
      } else {
        habitDragY.value = withTiming(0, { duration: 480 });
      }
    });
  const habitSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: habitDragY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Backdrop — today's prayer-bg photo (same image as the home verse
          card) with a dark gradient scrim on top so chrome + verse text
          stay legible. Falls back to the brand gradient when the manifest
          hasn't resolved (offline first-launch). */}
      {bgImage ? (
        <ImageBackground source={bgImage} style={StyleSheet.absoluteFillObject} resizeMode="cover">
          <LinearGradient
            colors={scrimColors}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
      ) : (
        <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFillObject} />
      )}

      {!amened && (
        <View style={[styles.topChrome, { top: insets.top + 8 }]}>
          <TouchableOpacity onPress={closeFlow} style={styles.chromeBtn}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          {/* Right-side control cluster: bg-music toggle + Listen narration.
              Grouped so the close X stays pinned left while these sit
              together on the right (topChrome is space-between). */}
          <View style={styles.chromeRight}>
            {/* Music icon doubles as the play/pause toggle for the daily
                background track. The slow rotate keeps running while audio
                plays; it stops when the user mutes. Disabled when no source
                has loaded yet (offline first run). */}
            <TouchableOpacity
              onPress={toggleMusic}
              style={[styles.chromeBtn, !audioSource && { opacity: 0.5 }]}
              disabled={!audioSource}
            >
              <Animated.View style={musicOn ? musicSpinStyle : undefined}>
                <Feather name={musicOn ? 'music' : 'volume-x'} size={21} color="#fff" />
              </Animated.View>
            </TouchableOpacity>
            {/* Listen / 导读 — TTS read-through of the 4 steps, separate from
                the bg-music control (they play simultaneously). Shown only
                when narration exists for the active language AND this verse
                (en/es/pt; per-verse upload holes hide it too).
                Disabled until today's audio has resolved. */}
            {listenOk && (
              <TouchableOpacity
                onPress={toggleListen}
                style={[styles.chromeBtn, styles.chromeBtnWhite, !readUris && { opacity: 0.5 }]}
                disabled={!readUris}
              >
                {/* White button → dark icon (slot tint). Idle shows a
                    "person reading aloud" glyph (per user); playing shows pause
                    so the user can stop the narration. */}
                {listenOn
                  ? <Feather name="pause" size={20} color={morning ? ROSE : LAV} />
                  : <ReaderGlyph size={22} color={morning ? ROSE : LAV} />}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {!amened && (
        <View style={styles.progressDots}>
          {SECTIONS.map((_, i) => (
            <PageDot key={i} isActive={i === page} isPast={i < page} />
          ))}
          <Text style={styles.pageCount}>{page + 1} / {SECTIONS.length}</Text>
        </View>
      )}

      {!amened && (
        <PagerView
          // Native VERTICAL pager. Replaces the old pagingEnabled ScrollView +
          // nested ScrollViews: react-native-pager-view does the inner-scroll ↔
          // page-swipe hand-off in NATIVE code, so deep pages (Reflection /
          // Practice / Closing Prayer) scroll to their end and then reliably
          // swipe to the next page on every device (Xiaomi / Redmi / Samsung
          // included) — the structural fix for "can't scroll to the next page".
          ref={pagerRef}
          orientation="vertical"
          initialPage={0}
          onPageSelected={onPageSelected}
          style={StyleSheet.absoluteFillObject}
        >
          <View key="verse" style={styles.pagerPageCenter}>
            <Animated.View style={styles.pageContent}>
              <Text style={styles.verseCaption}>{verseCaption}</Text>
              <Text style={styles.pageRef}>{verseRef}</Text>
              <NarratedBody
                player={readPlayer}
                text={verseText}
                timings={timingFor(0)}
                active={listenOn && listenStep === 0}
                style={styles.pageVerse}
                highlightStyle={spokenHl}
              />
              {/* Save / Notes / Share — mirrors the home verse-card affordances.
                  Lives inside the verse page so it scrolls away with the next
                  page (it shouldn't follow the user into Meditation / etc.). */}
              <View style={styles.verseActions}>
                <TouchableOpacity onPress={toggleVerseSaved} style={styles.verseActionBtn} activeOpacity={0.7} hitSlop={8}>
                  <Ionicons name={verseIsSaved ? 'heart' : 'heart-outline'} size={26} color="#FFFFFF" />
                  <Text style={styles.verseActionLabel}>{t(verseIsSaved ? 'prayerFlow.verse.saved' : 'prayerFlow.verse.save')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowVerseNote(true)} style={styles.verseActionBtn} activeOpacity={0.7} hitSlop={8}>
                  <Feather name="edit-2" size={24} color="#FFFFFF" />
                  <Text style={styles.verseActionLabel}>{t('prayerFlow.verse.notes')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowVerseShare(true)} style={styles.verseActionBtn} activeOpacity={0.7} hitSlop={8}>
                  <Feather name="share-2" size={24} color="#FFFFFF" />
                  <Text style={styles.verseActionLabel}>{t('prayerFlow.verse.share')}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>

          <View key="meditation" style={styles.pagerPage}>
            {/* Inner ScrollView for long reflections. nestedScrollEnabled keeps
                Android scrolling this content first; PagerView natively hands the
                swipe off to the next page once it reaches the bottom edge. */}
            <ScrollView
              ref={meditationScrollRef}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              // Android overscroll glow eats the boundary swipe, so the pager
              // only advanced after the ScrollView finished its stretch/settle
              // — that's the "needs 3 swipes to reach Today's Practice" bug.
              // "never" hands the edge gesture straight to PagerView in ONE
              // swipe (and lets short, non-scrolling pages advance instantly).
              overScrollMode="never"
              // iOS counterpart of overScrollMode="never": the rubber-band
              // bounce at the content edge also swallows the hand-off swipe, so
              // iOS needed multiple swipes too. bounces=false lets the edge
              // gesture pass straight to PagerView in one swipe.
              bounces={false}
              // Drives the page hand-off from JS — see the EDGE HAND-OFF note.
              {...deepPageScrollProps(1)}
              style={styles.pageScroll}
              contentContainerStyle={styles.pageScrollContent}
            >
              <Animated.View style={[styles.pageContent, styles.meditationContent, { paddingTop: insets.top + DEEP_PAGE_TOP }]}>
                <Text style={[styles.pageCaption, styles.deepPageCaption]}>{meditationCaption}</Text>
                {/* Per-paragraph render preserves the 36px paragraph spacing
                    (pageBody.marginBottom). Highlight stays correct because
                    each paragraph's text only contains its OWN sentences, so
                    buildSegments matches just those (others simply don't match
                    and are skipped). */}
                {meditationParas.map((p, i) => (
                  <NarratedBody
                    key={i}
                    player={readPlayer}
                    text={p}
                    timings={timingFor(1)}
                    active={listenOn && listenStep === 1}
                    // Reflection body matches the Closing Prayer body (Merriweather
                    // 18.3 / lh 29.7) per user — same serif voice across the
                    // Reflection / Practice / Prayer deep pages.
                    style={[styles.pageBody, styles.prayerBody]}
                    highlightStyle={spokenHl}
                  />
                ))}
              </Animated.View>
            </ScrollView>
          </View>

          <View key="action" style={styles.pagerPage}>
            <ScrollView
              ref={actionScrollRef}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              overScrollMode="never"   // see meditation page — one-swipe page hand-off
              bounces={false}          // iOS counterpart — see meditation page
              {...deepPageScrollProps(2)}
              style={styles.pageScroll}
              contentContainerStyle={styles.pageScrollContent}
            >
              <Animated.View style={[styles.pageContent, { paddingTop: insets.top + DEEP_PAGE_TOP }]}>
                <Text style={[styles.pageCaption, styles.deepPageCaption]}>{actionCaption}</Text>
                <NarratedBody
                  player={readPlayer}
                  text={actionBody}
                  timings={timingFor(2)}
                  active={listenOn && listenStep === 2}
                  // Today's/Tonight's Practice body matches the Closing Prayer
                  // body (Merriweather 18.3 / lh 29.7) per user.
                  style={[styles.pageBody, styles.prayerBody]}
                  highlightStyle={spokenHl}
                />
                <TouchableOpacity
                  style={styles.reflectBtn}
                  onPress={openNoteSheet}
                  activeOpacity={0.9}
                >
                  <Feather name="edit-2" size={18} color={morning ? ROSE : LAV} />
                  <Text style={[styles.reflectText, { color: morning ? ROSE : LAV }]}>{t('prayerFlow.writeReflection')}</Text>
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          </View>

          <View key="prayer" style={styles.pagerPage}>
            <ScrollView
              ref={prayerScrollRef}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              overScrollMode="never"   // see meditation page — one-swipe page hand-off
              bounces={false}          // iOS counterpart — see meditation page
              {...deepPageScrollProps(3)}
              style={styles.pageScroll}
              contentContainerStyle={styles.pageScrollContent}
            >
              <Animated.View style={[styles.pageContent, { paddingTop: insets.top + DEEP_PAGE_TOP, paddingBottom: insets.bottom + 100 }]}>
                <Text style={[styles.pageCaption, styles.deepPageCaption, styles.prayerCaption]}>{prayerCaption}</Text>
                <NarratedBody
                  player={readPlayer}
                  text={prayerBody}
                  timings={timingFor(3)}
                  active={listenOn && listenStep === 3}
                  style={[styles.pageBody, styles.prayerBody]}
                  highlightStyle={spokenHl}
                />
                {/* Amen sits at the END of the prayer content (per user): scroll
                    through the prayer, then the button with 100 px of breathing
                    room above (marginTop) and below (the page's paddingBottom). */}
                <TouchableOpacity onPress={handleAmen} style={styles.amenBtn} activeOpacity={0.9}>
                  <Text style={[styles.amenText, { color: morning ? ROSE : LAV }]}>{t('prayerFlow.amen')}</Text>
                </TouchableOpacity>
                <Text style={styles.prayedCount}>{t('prayerFlow.prayedCount', { count: formatThousands(prayedTodayCount()) })}</Text>
              </Animated.View>
            </ScrollView>
          </View>
        </PagerView>
      )}

      {/* Isolated narration auto-advance — subscribes to audio status here, not
          in the body, so a finished clip advances the page without re-rendering
          the whole flow each status tick. */}
      <NarrationAdvancer player={readPlayer} active={listenOn} onFinish={handleNarrationFinish} />

      {amened && !showWeekly && !showNotifRationale && (
        // Deep slot-tinted canvas per user — bright ROSE was too searing.
        // Morning → deep rose (#B8336B), evening → deep purple (#3D2A6F).
        <View style={[styles.amenScreen, { backgroundColor: morning ? '#B8336B' : '#3D2A6F' }]}>
          <TouchableOpacity onPress={closeFlow} style={[styles.chromeBtn, { position: 'absolute', top: insets.top + 8, left: 19 }]}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          {/* Confetti burst — plays once, in sync with the hands animation
              below, on both morning and evening flows. pointerEvents none so
              Continue stays tappable through the overlay. */}
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 2 }]} pointerEvents="none">
            <LottieView
              source={LOTTIE_CONFETTI}
              autoPlay
              loop={false}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
          <Animated.View style={[styles.amenHands, handsContainerStyle]}>
            <View style={styles.handsStage}>
              {/* Animated praying hands (was the static PrayingHand SVG). */}
              <LottieView
                source={LOTTIE_PRAYER_HANDS}
                autoPlay
                loop
                style={{ width: 200, height: 200 }}
              />
              <Animated.View style={[styles.starPos, { top: 4, left: 14 }, star1Style]}>
                <Sparkle size={22} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { top: -6, left: 70 }, star2Style]}>
                <Sparkle size={12} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { top: 6, right: 36 }, star3Style]}>
                <Sparkle size={16} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { top: -4, right: 4 }, star4Style]}>
                <Sparkle size={20} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { top: 70, left: 0 }, star5Style]}>
                <Sparkle size={14} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { top: 64, right: 0 }, star6Style]}>
                <Sparkle size={18} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { bottom: 6, left: 26 }, star7Style]}>
                <Sparkle size={14} />
              </Animated.View>
              <Animated.View style={[styles.starPos, { bottom: 12, right: 22 }, star8Style]}>
                <Sparkle size={12} />
              </Animated.View>
            </View>
          </Animated.View>
          <Animated.Text style={[styles.amenHeading, headingStyle]}>
            {t('prayerFlow.amenHeading')}
          </Animated.Text>
          <Animated.View
            style={[styles.amenContinueWrap, buttonStyle]}
            pointerEvents={buttonReady ? 'auto' : 'none'}
          >
            <TouchableOpacity
              onPress={() => {
                if (isRedoRef.current) {
                  navigation.goBack();
                } else if (isFirstEverRef.current && !permissionGranted) {
                  // First-ever prayer (any kind) AND notifications still OFF →
                  // show the one-time onboarding rationale. If permission is
                  // already granted we skip it entirely and go straight to the
                  // completion screen — never nag a user who already opted in.
                  setShowNotifRationale(true);
                } else {
                  // Morning OR evening completion → Weekly progress screen
                  // (morning shows the plant + a rotating morning headline;
                  // evening shows the streak fire). Per user.
                  setShowWeekly(true);
                }
              }}
              activeOpacity={0.85}
              style={styles.amenContinueBtn}
            >
              <Text style={[styles.amenContinueText, { color: morning ? ROSE : LAV }]}>
                {t('prayerFlow.continue')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {showWeekly && (
        <View style={StyleSheet.absoluteFillObject}>
          <WeeklyProgressView
            morning={morning}
            onOpenReminder={handleWeeklyOpenReminder}
            onBack={handleWeeklyBack}
            onStartGospelPsalm={handleStartGospelPsalm}
          />
        </View>
      )}

      {showNotifRationale && (
        <View style={StyleSheet.absoluteFillObject}>
          <NotifRationaleScreen
            onDismiss={() => {
              markNotifRationaleShown();
              // Continue INTO the weekly celebration (sapling/fire + the Gospel
              // & Psalm next card) — this used to goBack(), which silently
              // swallowed the whole completion screen on every first-ever
              // prayer with notifications off.
              setShowNotifRationale(false);
              setShowWeekly(true);
            }}
          />
        </View>
      )}

      {/* Share-verse sheet — opened from the action row under the verse on
          the first FlowPage. Receives the current prayer-bg image as the
          card backdrop so every preview / capture uses the live photo
          instead of the pink/lav gradient placeholder. */}
      <Modal
        visible={showVerseShare && !!verseRef && !!verseText}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setShowVerseShare(false)}
      >
        <ShareVerseSheet
          reference={verseRef}
          text={verseText}
          bgSource={bgImage}
          onClose={() => setShowVerseShare(false)}
        />
      </Modal>

      {/* Verse-note sheet — separate from the in-flow reflection sheet
          (`showNoteSheet` above) because it captures a thought tied to
          THIS specific verse, not the closing reflection. */}
      {showVerseNote && !!verseRef && !!verseText && (
        <VerseNoteSheet
          verseRef={verseRef}
          verseText={verseText}
          onClose={() => setShowVerseNote(false)}
        />
      )}

      {showNoteSheet && (
        // Keyboard-aware overlay (flex-end). paddingBottom = live keyboard
        // height lifts the sheet's bottom — and the Save button — above the
        // keyboard deterministically on every device; the noteSheet height is
        // also capped to the space above the keyboard (inline override below)
        // so the title never clips. Replaces KeyboardAvoidingView, whose
        // behavior="height" was flaky on Android.
        <View style={[styles.sheetOverlay, { paddingBottom: kbHeight }]}>
          <Animated.View
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }, noteBackdropStyle]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={closeNoteSheet}
            />
          </Animated.View>
          <GestureDetector gesture={notePan}>
            <Animated.View
              style={[styles.noteSheet, kbHeight > 0 ? { height: height - kbHeight - insets.top - 12 } : null, noteSheetAnimStyle]}
            >
              <View style={[styles.noteSheetInner, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
                <TouchableOpacity onPress={Keyboard.dismiss} activeOpacity={1} style={styles.noteHandleHit}>
                  <View style={styles.sheetHandle} />
                </TouchableOpacity>
                {/* Top header — Cancel | title | Save. Mirrors the verse Note
                    sheet so the actions sit ABOVE the keyboard and can never be
                    covered by it (the old bottom button row got hidden). */}
                <View style={styles.reflectHeader}>
                  <TouchableOpacity onPress={closeNoteSheet} hitSlop={10}>
                    <Text style={styles.reflectHeaderCancel}>{t('prayerFlow.note.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={styles.reflectHeaderTitle} numberOfLines={1}>{t('prayerFlow.note.title')}</Text>
                  <TouchableOpacity onPress={saveNote} hitSlop={10}>
                    <Text style={[styles.reflectHeaderSave, { color: morning ? ROSE : LAV }]}>{t('prayerFlow.note.save')}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder={t('prayerFlow.note.placeholder')}
                  placeholderTextColor={TXTSUB}
                  multiline
                  style={styles.noteInput}
                  autoFocus
                  textAlignVertical="top"
                />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showSheet && (
        <View style={styles.sheetOverlay}>
          <Animated.View
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }, habitBackdropStyle]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => !showTimePicker && handleSheetClose()}
            />
          </Animated.View>
          {/* Swipe-down dismissible (habitPan) per the every-sheet convention:
              a swipe on the habit sheet closes the overlay; on the time picker
              it steps back to the habit sheet (same as its explicit close). */}
          <GestureDetector gesture={habitPan}>
            <Animated.View
              style={habitSheetAnimStyle}
            >
              {!showTimePicker ? (
                <View style={[styles.sheet, styles.habitSheet]}>
                  <View style={styles.sheetHandle} />
                  <Text style={styles.sheetHeading}>{t('prayerFlow.habit.title')}</Text>
                  <Text style={styles.sheetDesc}>{t('prayerFlow.habit.desc')}</Text>
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(true)}
                    style={[styles.setTimeBtn, { backgroundColor: 'rgba(230,63,105,0.10)' }]}
                  >
                    <Text style={[styles.setTimeText, { color: ROSE }]}>{t('prayerFlow.habit.setTime')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSheetClose}>
                    <Text style={styles.notNowText}>{t('prayerFlow.habit.notNow')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TimePickerSheet slot={morning ? 'morning' : 'night'} onConfirm={handleHabitConfirm} onClose={() => setShowTimePicker(false)} />
              )}
            </Animated.View>
          </GestureDetector>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chromeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topChrome: {
    position: 'absolute',
    left: 19,
    right: 19,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chromeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White-fill variant for the Listen button — a soft shadow lifts it off
  // the photo so the light circle doesn't wash out against bright sky.
  chromeBtnWhite: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  // PagerView sizes each child to the page; pages just fill it. The verse page
  // centers its (non-scrolling) content; deep pages let their ScrollView fill.
  pagerPage: {
    flex: 1,
  },
  pagerPageCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  pageScroll: {
    flex: 1,
  },
  // flexGrow:1 makes short pages fill the viewport (so the top-offset title
  // sits where intended) while long pages grow past it and scroll. Pairs
  // with nestedScrollEnabled on the inner ScrollViews.
  pageScrollContent: {
    flexGrow: 1,
  },
  progressDots: {
    position: 'absolute',
    right: 24,
    bottom: 37,
    zIndex: 10,
    alignItems: 'center',
    gap: 9,
  },
  // Base shape for every page indicator. Height + backgroundColor are driven
  // by the animated style inside <PageDot> — 9 px circle when inactive, ~35 px
  // pill when active. borderRadius = w/2 keeps the pill ends rounded at any
  // height, so the shape interpolates cleanly between circle and capsule.
  dot: {
    width: 9,
    borderRadius: 4.5,
  },
  pageCount: {
    marginTop: 12,
    fontSize: 10.5,
    letterSpacing: 1.4,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  pageContent: {
    paddingHorizontal: 28,
    paddingTop: 0,                                                              // 135 → 105 → 75 → 40 → 10 → 0 per user — verse block flush with the top chrome
    paddingBottom: 115,
    justifyContent: 'center',
  },
  // (deepPageOffset / actionPagePad removed — deep-page top spacing is now the
  //  adaptive inline `insets.top + DEEP_PAGE_TOP`, applied per page.)
  // Merriweather serif body shared by the three deep pages — Reflection,
  // Today's/Tonight's Practice, AND Closing Prayer — per user, so all read in
  // the same warm serif voice as the Bible reader's body copy. (Was Closing
  // Prayer only; Reflection + Practice were Lato before this change.)
  prayerBody: {
    fontFamily: FONTS.merriweather,
    fontSize: 18.3,
    lineHeight: 29.7,
  },
  // Closing Prayer title only — Lora bold per user (other two deep pages
  // stay on Lato). Weight 600 sits just under the Lora_700Bold cut so
  // Android keeps the custom face instead of falling back to system sans.
  prayerCaption: {
    // Font intentionally NOT overridden — inherits pageCaption's Lato bold so
    // "Closing Prayer" matches the Reflection / Today's Practice titles (the
    // old loraBold override made this one title look different — user bug).
  },
  meditationContent: {
    paddingBottom: 200,                                                         // 280 → 200 per user (96 was too short)
  },
  // Closing Prayer page — extra bottom room so the long prayer text, the
  // Amen button, and the prayed-count line all clear the bottom edge + the
  // page-dot cluster when scrolled to the end.
  pageCaption: {
    fontSize: 28.6,                                                             // 15 → 19.5 → 20.48 → 24 → 26 → 28.6 (+10 % per user)
    // letterSpacing + textTransform removed — captions are now title-case per
    // user ("Reflection" / "Today's Practice" / "Closing Prayer"), and the
    // wide tracking only made sense paired with the all-caps look.
    color: '#FFFFFF',                                                           // pure white per user (deep pages now sit on the photo bg, not the pink canvas)
    fontFamily: FONTS.latoBold,                                                 // Reflection / Action / Prayer titles unified to Lato per user (was loraBold)
    fontWeight: '600',
    marginBottom: 9,
  },
  // Extra breathing room below the caption on Reflection / Tonight's Practice
  // / Closing pages — gives the title some space before the body copy.
  deepPageCaption: {
    marginBottom: 29,                                                           // +20 from 9
  },
  // ─── Verse page typography — mirrors PrayerScreen's hero-card text styles
  // (heroLabel / heroRef / heroText) so the verse flow reads as a continuation
  // of the card the user just tapped. All sizes scaled +15 % per user; the
  // label↔ref and ref↔body spacings are also taken from the card (heroLabel
  // marginBottom = 4 → 4.6; heroBody paddingTop = 24 → 27.6) so the rhythm
  // matches too. Stays a separate style from `pageCaption` so the deep pages
  // (meditation / action / prayer) keep their existing uppercase + tracked
  // section-header look.
  verseCaption: {
    fontSize: 18.4,                                                             // 16.0 → 18.4 (+15 % per user)
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 7.68,                                                         // 9.6 → 7.68 (-20 % per user) — tighter caption ↔ ref pairing
    fontFamily: FONTS.lato, letterSpacing: 0.4,
  },
  pageRef: {
    fontSize: 23.38,                                                            // heroRef 20.33 × 1.15
    fontWeight: '700',                                                          // matches heroRef
    color: '#fff',                                                              // matches heroRef
    letterSpacing: 0.3,                                                         // matches heroRef
    marginBottom: 27.6,                                                         // card heroBody.paddingTop 24 × 1.15
  },
  pageVerse: {
    fontFamily: FONTS.merriweather,                                             // matches heroText
    fontSize: 23.09,                                                            // 20.99 → 23.09 (+10 % per user)
    lineHeight: 37.58,                                                          // 34.16 → 37.58 (+10 % proportional, keeps the verse's line rhythm)
    color: 'rgba(255,255,255,0.96)',                                            // matches heroText
  },
  // Save / Notes / Share row under the verse, mirroring the home-screen
  // verse-card affordances. White icons + labels because the verse page
  // sits on the photo bg (with a dark scrim underneath, so white reads).
  verseActions: {
    flexDirection: 'row',
    gap: 36,
    marginTop: 58,                                                              // 28 → 58 (+30) per user — more breathing room between the verse copy and the Save / Notes / Share row
    alignItems: 'center',
  },
  verseActionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  verseActionLabel: {
    fontSize: 14.04,
    color: '#FFFFFF',
    fontFamily: FONTS.lato,
    letterSpacing: 0.2,
  },
  pageBody: {
    fontSize: 19,                                                               // per user
    lineHeight: 30,                                                             // per user
    color: '#FFFFFF',                                                           // pure white per user — deep pages back on the photo bg
    marginBottom: 36,                                                           // 18 → 36 (doubled per user) — more breathing room between meditation / action / prayer paragraphs
    fontFamily: FONTS.lato, letterSpacing: 0.4,                                                     // Reflection / Action / Prayer body unified to Lato per user (was Merriweather)
  },
  // Highlight applied to the sentence currently being narrated (Listen mode).
  // Soft translucent-white pill over the photo bg + full-opacity text so the
  // spoken line lifts off the dimmed-white body without recoloring it.
  spokenLine: {
    // Base for the currently-spoken sentence — text stays white; the tint
    // (morning ROSE / evening LAV, per user — the old dark pill read muddy)
    // is applied inline via `spokenHl` in the component.
    color: '#FFFFFF',
  },
  // Mirrors PrayerScreen's `startBtn` for height/radius/text — but stays
  // content-hugging (alignSelf 'flex-start') per user, not stretched to the
  // full column. The pencil icon + label color are set inline by the
  // consumer (ROSE for morning, LAV for evening) — per user the button is
  // now white-on-tinted-text instead of tinted-on-white.
  reflectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    height: 46.59,                                                              // 51.77 → 46.59 (-10 % per user)
    borderRadius: 14.63,                                                        // 24.39 → 14.63 (-40 % per user; now a rounded rect, no longer a full capsule)
    paddingHorizontal: 22,                                                      // breathing room around the icon + label since the pill no longer stretches
    marginTop: 62,                                                              // section spacing kept
    backgroundColor: '#FFFFFF',
  },
  reflectText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    // color set inline (morning → ROSE / evening → LAV)
  },
  // Closing AMEN button. Mirrors startBtn for radius / stretch / text
  // weight / tracking, with -10 % height per user. Per user now: white
  // background with the slot's accent color (ROSE morning / LAV evening)
  // for the label — set inline by the consumer.
  amenBtn: {
    alignSelf: 'stretch',
    height: 46.27,                                                              // 48.71 → 46.27 (-5 % per user)
    borderRadius: 14.63,                                                        // 24.39 → 14.63 (-40 % per user; rounded rect, no longer a full capsule)
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,                                                             // 100 → 50 (段前距离减半 per user)
    backgroundColor: '#FFFFFF',
  },
  amenText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    // color set inline (morning → ROSE / evening → LAV)
  },
  amenContinueWrap: {
    marginTop: 36,
    alignItems: 'center',
  },
  amenContinueBtn: {
    // Aligned to PrayerScreen.startBtn per user — same height + radius as the
    // primary CTA on the home screen so the action feels familiar.
    paddingHorizontal: 44,                                                       // kept so the button hugs the "Continue" label with breathing room (parent centers it; no alignSelf:'stretch')
    height: 49.41,
    borderRadius: 17.07,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  amenContinueText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  prayedCount: {
    fontSize: 13.38,                                                            // 12.5 → 13.38 (+7 % per user)
    color: 'rgba(255,255,255,0.55)',                                             // white @ 55 % — deep pages back on the photo bg
    textAlign: 'center',
    marginTop: 11,                                                              // 16 → 11 (-5 px per user) — closer to the AMEN button above
    fontFamily: FONTS.lato, letterSpacing: 0.4,                                                     // switched to Lato per user
  },
  amenScreen: {
    flex: 1,
    // backgroundColor supplied inline (morning → deep rose, evening → deep purple)
    paddingHorizontal: 30,
    paddingTop: 115,
    paddingBottom: 230,
    justifyContent: 'flex-end',
  },
  amenHands: {
    alignItems: 'center',
    marginBottom: 37,
  },
  handsStage: {
    width: 280,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starPos: {
    position: 'absolute',
  },
  amenHeading: {
    fontSize: 22.1,                                                             // 26 → 22.1 (-15 % per user)
    fontWeight: '600',                                                          // project rule: loraBold + 600 (700 → Android system sans)
    color: '#fff',
    lineHeight: 26.3,                                                           // 31 → 26.3 (proportional to fontSize change, ~1.19× ratio preserved)
    marginBottom: 28,
    marginHorizontal: 30,                                                       // +30 px each side per user — narrows the line so it doesn't crowd the edges
    textAlign: 'center',
    fontFamily: FONTS.loraBold,                                                 // Lora per user
  },
  // `amenFarewell` style removed — the "In Jesus' name" line it backed was
  // dropped 2026-05-22 per user. Don't restore without auditing the closing-
  // scene timing (`GAP_AFTER_HEAD` collapsed the old GAP_1/T_JESUS/GAP_2).
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 26,
    paddingBottom: 46,
  },
  habitSheet: {
    paddingTop: 75,
    paddingBottom: 105,
  },
  sheetHandle: {
    width: 49,                                                                  // 39 → 49 (+10 px per user)
    height: 4.5,                                                                // 5 → 4.5 (-10 % per user)
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignSelf: 'center',
    marginTop: -7,                                                              // sits 7 px closer to sheet top per user
    marginBottom: 25,
  },
  sheetHeading: {
    textAlign: 'center',
    fontSize: 21,
    fontWeight: '700',
    color: TXT,
    marginBottom: 12,
  },
  sheetDesc: {
    textAlign: 'center',
    fontSize: 17,
    color: TXTSUB,
    lineHeight: 25,
    marginBottom: 25,
    paddingHorizontal: 13,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TXT,
    marginBottom: 21,
  },
  noteSheet: {
    height: '92%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  noteSheetInner: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 6,
    // paddingBottom is set inline via insets so it adapts per device.
  },
  noteHandleHit: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  noteSheetTitle: {
    fontSize: 22,
    fontWeight: '600',                                                           // Lora_700Bold paired with weight 600 (project rule — 700 makes Android fall back to system bold sans)
    color: TXT,
    marginTop: -15,                                                              // -15 px gap to the drag handle above per user
    marginBottom: 21,
    fontFamily: FONTS.loraBold,
  },
  // Reflection sheet top header — Cancel | title | Save. Matches VerseNoteSheet
  // (the "Note" sheet) so the two sheets read identically and the actions stay
  // above the keyboard.
  reflectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -8,
    marginBottom: 18,
  },
  reflectHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 19,
    fontWeight: '600',
    color: TXT,
    fontFamily: FONTS.loraBold,
  },
  reflectHeaderCancel: { fontSize: 17, color: TXTSUB, fontWeight: '500' },
  reflectHeaderSave:   { fontSize: 17, fontWeight: '700' },                      // color set inline (morning → ROSE / evening → LAV)
  noteInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
    color: TXT,
    backgroundColor: 'rgba(30,27,46,0.04)',
    borderRadius: 14,
    padding: 16,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  setTimeBtn: {
    alignSelf: 'center',
    paddingHorizontal: 41,
    paddingVertical: 15,
    borderRadius: 26,
    marginBottom: 16,
  },
  setTimeText: { fontSize: 18, fontWeight: '600' },
  notNowText: {
    textAlign: 'center',
    color: TXTSUB,
    fontSize: 17,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginBottom: 14,
  },
  wheelItemBox: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelHighlight: {
    position: 'absolute',
    top: 88,
    left: 0,
    right: 0,
    height: 44,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(30,27,46,0.10)',
    zIndex: 1,
  },
  wheelText: { fontSize: 17 },
  wheelActive: {
    fontSize: 21,
    fontWeight: '700',
    color: TXT,
  },
  wheelInactive: {
    color: 'rgba(30,27,46,0.30)',
  },
  wheelColon: {
    fontSize: 22,
    fontWeight: '700',
    color: TXT,
  },
  sheetBtns: {
    flexDirection: 'row',
    gap: 11,
    marginTop: 25,
  },
  sheetBtnBack: {
    flex: 1,
    paddingVertical: 15,
    backgroundColor: 'rgba(30,27,46,0.05)',
    borderRadius: 24,
    alignItems: 'center',
  },
  sheetBtnConfirm: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
  },
  sheetBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  reflectionBtnText: { fontSize: 17 },
  // Localized to the Write-a-reflection sheet only — shared sheetBtnBack /
  // sheetBtnConfirm have paddingVertical 15 across other sheets; we shrink
  // by 10 % here per user without affecting the time-picker sheet.
  reflectionBtn: { paddingVertical: 13.5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// NotifRationale — one-time post-Amen onboarding moment for first-prayer users.
// White-pink palette matching the app shell (NOT the dark hero gradient of the
// onboarding cover). Layout mirrors the Gentler Streak reference: heading
// top-left, body paragraph below, a phone mockup centered, two buttons row at
// the bottom (Skip / Allow notifications).
// ─────────────────────────────────────────────────────────────────────────────

function NotifRationaleScreen({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { requestPermissionAndEnableDefaults } = useNotifications();

  const requestPermission = async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && !perm.canAskAgain && Platform.OS !== 'web') {
        // Permanently denied BEFORE this tap — the OS can't show the dialog
        // anymore, so Settings is the only way "Allow" can work.
        Linking.openSettings().catch(() => {});
      } else {
        // Fresh ask (or already granted): fire the REAL OS permission dialog
        // AND, on grant, turn on + schedule the default morning/evening
        // reminders — so tapping Allow actually produces reminders, not just a
        // granted permission with nothing scheduled. (On a "Don't allow" this
        // returns false and we simply dismiss — no teleport to Settings.)
        await requestPermissionAndEnableDefaults();
      }
    } catch {
      // Notifications API can throw on some sims/unsupported runtimes.
    } finally {
      onDismiss();
    }
  };

  return (
    <View style={[rationaleStyles.root, { paddingTop: insets.top + 28 }]}>
      <Animated.View entering={FadeIn.duration(360)}>
        <Text style={rationaleStyles.heading}>{t('prayerFlow.notif.heading')}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(360).delay(200)}>
        <Text style={rationaleStyles.body}>
          {t('prayerFlow.notif.body')}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(360).delay(400)} style={rationaleStyles.mockupWrap}>
        <PhoneMockup />
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(360).delay(700)}
        style={[rationaleStyles.ctaRow, { paddingBottom: Math.max(insets.bottom, 12) + 48 }]}
      >
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.85} style={rationaleStyles.skipBtn}>
          <Text style={rationaleStyles.skipText}>{t('prayerFlow.notif.skip')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={requestPermission} activeOpacity={0.9} style={rationaleStyles.allowBtn}>
          <Text style={rationaleStyles.allowText}>{t('prayerFlow.notif.allow')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Tilted phone mockup with a HerBible push notification + faux home-screen
// grid. ~280×360 viewBox; everything tinted with the rose palette so it
// reads as a HerBible screenshot, not a generic phone.
function PhoneMockup() {
  // Rounded-rect path helper. Everything is centered on cx=122 (viewBox is
  // 244 wide → center 122) so the phone never looks cut off on one side.
  const rr = (x: number, y: number, w: number, h: number, r: number) =>
    `M${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} L${x + r} ${y + h} Q${x} ${y + h} ${x} ${y + h - r} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} Z`;
  // Device-adaptive size, then ×1.5 (+50 % W & H per user — the mockup read too
  // small). The visible phone is only ~57 % of MOCK_W (the 244-wide viewBox has
  // big transparent side margins), and mockupWrap is flex:1 / centered with no
  // clipping, so the larger box overflows only into empty space. viewBox stays
  // 244×168 so every path scales proportionally and MOCK_H tracks MOCK_W.
  const MOCK_W = Math.round(Math.min(width * 0.76, 305) * 1.5);
  const MOCK_H = Math.round((MOCK_W * 168) / 244);
  return (
    <Svg width={MOCK_W} height={MOCK_H} viewBox="0 0 244 168">
      {/* Only the TOP of the phone is shown — the home screen is intentionally
          out of frame. Top corners rounded; the frame runs straight off the
          bottom edge so it reads as "the top of a phone" carrying one
          notification. No icon grid (it confused the message). */}
      <Path
        d="M52 40 Q52 16 76 16 L168 16 Q192 16 192 40 L192 168 L52 168 Z"
        fill="#FFFFFF" stroke="#ECE0EC" strokeWidth={1.5}
      />
      {/* Soft screen tint */}
      <Path d="M58 44 L186 44 L186 168 L58 168 Z" fill="rgba(249,168,201,0.13)" />
      {/* Notch */}
      <Path d={rr(108, 27, 28, 7, 3.5)} fill="rgba(30,27,46,0.16)" />

      {/* Motion hint — a soft rose chevron: the banner just slid down from the top. */}
      <Path d="M113 52 L122 60 L131 52" fill="none" stroke="rgba(230,63,105,0.45)"
            strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />

      {/* The notification banner — the single thing this illustration is about. */}
      <Path d={rr(64, 74, 116, 50, 13)} fill="rgba(230,63,105,0.10)" />{/* lift shadow */}
      <Path d={rr(64, 71, 116, 50, 13)} fill="#FFFFFF" stroke="rgba(30,27,46,0.05)" strokeWidth={1} />
      {/* app icon */}
      <Path d={rr(75, 82, 26, 26, 7)} fill={ROSE} />
      {/* title + two faux text lines */}
      <Path d={rr(110, 84, 56, 7, 3.5)} fill="rgba(30,27,46,0.55)" />
      <Path d={rr(110, 98, 60, 6, 3)} fill="rgba(30,27,46,0.16)" />
      <Path d={rr(110, 109, 38, 6, 3)} fill="rgba(30,27,46,0.16)" />
    </Svg>
  );
}

const rationaleStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FBF7F6',
    paddingHorizontal: 24,
  },
  heading: {
    fontSize: 32,
    fontFamily: FONTS.loraBold,                                                  // Lora bold per user; weight 600 per project rule (700 + loraBold falls back to system sans on Android)
    fontWeight: '600',
    color: TXT,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  body: {
    fontSize: 17.6,                                                             // 16 × 1.1 (+10 % per user)
    lineHeight: 26.4,                                                           // 24 × 1.1 to keep rhythm
    color: TXTSUB,
    marginBottom: 20,
  },
  mockupWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 6,
  },
  // Both CTAs share PrayerScreen.startBtn's height (49.41) + radius (17.07)
  // per user — keeps the primary-action "feel" identical across the app.
  // Flex ratio (1 : 2) makes Allow visually dominant as the recommended path.
  skipBtn: {
    flex: 1,
    height: 49.41,
    borderRadius: 17.07,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.08)',
  },
  skipText: { fontSize: 16, fontWeight: '700', color: TXT, letterSpacing: 0.3 },
  allowBtn: {
    flex: 2,
    height: 49.41,
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ROSE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  allowText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
});
