import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cfImage } from '../services/cfImage';
// expo-file-system 19.x — used to mirror today's CDN audio into the app's
// cache directory so PrayerFlow plays from a local `file://` URI on the
// second+ entries (instant start, no 1-5 s CDN download wait).
import { File, Directory, Paths } from 'expo-file-system';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';

// Hero card / PrayerFlow backgrounds render at (or near) full screen width.
const SCREEN_W = Dimensions.get('window').width;

// Manifest served at CDN root for prayer-screen + PrayerFlow backgrounds.
// Schema 1.0 — bumping `version` invalidates the cached copy in AsyncStorage.
// covers.everlandapps.com is an R2 public custom domain that serves keys
// at their raw path; we upload under `backgrounds/` so no /v1/ prefix.
const MANIFEST_URL = 'https://covers.everlandapps.com/backgrounds/manifest.json';
const STORAGE_KEY  = 'prayer-bg:manifest:v1';
// Persist the CF-transform probe result so 2nd+ launches immediately cache the
// SMALL variant (not the multi-MB original) without waiting to re-probe.
const CF_READY_KEY = 'prayer-bg:cfReady:v1';

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
// while rotated-out filenames are pruned via pruneAudioNotIn below.
const AUDIO_CACHE_SUBDIR = 'prayer-audio';
function audioCacheFile(slot: Slot, fn: string): File | null {
  try {
    return new File(Paths.cache, AUDIO_CACHE_SUBDIR, slot, fn);
  } catch {
    return null;
  }
}

// Returns the first cached audio file for this slot (if any). Used only as a
// last-resort fallback when today's pick somehow isn't cached — normally the
// whole track list is cached (see the prefetch effect) so audioFor returns
// today's pick directly. Keeps music playing offline instead of silence.
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

// Removes cached audio files in this slot's dir that are NO LONGER in the
// manifest (rotated-out tracks). We now cache the WHOLE current track list per
// slot so the daily pick is always ready; only entries the manifest dropped
// get pruned — never the active set.
function pruneAudioNotIn(slot: Slot, keep: string[]): void {
  try {
    const dir = new Directory(Paths.cache, AUDIO_CACHE_SUBDIR, slot);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.includes(entry.name)) {
        try { entry.delete(); } catch {}
      }
    }
  } catch {}
}

// Downloads `url` into `target` if not already present. Resolves to `true`
// when the file ends up on disk (cached or freshly downloaded). Generic — used
// for BOTH the audio tracks and the background images below. The caller uses the
// result to gate cleanup so we never delete yesterday's file before today's is
// safely landed.
async function downloadIfMissing(url: string, target: File): Promise<boolean> {
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

// Background-image disk cache — mirrors the audio cache above. RN's <Image>/
// <ImageBackground> disk cache is volatile (evicted aggressively, unreliable on
// iOS), so today's hero photo re-downloaded from the CDN on many cold starts.
// We instead mirror today's SMALL transformed variant into the app cache dir and
// serve it as a local file:// URI → instant, offline-safe, persistent across
// launches. Keyed by manifest filename so a new daily pick downloads fresh while
// yesterday's is pruned. Footprint: ~2 files × ~60–150 KB.
const IMG_CACHE_SUBDIR = 'prayer-bg';
function imageCacheFile(slot: Slot, fn: string): File | null {
  try {
    return new File(Paths.cache, IMG_CACHE_SUBDIR, slot, fn);
  } catch {
    return null;
  }
}
function pruneImagesNotIn(slot: Slot, keep: string[]): void {
  try {
    const dir = new Directory(Paths.cache, IMG_CACHE_SUBDIR, slot);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.includes(entry.name)) {
        try { entry.delete(); } catch {}
      }
    }
  } catch {}
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

// Local YYYY-MM-DD `offset` days from today (0 = today, 1 = tomorrow).
function ymdForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Deterministic daily pick for a specific date string — same input → same photo,
// morning vs evening differ via the salt.
function pickForYmd(list: string[], salt: string, ymdStr: string): string | null {
  if (!list.length) return null;
  return list[fnv1a(ymdStr + ':' + salt) % list.length];
}

function pickByDate(list: string[], salt: string): string | null {
  return pickForYmd(list, salt, ymdForOffset(0));
}

// Absolute day count for a local YYYY-MM-DD (UTC-based math → DST-immune), used
// for SEQUENTIAL rotation: each item is shown in list ORDER, one per calendar
// day, wrapping at the end — so every background photo gets its turn in sequence
// (day 0 → list[0], day 1 → list[1] … list[n-1] → back to list[0]) instead of the
// hash's jump-around that repeated some photos before others ever appeared.
function dayNumber(ymdStr: string): number {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
function pickSequential(list: string[], ymdStr: string): string | null {
  if (!list.length) return null;
  return list[((dayNumber(ymdStr) % list.length) + list.length) % list.length];
}

export function PrayerBackgroundsProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Cloudflare Image Transformations availability. Starts FALSE (serve
  // originals — the previous behaviour) and flips true only after a HEAD
  // probe confirms /cdn-cgi/image/ works on the zone. This keeps the hero
  // photos rock-solid even if the dashboard feature gets toggled off:
  // worst case we just serve the full-size original like before.
  const [cfReady, setCfReady] = useState(false);
  // Bumped each time a background photo finishes caching to disk, so the memo
  // below re-runs and imageFor starts returning the local file:// URI.
  const [imgReady, setImgReady] = useState(0);
  // Hydrate the persisted CF-transform result on mount so the disk-cache effect
  // can run with the correct variant on the very first render of a 2nd+ launch.
  useEffect(() => {
    AsyncStorage.getItem(CF_READY_KEY).then(v => { if (v === '1') setCfReady(true); }).catch(() => {});
  }, []);
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
    // Prefetch EVERY track for each slot (not just today's pickByDate choice)
    // so the daily pick is ALWAYS already cached and audioFor rotates the music
    // reliably day-to-day. BUG FIX: previously only today's pick was downloaded,
    // so on a fresh day that track wasn't ready when PrayerFlow mounted and
    // audioFor fell back to a stale cached file → the music never changed across
    // days. ~1.5 MB each, all kept; rotated-out files are pruned.
    for (const slot of ['morning', 'evening'] as const) {
      const list = manifest.audio[slot] ?? [];
      for (const fn of list) {
        const target = audioCacheFile(slot, fn);
        if (!target) continue;
        downloadIfMissing(`${manifest.base_url}/audio/${slot}/${fn}`, target);
      }
      pruneAudioNotIn(slot, list);
    }
  }, [manifest]);

  // Mirror today's morning + evening hero photos to the DISK cache (small
  // transformed variant) so the card renders instantly from a local file:// on
  // every entry + cold start, instead of re-fetching from the CDN through RN's
  // volatile <Image> cache. Also warms the native cache via Image.prefetch as a
  // belt-and-suspenders for the very first paint. Gated on cfReady === true so
  // the cached bytes are the ~60–150 KB variant, never the multi-MB original.
  // Bumps `imgReady` on each successful cache so consumers re-pick the local
  // file (imageFor is memoized and wouldn't otherwise notice the new file).
  useEffect(() => {
    if (!manifest || cfReady !== true) return;   // wait for the probe → cache the small variant
    let cancelled = false;
    (async () => {
      for (const slot of ['morning', 'evening'] as const) {
        const list = manifest.images[slot];
        // Cache TODAY's pick (in use now) and pre-cache TOMORROW's (so the
        // midnight rollover renders instantly instead of re-fetching). Everything
        // else is pruned — footprint stays at ≤4 tiny files, self-cleaning.
        const todayFn = pickSequential(list, ymdForOffset(0));
        const tomorrowFn = pickSequential(list, ymdForOffset(1));
        const keep: string[] = [];
        for (const fn of [todayFn, tomorrowFn]) {
          if (!fn || keep.includes(fn)) continue;
          keep.push(fn);
          const displayUrl = cfImage(`${manifest.base_url}/${slot}/${fn}`, SCREEN_W);
          if (fn === todayFn) Image.prefetch(displayUrl).catch(() => {});   // warm native cache for today's first paint
          const target = imageCacheFile(slot, fn);
          if (!target) continue;
          const ok = await downloadIfMissing(displayUrl, target);
          if (ok && !cancelled) setImgReady(v => v + 1);
        }
        pruneImagesNotIn(slot, keep);   // keep only today + tomorrow
      }
    })();
    return () => { cancelled = true; };
  }, [manifest, todayYmd, cfReady]);

  // One-shot probe: does this zone serve /cdn-cgi/image/ transforms? Uses a
  // tiny (width=64) variant of today's first manifest image as the test
  // object. Runs once per manifest load; HEAD keeps it to a few hundred bytes.
  useEffect(() => {
    if (!manifest) return;
    const fn = manifest.images.morning?.[0];
    if (!fn) return;
    const probeUrl = cfImage(`${manifest.base_url}/morning/${fn}`, 64);
    if (probeUrl.indexOf('/cdn-cgi/') === -1) return;       // host not in transform list
    fetch(probeUrl, { method: 'HEAD' })
      .then(r => {
        const ok = r.ok && (r.headers.get('content-type') || '').includes('image');
        setCfReady(ok);
        AsyncStorage.setItem(CF_READY_KEY, ok ? '1' : '0').catch(() => {});
      })
      .catch(() => setCfReady(false));
  }, [manifest]);

  const value = useMemo<BackgroundsState>(() => ({
    loaded,
    imageFor: (slot) => {
      if (!manifest) return slot === 'morning' ? DEFAULT_MORNING_IMG : DEFAULT_EVENING_IMG;
      const fn = pickSequential(manifest.images[slot], ymdForOffset(0));
      if (!fn) return slot === 'morning' ? DEFAULT_MORNING_IMG : DEFAULT_EVENING_IMG;
      // 1) Local disk cache (instant, offline-safe, persists across launches) —
      //    populated by the effect above once the small variant has landed.
      const cached = imageCacheFile(slot, fn);
      if (cached && cached.exists) return { uri: cached.uri };
      // 2) CDN fallback while the cache warms. Hero card + PrayerFlow render at
      //    screen width — a 1080-px variant (~60–150 KB) replaces multi-MB
      //    originals on slow networks (once the cfReady probe confirms transforms).
      const url = `${manifest.base_url}/${slot}/${fn}`;
      return { uri: cfReady ? cfImage(url, SCREEN_W) : url };
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
  }), [manifest, loaded, todayYmd, cfReady, imgReady]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrayerBackgrounds() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePrayerBackgrounds must be used inside PrayerBackgroundsProvider');
  return ctx;
}
