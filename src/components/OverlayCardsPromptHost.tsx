import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, BackHandler, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Rect, Circle, Line } from 'react-native-svg';
import { usePrayer } from '../state/PrayerContext';
import { useGospelsPsalms } from '../state/GospelsPsalmsContext';
import { useReadChapters } from '../state/ReadChaptersContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import { overlayCardsSupported, canDrawOverlays, openOverlaySettings } from '../../modules/expo-overlay-cards';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';

// The "Appear on top" ask for the daily overlay cards (verse + quiz popups over
// the launcher — see modules/expo-overlay-cards). Android only; the permission
// is a SYSTEM SETTINGS toggle, not a runtime dialog, so this card explains and
// then hands off to the settings page. The grant is detected by OverlayCardsSync
// on the next foreground — nothing here needs to hear back.
//
// Cadence (owner defaults, 2026-08-16): first ask once she has used ≥1 core
// feature (same signal as the widget nudge — "she knows what this app does"),
// then every 4 days; after 3 unacted asks, backs off to every 7 days. Goes
// silent for good the moment the permission exists.
const ASK_COUNT_KEY = 'nudge:overlayCards:asks:v1';
const LAST_ASK_YMD_KEY = 'nudge:overlayCards:lastYmd:v1';
const ASK_GAP_DAYS = 4;
const ASKS_BEFORE_BACKOFF = 3;
const BACKOFF_DAYS = 7;

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetweenYmd = (a: string, b: string): number => {
  const p = (x: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; };
  const d = (p(b) - p(a)) / 86400000;
  return Number.isFinite(d) ? Math.round(d) : Infinity;
};

// A miniature of the thing itself: a little popup card floating over a screen —
// drawn, not iconed, so she can see what she is turning on.
function MiniPopupArt() {
  return (
    <Svg width={64} height={56} viewBox="0 0 64 56">
      {/* the phone screen behind */}
      <Rect x={6} y={10} width={52} height={44} rx={6} fill="none" stroke={`${ROSE}55`} strokeWidth={2} />
      {/* the popup card, riding on top */}
      <Rect x={12} y={2} width={40} height={30} rx={7} fill="#FFFFFF" stroke={ROSE} strokeWidth={2.2} />
      <Circle cx={20} cy={10} r={3} fill={ROSE} />
      <Line x1={26} y1={10} x2={44} y2={10} stroke={`${ROSE}88`} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={18} y1={19} x2={46} y2={19} stroke={`${ROSE}55`} strokeWidth={2.4} strokeLinecap="round" />
      <Rect x={22} y={24} width={20} height={4.5} rx={2.25} fill={ROSE} />
    </Svg>
  );
}

export default function OverlayCardsPromptHost() {
  const t = useT();
  const { everMorning } = usePrayer();
  const gp = useGospelsPsalms();
  const { chaptersRead } = useReadChapters();
  const { totalDayCompletions } = usePlanCompletion();
  const coord = useNudgeCoordinator();
  const [gate, setGate] = useState<{ asks: number; lastYmd: string } | null>(null);
  // The grant lives in system settings; re-read it on every foreground so an
  // already-granted user is never asked (and a fresh grant retires this host).
  const [granted, setGranted] = useState(() => canDrawOverlays());

  useEffect(() => {
    (async () => {
      try {
        const [asks, lastYmd] = await AsyncStorage.multiGet([ASK_COUNT_KEY, LAST_ASK_YMD_KEY])
          .then(rows => rows.map(([, v]) => v));
        setGate({ asks: Number(asks) || 0, lastYmd: lastYmd ?? '' });
      } catch { setGate({ asks: 0, lastYmd: '' }); }
    })();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') setGranted(canDrawOverlays());
    });
    return () => sub.remove();
  }, []);

  // Same "she knows what this app does" signal the widget nudge earned its
  // timing with: ≥1 distinct core feature used, lifetime.
  const featuresUsed =
    (everMorning ? 1 : 0)
    + ((gp.morning.doneToday || gp.evening.doneToday
        || gp.morning.day > 1 || gp.evening.day > 1
        || gp.morning.complete || gp.evening.complete || gp.round > 1) ? 1 : 0)
    + (chaptersRead > 0 ? 1 : 0)
    + (totalDayCompletions > 0 ? 1 : 0);

  const today = ymdOf(new Date());
  const cadenceOk = !gate ? false
    : gate.lastYmd === ''
      ? true
      : daysBetweenYmd(gate.lastYmd, today)
          >= (gate.asks >= ASKS_BEFORE_BACKOFF ? BACKOFF_DAYS : ASK_GAP_DAYS);

  const eligible = Platform.OS === 'android'
    && overlayCardsSupported()
    && !granted
    && gate !== null
    && featuresUsed >= 1
    && cadenceOk;

  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('overlayCards');
  const dismissRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { dismissRef.current(); return true; });
    return () => sub.remove();
  }, [active]);

  useEffect(() => {
    if (active) return;
    if (eligible) {
      coord.requestSlot({ id: 'overlayCards', priority: NUDGE_PRIORITY.overlayCards, canShow: () => eligibleRef.current });
    } else {
      coord.releaseSlot('overlayCards');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, active]);
  // Stable function, not `coord` — the context identity changes on the very
  // grant transition, and a cleanup keyed on it self-cancels the slot (the
  // WidgetInstallHost lesson, verbatim).
  const release = coord.releaseSlot;
  useEffect(() => () => release('overlayCards'), [release]);

  const markedRef = useRef(false);
  useEffect(() => {
    if (active && !markedRef.current) {
      markedRef.current = true;
      logEvent('overlay_prompt_shown');
      setGate(g => (g ? { asks: g.asks + 1, lastYmd: today } : g));
      AsyncStorage.multiSet([[ASK_COUNT_KEY, String((gate?.asks ?? 0) + 1)], [LAST_ASK_YMD_KEY, today]]).catch(() => {});
    }
    if (!active) markedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const dismiss = () => { coord.notifyDismissed('overlayCards'); coord.releaseSlot('overlayCards'); };
  dismissRef.current = dismiss;

  const onTurnOn = () => {
    logEvent('overlay_prompt_cta');
    dismiss();
    // Hand off to the system's "Appear on top" page (scoped to our row).
    // OverlayCardsSync picks the grant up on the return foreground; nothing to
    // await here. If an OEM hides the per-app page this returns false and there
    // is genuinely nowhere better to send her — the next cadence window retries.
    openOverlaySettings();
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <TouchableOpacity style={[StyleSheet.absoluteFill, styles.backdrop]} activeOpacity={1} onPress={dismiss} />
      <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
        <View style={styles.art}><MiniPopupArt /></View>
        <Text style={styles.title}>{t('nudge.overlay.title')}</Text>
        <Text style={styles.body}>{t('nudge.overlay.body')}</Text>
        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={onTurnOn}>
          <Text style={styles.ctaText}>{t('nudge.overlay.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>{t('nudge.overlay.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same shell as WidgetInstallHost — dim on the BACKDROP CHILD, never on the
  // elevated root (the elevation-shadow banding artifact, dev-guide §2).
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, elevation: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  backdrop: { backgroundColor: 'rgba(20,12,24,0.45)' },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  art: { width: 76, height: 68, borderRadius: 20, backgroundColor: `${ROSE}10`, alignItems: 'center', justifyContent: 'center', marginBottom: 14, paddingTop: 6 },
  title: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4, marginBottom: 20 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.3 },
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
