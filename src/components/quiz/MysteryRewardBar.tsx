import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { ROSE, TXT, TXTSUB, FONTS, INK_06 } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { mysteryView, MYSTERY_EVERY } from '../../state/quizProgress';

// "Just N away from the mystery reward", with the gift waiting at the end of
// the bar — the reference design's shape.
//
// The counter behind the mystery card draw. MYSTERY_EVERY is load-bearing:
// hitting zero grants a real draw (see cardDraw.ts / MysteryDrawOverlay), so
// changing it changes the reward economy, not just a label.
//
// The bar is continuous, not segmented: it is a countdown, not a per-question
// record, and a second 5-segment bar next to the real one would read as the
// same information twice.

const GIFT = require('../../../assets/reward-gift.png');
// The processed asset is 160x180 (see the commit that added it); keep its
// aspect so the ribbon doesn't squash.
const GIFT_H = 52;
const GIFT_W = GIFT_H * (160 / 180);

export default function MysteryRewardBar({ completedSets }: { completedSets: number }) {
  const t = useT();
  const { current, remaining } = mysteryView(completedSets);
  const pct = Math.max(0, Math.min(1, current / MYSTERY_EVERY));

  return (
    <View style={styles.root}>
      <Text style={styles.headline} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {t('quiz.mystery.away', { n: remaining })}
      </Text>
      <View style={styles.row}>
        <View style={styles.track}>
          {/* Width as a percentage string: the bar never needs onLayout, so it
              can't flash at the wrong width on first paint. */}
          {pct > 0 ? (
            <View style={[styles.fill, { width: `${pct * 100}%` }]}>
              {/* The count rides inside the fill once there is room for it,
                  exactly like the reference. Below ~1/3 it wouldn't fit. */}
              {pct >= 1 / MYSTERY_EVERY ? (
                <Text style={styles.fillCount} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {current}/{MYSTERY_EVERY}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyCount} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {current}/{MYSTERY_EVERY}
            </Text>
          )}
        </View>
        {/* The gift sits over the end of the track — what the bar is filling
            toward, not a fourth segment of it. */}
        <Image source={GIFT} style={styles.gift} accessibilityIgnoresInvertColors />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  headline: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 17,
    color: TXT, textAlign: 'center', letterSpacing: 0.2, marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  track: {
    flex: 1, height: 24, borderRadius: 12,
    backgroundColor: INK_06, overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    height: '100%', borderRadius: 12, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  fillCount: {
    fontFamily: FONTS.latoBold, fontSize: 13.5, color: '#FFFFFF', letterSpacing: 0.4,
  },
  emptyCount: {
    fontFamily: FONTS.latoBold, fontSize: 13.5, color: TXTSUB,
    letterSpacing: 0.4, textAlign: 'center',
  },
  // Slight tuck over the track's end.
  gift: { width: GIFT_W, height: GIFT_H, marginLeft: -14 },
});
