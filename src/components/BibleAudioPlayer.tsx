import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Share, Dimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { verseAtTime, type ChapterTimestamps } from '../services/bibleAudioService';

// Full-screen Bible-narration player. A Modal (so it covers the tab bar) that
// drives the SAME expo-audio player instance the BibleReader holds — opening
// it doesn't restart or duplicate playback, and closing it (back / Read)
// leaves the audio running so the in-reader karaoke highlight continues.
//
// Prev/Next move by VERSE using the chapter timestamps: seek to the previous/
// next verse's start. At the chapter's first/last verse they hand off to the
// adjacent chapter (onPrevChapter / onNextChapter, which reload + auto-resume).
// With no timestamps they degrade to chapter nav so the buttons never
// dead-end.

const { width, height: SCREEN_H } = Dimensions.get('window');
const COVER = Math.min(width - 120, 300);
const SPEEDS = [1.0, 1.25, 1.5, 2.0, 0.75];

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface AudioLike {
  playing?: boolean;
  currentTime?: number;
  duration?: number;
}
interface PlayerLike {
  play: () => void;
  pause: () => void;
  seekTo: (s: number) => Promise<void> | void;
  setPlaybackRate: (r: number) => void;
}

interface Props {
  visible: boolean;
  bookName: string;
  chapter: number;
  player: PlayerLike;
  status: AudioLike;
  timestamps: ChapterTimestamps | null;
  onClose: () => void;            // back + Read → return to the reader
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onQueue: () => void;            // open the book/chapter drawer
}

export default function BibleAudioPlayer({
  visible, bookName, chapter, player, status, timestamps,
  onClose, onPrevChapter, onNextChapter, onQueue,
}: Props) {
  const insets = useSafeAreaInsets();
  const t = useT();
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

  // Re-apply the chosen speed whenever the underlying player swaps (chapter
  // change resets the native rate to 1.0, but the user's choice should stick).
  useEffect(() => {
    try { player.setPlaybackRate(SPEEDS[speedIdx]); } catch {}
  }, [player, speedIdx]);

  // Slide-up entrance — driven manually (Modal animationType="none") so we
  // control the duration. 600 ms ≈ 2× the native modal slide, per user ("too
  // fast — slow it down by half").
  const slideY = useSharedValue(SCREEN_H);
  useEffect(() => {
    if (visible) {
      slideY.value = SCREEN_H;
      slideY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    } else {
      slideY.value = SCREEN_H;     // park below for the next open
    }
  }, [visible, slideY]);
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
      <Animated.View style={[styles.root, { paddingTop: insets.top }, slideStyle]}>
        {/* Top bar */}
        <View style={styles.topbar}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.topBtn}>
            <Feather name="chevron-left" size={28} color={TXT} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('bibleAudio.playing')}</Text>
          <TouchableOpacity onPress={onShare} hitSlop={12} style={styles.topBtn}>
            <Feather name="share" size={22} color={TXT} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {/* Placeholder cover — warm sunrise gradient + sound glyph. Swap for
              real per-book art later by dropping an <Image> here. */}
          <LinearGradient
            colors={['#F6B26B', '#E8728C', '#7B5AA6']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.cover}
          >
            <Feather name="headphones" size={COVER * 0.28} color="rgba(255,255,255,0.9)" />
          </LinearGradient>

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
            <TouchableOpacity onPress={togglePlay} hitSlop={10} style={styles.playBtn} activeOpacity={0.85}>
              <Feather name={playing ? 'pause' : 'play'} size={30} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-right" size={34} color={TXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onQueue} hitSlop={10} style={styles.sideBtn}>
              <Feather name="list" size={24} color={TXT} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  topBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 22, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  cover: {
    width: COVER,
    height: COVER,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  chapterName: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginTop: 34,
  },
  readBtn: {
    marginTop: 18,
    paddingHorizontal: 34,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(30,27,46,0.4)',
  },
  readText: { fontSize: 16, fontWeight: '600', color: TXT, fontFamily: FONTS.lora },
  progressWrap: { width: '100%', marginTop: 46, marginHorizontal: -18 },        // -8 → -18 (another -10 px each side per user) — widens the progress bar
  time: { fontSize: 14, color: TXTSUB, fontFamily: FONTS.lato, marginLeft: 4 },
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
    marginTop: 18,
    marginHorizontal: -20,                                                      // -10 → -20 (another -10 px each side per user) — spreads the 1x/prev/play/next/list row wider
    paddingBottom: 24,
  },
  sideBtn: { width: 56, alignItems: 'center', justifyContent: 'center' },
  speedText: { fontSize: 17, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold },
  navBtn: { width: 56, alignItems: 'center', justifyContent: 'center' },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
