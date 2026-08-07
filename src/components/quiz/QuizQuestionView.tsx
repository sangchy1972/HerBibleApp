import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { TXT, FONTS } from '../../constants/theme';
import QuizOptionButton, { type OptionState } from './QuizOptionButton';
import QuizOptionsEntrance from './QuizOptionsEntrance';
import QuizVerdict from './QuizVerdict';
import { useAutoAdvance } from './useAutoAdvance';
import type { QuizQuestion } from '../../constants/bibleQuiz';

// The answering screen's body. Presentational: every state it renders is handed
// to it, so it holds no quiz logic and can't disagree with the reducer.
//
// `options.length` drives the list — questions in the bank have 2 OR 4 options
// and hardcoding 4 would render two blank buttons on the true/false ones.
//
// There is no "Next question" button (per user): the coloured answer is held for
// REVEAL_HOLD_MS and then the quiz advances itself, so the whole set can be
// played without ever leaving the option list.

export default function QuizQuestionView({
  question, optionStates, locked, wasCorrect, onPick, onNext,
}: {
  question: QuizQuestion;
  /** One state per option, same order. Length always === options.length. */
  optionStates: OptionState[];
  locked: boolean;
  /** Only meaningful while locked. */
  wasCorrect: boolean;
  onPick: (i: number) => void;
  /** Called by the auto-advance once the reveal has been held. */
  onNext: () => void;
}) {
  useAutoAdvance(locked, onNext);

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

        {/* Entrance replay is driven by the parent remounting this view per
            question (key = round:position on the screen). */}
        <QuizOptionsEntrance>
          {question.options.map((label, i) => (
            <QuizOptionButton
              key={i}
              label={label}
              state={optionStates[i] ?? 'idle'}
              disabled={locked}
              onPress={() => onPick(i)}
            />
          ))}
        </QuizOptionsEntrance>

        {/* Directly under the options rather than pinned to the bottom of the
            screen: it lands next to the answer she just tapped, and appending
            below the list means nothing she is looking at moves. It used to
            share a fixed-height footer with the CTA — with the CTA gone that
            footer was ~100dp of reserved blank space holding one line of text at
            the far bottom of the screen. */}
        {locked ? (
          <View style={styles.verdictSlot}>
            <QuizVerdict correct={wasCorrect} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  // Merriweather. 19.87 → 18 (-5 % floored) and lineHeight 28.5 → 30 (+5 %
  // ceiled), both per user — smaller type, more air between the lines.
  question: {
    fontFamily: FONTS.merriweather,
    fontSize: 18,
    lineHeight: 30,
    color: TXT,
    letterSpacing: 0.1,
    marginBottom: 22,
  },
  // The 11 the last option already carries is part of this gap.
  verdictSlot: { paddingTop: 10 },
});
