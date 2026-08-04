import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ROSE, GREEN_DONE, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';

// "Correct!" / "Not quite", floating into place under the options.
//
// Mounted only while the answer is locked, so it REMOUNTS per question and the
// entrance replays every time — there is no reset to forget.
//
// Shared-value driven, never `entering=`: this repo has been bitten repeatedly by
// Reanimated layout animations not running, and the same idiom is used for every
// other entrance here. The watchdog snaps it visible if the timing is dropped, so
// a saturated UI thread can't swallow the only feedback the user gets in words.
//
// pointerEvents none: it is decoration inside a ScrollView, and a
// Reanimated-owned view that can take touches is how tap regions get frozen on
// Android/Fabric.

const FLOAT_FROM = 30;   // rises this far as it fades in (per user)
const REVEAL_MS = 400;

export default function QuizVerdict({ correct }: { correct: boolean }) {
  const t = useT();
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) });
    const wd = setTimeout(() => { p.value = 1; }, REVEAL_MS + 300);
    return () => clearTimeout(wd);
  }, [p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * FLOAT_FROM }],
  }));

  return (
    <Animated.View style={style} pointerEvents="none">
      <Text
        style={[styles.verdict, { color: correct ? GREEN_DONE : ROSE }]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
      >
        {correct ? t('quiz.verdict.correct') : t('quiz.verdict.wrong')}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 15.5 → 18.6 (+20 % per user), bold.
  verdict: {
    fontFamily: FONTS.latoBold,
    fontWeight: '700',
    fontSize: 18.6,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
