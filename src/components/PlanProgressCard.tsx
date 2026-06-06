import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import PlanCover from './PlanCover';
import type { PlanSummary } from '../constants/featuredPlansSummary';

interface Props {
  plan: PlanSummary;
  dayLabel: string;   // "Day 3" etc.
  onPress: () => void;
}

// White card with the plan cover on the left and a Day-N caption + title
// stack on the right. Matches the home-screen "More for you" visual idiom
// (white pill card + thumbnail + meta), but tuned for in-progress reading
// plans where the day pointer matters more than a "Start" CTA.
export default function PlanProgressCard({ plan, dayLabel, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <PlanCover cover={plan.cover} slug={plan.slug} width={92.15} height={92.15} radius={10} />
      <View style={styles.meta}>
        <View style={styles.dayRow}>
          <Feather name="check-square" size={15} color={TXTSUB} />
          <Text style={styles.day}>{dayLabel}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{plan.title}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={TXTSUB} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 9.8,                                                           // 14 → 9.8 (matches heroCard above per user)
    paddingVertical: 11.4,                                                       // 12 → 16.5 → 13.25 → 12 → 11.4 (-5 % per user)
    paddingHorizontal: 12,
    marginTop: 12,
    // Lighter shadow per user — was too heavy. Halved opacity + tightened radius.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  meta: { flex: 1, minWidth: 0 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  day: { fontSize: 13, color: TXTSUB, fontFamily: FONTS.lato },
  title: { fontSize: 16, fontWeight: '600', color: TXT, lineHeight: 21, fontFamily: FONTS.latoBold },
});
