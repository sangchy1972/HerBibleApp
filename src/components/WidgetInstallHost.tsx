import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { usePrayer } from '../state/PrayerContext';
import { useGospelsPsalms } from '../state/GospelsPsalmsContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { WIDGET_PRESENT_KEY } from '../../widgets/widget-task-handler';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useT } from '../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

// Proactive nudge to add the home-screen widget.
//
// POLICY (per user):
//  • Eligible from DAY ONE — no install-age floor. What earns the ask is USE,
//    not tenure: she must have used MORE THAN TWO of the app's core features
//    today-or-ever (morning prayer, Gospel & Psalm, Bible reading, a plan day).
//    That lands the ask by her third completed task at the latest, i.e. at a
//    moment she has just been rewarded rather than interrupted.
//  • Repeats DAILY while she still has no widget, at that same earned moment.
//  • After 3 asks she has not acted on, backs off to once every 3 DAYS. It never
//    stops entirely — the widget is the app's main retention surface — but it
//    stops behaving like a nag.
//  • Goes quiet the moment a widget actually exists (WIDGET_PRESENT_KEY, written
//    by the widget task handler when the host renders an instance).
// Coordinator-managed (priority 60) so it can never stack with another prompt.
const SHOWN_KEY = 'nudge:widgetInstall:shown:v1';        // legacy once-ever flag; still honoured as "added" for old installs
const ASK_COUNT_KEY = 'nudge:widgetInstall:asks:v1';     // how many times she has been asked
const LAST_ASK_YMD_KEY = 'nudge:widgetInstall:lastYmd:v1';
const ASKS_BEFORE_BACKOFF = 3;
const BACKOFF_DAYS = 3;
// ONE core feature is enough (owner 2026-08-08, was 2 → i.e. strictly 3 of 4).
// The old bar was the reason nobody ever saw this dialog: it needed three of
// {morning prayer, Gospel & Psalm, a Bible chapter, a plan day} in one lifetime.
const FEATURES_REQUIRED = 0;                             // strictly greater → ≥ 1 feature
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetweenYmd = (a: string, b: string): number => {
  const p = (x: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; };
  const d = (p(b) - p(a)) / 86400000;
  return Number.isFinite(d) ? Math.round(d) : Infinity;
};

export default function WidgetInstallHost() {
  const t = useT();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const { everMorning } = usePrayer();
  const gp = useGospelsPsalms();
  const { chaptersRead } = useReadChapters();
  const { totalDayCompletions } = usePlanCompletion();
  const coord = useNudgeCoordinator();
  // null = still loading persisted state; nothing is eligible until it resolves.
  const [gate, setGate] = useState<{ has: boolean; asks: number; lastYmd: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [present, legacyShown, asks, lastYmd] = await AsyncStorage.multiGet(
          [WIDGET_PRESENT_KEY, SHOWN_KEY, ASK_COUNT_KEY, LAST_ASK_YMD_KEY],
        ).then(rows => rows.map(([, v]) => v));
        setGate({
          // A widget the host has rendered, OR the legacy once-ever flag from
          // builds that had no detection (treat those users as done — asking
          // someone who already added it is the worse error).
          has: present === '1' || legacyShown === '1',
          asks: Number(asks) || 0,
          lastYmd: lastYmd ?? '',
        });
      } catch { setGate({ has: false, asks: 0, lastYmd: '' }); }
    })();
  }, []);

  // How many DISTINCT core features she has used. Lifetime, not per-day: the
  // point is "she knows what this app does", and that doesn't reset overnight.
  const featuresUsed =
    (everMorning ? 1 : 0)
    + ((gp.morning.doneToday || gp.evening.doneToday
        || gp.morning.day > 1 || gp.evening.day > 1
        || gp.morning.complete || gp.evening.complete || gp.round > 1) ? 1 : 0)
    + (chaptersRead > 0 ? 1 : 0)
    + (totalDayCompletions > 0 ? 1 : 0);

  const today = ymdOf(new Date());
  const cadenceOk = !gate ? false
    : gate.lastYmd === ''                                   // never asked
      ? true
      : gate.asks >= ASKS_BEFORE_BACKOFF
        ? daysBetweenYmd(gate.lastYmd, today) >= BACKOFF_DAYS   // backed off
        : gate.lastYmd !== today;                               // once per day

  // Android ONLY. iOS has no API to programmatically add a home-screen widget,
  // and the app ships no iOS WidgetKit widget — so nudging iOS users to "add the
  // widget" leads nowhere. Gated off on iOS until a real iOS widget exists.
  // Timing: after she has used ANY ONE core feature (owner 2026-08-08). There is
  // NO install-age floor — an older comment here claimed a "day-3 floor" that the
  // code has never had. The nudge coordinator still serialises this against every
  // other prompt.
  const eligible = Platform.OS === 'android'
    && gate !== null && !gate.has
    && featuresUsed > FEATURES_REQUIRED   // ≥ 1 of the four core features
    && cadenceOk;

  // `eligible` contains `shown === false`, and the effect below sets `shown`
  // true the moment the slot is granted — so without the `if (active) return`
  // guard this effect immediately releases the slot it was just given and the
  // card unmounts inside its own fade-in. It has been doing exactly that: a
  // one-time nudge that marks itself shown, spends the budget, and is never
  // seen. `canShow` reads a ref for the same reason. Copied from
  // RatePromptHost, which had this right from the start.
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('widgetInstall');

  useEffect(() => {
    if (active) return;
    if (eligible) {
      coord.requestSlot({ id: 'widgetInstall', priority: NUDGE_PRIORITY.widgetInstall, canShow: () => eligibleRef.current });
    } else {
      coord.releaseSlot('widgetInstall');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, active]);
  // `coord.releaseSlot`, NOT `coord`. The context value is memoized on
  // `activeId` (NudgeCoordinatorContext), so `coord`'s identity changes on the
  // very transition that GRANTS this host its slot — and an effect keyed on
  // `[coord]` then runs its cleanup one frame later and releases it. That is the
  // self-cancel this whole file was rewritten to remove, reintroduced by the
  // cleanup that was supposed to be the safe part. releaseSlot is a stable
  // useCallback, so capturing the function pins the dependency.
  const release = coord.releaseSlot;
  useEffect(() => () => release('widgetInstall'), [release]);
  const markedRef = useRef(false);
  useEffect(() => {
    if (active && !markedRef.current) {
      markedRef.current = true;
      // Record THIS ask (count + date) rather than latching a once-ever flag —
      // the cadence above needs both to decide when to come back.
      setGate(g => (g ? { ...g, asks: g.asks + 1, lastYmd: today } : g));
      AsyncStorage.multiSet([[ASK_COUNT_KEY, String((gate?.asks ?? 0) + 1)], [LAST_ASK_YMD_KEY, today]]).catch(() => {});
    }
    if (!active) markedRef.current = false;
  }, [active]);

  if (!active) return null;

  const dismiss = () => { coord.notifyDismissed('widgetInstall'); coord.releaseSlot('widgetInstall'); };
  const onAdd = () => { dismiss(); setTimeout(() => { try { nav.navigate('AddWidget'); } catch { /* route may not be mounted */ } }, 60); };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
        <View style={styles.icon}><Feather name="grid" size={26} color={ROSE} /></View>
        <Text style={styles.title}>{t('nudge.widget.title')}</Text>
        <Text style={styles.body}>{t('nudge.widget.body')}</Text>
        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={onAdd}>
          <Text style={styles.ctaText}>{t('nudge.widget.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>{t('nudge.widget.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, backgroundColor: 'rgba(20,12,24,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },   // 22 → 28.6 (+30 % card radius per user)
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: `${ROSE}16`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4, marginBottom: 20 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.3 },   // CTA size unified at 17.5 (was 16.5) — per user
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
