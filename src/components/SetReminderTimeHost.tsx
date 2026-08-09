import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
import TimePickerSheet from './TimePickerSheet';
import { useNotifications } from '../state/NotificationsContext';
import { useOnboarding } from '../state/OnboardingContext';
import { useSetReminderTime } from '../state/SetReminderTimeContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useT } from '../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';

// Proactive "set your prayer reminders" nudge — a new entry point (beyond
// onboarding) for users who finished onboarding WITHOUT enabling reminders.
// Gated on `!permissionGranted` so it disappears the moment reminders are on.
// Routed through the nudge coordinator (priority 30) so it never stacks.
export default function SetReminderTimeHost() {
  const t = useT();
  const notif = useNotifications();
  const onboarding = useOnboarding();
  const srt = useSetReminderTime();
  const coord = useNudgeCoordinator();
  // Live ref so the coordinator's canShow() always reads current cadence state
  // (the register effect only re-runs on `eligible`, so a captured `srt` would
  // go stale as the 20h/day thresholds elapse).
  const srtRef = useRef(srt);
  useEffect(() => { srtRef.current = srt; });

  const eligible = notif.ready && srt.ready && onboarding.done && !notif.permissionGranted;

  // Anchor the cadence baseline the first time we're eligible.
  useEffect(() => { if (eligible) srt.noteEligible(); /* eslint-disable-next-line */ }, [eligible]);

  const active = coord.isActive('setReminderTime');

  // Register with the coordinator while eligible; canShow re-checks the cadence.
  // `active` is in the deps because notifyDismissed drops the request: without
  // it, a session that outlives the day (app left open) would never re-register
  // once dismissed, and tomorrow's ask would be lost. Declared ABOVE the effect
  // — referencing a const from an effect defined earlier is a TDZ crash.
  useEffect(() => {
    if (eligible) coord.requestSlot({ id: 'setReminderTime', priority: NUDGE_PRIORITY.setReminderTime, canShow: () => srtRef.current.shouldShow() });
    else coord.releaseSlot('setReminderTime');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, active]);
  // Android hardware BACK, ABOVE every early return (a hook under one is
  // conditional and React rejects it when the condition flips). Without this the
  // press goes to the navigator, which pops the screen — or exits to the
  // launcher from the home tab — while this scrim stays up over whatever is now
  // underneath. Routed through a ref because `dismiss` is defined further down.
  const dismissRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { dismissRef.current(); return true; });
    return () => sub.remove();
  }, [active]);


  // Count the show exactly once PER GRANT. A remount while the slot is still
  // active (FollowHimScreen swapping the tab tree out mid-session) reset a plain
  // boolean to false and markShown ran twice, double-counting the cadence.
  const shownForRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (active && shownForRef.current !== true) { shownForRef.current = true; srt.markShown(); }
    if (!active) shownForRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const [step, setStep] = useState<'rationale' | 'morning' | 'evening'>('rationale');
  const [mTime, setMTime] = useState({ hour: 8, minute: 0 });

  // Unmount MUST release. ReminderInterstitialContext re-derives its day/night
  // slot on every foreground, so a notifications-off user returning after 18:00
  // has the whole tab tree swapped out for FollowHimScreen mid-session — every
  // home-hosted trigger unmounts, and a slot still held would block every later
  // prompt. `releaseSlot` (not `coord`) is pinned: the context value is memoized
  // on activeId, so a [coord]-keyed cleanup would fire on the very grant it was
  // meant to protect.
  const releaseOnUnmount = coord.releaseSlot;
  useEffect(() => () => releaseOnUnmount('setReminderTime'), [releaseOnUnmount]);

  if (!active) return null;

  const dismiss = () => {
    coord.notifyDismissed('setReminderTime');
    coord.releaseSlot('setReminderTime');
    setStep('rationale');
  };
  dismissRef.current = dismiss;

  const onEveningConfirm = async (hour: number, minute: number) => {
    await notif.configureReminders(mTime, { hour, minute });   // atomic: both times + permission
    srt.markConfigured();
    dismiss();
  };

  if (step === 'morning') {
    return (
      <TimePickerSheet
        initialHour={mTime.hour}
        initialMinute={mTime.minute}
        title={t('nudge.setReminder.morningTitle')}
        maxHour={17}
        onConfirm={(h, m) => { setMTime({ hour: h, minute: m }); setStep('evening'); }}
        onClose={dismiss}
      />
    );
  }
  if (step === 'evening') {
    return (
      <TimePickerSheet
        initialHour={20}
        initialMinute={0}
        title={t('nudge.setReminder.eveningTitle')}
        minHour={18}
        onConfirm={onEveningConfirm}
        onClose={dismiss}
      />
    );
  }


  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
        <View style={styles.icon}><Feather name="bell" size={26} color={ROSE} /></View>
        <Text style={styles.title}>{t('nudge.setReminder.title')}</Text>
        <Text style={styles.body}>{t('nudge.setReminder.body')}</Text>
        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={() => setStep('morning')}>
          <Text style={styles.ctaText}>{t('nudge.setReminder.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>{t('nudge.setReminder.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, elevation: 60, backgroundColor: 'rgba(20,12,24,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },   // 22 → 28.6 (+30 % card radius per user)
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: `${ROSE}16`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4, marginBottom: 20 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.3 },   // CTA size unified at 17.5 (was 16.5) — per user
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
