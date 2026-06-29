import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import MoodEmoji, { MOOD_LIST, type Mood } from './MoodEmoji';
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

// Month-nav chevrons drawn as inline SVG, NOT @expo/vector-icons Feather. The
// icon font loads lazily and on some real devices / production builds it can be
// missing or late, leaving the grey nav buttons with no arrow inside (a "broken"
// look the user hit). An SVG path has no font dependency, so it always renders.
const CHEVRON_D: Record<'left' | 'right' | 'up' | 'down', string> = {
  left:  'M15 18 L9 12 L15 6',
  right: 'M9 18 L15 12 L9 6',
  up:    'M6 15 L12 9 L18 15',
  down:  'M6 9 L12 15 L18 9',
};
function Chevron({ dir, small, color = TXT }: { dir: 'left' | 'right' | 'up' | 'down'; small?: boolean; color?: string }) {
  const s = small ? 15 : 22;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d={CHEVRON_D[dir]} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Double chevron («  ») — fast year jump, mirroring the reference calendar
// header (single = month, double = year).
function DoubleChevron({ dir, color = TXT }: { dir: 'left' | 'right'; color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {dir === 'left' ? (
        <>
          <Path d="M11 18 L5 12 L11 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M18 18 L12 12 L18 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <Path d="M6 18 L12 12 L6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M13 18 L19 12 L13 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}

function isoKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ordinalEn(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// Per-language ordinal for the "{ordinal} check-in" headline. Each locale's
// `moodFlow.calendar.headline` string embeds {ordinal}, so we format the number
// the way that language writes ordinals (en "5th", de "5.", fr "5e", es "5.º",
// pt "5º"); Chinese uses 第 N 次 so the plain digit is correct there.
export function ordinalFor(lang: string, n: number): string {
  switch (lang) {
    case 'en': return ordinalEn(n);
    case 'de': return `${n}.`;
    case 'fr': return n === 1 ? '1re' : `${n}e`;
    case 'es': return `${n}.º`;
    case 'pt': return `${n}º`;
    default:   return String(n);            // zh-Hans / zh-Hant
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
  /** Render the built-in headline. MoodFlow renders its own animated title
      above the calendar, so it passes false; MoodCalendarScreen keeps true. */
  showHeadline?: boolean;
}

export default function MoodCalendar({ headline, showHeadline = true }: Props) {
  const t = useT();
  const { lang } = useUILanguage();
  const { picks, totalCheckIns, recordPickFor } = useMoodCheckIn();
  const [cursor, setCursor] = useState(() => new Date());
  // Make-up check-in: the YYYY-MM-DD a mood is being picked for (today or a
  // past day tapped on the grid), or null when the picker is closed.
  const [pickDate, setPickDate] = useState<string | null>(null);
  // Month/year picker (opens on tapping the month label) + the year it's
  // currently browsing (independent of `cursor` until the user picks a month).
  const [pickerOpen, setPickerOpen] = useState(false);
  const monthLabel = cursor.toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric' });
  const grid = monthGrid(cursor);
  // Chunk into explicit 7-day rows. Rendering each week as its own row of
  // flex:1 cells guarantees exactly 7 columns — the old single flex-wrap grid
  // used width:(100/7)% cells, which round UP on-device and overflow 100 %, so
  // the 7th (Saturday) cell wrapped and every row showed only 6 days.
  const weeks: (Cell | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));
  const today = new Date();
  const todayKey = isoKey(today);
  const todayMood = picks[todayKey];

  const shiftMonth = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };
  const shiftYear = (delta: number) => {
    setCursor(new Date(cursor.getFullYear() + delta, cursor.getMonth(), 1));
  };

  const isCurrentMonth =
    cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();
  // Tapping the month label opens a month/year menu; tapping again closes it.
  const togglePicker = () => setPickerOpen(o => !o);
  // One-tap jump back to the current month.
  const goToday = () => { setCursor(new Date()); setPickerOpen(false); };
  // Localized short month names (Jan…Dec) for the picker grid.
  const monthShort = (i: number) =>
    new Date(2021, i, 1).toLocaleDateString(localeFor(lang), { month: 'short' });

  // Mood-record headline (count-based so it never reads "your 0th check-in").
  // MoodFlow passes its own `headline`, so this only drives the standalone
  // mood-tracking screen.
  const headlineText = headline ?? (
    totalCheckIns === 0 ? t('moodCalendar.headline.empty')
    : totalCheckIns === 1 ? t('moodCalendar.headline.one')
    : t('moodCalendar.headline.count', { count: totalCheckIns })
  );

  return (
    <View>
      {showHeadline ? <Text style={styles.headline}>{headlineText}</Text> : null}

      {/* Month label centered between the two arrows so the < / > buttons
          read as "previous month" / "next month" relative to it. */}
      <View style={styles.monthRow}>
        {/* « = jump a YEAR, ‹ = a MONTH (per user, mirrors a date-picker header). */}
        <TouchableOpacity onPress={() => shiftYear(-1)} hitSlop={12} style={styles.monthNavPlain}>
          <DoubleChevron dir="left" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={12} style={styles.monthNavBtn}>
          <Chevron dir="left" />
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePicker} hitSlop={8} activeOpacity={0.7} style={styles.monthLabelBtn}>
          <Text style={styles.month}>{monthLabel}</Text>
          <Chevron dir={pickerOpen ? 'up' : 'down'} small />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={12} style={styles.monthNavBtn}>
          <Chevron dir="right" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftYear(1)} hitSlop={12} style={styles.monthNavPlain}>
          <DoubleChevron dir="right" />
        </TouchableOpacity>

        {/* Month/year picker — floats OVER the calendar (absolute) with a soft
            scrim behind it, instead of pushing the grid down (per user). The
            scrim catches outside taps to close. */}
        {pickerOpen && (
          <>
            <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)} />
            <View style={styles.pickerCard}>
              {/* Months only — no separate year row (the « » in the header above
                  change the year). Tapping a month jumps to it in the current year. */}
              <View style={styles.pickerMonths}>
                {Array.from({ length: 12 }, (_, i) => {
                  const selected = i === cursor.getMonth();
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.pickerMonthCell}
                      activeOpacity={0.7}
                      onPress={() => { setCursor(new Date(cursor.getFullYear(), i, 1)); setPickerOpen(false); }}
                    >
                      <View style={[styles.pickerMonthPill, selected && styles.pickerMonthPillSel]}>
                        <Text style={[styles.pickerMonthText, selected && styles.pickerMonthTextSel]}>{monthShort(i)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </View>

      {/* Jump back to the current month — only shown when viewing another month. */}
      {!isCurrentMonth && !pickerOpen && (
        <TouchableOpacity onPress={goToday} style={styles.todayChip} activeOpacity={0.85}>
          <Chevron dir="left" small color={ROSE} />
          <Text style={styles.todayChipText}>{t('pastVerses.today')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.weekHead}>
        {WEEKDAY_KEYS.map(k => (
          <Text key={k} style={styles.weekHeadText}>{t(k)}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((cell, ci) => {
              if (!cell) return <View key={ci} style={styles.cell} />;
              const key = isoKey(cell.date);
              const isToday = key === todayKey;
              // Light gray for days the user hasn't reached yet (strictly after
              // today) — visually demotes them so the eye lands on the present.
              const isFuture = cell.date > today && !isToday;
              const cellMood = picks[key];
              return (
                // Tappable to log / change that day's mood (make-up check-in);
                // future days are disabled — you can't pre-log a feeling.
                <TouchableOpacity
                  key={ci}
                  style={styles.cell}
                  activeOpacity={0.6}
                  disabled={isFuture}
                  onPress={() => setPickDate(key)}
                >
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
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      {/* Make-up check-in. Lets the user log today's mood if they never opened
          the daily prompt — or change it. (Any past day is also tappable on the
          grid above to back-fill.) */}
      <TouchableOpacity style={styles.logTodayBtn} activeOpacity={0.9} onPress={() => setPickDate(todayKey)}>
        <Text style={styles.logTodayText}>{todayMood ? t('moodCalendar.updateToday') : t('moodCalendar.logToday')}</Text>
      </TouchableOpacity>

      {/* Mood picker — opens for `pickDate` (today via the button, or any past
          day tapped on the grid). Picking writes that day's mood and closes. */}
      <Modal visible={!!pickDate} transparent animationType="fade" onRequestClose={() => setPickDate(null)}>
        <Pressable style={styles.moodModalBackdrop} onPress={() => setPickDate(null)}>
          <Pressable style={styles.moodModalCard} onPress={() => {}}>
            <Text style={styles.moodModalTitle}>{t('moodFlow.pick.title')}</Text>
            <View style={styles.moodModalGrid}>
              {MOOD_LIST.map((m: Mood) => (
                <TouchableOpacity
                  key={m}
                  style={styles.moodModalCell}
                  activeOpacity={0.8}
                  onPress={() => { if (pickDate) recordPickFor(pickDate, m); setPickDate(null); }}
                >
                  <MoodEmoji mood={m} size={46} />
                  <Text style={styles.moodModalLabel}>{t(`mood.label.${m}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    gap: 8,
    marginTop: 15,                         // +5 above per user (screen felt cramped)
    marginBottom: 20,                      // +5 more below per user
    zIndex: 30,                            // lift the floating month picker (its absolute child) above the grid below
  },
  monthNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  // Year-jump (« ») — lighter, no grey circle, so they read as secondary nav.
  monthNavPlain: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 138, justifyContent: 'center' },
  month: { fontSize: 18, color: TXT, fontWeight: '700', textAlign: 'center' },
  todayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    alignSelf: 'center',
    marginTop: 2, marginBottom: 11,        // 段后距离 +5 per user
    paddingLeft: 8, paddingRight: 12, paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(232,97,154,0.10)',
  },
  todayChipText: { fontSize: 14.3, fontWeight: '700', color: ROSE },   // 13 +10 % per user
  // Soft scrim behind the floating month picker — dims the calendar it covers
  // and catches outside taps to dismiss. Anchored just below the month row.
  // Invisible tap-catcher only — NO dim/scrim (per user: the overlay shouldn't
  // appear at all). Transparent + no elevation, so nothing darkens the calendar.
  pickerBackdrop: {
    position: 'absolute', top: 42, left: 0, right: 0, height: 540,
    backgroundColor: 'transparent',
    zIndex: 30,
  },
  // Floating month/year picker — absolute so it overlays the grid instead of
  // pushing it down (per user). Anchored under the month row.
  pickerCard: {
    position: 'absolute', top: 44, left: 4, right: 4, zIndex: 31,
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    // Clean, light card (no hard border) — soft lift only.
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10, shadowRadius: 20, elevation: 14,
  },
  pickerMonths: { flexDirection: 'row', flexWrap: 'wrap' },
  pickerMonthCell: { width: '25%', paddingVertical: 5, alignItems: 'center' },
  // Each month sits in a pill; the selected one gets a soft pink highlight
  // (mirrors the reference's rounded selected-date chip).
  pickerMonthPill: {
    minWidth: 56, paddingVertical: 8, paddingHorizontal: 6,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  pickerMonthPillSel: { backgroundColor: '#FBE3EE' },
  pickerMonthText: { fontSize: 14.5, color: TXT, fontWeight: '600' },
  pickerMonthTextSel: { color: ROSE, fontWeight: '800' },
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
  grid: { marginTop: 2 },
  weekRow: { flexDirection: 'row' },
  // flex:1 → each row splits into exactly 7 equal columns, aligned 1:1 with the
  // flex:1 weekday headers above (no sub-pixel overflow / wrapping).
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
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
  // Make-up check-in button below the calendar.
  logTodayBtn: {
    alignSelf: 'center',
    marginTop: 32,                         // +10 from the calendar above per user
    backgroundColor: '#FBE3EE',            // very light pink per user
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 17.07,                    // match the Continue button per user
  },
  logTodayText: { fontSize: 15, fontWeight: '700', color: ROSE },
  // Mood-picker modal (make-up check-in for a chosen day).
  moodModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(20,16,28,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  moodModalCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#FFFFFF', borderRadius: 22,
    paddingVertical: 22, paddingHorizontal: 14,
  },
  moodModalTitle: { fontSize: 19, fontWeight: '700', color: TXT, textAlign: 'center', marginBottom: 16 },
  moodModalGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  moodModalCell: { width: '33.33%', alignItems: 'center', paddingVertical: 12 },
  moodModalLabel: { fontSize: 12.5, color: TXT, fontWeight: '600', marginTop: 5 },
});
