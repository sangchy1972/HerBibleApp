import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TXT, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useNotifications } from '../state/NotificationsContext';
import PermissionCoachOverlay, { openNotificationSettings } from '../components/PermissionCoachOverlay';

// Full-screen notification opt-in shown to RETURNING users (gating lives in
// ReminderInterstitialContext; RootNavigator renders this instead of the
// main stack when shouldShow). Only the top-right Skip dismisses it without
// enabling notifications — Continue fires the OS permission prompt directly
// (this screen is itself the rationale) and turns on the daily reminders.
//
// Two bundled backgrounds (woman in a field facing the horizon), each ~80 KB
// webp with the source watermark cropped off. Picked by the wall-clock hour:
// the bright-sunrise frame in the daytime window, the dusk frame otherwise.
const BG_DAY = require('../../assets/follow_him_day.webp');
const BG_NIGHT = require('../../assets/follow_him_night.webp');

// Daytime = [DAY_START, DAY_END). One-line cutoff — tweak to taste.
const DAY_START = 3;   // 03:00
const DAY_END = 18;    // 18:00 (6 pm)
function pickBackground(): number {
  const h = new Date().getHours();
  return h >= DAY_START && h < DAY_END ? BG_DAY : BG_NIGHT;
}

const BTN_TAN = '#C9A36F';

interface Props {
  /** Called after the user resolves the screen (Continue or Skip) — the
   *  parent records "shown today" + advances into the app. */
  onDone: () => void;
}

export default function FollowHimScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { syncPermissionFromSystem } = useNotifications();
  // Resolved once at mount — the screen shows for a single sitting, so it
  // doesn't need to react to the hour ticking over mid-view.
  const bg = useMemo(() => pickBackground(), []);

  // The two buttons are a clean fork, per user:
  //   Skip     → into the app, nothing enabled. Unchanged.
  //   Continue → the coach card, then the system notification-settings page.
  //
  // Continue deliberately does NOT fire the OS permission dialog first. One
  // path for everybody: what she is told to do is what she then sees, whether
  // or not this device has ever shown her the prompt. The alternative branched
  // on invisible state — a user who declined on some earlier run gets no dialog
  // at all (requestPermissionsAsync goes silently no-op once the answer is
  // settled), so the same tap led two different places for reasons she could
  // not see. This costs taps for a first-time user; that trade is the owner's,
  // made knowingly.
  const [coach, setCoach] = useState(false);
  // True only between "she tapped Open Settings" and the next foreground, so a
  // routine backgrounding never triggers the re-check.
  const returning = useRef(false);

  const finish = () => { setCoach(false); onDone(); };
  const onContinue = () => setCoach(true);

  // Came back from Settings — adopt the switch if she flipped it.
  //
  // syncPermissionFromSystem, NOT requestPermissionAndEnableDefaults: the
  // latter can RAISE the OS dialog for a user who has never been asked, which
  // on this path means throwing a system prompt at someone one frame after she
  // walked out of Settings without granting. She already answered by leaving.
  useEffect(() => {
    if (!coach) return;
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || !returning.current) return;
      returning.current = false;
      syncPermissionFromSystem()
        .then(ok => { if (ok) finish(); })       // still off → leave the card up; Skip and X both still work
        .catch(() => {});
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach]);

  const Body = (
    <>
      {/* Bottom scrim so the title/subtitle/button stay legible over the
          photo, mirroring the prayer hero-card veil. */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Skip — the only dismissal that doesn't enable notifications. */}
      <TouchableOpacity
        onPress={onDone}
        style={[styles.skipBtn, { top: insets.top + 8 }]}
        hitSlop={12}
      >
        <Text style={styles.skipText}>{t('reminder.skip')}</Text>
      </TouchableOpacity>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.title}>{t('reminder.title')}</Text>
        <Text style={styles.subtitle}>{t('reminder.subtitle')}</Text>
        {/* No spinner: this opens a local card, there is nothing to await. */}
        <TouchableOpacity onPress={onContinue} style={styles.cta} activeOpacity={0.9}>
          <Text style={styles.ctaText}>{t('common.continue').toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <ImageBackground source={bg} style={styles.root} resizeMode="cover">
      {Body}
      <PermissionCoachOverlay
        visible={coach}
        title={t('permCoach.notif.title')}
        switchLabel={t('permCoach.notif.switch')}
        onOpenSettings={() => { returning.current = true; openNotificationSettings(); }}
        // Dismissing the card is the same decision as Skip: she has now
        // refused twice, so pressing again would be nagging.
        onDismiss={finish}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E140B' },
  skipBtn: {
    position: 'absolute',
    right: 22,
    zIndex: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  skipText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 17,
    fontWeight: '500',
    fontFamily: FONTS.lato, letterSpacing: 0.4,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 40,
    fontWeight: '600',                       // loraBold pairs with 600 (700 drops Lora on Android)
    fontFamily: FONTS.loraBold,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 19,
    lineHeight: 27,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: FONTS.lora,
    marginBottom: 26,
  },
  cta: {
    height: 58,
    borderRadius: 18,
    backgroundColor: BTN_TAN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: FONTS.latoBold,
  },
});
