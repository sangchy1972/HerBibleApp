import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MOOD_COLOR } from '../MoodEmoji';
import type { MoodEntry } from '../../state/MoodCheckInContext';
import { isoKey, monthGrid } from '../../state/moodStats';
import { useT } from '../../i18n/useT';
import { TXT, TXTSUB } from '../../constants/theme';

// Mood-colored month grid (demo screen 2). Pure display + optional day tap;
// month navigation, stats, and legend live in the parent (dashboard / sheet).

const WEEKDAY_KEYS = [
  'moodCalendar.weekday.sun', 'moodCalendar.weekday.mon', 'moodCalendar.weekday.tue',
  'moodCalendar.weekday.wed', 'moodCalendar.weekday.thu', 'moodCalendar.weekday.fri',
  'moodCalendar.weekday.sat',
] as const;

interface Props {
  cursor: Date;                                   // month to render
  entries: Record<string, MoodEntry>;
  onDayPress?: (dateKey: string) => void;         // omitted → non-interactive
  today?: Date;
}

export default function MonthCalendar({ cursor, entries, onDayPress, today = new Date() }: Props) {
  const t = useT();
  const grid = monthGrid(cursor);
  const rows: (typeof grid)[] = [];
  for (let i = 0; i < grid.length; i += 7) rows.push(grid.slice(i, i + 7));
  const todayKey = isoKey(today);

  return (
    <View>
      <View style={styles.weekHead}>
        {WEEKDAY_KEYS.map(k => (
          <Text key={k} style={styles.weekHeadText}>{t(k)}</Text>
        ))}
      </View>
      <View>
        {rows.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((cell, ci) => {
              if (!cell) return <View key={ci} style={styles.cell} />;
              const key = isoKey(cell.date);
              const isToday = key === todayKey;
              const isFuture = cell.date > today && !isToday;
              const mood = entries[key]?.mood;
              const bg = mood ? MOOD_COLOR[mood] : isFuture ? '#F4F4F4' : '#ECECEC';
              const numColor = mood ? TXT : isFuture ? 'rgba(30,27,46,0.25)' : 'rgba(30,27,46,0.45)';
              const Cmp: any = onDayPress && !isFuture ? TouchableOpacity : View;
              return (
                <Cmp
                  key={ci}
                  style={styles.cell}
                  {...(onDayPress && !isFuture ? { activeOpacity: 0.7, onPress: () => onDayPress(key) } : {})}
                >
                  <View style={[styles.square, { backgroundColor: bg }, isToday && styles.todayRing]}>
                    <Text style={[styles.num, { color: isToday ? '#FFFFFF' : numColor }, isToday && styles.todayNum]}>
                      {cell.day}
                    </Text>
                  </View>
                </Cmp>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  weekHeadText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: TXTSUB, letterSpacing: 1 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  cell: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  square: {
    width: '100%', aspectRatio: 1, maxWidth: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  // Today gets a rose ring + a rose fill so it reads as "you are here".
  todayRing: { borderWidth: 2, borderColor: '#E8619A', backgroundColor: '#E8619A' },
  num: { fontSize: 14, fontWeight: '600' },
  todayNum: { fontWeight: '800' },
});
