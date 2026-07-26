import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { AudioPlayer } from 'expo-audio';

// Registry for the ONE piece of audio that can outlive the screen that started
// it: Bible chapter narration.
//
// Why this exists. Bottom-tab screens are never unmounted (TabNavigator sets no
// unmountOnBlur), so when a user starts narration on the Bible tab and taps
// Prayer, the audio follows her across the app — with the stop button left
// behind on a screen she can't see. She has no way to turn it off short of
// hunting her way back. (Reported 2026-07-13; the code even claimed to pause on
// tab-away, but the effect it relied on keys on bookSlug/chapter, which a tab
// switch doesn't change.)
//
// Killing the audio on tab-away would be the lazy fix and the wrong one — she
// may well want to keep listening while she reads a plan. So the audio keeps
// playing and the CONTROL comes with her: BibleScreen registers its player here,
// and <AudioMiniHost> (mounted at app root) floats a small pill above every
// screen whenever something is playing off-tab.
//
// Only the player REFERENCE is kept — no status subscription. Subscribing to
// expo-audio's status here would re-render every consumer on every ~250 ms tick
// (this screen already learned that lesson: see the AudioStatusBridge note in
// BibleScreen). The pill subscribes on its own, in its own leaf.

export interface AudioMiniInfo {
  /** e.g. "John 3" — shown on the expanded pill. */
  label: string;
  /** Bring the user back to what's playing. */
  onOpen: () => void;
}

interface AudioMiniState {
  player: AudioPlayer | null;
  info: AudioMiniInfo | null;
  /** The owning screen is on top — it shows its own controls, so the pill hides. */
  ownerFocused: boolean;
  /**
   * Bumped every time a DIFFERENT player object is registered.
   *
   * expo-audio's useAudioPlayer wraps the player in `useReleasingSharedObject`,
   * so changing the source (a new chapter, book or translation) RELEASES the old
   * native object. The reference we hold here is React state, which lags that
   * release by a render — long enough for a consumer to call into a dead object
   * and take a native "shared object already released" throw, which surfaces as
   * a FATAL JS exception (Crashlytics, 1.0.0 (19)).
   *
   * Consumers use this as a React `key` so every player generation gets a fresh
   * subscription (and a fresh error boundary) instead of one that straddles two
   * players.
   */
  playerKey: number;
  register: (player: AudioPlayer, info: AudioMiniInfo) => void;
  unregister: (player: AudioPlayer) => void;
  setOwnerFocused: (focused: boolean) => void;
  /** A consumer hit a released player — drop it so nothing retries. */
  dropPlayer: () => void;
}

const Ctx = createContext<AudioMiniState | null>(null);

export function AudioMiniProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [info, setInfo] = useState<AudioMiniInfo | null>(null);
  const [ownerFocused, setOwnerFocused] = useState(true);
  // `info` changes identity on every BibleScreen render (its onOpen closes over
  // navigation), so we keep the latest in a ref and only push it into state when
  // something the pill actually renders has changed. Without this the provider
  // would re-render the whole tree on every chapter scroll.
  const labelRef = useRef<string | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  // Mirrors `player` but updates SYNCHRONOUSLY. Registration and de-registration
  // both arrive from effect callbacks, where React state is a render behind —
  // and on a chapter change the cleanup for the old player and the setup for the
  // new one run back to back, before any re-render. Deciding against state
  // therefore compared against a stale reference; deciding against a ref is
  // exact. (A state updater can't be used for the decision either: updaters must
  // be pure, so they can't bump the generation counter as a side effect.)
  const playerRef = useRef<AudioPlayer | null>(null);

  const register = useCallback((p: AudioPlayer, i: AudioMiniInfo) => {
    if (playerRef.current !== p) {
      playerRef.current = p;
      setPlayer(p);
      // New generation → consumers remount their status subscriptions against
      // it instead of reusing one bound to the player expo just released.
      setPlayerKey(k => k + 1);
    }
    if (labelRef.current !== i.label) {
      labelRef.current = i.label;
      setInfo(i);
    } else {
      // Same label — keep the newest onOpen (it closes over navigation).
      setInfo(prev => (prev ? { ...prev, onOpen: i.onOpen } : i));
    }
  }, []);

  const unregister = useCallback((p: AudioPlayer) => {
    // Ignore a cleanup for a player that is no longer the current one. React
    // runs cleanup(old) before setup(new), so this is only ever a no-op in the
    // benign ordering — but if the two ever interleave the other way, clearing
    // here would wipe the player that had just been registered and strand the
    // pill on audio that is still playing.
    if (playerRef.current !== p) return;
    playerRef.current = null;
    setPlayer(null);
    setInfo(null);
    labelRef.current = null;
  }, []);

  /** Escape hatch for a consumer that just took a throw from a released player:
   *  forget it entirely rather than let anything subscribe to it again. */
  const dropPlayer = useCallback(() => {
    playerRef.current = null;
    setPlayer(null);
    setInfo(null);
    labelRef.current = null;
  }, []);

  const value = useMemo<AudioMiniState>(() => ({
    player, info, ownerFocused, playerKey, register, unregister, setOwnerFocused, dropPlayer,
  }), [player, info, ownerFocused, playerKey, register, unregister, dropPlayer]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioMini(): AudioMiniState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudioMini must be used inside AudioMiniProvider');
  return ctx;
}
