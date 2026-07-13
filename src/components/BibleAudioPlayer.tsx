import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Share, Dimensions, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { verseAtTime, type ChapterTimestamps } from '../services/bibleAudioService';

// Half-screen Bible-narration bottom sheet. A Modal (so it covers the tab bar)
// that drives the SAME expo-audio player instance the BibleReader holds —
// opening it doesn't restart or duplicate playback, and closing it (back /
// Read) leaves the audio running so the in-reader karaoke highlight continues.
//
// Prev/Next move by VERSE using the chapter timestamps: seek to the previous/
// next verse's start. At the chapter's first/last verse they hand off to the
// adjacent chapter (onPrevChapter / onNextChapter, which reload + auto-resume).
// With no timestamps they degrade to chapter nav so the buttons never
// dead-end.

const { height: SCREEN_H } = Dimensions.get('window');
// Half-screen bottom sheet (per user 2026-07-09 — was full-screen with a big
// placeholder cover; the cover is gone so the controls fit comfortably).
const SHEET_H = Math.round(SCREEN_H * 0.5);
const SPEEDS = [1.0, 1.25, 1.5, 2.0, 0.75];

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  visible: boolean;
  bookName: string;
  chapter: number;
  /** Narration language (= translation.code). EN audio is read a touch slowly,
   *  so it gets a hidden 1.1× base rate; the user still sees "1x" and adjusts
   *  relative to that base. Other languages play at true speed. */
  narrationLang: string;
  /** The reader's own player instance — this sheet subscribes to its status
   *  ITSELF (cheap: a handful of elements, only while open), so the giant
   *  reader screen never has to hold a per-tick status subscription. */
  player: AudioPlayer;
  timestamps: ChapterTimestamps | null;
  onClose: () => void;            // back + Read → return to the reader
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onQueue: () => void;            // open the book/chapter drawer
}

export default function BibleAudioPlayer({
  visible, bookName, chapter, narrationLang, player, timestamps,
  onClose, onPrevChapter, onNextChapter, onQueue,
}: Props) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const status = useAudioPlayerStatus(player);
  const [speedIdx, setSpeedIdx] = useState(0);     // index into SPEEDS (1.0 default)
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const playing = !!status?.playing;
  const duration = (status?.duration && status.duration > 0)
    ? status.duration
    : (timestamps?.audio_duration_sec || 0);
  const position = seeking ? seekValue : (status?.currentTime || 0);

  const verses = timestamps?.verses ?? [];
  const curVerse = verseAtTime(timestamps, status?.currentTime || 0);
  const curIdx = curVerse != null ? verses.findIndex(v => v.verse === curVerse) : -1;

  // Hidden per-language base rate: EN narration ships slightly slow, so its
  // real rate = displayed × 1.1 (user still sees/starts at "1x"). Re-applied
  // whenever the underlying player swaps (chapter change resets the native
  // rate to 1.0, but the user's choice should stick).
  const baseRate = narrationLang === 'en' ? 1.1 : 1.0;
  useEffect(() => {
    try { player.setPlaybackRate(SPEEDS[speedIdx] * baseRate); } catch {}
  }, [player, speedIdx, baseRate]);

  // Slide-up entrance + swipe-down dismiss share one translateY (same pattern
  // as ProfileScreen's useSheetPan — every bottom sheet must be swipe-down
  // dismissible). The pan gesture is attached ONLY to the handle/top-bar zone
  // so it can never fight the horizontal progress slider below.
  const slideY = useSharedValue(SHEET_H);
  useEffect(() => {
    if (visible) {
      slideY.value = SHEET_H;
      slideY.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) });
    } else {
      slideY.value = SHEET_H;      // park below for the next open
    }
  }, [visible, slideY]);
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) slideY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        slideY.value = withTiming(SHEET_H, { duration: 260 }, (f) => { if (f) runOnJS(onClose)(); });
      } else {
        slideY.value = withTiming(0, { duration: 220 });
      }
    });
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));

  const cycleSpeed = () => setSpeedIdx(i => (i + 1) % SPEEDS.length);
  const togglePlay = () => { try { playing ? player.pause() : player.play(); } catch {} };

  const onPrev = () => {
    // >2.5s into the current verse → restart it (replay), like a music player.
    if (curIdx >= 0) {
      const cur = verses[curIdx];
      const into = (status?.currentTime || 0) - cur.start;
      if (into > 2.5) { player.seekTo(cur.start); return; }
      if (curIdx > 0) { player.seekTo(verses[curIdx - 1].start); return; }
      onPrevChapter();             // at verse 1, near its start → previous chapter
      return;
    }
    onPrevChapter();               // no timestamps → chapter nav
  };

  const onNext = () => {
    if (curIdx >= 0 && curIdx < verses.length - 1) {
      player.seekTo(verses[curIdx + 1].start);
      return;
    }
    onNextChapter();               // last verse (or no timestamps) → next chapter
  };

  const onShare = () => { Share.share({ message: `${bookName} ${chapter}` }).catch(() => {}); };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Backdrop — tap anywhere above the sheet to dismiss. */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }, slideStyle]}>
          {/* Handle + top bar carry the swipe-down-to-dismiss gesture (kept off
              the body so it can never fight the horizontal progress slider). */}
          <GestureDetector gesture={pan}>
            <View>
              <View style={styles.handle} />
              <View style={styles.topbar}>
                <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.topBtn}>
                  <Feather name="chevron-down" size={28} color={TXT} />
                </TouchableOpacity>
                <Text style={styles.topTitle}>{t('bibleAudio.playing')}</Text>
                <TouchableOpacity onPress={onShare} hitSlop={12} style={styles.topBtn}>
                  <Feather name="share" size={22} color={TXT} />
                </TouchableOpacity>
              </View>
            </View>
          </GestureDetector>

        <View style={styles.body}>
          <Text style={styles.chapterName}>{bookName} {chapter}</Text>

          <TouchableOpacity onPress={onClose} style={styles.readBtn} activeOpacity={0.85}>
            <Text style={styles.readText}>{t('bibleAudio.read')}</Text>
          </TouchableOpacity>

          {/* Progress */}
          <View style={styles.progressWrap}>
            <Text style={styles.time}>{fmt(position)}</Text>
            <View style={styles.sliderWrap}>
              {/* Light verse markers — one tick per verse at its start time,
                  so the bar shows where each sentence begins (e.g. 24 nodes
                  for a 24-verse chapter). */}
              {duration > 0 && verses.length > 1 && (
                <View style={styles.tickLayer} pointerEvents="none">
                  {verses.map(v => {
                    const frac = Math.max(0, Math.min(1, v.start / duration));
                    return <View key={v.verse} style={[styles.tick, { left: `${frac * 100}%` }]} />;
                  })}
                </View>
              )}
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration || 1}
                value={position}
                minimumTrackTintColor={ROSE}
                maximumTrackTintColor="rgba(30,27,46,0.15)"
                thumbTintColor={ROSE}
                onValueChange={(v) => { setSeeking(true); setSeekValue(v); }}
                onSlidingComplete={(v) => { try { player.seekTo(v); } catch {} setSeeking(false); }}
              />
            </View>
          </View>

          {/* Transport */}
          <View style={styles.transport}>
            <TouchableOpacity onPress={cycleSpeed} hitSlop={10} style={styles.sideBtn}>
              <Text style={styles.speedText}>{SPEEDS[speedIdx]}x</Text>
            </TouchableOpacity>
            {/* Prev/next move ONE VERSE (sentence), not a chapter — single
                chevrons read as a small step, vs the skip-back/forward "track"
                glyphs which felt like jumping chapters. */}
            <TouchableOpacity onPress={onPrev} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-left" size={34} color={TXT} />
            </TouchableOpacity>
            {/* Play button — three states:
                  ① audio still loading (isLoaded false, or first-buffer)
                    → spinner, taps no-op
                  ② loaded & playing  → pause glyph (two bars)
                  ③ loaded & paused   → play glyph (triangle)
                The play triangle is optically nudged right by 3 px because
                Feather's play geometry is centered on the bounding box but
                visually weighted to the left — without the nudge it reads
                as off-center inside the round pill. */}
            {(!status?.isLoaded || (status?.isBuffering && !playing)) ? (
              <View style={styles.playBtn} pointerEvents="none">
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <TouchableOpacity onPress={togglePlay} hitSlop={10} style={styles.playBtn} activeOpacity={0.85}>
                <Feather
                  name={playing ? 'pause' : 'play'}
                  size={30}
                  color="#fff"
                  style={playing ? undefined : styles.playGlyphOpticalShift}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onNext} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-right" size={34} color={TXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onQueue} hitSlop={10} style={styles.sideBtn}>
              <Feather name="list" size={24} color={TXT} />
            </TouchableOpacity>
          </View>
        </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Half-screen bottom sheet over a dimmed backdrop (was a full-screen page
  // with a large placeholder cover — cover removed per user, freeing the room).
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,16,28,0.38)' },
  sheet: {
    height: SHEET_H,
    backgroundColor: '#FBF7F6',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 42, height: 4.5, borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.18)',
    marginTop: 10,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },
  topBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 22, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  chapterName: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginTop: 2,
  },
  readBtn: {
    marginTop: 10,
    paddingHorizontal: 34,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(30,27,46,0.4)',
  },
  readText: { fontSize: 16, fontWeight: '600', color: TXT, fontFamily: FONTS.lora },
  progressWrap: { width: '100%', marginTop: 20, marginHorizontal: -28 },        // tightened for the half sheet (was 46 on the full page)
  time: { fontSize: 14, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, marginLeft: 4 },
  sliderWrap: { width: '100%', height: 40, marginTop: 2, justifyContent: 'center' },
  slider: { width: '100%', height: 40 },
  // Verse markers layer — inset ~10 px each side to roughly match the slider's
  // thumb track, so ticks line up with the fill.
  tickLayer: { position: 'absolute', left: 10, right: 10, top: 0, bottom: 0 },
  tick: {
    position: 'absolute',
    top: 17,
    width: 2,
    height: 6,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: 'rgba(30,27,46,0.25)',                                     // light/subtle node
  },
  transport: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginHorizontal: -30,                                                      // -20 → -30 (another -10 px each side per user) — spreads the 1x/prev/play/next/list row wider still
    paddingBottom: 6,
  },
  sideBtn: { width: 56, alignItems: 'center', justifyContent: 'center' },
  speedText: { fontSize: 17, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  navBtn: { width: 56, alignItems: 'center', justifyContent: 'center' },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Optical centering for Feather's `play` glyph — the triangle's geometric
  // bounding box centers, but its visual mass sits ~3 px left of that, so a
  // dead-center triangle reads as "shifted left". 3 px on the icon (NOT the
  // pill) keeps the pause glyph (which IS symmetrical) untouched.
  playGlyphOpticalShift: { marginLeft: 3 },
});
