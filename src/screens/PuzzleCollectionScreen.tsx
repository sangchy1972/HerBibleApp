import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { BG, TXT, TXTSUB, FONTS, P } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { puzzleView, TILES_PER_PAINTING } from '../state/quizProgress';
import { QUIZ_ART, QUIZ_ART_COUNT, artworkAt } from '../constants/quizArt';
import PuzzleBoard from '../components/quiz/PuzzleBoard';
import PuzzleArt from '../components/quiz/PuzzleArt';
import MysteryRewardBar from '../components/quiz/MysteryRewardBar';
import type { RootStackScreenProps } from '../navigation/types';

// The puzzle collection — everything the quiz has earned, in one place.
//
// Three bands: the board in progress, the finished paintings, and the mystery
// counter. All of it is DERIVED from `completedSets`; nothing here is stored,
// so there is no way for the collection to disagree with the ladder.

const GRID_GAP = 10;

export default function PuzzleCollectionScreen({ navigation }: RootStackScreenProps<'PuzzleCollection'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { progress } = useQuiz();

  const view = puzzleView(progress.completedSets, QUIZ_ART_COUNT);
  // Adaptive, not fixed: iPhone SE → Pro Max is a 110 pt spread and a hardcoded
  // board would either overflow the small screen or float in the large one.
  const boardSize = Math.min(width - P * 2, 340);
  // 3 across with two 10 pt gutters. Floor, so rounding can never make the row
  // one sub-pixel too wide and wrap the third thumbnail onto its own line.
  const thumb = Math.floor((width - P * 2 - GRID_GAP * 2) / 3);

  // Finished paintings only — the one in progress is already shown above, and
  // listing it twice makes the collection look padded.
  const finished = useMemo(
    () => QUIZ_ART.slice(0, Math.min(view.completedPaintings, QUIZ_ART_COUNT)),
    [view.completedPaintings],
  );

  const current = artworkAt(view.paintingIndex);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.close}>
          <Feather name="x" size={24} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.collection.title')}
          </Text>
        </View>
        <View style={styles.close} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.boardWrap}>
          <PuzzleBoard
            paintingIndex={view.paintingIndex}
            tilesUnlocked={view.tilesUnlocked}
            size={boardSize}
          />
        </View>

        <Text style={styles.caption} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t(current.titleKey)}
        </Text>
        <Text style={styles.captionSub} maxFontSizeMultiplier={1.3}>
          {view.outOfArt
            ? t('quiz.collection.allDone')
            : t('quiz.collection.tiles', { n: view.tilesUnlocked, total: TILES_PER_PAINTING })}
        </Text>

        <View style={styles.mystery}>
          <MysteryRewardBar completedSets={progress.completedSets} />
        </View>

        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
          {t('quiz.collection.collected', { n: finished.length, total: QUIZ_ART_COUNT })}
        </Text>

        {finished.length === 0 ? (
          <Text style={styles.empty} maxFontSizeMultiplier={1.3}>
            {t('quiz.collection.empty')}
          </Text>
        ) : (
          <View style={styles.grid}>
            {finished.map(a => (
              <View key={a.id} style={[styles.thumbWrap, { width: thumb }]}>
                <View style={styles.thumbClip}>
                  <PuzzleArt art={a} size={thumb} />
                </View>
                <Text style={styles.thumbLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {t(a.titleKey)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  headerTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: TXT, letterSpacing: 0.3,
  },
  content: { paddingHorizontal: P, paddingTop: 10 },
  boardWrap: { alignItems: 'center' },
  caption: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 19,
    color: TXT, textAlign: 'center', marginTop: 18, letterSpacing: 0.3,
  },
  captionSub: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    textAlign: 'center', marginTop: 5, letterSpacing: 0.2,
  },
  mystery: { marginTop: 26 },
  sectionTitle: {
    fontFamily: FONTS.latoBold, fontSize: 14, color: TXT,
    letterSpacing: 0.4, marginTop: 30, marginBottom: 12,
  },
  empty: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    lineHeight: 20, letterSpacing: 0.2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: 16 },
  thumbWrap: {},
  thumbClip: { borderRadius: 12, overflow: 'hidden' },
  thumbLabel: {
    fontFamily: FONTS.lato, fontSize: 12, color: TXTSUB,
    marginTop: 6, textAlign: 'center', letterSpacing: 0.2,
  },
});
