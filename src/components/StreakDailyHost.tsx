import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, ZoomIn,
  useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing,
} from 'react-native-reanimated';
import { usePrayer } from '../state/PrayerContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { streakLevel, LEVEL_INFO } from '../constants/streakLevels';
import DayCircle from './shared/DayCircle';
import { DAYS } from '../constants/data';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import { ROSE, GOLD, TXT, TXTSUB, BTN_RADIUS, FONTS, P } from '../constants/theme';

// The once-a-day streak ritual (owner 2026-08-16, designed against the
// competitor screenshot): the FIRST open of each local day greets her with a
// full-screen "day N" moment — flame, the chain so far, and what today's
// prayer adds — so the streak is protected by memory, not luck.
//
// Semantics, deliberately different from StreakScreen: everything here keys
// off usePrayer().currentStreak (CONSECUTIVE complete days, with the built-in
// yesterday grace) because this screen exists to keep the chain unbroken.
// StreakScreen's headline and levels key off lifetime totalComplete — that
// screen celebrates the journey. Do not "unify" them; they answer different
// questions with the same ladder (see constants/streakLevels).
//
// Shows only when streak ≥ 1: a day-1 user has no chain to protect yet (the
// streak guide owns that moment), and a broken-streak user opening to a big
// "0" would be pure discouragement — win-back is a different feature.
const LAST_SHOWN_YMD_KEY = 'nudge:streakDaily:lastYmd:v1';
const LOTTIE_FIRE = require('../../assets/lottie/fire-streak.json');

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function StreakDailyHost() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { currentStreak, mDone, eDone, wasCompleteOn } = usePrayer();
  const coord = useNudgeCoordinator();
  // null = persisted state still loading; nothing is eligible until it lands.
  const [lastYmd, setLastYmd] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_SHOWN_YMD_KEY)
      .then(v => setLastYmd(v ?? ''))
      .catch(() => setLastYmd(''));
  }, []);

  const today = ymdOf(new Date());
  const eligible = lastYmd !== null
    && lastYmd !== today
    && currentStreak >= 1;

  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('streakDaily');

  // Android hardware BACK counts as Continue — the screen is forced, but the
  // system back gesture must never strand her behind it.
  const continueRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { continueRef.current(); return true; });
    return () => sub.remove();
  }, [active]);

  useEffect(() => {
    if (active) return;
    if (eligible) {
      coord.requestSlot({
        id: 'streakDaily',
        priority: NUDGE_PRIORITY.streakDaily,
        // Daily-ritual class, like moodCheckIn: expected and welcome, so it
        // must not spend the promo budget. The per-wave blocking cap and the
        // full-screen gates (tour, reminder opt-in) still apply above it.
        ignoresBudget: true,
        canShow: () => eligibleRef.current,
      });
    } else {
      coord.releaseSlot('streakDaily');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, active]);
  // Stable function, not `coord` — the context identity changes on the very
  // grant transition (the WidgetInstallHost lesson).
  const release = coord.releaseSlot;
  useEffect(() => () => release('streakDaily'), [release]);

  const markedRef = useRef(false);
  useEffect(() => {
    if (active && !markedRef.current) {
      markedRef.current = true;
      // Marked at SHOW time — one appearance per local day, however many
      // opens follow.
      setLastYmd(today);
      AsyncStorage.setItem(LAST_SHOWN_YMD_KEY, today).catch(() => {});
      logEvent('streak_daily_shown', { streak: currentStreak, level: streakLevel(currentStreak) });
    }
    if (!active) markedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const level = streakLevel(currentStreak);
  const next = LEVEL_INFO[level].next;
  const levelName = t(LEVEL_INFO[level].nameKey);
  const remaining = Math.max(0, next - currentStreak);
  const todayDone = mDone && eDone;

  // The progress bar joins the sequence LAST: it holds at zero through the
  // card entrances, then sweeps to today's position once the eye is already
  // on it. Reset to 0 on every activation (ledger rule: shared values reset at
  // OPEN, or a second showing replays from yesterday's end state) — and this
  // hook block sits ABOVE the early return below, per the checklist.
  const pct = Math.min(100, (currentStreak / next) * 100);
  const fillW = useSharedValue(0);
  useEffect(() => {
    if (!active) { fillW.value = 0; return; }
    fillW.value = 0;
    fillW.value = withDelay(950, withTiming(pct, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [active, pct, fillW]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fillW.value}%` }));

  if (!active) return null;

  // Three voices, most specific first: today already lit (rare — the ymd guard
  // means she usually sees this before any prayer) → celebration; today's
  // prayer completes the next level → the strongest push on the strongest day;
  // otherwise the standing "keep the flame" line.
  const stateLine = todayDone
    ? t('streakDaily.done', { n: currentStreak })
    : currentStreak + 1 === next
      ? t('streakDaily.eve', { level: levelName })
      : t('streakDaily.alive', { n: currentStreak + 1 });

  // Current week, Sun → Sat — the exact computation StreakScreen renders, so
  // the two surfaces can never disagree about which days are lit.
  const now = new Date();
  const TODAY_IDX = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - TODAY_IDX);
  const weekKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return ymdOf(d);
  });

  const onContinue = () => {
    logEvent('streak_daily_continue', { streak: currentStreak });
    coord.notifyDismissed('streakDaily');
    coord.releaseSlot('streakDaily');
  };
  continueRef.current = onContinue;

  // ── Entrance choreography (owner 2026-08-16: everything enters in order) ──
  // Flame → number → caption → state line → milestone card → week row → CTA,
  // ~90 ms apart, the button deliberately last: the exit appears only after
  // the story is told. Same `entering=` stagger StreakScreen ships (this host
  // is NOT inside an RN Modal, so layout animations are on safe ground — the
  // sheet rule about shared values applies to Modal trees only).
  const SLOT = 90;

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.root}>
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.hero}>
          {/* 500×690 comp — width = height × 0.725 keeps its aspect (StreakScreen). */}
          <Animated.View entering={ZoomIn.duration(420)}>
            <LottieView source={LOTTIE_FIRE} autoPlay loop style={styles.flame} />
          </Animated.View>
          <Animated.Text entering={ZoomIn.duration(380).delay(SLOT * 1)} style={styles.big}>
            {currentStreak}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.duration(400).delay(SLOT * 2)} style={styles.caption}>
            {t('streakDaily.caption')}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.duration(400).delay(SLOT * 3)} style={styles.stateLine}>
            {stateLine}
          </Animated.Text>
        </View>

        {/* 70/30 spacer split lifts the card pair 30% up the free space while
            the CTA keeps the floor (owner 2026-08-21). */}
        <View style={{ flex: 0.7 }} />

        <View style={styles.lower}>
          {/* Next-level progress — the reward hook, from the ladder the app
              already owns (Spark → … → Blazing). */}
          <Animated.View entering={FadeInUp.duration(400).delay(SLOT * 4)} style={styles.milestone}>
            <View style={styles.milestoneLabels}>
              <Text style={styles.milestoneNow}>{levelName} · {currentStreak}</Text>
              <Text style={styles.milestoneNext}>{t(LEVEL_INFO[Math.min(level + 1, 5)].nameKey)} · {next}</Text>
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, fillStyle]} />
            </View>
            {remaining > 0 && (
              <Text style={styles.milestoneSub}>
                {t('streakDaily.next', { n: remaining, level: t(LEVEL_INFO[Math.min(level + 1, 5)].nameKey) })}
              </Text>
            )}
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(SLOT * 5)} style={styles.weekCard}>
            {DAYS.map((d, i) => {
              const isToday = i === TODAY_IDX;
              const done = wasCompleteOn(weekKeys[i]);
              const half = isToday && (mDone || eDone) && !(mDone && eDone);
              return <DayCircle key={d} label={d} done={done} half={half} isToday={isToday} morning={true} />;
            })}
          </Animated.View>
        </View>

        <View style={{ flex: 0.3 }} />

        <Animated.View entering={FadeInUp.duration(400).delay(SLOT * 6)}>
          <TouchableOpacity onPress={onContinue} activeOpacity={0.9} style={styles.cta}>
            <Text style={styles.ctaText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// Unified card height: taller natural card ≈96 with the bumped type, +20%.
const CARD_H = 116;

const styles = StyleSheet.create({
  // Full-bleed forced screen — sits over EVERYTHING (same layer discipline as
  // the other hosts: no background+elevation combo on one view; this root is
  // opaque so the banding artifact class doesn't apply).
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70, elevation: 70,
    backgroundColor: '#FFFBF7',
  },
  content: { flex: 1, paddingHorizontal: P + 4 },
  hero: { alignItems: 'center' },
  flame: { width: Math.round(150 * 0.725), height: 150 },
  big: {
    fontSize: 74, lineHeight: 80, color: GOLD,
    fontFamily: FONTS.loraBold, fontWeight: '600',
    marginTop: 2,
  },
  caption: {
    fontSize: 21, color: GOLD,
    fontFamily: FONTS.loraBold, fontWeight: '600',
    marginTop: 2,
  },
  stateLine: {
    fontSize: 15.5, lineHeight: 23, color: TXTSUB, textAlign: 'center',
    fontFamily: FONTS.lato, letterSpacing: 0.4,
    marginTop: 18, paddingHorizontal: 12,
  },
  lower: { gap: 16 },
  // Both white cards share ONE explicit height (owner 2026-08-21: unified,
  // then +20% over the taller one's natural ≈96) with content centered.
  milestone: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    height: CARD_H, paddingHorizontal: 16, justifyContent: 'center',
  },
  milestoneLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  milestoneNow: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.4 },
  milestoneNext: { fontSize: 15, color: GOLD, fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.4 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(30,27,46,0.07)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: GOLD },
  milestoneSub: {
    fontSize: 16, color: TXTSUB, textAlign: 'center', marginTop: 8,
    fontFamily: FONTS.lato, letterSpacing: 0.3,
  },
  weekCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    height: CARD_H, paddingHorizontal: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontFamily: FONTS.sansBold, fontWeight: '700', letterSpacing: 0.4 },
});
