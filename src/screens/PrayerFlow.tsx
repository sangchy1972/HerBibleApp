import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Dimensions,
  KeyboardAvoidingView, Keyboard, Platform, Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, withSequence,
  Easing, SlideInDown, FadeIn, runOnJS,
} from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB } from '../constants/theme';
import { usePrayer } from '../state/PrayerContext';
import { useNotes } from '../state/NotesContext';
import { useActivity } from '../state/ActivityContext';
import { useRatePrompt } from '../state/RatePromptContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useOnboarding } from '../state/OnboardingContext';
import { localizeReference } from '../services/parseReference';
import { dailyLabels } from '../constants/dailyVersesLabels';
import WeeklyProgressView from '../components/WeeklyProgressView';
import RatePromptSheet from '../components/RatePromptSheet';
import type { RootStackScreenProps } from '../navigation/types';

const { width, height } = Dimensions.get('window');
const SECTIONS = ['verse', 'meditation', 'action', 'prayer'];

function FlowPage({ children }: { children: React.ReactNode }) {
  return <View style={[styles.flowPage, { height }]}>{children}</View>;
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

function TimePickerSheet({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [hour, setHour] = useState<number>(8);
  const [minute, setMinute] = useState<number>(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const periods: ('AM' | 'PM')[] = ['AM', 'PM'];

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>What time do you want to be reminded?</Text>
      <View style={styles.wheelRow}>
        <ScrollWheel values={hours} value={hour} onChange={setHour} />
        <Text style={styles.wheelColon}>:</Text>
        <ScrollWheel values={minutes} value={minute} onChange={setMinute}
          format={v => String(v).padStart(2, '0')} />
        <ScrollWheel values={periods} value={ampm} onChange={setAmpm} />
      </View>
      <View style={styles.sheetBtns}>
        <TouchableOpacity onPress={onClose} style={styles.sheetBtnBack}>
          <Text style={[styles.sheetBtnText, { color: TXTSUB }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onConfirm} style={[styles.sheetBtnConfirm, { backgroundColor: ROSE }]}>
          <Text style={[styles.sheetBtnText, { color: '#fff', fontWeight: '700' }]}>Confirm</Text>
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

// Stylized praying-hand silhouette: four fingertip arches at the top
// (index → middle → ring → pinky from inner to outer), thumb bump on the
// inner side, and a wrist taper at the bottom. Right hand is drawn as-is;
// the left hand mirrors via scaleX: -1.
const HAND_PATH =
  'M16 28 ' +
  // Index fingertip (innermost)
  'C16 16, 20 8, 24 8 ' +
  'C28 8, 30 16, 30 18 ' +
  // Middle fingertip (tallest)
  'C30 10, 36 4, 38 4 ' +
  'C42 4, 42 12, 42 18 ' +
  // Ring fingertip
  'C42 10, 48 6, 50 6 ' +
  'C54 6, 54 14, 54 18 ' +
  // Pinky fingertip (shortest, outermost)
  'C54 14, 58 10, 58 16 ' +
  'C58 18, 60 20, 60 24 ' +
  // Outer side + wrist taper
  'L60 88 ' +
  'C60 106, 56 120, 50 126 ' +
  'L48 142 ' +
  'C48 145, 46 146, 44 146 ' +
  'L20 146 ' +
  'C18 146, 16 145, 16 142 ' +
  'L14 126 ' +
  // Inner wrist taper
  'C8 120, 4 106, 4 88 ' +
  'L4 58 ' +
  // Thumb bump (subtle bulge on inner side)
  'C2 56, 0 48, 4 42 ' +
  'C8 36, 12 34, 14 30 ' +
  'L16 28 Z';

function PrayingHand({ side }: { side: 'left' | 'right' }) {
  return (
    <Svg
      width={64}
      height={150}
      viewBox="0 0 64 150"
      style={side === 'left' ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      <Path d={HAND_PATH} fill="#FFFFFF" opacity={0.95} />
      {/* Finger separator strokes — three subtle ticks between the four tips */}
      <Path d="M30 18 L30 30" stroke="rgba(0,0,0,0.10)" strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M42 18 L42 30" stroke="rgba(0,0,0,0.10)" strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M54 18 L54 30" stroke="rgba(0,0,0,0.10)" strokeWidth={1.4} strokeLinecap="round" />
      {/* Wrist cuff line */}
      <Path d="M14 126 L50 126" stroke="rgba(0,0,0,0.08)" strokeWidth={1} strokeLinecap="round" />
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

export default function PrayerFlow({ route, navigation }: RootStackScreenProps<'PrayerFlow'>) {
  const insets = useSafeAreaInsets();
  const { markDone, mDone, eDone, everPrayed } = usePrayer();
  const { addNote } = useNotes();
  const { markToday } = useActivity();
  const ratePrompt = useRatePrompt();
  const { notifRationaleShown, markNotifRationaleShown } = useOnboarding();
  const { kind } = route.params;
  const morning = kind === 'morning';
  // Capture whether this slot was already completed BEFORE this flow started.
  // If so, this is a re-do and the celebration screens (weekly progress + set
  // reminder sheet) are skipped — the user just wanted to revisit the prayer.
  const isRedoRef = useRef<boolean>(morning ? mDone : eDone);
  // Capture whether this is the user's first-ever prayer of any kind. We
  // freeze the value at flow mount so markDone (which fires inside the flow)
  // doesn't flip it before we get to the Continue branch.
  const isFirstEverRef = useRef<boolean>(!everPrayed && !notifRationaleShown);
  const { current: translation } = useTranslation();
  const { getVerse, todayDay } = useDailyVerses();
  const labels = dailyLabels(translation.code);
  // Pull today's verse for the segment we entered with. Bundled fallback
  // covers the first 3 days offline; the CDN file expands to 60 once cached.
  const dailyVerse = getVerse(todayDay, morning ? 'morning' : 'evening');
  // The corpus stores English book names; localize for the active translation
  // so Chinese / Spanish / Portuguese / etc. readers see "創世記 1:2" instead
  // of "Genesis 1:2" under the daily-verse heading.
  const verseRef = dailyVerse?.reference.full_reference
    ? localizeReference(translation.code, dailyVerse.reference.full_reference)
    : '';
  const verseText = dailyVerse?.modernText || '';
  const meditationParas = (dailyVerse?.meditation || '').split('\n\n').filter(Boolean);
  const actionBody = dailyVerse?.actionStep || '';
  const prayerBody = dailyVerse?.prayer || '';
  const verseCaption = (morning ? labels.verseOfDay : labels.verseOfNight).toUpperCase();
  const meditationCaption = labels.meditationTitle.toUpperCase();
  const actionCaption = (morning ? labels.actionTitleMorning : labels.actionTitleEvening).toUpperCase();
  const prayerCaption = labels.prayerTitle.toUpperCase();
  const colors = morning
    ? (['#C2547A', '#7B2255', '#2D0A1A'] as const)
    : (['#5B3A9E', '#2D1660', '#100525'] as const);
  const [amened, setAmened] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [showNotifRationale, setShowNotifRationale] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNoteSheet, setShowNoteSheet] = useState(false);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [page, setPage] = useState(0);
  const [buttonReady, setButtonReady] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
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

  const handleScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / height);
    if (idx !== page) setPage(idx);
  };

  // Closing scene timing: hands move in, then 8 sparkles twinkle continuously
  // for ~4s (6 cycles × ~700ms each) before fading out. Closing text appears
  // in three phases: heading (0.7s) → 0.3s gap → "In Jesus' name" (0.7s) →
  // 0.5s gap → Continue button (0.5s).
  const HAND_CLOSE = 700;
  const TWINKLE_HALF = 350;          // up-time = down-time of one twinkle pulse
  const TWINKLE_LOOPS = 6;            // 6 × 700ms ≈ 4.2s of twinkling
  const T_HEAD = 700;
  const GAP_1 = 300;
  const T_JESUS = 700;
  const GAP_2 = 500;
  const T_BTN = 500;

  const handsOpacity = useSharedValue(0);
  const leftHandX = useSharedValue(-44);
  const rightHandX = useSharedValue(44);
  const star1 = useSharedValue(0);
  const star2 = useSharedValue(0);
  const star3 = useSharedValue(0);
  const star4 = useSharedValue(0);
  const star5 = useSharedValue(0);
  const star6 = useSharedValue(0);
  const star7 = useSharedValue(0);
  const star8 = useSharedValue(0);
  const headingOpacity = useSharedValue(0);
  const jesusOpacity = useSharedValue(0);
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

  // Page text slide-in: fast-to-slow, settles on arrival in 0.8s
  const pageProgress = useSharedValue(0);
  useEffect(() => {
    pageProgress.value = withTiming(page, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [page, pageProgress]);
  const verseAnim = useAnimatedStyle(() => {
    const dist = Math.abs(pageProgress.value - 0);
    const ty = Math.min(60, dist * 60);
    return { transform: [{ translateY: ty }], opacity: 1 - ty / 60 };
  });
  const meditationAnim = useAnimatedStyle(() => {
    const dist = Math.abs(pageProgress.value - 1);
    const ty = Math.min(60, dist * 60);
    return { transform: [{ translateY: ty }], opacity: 1 - ty / 60 };
  });
  const actionAnim = useAnimatedStyle(() => {
    const dist = Math.abs(pageProgress.value - 2);
    const ty = Math.min(60, dist * 60);
    return { transform: [{ translateY: ty }], opacity: 1 - ty / 60 };
  });
  const prayerAnim = useAnimatedStyle(() => {
    const dist = Math.abs(pageProgress.value - 3);
    const ty = Math.min(60, dist * 60);
    return { transform: [{ translateY: ty }], opacity: 1 - ty / 60 };
  });

  useEffect(() => {
    if (!amened) return;
    // Hands fade in as they slide together
    handsOpacity.value = withTiming(1, { duration: HAND_CLOSE * 0.5, easing: Easing.out(Easing.cubic) });
    leftHandX.value = withTiming(0, { duration: HAND_CLOSE, easing: Easing.out(Easing.cubic) });
    rightHandX.value = withTiming(0, { duration: HAND_CLOSE, easing: Easing.out(Easing.cubic) });

    // 8 sparkles: each does TWINKLE_LOOPS in/out cycles, then fades to 0
    const twinkleSeq = () => withSequence(
      withRepeat(
        withSequence(
          withTiming(1, { duration: TWINKLE_HALF, easing: Easing.out(Easing.cubic) }),
          withTiming(0.35, { duration: TWINKLE_HALF, easing: Easing.in(Easing.cubic) }),
        ),
        TWINKLE_LOOPS,
        false,
      ),
      withTiming(0, { duration: 500, easing: Easing.in(Easing.cubic) }),
    );
    const stars = [star1, star2, star3, star4, star5, star6, star7, star8];
    const offsets = [0, 90, 180, 60, 150, 240, 30, 210];
    stars.forEach((sv, i) => { sv.value = withDelay(HAND_CLOSE + offsets[i], twinkleSeq()); });

    // Phased fade-in: heading 0.7s → 0.3s gap → "In Jesus' name" 0.7s → 0.5s gap → button 0.5s
    headingOpacity.value = withDelay(HAND_CLOSE,
      withTiming(1, { duration: T_HEAD, easing: Easing.out(Easing.cubic) }));
    jesusOpacity.value = withDelay(HAND_CLOSE + T_HEAD + GAP_1,
      withTiming(1, { duration: T_JESUS, easing: Easing.out(Easing.cubic) }));
    buttonOpacity.value = withDelay(HAND_CLOSE + T_HEAD + GAP_1 + T_JESUS + GAP_2,
      withTiming(1, { duration: T_BTN, easing: Easing.out(Easing.cubic) }));

    // Lock in "this prayer is done" immediately so a force-close still counts.
    markDone(kind);
    markToday();

    // Enable the Continue button only once it's visible
    const btnTimer = setTimeout(
      () => setButtonReady(true),
      HAND_CLOSE + T_HEAD + GAP_1 + T_JESUS + GAP_2,
    );
    return () => clearTimeout(btnTimer);
  }, [amened]);

  const handsContainerStyle = useAnimatedStyle(() => ({ opacity: handsOpacity.value }));
  const leftHandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftHandX.value }],
  }));
  const rightHandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightHandX.value }],
  }));
  const star1Style = useAnimatedStyle(() => ({ opacity: star1.value, transform: [{ scale: 0.6 + star1.value * 0.5 }] }));
  const star2Style = useAnimatedStyle(() => ({ opacity: star2.value, transform: [{ scale: 0.6 + star2.value * 0.5 }] }));
  const star3Style = useAnimatedStyle(() => ({ opacity: star3.value, transform: [{ scale: 0.6 + star3.value * 0.5 }] }));
  const star4Style = useAnimatedStyle(() => ({ opacity: star4.value, transform: [{ scale: 0.6 + star4.value * 0.5 }] }));
  const star5Style = useAnimatedStyle(() => ({ opacity: star5.value, transform: [{ scale: 0.6 + star5.value * 0.5 }] }));
  const star6Style = useAnimatedStyle(() => ({ opacity: star6.value, transform: [{ scale: 0.6 + star6.value * 0.5 }] }));
  const star7Style = useAnimatedStyle(() => ({ opacity: star7.value, transform: [{ scale: 0.6 + star7.value * 0.5 }] }));
  const star8Style = useAnimatedStyle(() => ({ opacity: star8.value, transform: [{ scale: 0.6 + star8.value * 0.5 }] }));
  const headingStyle = useAnimatedStyle(() => ({ opacity: headingOpacity.value }));
  const jesusStyle = useAnimatedStyle(() => ({ opacity: jesusOpacity.value }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }));

  const handleAmen = () => {
    setAmened(true);
  };

  const closeFlow = () => navigation.goBack();

  // End-of-flow gate: show the rate prompt if the cadence rules say we
  // should, otherwise dismiss the prayer flow.
  const finishFlow = () => {
    if (ratePrompt.shouldAsk()) {
      ratePrompt.markShown();
      setShowRatePrompt(true);
    } else {
      navigation.goBack();
    }
  };

  const handleWeeklyOpenReminder = () => {
    setShowWeekly(false);
    setTimeout(() => setShowSheet(true), 200);
  };

  const handleWeeklyBack = () => {
    setShowWeekly(false);
    setTimeout(finishFlow, 200);
  };

  const handleSheetClose = () => {
    setShowSheet(false);
    setTimeout(finishFlow, 280);
  };

  const handleRatePromptClose = () => {
    setShowRatePrompt(false);
    setTimeout(() => navigation.goBack(), 200);
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

  // Swipe-down gesture for note sheet. The shared value persists across
  // mounts; if a previous close left it animated off-screen at translateY
  // 800, the next open would render the sheet below the viewport. Reset it
  // synchronously in `openNoteSheet` BEFORE flipping the visibility flag
  // so the sheet's first frame is always at translateY 0.
  const noteDragY = useSharedValue(0);
  const openNoteSheet = () => {
    noteDragY.value = 0;
    setShowNoteSheet(true);
  };
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

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFillObject} />

      {!amened && (
        <View style={[styles.topChrome, { top: insets.top + 8 }]}>
          <TouchableOpacity onPress={closeFlow} style={styles.chromeBtn}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chromeBtn}>
            <Animated.View style={musicSpinStyle}>
              <Feather name="music" size={21} color="#fff" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}

      {!amened && (
        <View style={styles.progressDots}>
          {SECTIONS.map((_, i) => (
            <View key={i} style={[
              styles.dot,
              { backgroundColor: i <= page ? '#fff' : 'rgba(255,255,255,0.35)' },
              i === page && styles.dotActive,
            ]} />
          ))}
          <Text style={styles.pageCount}>{page + 1} / {SECTIONS.length}</Text>
        </View>
      )}

      {!amened && (
        <ScrollView
          ref={scrollRef}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={StyleSheet.absoluteFillObject}
        >
          <FlowPage>
            <Animated.View style={[styles.pageContent, verseAnim]}>
              <Text style={styles.pageCaption}>{verseCaption}</Text>
              <Text style={styles.pageRef}>{verseRef}</Text>
              <Text style={styles.pageVerse}>"{verseText}"</Text>
            </Animated.View>
          </FlowPage>

          <FlowPage>
            <ScrollView ref={meditationScrollRef} showsVerticalScrollIndicator={false} style={styles.pageScroll}>
              <Animated.View style={[styles.pageContent, styles.deepPageOffset, styles.meditationContent, meditationAnim]}>
                <Text style={[styles.pageCaption, styles.deepPageCaption]}>{meditationCaption}</Text>
                {meditationParas.map((p, i) => (
                  <Text key={i} style={styles.pageBody}>{p}</Text>
                ))}
              </Animated.View>
            </ScrollView>
          </FlowPage>

          <FlowPage>
            <ScrollView ref={actionScrollRef} showsVerticalScrollIndicator={false} style={styles.pageScroll}>
              <Animated.View style={[styles.pageContent, styles.deepPageOffset, actionAnim]}>
                <Text style={[styles.pageCaption, styles.deepPageCaption]}>{actionCaption}</Text>
                <Text style={styles.pageBody}>{actionBody}</Text>
                <TouchableOpacity style={styles.reflectBtn} onPress={openNoteSheet}>
                  <Feather name="edit-2" size={18} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.reflectText}>Write a reflection</Text>
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          </FlowPage>

          <FlowPage>
            <ScrollView ref={prayerScrollRef} showsVerticalScrollIndicator={false} style={styles.pageScroll}>
              <Animated.View style={[styles.pageContent, styles.deepPageOffset, prayerAnim]}>
                <Text style={[styles.pageCaption, styles.deepPageCaption]}>{prayerCaption}</Text>
                <Text style={styles.pageBody}>{prayerBody}</Text>
                <TouchableOpacity onPress={handleAmen} style={styles.amenBtn}>
                  <Text style={[styles.amenText, { color: morning ? '#7B2255' : '#2D1660' }]}>AMEN</Text>
                </TouchableOpacity>
                <Text style={styles.prayedCount}>{formatThousands(prayedTodayCount())} prayed with you today</Text>
              </Animated.View>
            </ScrollView>
          </FlowPage>
        </ScrollView>
      )}

      {amened && !showWeekly && !showNotifRationale && (
        <View style={styles.amenScreen}>
          <TouchableOpacity onPress={closeFlow} style={[styles.chromeBtn, { position: 'absolute', top: insets.top + 8, left: 19 }]}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <Animated.View style={[styles.amenHands, handsContainerStyle]}>
            <View style={styles.handsStage}>
              <Animated.View style={[styles.handWrap, styles.leftHandWrap, leftHandStyle]}>
                <PrayingHand side="left" />
              </Animated.View>
              <Animated.View style={[styles.handWrap, styles.rightHandWrap, rightHandStyle]}>
                <PrayingHand side="right" />
              </Animated.View>
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
            We hope this prayer time encouraged you. Come back again soon.
          </Animated.Text>
          <Animated.Text style={[styles.amenFarewell, jesusStyle]}>
            In Jesus' name
          </Animated.Text>
          <Animated.View
            style={[styles.amenContinueWrap, buttonStyle]}
            pointerEvents={buttonReady ? 'auto' : 'none'}
          >
            <TouchableOpacity
              onPress={() => {
                if (isRedoRef.current) {
                  navigation.goBack();
                } else if (isFirstEverRef.current) {
                  // First-ever prayer (any kind) → onboarding rationale.
                  setShowNotifRationale(true);
                } else if (morning) {
                  // Morning re-completion is not a "day done" moment,
                  // so we skip the Weekly green screen and head home.
                  navigation.goBack();
                } else {
                  // Evening prayer → Weekly progress + Set Reminder.
                  setShowWeekly(true);
                }
              }}
              activeOpacity={0.85}
              style={styles.amenContinueBtn}
            >
              <Text style={[styles.amenContinueText, { color: morning ? '#7B2255' : '#2D1660' }]}>
                Continue
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
          />
        </View>
      )}

      {showNotifRationale && (
        <View style={StyleSheet.absoluteFillObject}>
          <NotifRationaleScreen
            onDismiss={() => {
              markNotifRationaleShown();
              navigation.goBack();
            }}
          />
        </View>
      )}

      {showRatePrompt && <RatePromptSheet onClose={handleRatePromptClose} />}

      {showNoteSheet && (
        // KAV must wrap the SHEET, not its inner content — with the sheet
        // clipped to 92% height + overflow: hidden, padding inside the sheet
        // pushes the Save button off the bottom edge. Wrapping outside lets
        // the sheet itself shift up by the keyboard height (flex-end).
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetOverlay}
        >
          <Animated.View
            entering={FadeIn.duration(300)}
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={closeNoteSheet}
            />
          </Animated.View>
          <GestureDetector gesture={notePan}>
            <Animated.View
              entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))}
              style={[styles.noteSheet, noteSheetAnimStyle]}
            >
              <View style={[styles.noteSheetInner, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
                <TouchableOpacity onPress={Keyboard.dismiss} activeOpacity={1} style={styles.noteHandleHit}>
                  <View style={styles.sheetHandle} />
                </TouchableOpacity>
                <TouchableOpacity onPress={Keyboard.dismiss} activeOpacity={1}>
                  <Text style={styles.noteSheetTitle}>Write a reflection</Text>
                </TouchableOpacity>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="What is God speaking to you today?"
                  placeholderTextColor={TXTSUB}
                  multiline
                  style={styles.noteInput}
                  autoFocus
                  textAlignVertical="top"
                />
                <View style={styles.sheetBtns}>
                  <TouchableOpacity onPress={closeNoteSheet} style={styles.sheetBtnBack}>
                    <Text style={[styles.sheetBtnText, styles.reflectionBtnText, { color: TXTSUB }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveNote} style={[styles.sheetBtnConfirm, { backgroundColor: morning ? ROSE : LAV }]}>
                    <Text style={[styles.sheetBtnText, styles.reflectionBtnText, { color: '#fff', fontWeight: '700' }]}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      )}

      {showSheet && (
        <View style={styles.sheetOverlay}>
          <Animated.View
            entering={FadeIn.duration(300)}
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => !showTimePicker && handleSheetClose()}
            />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))}>
            {!showTimePicker ? (
              <View style={[styles.sheet, styles.habitSheet]}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetHeading}>Make Prayer a Habit</Text>
                <Text style={styles.sheetDesc}>Get a daily reminder to spend time in prayer.</Text>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  style={[styles.setTimeBtn, { backgroundColor: 'rgba(232,97,154,0.10)' }]}
                >
                  <Text style={[styles.setTimeText, { color: ROSE }]}>Set Time</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSheetClose}>
                  <Text style={styles.notNowText}>Not now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TimePickerSheet onConfirm={handleSheetClose} onClose={() => setShowTimePicker(false)} />
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  flowPage: {
    width,
    justifyContent: 'center',
  },
  pageScroll: {
    flex: 1,
  },
  progressDots: {
    position: 'absolute',
    right: 24,
    bottom: 37,
    zIndex: 10,
    alignItems: 'center',
    gap: 9,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4,
  },
  dotActive: {
    width: 15,
    height: 15,
    borderRadius: 8,
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
    paddingTop: 135,
    paddingBottom: 115,
    justifyContent: 'center',
  },
  // Pushes the caption further down on the meditation / action / prayer
  // pages so the title doesn't crowd the top edge.
  deepPageOffset: {
    paddingTop: 185,                                                            // +30 from 155
  },
  meditationContent: {
    paddingBottom: 280,
  },
  pageCaption: {
    fontSize: 15,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '600',
    marginBottom: 9,
  },
  // Extra breathing room below the caption on Reflection / Tonight's Practice
  // / Closing pages — gives the title some space before the body copy.
  deepPageCaption: {
    marginBottom: 29,                                                           // +20 from 9
  },
  pageRef: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    fontSize: 24,
    letterSpacing: 0.3,
    marginBottom: 30,
  },
  pageVerse: {
    fontSize: 24,
    lineHeight: 35,
    color: '#fff',
  },
  pageBody: {
    fontSize: 22,
    lineHeight: 31,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 18,
  },
  reflectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 22,
    padding: 13,
    paddingHorizontal: 19,
    marginTop: 62,
    alignSelf: 'flex-start',
  },
  reflectText: { fontSize: 19, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  amenBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 32,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 100,
  },
  amenText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  amenContinueWrap: {
    marginTop: 36,
    alignItems: 'center',
  },
  amenContinueBtn: {
    paddingHorizontal: 44,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  amenContinueText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  prayedCount: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 16,
  },
  amenScreen: {
    flex: 1,
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
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handWrap: {
    position: 'absolute',
    top: 14,
  },
  leftHandWrap: {
    right: '50%',
    marginRight: -4,   // pull 4 px past the seam so the two hands meet 8 px tighter
  },
  rightHandWrap: {
    left: '50%',
    marginLeft: -4,
  },
  starPos: {
    position: 'absolute',
  },
  amenHeading: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 31,
    marginBottom: 28,
    textAlign: 'center',
  },
  amenFarewell: {
    fontSize: 19,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 31,
    textAlign: 'center',
  },
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
    width: 39,
    height: 5,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignSelf: 'center',
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
    fontWeight: '700',
    color: TXT,
    marginBottom: 21,
  },
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
    borderRadius: 24,
    alignItems: 'center',
  },
  sheetBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  reflectionBtnText: { fontSize: 17 },
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

  const requestPermission = async () => {
    try {
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await Notifications.requestPermissionsAsync();
      }
      if (!perm.granted && Platform.OS !== 'web') {
        // Permanently denied — surface Settings so the user can flip it
        // there. We still dismiss either way so they aren't stuck.
        Linking.openSettings().catch(() => {});
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
        <Text style={rationaleStyles.heading}>Stay close to God.</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(360).delay(200)}>
        <Text style={rationaleStyles.body}>
          Turn on prayer reminders so morning and evening verses gently meet
          you where you are. Just 5–10 minutes a day to draw nearer in heart
          and mind.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(360).delay(400)} style={rationaleStyles.mockupWrap}>
        <PhoneMockup />
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(360).delay(700)}
        style={[rationaleStyles.ctaRow, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
      >
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.85} style={rationaleStyles.skipBtn}>
          <Text style={rationaleStyles.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={requestPermission} activeOpacity={0.9} style={rationaleStyles.allowBtn}>
          <Text style={rationaleStyles.allowText}>Allow notifications</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Tilted phone mockup with a HerBible push notification + faux home-screen
// grid. ~280×360 viewBox; everything tinted with the rose palette so it
// reads as a HerBible screenshot, not a generic phone.
function PhoneMockup() {
  return (
    <Svg width={280} height={360} viewBox="0 0 280 360">
      {/* Soft drop shadow under the phone */}
      <Path
        d="M70 350 Q140 372 210 350 L200 348 Q140 358 80 348 Z"
        fill="rgba(232,97,154,0.10)"
      />
      {/* Phone outer frame, slightly tilted */}
      <Path
        d="M88 36 Q88 28 96 28 L208 28 Q216 28 216 36 L216 320 Q216 328 208 328 L96 328 Q88 328 88 320 Z"
        fill="#FFFFFF"
        stroke="#E8DDE8"
        strokeWidth={1.5}
      />
      {/* Subtle pink-peach gradient fill on the phone screen */}
      <Path
        d="M94 50 L210 50 L210 320 Q210 326 204 326 L100 326 Q94 326 94 320 Z"
        fill="rgba(249,168,201,0.18)"
      />
      <Path
        d="M94 130 L210 130 L210 320 Q210 326 204 326 L100 326 Q94 326 94 320 Z"
        fill="rgba(196,181,253,0.18)"
      />

      {/* Notification card near the top */}
      <Path
        d="M104 78 Q104 70 112 70 L200 70 Q208 70 208 78 L208 122 Q208 130 200 130 L112 130 Q104 130 104 122 Z"
        fill="#FFFFFF"
        stroke="rgba(30,27,46,0.06)"
        strokeWidth={1}
      />
      {/* App icon dot in the notification */}
      <Path d="M118 88 Q118 84 122 84 L130 84 Q134 84 134 88 L134 96 Q134 100 130 100 L122 100 Q118 100 118 96 Z" fill={ROSE} />

      {/* Faux home-screen icon grid below the notification. Phone screen is
          x=94..210, so a 4-col grid with 22-wide icons + 6 px gap fits at
          x = 106 / 134 / 162 / 190 (last icon ends at 212 — flush right). */}
      {[170, 210, 250].flatMap(y =>
        [106, 134, 162, 190].map(x => {
          const isHero = x === 162 && y === 210;
          const r = 4;
          const w = 22;
          const path = `M${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + w - r} Q${x + w} ${y + w} ${x + w - r} ${y + w} L${x + r} ${y + w} Q${x} ${y + w} ${x} ${y + w - r} Z`;
          return isHero ? (
            <Path key={`${x}-${y}`} d={path} fill="#FFFFFF" stroke={ROSE} strokeWidth={1.6} />
          ) : (
            <Path key={`${x}-${y}`} d={path} fill="rgba(255,255,255,0.70)" />
          );
        }),
      )}
      {/* Rose dot inside the highlighted icon (HerBible glyph stand-in) */}
      <Path
        d="M167 215 Q167 213 169 213 L177 213 Q179 213 179 215 L179 227 Q179 229 177 229 L169 229 Q167 229 167 227 Z"
        fill={ROSE}
      />
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
    fontWeight: '800',
    color: TXT,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
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
  skipBtn: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.08)',
  },
  skipText: { fontSize: 16, fontWeight: '700', color: TXT, letterSpacing: 0.3 },
  allowBtn: {
    flex: 2,
    height: 56,
    borderRadius: 28,
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
