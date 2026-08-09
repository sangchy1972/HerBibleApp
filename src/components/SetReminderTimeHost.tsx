import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, AppState } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
import TimePickerSheet from './TimePickerSheet';
import PermissionCoachOverlay, { openNotificationSettings } from './PermissionCoachOverlay';
import {
  canFloatOverSettings, openOverlaySettings, showSettingsCoach, hideSettingsCoach,
} from '../../modules/expo-settings-coach';
import { useNotifications } from '../state/NotificationsContext';
import { useOnboarding } from '../state/OnboardingContext';
import { useSetReminderTime } from '../state/SetReminderTimeContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useT } from '../i18n/useT';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';

// The daily reminder ask, for users who finished onboarding WITHOUT reminders.
// Coordinator-managed (priority 30) so it never stacks.
//
// AGGRESSIVE BY DESIGN (owner 2026-08-09, after showing a competitor's flow).
// It used to open with a polite in-app card and only reach the OS dialog if she
// tapped through — "太 mild". It now goes straight for the permission and
// escalates on refusal, in four steps:
//
//   osAsk  renders NOTHING and fires the real OS dialog immediately. Granted →
//          both reminders are on before she has tapped anything of ours, and we
//          go on to let her choose the times.
//   push   she declined — or Android 13+ has spent its two asks, so no dialog
//          could even appear. Our own card says the reminder is OFF and offers
//          one way forward.
//   coach  PermissionCoachOverlay: our icon, our name, the switch she is about
//          to hunt for, and a finger flipping it — THEN the hand-off to the
//          notification settings page (not the app-info root).
//   morning/evening  the time pickers, unchanged.
//
// THE FLOATING CARD (owner asked for it twice, so it is built). Once she has
// granted "Appear on top", the same guidance is ALSO drawn on top of the Settings
// app itself via modules/expo-settings-coach — the competitor's trick, with our
// own card. Two things are worth knowing before touching this:
//
//   • It is an ENHANCEMENT, never the path. Without the overlay permission the
//     in-app card + deep link is the whole flow, and that is what works on every
//     device. We never spend the notification funnel on a trip to grant an
//     overlay permission: the card offers it as a secondary line, the CTA never
//     diverts to it.
//   • From Android 12, Settings may call Window#setHideOverlayWindows(true) on
//     permission screens to block overlay tapjacking. Where it does, the OS hides
//     the card and there is nothing to fix. It shows on the screens that do not
//     set the flag — which is what the competitor's One UI screenshots show.
//
// The copy stays honest about it too: reminders need NOTIFICATIONS. "Appear on
// top" only buys the guided hand-off, and our card says that rather than claiming
// — as the competitor's does — that a floating window is what delivers reminders.
// We deep-link to the app's notification page, whose FIRST row is the master
// switch, so there is no long list to hunt through either way.
export type ReminderAskStep = 'osAsk' | 'push' | 'coach' | 'morning' | 'evening';
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

  const [step, setStep] = useState<ReminderAskStep>('osAsk');
  const [mTime, setMTime] = useState({ hour: 8, minute: 0 });

  // STEP 1 — the OS dialog, fired the moment the slot is granted, with nothing
  // of ours on screen first. requestPermissionAndEnableDefaults also turns both
  // daily reminders on when she allows, so "Allow" alone produces reminders
  // rather than a granted permission with nothing scheduled.
  //
  // `dismissRef` rather than `dismiss`: hooks must sit above the early return,
  // and the render that sets `active` assigns the real dismiss before any effect
  // of that render runs (same pattern as the BackHandler above).
  const askedForRef = useRef(false);
  useEffect(() => {
    if (!active) { askedForRef.current = false; return; }
    if (step !== 'osAsk' || askedForRef.current) return;
    askedForRef.current = true;
    let cancelled = false;
    (async () => {
      let granted = false;
      try { granted = await notif.requestPermissionAndEnableDefaults(); } catch { granted = false; }
      if (cancelled) return;
      // Granted: reminders are already live at the defaults, so the flag burns
      // here too — she must never be asked to "set a reminder" again, whatever
      // she does with the time pickers that follow.
      // Time pickers ONLY if she has never chosen times. A user who set them and
      // later revoked the permission in Settings comes back through here — she
      // needs the permission, not to pick 20:00 all over again. That split is the
      // whole point of `configured` now (see SetReminderTimeContext).
      if (!granted) { setStep('push'); return; }
      if (srtRef.current.configured) { dismissRef.current(); return; }
      srt.markConfigured();
      setStep('morning');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // Back from Settings. Only while the coach card is up — that is the one step
  // that sends her out of the app — and only adopting defaults when permission
  // was OFF before the trip (syncPermissionFromSystem's own contract), so this
  // can never silently re-enable reminders she turned off herself.
  useEffect(() => {
    if (!active || step !== 'coach') return;
    const sub = AppState.addEventListener('change', st => {
      if (st !== 'active') return;
      // The overlay lives outside our Activity, so coming back is exactly when it
      // must go. Its own timeout is the backstop, not the plan.
      hideSettingsCoach();
      notif.syncPermissionFromSystem(true).then(granted => {
        if (granted) { srt.markConfigured(); dismissRef.current(); }
      }).catch(() => {});
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

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
    hideSettingsCoach();
    coord.notifyDismissed('setReminderTime');
    coord.releaseSlot('setReminderTime');
    setStep('osAsk');
  };
  dismissRef.current = dismiss;

  const onEveningConfirm = async (hour: number, minute: number) => {
    await notif.configureReminders(mTime, { hour, minute });   // atomic: both times + permission
    srt.markConfigured();
    dismiss();
  };

  if (step === 'osAsk') return null;

  if (step === 'coach') {
    return (
      <PermissionCoachOverlay
        visible
        title={t('permCoach.notif.title')}
        switchLabel={t('permCoach.notif.switch')}
        // Float the same guidance over Settings when she has granted "Appear on
        // top"; otherwise this is exactly the flow that shipped before. Raised
        // BEFORE the jump so the window is already up when Settings appears.
        onOpenSettings={() => {
          if (canFloatOverSettings()) {
            showSettingsCoach({
              title: t('permCoach.notif.title'),
              body: t('permCoach.float.body'),
              switchLabel: t('permCoach.notif.switch'),
            });
          }
          openNotificationSettings();
        }}
        // Secondary, and secondary on purpose (see the note at the top of this
        // file): offered only when we do not already have it, never in place of
        // the CTA.
        secondaryLabel={canFloatOverSettings() ? undefined : t('permCoach.float.enable')}
        onSecondary={openOverlaySettings}
        // Dismissing the card is the same refusal as Cancel on the push card —
        // she has now said no twice, and the daily cadence brings this back
        // tomorrow. Nagging inside one visit is what the cadence exists to avoid.
        onDismiss={dismiss}
      />
    );
  }

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
    <View style={styles.overlay} pointerEvents="box-none">
      <TouchableOpacity style={[StyleSheet.absoluteFill, styles.backdrop]} activeOpacity={1} onPress={dismiss} />
      <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
        {/* bell-off, not bell: this card exists because the reminder is OFF, and
            the icon should say so before the title does. */}
        <View style={styles.icon}><Feather name="bell-off" size={26} color={ROSE} /></View>
        <Text style={styles.title}>{t('nudge.notifOff.title')}</Text>
        <Text style={styles.body}>{t('nudge.notifOff.body')}</Text>
        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={() => setStep('coach')}>
          <Text style={styles.ctaText}>{t('nudge.notifOff.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>{t('nudge.setReminder.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The dim lives on the BACKDROP CHILD, never on this elevated root — and that
  // is not a style preference, it is the fix for a real artifact the owner
  // photographed. On Android `elevation` draws an ambient + spot shadow whose
  // outline comes from the view's BACKGROUND DRAWABLE. Give one full-screen view
  // both a background and elevation: 60 and Android renders a 60dp-scale shadow
  // whose penumbra bleeds INSIDE the left and right edges of that outline — and
  // because the view is only 45 % opaque you see it through itself: symmetric
  // dark vertical bands hugging both edges, lighter in the middle, over whatever
  // is behind. A background-less view has an empty outline and casts no shadow,
  // while still taking part in elevation-based draw ordering, so the ordering
  // this overlay needs is unaffected. This is the shape the other five overlays
  // in the app already use (MoodCheckInSheet, SignInSheet, AudioMiniHost,
  // FirstRunTourHost, SpotlightCoach) — these two were the only exceptions.
  //
  // box-none for the reason in dev-guide §2: the root must never capture on its
  // own. The backdrop below is the deliberate dismiss target.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, elevation: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  backdrop: { backgroundColor: 'rgba(20,12,24,0.45)' },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },   // 22 → 28.6 (+30 % card radius per user)
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: `${ROSE}16`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4, marginBottom: 20 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.3 },   // CTA size unified at 17.5 (was 16.5) — per user
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
