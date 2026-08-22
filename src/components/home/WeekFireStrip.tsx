import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import LottieView from 'lottie-react-native';
import { ROSE, TXT, TXTSUB, CARD_RADIUS, FONTS } from '../../constants/theme';
import FireFlame from '../shared/FireFlame';
import { usePrayer } from '../../state/PrayerContext';

const PLANT_LOTTIE = require('../../../assets/lottie/weekly-plant.json');

// The home screen's week strip (owner 2026-08-22, replacing the Daily Rhythm
// bar wholesale): the current Sun–Sat week as DATE numbers, one glyph per day —
//   • both prayers done   → full flame,
//   • exactly one done    → the sapling, FROZEN on its final grown frame
//                           (LottieView progress={1}, no animation — per owner),
//   • today, nothing yet  → rose dashed ring,
//   • other empty days    → faint dashed ring (future days fainter still).
// Today's column sits on a soft rose pill, screenshot-2 style. Pure display:
// no CTA, no progress animation, no guide anchor of its own — the streak-star
// flight origin is the wrapper ref in PrayerScreen.
const SZ = 28;

function DashedRing({ color, width = 1.5 }: { color: string; width?: number }) {
  return (
    <Svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
      <Circle
        cx={SZ / 2} cy={SZ / 2} r={SZ / 2 - 2}
        fill="none" stroke={color} strokeWidth={width}
        strokeDasharray="3 3" strokeLinecap="round"
      />
    </Svg>
  );
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function WeekFireStrip() {
  const { recordOn } = usePrayer();

  // Current week, Sun → Sat — the same construction StreakDailyHost renders,
  // so the two surfaces can never disagree about which days are lit.
  const now = new Date();
  const todayIdx = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - todayIdx);

  return (
    <View style={styles.card}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        const rec = recordOn(ymdOf(d));
        const full = !!rec.m && !!rec.e;
        const half = !full && (!!rec.m || !!rec.e);
        const isToday = i === todayIdx;
        const isFuture = i > todayIdx;
        return (
          <View key={i} style={[styles.cell, isToday && styles.todayPill]}>
            <Text style={[styles.date, { color: isToday ? TXT : TXTSUB }, isToday && styles.dateToday]}>
              {d.getDate()}
            </Text>
            <View style={styles.glyph}>
              {full ? (
                <FireFlame size={SZ} opacity={1} />
              ) : half ? (
                // Final frame only — a grown sapling, not a playing animation.
                <LottieView
                  source={PLANT_LOTTIE}
                  autoPlay={false}
                  loop={false}
                  progress={1}
                  style={styles.plant}
                />
              ) : isToday ? (
                <DashedRing color={ROSE} width={2.5} />
              ) : (
                <DashedRing color={isFuture ? 'rgba(30,27,46,0.12)' : 'rgba(30,27,46,0.22)'} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    paddingVertical: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    borderRadius: CARD_RADIUS - 4,
  },
  todayPill: { backgroundColor: 'rgba(230,63,105,0.08)' },
  date: {
    fontSize: 12,
    fontFamily: FONTS.latoBold,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  dateToday: { fontSize: 13 },
  glyph: { width: SZ, height: SZ, alignItems: 'center', justifyContent: 'center' },
  plant: { width: SZ + 4, height: SZ + 4 },
});
