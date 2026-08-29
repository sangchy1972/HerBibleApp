import { setAudioModeAsync } from 'expo-audio';

// The app's TWO audio-session modes. expo-audio's mode is global and sticky —
// a partial setAudioModeAsync REPLACES the whole mode (unlisted fields fall
// back to defaults, which silently dropped shouldPlayInBackground once) — so
// every caller goes through these two functions and nobody hand-rolls options.
//
// MIX — the app-wide default. The prayer flow runs TWO players at once
// (background music + narration, dev-guide §8b) and a devotional reader
// should let the user's podcast/music continue alongside; mixWithOthers is
// load-bearing for both. shouldPlayInBackground stays true so the flag is
// never stomped for the narration session below (prayer surfaces gate their
// own background behavior with explicit AppState pauses).
//
// NARRATION — the Bible chapter voice-reading session (owner 2026-08-24).
// doNotMix takes real audio focus: starting our narration pauses her music,
// and — the half the owner asked for — another app starting playback takes
// the focus back and expo-audio auto-pauses us (AUDIOFOCUS_LOSS on Android,
// AVAudioSession interruption on iOS). Entered when a listening session
// starts, restored to MIX when it ends (pill X / entering the prayer flow).
// Both return a never-rejecting promise. The narration caller SEQUENCES on
// it: on Android the audio focus is only requested inside play() and the
// request early-returns under MIX, so a mode flip after playback has begun
// must be followed by a compensating play() — and that play() must not run
// until the mode write has actually landed, or it still sees MIX.
export function applyMixAudioMode(): Promise<void> {
  return setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: true,
  }).catch(() => {});
}

export function applyNarrationAudioMode(): Promise<void> {
  return setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: true,
  }).catch(() => {});
}
