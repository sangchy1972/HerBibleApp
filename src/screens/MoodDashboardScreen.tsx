import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MonthCalendar from '../components/mood/MonthCalendar';
import DayDetailSheet from '../components/mood/DayDetailSheet';
import { Chevron, DoubleChevron } from '../components/mood/MonthChevrons';
import { MOOD_COLOR, MOOD_SLIDER_ORDER, type Mood } from '../components/MoodEmoji';
import { useMoodCheckIn, type MoodEntry } from '../state/MoodCheckInContext';
import { useUILanguage } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import { useT } from '../i18n/useT';
import {
  monthGrid, isoKey, monthStats, currentStreak, yearStats, monthCountFor,
} from '../state/moodStats';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';

const SEG_W = 220;
const GRADIENT = MOOD_SLIDER_ORDER.map(m => MOOD_COLOR[m]) as [string, string, ...string[]];

export default function MoodDashboardScreen({ navigation }: RootStackScreenProps<'MoodDashboard'>) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const t = useT();
  const { entries } = useMoodCheckIn();

  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [yearCursor, setYearCursor] = useState(() => new Date().getFullYear());
  const [dayKey, setDayKey] = useState<string | null>(null);

  // page 0 = Month, page 1 = Year. Shared value drives BOTH the panel slide and
  // the segmented-pill indicator, so the toggle and the content move together.
  const page = useSharedValue(0);
  const [pageState, setPageState] = useState(0);
  const goPage = (p: number) => {
    setPageState(p);
    page.value = withTiming(p, { duration: 320, easing: Easing.out(Easing.cubic) });
  };

  const panelsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -page.value * W }] }));
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: page.value * (SEG_W / 2) }] }));

  const openMonthAt = (year: number, month0: number) => {
    setMonthCursor(new Date(year, month0, 1));
    goPage(0);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      {/* Header: back + segmented toggle */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Chevron dir="left" />
        </TouchableOpacity>
        <View style={styles.segment}>
          <Animated.View style={[styles.segPill, pillStyle]} />
          <TouchableOpacity style={styles.segBtn} activeOpacity={0.8} onPress={() => goPage(0)}>
            <Text style={[styles.segText, pageState === 0 && styles.segTextOn]}>{t('moodDashboard.toggle.month')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.segBtn} activeOpacity={0.8} onPress={() => goPage(1)}>
            <Text style={[styles.segText, pageState === 1 && styles.segTextOn]}>{t('moodDashboard.toggle.year')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.viewport, { width: W }]}>
        <Animated.View style={[styles.panels, { width: W * 2 }, panelsStyle]}>
          <View style={{ width: W }}>
            <MonthView cursor={monthCursor} setCursor={setMonthCursor} entries={entries} onDayPress={setDayKey} />
          </View>
          <View style={{ width: W }}>
            <YearView year={yearCursor} setYear={setYearCursor} entries={entries} onSelectMonth={openMonthAt} />
          </View>
        </Animated.View>
      </View>

      {dayKey && <DayDetailSheet dateKey={dayKey} onClose={() => setDayKey(null)} />}
    </View>
  );
}

// ── Month view ──────────────────────────────────────────────────────────────
function MonthView({
  cursor, setCursor, entries, onDayPress,
}: {
  cursor: Date; setCursor: (d: Date) => void;
  entries: Record<string, MoodEntry>; onDayPress: (k: string) => void;
}) {
  const t = useT();
  const { lang } = useUILanguage();
  const picks = React.useMemo(() => {
    const m: Record<string, Mood> = {};
    for (const [k, e] of Object.entries(entries)) m[k] = e.mood;
    return m;
  }, [entries]);

  const y = cursor.getFullYear();
  const m0 = cursor.getMonth();
  const { count, pct } = monthStats(picks, y, m0);
  const streak = currentStreak(picks);
  const monthYear = cursor.toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric' });
  const monthShort = cursor.toLocaleDateString(localeFor(lang), { month: 'short' }).toUpperCase();

  const shiftMonth = (d: number) => setCursor(new Date(y, m0 + d, 1));
  const shiftYear = (d: number) => setCursor(new Date(y + d, m0, 1));

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <Text style={styles.bigTitle}>{t('moodDashboard.monthTitle')}</Text>

      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => shiftYear(-1)} hitSlop={12} style={styles.navPlain}><DoubleChevron dir="left" /></TouchableOpacity>
        <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={12} style={styles.navBtn}><Chevron dir="left" /></TouchableOpacity>
        <Text style={styles.navLabel}>{monthYear}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={12} style={styles.navBtn}><Chevron dir="right" /></TouchableOpacity>
        <TouchableOpacity onPress={() => shiftYear(1)} hitSlop={12} style={styles.navPlain}><DoubleChevron dir="right" /></TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <Stat n={String(count)} label={t('moodDashboard.stats.daysNear')} />
        <Stat n={String(streak)} label={t('moodDashboard.stats.streak')} />
        <Stat n={`${pct}%`} label={t('moodDashboard.stats.ofMonth', { month: monthShort })} />
      </View>

      <MonthCalendar cursor={cursor} entries={entries} onDayPress={onDayPress} />

      <View style={styles.legend}>
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.legendBar} />
        <Text style={styles.legendText}>{t('moodCheckIn.slider.heavy')} → {t('moodCheckIn.slider.radiant')}</Text>
        <View style={styles.legendMissed} />
        <Text style={styles.legendText}>{t('moodDashboard.legend.missed')}</Text>
      </View>
    </ScrollView>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Year view ─────────────────────────────────────────────────────────────
function YearView({
  year, setYear, entries, onSelectMonth,
}: {
  year: number; setYear: (y: number) => void;
  entries: Record<string, MoodEntry>; onSelectMonth: (year: number, month0: number) => void;
}) {
  const t = useT();
  const { lang } = useUILanguage();
  const picks = React.useMemo(() => {
    const m: Record<string, Mood> = {};
    for (const [k, e] of Object.entries(entries)) m[k] = e.mood;
    return m;
  }, [entries]);

  const now = new Date();
  const { pct, dayOfYear, total, daysRemaining } = yearStats(picks, year, now);
  const monthShort = (i: number) => new Date(2021, i, 1).toLocaleDateString(localeFor(lang), { month: 'short' }).toUpperCase();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <Text style={styles.bigTitle}>{t('moodDashboard.yearTitle')}</Text>

      <View style={styles.yearRow}>
        <TouchableOpacity onPress={() => setYear(year - 1)} hitSlop={12} style={styles.navBtn}><Chevron dir="left" /></TouchableOpacity>
        <Text style={styles.yearNum}>{year}</Text>
        <TouchableOpacity onPress={() => setYear(year + 1)} hitSlop={12} style={styles.navBtn}><Chevron dir="right" /></TouchableOpacity>
      </View>

      <Text style={styles.yearProgressText}>
        {t('moodDashboard.year.progress', { pct: String(pct), day: String(dayOfYear), total: String(total), remaining: String(daysRemaining) })}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.miniGrid}>
        {Array.from({ length: 12 }, (_, i) => {
          const highlighted = i === now.getMonth() && year === now.getFullYear();
          return (
            <TouchableOpacity key={i} style={styles.miniCell} activeOpacity={0.85} onPress={() => onSelectMonth(year, i)}>
              <View style={[styles.miniCard, highlighted && styles.miniCardOn]}>
                <Text style={[styles.miniLabel, highlighted && styles.miniLabelOn]}>{monthShort(i)}</Text>
                <MiniMonth year={year} month0={i} entries={entries} highlighted={highlighted} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// Compact month dot-grid for the year view mini-cards. Memoized: 12 of these
// (~42 cells each) would otherwise rebuild on every YearView render.
const MiniMonth = React.memo(function MiniMonth({ year, month0, entries, highlighted }: { year: number; month0: number; entries: Record<string, MoodEntry>; highlighted: boolean }) {
  const grid = monthGrid(new Date(year, month0, 1));
  const rows: (typeof grid)[] = [];
  for (let i = 0; i < grid.length; i += 7) rows.push(grid.slice(i, i + 7));
  return (
    <View style={styles.mini}>
      {rows.map((week, wi) => (
        <View key={wi} style={styles.miniRow}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={styles.miniDotEmpty} />;
            const mood = entries[isoKey(cell.date)]?.mood;
            const bg = highlighted
              ? (mood ? MOOD_COLOR[mood] : '#ECECEC')
              : (mood ? '#4A4458' : '#E4E4E4');
            return <View key={ci} style={[styles.miniDot, { backgroundColor: bg }]} />;
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  segment: {
    width: SEG_W, height: 40, borderRadius: 20, backgroundColor: 'rgba(30,27,46,0.06)',
    flexDirection: 'row', padding: 3,
  },
  segPill: {
    position: 'absolute', top: 3, left: 3, width: SEG_W / 2 - 3, height: 34, borderRadius: 17,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '700', color: TXTSUB },
  segTextOn: { color: TXT },

  viewport: { flex: 1, overflow: 'hidden' },
  panels: { flex: 1, flexDirection: 'row' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  bigTitle: { fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, fontSize: 30, lineHeight: 38, marginTop: 4 },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, marginBottom: 16 },
  navBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,27,46,0.06)' },
  navPlain: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 17, fontWeight: '700', color: TXT, minWidth: 130, textAlign: 'center' },

  stats: { flexDirection: 'row', marginBottom: 20 },
  stat: { flex: 1 },
  statNum: { fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, fontSize: 30 },
  statLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: TXTSUB, textTransform: 'uppercase', marginTop: 2 },

  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  legendBar: { width: 54, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: TXTSUB, fontWeight: '600' },
  legendMissed: { width: 14, height: 14, borderRadius: 4, backgroundColor: '#ECECEC', marginLeft: 8 },

  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 6 },
  yearNum: { fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, fontSize: 44, lineHeight: 52 },
  yearProgressText: { fontSize: 14, color: TXTSUB, fontWeight: '600', marginTop: 6, marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(30,27,46,0.08)', overflow: 'hidden', marginBottom: 20 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ROSE },

  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  miniCell: { width: '31.5%', marginBottom: 14 },
  miniCard: { borderRadius: 18.2, padding: 8, backgroundColor: 'rgba(30,27,46,0.03)' },
  miniCardOn: { backgroundColor: '#FFFFFF', },
  miniLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: TXTSUB, marginBottom: 6 },
  miniLabelOn: { color: ROSE },
  mini: {},
  miniRow: { flexDirection: 'row', marginBottom: 2 },
  miniDot: { flex: 1, aspectRatio: 1, borderRadius: 2, marginHorizontal: 1 },
  miniDotEmpty: { flex: 1, aspectRatio: 1, marginHorizontal: 1 },
});
