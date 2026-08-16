import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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

  if (!active) return null;

  const level = streakLevel(currentStreak);
  const next = LEVEL_INFO[level].next;
  const levelName = t(LEVEL_INFO[level].nameKey);
  const remaining = Math.max(0, next - currentStreak);
  const todayDone = mDone && eDone;

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

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.root}>
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.hero}>
          {/* 500×690 comp — width = height × 0.725 keeps its aspect (StreakScreen). */}
          <LottieView source={LOTTIE_FIRE} autoPlay loop style={styles.flame} />
          <Text style={styles.big}>{currentStreak}</Text>
          <Text style={styles.caption}>{t('streakDaily.caption')}</Text>
          <Animated.Text entering={FadeInDown.duration(400).delay(150)} style={styles.stateLine}>
            {stateLine}
          </Animated.Text>
        </View>

        <View style={styles.lower}>
          {/* Next-level progress — the reward hook, from the ladder the app
              already owns (Spark → … → Blazing). */}
          <View style={styles.milestone}>
            <View style={styles.milestoneLabels}>
              <Text style={styles.milestoneNow}>{levelName} · {currentStreak}</Text>
              <Text style={styles.milestoneNext}>{t(LEVEL_INFO[Math.min(level + 1, 5)].nameKey)} · {next}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, (currentStreak / next) * 100)}%` }]} />
            </View>
            {remaining > 0 && (
              <Text style={styles.milestoneSub}>
                {t('streakDaily.next', { n: remaining, level: t(LEVEL_INFO[Math.min(level + 1, 5)].nameKey) })}
              </Text>
            )}
          </View>

          <View style={styles.weekCard}>
            {DAYS.map((d, i) => {
              const isToday = i === TODAY_IDX;
              const done = wasCompleteOn(weekKeys[i]);
              const half = isToday && (mDone || eDone) && !(mDone && eDone);
              return <DayCircle key={d} label={d} done={done} half={half} isToday={isToday} morning={true} />;
            })}
          </View>

          <TouchableOpacity onPress={onContinue} activeOpacity={0.9} style={styles.cta}>
            <Text style={styles.ctaText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed forced screen — sits over EVERYTHING (same layer discipline as
  // the other hosts: no background+elevation combo on one view; this root is
  // opaque so the banding artifact class doesn't apply).
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70, elevation: 70,
    backgroundColor: '#FFFBF7',
  },
  content: { flex: 1, paddingHorizontal: P + 4, justifyContent: 'space-between' },
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
  milestone: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
  },
  milestoneLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  milestoneNow: { fontSize: 13, color: TXTSUB, fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.4 },
  milestoneNext: { fontSize: 13, color: GOLD, fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.4 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(30,27,46,0.07)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: GOLD },
  milestoneSub: {
    fontSize: 12.5, color: TXTSUB, textAlign: 'center', marginTop: 8,
    fontFamily: FONTS.lato, letterSpacing: 0.3,
  },
  weekCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingVertical: 14, paddingHorizontal: 10,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontFamily: FONTS.sansBold, fontWeight: '700', letterSpacing: 0.4 },
});
