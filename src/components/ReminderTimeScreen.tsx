import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSheetSurface } from '../state/promptSurface';
import { ROSE, TXT, BTN_RADIUS, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';

// FULL-SCREEN reminder-time picker, shown right after a prayer (owner
// 2026-08-09 — it was a half-height sheet, which read as an aside for the single
// most valuable ask in the app).
//
// Cream ground with rose buttons, on purpose: the whole app is white/grey-white
// with rose, so a warm ground makes this one screen feel like a different
// moment rather than another card. The CTA stays ROSE so the action still looks
// like every other action in the app.
//
// The wheels are three columns — AM/PM, hour, minute — with the SELECTED value
// ringed rather than sitting under a highlight bar, which is what makes the
// 12-hour columns readable at a glance. The 24-hour clock lives only in the
// value we hand back; she never sees it.

const ITEM_H = 58;
const VISIBLE = 3;

function Wheel<T>({ values, value, onChange, format, width }: {
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  width: number;
}) {
  const idx = Math.max(0, values.indexOf(value));
  const pad = ((VISIBLE - 1) / 2) * ITEM_H;
  return (
    <View style={{ width, height: ITEM_H * VISIBLE }}>
      {/* The ring, drawn UNDER the list and never touchable, so it marks the
          centre slot without taking a single tap away from the scroll. */}
      <View pointerEvents="none" style={styles.ring} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingTop: pad, paddingBottom: pad }}
        contentOffset={{ x: 0, y: idx * ITEM_H }}
        onMomentumScrollEnd={e => {
          const next = Math.max(0, Math.min(values.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
          if (next !== idx) onChange(values[next]);
        }}
      >
        {values.map((v, i) => (
          <View key={i} style={styles.item}>
            <Text style={[styles.itemText, i === idx ? styles.itemActive : styles.itemIdle]}>
              {format ? format(v) : String(v)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function ReminderTimeScreen({
  slot, initialHour, initialMinute, onSave, onSkip,
}: {
  /** Drives the headline: "this morning prayer" vs "this night prayer". */
  slot: 'morning' | 'night';
  initialHour: number;
  initialMinute: number;
  onSave: (hour: number, minute: number) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  // Full-screen and blocking: nothing else may be granted over it.
  useSheetSurface(true);

  const [h24, setH24] = useState(Math.min(23, Math.max(0, initialHour)));
  const [minute, setMinute] = useState(Math.min(59, Math.max(0, initialMinute)));

  // 12-hour split. Kept as (period, hour12) in the UI and reassembled on save,
  // so scrolling the hour wheel past 12 can never silently flip AM↔PM.
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const setPeriod = (p: 'AM' | 'PM') => setH24(p === 'AM' ? hour12 % 12 : (hour12 % 12) + 12);
  const setHour12 = (v: number) => setH24(period === 'AM' ? v % 12 : (v % 12) + 12);

  // Android back = skip. Without it the press reaches the navigator and pops the
  // prayer flow out from under this screen.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onSkip(); return true; });
    return () => sub.remove();
  }, [onSkip]);

  const pad2 = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={[styles.root, { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 20 }]}>
      <Animated.Text entering={FadeIn.duration(320)} style={styles.title}>
        {t(slot === 'morning' ? 'reminderTime.title.morning' : 'reminderTime.title.night')}
      </Animated.Text>

      <View style={styles.wheels}>
        <Wheel
          width={104}
          values={['AM', 'PM'] as const}
          value={period}
          onChange={setPeriod}
        />
        <Wheel
          width={104}
          values={Array.from({ length: 12 }, (_, i) => i + 1)}
          value={hour12}
          onChange={setHour12}
          format={pad2}
        />
        <Text style={styles.colon}>:</Text>
        <Wheel
          width={104}
          values={Array.from({ length: 60 }, (_, i) => i)}
          value={minute}
          onChange={setMinute}
          format={pad2}
        />
      </View>

      <View style={styles.spacer} />

      <TouchableOpacity
        style={styles.cta}
        activeOpacity={0.9}
        onPress={() => onSave(h24, minute)}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{t('reminderTime.save')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} hitSlop={12} style={styles.skip}>
        <Text style={styles.skipText}>{t('reminderTime.skip')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// The one screen in the app with a warm ground. Both values are named here
// rather than in theme.ts on purpose: they belong to this moment, and putting
// them in the shared tokens would invite them onto screens that should stay
// white (dev-guide §1 — backgrounds lean white/grey-white).
const CREAM = '#F5F0E6';
const RING = '#E8C87A';

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: CREAM, paddingHorizontal: 26 },
  title: {
    fontSize: 27,
    fontWeight: '600',                 // loraBold + 600, never 700 (Android drops Lora)
    fontFamily: FONTS.loraBold,
    color: TXT,
    lineHeight: 36,
    marginBottom: 30,
  },
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    top: ITEM_H,
    left: 6,
    right: 6,
    height: ITEM_H,
    borderRadius: ITEM_H / 2,
    borderWidth: 1.5,
    borderColor: RING,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 25, fontFamily: FONTS.loraBold, fontWeight: '600' },
  itemActive: { color: TXT },
  itemIdle: { color: 'rgba(30,27,46,0.42)' },
  colon: { fontSize: 25, fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, marginHorizontal: -2 },
  spacer: { flex: 1 },
  cta: {
    height: 56,
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,            // rose, not the cream's own accent — actions look like actions
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.4 },
  skip: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  skipText: { fontSize: 15, fontWeight: '600', color: 'rgba(30,27,46,0.45)' },
});
