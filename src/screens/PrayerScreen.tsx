import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withDelay, interpolateColor, Easing, FadeIn, FadeOut,
} from 'react-native-reanimated';
import Glass from '../components/shared/Glass';
import DayCircle from '../components/shared/DayCircle';
import FireFlame from '../components/shared/FireFlame';
import { ROSE, LAV, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { DAYS, PSALMS_CARDS } from '../constants/data';
import { usePrayer } from '../state/PrayerContext';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useActivity } from '../state/ActivityContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useTranslation } from '../state/TranslationsContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import { dailyLabels } from '../constants/dailyVersesLabels';
import { localizeBookName, englishBookName, chaptersInBook } from '../constants/bibleBookNames';
import { parseReference } from '../services/parseReference';
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

function VerseHeroCard({ morning, isDone, onBegin, onOpenRef, cardLabel, verseRef, verseText }: {
  morning: boolean;
  isDone: boolean;
  onBegin: () => void;
  onOpenRef: () => void;
  cardLabel: string;
  verseRef: string;
  verseText: string;
}) {
  const [liked, setLiked] = React.useState(false);
  const [showShare, setShowShare] = useState(false);
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
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isDone) { pulse.value = 1; return; }
    pulse.value = withRepeat(
      withTiming(1.06, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, isDone]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Tapping the disabled-looking button after the slot is complete pops a
  // friendly hint that auto-fades after a few seconds.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  const popHint = () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(morning
      ? 'Lovely, you\'re all set for the morning. Come back tonight for Night Prayer.'
      : 'Beautiful work today. See you tomorrow morning for sunrise prayer.');
    hintTimer.current = setTimeout(() => setHint(null), 3200);
  };

  return (
    <View>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.heroCard}>
        <TouchableOpacity onPress={onBegin} activeOpacity={0.85}>
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
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowShare(true)}>
            <ShareIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <MoreIcon color={iconColor} />
            <Text style={[styles.actionLabel, { color: iconColor }]}>More</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {isDone ? (
        <TouchableOpacity onPress={popHint} activeOpacity={0.85} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>
            {morning ? 'Morning Prayer · Done' : 'Night Prayer · Done'} ✓
          </Text>
        </TouchableOpacity>
      ) : (
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

      {showShare && verseRef && verseText && (
        <ShareVerseSheet
          reference={verseRef}
          text={verseText}
          onClose={() => setShowShare(false)}
        />
      )}
    </View>
  );
}

export default function PrayerScreen({ navigation }: TabScreenProps<'prayer'>) {
  const insets = useSafeAreaInsets();
  const { morning, setMorning, mDone, eDone, wasCompleteOn } = usePrayer();
  const { markToday } = useActivity();
  const { current: translation } = useTranslation();
  const { getVerse, todayDay } = useDailyVerses();
  const { read: readChapterSet } = useReadChapters();
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
    const t = setTimeout(() => navigation.navigate('MoodFlow'), 250);
    return () => clearTimeout(t);
  }, [moodCheckIn.ready]);
  const ac = morning ? ROSE : LAV;
  const pct = (mDone ? 50 : 0) + (eDone ? 50 : 0);
  const isDone = morning ? mDone : eDone;

  const today = new Date();
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
  const hr = today.getHours();
  const greeting = hr < 5 ? 'Good Evening'
    : hr < 12 ? 'Good Morning'
    : hr < 18 ? 'Good Afternoon'
    : 'Good Evening';

  const [trackWidth, setTrackWidth] = useState(0);
  const progressVal = useSharedValue(pct);
  const prevPctRef = useRef(pct);

  useFocusEffect(useCallback(() => {
    if (pct !== prevPctRef.current) {
      progressVal.value = prevPctRef.current;
      progressVal.value = withDelay(800, withTiming(pct, { duration: 3000, easing: Easing.out(Easing.cubic) }));
      prevPctRef.current = pct;
    }
  }, [pct, progressVal]));

  const progressFillStyle = useAnimatedStyle(() => ({
    width: (progressVal.value / 100) * trackWidth,
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
            <Text style={styles.streakNum}>12</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Tabs', { screen: 'profile' })}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#F9A8C9', '#E8619A']}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>S</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>TODAY'S PROGRESS</Text>
          <Text style={[styles.progressPct, { color: ac }]}>{pct}%</Text>
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

      {/* Hero verse card */}
      <View style={styles.section}>
        <VerseHeroCard
          morning={morning}
          isDone={isDone}
          cardLabel={morning ? labels.verseOfDay : labels.verseOfNight}
          verseRef={dailyVerse?.reference.full_reference || ''}
          verseText={dailyVerse?.modernText || ''}
          onBegin={() => navigation.navigate('PrayerFlow', { kind: morning ? 'morning' : 'evening' })}
          onOpenRef={() => {
            const ref = dailyVerse?.reference.full_reference;
            // Reference uses English book names (e.g. "John 1:9") in every
            // language file, so parseReference resolves the same slug
            // regardless of UI language. The reader then renders KJV / 和合本
            // / Lutherbibel etc. for that slug per the active translation.
            const focus = ref ? parseReference(ref) : null;
            navigation.navigate('Tabs', focus
              ? { screen: 'bible', params: { focus } }
              : { screen: 'bible' });
          }}
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
    </ScrollView>
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
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 78,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  streakFlame: { marginTop: -3 },
  streakNum: { fontSize: 17, fontWeight: '700', color: TXT },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#fff' },
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
    fontSize: 20,
    lineHeight: 31,
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
  startBtn: {
    marginTop: 16,
    marginBottom: 10,
    marginHorizontal: P,
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
  doneBtn: {
    marginTop: 16,
    marginBottom: 10,
    marginHorizontal: P,
    height: 55,
    borderRadius: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  doneBtnText: {
    color: TXTSUB,
    fontSize: 17,
    fontWeight: '600',
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
