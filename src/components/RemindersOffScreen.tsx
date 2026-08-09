import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Animated, {
  FadeIn, Easing, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, interpolate,
} from 'react-native-reanimated';
import { useSheetSurface } from '../state/promptSurface';
import { ROSE, TXT, BTN_RADIUS, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';

const APP_ICON = require('../../assets/icon.png');

// The second push, shown ONLY after she declines the OS notification dialog
// (owner 2026-08-09, modelled on a competitor's screen). Full-screen, same cream
// ground as ReminderTimeScreen so the two read as one flow.
//
// Its whole job is to make the cost of "no" concrete before asking once more:
// two bars, the second twice the first. The claim is deliberately about
// FREQUENCY of daily devotions and nothing else — the one thing a reminder
// plausibly changes.
//
// Then our own icon, our name, and the switch she is about to be shown, with a
// finger flipping it — so the OS dialog that follows is recognised rather than
// dismissed by reflex. The switch is animated and NOT interactive: a switch that
// looks live and changes nothing reads as broken (same rule as
// PermissionCoachOverlay).

const CREAM = '#F5F0E6';
const YELLOW = '#EDB94D';
const GREY = '#A79FA6';
const SWITCH_ON = '#3FAE6A';   // matches PermissionCoachOverlay's switchTrackOn

export default function RemindersOffScreen({ onTurnOn, onSkip }: {
  /** Fires the OS dialog again (or Settings when the OS will no longer show it). */
  onTurnOn: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  useSheetSurface(true);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onSkip(); return true; });
    return () => sub.remove();
  }, [onSkip]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 20 }]}>
      {/* SCROLLS, with the CTA pinned outside it. The content is ~526dp of fixed
          boxes before any text (the bar cards alone are 188), so on a 360×640
          Android with a 3-button nav bar — or a 4.7" iPhone in Spanish, where the
          claim wraps to three lines — the rose button fell off the bottom edge.
          On the one screen whose only job is turning notifications on. This is the
          same failure the weekly screen already paid for; same fix. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        bounces={false}
      >
      <Animated.Text entering={FadeIn.duration(320)} style={styles.title}>
        {t('remindersOff.title')}
      </Animated.Text>

      <Animated.View entering={FadeIn.duration(360).delay(140)} style={styles.compareCard}>
        <View style={styles.bars}>
          <Bar label={t('remindersOff.without')} value={t('remindersOff.withoutValue')} fill={GREY} heightPct={0.34} />
          <Bar label={t('remindersOff.with')} value={t('remindersOff.withValue')} fill={YELLOW} heightPct={0.72} starred />
        </View>
        <Text style={styles.claim}>{t('remindersOff.claim')}</Text>
      </Animated.View>

      {/* The row she is about to see, with the gesture. */}
      <Animated.View entering={FadeIn.duration(360).delay(260)} style={styles.permRow}>
        <Image source={APP_ICON} style={styles.icon} />
        <View style={styles.permCopy}>
          {/* Hardcoded, like PermissionCoachOverlay's mock row: a brand name is a
              proper noun and is the same in all seven languages. */}
          <Text style={styles.appName} numberOfLines={1}>Her Bible</Text>
          <Text style={styles.permLabel} numberOfLines={1}>{t('remindersOff.allowLabel')}</Text>
        </View>
        <MockSwitchWithFinger />
      </Animated.View>

      </ScrollView>

      <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={onTurnOn} accessibilityRole="button">
        <Text style={styles.ctaText}>{t('remindersOff.cta')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} hitSlop={12} style={styles.skip}>
        <Text style={styles.skipText}>{t('remindersOff.skip')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// One column: a white card whose lower part fills to `heightPct`. Percentages of
// a FIXED card height rather than of the data, so the two bars stay legible at
// any Dynamic Type setting — this is an illustration, not a chart.
function Bar({ label, value, fill, heightPct, starred }: {
  label: string; value: string; fill: string; heightPct: number; starred?: boolean;
}) {
  return (
    <View style={styles.barCol}>
      {/* Vector, not the 🔔 emoji: §1 grants exactly two emoji exceptions and this
          is not one of them, and the glyph differs between One UI and Pixel. */}
      {starred
        ? <View style={styles.bell}><Feather name="bell" size={20} color={YELLOW} /></View>
        : <View style={styles.bellSpacer} />}
      <View style={styles.barCard}>
        <Text style={styles.barLabel} numberOfLines={2} maxFontSizeMultiplier={1.2}>{label}</Text>
        <View style={[styles.barFill, { backgroundColor: fill, height: `${Math.round(heightPct * 100)}%` }]}>
          <Text style={styles.barValue} maxFontSizeMultiplier={1.2}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

// ~2.9 s loop: rest off, thumb slides on, rest on, cut back. Same choreography
// as PermissionCoachOverlay and WeeklyProgressView's ReminderToggleHint, so a
// user who has seen either already knows what it is asking.
function MockSwitchWithFinger() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withSequence(
      withTiming(0, { duration: 600 }),
      withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: 900 }),
      withTiming(0, { duration: 0 }),
    ), -1, false);
  }, [p]);
  const TRAVEL = 22;
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * TRAVEL }] }));
  // Same green as PermissionCoachOverlay's mock switch — the two screens appear back
  // to back in one funnel, and two shades read as two different switches.
  const track = useAnimatedStyle(() => ({ backgroundColor: p.value > 0.5 ? SWITCH_ON : 'rgba(30,27,46,0.18)' }));
  const hand = useAnimatedStyle(() => ({
    transform: [
      { translateX: p.value * TRAVEL },
      { scale: interpolate(p.value, [0, 0.5, 1], [1, 0.84, 1]) },
    ],
  }));
  return (
    <View style={styles.switchWrap}>
      <Animated.View style={[styles.track, track]} />
      <Animated.View style={[styles.knob, knob]} />
      <Animated.Text style={[styles.hand, hand]}>{'\u{1F446}'}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: CREAM, paddingHorizontal: 22 },
  title: {
    fontSize: 25,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 22,
  },
  compareCard: {
    borderWidth: 1,
    borderColor: 'rgba(237,185,77,0.55)',
    borderRadius: 20,
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  bars: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  barCol: { flex: 1, maxWidth: 150, alignItems: 'center' },
  bell: { height: 26, justifyContent: 'center', marginBottom: 0 },
  bellSpacer: { height: 26 },
  // Fixed height so the two fills are comparable; overflow hidden keeps the
  // fill's square top edge inside the card's rounded corners.
  barCard: {
    alignSelf: 'stretch',
    height: 188,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  barLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: FONTS.latoBold,
    color: TXT,
    textAlign: 'center',
    paddingTop: 16,
    paddingHorizontal: 8,
  },
  barFill: { marginTop: 'auto', alignItems: 'center', justifyContent: 'center' },
  barValue: { fontSize: 19, fontWeight: '700', fontFamily: FONTS.latoBold, color: '#FFFFFF' },
  claim: {
    marginTop: 14,
    fontSize: 14.5,
    lineHeight: 21,
    color: 'rgba(30,27,46,0.72)',
    textAlign: 'center',
    fontFamily: FONTS.lato,
  },
  permRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(237,185,77,0.18)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  icon: { width: 44, height: 44, borderRadius: 10 },
  permCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  appName: { fontSize: 18, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  permLabel: { fontSize: 14, color: 'rgba(30,27,46,0.6)', fontFamily: FONTS.lato, marginTop: 1 },
  switchWrap: { width: 48, height: 28, justifyContent: 'center' },
  track: { ...StyleSheet.absoluteFillObject, borderRadius: 14 },
  knob: { position: 'absolute', left: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  hand: { position: 'absolute', left: 2, top: 15, fontSize: 22 },
  // flexGrow so short content still pushes the CTA to the bottom on a tall
  // screen, and paddingBottom so the last block never sits against the button.
  scroll: { flexGrow: 1, justifyContent: 'center', paddingBottom: 20 },
  cta: {
    height: 56,
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.4 },
  skip: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  skipText: { fontSize: 15, fontWeight: '600', color: 'rgba(30,27,46,0.45)' },
});
