import { File, Directory, Paths } from 'expo-file-system';
import {
  DAILY_VERSE_AUDIO_STEPS,
  DAILY_VERSE_AUDIO_LANG,
  dailyVerseAudioUrl,
  holidayVerseAudioUrl,
  type DailyVerseAudioManifest,
} from '../constants/dailyVerseAudioCdn';
import { DAILY_VERSE_AUDIO_MANIFEST } from '../constants/dailyVerseAudioManifest';
import { HOLIDAY_VERSE_AUDIO_MANIFEST } from '../constants/holidayVerseAudioManifest';

// Daily-verse narration audio: bundled filename map + day-scoped local cache.
//
// The verseId→filename map is bundled (constants/dailyVerseAudioManifest.ts)
// — tiny + static, so it needs no network round-trip; only the audio bytes
// are pulled on demand.
//
// "Download today, delete yesterday" per product spec — at most the current
// day's verse audio (4 files per slot) lives on disk; everything older is
// pruned the moment a new verse's files land, so the device footprint stays
// at ~2-4 MB instead of growing 480 files deep.

const AUDIO_CACHE_SUBDIR = 'dailyverse-audio';

// Returns the bundled manifest, or null while it's still the empty
// placeholder (no audio recorded/mapped yet) so the listen button stays
// disabled instead of pointing at nonexistent files.
export async function loadManifest(): Promise<DailyVerseAudioManifest | null> {
  const m = DAILY_VERSE_AUDIO_MANIFEST;
  return m.verses && Object.keys(m.verses).length > 0 ? m : null;
}

// The four remote URLs for a verse, in prayer-flow PAGE ORDER
// (scripture, reflection, simple-step, prayer). Returns null if the
// manifest is missing the verse or any of its four steps.
export function remoteStepUrls(
  manifest: DailyVerseAudioManifest,
  verseId: string,
  lang: string = DAILY_VERSE_AUDIO_LANG,
): string[] | null {
  const entry = manifest.verses?.[verseId];
  if (!entry) return null;
  const urls: string[] = [];
  for (const step of DAILY_VERSE_AUDIO_STEPS) {
    const fn = entry[step];
    if (!fn) return null;          // incomplete set → don't offer listen
    urls.push(dailyVerseAudioUrl(fn, lang));
  }
  return urls;
}

function verseDir(verseId: string): Directory | null {
  try {
    return new Directory(Paths.cache, AUDIO_CACHE_SUBDIR, verseId);
  } catch {
    return null;
  }
}

// Delete every cached verse dir whose id isn't in `keep`. Called AFTER the
// new day's files land so an offline tomorrow doesn't wipe the cache before
// the replacement exists.
function pruneOtherVerses(keep: Set<string>): void {
  try {
    const root = new Directory(Paths.cache, AUDIO_CACHE_SUBDIR);
    if (!root.exists) return;
    for (const entry of root.list()) {
      if (entry instanceof Directory && !keep.has(entry.name)) {
        try { entry.delete(); } catch {}
      }
    }
  } catch { /* best-effort */ }
}

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

// Cache the sentence-timing `.json` sibling of each step mp3 onto disk, next to
// the audio. Highlight timings used to be fetched live over the network at
// flow-open (memory-cache only), so on slow / flaky connections (and OEMs that
// throttle data, e.g. MIUI) the audio — already cached on disk — would play
// while the highlight silently never loaded. Caching the timings the SAME way
// as the audio makes the highlight just as reliable + offline-capable.
async function cacheTimingSiblings(dir: Directory | null, mp3Urls: string[]): Promise<void> {
  if (!dir) return;
  for (const url of mp3Urls) {
    try {
      const jsonUrl = url.replace(/\.mp3$/i, '.json');
      const fn = jsonUrl.split('/').pop() || 'step.json';
      await downloadIfMissing(jsonUrl, new File(dir, fn)).catch(() => {});
    } catch { /* best-effort */ }
  }
}

// Read locally-cached step timings (the `.json` siblings) for a verse. Returns a
// length-4 array in page order: the raw parsed JSON for any step already on
// disk, null where not cached yet. Never throws — a missing/corrupt file just
// yields null for that step (caller falls back to the network).
export function readCachedStepTimingsRaw(verseId: string, isHoliday: boolean): (unknown[] | null)[] {
  const out: (unknown[] | null)[] = [null, null, null, null];
  try {
    const manifest = isHoliday ? HOLIDAY_VERSE_AUDIO_MANIFEST : DAILY_VERSE_AUDIO_MANIFEST;
    const entry = manifest.verses?.[verseId];
    const dir = isHoliday ? holidayVerseDir(verseId) : verseDir(verseId);
    if (!entry || !dir) return out;
    DAILY_VERSE_AUDIO_STEPS.forEach((step, i) => {
      try {
        const mp3 = entry[step];
        if (!mp3) return;
        const f = new File(dir, mp3.replace(/\.mp3$/i, '.json'));
        if (!f.exists) return;
        const parsed = JSON.parse(f.textSync());
        if (Array.isArray(parsed)) out[i] = parsed;
      } catch { /* leave null */ }
    });
  } catch { /* leave all null */ }
  return out;
}

// Resolve the four playable sources for `verseId`, downloading them into a
// day-scoped cache and pruning every OTHER verse's cache afterwards.
// `keepVerseIds` lists the ids that should survive the prune (typically
// today's morning + evening verses) so doing the morning flow doesn't
// delete the evening files and vice-versa.
//
// Returns the four local `file://` URIs in page order, or the remote URLs
// for any step whose download failed (so playback still works, just
// streamed). Returns null if the manifest can't supply the verse.
// IMPORTANT — stream-first, cache-in-background. This resolves IMMEDIATELY
// (no awaiting downloads), so the Listen button enables the instant the
// manifest is read instead of staying greyed-out for the seconds it takes
// to pull 4 clips (and indefinitely if a download stalled). For each step:
//   • already cached → return the local file:// URI (instant, offline),
//   • not cached     → return the REMOTE URL (streams right away) AND kick
//                      off a background download so the next session plays
//                      from disk.
// The "download today, prune yesterday" behaviour still happens — just
// off the critical path.
export async function prepareVerseAudio(
  verseId: string,
  keepVerseIds: string[],
  lang: string = DAILY_VERSE_AUDIO_LANG,
): Promise<string[] | null> {
  const manifest = await loadManifest();
  if (!manifest) return null;
  const urls = remoteStepUrls(manifest, verseId, lang);
  if (!urls) return null;

  const dir = verseDir(verseId);
  const resolved: string[] = [];
  const pending: { url: string; target: File }[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fn = url.split('/').pop() || `step_${i}.mp3`;
    let local: File | null = null;
    try { local = dir ? new File(dir, fn) : null; } catch { local = null; }
    if (local && local.exists) {
      resolved.push(local.uri);          // cached → play from disk
    } else {
      resolved.push(url);                // not cached → stream now…
      if (local) pending.push({ url, target: local });  // …and cache in bg
    }
  }

  const keep = new Set(keepVerseIds.length ? keepVerseIds : [verseId]);
  // Always run the background task — even when every mp3 is already cached — so
  // the timing .json siblings get cached too (highlight reliability).
  void (async () => {
    for (const { url, target } of pending) {
      await downloadIfMissing(url, target).catch(() => {});
    }
    await cacheTimingSiblings(dir, urls);
    pruneOtherVerses(keep);
  })();
  return resolved;
}

// Pad a day number to the m_NNN / e_NNN verse-id form used by the audio
// filenames + manifest. Exposed so PrayerFlow can compute today's ids
// without re-implementing the zero-pad.
export function verseIdFor(day: number, segment: 'morning' | 'evening'): string {
  return `${segment === 'morning' ? 'm' : 'e'}_${String(day).padStart(3, '0')}`;
}

// ── Holiday-verse narration ────────────────────────────────────────────────
// A parallel of the daily pipeline above, isolated to its own CDN folder +
// cache subdir because holiday verseIds (m_001…e_010 = holiday day index)
// collide with the regular ones. Same stream-first / cache-in-background /
// prune-others behaviour; reuses downloadIfMissing.
const HOLIDAY_AUDIO_CACHE_SUBDIR = 'holiday-dailyverse-audio';

export async function loadHolidayManifest(): Promise<DailyVerseAudioManifest | null> {
  const m = HOLIDAY_VERSE_AUDIO_MANIFEST;
  return m.verses && Object.keys(m.verses).length > 0 ? m : null;
}

function holidayVerseDir(verseId: string): Directory | null {
  try {
    return new Directory(Paths.cache, HOLIDAY_AUDIO_CACHE_SUBDIR, verseId);
  } catch {
    return null;
  }
}

function remoteHolidayStepUrls(manifest: DailyVerseAudioManifest, verseId: string): string[] | null {
  const entry = manifest.verses?.[verseId];
  if (!entry) return null;
  const urls: string[] = [];
  for (const step of DAILY_VERSE_AUDIO_STEPS) {
    const fn = entry[step];
    if (!fn) return null;
    urls.push(holidayVerseAudioUrl(fn));
  }
  return urls;
}

function pruneOtherHolidayVerses(keep: Set<string>): void {
  try {
    const root = new Directory(Paths.cache, HOLIDAY_AUDIO_CACHE_SUBDIR);
    if (!root.exists) return;
    for (const entry of root.list()) {
      if (entry instanceof Directory && !keep.has(entry.name)) {
        try { entry.delete(); } catch {}
      }
    }
  } catch { /* best-effort */ }
}

// Holiday counterpart of prepareVerseAudio — same contract (stream-first,
// cache in background, prune others), holiday folder + cache.
export async function prepareHolidayVerseAudio(
  verseId: string,
  keepVerseIds: string[],
): Promise<string[] | null> {
  const manifest = await loadHolidayManifest();
  if (!manifest) return null;
  const urls = remoteHolidayStepUrls(manifest, verseId);
  if (!urls) return null;

  const dir = holidayVerseDir(verseId);
  const resolved: string[] = [];
  const pending: { url: string; target: File }[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fn = url.split('/').pop() || `step_${i}.mp3`;
    let local: File | null = null;
    try { local = dir ? new File(dir, fn) : null; } catch { local = null; }
    if (local && local.exists) {
      resolved.push(local.uri);
    } else {
      resolved.push(url);
      if (local) pending.push({ url, target: local });
    }
  }

  const keep = new Set(keepVerseIds.length ? keepVerseIds : [verseId]);
  void (async () => {
    for (const { url, target } of pending) {
      await downloadIfMissing(url, target).catch(() => {});
    }
    await cacheTimingSiblings(dir, urls);
    pruneOtherHolidayVerses(keep);
  })();
  return resolved;
}
