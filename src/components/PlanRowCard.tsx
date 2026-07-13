import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TXT, TXTSUB, FONTS } from '../constants/theme';
import PlanCover from './PlanCover';
import { useT } from '../i18n/useT';
import type { PlanSummary } from '../constants/featuredPlansSummary';

interface Props {
  plan: PlanSummary;
  onPress: () => void;
  // Optional override for the pill label. Used by in-progress plan lists to
  // show "Day N" (the day the user should read next) instead of "Start".
  // When omitted, the pill renders the localized fallback (plan.startFallback) —
  // the default for un-started / Saved plans.
  ctaLabel?: string;
}

export default function PlanRowCard({ plan, onPress, ctaLabel }: Props) {
  const t = useT();
  // i18n-safe duration label — singular/plural is split into two catalog
  // entries so languages with different plural rules (Chinese, French, etc.)
  // can render the most natural phrasing.
  const dayLabel = plan.duration_days === 1
    ? t('plan.dayCount.one')
    : t('plan.dayCount.other', { n: plan.duration_days });
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.75}>
      <PlanCover cover={plan.cover} slug={plan.slug} width={111.6} height={79.2} radius={5.4} />
      <View style={styles.meta}>
        <Text style={styles.days}>{dayLabel}</Text>
        <Text style={styles.title} numberOfLines={2}>{plan.title}</Text>
      </View>
      <TouchableOpacity onPress={onPress} style={styles.startBtn} hitSlop={6}>
        <Text style={styles.startText}>{ctaLabel ?? t('plan.startFallback')}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// Returns the lowest day (1-indexed) not yet marked complete on `completed`.
// For an in-progress plan this is what the user should resume — fed into
// PlanRowCard as "Day N". Falls back to 1 for plans the user opened but
// never finished a day on, and `total` if every day is somehow complete.
export function nextUncompletedDay(completed: number[], total: number): number {
  for (let d = 1; d <= total; d++) if (!completed.includes(d)) return d;
  return total;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingLeft: 2,                                                              // +2 px per user — image was crowding the left edge
    marginBottom: 0,
  },
  meta: { flex: 1, minWidth: 0 },
  days: { fontSize: 13, color: TXTSUB, marginBottom: 3, fontWeight: '400', fontFamily: FONTS.lato, letterSpacing: 0.4 },
  title: { fontSize: 15.5, fontWeight: '600', color: TXT, lineHeight: 21, fontFamily: FONTS.latoBold, letterSpacing: 0.2 },
  startBtn: {
    flexShrink: 0,
    paddingHorizontal: 19,
    paddingVertical: 9,
    borderRadius: 19,
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  startText: { fontSize: 14, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },
});
