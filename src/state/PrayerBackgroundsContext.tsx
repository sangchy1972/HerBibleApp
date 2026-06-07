import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Image, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// expo-file-system 19.x — used to mirror today's CDN audio into the app's
// cache directory so PrayerFlow plays from a local `file://` URI on the
// second+ entries (instant start, no 1-5 s CDN download wait).
import { File, Directory, Paths } from 'expo-file-system';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';

// Manifest served at CDN root for prayer-screen + PrayerFlow backgrounds.
// Schema 1.0 — bumping `version` invalidates the cached copy in AsyncStorage.
// covers.everlandapps.com is an R2 public custom domain that serves keys
// at their raw path; we upload under `backgrounds/` so no /v1/ prefix.
const MANIFEST_URL = 'https://covers.everlandapps.com/backgrounds/manifest.json';
const STORAGE_KEY  = 'prayer-bg:manifest:v1';

interface Manifest {
  version: number;
  base_url: string;
  images: { morning: string[]; evening: string[] };
  audio:  { morning: string[]; evening: string[] };
}

export type Slot = 'morning' | 'evening';

// Image / audio sources fall back through this hierarchy:
//   1. CDN URL pulled from the daily manifest pick
//   2. Bundled APK asset (offline / first-launch / network failure)
// `image` is typed as `any` because React Native's `Image` source can be
// either `{ uri: string }` or `number` (require() handle); the consumer
// passes it through to <Image source={…} /> as-is.
interface BackgroundsState {
  /** Today's image source — pass directly to <Image source={…}>. */
  imageFor: (slot: Slot) => any;
  /** Today's audio URL or bundled module — pass to expo-audio's source. */
  audioFor: (slot: Slot) => any;
  /** True once the manifest has resolved (cached or fresh). */
  loaded: boolean;
}

const Ctx = createContext<BackgroundsState | null>(null);

// Bundled APK fallbacks — keep the app usable when the CDN is unreachable
// (offline boot, blocked network, first launch before the manifest fetch
// resolves). Reuse the FollowHimScreen day/night photos (~80 KB webp each,
// already bundled) so the fallback is a real atmospheric photo — the
// previous adaptive-icon.png stopgap rendered the app icon stretched
// across the whole verse card (user-reported bug, 2026-06-07). Audio
// fallback stays null so expo-audio simply plays nothing.
const DEFAULT_MORNING_IMG = require('../../assets/follow_him_day.webp');
const DEFAULT_EVENING_IMG = require('../../assets/follow_him_night.webp');
const DEFAULT_AUDIO       = null;

// Audio cache: mirror today's CDN audio into the app's cache directory so
// subsequent entries to PrayerFlow play instantly from disk instead of
// re-downloading 1–1.6 MB over HTTPS every time. Keyed by filename, so a
// future manifest change with a new audio filename gets a fresh download
// while the old one ages out naturally via cleanupOldAudio below.
const AUDIO_CACHE_SUBDIR = 'prayer-audio';
function audioCacheFile(slot: Slot, fn: string): File | null {
  try {
    return new File(Paths.cache, AUDIO_CACHE_SUBDIR, slot, fn);
  } catch {
    return null;
  }
}

// Returns the first cached audio file for this slot (if any). Used as a
// graceful fallback so that on a new day with no network, the user keeps
// hearing yesterday's track instead of silence. We only ever expect 0 or
// 1 file per slot dir thanks to cleanupOldAudio below.
function anyCachedAudio(slot: Slot): File | null {
  try {
    const dir = new Directory(Paths.cache, AUDIO_CACHE_SUBDIR, slot);
    if (!dir.exists) return null;
    for (const entry of dir.list()) {
      if (entry instanceof File) return entry;
    }
    return null;
  } catch {
    return null;
  }
}

// Removes every cached audio file in this slot's dir EXCEPT the one matching
// `keepFn`. Called only after the new file has been successfully downloaded
// — so a network failure tomorrow doesn't leave the user with an empty cache.
function cleanupOldAudio(slot: Slot, keepFn: string): void {
  try {
    const dir = new Directory(Paths.cache, AUDIO_CACHE_SUBDIR, slot);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name !== keepFn) {
        try { entry.delete(); } catch {}
      }
    }
  } catch {}
}

// Downloads `url` into `target` if not already present. Resolves to `true`
// when the file ends up on disk (cached or freshly downloaded). The caller
// uses the result to gate cleanup so we never delete yesterday's track
// before today's is safely landed.
async function prefetchAudio(url: string, target: File): Promise<boolean> {
  try {
    if (target.exists) return true;
    const parent = target.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    await File.downloadFileAsync(url, target);
    return target.exists;
  } catch {
    return false;
  }
}

// FNV-1a 32-bit string hash — deterministic, no deps. Good enough for
// daily-image picking (we just need stable distribution across the list).
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function todayLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickByDate(list: string[], salt: string): string | null {
  if (!list.length) return null;
  // Salt the date so morning and evening get different picks on the same day.
  return list[fnv1a(todayLocalYmd() + ':' + salt) % list.length];
}

export function PrayerBackgroundsProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loaded, setLoaded] = useState(false);
  // `todayYmd` ticks when the calendar day rolls over (AppState resume +
  // midnight setTimeout). Used as a memo dependency below so consumers
  // re-render and `imageFor` / `audioFor` re-pick today's filename — without
  // it, a user who resumes the app on a new day without the process being
  // killed would still see yesterday's background image and hear yesterday's
  // audio, because none of the other deps (manifest, loaded) change at
  // midnight.
  const todayYmd = useCurrentDayYmd();

  // Hydrate from AsyncStorage first (instant), then revalidate from CDN
  // (stale-while-revalidate). Keeps the first paint fast even on slow nets.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Manifest;
          if (parsed?.version === 1) setManifest(parsed);
        } catch {}
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));

    fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh: Manifest | null) => {
        if (cancelled || !fresh || fresh.version !== 1) return;
        setManifest(fresh);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)).catch(() => {});
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // Prefetch today's morning + evening audio into the local cache as soon as
  // the manifest is available, then prune yesterday's leftovers. Cache is
  // kept to at most one file per slot — so the on-device footprint is two
  // ~1–1.5 MB m4a's at any time. Yesterday's file is only deleted AFTER the
  // new download succeeds, so an offline tomorrow keeps the user covered.
  // `todayYmd` is a dep so this re-runs on day-rollover — today's filename
  // changes (different fnv1a hash), the new file gets downloaded, and
  // yesterday's leftover is cleaned up.
  useEffect(() => {
    if (!manifest) return;
    for (const slot of ['morning', 'evening'] as const) {
      const fn = pickByDate(manifest.audio[slot], `audio:${slot}`);
      if (!fn) continue;
      const target = audioCacheFile(slot, fn);
      if (!target) continue;
      const url = `${manifest.base_url}/audio/${slot}/${fn}`;
      prefetchAudio(url, target).then((landed) => {
        if (landed) cleanupOldAudio(slot, fn);
      });
    }
  }, [manifest, todayYmd]);

  // Eagerly warm the native Image cache for today's morning AND evening
  // photos as soon as the manifest is in. Without this, the photos only
  // start downloading when the <Image> first mounts — so a user who finishes
  // the morning prayer and swipes to "Evening" sees a blank gray card until
  // the photo lands. Image.prefetch is fire-and-forget; failures don't
  // matter because the <Image> will retry on its own mount path.
  useEffect(() => {
    if (!manifest) return;
    for (const slot of ['morning', 'evening'] as const) {
      const fn = pickByDate(manifest.images[slot], `img:${slot}`);
      if (!fn) continue;
      const url = `${manifest.base_url}/${slot}/${fn}`;
      Image.prefetch(url).catch(() => {});
    }
  }, [manifest, todayYmd]);

  const value = useMemo<BackgroundsState>(() => ({
    loaded,
    imageFor: (slot) => {
      if (!manifest) return slot === 'morning' ? DEFAULT_MORNING_IMG : DEFAULT_EVENING_IMG;
      const fn = pickByDate(manifest.images[slot], `img:${slot}`);
      if (!fn) return slot === 'morning' ? DEFAULT_MORNING_IMG : DEFAULT_EVENING_IMG;
      return { uri: `${manifest.base_url}/${slot}/${fn}` };
    },
    audioFor: (slot) => {
      // Fallback chain — picks the most "ready" source so the player has
      // something to play the instant PrayerFlow mounts. Never returns a
      // remote URL: if today's pick isn't cached yet, we'd rather play a
      // local file (yesterday's leftover or the bundled APK fallback)
      // immediately than make the user stare at silence while a 1.5 MB
      // file downloads. The prefetch effect above pulls today's pick in
      // the background so the NEXT entry plays the curated track.
      //   1. Today's cached file (best — exact match, instant)
      //   2. Any cached file in this slot's dir (yesterday's leftover —
      //      keeps the music going offline on a new day)
      //   3. Cross-slot leftover (e.g. evening cache exists, user picked
      //      morning before morning ever downloaded — still better than
      //      silence; gives that "always music" feel the spec asks for)
      //   4. Bundled DEFAULT_AUDIO — guaranteed to exist from APK install,
      //      so first-launch playback is instant for every user.
      if (manifest) {
        const fn = pickByDate(manifest.audio[slot], `audio:${slot}`);
        if (fn) {
          const cached = audioCacheFile(slot, fn);
          if (cached && cached.exists) return { uri: cached.uri };
        }
      }
      const sameSlotLeftover = anyCachedAudio(slot);
      if (sameSlotLeftover) return { uri: sameSlotLeftover.uri };
      const otherSlotLeftover = anyCachedAudio(slot === 'morning' ? 'evening' : 'morning');
      if (otherSlotLeftover) return { uri: otherSlotLeftover.uri };
      return DEFAULT_AUDIO;
    },
  }), [manifest, loaded, todayYmd]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrayerBackgrounds() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePrayerBackgrounds must be used inside PrayerBackgroundsProvider');
  return ctx;
}
