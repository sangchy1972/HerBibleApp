import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import MoodEmoji from './MoodEmoji';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { ROSE, TXT, TXTSUB } from '../constants/theme';

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
  const { picks, totalCheckIns } = useMoodCheckIn();
  const [cursor, setCursor] = useState(() => new Date());
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
          <Text key={d} style={styles.weekHeadText}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;
          const key = isoKey(cell.date);
          const isToday = key === todayKey;
          const cellMood = picks[key];
          return (
            <View key={i} style={styles.cell}>
              <View style={styles.bubble}>
                {cellMood ? <MoodEmoji mood={cellMood} size={37} /> : null}
              </View>
              <View style={[styles.numWrap, isToday && styles.numToday]}>
                <Text style={[styles.num, isToday && { color: '#FFFFFF', fontWeight: '700' }]}>{cell.day}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {todayMood && (
        <View style={styles.moodCard}>
          <MoodEmoji mood={todayMood} size={42} />
          <Text style={styles.moodCaption}>Your mood on this day is</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: TXT,
    lineHeight: 36,
    marginTop: 12,
    marginBottom: 5,
    textAlign: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 18,                     // +10 px gap below headline
    marginBottom: 16,
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
    paddingVertical: 8,
  },
  weekHeadText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 5 },   // tighter rows to match smaller bubble
  bubble: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  numWrap: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    minWidth: 26, alignItems: 'center',
  },
  numToday: { backgroundColor: ROSE },
  num: { fontSize: 13, color: TXT, fontWeight: '600' },                        // -10 % from 14
  moodCard: {
    marginTop: 18,
    paddingVertical: 18,
    backgroundColor: 'rgba(30,27,46,0.07)',
    borderRadius: 16,
    alignItems: 'center',
  },
  moodCaption: { marginTop: 6, fontSize: 16, color: TXT, fontWeight: '700' },
});
