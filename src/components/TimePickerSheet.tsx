import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { useT } from '../i18n/useT';

const ITEM_H = 44;
const VISIBLE = 5;

function ScrollWheel<T>({ values, value, onChange, format }: {
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const idx = Math.max(0, values.indexOf(value));
  const padding = ((VISIBLE - 1) / 2) * ITEM_H;
  const handleEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const newIdx = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_H)));
    if (newIdx !== idx) onChange(values[newIdx]);
  };
  return (
    <View style={{ flex: 1, height: ITEM_H * VISIBLE }}>
      <View pointerEvents="none" style={styles.wheelHighlight} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingTop: padding, paddingBottom: padding }}
        contentOffset={{ x: 0, y: idx * ITEM_H }}
        onMomentumScrollEnd={handleEnd}
      >
        {values.map((v, i) => (
          <View key={i} style={styles.item}>
            <Text style={[styles.itemText, i === idx ? styles.active : styles.inactive]}>
              {format ? format(v) : String(v)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface Props {
  initialHour: number;
  initialMinute: number;
  title?: string;
  /** Inclusive hour bounds. The evening prayer window opens at 18:00, so
   *  evening/night reminder pickers pass minHour 18 and morning ones
   *  maxHour 17 — the wheel simply doesn't offer out-of-window hours. */
  minHour?: number;
  maxHour?: number;
  onConfirm: (hour: number, minute: number) => void;
  onClose: () => void;
}

export default function TimePickerSheet({ initialHour, initialMinute, title, minHour = 0, maxHour = 23, onConfirm, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [hour, setHour] = useState(Math.min(maxHour, Math.max(minHour, initialHour)));
  const [minute, setMinute] = useState(initialMinute);
  // Both current callers (NotificationsScreen, PrayerFlow) pass a title;
  // this fallback keeps the prop optional without forcing every future
  // caller to invent one. English-only is acceptable for the unused default.
  const displayTitle = title ?? 'Pick a time';

  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.overlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>{displayTitle}</Text>
        <View style={styles.wheelRow}>
          <ScrollWheel values={hours} value={hour} onChange={setHour} format={pad} />
          <Text style={styles.colon}>:</Text>
          <ScrollWheel values={minutes} value={minute} onChange={setMinute} format={pad} />
        </View>
        <View style={styles.btnRow}>
          <TouchableOpacity onPress={onClose} style={styles.btnBack} activeOpacity={0.85}>
            <Text style={[styles.btnText, { color: TXTSUB }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm(hour, minute)}
            style={[styles.btnConfirm, { backgroundColor: ROSE }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, { color: '#FFFFFF', fontWeight: '700' }]}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 200 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: P + 4,
    paddingTop: 14,
  },
  handle: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center', marginBottom: 18,
  },
  title: { fontSize: 18, fontWeight: '700', color: TXT, marginBottom: 16 },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 18,
  },
  wheelHighlight: {
    position: 'absolute',
    top: 88, left: 0, right: 0,
    height: ITEM_H,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(30,27,46,0.10)',
    zIndex: 1,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 17 },
  active: { fontSize: 22, fontWeight: '700', color: TXT },
  inactive: { color: 'rgba(30,27,46,0.30)' },
  colon: { fontSize: 22, fontWeight: '700', color: TXT },
  btnRow: { flexDirection: 'row', gap: 11 },
  btnBack: {
    flex: 1, paddingVertical: 15,
    backgroundColor: 'rgba(30,27,46,0.05)',
    borderRadius: 24, alignItems: 'center',
  },
  btnConfirm: {
    flex: 2, paddingVertical: 15,
    borderRadius: 24, alignItems: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '600' },
});
