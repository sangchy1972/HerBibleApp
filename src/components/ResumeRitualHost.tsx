import React, { useEffect, useRef, useState } from 'react';
import { View, AppState, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import notifee from '@notifee/react-native';
import ResumeCoverSplash from './ResumeCoverSplash';
import RemindersOffScreen, { CREAM } from './RemindersOffScreen';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { useNotifications } from '../state/NotificationsContext';
import { useReminderInterstitial } from '../state/ReminderInterstitialContext';
import { isInterstitialVisible } from '../services/interstitialVisibility';
import { setResumeSplashUp, resumeSplashSuppressed } from '../state/promptSurface';
import { suppressNextHotStart } from '../services/adFrequency';
import { peekPendingRoute } from '../services/pendingNotifRoute';
import { logEvent } from '../services/firebase';

// The long-away resume ritual (owner 2026-08-21): coming back after more than
// 3 minutes replays the cover loading moment — the same photo and line the
// launch showed — and, for users who never granted notifications, follows it
// with the RemindersOff pitch (its CTA fires the OS permission dialog; a
// HARD-denied device falls through to the system notification settings — a
// soft "don't allow" on the dialog she just saw closes quietly, never a
// settings-page ejection; swarm r1+r2 HIGH).
//
// What deliberately does NOT trigger the splash:
//   • an episode our own interstitial caused (the ad activity backgrounds the
//     app — same rule as adFrequency's bgCausedByAd),
//   • an overlay-card entry (she tapped a devotional card; the content she
//     asked for must not hide behind a promo splash — same 15s grace the ad
//     veto uses),
//   • a notification-tap entry with a stashed route (peekPendingRoute — the
//     prayer flow she asked for opens unobscured; same source adFrequency's
//     ad veto reads),
//   • a cold start (bgAt is null; the real LoadingOverlay owns that moment).
//
// The pitch is additionally bounded (swarm r2): once per app-day — which also
// makes the screen's own "we'll ask again tomorrow" skip-copy TRUE — skipped
// entirely in windows where the FollowHim notification gate is about to show
// (two notif-off fullscreens back-to-back otherwise), and its queued request
// self-releases after 30s un-granted so it can never detach from the resume
// moment and pop cold later. The owner can lift the daily cap by deleting the
// PITCH_YMD_KEY guard.
const AWAY_THRESHOLD_MS = 3 * 60_000;
const OVERLAY_ENTRY_GRACE_MS = 15_000;
const PITCH_TTL_MS = 30_000;
const PITCH_YMD_KEY = 'resumeRitual:pitchYmd:v1';

function msSinceOverlayTap(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../modules/expo-overlay-cards') as { msSinceLastOverlayTap?: () => number };
    return mod.msSinceLastOverlayTap?.() ?? Infinity;
  } catch { return Infinity; }
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ResumeRitualHost() {
  const coord = useNudgeCoordinator();
  const { permissionGranted, requestPermissionAndEnableDefaults } = useNotifications();
  const reminderGate = useReminderInterstitial();
  const [splash, setSplash] = useState(false);
  const [askVisible, setAskVisible] = useState(false);
  const grantedRef = useRef(permissionGranted);
  grantedRef.current = permissionGranted;
  const gateRef = useRef(reminderGate.shouldShow);
  gateRef.current = reminderGate.shouldShow;
  const busyRef = useRef(false);

  useEffect(() => {
    let bgAt: number | null = null;
    let adCaused = false;
    let beat: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') {
        if (isInterstitialVisible()) adCaused = true;
        if (bgAt == null) bgAt = Date.now();
        // A pending beat must not resolve into a backgrounded app.
        if (beat) { clearTimeout(beat); beat = null; }
        setResumeSplashUp(false);
        return;
      }
      if (s !== 'active') return;
      const away = bgAt == null ? 0 : Date.now() - bgAt;
      const wasAdCaused = adCaused;
      bgAt = null;
      adCaused = false;
      if (wasAdCaused) return;
      if (away < AWAY_THRESHOLD_MS) return;
      if (msSinceOverlayTap() < OVERLAY_ENTRY_GRACE_MS) return;
      // Claim the surface SYNCHRONOUSLY: the coordinator's same-tick
      // arbitration (streakDaily) and the ad's +600ms sample both read this
      // flag, and the splash component itself mounts too late to win either
      // race (swarm v1.5.0). Every bail-out below releases it.
      setResumeSplashUp(true);
      // One beat, same shape as adFrequency's: warm notification taps deliver
      // through listeners AFTER 'active' and stamp suppressResumeSplash via
      // resetTo — and background PRAY actions live in the stash. Re-check
      // both signals when the beat lands.
      if (beat) clearTimeout(beat);
      beat = setTimeout(() => {
        beat = null;
        void (async () => {
          let pending = false;
          try { pending = (await peekPendingRoute()) != null; } catch { pending = false; }
          if (pending || resumeSplashSuppressed()) { setResumeSplashUp(false); return; }
          logEvent('resume_ritual_splash', { away_s: String(Math.round(away / 1000)) });
          setSplash(true);
        })();
      }, 600);
    });
    return () => {
      sub.remove();
      if (beat) clearTimeout(beat);
      setResumeSplashUp(false);
    };
  }, []);

  // Splash finished → for a notification-less user, queue the pitch through
  // the coordinator — unless today already had one, or the FollowHim gate
  // (a coordinator-EXTERNAL notif-off fullscreen) is about to own this window.
  const onSplashHide = () => {
    setSplash(false);
    if (grantedRef.current || gateRef.current) return;
    void (async () => {
      try { if ((await AsyncStorage.getItem(PITCH_YMD_KEY)) === todayYmd()) return; } catch { /* ask */ }
      coord.requestSlot({
        id: 'resumeReminders',
        priority: NUDGE_PRIORITY.resumeReminders,
        canShow: () => !grantedRef.current && !gateRef.current,
      });
      // Un-granted after 30s (wrong tab, gate held it, anything) → let go:
      // the pitch is paired with THIS resume moment, never a cold pop later.
      setTimeout(() => {
        if (!activeRef.current) coord.releaseSlot('resumeReminders');
      }, PITCH_TTL_MS);
    })();
  };

  const active = coord.isActive('resumeReminders');
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    setAskVisible(active);
    // Burn the daily stamp at the moment it actually appears on screen.
    if (active) AsyncStorage.setItem(PITCH_YMD_KEY, todayYmd()).catch(() => {});
  }, [active]);

  const close = () => {
    setAskVisible(false);
    coord.notifyDismissed('resumeReminders');
    coord.releaseSlot('resumeReminders');
  };
  const release = coord.releaseSlot;
  useEffect(() => () => release('resumeReminders'), [release]);

  const onTurnOn = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    // canAskAgain must be snapshotted BEFORE the request — a fresh soft deny
    // flips it false immediately, and checking after would eject the person
    // who just said "don't allow" into the settings app (swarm r2).
    const pre = await Notifications.getPermissionsAsync().catch(() => null);
    let granted = false;
    try { granted = await requestPermissionAndEnableDefaults(); } catch { granted = false; }
    if (!granted && pre && !pre.granted && pre.canAskAgain === false) {
      // Hard-denied: the OS dialog can no longer appear — settings is the only
      // road. Our own excursion → the return must not open with an ad.
      suppressNextHotStart();
      try { await notifee.openNotificationSettings(); } catch { /* stay in app */ }
    }
    busyRef.current = false;
    logEvent('resume_ritual_notif_cta', { granted: granted ? '1' : '0' });
    close();
  };

  return (
    <>
      {askVisible && (
        <View style={styles.askLayer}>
          <RemindersOffScreen onTurnOn={onTurnOn} onSkip={close} />
        </View>
      )}
      {splash && <ResumeCoverSplash onHide={onSplashHide} />}
    </>
  );
}

const styles = StyleSheet.create({
  // Same forced-screen layer discipline as the other hosts; below the splash
  // (990) so the cover always finishes on top, above the tab UI.
  askLayer: { ...StyleSheet.absoluteFillObject, zIndex: 80, elevation: 80, backgroundColor: CREAM },
});
