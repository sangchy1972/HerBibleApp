import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { ROSE, GREEN_DONE, TXT, BTN_RADIUS, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import QuizOptionButton, { type OptionState } from './QuizOptionButton';
import type { QuizQuestion } from '../../constants/bibleQuiz';

// The answering screen's body. Presentational: every state it renders is handed
// to it, so it holds no quiz logic and can't disagree with the reducer.
//
// `options.length` drives the list — questions in the bank have 2 OR 4 options
// and hardcoding 4 would render two blank buttons on the true/false ones.

export default function QuizQuestionView({
  question, optionStates, locked, wasCorrect, isLast, onPick, onNext,
}: {
  question: QuizQuestion;
  /** One state per option, same order. Length always === options.length. */
  optionStates: OptionState[];
  locked: boolean;
  /** Only meaningful while locked. */
  wasCorrect: boolean;
  isLast: boolean;
  onPick: (i: number) => void;
  onNext: () => void;
}) {
  const t = useT();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.question} maxFontSizeMultiplier={1.4}>
          {question.question}
        </Text>

        {question.options.map((label, i) => (
          <QuizOptionButton
            key={i}
            label={label}
            state={optionStates[i] ?? 'idle'}
            disabled={locked}
            onPress={() => onPick(i)}
          />
        ))}
      </ScrollView>

      {/* The verdict + CTA sit OUTSIDE the scroll view so a long question can
          never push the only way forward below the fold. The footer keeps its
          height whether or not it has content, so tapping an answer doesn't
          shift the options list upward under the user's finger. */}
      <View style={styles.footer}>
        {locked ? (
          <>
            <Text
              style={[styles.verdict, { color: wasCorrect ? GREEN_DONE : ROSE }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
            >
              {wasCorrect ? t('quiz.verdict.correct') : t('quiz.verdict.wrong')}
            </Text>
            <TouchableOpacity
              style={styles.cta}
              activeOpacity={0.85}
              onPress={onNext}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {isLast ? t('quiz.action.seeResults') : t('quiz.action.next')}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  // Merriweather, 20 → 21.6 (the +8 % scale over the reference design).
  question: {
    fontFamily: FONTS.merriweather,
    fontSize: 21.6,
    lineHeight: 31,
    color: TXT,
    letterSpacing: 0.1,
    marginBottom: 22,
  },
  // minHeight, not height: the footer must reserve its full size while empty,
  // or the options list jumps upward under the user's finger the instant she
  // answers. Sized for the verdict line (~21) + its 10 gap + the 54 CTA + the
  // 16 of vertical padding.
  footer: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10, minHeight: 101 },
  verdict: {
    fontFamily: FONTS.latoBold,
    fontSize: 15.5,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 10,
  },
  // The app's primary CTA: rose, BTN_RADIUS, no shadow.
  cta: {
    height: 54,
    borderRadius: BTN_RADIUS,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: FONTS.latoBold,
    fontSize: 16.5,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
});
