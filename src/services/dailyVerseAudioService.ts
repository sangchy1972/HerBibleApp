import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import {
  DAILY_VERSE_AUDIO_MANIFEST_URL,
  DAILY_VERSE_AUDIO_STEPS,
  dailyVerseAudioUrl,
  type DailyVerseAudioManifest,
} from '../constants/dailyVerseAudioCdn';

// Daily-verse narration audio: manifest fetch + day-scoped local cache.
//
// "Download today, delete yesterday" per product spec — at most the
// current day's verse audio (4 files per slot) lives on disk; everything
// older is pruned the moment a new verse's files land, so the device
// footprint stays at ~2-4 MB instead of growing 480 files deep.

const MANIFEST_STORAGE_KEY = 'dailyverse-audio:manifest:v1';
const AUDIO_CACHE_SUBDIR = 'dailyverse-audio';

// Module-level memo so repeated PrayerFlow mounts don't re-hit storage.
let _manifest: DailyVerseAudioManifest | null = null;

// Hydrate the manifest: memo → AsyncStorage → network (stale-while-
// revalidate). Returns null only when there's no cached copy AND the
// network fetch fails — in which case the listen button stays disabled.
export async function loadManifest(): Promise<DailyVerseAudioManifest | null> {
  if (_manifest) return _manifest;
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyVerseAudioManifest;
      if (parsed?.version === 1) _manifest = parsed;
    }
  } catch { /* fall through to network */ }

  // Always revalidate in the background; if we had no cached copy, this is
  // the only way to get one, so await it. If we did, we still await but the
  // memo above already short-circuits future calls within the session.
  try {
    const res = await fetch(DAILY_VERSE_AUDIO_MANIFEST_URL, { cache: 'no-cache' });
    if (res.ok) {
      const fresh = (await res.json()) as DailyVerseAudioManifest;
      if (fresh?.version === 1 && fresh.verses) {
        _manifest = fresh;
        AsyncStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(fresh)).catch(() => {});
      }
    }
  } catch { /* keep whatever the cache gave us */ }

  return _manifest;
}

// The four remote URLs for a verse, in prayer-flow PAGE ORDER
// (scripture, reflection, simple-step, prayer). Returns null if the
// manifest is missing the verse or any of its four steps.
export function remoteStepUrls(
  manifest: DailyVerseAudioManifest,
  verseId: string,
): string[] | null {
  const entry = manifest.verses?.[verseId];
  if (!entry) return null;
  const urls: string[] = [];
  for (const step of DAILY_VERSE_AUDIO_STEPS) {
    const fn = entry[step];
    if (!fn) return null;          // incomplete set → don't offer listen
    urls.push(dailyVerseAudioUrl(fn));
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

// Resolve the four playable sources for `verseId`, downloading them into a
// day-scoped cache and pruning every OTHER verse's cache afterwards.
// `keepVerseIds` lists the ids that should survive the prune (typically
// today's morning + evening verses) so doing the morning flow doesn't
// delete the evening files and vice-versa.
//
// Returns the four local `file://` URIs in page order, or the remote URLs
// for any step whose download failed (so playback still works, just
// streamed). Returns null if the manifest can't supply the verse.
export async function prepareVerseAudio(
  verseId: string,
  keepVerseIds: string[],
): Promise<string[] | null> {
  const manifest = await loadManifest();
  if (!manifest) return null;
  const urls = remoteStepUrls(manifest, verseId);
  if (!urls) return null;

  const dir = verseDir(verseId);
  const resolved: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fn = url.split('/').pop() || `step_${i}.mp3`;
    let local: File | null = null;
    try { local = dir ? new File(dir, fn) : null; } catch { local = null; }
    if (local && (await downloadIfMissing(url, local))) {
      resolved.push(local.uri);
    } else {
      resolved.push(url);          // stream fallback
    }
  }

  // Prune yesterday's (and any non-today) verse caches now that today's
  // files are safely on disk.
  pruneOtherVerses(new Set(keepVerseIds.length ? keepVerseIds : [verseId]));
  return resolved;
}

// Pad a day number to the m_NNN / e_NNN verse-id form used by the audio
// filenames + manifest. Exposed so PrayerFlow can compute today's ids
// without re-implementing the zero-pad.
export function verseIdFor(day: number, segment: 'morning' | 'evening'): string {
  return `${segment === 'morning' ? 'm' : 'e'}_${String(day).padStart(3, '0')}`;
}
