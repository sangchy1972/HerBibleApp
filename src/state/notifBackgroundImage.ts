// Resolves TODAY's cached verse-background image to a local file:// uri so the
// Notifee big-picture notifications can show the same rotating daily photo the
// prayer screens use — reliably, even when the app is killed and a scheduled
// trigger fires offline (a bundled asset is the fallback, never a bare CDN URL
// that might not download in time).
//
// This mirrors PrayerBackgroundsContext's disk-cache layout + sequential daily
// pick EXACTLY (Paths.cache/prayer-bg/<slot>/<filename>, dayNumber % list.len)
// so we point at the very file that context already downloaded — no second
// download, no drift. Kept dependency-light (no React) so schedulers can await
// it off the UI thread.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

export type BgSlot = 'morning' | 'evening';

// Must match PrayerBackgroundsContext.STORAGE_KEY + IMG_CACHE_SUBDIR.
const MANIFEST_KEY = 'prayer-bg:manifest:v1';
const IMG_CACHE_SUBDIR = 'prayer-bg';

interface Manifest {
  version: number;
  base_url: string;
  images: { morning: string[]; evening: string[] };
}

// Local YYYY-MM-DD for `offset` days from today (0 = today).
function ymdForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Absolute UTC day count (DST-immune) → sequential rotation, byte-identical to
// PrayerBackgroundsContext.pickSequential so we resolve the SAME daily file.
function dayNumber(ymdStr: string): number {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
function pickSequential(list: string[], ymdStr: string): string | null {
  if (!list || !list.length) return null;
  return list[((dayNumber(ymdStr) % list.length) + list.length) % list.length];
}

/**
 * Today's cached background for a slot as a `file://` uri, or null if the
 * manifest isn't cached yet or the file hasn't landed on disk. Callers fall
 * back to a bundled asset when this returns null.
 */
export async function todayBgPictureUri(slot: BgSlot): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Manifest;
    const fn = pickSequential(m?.images?.[slot] ?? [], ymdForOffset(0));
    if (!fn) return null;
    const f = new File(Paths.cache, IMG_CACHE_SUBDIR, slot, fn);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}
