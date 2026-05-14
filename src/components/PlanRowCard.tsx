import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TXT, TXTSUB } from '../constants/theme';
import PlanCover from './PlanCover';
import type { PlanSummary } from '../services/plansService';

interface Props {
  plan: PlanSummary;
  onPress: () => void;
}

export default function PlanRowCard({ plan, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.75}>
      <PlanCover cover={plan.cover} width={124} height={88} radius={6} />
      <View style={styles.meta}>
        <Text style={styles.days}>{plan.duration_days} Days</Text>
        <Text style={styles.title} numberOfLines={2}>{plan.title}</Text>
      </View>
      <TouchableOpacity onPress={onPress} style={styles.startBtn} hitSlop={6}>
        <Text style={styles.startText}>Start</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    marginBottom: 6,
  },
  meta: { flex: 1, minWidth: 0 },
  days: { fontSize: 13, color: TXTSUB, marginBottom: 3, fontWeight: '500' },
  title: { fontSize: 15.5, fontWeight: '600', color: TXT, lineHeight: 21 },
  startBtn: {
    flexShrink: 0,
    paddingHorizontal: 19,
    paddingVertical: 9,
    borderRadius: 19,
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  startText: { fontSize: 14, fontWeight: '700', color: TXT },
});
