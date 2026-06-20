import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent, Dimensions, Modal, TextInput, Image, ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
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
import FireFlame from '../components/shared/FireFlame';
import StreakBorderAnim from '../components/shared/StreakBorderAnim';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useAuth } from '../state/AuthContext';
import { usePrayer } from '../state/PrayerContext';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useActivity } from '../state/ActivityContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { nextUncompletedDay } from '../components/PlanRowCard';
import PlanProgressCard from '../components/PlanProgressCard';
import GospelPsalmCards from '../components/GospelPsalmCards';
import { dailyLabels } from '../constants/dailyVersesLabels';
import { localizeBookName, englishBookName, chaptersInBook } from '../constants/bibleBookNames';
import { parseReference, localizeReference } from '../services/parseReference';
import { useTabFocusScrollReset } from '../components/shared/useTabFocusEntrance';
import { useT } from '../i18n/useT';
import ShareVerseSheet from '../components/ShareVerseSheet';
import TabSection from '../components/shared/TabSection';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { useUILanguage } from '../state/UILanguageContext';
import { useBadges } from '../state/BadgesContext';
import { localeFor } from '../i18n/locale';
import type { TabScreenProps } from '../navigation/types';

const NOTO_REG = 'Lato_400Regular';   // Noto Sans SC no longer bundled; Latin → Lato, CJK → system font
const NOTO_MED = 'Lato_400Regular';
const NOTO_BOLD = 'Lato_700Bold';

// All four action icons sized 20 (was 22, -10 % per user). The comment
// icon was previously a custom bubble-with-tail SVG that read as
// visually "tilted" because its tail anchored at bottom-left; swapped
// for a clean symmetric `message-circle` shape so the icon row reads
// as four evenly-weighted glyphs.
const ACTION_ICON_SIZE = 18;                                                    // 20 → 18 (-10 % per user); strokes +50 % (1.7→2.55) for a heavier look

function HeartIcon({ filled, color }: { filled?: boolean; color: string }) {
  return (
    <Svg width={ACTION_ICON_SIZE} height={ACTION_ICON_SIZE} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2.55}>
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function CommentIcon({ color }: { color: string }) {
  // Clean speech bubble — circular body with a small, centered tail at
  // the bottom. Replaces the previous teardrop bubble whose corner-tail
  // gave the icon a tilted look in the user's screenshot.
  return (
    <Svg width={ACTION_ICON_SIZE} height={ACTION_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.55} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 5.5a2.5 2.5 0 0 1 2.5-2.5h11a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-4.4L9 21v-3.5H6.5A2.5 2.5 0 0 1 4 15z" />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={ACTION_ICON_SIZE} height={ACTION_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.55}>
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
    <Svg width={ACTION_ICON_SIZE} height={ACTION_ICON_SIZE} viewBox="0 0 24 24" fill={color} stroke="none">
      <Circle cx={5} cy={12} r={2.4} />
      <Circle cx={12} cy={12} r={2.4} />
      <Circle cx={19} cy={12} r={2.4} />
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
  const t = useT();
  const { width: screenW, height: screenH } = Dimensions.get('window');
  // Popover sits directly ABOVE the More button (right edge aligned with
  // the right edge of More), with a 10 px gap reserved for a downward
  // caret that points to the More icon. Previously it anchored to More's
  // LEFT edge, which slid the menu off into the upper-left of the card —
  // looking like it had nothing to do with More.
  const CARET_SIZE = 9;
  const GAP = 8;
  const popoverRight = Math.max(8, screenW - (anchor.x + anchor.w));
  const popoverBottom = Math.max(8, screenH - anchor.y + CARET_SIZE + GAP);
  // Caret centred on the More icon, pointing down at it.
  const caretRight = Math.max(8, screenW - (anchor.x + anchor.w / 2) - CARET_SIZE);
  const caretBottom = Math.max(8, screenH - anchor.y + GAP);
  return (
    <View style={moreStyles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        style={[moreStyles.popover, { right: popoverRight, bottom: popoverBottom }]}
      >
        <TouchableOpacity onPress={onReadFullChapter} activeOpacity={0.85} style={moreStyles.row}>
          <Feather name="book-open" size={18} color={TXT} />
          <Text style={moreStyles.rowText}>{t('prayer.more.readFullChapter')}</Text>
        </TouchableOpacity>
        <View style={moreStyles.rowDivider} />
        <TouchableOpacity onPress={onSeePastDays} activeOpacity={0.85} style={moreStyles.row}>
          <Feather name="calendar" size={18} color={TXT} />
          <Text style={moreStyles.rowText}>{t('prayer.more.seePastDays')}</Text>
        </TouchableOpacity>
      </Animated.View>
      {/* Downward caret — pure CSS-triangle from transparent borders.
          Sits between the popover and the More icon so the connection is
          obvious. */}
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        style={[moreStyles.caret, { right: caretRight, bottom: caretBottom }]}
      />
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
  // Downward triangle via the 4-borders-as-triangle trick. White top
  // border matches the popover's bg; left/right/bottom transparent so
  // only the top edge renders as a small downward arrow.
  caret: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
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

function VerseHeroCard({ morning, canStart, canReplay, readyToSwitch, onSwitchTab, offerPastDays, onOfferPastDays, waitLabel, waitHint, onBegin, onOpenRef, onShare, onMore, cardLabel, verseRef, verseText, bgSource }: {
  morning: boolean;
  canStart: boolean;        // active slot in window + not yet done
  canReplay: boolean;       // slot already done — tapping the card re-enters as redo
  readyToSwitch: boolean;   // morning done + evening already open → tap = flip tab
  onSwitchTab: () => void;
  offerPastDays: boolean;   // 00:00–06:00 dead zone → tapping offers "See past days"
  onOfferPastDays: () => void;
  waitLabel: string;        // copy for the gray wait-state button (countdown)
  waitHint: string;         // pop-up text shown on tapping the gray button
  onBegin: () => void;
  onOpenRef: () => void;
  onShare: () => void;
  onMore: (anchor: { x: number; y: number; w: number; h: number }) => void;
  cardLabel: string;
  verseRef: string;
  verseText: string;
  // CDN-backed daily photo (morning sunrise / evening moon). Falls back to
  // the bundled APK asset when manifest hasn't loaded — see
  // PrayerBackgroundsContext.imageFor for the fallback chain.
  bgSource: any;
}) {
  const t = useT();
  const moreBtnRef = React.useRef<View>(null);
  const handleMorePress = () => {
    moreBtnRef.current?.measureInWindow((x, y, w, h) => onMore({ x, y, w, h }));
  };
  const [liked, setLiked] = React.useState(false);
  // Soft darkening gradient sitting on top of the CDN photo. Goes from a
  // subtle wash at the top (~20%) to a heavier veil at the bottom (~55%)
  // so the verse text + action labels stay legible while the photo still
  // reads as the dominant background — matches the target moon/sunrise
  // composition. Morning/evening keep their tonal tint via tinted ends.
  // Morning veil per user: +50% transparency (alpha halved 0.20→0.10 /
  // 0.55→0.28) and the bright magenta-pink top darkened toward a blackish
  // wine-pink (123,34,85 → 68,19,47) so it reads as a subtle warm shadow,
  // not a pink wash over the photo. Evening tint unchanged.
  // Matches PrayerFlow's reading-view scrim EXACTLY (same colors + alphas +
  // gradient direction) per user, so the home card and the reading screen have
  // an identical photo veil. Morning is the new wine-red/burgundy (darker +
  // more transparent than the old magenta-pink) the user preferred.
  const colors = morning
    ? (['rgba(74,20,36,0.30)', 'rgba(28,8,16,0.58)'] as const)
    : (['rgba(45,22,96,0.40)', 'rgba(16,5,37,0.70)'] as const);
  const iconColor = 'rgba(255,255,255,0.92)';

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
  // Pulse range 0.92 → 1.0 (was 0.9 → 1.0) — magnitude -20 % per user, so
  // the breathing motion is gentler. Duration 1300 → 1180 (+10 % speed).
  const pulse = useSharedValue(0.92);
  useEffect(() => {
    if (!pulseActive) { pulse.value = 1; return; }
    pulse.value = 0.92;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1180, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, pulseActive]);
  // Asymmetric breath per user — the horizontal stretch is clearly LARGER than
  // the vertical so the pill reads as squishing wider/narrower, not puffing
  // uniformly. X follows `pulse` directly (0.92 ↔ 1.0, 8 % range); Y is mapped
  // to a much smaller 0.97 ↔ 1.0 (3 % range — ~⅜ of X's magnitude). Timing +
  // easing inherited from `pulse`.
  const pulseStyle = useAnimatedStyle(() => {
    const px = pulse.value;
    const py = 0.97 + (px - 0.92) * (0.03 / 0.08);                               // maps px∈[0.92,1] → py∈[0.97,1] (vertical amplitude ≪ horizontal)
    return { transform: [{ scaleX: px }, { scaleY: py }] };
  });

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
  //   • offerPastDays (00:00–06:00 dead zone, nothing actionable) → prompt to
  //     revisit past days so the user always has something to do.
  //   • otherwise → pop the friendly hint
  const onCardPress = canStart ? onBegin
    : readyToSwitch ? onSwitchTab
    : canReplay ? onBegin
    : offerPastDays ? onOfferPastDays
    : popHint;

  return (
    <View>
      <ImageBackground
        source={bgSource}
        style={styles.heroCard}
        imageStyle={styles.heroCardImage}
        resizeMode="cover"
      >
        {/* Darkening veil + tonal tint over the CDN photo. absoluteFill so
            it covers the full card including the action row, keeping the
            icon/label readability consistent edge to edge. */}
        <LinearGradient
          colors={colors}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
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
            <Text style={[styles.actionLabel, { color: iconColor }]}>{t('prayer.action.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity ref={moreBtnRef} style={styles.actionBtn} onPress={handleMorePress}>
            <MoreIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>{t('prayer.action.more')}</Text>
          </TouchableOpacity>
        </View>
      </ImageBackground>

      {canStart ? (
        <Animated.View style={pulseStyle}>
          <TouchableOpacity
            onPress={onBegin}
            activeOpacity={0.9}
            style={[styles.startBtn, { backgroundColor: morning ? ROSE : LAV }]}
          >
            <Text style={styles.startBtnText}>
              {t(morning ? 'prayer.startMorning' : 'prayer.startNight')}
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

      {/* Wait-state hint — toast-style overlay centered on the viewport.
          Was previously rendered inline below the wait button which pushed
          everything else down and disturbed the page rhythm (2026-05-22 per
          user). Now portaled through a Modal so it floats over the entire
          screen and auto-dismisses (3.2 s timer in `popHint`) or on tap. */}
      <Modal
        visible={!!hint}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setHint(null)}
      >
        <TouchableOpacity
          style={styles.hintOverlay}
          activeOpacity={1}
          onPress={() => setHint(null)}
        >
          <View style={styles.hintCard} pointerEvents="none">
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function PrayerScreen({ navigation }: TabScreenProps<'prayer'>) {
  // Tab-entrance scroll-to-top — paired with the per-section <TabSection>
  // animations below so the user always lands at the top of the screen and
  // the content lifts into place in waves on every focus.
  const mainScrollRef = useRef<ScrollView>(null);
  useTabFocusScrollReset(mainScrollRef);
  const t = useT();
  const insets = useSafeAreaInsets();
  // The header chip and the StreakScreen it routes to must show the same
  // metric. StreakScreen displays `totalComplete` (lifetime count of days
  // where BOTH prayers were finished) under the "DAY STREAK" label, so the
  // header has to read from the same source. Using `currentStreak` (the
  // active consecutive run) here was the cause of "header shows 0, tap
  // shows 4" — the user has 4 lifetime complete days but no active streak.
  const { morning, setMorning, mDone, eDone, wasCompleteOn, totalComplete } = usePrayer();
  // Warm the badge-art cache from the home screen — the earliest point in the
  // app, so the CDN images are on disk well before the first badge is awarded
  // (e.g. prayer.first on the first Amen). Idempotent + once-per-launch.
  const { prefetchAll: prefetchBadges } = useBadges();
  useEffect(() => { prefetchBadges(); }, [prefetchBadges]);
  const prayerBg = usePrayerBackgrounds();
  const { markToday } = useActivity();
  const { current: translation } = useTranslation();
  // Same source of truth as ProfileScreen: header avatar must mirror the
  // Profile tab's avatar exactly. Logged in → first initial; logged out → "H".
  const { user } = useAuth();
  const initials = user?.name?.trim().slice(0, 1).toUpperCase() || 'H';
  const { getVerse, todayDay } = useDailyVerses();
  const { read: readChapterSet } = useReadChapters();
  // Plans In Progress — up to 2 active reading plans, sorted by most-recent
  // day-completion timestamp (we approximate via `firstStartedAt` since the
  // record doesn't track per-day timestamps). PlanCompletion exposes only
  // `records`; the "in progress" derivation is local: any plan with at
  // least one day completed but no `finishedAt` is active.
  const { records: planRecords } = usePlanCompletion();
  const { getSummary } = useFeaturedPlans();
  const inProgressPlanRows = useMemo(() => {
    const activeSlugs = Object.entries(planRecords)
      .filter(([, r]) => r.completedDays.length > 0 && !r.finishedAt)
      .sort(([, a], [, b]) => (b.firstStartedAt || 0) - (a.firstStartedAt || 0))
      .slice(0, 2)
      .map(([slug]) => slug);
    return activeSlugs
      .map(slug => getSummary(slug))
      .filter((p): p is NonNullable<ReturnType<typeof getSummary>> => !!p);
  }, [planRecords, getSummary]);
  // Share + More overlays live at the screen root so their absolute-fill
  // overlays are sized to the screen, not to the verse-card section. Render-
  // ing them inside VerseHeroCard sized them to the card and the share sheet
  // ended up anchored a few hundred px above the bottom edge.
  const [showShare, setShowShare] = useState(false);
  // "See past days" prompt shown when tapping the card in the 00:00–06:00 dead zone.
  const [showPastPrompt, setShowPastPrompt] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<MoreAnchor | null>(null);
  const labels = dailyLabels(translation.code);
  const segment: 'morning' | 'evening' = morning ? 'morning' : 'evening';
  // Daily verse for the active segment. Bundled fallback guarantees a value
  // for the first 3 days even with no network.
  const dailyVerse = getVerse(todayDay, segment);
  // Continue Reading card mirrors whatever the bible reader has persisted as
  // last-read. Default = Genesis 1, matching BibleScreen's fresh-install
  // baseline. Refreshed on every Prayer-tab focus so changes made in the
  // reader (drawer / search / saved-verse jump) propagate back here.
  const [lastRead, setLastRead] = useState<{ bookSlug: string; chapter: number }>({ bookSlug: 'genesis', chapter: 1 });
  useFocusEffect(
    React.useCallback(() => {
      AsyncStorage.getItem('bible:last-read').then(raw => {
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
  // % of the current book's chapters the user has actually opened. The set
  // is stored as "slug:chapter" strings, so a slug-prefix scan is enough.
  const continueBookReadCount = useMemo(() => {
    let count = 0;
    const prefix = `${lastRead.bookSlug}:`;
    for (const k of readChapterSet) if (k.startsWith(prefix)) count++;
    return count;
  }, [readChapterSet, lastRead.bookSlug]);
  const continuePct = Math.min(100, Math.round((continueBookReadCount / continueTotalChapters) * 100));
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
    const timer = setTimeout(() => navigation.navigate('MoodFlow'), 250);
    return () => clearTimeout(timer);
  }, [moodCheckIn.ready]);
  const pct = (mDone ? 50 : 0) + (eDone ? 50 : 0);

  // Tick once per minute so the wait-state countdown updates without forcing
  // the whole screen onto a faster clock.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = now;
  const { lang } = useUILanguage();
  const dateStr = today.toLocaleDateString(localeFor(lang), { weekday: 'long', month: 'short', day: 'numeric' });

  // ── Slot rules ───────────────────────────────────────────────────────────
  // Morning window opens at 06:00, closes (effectively) when evening opens.
  // Evening window opens at 18:00. The active slot can only enter the flow
  // inside its own window AND if it's not already done. Outside the window
  // OR after completion, the button shows a wait-state with a countdown.
  const hr = now.getHours();
  const slotDone = morning ? mDone : eDone;
  const inWindow = morning ? hr >= 6 : hr >= 18;
  const canStart = !slotDone && inWindow;
  // 00:00–06:00 dead zone: morning window not open yet AND evening window
  // closed — nothing is actionable on either tab. Instead of a dead card, a
  // tap offers to revisit past days so the user always has something to do.
  const offerPastDays = hr < 6 && !canStart && !slotDone;

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
          waitLabel = t('prayer.wait.nightCountdown', { countdown: formatCountdown(ms) });
          waitHint = t('prayer.hint.morningSetForDay');
        } else if (!eDone) {
          // Past 18:00, evening still pending → hand off to the evening tab.
          readyToSwitch = true;
          waitLabel = t('prayer.wait.nightReady');
        } else {
          waitLabel = t('prayer.wait.beautifulWork');
          waitHint = t('prayer.hint.bothDoneMorning');
        }
      } else {
        // Before 06:00 → countdown to today's 06:00.
        const target = new Date(now); target.setHours(6, 0, 0, 0);
        waitLabel = t('prayer.wait.morningCountdown', { countdown: formatCountdown(target.getTime() - now.getTime()) });
        waitHint = t('prayer.hint.sunriseOpens');
      }
    } else {
      if (slotDone) {
        if (mDone) {
          // BOTH slots done → the real 100 % celebration.
          waitLabel = t('prayer.wait.beautifulWork');
          waitHint = t('prayer.hint.tomorrowMorning');
        } else {
          // Evening done but morning still pending — don't claim the whole day
          // is finished. Nudge the user that morning is still open (per user).
          waitLabel = t('prayer.wait.morningAwaits');
          waitHint = t('prayer.hint.morningAwaits');
        }
      } else {
        // Before 18:00 → countdown to today's 18:00.
        const target = new Date(now); target.setHours(18, 0, 0, 0);
        waitLabel = t('prayer.wait.nightCountdown', { countdown: formatCountdown(target.getTime() - now.getTime()) });
        waitHint = t('prayer.hint.nightOpens');
      }
    }
  }
  const greeting = hr < 5 ? t('prayer.greeting.eveningCap')
    : hr < 12 ? t('prayer.greeting.morningCap')
    : hr < 18 ? t('prayer.greeting.afternoonCap')
    : t('prayer.greeting.eveningCap');

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
  // Pct text — always ROSE pink per user, regardless of progress value.
  // (Previously the color interpolated to lavender past 50 % to match the
  // bar gradient; the user prefers a single consistent accent here.)
  const pctTextStyle = useAnimatedStyle(() => ({
    color: ROSE,
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
    // Chip sits INSIDE the container's 2 px padding (top/bottom/left: 2),
    // so its usable width is `outerWidth − padding*2 (= 4 px) − border*2
    // (= 2 px)` split in half. The previous `(w / 2) + 1` math assumed
    // the chip was outside the border, which made the Evening half
    // overshoot the right edge by ~4 px (visible in user screenshot).
    const w = Math.max(0, (toggleWidth.value - 6) / 2);
    return {
      width: w,
      transform: [{ translateX: progress.value * w }],
      // SOLID fill — matches PlanScreen's Current/Explore/Completed segmented
      // control (filled pill + white text), per user "make it identical". Keeps
      // morning=ROSE / evening=LAV so the toggle still tracks the time-of-day
      // theme of the hero card directly below it.
      backgroundColor: interpolateColor(progress.value, [0, 1], [ROSE, LAV]),
    };
  });
  // Active label → white (on the solid pill); inactive → TXTSUB. Mirrors
  // PlanScreen.tabText's active '#fff' / inactive TXTSUB exactly.
  const morningTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ['#FFFFFF', TXTSUB]),
  }));
  const eveningTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [TXTSUB, '#FFFFFF']),
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
      <TabSection delay={0}>
      <View style={styles.header}>
        <View style={{ marginTop: 15, marginLeft: 8 }}>
          <Text style={styles.dateText}>{dateStr.toUpperCase()}</Text>
          <Text style={styles.greetText}>{greeting}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Streak')} style={styles.streakBadge}>
            <View style={styles.streakFlame}>
              <FireFlame size={24} />{/* 28 → 24 (-15 % per user); chip unchanged, stays centered */}
            </View>
            <View ref={streakRef} collapsable={false}>
              <Animated.Text style={[styles.streakNum, streakNumStyle]}>{displayedStreak}</Animated.Text>
            </View>
            {/* Sweeping orange→red border that orbits the badge twice in
                the first ~5 s after entering the screen, then fades. The
                values mirror styles.streakBadge so any width/height/radius
                tweak there must be reflected here too. */}
            <StreakBorderAnim width={63} height={34} borderRadius={17} />{/* matches streakBadge after the -10 % w / -15 % h resize */}
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
      </TabSection>

      {/* Progress bar */}
      <TabSection delay={30}>{/* 90 → 30 — see useTabFocusEntrance perf note */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{t('prayer.todaysProgress')}</Text>
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
          {/* Solid theme pink (ROSE) per user — no gradient. */}
          <Animated.View style={[styles.progressFill, progressFillStyle]} />
          <View style={styles.progressDivider} />
        </View>
      </View>
      </TabSection>

      {/* Morning/Evening toggle + hero card — animated as one group so the
          toggle and the card it controls lift together. */}
      <TabSection delay={60}>{/* 180 → 60 */}
      <View style={styles.toggle} onLayout={onToggleLayout}>
        {/* Soft-tint indicator — light ROSE / LAV fill at 12 % alpha, no
            border, no BlurView, no specular highlight. The frosted-glass
            treatment was retired per user; selection now reads via the
            tint colour + the text colour change alone. */}
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
                {t(isM ? 'prayer.toggle.morning' : 'prayer.toggle.evening')}{isM && mDone ? ' ✓' : ''}{!isM && eDone ? ' ✓' : ''}
              </Animated.Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Hero verse card. Inline paddingTop sets the toggle ↔ card gap;
          decoupled from the default 14-px `section` paddingTop so the other
          two section blocks below stay untouched. 11 → 13.2 → 18.2 → 15.2 (-3 px per user).
          paddingHorizontal: P + 2 (= 19) per user — card sits 2 px inside the
          default section gutter on each side. */}
      <View style={[styles.section, { paddingTop: 15.2, paddingHorizontal: P + 2 }]}>
        <VerseHeroCard
          morning={morning}
          canStart={canStart}
          canReplay={slotDone}
          readyToSwitch={readyToSwitch}
          onSwitchTab={() => setMorning(false)}
          offerPastDays={offerPastDays}
          onOfferPastDays={() => setShowPastPrompt(true)}
          waitLabel={waitLabel}
          waitHint={waitHint}
          bgSource={prayerBg.imageFor(morning ? 'morning' : 'evening')}
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

      {/* This Week section removed per user — kept this anchor so a future
          search for the label surfaces the intentional removal and doesn't
          trigger a "regression" re-add. */}

      {/* Psalms for You section removed per user — left this comment so a
          future search for the label still surfaces the intentional removal
          and doesn't trigger a "regression" re-add. */}

      {/* Gospel & Psalm — 89-day plan entry. Two cards (Morning + Evening)
          sit directly below the Start prayer CTA, above Plans In Progress. */}
      <View style={[styles.section, { paddingTop: 18 }]}>
        <GospelPsalmCards onOpen={(slot) => navigation.navigate('GospelPsalm', { slot })} />
      </View>

      {/* Plans In Progress — up to 2 active plans. Sits ABOVE Continue
          Reading per user; section title matches Continue Reading 1:1.
          The card on each row shows "Day N" (next day to read) instead of
          "Start", so the user knows exactly where to pick up. paddingTop 24 so
          the gap BETWEEN the Gospel&Psalm block and this one is larger than the
          gap within a block (title↔card 12) — clear block separation. */}
      <View style={[styles.section, { paddingTop: 24 }]}>
        <Text style={styles.sectionTitle}>{t('prayer.section.plansInProgress')}</Text>
        {inProgressPlanRows.length > 0 ? (
          inProgressPlanRows.map(p => {
            const completedDays = planRecords[p.slug]?.completedDays ?? [];
            const next = nextUncompletedDay(completedDays, p.duration_days);
            return (
              <PlanProgressCard
                key={p.slug}
                plan={p}
                dayLabel={t('plan.dayN', { n: next })}
                onPress={() => navigation.navigate('FeaturedPlanDetail', { slug: p.slug })}
              />
            );
          })
        ) : (
          <View style={styles.inProgressEmpty}>
            <Text style={styles.inProgressEmptyTitle}>{t('prayer.plansEmpty.title')}</Text>
            <Text style={styles.inProgressEmptyDesc}>{t('prayer.plansEmpty.desc')}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Tabs', { screen: 'plan', params: { tab: 'explore', reset: Date.now() } })}
              style={styles.inProgressExploreBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.inProgressExploreText}>{t('prayer.plansEmpty.cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Continue Reading — wrapped in a white card matching PlanProgressCard
          above (same #FFF bg, 9.8 radius, paddingVertical 11.4, shadow), so
          the home screen reads as a consistent stack of cards. Progress is
          shown as percentage + filled track on the right of the % — the
          track is `flex: 1` so it always spans the remaining width. */}
      {/* paddingTop → 25 per user — extra leading before the "Bible Reading
          Progress" heading only; the shared sectionTitle style stays
          untouched so "Plans In Progress" above is unaffected. */}
      <View style={[styles.section, { paddingTop: 25 }]}>
        <Text style={styles.sectionTitle}>{t('prayer.section.bibleProgress')}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Tabs', { screen: 'bible' })}
          activeOpacity={0.85}
          style={styles.continueRow}
        >
          <LinearGradient colors={['#F6B5D0', '#EB8BB6']} style={styles.continueIcon}>
            <Feather name="book-open" size={42} color="#fff" />
          </LinearGradient>
          <View style={styles.continueMeta}>
            <Text style={styles.continueTitle} numberOfLines={1} ellipsizeMode="tail">
              {continueBookName} · Chapter {lastRead.chapter}
            </Text>
            <View style={styles.continueProgressRow}>
              <Text style={styles.continuePct}>{continuePct}%</Text>
              <View style={styles.continueProgressTrack}>
                <View style={[styles.continueProgressFill, { width: `${continuePctWidth}%`, backgroundColor: ROSE }]} />
              </View>
            </View>
          </View>
          <Feather name="chevron-right" size={22} color={TXTSUB} />
        </TouchableOpacity>
      </View>
      </TabSection>

      <View style={{ height: insets.bottom + 23 }} />

      {/* Overlays are wrapped in Modal so they render on a separate native
          layer above the tab content. Earlier they sat as siblings of this
          ScrollView under a flex:1 wrapper, which broke ScrollView's "fill
          the screen" sizing — the screen rendered without its scrollable
          viewport and started to swallow taps in the lower half. */}
      <Modal
        visible={showShare && !!liveVerseRef && !!liveVerseText}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setShowShare(false)}
      >
        <ShareVerseSheet
          reference={liveVerseRef}
          text={liveVerseText}
          onClose={() => setShowShare(false)}
          // Pass the live prayer-bg image so the share card matches the
          // verse card the user just tapped — no more pink/lav placeholder.
          bgSource={prayerBg.imageFor(morning ? 'morning' : 'evening')}
        />
      </Modal>

      {/* "See past days" prompt — shown when the verse card is tapped during
          the 00:00–06:00 dead zone (morning not open, evening closed). Gives
          the user a way to revisit + re-pray past days instead of a dead card. */}
      <Modal visible={showPastPrompt} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowPastPrompt(false)}>
        <View style={styles.pastPromptOverlay}>
          <View style={styles.pastPromptCard}>
            <Text style={styles.pastPromptTitle}>{t('prayer.pastPrompt.title')}</Text>
            <Text style={styles.pastPromptBody}>{t('prayer.pastPrompt.body')}</Text>
            <TouchableOpacity
              style={styles.pastPromptConfirm}
              activeOpacity={0.85}
              onPress={() => { setShowPastPrompt(false); navigation.navigate('PastVerses'); }}
            >
              <Text style={styles.pastPromptConfirmText}>{t('prayer.pastPrompt.confirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pastPromptCancel} activeOpacity={0.7} onPress={() => setShowPastPrompt(false)}>
              <Text style={styles.pastPromptCancelText}>{t('prayer.pastPrompt.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!moreAnchor}
        transparent
        animationType="none"
        statusBarTranslucent
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
    fontSize: 12.65,                                                            // 11.50 → 12.65 (+10 % per user)
    color: TXTSUB,
    letterSpacing: 1.8,
    marginBottom: 0,                                                            // -5 → 0 (restored per user)
    fontFamily: FONTS.lora,
  },
  greetText: {
    fontSize: 25.34,                                                            // 23.04 → 25.34 (+10 % per user)
    fontWeight: '500',
    color: TXT,
    fontFamily: FONTS.loraBold,
    marginLeft: -3,                                                              // -3 px on this line only — parent wrapper marginLeft 8 stays for the date above
    marginTop: -3,                                                              // -3 px leading per user — tightens the gap below the date
    marginBottom: 7,                                                            // 2 → 7 (+5 px trailing per user) — opens the gap below "Good Morning"
  },
  // Header row — `gap: 0` and `avatar.marginLeft: -3` makes the pink avatar
  // circle sit ~3 px over the streak badge's right edge (about 5 % of the
  // avatar's 40 px width per user). The streak badge keeps its own size so
  // the flame + number aren't squeezed.
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  // Streak badge: width 70 → 63 (-10 %), height 40 → 34 (-15 %). Border
  // radius drops in step so the pill stays a perfect rounded chip. Flame
  // icon + number digit sizes are NOT touched per user — only the chip
  // background shrinks. If you tweak any of these, also update the
  // <StreakBorderAnim> props in the JSX so the SVG stroke tracks the
  // badge's actual edge.
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 6,
    gap: 2,
    width: 63,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  // marginTop -3 was -5 — flame slides DOWN 2 px per user (the previous
  // offset pulled it slightly above the digit baseline; the new value
  // centers it visually with the number).
  streakFlame: { marginTop: -3 },
  streakNum: { fontSize: 15.9, fontWeight: '700', color: TXT },                 // 18.7 → 15.9 (-15 % per user)
  // Avatar — stays 40×40 (user explicitly excluded the avatar from the
  // resize). `marginLeft: -3` overlaps the streak badge's right edge by
  // ~5 % of avatar width so the two chips read as a connected cluster
  // rather than two free-floating pills.
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: -3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Down from 22 → 18 to keep the 45 %-of-circle ratio the previous 50 px
  // avatar had (22/50 ≈ 0.44 → 18/40 = 0.45). 22 pt in a 40 px circle felt
  // crowded.
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  progressSection: {
    paddingHorizontal: P + 6,
    paddingTop: 5,                                                               // → 5 (per user — "Today's Progress" leading gap)
    marginTop: 5,                                                                // 0 → 5 (+5 px below "Good Morning" per user)
    marginBottom: 6,                                                             // 10 → 6 (-4 px after the progress bar, per user)
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,                                                            // → 3 (per user — gap between "Today's Progress" label and the bar)
  },
  // Today's Progress row — Lora 600 across both the label and the
  // percentage. Project rule: `FONTS.loraBold` always pairs with
  // `fontWeight: '600'`; weight 700 makes Android drop the Lora face and
  // fall back to system sans, which is the bug the previous '700' here
  // was producing.
  progressLabel: {
    fontSize: 12.80,
    fontWeight: '600',
    color: 'rgba(30,27,46,0.55)',
    letterSpacing: 1.2,
    fontFamily: FONTS.latoBold,                                                 // Lato 600 per user (latoBold + 600 — same pattern as the Morning/Evening toggle; Lato ships no distinct 600 face)
  },
  progressPct: {
    fontSize: 12.80,
    fontWeight: '600',
    fontFamily: FONTS.latoBold,                                                 // Lato 600 per user
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
  // Progress bar — height shrunk 10 → 6 (-40 % per user). The track's
  // corner radius drops in step so the rounded ends stay proportional.
  // `progressDivider`'s vertical insets shrink with it: 1.5 → 0.9, which
  // keeps the white midline visible at the same relative scale.
  progressTrack: {
    height: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(30,27,46,0.10)',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 7,
    backgroundColor: ROSE,                                                      // solid theme pink (was a pink→lavender→purple gradient)
  },
  progressDivider: {
    position: 'absolute',
    left: '50%',
    top: 0.9,
    bottom: 0.9,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 2,
  },
  // Morning / Evening toggle — outer wrap shrunk -15 % per user (not the
  // inner indicator chip, which keeps its inset-from-wrapper relationship
  // via top/bottom/left: 2). Outer dimensions:
  //   • padding 3 → 2 (saves 2 px total)
  //   • borderRadius 22 → 18 (proportional to the shorter pill)
  //   • button paddingVertical 9.35 → 7 (saves ~4.7 px total)
  // Net outer height: ~45 px → ~38 px (−15 %).
  toggle: {
    flexDirection: 'row',
    marginHorizontal: P,
    marginTop: 12,                                                               // 9 → 12 (+3 px before, per user)
    marginBottom: 0,                                                             // -3 → 0 (+3 px after, per user)
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 18,
    padding: 2,
    position: 'relative',
  },
  toggleIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 15,
  },
  // Inner pill — paddingVertical 8.5 to match PlanScreen.tab 1:1 (was 7), so
  // the Morning/Evening strip is exactly the same height as Current/Explore/
  // Completed. radius 15 + the container's radius 18 / padding 2 already match.
  toggleBtn: {
    flex: 1,
    paddingVertical: 8.5,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 17.28,                                                             // 16 → 17.28 (+8 % per user)
    fontWeight: '600',
    fontFamily: FONTS.latoBold,
  },
  section: {
    paddingHorizontal: P,
    paddingTop: 14,
  },
  heroCard: {
    borderRadius: 9.18,                                                         // 14 → 9.8 → 5.88 → 7.06 → 9.18 (+30 % per user)
    overflow: 'hidden',
    // Subtle drop shadow per user (-30 % vs a normal card shadow). iOS
    // accepts a shadow on the same node; no Android elevation because it
    // renders as a gray rectangle during react-navigation tab transitions
    // (same artifact we removed from ProfileScreen's cards).
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.084,                                                       // 0.12 → 0.084 (-30 %)
    shadowRadius: 5.6,                                                          // 8 → 5.6 (-30 %)
    // Fallback background while the CDN photo is still downloading on the
    // first launch — keeps the card from flashing the screen's gray as the
    // <ImageBackground> mounts. The tonal gradient renders on top so the
    // user sees a tinted card, then the photo fades in once it's cached.
    backgroundColor: '#2D0A1A',
  },
  heroCardImage: {
    // Photo must respect the same corner radius as the outer card so the
    // veil + content composite cleanly. Without this, RN draws the image at
    // its native rectangle and clips behind the rounded mask, which can
    // ghost a 1-px hairline on the corners during the tab transition.
    borderRadius: 9.18,
  },
  // All text-to-card-edge distances trimmed −3 px per user. The hero card
  // has three horizontal-padding gates: `heroTop` (label + ref), `heroBody`
  // (verse text), `heroActions` (action labels). Each one drops by 3 on
  // both sides — kept asymmetric where it was (heroTop's left padding was
  // +4 vs right, so it stays +4 after the trim).
  heroTop: {
    paddingTop: 22,
    paddingBottom: 0,
    paddingLeft: 19,                                                            // 23 → 19 — aligns label/ref left edge with the verse body (heroBody paddingHorizontal: 19) per user
    paddingRight: 19,                                                            // matches heroBody right padding too
  },
  heroLabel: {
    fontSize: 12.52,                                                            // 13.91 × 0.9 (-10 % per user, second round)
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 5,
  },
  heroRefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  heroRef: {
    fontSize: 18.3,                                                              // 20.33 × 0.9 (-10 %)
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  heroRefChev: {
    marginLeft: 4,
    marginTop: 2,
  },
  heroBody: {
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 19,                                                       // 22 → 19 (-3)
  },
  heroText: {
    fontFamily: FONTS.merriweather,                                            // Merriweather per user — matches the reader body face
    fontSize: 19.16,                                                             // 20.60 × 0.93 (-7 % per user). Affects both Verse of the Day + Verse of the Night cards (same hero component)
    lineHeight: 29.59,                                                           // 31.82 × 0.93 — line-height scales in step so wrapped verses keep their open rhythm
    color: 'rgba(255,255,255,0.96)',
  },
  heroActions: {
    flexDirection: 'row',
    paddingHorizontal: 6,                                                        // 9 → 6 (-3)
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
    fontSize: 11.17,                                                             // another +10 % (9.23→10.15→11.17) per user; icons unchanged
    fontWeight: '700',                                                           // bolder per user (was 500)
    letterSpacing: 0.3,
  },
  // No `marginHorizontal` — the parent `section` already insets by P, so
  // alignSelf: 'stretch' here makes the button span the same width as the
  // hero card above it. Adding margin would inset the button an extra P on
  // each side, leaving it 2 × P narrower than the card (the previous
  // mismatch the design called out).
  startBtn: {
    marginTop: 11,                      // → 11 (per user — card ↔ Start CTA gap)
    marginBottom: 10,
    height: 46.94,                      // 49.41 → 46.94 (-5 % per user)
    borderRadius: 17.07,                // 24.39 → 17.07 (-30 % per user)
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
    borderRadius: 16.8,                 // 24 → 16.8 (-30 % per user)
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitBtnText: {
    fontSize: 17.28,                    // 16 × 1.08 (+8 % per user)
    fontWeight: '600',                  // 700 → 600 paired with Lato bold per user
    letterSpacing: 0.3,
    fontFamily: FONTS.latoBold,         // was system default sans — now Lato bold per user
  },
  // Wait-state hint — centered viewport toast.
  // `hintOverlay` is the full-screen tap-to-dismiss scrim (very light tint —
  // this isn't a critical modal, just a friendly nudge).
  // `hintCard` is the floating message card itself.
  hintOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,16,28,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  hintCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 18,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  hintText: {
    color: TXT,
    fontSize: 15,
    lineHeight: 22,
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
    fontSize: 19.85,                                                          // 16 → 18 → 19.85 — Lora bold per latest design
    fontWeight: '600',                                                        // Lora bold rule: pair `loraBold` with `'600'`, not `'700'`
    color: TXT,
    fontFamily: FONTS.loraBold,
  },
  // "See past days" dead-zone prompt (app-styled centered dialog).
  pastPromptOverlay: {
    flex: 1, backgroundColor: 'rgba(30,27,46,0.45)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  pastPromptCard: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingHorizontal: 22, paddingTop: 22, paddingBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 18, elevation: 10,
  },
  pastPromptTitle: { fontSize: 19, fontWeight: '700', color: TXT, textAlign: 'center', marginBottom: 10, fontFamily: FONTS.loraBold },
  pastPromptBody: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', marginBottom: 20 },
  pastPromptConfirm: { height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  pastPromptConfirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pastPromptCancel: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  pastPromptCancelText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
  // "Plans In Progress" empty state — pink-tinted card with a one-line nudge
  // and a primary CTA that drops the user into the Plan tab to pick a plan.
  // Keeps the home screen feeling alive even when the user has zero active
  // plans.
  inProgressEmpty: {
    marginTop: 12,
    backgroundColor: 'rgba(232,97,154,0.06)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'flex-start',
  },
  inProgressEmptyTitle: {
    fontSize: 17.28,                                                            // 16 × 1.08 (+8 % per user)
    fontWeight: '600',
    color: TXT,
    fontFamily: FONTS.loraBold,
    marginBottom: 6,
  },
  inProgressEmptyDesc: {
    fontSize: 15.12,                                                            // 14 × 1.08 (+8 % per user)
    color: TXTSUB,
    fontFamily: FONTS.lato,
    lineHeight: 21.6,                                                           // 20 × 1.08 to keep rhythm
    marginBottom: 14,
  },
  inProgressExploreBtn: {
    alignSelf: 'stretch',
    backgroundColor: ROSE,
    borderRadius: 22,
    paddingVertical: 11,
    alignItems: 'center',
  },
  inProgressExploreText: {
    color: '#fff',
    fontSize: 16.2,                                                             // 15 × 1.08 (+8 % per user)
    fontWeight: '700',
    letterSpacing: 0.3,
    fontFamily: FONTS.latoBold,
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
  // White card matching PlanProgressCard byte-for-byte: same #FFF bg, same
  // 9.8 radius, same paddingVertical 11.4 / paddingHorizontal 12, same
  // marginTop 12, and the same light shadow (height 1 / opacity 0.03 /
  // radius 3 / elevation 1). Keeps the home screen visually cohesive: the
  // "Plans In Progress" cards and "Bible Reading Progress" card are now
  // one continuous design language.
  continueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 9.8,
    paddingVertical: 11.4,
    paddingHorizontal: 12,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  continueIcon: {
    width: 92.15,                    // match PlanProgressCard's cover (92.15² ) so this card's
    height: 92.15,                   // height equals the Plans-in-Progress card exactly
    borderRadius: 10,                // match PlanProgressCard cover radius (was 13)
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  continueMeta: { flex: 1 },
  continueProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,                                                               // 1 → 6 (+5 px per user) — extra breathing room between title and bar
  },
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
  continueTitle: {                   // card title ("Joshua · Chapter 12")
    fontSize: 17.28,                  // 16 × 1.08 (+8 % per user)
    fontWeight: '600',
    color: TXT,
    fontFamily: FONTS.latoBold,                                                // Lato per user (was Lora); latoBold + 600 = the app's "Lato 600"
    marginBottom: 4,                                                           // breathing room before the progress row (was 0; single-line + ellipsis now)
  },
  continueProgressTrack: {
    flex: 1,                                                                     // sits to the right of the % label and fills the remaining row width — without `flex: 1` the View collapsed to 0 px and the bar was invisible
    marginRight: '10%',                                                          // trim the right end so the bar stops ~10% short of the card edge (per user) — shorter, less stretched
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
    fontSize: 15.12,                 // 14 × 1.08 (+8 % per user)
    fontFamily: FONTS.latoBold,      // Lato per user (was Noto bold)
  },
});
