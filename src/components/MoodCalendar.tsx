import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import MoodEmoji from './MoodEmoji';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useUILanguage } from '../state/UILanguageContext';
import { useT } from '../i18n/useT';
import { localeFor } from '../i18n/locale';
import { ROSE, TXT, TXTSUB, FONTS, SERIF_HEADING } from '../constants/theme';

// i18n keys for the weekday column headers (Sun → Sat). Resolved per render
// so locale changes flow through without a remount.
const WEEKDAY_KEYS = [
  'moodCalendar.weekday.sun',
  'moodCalendar.weekday.mon',
  'moodCalendar.weekday.tue',
  'moodCalendar.weekday.wed',
  'moodCalendar.weekday.thu',
  'moodCalendar.weekday.fri',
  'moodCalendar.weekday.sat',
] as const;

function isoKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

interface Cell { day: number; date: Date }
function monthGrid(cursor: Date): (Cell | null)[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Cell | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface Props {
  /** Top headline. Defaults to "You have completed your N check-in." */
  headline?: string;
}

export default function MoodCalendar({ headline }: Props) {
  const t = useT();
  const { lang } = useUILanguage();
  const { picks, totalCheckIns } = useMoodCheckIn();
  const [cursor, setCursor] = useState(() => new Date());
  const monthLabel = cursor.toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric' });
  const grid = monthGrid(cursor);
  const today = new Date();
  const todayKey = isoKey(today);
  const todayMood = picks[todayKey];

  const shiftMonth = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const headlineText = headline ?? `You've completed\nyour ${ordinal(totalCheckIns)} check-in.`;

  return (
    <View>
      <Text style={styles.headline}>{headlineText}</Text>

      {/* Month label centered between the two arrows so the < / > buttons
          read as "previous month" / "next month" relative to it. */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={14} style={styles.monthNavBtn}>
          <Feather name="chevron-left" size={22} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.month}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={14} style={styles.monthNavBtn}>
          <Feather name="chevron-right" size={22} color={TXT} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekHead}>
        {WEEKDAY_KEYS.map(k => (
          <Text key={k} style={styles.weekHeadText}>{t(k)}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;
          const key = isoKey(cell.date);
          const isToday = key === todayKey;
          // Light gray for days the user hasn't reached yet (strictly after
          // today) — visually demotes them so the eye lands on the present.
          const isFuture = cell.date > today && !isToday;
          const cellMood = picks[key];
          return (
            <View key={i} style={styles.cell}>
              <View style={styles.bubble}>
                {cellMood ? <MoodEmoji mood={cellMood} size={24} /> : null}
              </View>
              <View style={[styles.numWrap, isToday && styles.numToday]}>
                <Text style={[
                  styles.num,
                  isToday && { color: '#FFFFFF', fontWeight: '700' },
                  isFuture && styles.numFuture,
                ]}>{cell.day}</Text>
              </View>
            </View>
          );
        })}
      </View>
      {/* "Your mood on this day is" card removed per user — the emojis on
          the calendar already convey the same information, so the panel was
          redundant and ate vertical space the calendar needs. */}
    </View>
  );
}

const styles = StyleSheet.create({
  // Title — Times-like serif at weight 600 per user. Source Serif 4 Variable
  // is the closest match to Times New Roman that's bundled; on the rare
  // platforms where SERIF_HEADING's opsz/wght axes aren't honoured the
  // fontFamily falls back to the platform default serif (Times on iOS,
  // Noto Serif on Android), which is still Times-adjacent.
  headline: {
    fontFamily: FONTS.serif,
    fontVariationSettings: SERIF_HEADING,
    fontSize: 28,
    fontWeight: '600',
    color: TXT,
    lineHeight: 36,
    marginTop: 12,
    marginBottom: 5,
    textAlign: 'center',
  },
  // Calendar density trimmed ~30 % per user. Each lever:
  //   • monthRow margins  18/16 → 10/10
  //   • weekHead vertical 8     → 4
  //   • cell paddingVert  5     → 2
  //   • bubble box        40    → 26 (emoji also drops 37 → 24 in JSX)
  //   • bubble→num gap    4     → 1
  //   • numWrap padVert   2     → 1
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 10,
    marginBottom: 10,
  },
  monthNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  month: { fontSize: 18, color: TXT, fontWeight: '700', minWidth: 160, textAlign: 'center' },
  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  weekHeadText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  bubble: {
    width: 26, height: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  numWrap: {
    paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6,
    minWidth: 26, alignItems: 'center',
  },
  numToday: { backgroundColor: ROSE },
  num: { fontSize: 13, color: TXT, fontWeight: '600' },
  // Future-date demotion. 30 % alpha keeps the digit legible while clearly
  // reading as "not yet reached".
  numFuture: { color: 'rgba(30,27,46,0.30)' },
});
