import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, cancelAnimation, runOnJS, Easing,
} from 'react-native-reanimated';
import { useAudioPlayerStatus } from 'expo-audio';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useAudioMini } from '../state/AudioMiniContext';

// Floating audio control — the way OUT of audio that's playing off-screen.
//
// Bottom-tab screens stay mounted, so narration started on the Bible tab keeps
// playing when the user moves to Plans or Prayer — with its stop button stranded
// on a screen she isn't looking at. Rather than kill the audio on tab-away (she
// may want it while she reads), the control travels with her: a small pill
// half-tucked against the right edge, above every screen.
//
// Collapsed it's a peeking circle with a slowly spinning note — present but not
// in the way, and it costs no layout space. Tapping it expands to note + chapter
// (tap → jump back to what's playing) and an X (tap → stop). It auto-collapses
// so it never becomes furniture.
//
// It hides entirely while the owning screen is focused, because that screen has
// its own full transport bar — two stop buttons is worse than one.
//
// NOT a <Modal>: this floats over live screens the user must keep using, and an
// RN Modal is a native window that swallows every touch in the app. It's a plain
// absolute View, and the pointerEvents="box-none" root means only the pill
// itself is ever touchable — the rest of the screen stays fully usable.

const SIZE = 46;                 // collapsed circle
// How much of the circle sticks out past the right edge. 0.52 → 0.85 (+15 px
// visible) per user: at half-out it read as a sliver glued to the bezel and was
// hard to hit. Nearly the whole circle now shows, with a small tuck that still
// says "parked at the edge".
const PEEK = 0.85;
const EXPANDED_W = 188;
const ANIM_MS = 320;
const AUTO_COLLAPSE_MS = 4200;
const EASE = Easing.out(Easing.cubic);

/** Subscribes to the player's status in its OWN leaf so the ~250 ms tick can't
 *  re-render anything else. Reports only the boolean the pill cares about. */
function PlayingProbe({ player, onChange }: { player: NonNullable<ReturnType<typeof useAudioMini>['player']>; onChange: (p: boolean) => void }) {
  const status = useAudioPlayerStatus(player);
  const playing = !!status?.playing;
  useEffect(() => { onChange(playing); }, [playing, onChange]);
  return null;
}

/**
 * Keeps a released audio player from killing the app.
 *
 * expo-audio's `useAudioPlayer` holds the player in `useReleasingSharedObject`,
 * so changing the source — which BibleScreen does on every chapter, book or
 * translation change — RELEASES the previous native object. The reference this
 * host renders comes from context state, which lags that release by a render.
 * In that window `useAudioPlayerStatus` reads `player.currentStatus`, a native
 * getter, and the native side throws "Cannot use shared object that was already
 * released". Thrown from a hook during render, that is a FATAL JavascriptException
 * — the app dies (Crashlytics: ExceptionsManagerModule.reportException, 1.0.0 (19),
 * 5 crashes while a user flipped chapters).
 *
 * The ordering cannot be fully closed from here: the release happens inside
 * expo's hook, during BibleScreen's render, before our effects get to run. So we
 * catch it. The boundary is keyed on the player generation, so each new player
 * gets a fresh one and a previous failure never suppresses a healthy probe.
 */
class ProbeBoundary extends React.Component<
  { onDead: () => void; children: React.ReactNode },
  { dead: boolean }
> {
  state = { dead: false };

  static getDerivedStateFromError() {
    return { dead: true };
  }

  componentDidCatch() {
    // Tell the host to stop treating this player as live — otherwise the pill
    // would sit there showing "playing" for audio that no longer exists.
    this.props.onDead();
  }

  render() {
    return this.state.dead ? null : this.props.children;
  }
}

export default function AudioMiniHost() {
  const t = useT();
  const { width } = useWindowDimensions();
  const { player, info, ownerFocused, playerKey, dropPlayer, stopNarration } = useAudioMini();
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // The probe hit a released player. Hide the pill and forget the player so
  // nothing subscribes to it again; the owning screen re-registers its live one.
  const onProbeDead = useCallback(() => {
    setPlaying(false);
    dropPlayer();
  }, [dropPlayer]);

  // Visible only when audio is actually playing AND the user has moved away from
  // the screen that owns it.
  const show = !!player && !!info && playing && !ownerFocused;

  const enter = useSharedValue(0);     // 0 = off-screen right, 1 = docked
  const width_ = useSharedValue(SIZE);
  const pulse = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(show ? 1 : 0, { duration: ANIM_MS, easing: EASE });
    if (!show) setExpanded(false);
  }, [show, enter]);

  // A slow breath on the collapsed circle — enough to catch the eye as "this is
  // live", nowhere near a blink.
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 0;
    if (!show || expanded) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [show, expanded, pulse]);

  useEffect(() => {
    width_.value = withTiming(expanded ? EXPANDED_W : SIZE, { duration: ANIM_MS, easing: EASE });
  }, [expanded, width_]);

  // Note rotation while the collapsed circle is showing.
  useEffect(() => {
    cancelAnimation(spin);
    spin.value = 0;
    if (!show || expanded) return;
    spin.value = withRepeat(withTiming(360, { duration: 3600, easing: Easing.linear }), -1, false);
  }, [show, expanded, spin]);

  // Auto-collapse so it settles back out of the way on its own.
  useEffect(() => {
    if (!expanded) return;
    const id = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(id);
  }, [expanded]);

  // The X on the expanded pill: stop playback outright (the pill's whole reason
  // to exist is off-screen audio, so "close" means "stop"). Per user — replaces
  // the old chevron, whose job the note + label now do. stopNarration also
  // tears down the lock-screen controls and restores the MIX audio mode.
  const onClose = useCallback(() => {
    stopNarration();
    setExpanded(false);
  }, [stopNarration]);

  const onOpen = useCallback(() => {
    setExpanded(false);
    try { info?.onOpen(); } catch { /* nav gone */ }
  }, [info]);

  const rootStyle = useAnimatedStyle(() => {
    // Collapsed: tucked against the edge, only PEEK of it showing. Expanded: the
    // whole pill slides in.
    const hiddenX = SIZE;
    const dockedX = expanded ? 0 : SIZE * (1 - PEEK);
    return {
      transform: [{ translateX: hiddenX + (dockedX - hiddenX) * enter.value }],
      opacity: enter.value,
    };
  });
  const pillStyle = useAnimatedStyle(() => ({ width: width_.value }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.5 }],
  }));

  // The probe must stay mounted whenever a player exists — it's what tells us
  // playback started, so it can't be gated on `show` (that would be circular).
  return (
    <View style={styles.root} pointerEvents="box-none">
      {player ? (
        // key: a new player generation gets a brand-new probe AND boundary, so a
        // subscription can never straddle two players and a past failure can't
        // suppress the live one.
        <ProbeBoundary key={playerKey} onDead={onProbeDead}>
          <PlayingProbe player={player} onChange={setPlaying} />
        </ProbeBoundary>
      ) : null}
      {show ? (
        <Animated.View style={[styles.dock, { top: '38%' }, rootStyle]} pointerEvents="box-none">
          <Animated.View style={[styles.pill, pillStyle]}>
            {/* Breathing halo behind the note — sits under the content and can
                never intercept a tap. */}
            {!expanded ? (
              <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
            ) : null}

            {expanded ? (
              // Note + chapter label are ONE target that opens what's playing
              // (per user); the X on the right stops it. No inline pause — the
              // full transport lives in the player sheet the label opens.
              <>
                <TouchableOpacity onPress={onOpen} style={styles.openBtn} activeOpacity={0.7}>
                  <View style={styles.noteBox}>
                    <Feather name="music" size={19} color="#FFFFFF" />
                  </View>
                  <View style={styles.labelBtn}>
                    <Text style={styles.label} numberOfLines={1}>{info?.label ?? ''}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{t('audioMini.playing')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8} activeOpacity={0.7}>
                  <Feather name="x" size={17} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => setExpanded(true)}
                style={styles.collapsedHit}
                hitSlop={10}
                activeOpacity={0.85}
                accessibilityLabel={t('audioMini.playing')}
              >
                {/* Spinning note = "audio is live", matching the Bible tab's
                    floating button. */}
                <Animated.View style={spinStyle}>
                  <Feather name="music" size={19} color="#FFFFFF" />
                </Animated.View>
              </TouchableOpacity>
            )}
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the tab bar and every screen, below the launch overlay (zIndex 1000)
  // and the first-run tour (90) — a coach-mark must never be covered.
  root: { ...StyleSheet.absoluteFillObject, zIndex: 80, elevation: 80 },
  dock: { position: 'absolute', right: 0 },
  pill: {
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: ROSE,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  halo: {
    position: 'absolute',
    left: (SIZE - 30) / 2, top: (SIZE - 30) / 2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  // Only a small tuck remains at PEEK 0.85, so the glyph needs just a hair of
  // nudge toward the visible side (was a large offset at PEEK 0.52).
  collapsedHit: {
    width: SIZE, height: SIZE,
    alignItems: 'center', justifyContent: 'center',
    paddingRight: SIZE * (1 - PEEK) * 0.6,
  },
  // Note + label = one tap target (opens the player); the X sits outside it.
  openBtn: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', height: SIZE },
  noteBox: { width: 40, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 34, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  labelBtn: { flex: 1, minWidth: 0, justifyContent: 'center' },
  label: { fontFamily: FONTS.latoBold, fontWeight: '700', fontSize: 13.5, color: '#FFFFFF' },
  sub: { fontFamily: FONTS.lato, fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
});
