import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeIn, Easing, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, interpolate,
} from 'react-native-reanimated';
import { TXT, TXTSUB, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';

const APP_ICON = require('../../assets/icon.png');

// A coach card for permissions the OS will NOT grant from an in-app prompt —
// the ones that can only be flipped by hand on a Settings screen.
//
// WHY IT EXISTS. `Linking.openSettings()` drops the user on the app's settings
// ROOT and abandons her there: she has to find the right row, tap into it, and
// know which switch we meant. Most people bounce. This card does the two things
// that fix that — it names the exact switch, and it SHOWS the gesture — and
// only then opens the deepest settings screen the platform will accept.
//
// WHAT IT IS NOT. This renders INSIDE our app, over our own screen, before the
// hand-off. It is not drawn over the Settings app: that needs SYSTEM_ALERT_WINDOW
// (which is the very permission such a flow would be asking for), and from
// Android 12 the Settings UI sets SYSTEM_FLAG_HIDE_NON_SYSTEM_OVERLAY_WINDOWS
// and drops touches from untrusted overlays anyway. So the card has to land
// before the jump, not during it.
//
// The mock switch is deliberately NOT interactive. It animates, it does not
// respond — a switch that looks live but changes nothing would read as broken,
// so the only tappable things here are the CTA, the X, and the scrim.

export interface PermissionCoachProps {
  visible: boolean;
  /** Headline — name the outcome she wants, not the permission's OS name. */
  title: string;
  /** Label on the row the animated finger points at. Should match, word for
   *  word, the label she will find on the Settings screen. */
  switchLabel: string;
  /** Runs on the CTA. Should open settings; the caller owns the deep link so
   *  this component stays permission-agnostic. */
  onOpenSettings: () => void;
  /** X, scrim tap, and Android back. */
  onDismiss: () => void;
}

export default function PermissionCoachOverlay({
  visible, title, switchLabel, onOpenSettings, onDismiss,
}: PermissionCoachProps) {
  const t = useT();
  if (!visible) return null;

  return (
    // Modal, not an absolute-fill View: this can be raised from a screen nested
    // inside a navigator, and a bare overlay is then clipped to that screen's
    // box (the bug QuizPromoHost's header documents at length).
    <Modal transparent visible statusBarTranslucent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
          <TouchableOpacity onPress={onDismiss} hitSlop={14} style={styles.close}>
            <MaterialCommunityIcons name="close" size={22} color={TXTSUB} />
          </TouchableOpacity>

          <Text style={styles.title} maxFontSizeMultiplier={1.25}>{title}</Text>

          {/* A miniature of the Settings row she is about to look for. The
              icon and name are ours so she can pick our row out of a list of
              lookalike apps — on a phone with several Bible apps installed
              that list is genuinely ambiguous. */}
          <View style={styles.mock}>
            <View style={styles.mockAppRow}>
              <Image source={APP_ICON} style={styles.mockIcon} />
              <Text style={styles.mockAppName} numberOfLines={1}>Her Bible</Text>
            </View>
            <View style={styles.mockDivider} />
            <View style={styles.mockToggleRow}>
              <Text style={styles.mockToggleLabel} numberOfLines={1}>{switchLabel}</Text>
              <MockSwitchWithFinger />
            </View>
          </View>

          <TouchableOpacity onPress={onOpenSettings} activeOpacity={0.9} style={styles.cta}>
            <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.25}>
              {t('common.openSettings')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// The gesture, on a ~2.9 s loop: rest off, thumb slides on, rest on, cut back.
// Same choreography as WeeklyProgressView's ReminderToggleHint — a user who has
// seen that one already knows what this is asking her to do.
function MockSwitchWithFinger() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withSequence(
      withTiming(0, { duration: 550 }),                                       // rest, off
      withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }),   // the flip
      withTiming(1, { duration: 900 }),                                       // rest, on
      withTiming(0, { duration: 0 }),                                         // cut, don't rewind
    ), -1, false);
  }, [p]);

  const TRAVEL = 22;   // 52 track − 2×3 padding − 24 knob
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * TRAVEL }] }));
  // Green only once it has travelled — a track that greens on frame 1 shows the
  // end state while the finger is still at the start, which reads as two
  // different switches rather than one being flipped.
  const track = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.55, 1], [0, 0.35, 1]) }));
  const hand = useAnimatedStyle(() => ({
    transform: [
      { translateX: p.value * TRAVEL },
      { scale: interpolate(p.value, [0, 0.5, 1], [1, 0.84, 1]) },
    ],
  }));

  return (
    <View style={styles.switchWrap} pointerEvents="none">
      <View style={styles.switchTrack} />
      <Animated.View style={[styles.switchTrackOn, track]} />
      <Animated.View style={[styles.switchKnob, knob]} />
      <Animated.Text style={[styles.switchHand, hand]}>{'\u{1F446}'}</Animated.Text>
    </View>
  );
}

/**
 * Deep-link to this app's NOTIFICATION settings, not the app-info root.
 *
 * `Linking.openSettings()` lands on the app-info page, from which notifications
 * are one more tap and one more correct guess away. Android has a dedicated
 * action for the page we actually mean; iOS has no per-section deep link, so
 * `app-settings:` is already as deep as it goes there.
 *
 * Every step falls back rather than throwing: an OEM that does not implement
 * the action must still get the user somewhere useful.
 */
export function openNotificationSettings(): void {
  const fallback = () => { Linking.openSettings().catch(() => {}); };
  if (Platform.OS !== 'android') { fallback(); return; }
  // expoConfig is null in a bare/production edge case, so keep the literal id
  // as the floor — a wrong package here silently opens the wrong app's page.
  const pkg = Constants.expoConfig?.android?.package ?? 'com.holy.bible.kjv.audio.prayer';
  Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
    { key: 'android.provider.extra.APP_PACKAGE', value: pkg },
  ]).catch(fallback);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(20,12,24,0.55)', justifyContent: 'flex-end', padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 26,
    paddingBottom: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  close: { position: 'absolute', top: 10, right: 10, padding: 6, zIndex: 2 },
  title: {
    fontSize: 19, fontWeight: '600', fontFamily: FONTS.loraBold,   // loraBold pairs with 600 (700 drops Lora on Android)
    color: TXT, textAlign: 'center', lineHeight: 26, marginBottom: 18, paddingHorizontal: 12,
  },
  mock: { backgroundColor: 'rgba(30,27,46,0.05)', borderRadius: 12, overflow: 'hidden' },
  mockAppRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  mockIcon: { width: 34, height: 34, borderRadius: 7 },
  mockAppName: { flex: 1, fontSize: 16, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.3 },
  mockDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(30,27,46,0.14)' },
  mockToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  mockToggleLabel: { flex: 1, fontSize: 16, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.3 },
  switchWrap: { width: 52, height: 30, justifyContent: 'center' },
  switchTrack: { ...StyleSheet.absoluteFillObject, borderRadius: 15, backgroundColor: 'rgba(30,27,46,0.20)' },
  switchTrackOn: { ...StyleSheet.absoluteFillObject, borderRadius: 15, backgroundColor: '#3FAE6A' },
  switchKnob: {
    position: 'absolute', left: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  switchHand: { position: 'absolute', left: 2, top: 15, fontSize: 24 },
  cta: {
    marginTop: 18, height: 52, borderRadius: 14,
    backgroundColor: '#C9A36F',                                    // the tan CTA FollowHimScreen already uses
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.4, fontFamily: FONTS.latoBold },
});
