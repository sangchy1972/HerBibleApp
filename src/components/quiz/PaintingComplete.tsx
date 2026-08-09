import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, BackHandler, useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, Easing, interpolate, useReducedMotion,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROSE, BTN_RADIUS, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';
import { useQuiz } from '../../state/QuizContext';
import { artworkAt, artSource, artTitle, artArtist, artCaption, artDesc, QUIZ_ART_COUNT, LAST_ART_TILES } from '../../constants/quizArt';
import { tilesOfPainting } from '../../state/quizProgress';
import { useUILanguage } from '../../state/UILanguageContext';
import PuzzleBoard from './PuzzleBoard';
import PaintingShareArt, { PAINTING_SHARE_WIDTH } from './PaintingShareArt';
import { shareCard, saveCard } from '../../services/cardShare';

// The fourth piece landed and the picture is whole.
//
// A separate moment from the per-set tile reveal on purpose. Completing a
// painting is four sets and twenty questions of work; folding it into the same
// results card that celebrates one set would make the two feel identical, and
// the larger achievement would read as smaller than it is.
//
// The glow is a slow breathing halo rather than a one-shot flash: she arrives
// here mid-scroll after tapping Continue, and a flash that has already peaked
// by the time she looks up is a flash nobody saw.

export default function PaintingComplete({
  paintingIndex, onDone,
}: {
  paintingIndex: number;
  onDone: () => void;
}) {
  const t = useT();
  // UI language, NOT the Bible edition -- the two are chosen separately.
  const { lang } = useUILanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const art = artworkAt(paintingIndex);

  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onDone(); return true; });
    return () => sub.remove();
  }, [onDone]);

  const scrim = useSharedValue(0);
  const rise = useSharedValue(0);
  const halo = useSharedValue(0);

  // The halo was the one UNGATED infinite withRepeat left in the quiz: it ran
  // forever on a celebration that waits for a tap, on a screen that has no
  // other reason to be moving. Reanimated's synchronous hook, not
  // AccessibilityInfo's promise, which resolves after the first frame.
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) { scrim.value = 0.88; rise.value = 1; halo.value = 0; return; }
    scrim.value = withTiming(0.88, { duration: 520, easing: Easing.out(Easing.quad) });
    rise.value = withDelay(260, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    halo.value = withDelay(700, withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [reduceMotion, scrim, rise, halo]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [26, 0]) },
      { scale: interpolate(rise.value, [0, 1], [0.94, 1]) },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 1], [0.28, 0.62]),
    transform: [{ scale: interpolate(halo.value, [0, 1], [1.0, 1.045]) }],
  }));

  // Sized so the picture, its caption and the buttons all fit without a scroll
  // — she should not have to hunt for Collect after a celebration.
  const boardW = Math.min(width - 44, height * 0.42 * (art.aspect || 1), 420);

  const onSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await saveCard(
      shotRef.current,
      () => showToast(t('shareVerse.saveAlert.title')),
      { failTitle: t('error.couldNotSave'), tryAgain: t('common.tryAgain') },
    );
    setBusy(false);
  }, [busy, showToast, t]);

  const onShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const r = await shareCard(shotRef.current, artCaption(art, lang));
    if (r === 'unavailable' || r === 'failed') showToast(t('error.couldNotShare'));
    setBusy(false);
  }, [busy, art, lang, showToast, t]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />

      <Animated.View style={[styles.body, { paddingTop: insets.top + 24 }, riseStyle]}>
        <Text style={styles.congrats} numberOfLines={2} maxFontSizeMultiplier={1.25}>
          {t('quiz.painting.congrats')}
        </Text>
        <Text style={styles.sub} numberOfLines={2} maxFontSizeMultiplier={1.25}>
          {t('quiz.painting.sub')}
        </Text>

        <View style={styles.frame}>
          {/* The halo is a sibling BEHIND the board, inset negatively — a shadow
              on the board itself would be clipped by its own overflow:hidden. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { width: boardW + 46, height: boardW / (art.aspect || 1) + 46 }, haloStyle]}
          />
          {/* The finished picture, whole. tilesUnlocked === tileCount for both
              layouts, so the diptych celebrates as two lit halves rather than a
              2x2 with two phantom quarters still washed over. */}
          <PuzzleBoard
            paintingIndex={paintingIndex}
            tileCount={tilesOfPainting(paintingIndex, QUIZ_ART_COUNT, LAST_ART_TILES)}
            tilesUnlocked={tilesOfPainting(paintingIndex, QUIZ_ART_COUNT, LAST_ART_TILES)}
            size={boardW}
          />
        </View>

        <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {artTitle(art, lang)}
        </Text>
        <Text style={styles.artist} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {art.year ? `${artArtist(art, lang)} · ${art.year}` : artArtist(art, lang)}
        </Text>
        {/* The scene, in ~30 words. Without it this is a handsome rectangle;
            with it she has collected Genesis 24. It is the one line that makes
            the reward belong in a Bible app. */}
        <Text style={styles.desc} numberOfLines={4} maxFontSizeMultiplier={1.25}>
          {artDesc(art, lang)}
        </Text>
      </Animated.View>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>{toast}</Text>
        </View>
      ) : null}

      <View style={[styles.actions, { bottom: Math.max(28, insets.bottom + 16) }]}>
        <View style={styles.iconRow}>
          <IconAction icon="share-2" label={t('quiz.card.share')} onPress={onShare} />
          <IconAction icon="download" label={t('quiz.card.save')} onPress={onSave} />
        </View>
        <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={onDone} accessibilityRole="button">
          <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {t('quiz.card.collect')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Off-screen capture source — laid out for real, parked outside the
          viewport. A node hidden with opacity or display:none captures blank
          on Android. */}
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
  scrim: { backgroundColor: '#000000' },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 22 },
  congrats: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 27,
    color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.4,
  },
  sub: {
    fontFamily: FONTS.lato, fontSize: 14, color: 'rgba(255,255,255,0.62)',
    textAlign: 'center', marginTop: 8, letterSpacing: 0.2,
  },
  frame: { marginTop: 30, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  title: {
    fontFamily: FONTS.loraBold, fontWeight: '600', fontSize: 18.5,
    color: '#FFFFFF', textAlign: 'center', marginTop: 26, letterSpacing: 0.2,
  },
  artist: {
    fontFamily: FONTS.lato, fontSize: 13, color: 'rgba(255,255,255,0.6)',
    textAlign: 'center', marginTop: 5, letterSpacing: 0.2,
  },
  desc: {
    fontFamily: FONTS.lato, fontSize: 12.8, lineHeight: 19,
    color: 'rgba(255,255,255,0.55)', textAlign: 'center',
    marginTop: 12, paddingHorizontal: 12, letterSpacing: 0.2,
  },
  actions: { position: 'absolute', left: 22, right: 22 },
  iconRow: { flexDirection: 'row', justifyContent: 'center', gap: 34, marginBottom: 22 },
  iconAction: { alignItems: 'center', gap: 6 },
  iconDisc: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconLabel: { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.lato, fontSize: 11 },
  cta: {
    height: 54, borderRadius: BTN_RADIUS, backgroundColor: ROSE,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontFamily: FONTS.latoBold, fontSize: 17.5, color: '#FFFFFF', letterSpacing: 0.4 },   // CTA size unified at 17.5 (was 16.5) — per user
  toast: {
    position: 'absolute', left: 40, right: 40, bottom: 190,
    backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  toastText: { color: '#FFFFFF', fontFamily: FONTS.lato, fontSize: 14, textAlign: 'center' },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
});
