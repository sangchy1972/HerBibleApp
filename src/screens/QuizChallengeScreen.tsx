import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { BG, TXT, TXTSUB, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { currentPosition, isTried, sessionSummary } from '../state/quizSession';
import QuizSegmentBar from '../components/quiz/QuizSegmentBar';
import QuizQuestionView from '../components/quiz/QuizQuestionView';
import QuizReviewView from '../components/quiz/QuizReviewView';
import type { OptionState } from '../components/quiz/QuizOptionButton';
import type { RootStackScreenProps } from '../navigation/types';

// The full-screen quiz. Owns no state — every transition goes through
// QuizContext, so closing the screen mid-set and reopening resumes exactly
// where the user left off (the session is persisted on every answer).
//
// Leaving is always allowed and never destructive: the in-flight session
// survives, and the ladder only advances on an explicit "continue".

export default function QuizChallengeScreen({ navigation }: RootStackScreenProps<'Quiz'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {
    ready, bank, session, questions, currentQuestion, segments, progress,
    open, pick, next, retry, finish,
  } = useQuiz();

  // Start (or resume) as soon as the bank is available. Guarded inside `open`,
  // which returns the existing session untouched if one is already in flight.
  //
  // `leaving` matters: committing a set changes progress.setIndex, which
  // changes `open`'s identity, which re-fires this effect during the frame
  // between finish() and the screen unmounting — silently starting and
  // persisting a session for the NEXT set the user never asked to begin.
  const leaving = useRef(false);
  useEffect(() => {
    if (ready && bank && !leaving.current) open();
  }, [ready, bank, open]);

  // Android hardware back = the close button, not a silent no-op.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  const pos = currentPosition(session);
  const answer = pos != null && session ? session.answers[pos] : null;
  const locked = session?.phase === 'locked';

  // One state per option. `tried` beats everything: an option the user already
  // ruled out in an earlier round stays greyed even after she picks a new one.
  const optionStates = useMemo<OptionState[]>(() => {
    if (!currentQuestion) return [];
    return currentQuestion.options.map((_, i) => {
      if (locked && answer) {
        if (answer.picked === i) return answer.correct ? 'correct' : 'wrong';
        // Only reveal the right answer when she got it wrong — revealing it on
        // a correct pick would draw the eye away from her own answer.
        if (answer.correct === false && i === currentQuestion.answerIndex) return 'revealed';
      }
      if (pos != null && isTried(session, pos, i)) return 'tried';
      return 'idle';
    });
  }, [currentQuestion, locked, answer, session, pos]);

  const summary = session ? sessionSummary(session) : null;
  const roundLength = session ? session.queue.length : 0;
  const step = session ? session.cursor + 1 : 0;

  // `ready && bank` is the same gate the home card uses. Reaching this screen
  // without a bank means a deep link or a race, not a normal path — go back
  // rather than render an empty quiz.
  useEffect(() => {
    if (ready && !bank) navigation.goBack();
  }, [ready, bank, navigation]);

  const body = () => {
    if (!session) return null;
    if (session.phase === 'summary' && summary) {
      return (
        <QuizReviewView
          segments={segments}
          correct={summary.correct}
          total={questions.length}
          wrong={summary.wrong}
          level={progress.completedSets + 1}
          firstPassPerfect={summary.firstPassPerfect}
          completedSets={progress.completedSets}
          onRetry={retry}
          onContinue={() => { leaving.current = true; finish(); navigation.goBack(); }}
        />
      );
    }
    if (!currentQuestion) return null;
    return (
      <QuizQuestionView
        question={currentQuestion}
        optionStates={optionStates}
        locked={!!locked}
        wasCorrect={answer?.correct === true}
        isLast={step >= roundLength}
        onPick={pick}
        onNext={next}
      />
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.close}>
          <Feather name="x" size={24} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.level} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.header.level', { n: progress.completedSets + 1 })}
          </Text>
        </View>
        {/* Balances the close button so the title stays optically centred. */}
        <View style={styles.close} />
      </View>

      <QuizSegmentBar segments={segments} height={6} style={styles.bar} />

      {session && session.phase !== 'summary' ? (
        <Text style={styles.counter} maxFontSizeMultiplier={1.3}>
          {t('quiz.header.progress', { n: step, total: roundLength })}
        </Text>
      ) : (
        <View style={styles.counterSpacer} />
      )}

      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  level: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: TXT, letterSpacing: 0.3,
  },
  bar: { marginHorizontal: 20 },
  counter: {
    fontFamily: FONTS.lato, fontSize: 13, color: TXTSUB,
    letterSpacing: 0.4, textAlign: 'center', marginTop: 10, height: 18,
  },
  counterSpacer: { height: 28 },
});
