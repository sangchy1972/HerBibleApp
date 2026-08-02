import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ROSE, LAV, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { mysteryView, MYSTERY_EVERY } from '../../state/quizProgress';

// "N levels from the mystery reward."
//
// PLACEHOLDER ECONOMY — there is no reward behind this yet, only the counter.
// It is shipped anyway because the count itself is the mechanic: a visible
// "2 more" is what makes the next set feel like it's for something. Wire a real
// drop into MYSTERY_EVERY when there is one; nothing here needs to change.
//
// The bar is continuous, not segmented: it is a countdown, not a per-question
// record, and a second 5-segment bar next to the real one would read as the
// same information twice.

export default function MysteryRewardBar({ completedSets }: { completedSets: number }) {
  const t = useT();
  const { current, remaining } = mysteryView(completedSets);
  const pct = Math.max(0, Math.min(1, current / MYSTERY_EVERY));

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <MaterialCommunityIcons name="gift-outline" size={18} color={LAV} />
        <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('quiz.mystery.title')}
        </Text>
        <Text style={styles.count} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('quiz.mystery.remaining', { n: remaining })}
        </Text>
      </View>
      <View style={styles.track}>
        {/* Width as a percentage string: the bar never needs onLayout, so it
            can't flash at the wrong width on first paint. */}
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: {
    flex: 1, marginLeft: 8,
    fontFamily: FONTS.latoBold, fontSize: 13.5, color: TXT, letterSpacing: 0.3,
  },
  count: { fontFamily: FONTS.lato, fontSize: 13, color: TXTSUB, letterSpacing: 0.2 },
  track: {
    height: 6, borderRadius: 10,
    backgroundColor: 'rgba(30,27,46,0.10)', overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 10, backgroundColor: ROSE },
});
