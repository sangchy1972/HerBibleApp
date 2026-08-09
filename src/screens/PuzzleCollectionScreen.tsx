import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, useWindowDimensions, BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { BG, TXT, TXTSUB, INK_06, ROSE, BTN_RADIUS, FONTS, P } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useQuiz } from '../state/QuizContext';
import { puzzleView, TILES_PER_PAINTING } from '../state/quizProgress';
import {
  QUIZ_ART, QUIZ_ART_COUNT, artSource, artThumbSource, artTitle, artArtist, artDesc, artCaption,
  type QuizArtwork,
} from '../constants/quizArt';
import { useUILanguage } from '../state/UILanguageContext';
import PuzzleBoard from '../components/quiz/PuzzleBoard';
import PaintingShareArt, { PAINTING_SHARE_WIDTH } from '../components/quiz/PaintingShareArt';
import { shareCard, saveCard } from '../services/cardShare';
import type { RootStackScreenProps } from '../navigation/types';

// Every painting the quiz has earned, plus the one in progress.
//
// STILL DERIVES EVERYTHING from `completedSets`. Nothing on this screen is
// stored, which is what makes it trivially correct and is why the mystery cards
// got their own screen instead of a band at the bottom of this one.
//
// Finished paintings only in the grid. The one in progress is already the hero
// above; listing it twice makes the collection look padded.

const GRID_GAP = 10;

export default function PuzzleCollectionScreen({ navigation }: RootStackScreenProps<'PuzzleCollection'>) {
  const t = useT();
  // UI language, NOT the Bible edition -- the two are chosen separately.
  const { lang } = useUILanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { progress, bank, canStart, daily, lifecycle } = useQuiz();
  const [detail, setDetail] = useState<QuizArtwork | null>(null);

  const view = puzzleView(progress.completedSets, QUIZ_ART_COUNT);
  // Adaptive, not fixed: iPhone SE to Pro Max is a 110pt spread and a hardcoded
  // board would either overflow the small screen or float in the large one.
  const boardW = Math.min(width - P * 2, 380);
  const thumb = Math.floor((width - P * 2 - GRID_GAP) / 2);

  // Every finished painting, unconditionally. The hero board carries the one in
  // PROGRESS, so the two never overlap -- except once the art runs out, when the
  // hero has nothing left to show and falls back to the last finished painting.
  // Subtracting one there fixed the duplicate but hid painting 24 permanently:
  // the hero board is not tappable, so she could not open, share or save the
  // last picture she earned while the progress screen told her she had all 24.
  // The hero is dropped instead -- see `showHero`.
  const finished = useMemo(
    () => QUIZ_ART.slice(0, view.completedPaintings),
    [view.completedPaintings],
  );
  const showHero = !view.outOfArt;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="x" size={24} color={TXT} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.collection.title')}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {showHero ? (
          <View style={styles.boardWrap}>
            <PuzzleBoard
              paintingIndex={view.paintingIndex}
              tilesUnlocked={view.tilesUnlocked}
              size={boardW}
              showCaption
            />
          </View>
        ) : null}

        <Text style={styles.captionSub} maxFontSizeMultiplier={1.3}>
          {view.outOfArt
            ? t('quiz.collection.allDone')
            : t('quiz.collection.tiles', { n: view.tilesUnlocked, total: TILES_PER_PAINTING })}
        </Text>
        {/* Same reason the mystery bar is hidden on the dashboard: "2 more
            levels and this one is yours" is untrue once there are no more
            levels to play. */}
        {!lifecycle.retired && !view.outOfArt && view.tilesUnlocked < TILES_PER_PAINTING ? (
          <Text style={styles.nudge} maxFontSizeMultiplier={1.3}>
            {t('quiz.collection.nudge', { n: TILES_PER_PAINTING - view.tilesUnlocked })}
          </Text>
        ) : null}

        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
          {t('quiz.collection.collected', { n: finished.length, total: QUIZ_ART_COUNT })}
        </Text>

        {finished.length === 0 ? (
          <>
            <Text style={styles.empty} maxFontSizeMultiplier={1.3}>{t('quiz.collection.empty')}</Text>
            <TouchableOpacity
              style={[styles.goPlay, !canStart && styles.goPlayOff]}
              activeOpacity={0.85}
              onPress={() => navigation.replace('Quiz')}
              disabled={!canStart}
              accessibilityRole="button"
            >
              {/* Dimmed rather than hidden once today is spent. replace() would
                  otherwise walk her into the cap wall AND drop the screen she
                  came from, so Close would land two pages back. */}
              <Text style={styles.goPlayText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {/* !bank FIRST. canStart requires a bank, so without this the
                    offline user read "Today's 3 sets are done" on a day she had
                    not answered a single question. */}
                {!bank
                  ? t('quiz.error.title')
                  : canStart
                    ? t('quiz.cards.goPlay')
                    : lifecycle.retired
                      ? t('quiz.done.cardSub')
                      : t('quiz.daily.capCard', { total: daily.limit })}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.grid}>
            {finished.map(a => (
              <TouchableOpacity
                key={a.id}
                style={{ width: thumb }}
                activeOpacity={0.85}
                onPress={() => setDetail(a)}
                accessibilityRole="button"
                accessibilityLabel={`${artTitle(a, lang)}, ${artArtist(a, lang)}`}
              >
                <Image
                  source={artThumbSource(a)}
                  style={[styles.thumb, { width: thumb, height: Math.round(thumb / (a.aspect || 1)) }]}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                <Text style={styles.thumbTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {artTitle(a, lang)}
                </Text>
                <Text style={styles.thumbArtist} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {artArtist(a, lang)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {detail ? <PaintingDetail art={detail} onClose={() => setDetail(null)} /> : null}
    </View>
  );
}

/** Full painting, unseamed, with share and save. */
function PaintingDetail({ art, onClose }: { art: QuizArtwork; onClose: () => void }) {
  const t = useT();
  // UI language, NOT the Bible edition -- the two are chosen separately.
  const { lang } = useUILanguage();
  const { width, height } = useWindowDimensions();
  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  // Android back closes the PAINTING, not the whole collection.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const w = Math.min(width - 36, height * 0.52 * (art.aspect || 1));

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    const r = await shareCard(shotRef.current, artCaption(art, lang));
    if (r === 'unavailable' || r === 'failed') showToast(t('error.couldNotShare'));
    setBusy(false);
  };

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    await saveCard(
      shotRef.current,
      () => showToast(t('shareVerse.saveAlert.title')),
      { failTitle: t('error.couldNotSave'), tryAgain: t('common.tryAgain') },
    );
    setBusy(false);
  };

  return (
    <View style={styles.detail}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        activeOpacity={1}
        accessibilityLabel={t('common.close')}
      />

      {/* Shown WHOLE, with no seams. The jigsaw is how she earned it, not what
          it is. */}
      <Image
        source={artSource(art)}
        style={{ width: w, height: Math.round(w / (art.aspect || 1)), borderRadius: 12 }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.detailTitle} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {artTitle(art, lang)}
      </Text>
      <Text style={styles.detailArtist} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {art.year ? `${artArtist(art, lang)} · ${art.year}` : artArtist(art, lang)}
      </Text>
      {/* The scene, in ~30 words. She earned a real painting of a real passage;
          without this it is a pretty rectangle she cannot place. Scrolls,
          because German runs long and a small screen would clip it. */}
      <ScrollView style={styles.detailDescWrap} contentContainerStyle={styles.detailDescBox}>
        <Text style={styles.detailDesc} maxFontSizeMultiplier={1.4}>{artDesc(art, lang)}</Text>
      </ScrollView>

      <View style={styles.detailActions}>
        <IconAction icon="share-2" label={t('quiz.card.share')} onPress={onShare} />
        <IconAction icon="download" label={t('quiz.card.save')} onPress={onSave} />
      </View>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      ) : null}

      <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
        <View ref={shotRef} collapsable={false}>
          <PaintingShareArt
            source={artSource(art)}
            aspect={art.aspect}
            title={artTitle(art, lang)}
            artist={artArtist(art, lang)}
            year={art.year}
            width={PAINTING_SHARE_WIDTH}
          />
        </View>
      </View>
    </View>
  );
}

function IconAction({
  icon, label, onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.iconAction} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.iconDisc}>
        <Feather name={icon} size={21} color="#FFFFFF" />
      </View>
      <Text style={styles.iconLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: TXT, letterSpacing: 0.3,
  },
  scroll: { paddingHorizontal: P, paddingTop: 10 },
  boardWrap: { alignItems: 'center' },
  captionSub: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    textAlign: 'center', marginTop: 12, letterSpacing: 0.2,
  },
  nudge: {
    fontFamily: FONTS.lato, fontSize: 13, color: ROSE,
    textAlign: 'center', marginTop: 6, letterSpacing: 0.2,
  },
  sectionTitle: {
    fontFamily: FONTS.latoBold, fontSize: 14, color: TXT,
    letterSpacing: 0.4, marginTop: 30, marginBottom: 12,
  },
  empty: {
    fontFamily: FONTS.lato, fontSize: 13.5, color: TXTSUB,
    lineHeight: 20, letterSpacing: 0.2,
  },
  goPlay: {
    height: 50, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center', marginTop: 22,
  },
  goPlayOff: { opacity: 0.45 },
  goPlayText: { fontFamily: FONTS.latoBold, fontSize: 15.5, color: '#FFFFFF', letterSpacing: 0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: 18 },
  thumb: { borderRadius: 10, backgroundColor: INK_06 },
  thumbTitle: {
    fontFamily: FONTS.latoBold, fontSize: 12.5, color: TXT,
    marginTop: 7, letterSpacing: 0.2,
  },
  thumbArtist: { fontFamily: FONTS.lato, fontSize: 11.5, color: TXTSUB, marginTop: 2 },

  detail: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' },
  detailTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18,
    color: '#FFFFFF', textAlign: 'center', marginTop: 20, paddingHorizontal: 24,
  },
  detailArtist: {
    fontFamily: FONTS.lato, fontSize: 13, color: 'rgba(255,255,255,0.6)',
    textAlign: 'center', marginTop: 5,
  },
  // maxHeight not height: three lines of Spanish and six of German both have to
  // sit between the artist line and the buttons without pushing either off.
  detailDescWrap: { flexGrow: 0, maxHeight: 132, marginTop: 14, alignSelf: 'stretch' },
  detailDescBox: { paddingHorizontal: 30 },
  detailDesc: {
    fontFamily: FONTS.lato, fontSize: 13.5, lineHeight: 21,
    color: 'rgba(255,255,255,0.74)', textAlign: 'center', letterSpacing: 0.2,
  },
  detailActions: { flexDirection: 'row', justifyContent: 'center', gap: 34, marginTop: 26 },
  iconAction: { alignItems: 'center', gap: 6 },
  iconDisc: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconLabel: { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.lato, fontSize: 11 },
  toast: {
    position: 'absolute', left: 40, right: 40, bottom: 80,
    backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  toastText: { color: '#FFFFFF', fontFamily: FONTS.lato, fontSize: 14, textAlign: 'center' },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
});
