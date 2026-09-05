import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROSE, TXT, TXTSUB, FONTS, BTN_RADIUS, CARD_RADIUS } from '../../constants/theme';
import { useSheetPan, SheetBackdrop } from '../shared/sheetPan';
import { useNudgeCoordinator } from '../../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../../state/nudgePriority';
import { useT } from '../../i18n/useT';
import { useUILanguage } from '../../state/UILanguageContext';
import { localeFor } from '../../i18n/locale';
import {
  promptStateFor, shouldPromptRecap, markPromptShown, markPromptOpened,
  coveredWeekOf, ymdOf, type RecapPromptState,
} from '../../services/weeklyRecap';
import WeeklyRecapFlow from './WeeklyRecapFlow';

// Weekly Recap host (owner spec 2026-09-05). Owns the whole lifecycle:
//   eligibility (1/day, 3/week, opened-kills, new-user <3d exempt)
//   → coordinator slot (priority 8 — above every reward and ask; only the
//     once-ever first-run tour outranks it, and the two can't collide because
//     new users are exempt here)
//   → half-screen unlock sheet (house pattern: dim + slide-up + swipe-down)
//   → full-screen 4-page recap flow.
//
// Cold-start discipline (dev-guide §12): the FIRST eligibility check runs
// after interactions settle + a 2.5s stagger, reads two AsyncStorage keys and
// does no other work. Stats aggregation happens only when the flow opens.
const PROMPT_KEY = 'weeklyRecap:prompt:v1';
const FIRST_LAUNCH_DATE_KEY = 'daily-verses:first-launch-date'; // written by DailyVersesContext since 1.0
const SHEET_ART = require('../../../assets/recap/bg-sheet.jpg');

export default function WeeklyRecapHost() {
  const t = useT();
  const { lang } = useUILanguage();
  const insets = useSafeAreaInsets();
  const coord = useNudgeCoordinator();

  const [eligible, setEligible] = useState(false);
  const [flowUp, setFlowUp] = useState(false);
  const stateRef = useRef<RecapPromptState | null>(null);

  // One evaluation per app open, deferred out of the cold-start window.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        try {
          const today = ymdOf(new Date());
          const [rawState, firstLaunch] = await Promise.all([
            AsyncStorage.getItem(PROMPT_KEY),
            AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY),
          ]);
          let stored: RecapPromptState | null = null;
          try { stored = rawState ? (JSON.parse(rawState) as RecapPromptState) : null; } catch {}
          const state = promptStateFor(stored, today);
          stateRef.current = state;
          if (!alive) return;
          if (shouldPromptRecap({ state, todayYmd: today, firstLaunchYmd: firstLaunch })) {
            setEligible(true);
          }
        } catch { /* storage hiccup → simply no recap this open */ }
      });
    }, 2500);
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // Coordinator slot — request while eligible, release when not.
  useEffect(() => {
    if (!eligible) { coord.releaseSlot('weeklyRecap'); return; }
    coord.requestSlot({
      id: 'weeklyRecap',
      priority: NUDGE_PRIORITY.weeklyRecap,
      canShow: () => true,
      ignoresBudget: true,   // a weekly reward moment, not an ask
    });
    return () => coord.releaseSlot('weeklyRecap');
  }, [eligible, coord]);

  const granted = eligible && coord.isActive('weeklyRecap');

  // Burn today's show the moment the sheet actually renders (1/day, 3/week).
  const burnedRef = useRef(false);
  useEffect(() => {
    if (!granted || burnedRef.current || !stateRef.current) return;
    burnedRef.current = true;
    const next = markPromptShown(stateRef.current, ymdOf(new Date()));
    stateRef.current = next;
    AsyncStorage.setItem(PROMPT_KEY, JSON.stringify(next)).catch(() => {});
  }, [granted]);

  const dismissSheet = useCallback(() => {
    setEligible(false);
    coord.notifyDismissed('weeklyRecap');
  }, [coord]);

  const openFlow = useCallback(() => {
    // Opened → never prompt again this week.
    if (stateRef.current) {
      const next = markPromptOpened(stateRef.current);
      stateRef.current = next;
      AsyncStorage.setItem(PROMPT_KEY, JSON.stringify(next)).catch(() => {});
    }
    setFlowUp(true);
    setEligible(false);
    coord.notifyDismissed('weeklyRecap');
  }, [coord]);

  const { gesture, sheetStyle } = useSheetPan(dismissSheet, granted);

  // Localized covered-week range, e.g. "Aug 30 – Sep 5".
  const rangeLabel = useMemo(() => {
    const { start, end } = coveredWeekOf(ymdOf(new Date()));
    const fmt = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' });
    };
    return `${fmt(start)} – ${fmt(end)}`;
  }, [lang]);

  return (
    <>
      {granted && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <SheetBackdrop onClose={dismissSheet} />
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }, sheetStyle]}>
              <View style={styles.handle} />
              <TouchableOpacity onPress={dismissSheet} hitSlop={10} style={styles.close}>
                <Feather name="x" size={20} color={TXTSUB} />
              </TouchableOpacity>
              <View style={styles.artFrame}>
                <Image source={SHEET_ART} style={styles.art} resizeMode="cover" />
              </View>
              <Text style={styles.title}>{t('recap.sheet.title')}</Text>
              <Text style={styles.range}>{rangeLabel}</Text>
              <Text style={styles.sub}>{t('recap.sheet.sub')}</Text>
              <TouchableOpacity onPress={openFlow} activeOpacity={0.9} style={styles.cta}>
                <Text style={styles.ctaText}>{t('recap.sheet.cta')}</Text>
              </TouchableOpacity>
            </Animated.View>
          </GestureDetector>
        </View>
      )}
      {flowUp && <WeeklyRecapFlow onClose={() => setFlowUp(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 24, paddingTop: 12,
    alignItems: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5DEE4', marginBottom: 10 },
  close: { position: 'absolute', top: 14, right: 16, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  artFrame: {
    width: 168, height: 210, borderRadius: CARD_RADIUS,
    overflow: 'hidden', marginTop: 10, marginBottom: 18,
    backgroundColor: '#F3EDF2',
  },
  art: { width: '100%', height: '100%' },
  title: {
    fontSize: 21, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT,
    textAlign: 'center',
  },
  range: { fontSize: 14, color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 0.4, marginTop: 7 },
  sub: { fontSize: 14.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.3, marginTop: 8, textAlign: 'center' },
  cta: {
    marginTop: 20, alignSelf: 'stretch', height: 52, borderRadius: BTN_RADIUS,
    backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.5 },
});
