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
  register: (player: AudioPlayer, info: AudioMiniInfo) => void;
  unregister: (player: AudioPlayer) => void;
  setOwnerFocused: (focused: boolean) => void;
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

  const register = useCallback((p: AudioPlayer, i: AudioMiniInfo) => {
    setPlayer(prev => (prev === p ? prev : p));
    if (labelRef.current !== i.label) {
      labelRef.current = i.label;
      setInfo(i);
    } else {
      // Same label — keep the newest onOpen without triggering a render.
      setInfo(prev => (prev ? { ...prev, onOpen: i.onOpen } : i));
    }
  }, []);

  const unregister = useCallback((p: AudioPlayer) => {
    setPlayer(prev => (prev === p ? null : prev));
    setInfo(prev => (player === p ? null : prev));
    labelRef.current = null;
  }, [player]);

  const value = useMemo<AudioMiniState>(() => ({
    player, info, ownerFocused, register, unregister, setOwnerFocused,
  }), [player, info, ownerFocused, register, unregister]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioMini(): AudioMiniState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudioMini must be used inside AudioMiniProvider');
  return ctx;
}
