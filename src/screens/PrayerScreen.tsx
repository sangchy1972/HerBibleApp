import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent, Dimensions, Modal, TextInput, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withRepeat, withDelay, withSequence,
  interpolateColor, runOnJS, Easing, FadeIn, FadeOut,
} from 'react-native-reanimated';

// AnimatedTextInput is the standard pattern for streaming a worklet-driven
// number into a Text-like component without a JS re-render per frame.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
import Glass from '../components/shared/Glass';
import DayCircle from '../components/shared/DayCircle';
import FireFlame from '../components/shared/FireFlame';
import StreakBorderAnim from '../components/shared/StreakBorderAnim';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS, SERIF_BODY } from '../constants/theme';
import { DAYS, PSALMS_CARDS } from '../constants/data';
import { useAuth } from '../state/AuthContext';
import { usePrayer } from '../state/PrayerContext';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useActivity } from '../state/ActivityContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import { dailyLabels } from '../constants/dailyVersesLabels';
import { localizeBookName, englishBookName, chaptersInBook } from '../constants/bibleBookNames';
import { parseReference, localizeReference } from '../services/parseReference';
import ShareVerseSheet from '../components/ShareVerseSheet';
import type { TabScreenProps } from '../navigation/types';

const NOTO_REG = 'NotoSansSC_400Regular';
const NOTO_MED = 'NotoSansSC_500Medium';
const NOTO_BOLD = 'NotoSansSC_700Bold';

function HeartIcon({ filled, color }: { filled?: boolean; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.7}>
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function CommentIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={color} stroke="none">
      <Circle cx={5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={19} cy={12} r={1.6} />
    </Svg>
  );
}

// Compact bottom-sheet menu fired by the verse card's More button. Keeps a
// single entry today ("See past days") but is shaped so we can add archival /
// copy-link / report actions later without restructuring.
// Floating menu anchored to the More button. The button passes its measured
// window-space rect on tap; we position the popover so its right edge sits at
// the More button's left edge and its bottom rises just above the action row,
// so the menu visually unfolds out the left side of More.
interface MoreAnchor { x: number; y: number; w: number; h: number }
function MoreMenu({ anchor, onClose, onSeePastDays, onReadFullChapter }: {
  anchor: MoreAnchor;
  onClose: () => void;
  onSeePastDays: () => void;
  onReadFullChapter: () => void;
}) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  return (
    <View style={moreStyles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        style={[
          moreStyles.popover,
          {
            right: Math.max(8, screenW - anchor.x),
            bottom: Math.max(8, screenH - anchor.y + 6),
          },
        ]}
      >
        <TouchableOpacity onPress={onReadFullChapter} activeOpacity={0.85} style={moreStyles.row}>
          <Feather name="book-open" size={18} color={TXT} />
          <Text style={moreStyles.rowText}>Read full chapter</Text>
        </TouchableOpacity>
        <View style={moreStyles.rowDivider} />
        <TouchableOpacity onPress={onSeePastDays} activeOpacity={0.85} style={moreStyles.row}>
          <Feather name="calendar" size={18} color={TXT} />
          <Text style={moreStyles.rowText}>See past days</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const moreStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  popover: {
    position: 'absolute',
    minWidth: 208,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowText: { fontSize: 15, color: TXT, fontWeight: '600' },
  rowDivider: { height: 1, marginHorizontal: 14, backgroundColor: 'rgba(30,27,46,0.06)' },
});

// Deterministic per-day pseudo-random count: stable within a calendar day,
// varies day to day. `salt` lets us emit different streams (likes vs comments
// vs morning vs evening) from the same date.
function dailyCount(salt: number, min: number, range: number): number {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + salt * 137;
  return min + Math.floor(Math.abs(Math.sin(seed)) * range);
}

function formatLikes(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

// Countdown formatter — never returns "0m" so the wait-state button always
// has a sensible label until the window opens.
function formatCountdown(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function VerseHeroCard({ morning, canStart, canReplay, readyToSwitch, onSwitchTab, waitLabel, waitHint, onBegin, onOpenRef, onShare, onMore, cardLabel, verseRef, verseText }: {
  morning: boolean;
  canStart: boolean;        // active slot in window + not yet done
  canReplay: boolean;       // slot already done — tapping the card re-enters as redo
  readyToSwitch: boolean;   // morning done + evening already open → tap = flip tab
  onSwitchTab: () => void;
  waitLabel: string;        // copy for the gray wait-state button (countdown)
  waitHint: string;         // pop-up text shown on tapping the gray button
  onBegin: () => void;
  onOpenRef: () => void;
  onShare: () => void;
  onMore: (anchor: { x: number; y: number; w: number; h: number }) => void;
  cardLabel: string;
  verseRef: string;
  verseText: string;
}) {
  const moreBtnRef = React.useRef<View>(null);
  const handleMorePress = () => {
    moreBtnRef.current?.measureInWindow((x, y, w, h) => onMore({ x, y, w, h }));
  };
  const [liked, setLiked] = React.useState(false);
  const colors = morning
    ? (['#C2547A', '#7B2255', '#2D0A1A'] as const)
    : (['#5B3A9E', '#2D1660', '#100525'] as const);
  const iconColor = 'rgba(255,255,255,0.80)';

  // Per-day social proof. Likes 1001 – 5000, comments 36 – 135. Different
  // salts for morning/evening so the two tabs don't show identical counts.
  const likes = dailyCount(morning ? 1 : 2, 1001, 4000);
  const comments = dailyCount(morning ? 3 : 4, 36, 100);

  // Breathing pulse on the Start CTA — only while the slot is live. Once the
  // user taps Amen and returns here, the button switches to a quiet "done"
  // state and the pulse stops.
  // Pulse 0.9 ↔ 1.0 (10 % inward breath) at 1300 ms each direction. Pulses
  // inward from rest size rather than overshooting past it, so the button
  // never grows beyond its natural footprint.
  // Pulse runs in two cases: the slot is open ("Start XXX Prayer →") OR the
  // user is ready to flip from a finished morning to evening.
  const pulseActive = canStart || readyToSwitch;
  const pulse = useSharedValue(0.9);
  useEffect(() => {
    if (!pulseActive) { pulse.value = 1; return; }
    pulse.value = 0.9;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, pulseActive]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Tapping anywhere in the wait state (gray button OR the verse area when
  // the flow is locked) pops a friendly hint that auto-fades after ~3 s.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  const popHint = () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(waitHint);
    hintTimer.current = setTimeout(() => setHint(null), 3200);
  };
  // Card tap routing:
  //   • canStart → start the flow normally
  //   • readyToSwitch → flip to the evening tab
  //   • canReplay → re-enter the (already-done) flow so the user can read
  //     meditation / prayer / closing again. PrayerFlow detects the redo
  //     via its isRedoRef and skips the celebration screens after Amen.
  //   • otherwise → pop the friendly hint
  const onCardPress = canStart ? onBegin
    : readyToSwitch ? onSwitchTab
    : canReplay ? onBegin
    : popHint;

  return (
    <View>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.heroCard}>
        <TouchableOpacity onPress={onCardPress} activeOpacity={0.85}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>{cardLabel}</Text>
            {/* Reference is its own tap target — jumps the reader to the
                exact verse range. RN's responder system gives the inner
                touchable priority for hits inside its bounds, so the
                outer card press still fires for taps elsewhere. */}
            <TouchableOpacity
              onPress={onOpenRef}
              activeOpacity={0.7}
              hitSlop={8}
              style={styles.heroRefBtn}
            >
              <Text style={styles.heroRef}>{verseRef}</Text>
              <Feather
                name="chevron-right"
                size={18}
                color="rgba(255,255,255,0.70)"
                style={styles.heroRefChev}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroText}>{verseText}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setLiked(l => !l)}>
            <HeartIcon filled={liked} color={liked ? '#FFB3CC' : iconColor} />
            <Text style={[styles.actionLabel, { color: liked ? '#FFB3CC' : iconColor }]}>{formatLikes(likes + (liked ? 1 : 0))}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <CommentIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>{comments}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onShare}>
            <ShareIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity ref={moreBtnRef} style={styles.actionBtn} onPress={handleMorePress}>
            <MoreIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>More</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {canStart ? (
        <Animated.View style={pulseStyle}>
          <TouchableOpacity
            onPress={onBegin}
            activeOpacity={0.9}
            style={[styles.startBtn, { backgroundColor: morning ? ROSE : LAV }]}
          >
            <Text style={styles.startBtnText}>
              {morning ? 'Start Morning Prayer →' : 'Start Night Prayer →'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : readyToSwitch ? (
        // Morning is done and night has opened — same active styling as the
        // Start CTA (LAV to telegraph "evening"), tinted toward the
        // destination tab. Tap flips to evening rather than popping a hint.
        <Animated.View style={pulseStyle}>
          <TouchableOpacity
            onPress={onSwitchTab}
            activeOpacity={0.9}
            style={[styles.startBtn, { backgroundColor: LAV }]}
          >
            <Text style={styles.startBtnText}>{waitLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        // Wait state — slot is either before its window or already done.
        // Tinted with the active accent at low opacity so it still reads as
        // "this is your prayer button, just not active right now". Tap pops
        // the hint that explains when it'll open.
        <TouchableOpacity onPress={popHint} activeOpacity={0.85} style={[styles.waitBtn, { backgroundColor: `${morning ? ROSE : LAV}1F` }]}>
          <Text style={[styles.waitBtnText, { color: morning ? ROSE : LAV }]}>{waitLabel}</Text>
        </TouchableOpacity>
      )}

      {hint && (
        <Animated.View
          key={hint}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(180)}
          style={styles.hintWrap}
        >
          <Text style={styles.hintText}>{hint}</Text>
        </Animated.View>
      )}
    </View>
  );
}

export default function PrayerScreen({ navigation }: TabScreenProps<'prayer'>) {
  const insets = useSafeAreaInsets();
  // The header chip and the StreakScreen it routes to must show the same
  // metric. StreakScreen displays `totalComplete` (lifetime count of days
  // where BOTH prayers were finished) under the "DAY STREAK" label, so the
  // header has to read from the same source. Using `currentStreak` (the
  // active consecutive run) here was the cause of "header shows 0, tap
  // shows 4" — the user has 4 lifetime complete days but no active streak.
  const { morning, setMorning, mDone, eDone, wasCompleteOn, totalComplete } = usePrayer();
  const { markToday } = useActivity();
  const { current: translation } = useTranslation();
  // Same source of truth as ProfileScreen: header avatar must mirror the
  // Profile tab's avatar exactly. Logged in → first initial; logged out → "H".
  const { user } = useAuth();
  const initials = user?.name?.trim().slice(0, 1).toUpperCase() || 'H';
  const { getVerse, todayDay } = useDailyVerses();
  const { read: readChapterSet, viewed: viewedChapterSet } = useReadChapters();
  // Share + More overlays live at the screen root so their absolute-fill
  // overlays are sized to the screen, not to the verse-card section. Render-
  // ing them inside VerseHeroCard sized them to the card and the share sheet
  // ended up anchored a few hundred px above the bottom edge.
  const [showShare, setShowShare] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<MoreAnchor | null>(null);
  const labels = dailyLabels(translation.code);
  const segment: 'morning' | 'evening' = morning ? 'morning' : 'evening';
  // Daily verse for the active segment. Bundled fallback guarantees a value
  // for the first 3 days even with no network.
  const dailyVerse = getVerse(todayDay, segment);
  // Continue Reading reflects the chapter the user has actually been READING,
  // not just any chapter they navigated to. Source = `bible:reading-position`,
  // which BibleScreen only writes once the user has dwelt on a chapter for
  // ≥ 60 s in foreground (and not as a verse-card focus peek). Drawer / search
  // / prev-next / bookmark jumps do NOT update this — they only update the
  // separate `bible:last-read` that BibleScreen uses to rehydrate on refocus.
  // Default = Genesis 1 for fresh installs / users who haven't dwelt yet.
  const [lastRead, setLastRead] = useState<{ bookSlug: string; chapter: number }>({ bookSlug: 'genesis', chapter: 1 });
  useFocusEffect(
    React.useCallback(() => {
      AsyncStorage.getItem('bible:reading-position').then(raw => {
        if (!raw) return;
        try {
          const v = JSON.parse(raw);
          if (v && typeof v.bookSlug === 'string' && typeof v.chapter === 'number') {
            setLastRead({ bookSlug: v.bookSlug, chapter: v.chapter });
          }
        } catch {}
      });
    }, []),
  );
  const continueBookName = localizeBookName(translation.code, lastRead.bookSlug, englishBookName(lastRead.bookSlug));
  const continueTotalChapters = chaptersInBook(lastRead.bookSlug);
  // Per-book weighted progress: Mark-as-Complete chapters count 1.0, viewed-
  // only chapters (≥ 15 s dwell, no completion tap) count 0.5. Mirrors the
  // global `percent` formula in ReadChaptersContext so the home card and the
  // Profile/global stat agree.
  const continueBookWeighted = useMemo(() => {
    const prefix = `${lastRead.bookSlug}:`;
    let w = 0;
    for (const k of readChapterSet) if (k.startsWith(prefix)) w += 1.0;
    for (const k of viewedChapterSet) {
      if (k.startsWith(prefix) && !readChapterSet.has(k)) w += 0.5;
    }
    return w;
  }, [readChapterSet, viewedChapterSet, lastRead.bookSlug]);
  const continuePct = Math.min(100, Math.round((continueBookWeighted / continueTotalChapters) * 100));
  // Pct widget can collapse the visual to 0 % which looks broken; clamp the
  // bar to a thin minimum so users see SOME fill before they've read much.
  const continuePctWidth = Math.max(continuePct, 4);
  useEffect(() => { markToday(); }, [markToday]);

  // Mood check-in: pop the daily flow once per day after the loading screen
  // (or every 8 h if the user dismissed without picking).
  const moodCheckIn = useMoodCheckIn();
  useEffect(() => {
    if (!moodCheckIn.ready) return;
    if (!moodCheckIn.shouldShow()) return;
    moodCheckIn.markShown();
    const t = setTimeout(() => navigation.navigate('MoodFlow'), 250);
    return () => clearTimeout(t);
  }, [moodCheckIn.ready]);
  const ac = morning ? ROSE : LAV;
  const pct = (mDone ? 50 : 0) + (eDone ? 50 : 0);

  // Tick once per minute so the wait-state countdown updates without forcing
  // the whole screen onto a faster clock.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = now;
  // Week keys for "This Week" — Sunday → Saturday for the current week.
  const weekKeys = (() => {
    const dow = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  })();
  const completeThisWeek = weekKeys.filter(k => wasCompleteOn(k)).length;
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const TODAY_IDX = today.getDay();

  // ── Slot rules ───────────────────────────────────────────────────────────
  // Morning window opens at 06:00, closes (effectively) when evening opens.
  // Evening window opens at 18:00. The active slot can only enter the flow
  // inside its own window AND if it's not already done. Outside the window
  // OR after completion, the button shows a wait-state with a countdown.
  const hr = now.getHours();
  const slotDone = morning ? mDone : eDone;
  const inWindow = morning ? hr >= 6 : hr >= 18;
  const canStart = !slotDone && inWindow;

  // Compute the wait-state label and the hint that pops on tap. Only used
  // when canStart === false; otherwise the button is the active "Start" CTA.
  // readyToSwitch is the special case where the morning slot is complete AND
  // night has already opened — the button still pulses, and tapping flips
  // the active tab to evening rather than popping a hint.
  let waitLabel = '';
  let waitHint = '';
  let readyToSwitch = false;
  if (!canStart) {
    if (morning) {
      if (slotDone) {
        const ms = (() => {
          const target = new Date(now); target.setHours(18, 0, 0, 0);
          return target.getTime() - now.getTime();
        })();
        if (ms > 0) {
          waitLabel = `Night Prayer · ${formatCountdown(ms)}`;
          waitHint = 'Lovely, you\'re all set for the morning. Come back tonight for Night Prayer.';
        } else if (!eDone) {
          // Past 18:00, evening still pending → hand off to the evening tab.
          readyToSwitch = true;
          waitLabel = 'Night Prayer · Ready';
        } else {
          waitLabel = 'Beautiful Work Today';
          waitHint = 'Both prayers done. See you tomorrow morning.';
        }
      } else {
        // Before 06:00 → countdown to today's 06:00.
        const target = new Date(now); target.setHours(6, 0, 0, 0);
        waitLabel = `Morning Prayer · ${formatCountdown(target.getTime() - now.getTime())}`;
        waitHint = 'Sunrise prayer opens at 6 AM. See you bright and early.';
      }
    } else {
      if (slotDone) {
        // Evening done → "Beautiful Work Today" celebration; no countdown
        // line on the button itself. The hint carries the timing.
        waitLabel = 'Beautiful Work Today';
        waitHint = 'See you tomorrow morning for sunrise prayer.';
      } else {
        // Before 18:00 → countdown to today's 18:00.
        const target = new Date(now); target.setHours(18, 0, 0, 0);
        waitLabel = `Night Prayer · ${formatCountdown(target.getTime() - now.getTime())}`;
        waitHint = 'Night Prayer opens at 6 PM. Come back this evening.';
      }
    }
  }
  const greeting = hr < 5 ? 'Good Evening'
    : hr < 12 ? 'Good Morning'
    : hr < 18 ? 'Good Afternoon'
    : 'Good Evening';

  const [trackWidth, setTrackWidth] = useState(0);
  const progressVal = useSharedValue(pct);
  const prevPctRef = useRef(pct);

  // Celebration choreography — pop the %, fly a sparkle to the streak badge,
  // then punch the streak number with a delayed +1. Each piece has its own
  // shared value so they can be sequenced precisely.
  const pctTextScale = useSharedValue(1);
  const starOpacity = useSharedValue(0);
  const starProgress = useSharedValue(0);   // 0 → 1, position interpolation
  const streakScale = useSharedValue(1);
  const [displayedStreak, setDisplayedStreak] = useState(totalComplete);
  // Window-space anchors captured when the celebration kicks off so the star
  // flies from the % text to the streak badge regardless of layout.
  const pctAnchorRef = useRef({ x: 0, y: 0 });
  const streakAnchorRef = useRef({ x: 0, y: 0 });
  const pctTextRef = useRef<TextInput>(null);
  const streakRef = useRef<View>(null);
  const [starOverlayVisible, setStarOverlayVisible] = useState(false);
  // Star position is driven on JS for the Modal child — Modal doesn't share a
  // reanimated context with the screen, so we mirror starProgress into JS via
  // an extra animation completion callback below.
  const starStyle = useAnimatedStyle(() => {
    const x = pctAnchorRef.current.x + (streakAnchorRef.current.x - pctAnchorRef.current.x) * starProgress.value;
    const y = pctAnchorRef.current.y + (streakAnchorRef.current.y - pctAnchorRef.current.y) * starProgress.value;
    // Centre the 28×28 star on (x, y) and fade it as it lands.
    return {
      opacity: starOpacity.value,
      transform: [
        { translateX: x - 14 },
        { translateY: y - 14 },
        { scale: 1 + (1 - starProgress.value) * 0.4 },   // shrinks slightly as it lands
      ],
    };
  });

  const playStreakPunch = useCallback(() => {
    // Streak number scale 1 → 2 over 0.3s, +1 increment after 0.2s, hold 0.2s,
    // then scale back over 0.2s. Total ~0.7s.
    streakScale.value = withSequence(
      withTiming(2, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withDelay(200, withTiming(1, { duration: 200, easing: Easing.in(Easing.cubic) })),
    );
    setTimeout(() => setDisplayedStreak(totalComplete), 200);
    // Hide the overlay once the streak punch has landed.
    setTimeout(() => setStarOverlayVisible(false), 900);
  }, [totalComplete, streakScale]);

  const playCelebration = useCallback(() => {
    // 1. Pop the %: 1 → 2 → 1 over 0.5s, with cubic on both halves.
    pctTextScale.value = withSequence(
      withTiming(2, { duration: 250, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 250, easing: Easing.in(Easing.cubic) }),
    );
    // 2. Re-measure both anchors right before the star fires so we hand the
    //    interpolation accurate positions even if the screen has scrolled.
    pctTextRef.current?.measureInWindow((x, y, w, h) => {
      pctAnchorRef.current = { x: x + w / 2, y: y + h / 2 };
    });
    streakRef.current?.measureInWindow((x, y, w, h) => {
      streakAnchorRef.current = { x: x + w / 2, y: y + h / 2 };
    });
    // 3. Reveal the star, fly it, fade it out, then punch the streak.
    setStarOverlayVisible(true);
    starProgress.value = 0;
    starOpacity.value = 0;
    setTimeout(() => {
      starOpacity.value = withTiming(1, { duration: 120 });
      starProgress.value = withTiming(1, { duration: 600, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (!finished) return;
        starOpacity.value = withTiming(0, { duration: 120 });
        runOnJS(playStreakPunch)();
      });
    }, 500);
  }, [pctTextScale, starProgress, starOpacity, playStreakPunch]);

  useFocusEffect(useCallback(() => {
    if (pct !== prevPctRef.current) {
      const startPct = prevPctRef.current;
      prevPctRef.current = pct;
      // 10 % faster than before (3000 → 2700 ms).
      progressVal.value = startPct;
      progressVal.value = withDelay(800, withTiming(pct, { duration: 2700, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished && pct === 100) runOnJS(playCelebration)();
      }));
    }
  }, [pct, progressVal, playCelebration]));

  // Sync `displayedStreak` to the source-of-truth `totalComplete` on every
  // change, EXCEPT when the change is exactly the +1 increment that an
  // incoming celebration is going to animate. Two cases this gets right
  // that the previous `pct !== 100` guard got wrong:
  //   • Cold start with pct already at 100. Old code skipped the sync, so
  //     the header read "0" forever; here `prev` was the freshly-mounted 0
  //     and `totalComplete` is the hydrated value, so the +1 check fails
  //     and we sync immediately.
  //   • Day rollover, totals reset, etc. → not +1 from non-zero, sync.
  // Only the genuine N → N+1 transition is held back, so the celebration
  // can punch from N up to N+1 inside `playStreakPunch`.
  const prevTotalCompleteRef = useRef(totalComplete);
  useEffect(() => {
    const prev = prevTotalCompleteRef.current;
    prevTotalCompleteRef.current = totalComplete;
    const isCelebrationIncrement = totalComplete === prev + 1 && prev > 0;
    if (!isCelebrationIncrement) {
      setDisplayedStreak(totalComplete);
    }
  }, [totalComplete]);

  const progressFillStyle = useAnimatedStyle(() => ({
    width: (progressVal.value / 100) * trackWidth,
  }));
  // Pct text — color follows the same 0/50/100 stops as the bar gradient.
  const pctTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progressVal.value, [0, 50, 100], ['#F9A8C9', '#F9A8C9', '#9D7FE0']),
    transform: [{ scale: pctTextScale.value }],
  }));
  const pctAnimatedProps = useAnimatedProps(() => ({
    text: `${Math.round(progressVal.value)}%`,
  } as any));
  const streakNumStyle = useAnimatedStyle(() => ({
    transform: [{ scale: streakScale.value }],
  }));

  // Toggle slide animation
  const progress = useSharedValue(morning ? 0 : 1);
  const toggleWidth = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(morning ? 0 : 1, { duration: 500 });
  }, [morning, progress]);
  const indicatorStyle = useAnimatedStyle(() => {
    const w = Math.max(0, (toggleWidth.value - 6) / 2);
    return {
      width: w,
      transform: [{ translateX: progress.value * w }],
      backgroundColor: interpolateColor(progress.value, [0, 1], [ROSE, LAV]),
    };
  });
  const morningTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ['#ffffff', TXTSUB]),
  }));
  const eveningTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [TXTSUB, '#ffffff']),
  }));
  const onToggleLayout = (e: LayoutChangeEvent) => {
    toggleWidth.value = e.nativeEvent.layout.width;
  };

  const liveVerseRef = dailyVerse?.reference.full_reference
    ? localizeReference(translation.code, dailyVerse.reference.full_reference)
    : '';
  const liveVerseText = dailyVerse?.modernText || '';

  // Single source of truth for "open today's verse in the reader" — the verse
  // ref tap, the More → Read full chapter action, and any future entry point
  // all funnel through here so the reader gets a consistent dim-and-highlight
  // focus on this exact verse range.
  const openVerseInBible = () => {
    const ref = dailyVerse?.reference.full_reference;
    const focus = ref ? parseReference(ref) : null;
    navigation.navigate('Tabs', focus
      ? { screen: 'bible', params: { focus } }
      : { screen: 'bible' });
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 4 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ marginTop: 15, marginLeft: 8 }}>
          <Text style={styles.dateText}>{dateStr.toUpperCase()}</Text>
          <Text style={styles.greetText}>{greeting}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Streak')} style={styles.streakBadge}>
            <View style={styles.streakFlame}>
              <FireFlame size={28} />
            </View>
            <View ref={streakRef} collapsable={false}>
              <Animated.Text style={[styles.streakNum, streakNumStyle]}>{displayedStreak}</Animated.Text>
            </View>
            {/* Sweeping orange→red border that orbits the badge twice in
                the first ~5 s after entering the screen, then fades. The
                values mirror styles.streakBadge so any width/height/radius
                tweak there must be reflected here too. */}
            <StreakBorderAnim width={70} height={40} borderRadius={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Tabs', { screen: 'profile' })}
            activeOpacity={0.85}
          >
            {/* Mirrors ProfileScreen exactly: photoUri wins over the
                gradient + initial fallback. The hardcoded "S" was a stray
                placeholder from the early header mockup — not pulled from
                user state, so it desynced as soon as the user picked any
                other initial in Profile. */}
            {user?.photoUri ? (
              <Image source={{ uri: user.photoUri }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={['#F9A8C9', '#E8619A']}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>TODAY'S PROGRESS</Text>
          {/* Number is driven by progressVal (same source the bar reads), so
              the count animates in lockstep with the fill. AnimatedTextInput
              is the standard hack — TextInput is the only RN text node whose
              `text`/`value` prop accepts animatedProps. */}
          <AnimatedTextInput
            ref={pctTextRef}
            editable={false}
            underlineColorAndroid="transparent"
            defaultValue={`${pct}%`}
            animatedProps={pctAnimatedProps}
            style={[styles.progressPct, pctTextStyle]}
          />
        </View>
        <View
          style={styles.progressTrack}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.progressFill, progressFillStyle]}>
            <LinearGradient
              colors={['#F9A8C9', '#C4B5FD', '#9D7FE0']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1, height: '100%' }}
            />
          </Animated.View>
          <View style={styles.progressDivider} />
        </View>
      </View>

      {/* Morning/Evening toggle */}
      <View style={styles.toggle} onLayout={onToggleLayout}>
        <Animated.View pointerEvents="none" style={[styles.toggleIndicator, indicatorStyle]} />
        {(['morning', 'evening'] as const).map(s => {
          const isM = s === 'morning';
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setMorning(isM)}
              style={styles.toggleBtn}
              activeOpacity={0.8}
            >
              <Animated.Text style={[styles.toggleText, isM ? morningTextStyle : eveningTextStyle]}>
                {isM ? 'Morning' : 'Evening'}{isM && mDone ? ' ✓' : ''}{!isM && eDone ? ' ✓' : ''}
              </Animated.Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Hero verse card. Inline -3 px on paddingTop tightens the gap to
          the Morning/Evening toggle above without changing the standard
          14-px gap that the other two `section` blocks below rely on. */}
      <View style={[styles.section, { paddingTop: 11 }]}>
        <VerseHeroCard
          morning={morning}
          canStart={canStart}
          canReplay={slotDone}
          readyToSwitch={readyToSwitch}
          onSwitchTab={() => setMorning(false)}
          waitLabel={waitLabel}
          waitHint={waitHint}
          cardLabel={morning ? labels.verseOfDay : labels.verseOfNight}
          verseRef={dailyVerse?.reference.full_reference
            ? localizeReference(translation.code, dailyVerse.reference.full_reference)
            : ''}
          verseText={dailyVerse?.modernText || ''}
          onBegin={() => navigation.navigate('PrayerFlow', { kind: morning ? 'morning' : 'evening' })}
          onOpenRef={openVerseInBible}
          onShare={() => setShowShare(true)}
          onMore={(anchor) => setMoreAnchor(anchor)}
        />
      </View>

      {/* This Week */}
      <View style={styles.section}>
        <Glass onPress={() => navigation.navigate('Streak')} style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekTitle}>THIS WEEK</Text>
            <Text style={styles.weekSub}>{completeThisWeek} / 7 days</Text>
          </View>
          <View style={styles.weekDays}>
            {DAYS.map((d, i) => {
              const isToday = i === TODAY_IDX;
              const done = wasCompleteOn(weekKeys[i]);
              const half = isToday && (mDone || eDone) && !(mDone && eDone);
              return <DayCircle key={d} label={d} done={done} half={half} isToday={isToday} morning={morning} />;
            })}
          </View>
        </Glass>
      </View>

      {/* Psalms for You */}
      <View style={styles.psalmsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Psalms for You</Text>
          <Text style={[styles.seeAll, { color: ac }]}>See all →</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.psalmsScroll}>
          {PSALMS_CARDS.map((c, i) => (
            <TouchableOpacity key={i} style={styles.psalmCard} activeOpacity={0.85}>
              <View style={[styles.psalmAccent, {
                backgroundColor: i === 0 ? undefined : undefined,
                ...(i === 0 ? {} : {}),
              }]}>
                <LinearGradient
                  colors={i === 0 ? ['#F9A8C9', '#E8619A'] : i === 1 ? ['#C4B5FD', '#9D7FE0'] : ['#FDE68A', '#F59E0B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.psalmAccentBar}
                />
              </View>
              <View style={[styles.psalmTag, { backgroundColor: c.acl }]}>
                <Text style={[styles.psalmTagText, { color: c.ac }]}>{c.tag}</Text>
              </View>
              <Text style={styles.psalmName}>{c.psalm}</Text>
              <Text style={styles.psalmSub}>{c.subtitle}</Text>
              <Text style={[styles.psalmRead, { color: c.ac }]}>Read →</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Continue Reading */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Continue Reading</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'bible' })} activeOpacity={0.85} style={styles.continueCard}>
          <LinearGradient
            colors={['rgba(249,168,201,0.38)', 'rgba(196,181,253,0.38)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.continueInner}
          >
            <LinearGradient colors={['#F9A8C9', '#E8619A']} style={styles.continueIcon}>
              <Feather name="book-open" size={24} color="#fff" />
            </LinearGradient>
            <View style={styles.continueMeta}>
              <Text style={styles.continueCaption}>CONTINUE READING</Text>
              <Text style={styles.continueTitle}>{continueBookName} · Chapter {lastRead.chapter}</Text>
              {/* % label hovers above the fill end; slot width tracks fill so the
                  number sits right at the bar's tip. */}
              <View style={[styles.continuePctSlot, { width: `${continuePctWidth}%` }]} pointerEvents="none">
                <Text style={[styles.continuePct, { color: ROSE }]}>{continuePct}%</Text>
              </View>
              <View style={styles.continueProgressTrack}>
                <LinearGradient
                  colors={['#F9A8C9', '#E8619A']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.continueProgressFill, { width: `${continuePctWidth}%` }]}
                />
              </View>
            </View>
            <View style={styles.continueChevron}>
              <Feather name="chevron-right" size={22} color="rgba(30,27,46,0.55)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={{ height: 23 }} />

      {/* Overlays are wrapped in Modal so they render on a separate native
          layer above the tab content. Earlier they sat as siblings of this
          ScrollView under a flex:1 wrapper, which broke ScrollView's "fill
          the screen" sizing — the screen rendered without its scrollable
          viewport and started to swallow taps in the lower half. */}
      <Modal
        visible={showShare && !!liveVerseRef && !!liveVerseText}
        transparent
        animationType="none"
        onRequestClose={() => setShowShare(false)}
      >
        <ShareVerseSheet
          reference={liveVerseRef}
          text={liveVerseText}
          onClose={() => setShowShare(false)}
        />
      </Modal>

      <Modal
        visible={!!moreAnchor}
        transparent
        animationType="none"
        onRequestClose={() => setMoreAnchor(null)}
      >
        {moreAnchor ? (
          <MoreMenu
            anchor={moreAnchor}
            onClose={() => setMoreAnchor(null)}
            onSeePastDays={() => {
              setMoreAnchor(null);
              navigation.navigate('PastVerses');
            }}
            onReadFullChapter={() => {
              setMoreAnchor(null);
              openVerseInBible();
            }}
          />
        ) : null}
      </Modal>

      {/* Shooting-star celebration overlay. Modal lifts the layer above the
          tab content so the sparkle can fly across the whole screen. */}
      <Modal visible={starOverlayVisible} transparent animationType="none" hardwareAccelerated>
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Animated.View style={[styles.starOverlay, starStyle]}>
            <Sparkle size={28} />
          </Animated.View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Soft 4-point sparkle used by the celebration star. White core with a
// gentle gold edge so it reads against any of the gradient colors below.
function Sparkle({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 0 C12.6 8, 16 11.4, 24 12 C16 12.6, 12.6 16, 12 24 C11.4 16, 8 12.6, 0 12 C8 11.4, 11.4 8, 12 0 Z"
        fill="#F4D58A"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: P,
    paddingTop: 6,
    paddingBottom: 5,
  },
  dateText: {
    fontSize: 13,
    color: TXTSUB,
    letterSpacing: 1.8,
    marginBottom: 2,
  },
  greetText: {
    fontSize: 26,
    fontWeight: '500',
    color: TXT,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  // -10 % from 78 → 70. If you change width/height/borderRadius here, also
  // update the matching props on the <StreakBorderAnim> render so the SVG
  // stroke aligns with the badge's actual edge.
  // paddingRight 6 with justifyContent: 'center' biases the content 3 px
  // left of the badge's geometric center — the flame's visual mass sits
  // off-center to the right of the icon's bounding box, so a true centered
  // layout reads as if everything is pushed right.
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 6,
    gap: 2,
    width: 70,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  // marginTop -5: nudges the flame 2 px higher than before (was -3) so its
  // body sits visually centered against the digit baseline rather than
  // hanging slightly low.
  streakFlame: { marginTop: -5 },
  // +10 % from 17 → 18.7 per design.
  streakNum: { fontSize: 18.7, fontWeight: '700', color: TXT },
  // Square = perfect circle. Height matches `streakBadge.height: 40` so the
  // two header chips align on a single baseline. If you tweak streakBadge's
  // height, change this in lockstep.
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Down from 22 → 18 to keep the 45 %-of-circle ratio the previous 50 px
  // avatar had (22/50 ≈ 0.44 → 18/40 = 0.45). 22 pt in a 40 px circle felt
  // crowded.
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  progressSection: {
    paddingHorizontal: P + 6,
    paddingTop: 14,
    marginTop: 7,
    marginBottom: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  progressLabel: {
    fontSize: 13,                   // -15% from 15
    fontWeight: '700',              // bolded per request
    color: 'rgba(30,27,46,0.55)',
    letterSpacing: 1.2,
  },
  progressPct: {
    fontSize: 14,
    fontWeight: '700',
    // TextInput needs explicit dimensions / padding-zero to match a Text node.
    minWidth: 44,
    textAlign: 'right',
    padding: 0,
    margin: 0,
  },
  starOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    shadowColor: '#F4D58A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  progressTrack: {
    height: 10,
    borderRadius: 11,
    backgroundColor: 'rgba(30,27,46,0.10)',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 11,
  },
  progressDivider: {
    position: 'absolute',
    left: '50%',
    top: 1.5,
    bottom: 1.5,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 2,
  },
  toggle: {
    flexDirection: 'row',
    marginHorizontal: P,
    marginTop: 17,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 23,
    padding: 3,
    position: 'relative',
  },
  toggleIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 18,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: 18,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 17,                   // +10% from 15 (rounded up)
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  section: {
    paddingHorizontal: P,
    paddingTop: 14,
  },
  heroCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroTop: {
    padding: 22,
    paddingBottom: 0,
  },
  heroLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 5,
  },
  heroRefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  heroRef: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  heroRefChev: {
    marginLeft: 4,
    marginTop: 2,
  },
  heroBody: {
    padding: 22,
    paddingTop: 32,
    paddingBottom: 28,
  },
  heroText: {
    fontFamily: FONTS.serif,
    // Verse-hero card is the most prominent scripture surface in the app
    // — bumped to 22 pt and Medium weight (500) for emphasis. opsz stays
    // at 35 to match the body-text master used everywhere else, so the
    // letterforms feel like the same voice, just slightly heavier.
    fontVariationSettings: [
      { axis: 'opsz', value: 35 },
      { axis: 'wght', value: 500 },
    ],
    fontSize: 22,
    lineHeight: 34,                       // 31 → 34, scales with the +2 pt bump
    color: 'rgba(255,255,255,0.96)',
  },
  heroActions: {
    flexDirection: 'row',
    paddingHorizontal: 9,
    paddingTop: 5,
    paddingBottom: 14,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  // No `marginHorizontal` — the parent `section` already insets by P, so
  // alignSelf: 'stretch' here makes the button span the same width as the
  // hero card above it. Adding margin would inset the button an extra P on
  // each side, leaving it 2 × P narrower than the card (the previous
  // mismatch the design called out).
  startBtn: {
    marginTop: 16,
    marginBottom: 10,
    height: 55,
    borderRadius: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Wait-state button — slightly smaller than the active Start CTA so it
  // visually recedes, tinted with the active accent at low opacity. Matches
  // startBtn's full card-width by relying on `section`'s padding (no extra
  // marginHorizontal) — keeps the slot's footprint stable across states so
  // the layout doesn't shift when the button toggles wait ↔ active.
  waitBtn: {
    marginTop: 16,
    marginBottom: 10,
    height: 48,
    borderRadius: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  hintWrap: {
    marginHorizontal: P,
    marginBottom: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(232,97,154,0.08)',
    borderRadius: 14,
  },
  hintText: {
    color: TXT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  weekCard: {
    padding: 20,
    paddingBottom: 20,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  weekTitle: {
    fontSize: 13,                  // +7 % from 12
    fontWeight: '700',
    color: TXT,
    letterSpacing: 1.8,
  },
  weekSub: {
    fontSize: 13,                  // +7 % from 12
    color: TXTSUB,
    letterSpacing: 0.3,
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  psalmsSection: {
    paddingTop: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 13,
    paddingHorizontal: P,
  },
  sectionTitle: {
    fontSize: 18,                    // +10% from 16 (kept native font — this is a title)
    fontWeight: '600',
    color: TXT,
  },
  seeAll: {
    fontSize: 14,                    // +10% from 13
    fontFamily: NOTO_MED,            // non-title → Noto Sans
  },
  psalmsScroll: {
    paddingHorizontal: P,
    paddingBottom: 7,
    gap: 12,
  },
  psalmCard: {
    width: 164,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    padding: 17,
    paddingHorizontal: 15,
  },
  psalmAccent: {},
  psalmAccentBar: {
    height: 3,
    width: 37,
    borderRadius: 3,
    marginBottom: 13,
  },
  psalmTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 12,
  },
  psalmTagText: {                    // tag label ("ANXIETY") — non-title
    fontSize: 12,                    // +10% from 11
    fontFamily: NOTO_BOLD,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  psalmName: {                       // "Psalm 46" / "Psalm 121" — kept at original size per request
    fontSize: 22,
    fontWeight: '600',
    color: TXT,
    marginBottom: 5,
    lineHeight: 26,
  },
  psalmSub: {                        // subtitle line — non-title
    fontSize: 14,                    // +10% from 13
    fontFamily: NOTO_REG,
    color: TXTSUB,
    lineHeight: 21,
    marginBottom: 14,
  },
  psalmRead: {                       // "Read →" link — non-title
    fontSize: 14,                    // +10% from 13
    fontFamily: NOTO_MED,
  },
  continueCard: {
    marginTop: 13,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
  },
  continueInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,             // 15 → 22 (~+47% so total card grows ~30%)
    paddingHorizontal: 17,           // tiny bump so chevron isn't glued to edge
    gap: 16,
  },
  continueIcon: {
    width: 52,                       // 48 → 52 to balance the taller card
    height: 56,                      // 51 → 56
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  continueMeta: { flex: 1 },
  continuePctSlot: {
    alignItems: 'flex-end',
    marginBottom: 4,
    minWidth: 36,
  },
  continueChevron: {
    flexShrink: 0,
    paddingLeft: 4,
  },
  continueCaption: {                 // "CONTINUE READING" caption — non-title
    fontSize: 13,                    // +10% from 12
    fontFamily: NOTO_BOLD,
    color: ROSE,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  continueTitle: {                   // card title ("Psalms · Chapter 23") — kept native font
    fontSize: 18,                    // +10% from 16
    fontWeight: '600',
    color: TXT,
    marginBottom: 10,                // 6 → 10, breathing room before the pct/bar group
  },
  continueProgressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.10)',
    overflow: 'hidden',
  },
  continueProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  continuePct: {                     // dynamic % badge — non-title
    fontSize: 14,                    // +10% from 13
    fontFamily: NOTO_BOLD,
  },
});
