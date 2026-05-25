// Bible narration fetcher. The MP3 itself is streamed by expo-audio directly
// from `bibleAudioUrl(...)` — this service only handles the auxiliary
// per-verse timestamps JSON, which gets cached in AsyncStorage so karaoke-
// style highlighting is instant on revisit.
//
// Timestamps schema (verified live against the bucket):
//   {
//     audio_file: "1.mp3",
//     audio_duration_sec: 228.576,
//     verses: [{ verse: 1, start: 0.0, end: 6.696 }, …]
//   }
//
// The reader can binary-search this array on every `expo-audio` status
// update to figure out the active verse without re-fetching.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bibleAudioUrl, bibleAudioTimestampsUrl } from '../constants/bibleAudioCdn';

export interface VerseTimestamp {
  verse: number;
  start: number;   // seconds
  end: number;     // seconds
}

export interface ChapterTimestamps {
  audio_file?: string;
  audio_duration_sec?: number;
  verses: VerseTimestamp[];
}

const cacheKey = (lang: string, bookSlug: string, chapter: number) =>
  `bible-audio:ts:${lang}:${bookSlug}:${chapter}`;

/** Cache-first fetch of per-verse timestamps for a chapter. */
export async function loadTimestamps(
  lang: string,
  bookSlug: string,
  chapter: number,
): Promise<ChapterTimestamps | null> {
  const key = cacheKey(lang, bookSlug, chapter);
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      try { return JSON.parse(cached) as ChapterTimestamps; } catch {}
    }
  } catch {}
  try {
    const res = await fetch(bibleAudioTimestampsUrl(lang, bookSlug, chapter));
    if (!res.ok) return null;
    const data = (await res.json()) as ChapterTimestamps;
    AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    return data;
  } catch {
    return null;
  }
}

/**
 * Probe whether narration exists for the given lang+book+chapter. Issues a
 * HEAD request so we don't pay the cost of downloading an MP3 just to ask
 * "does this file exist?" — useful for showing/hiding the play button on
 * chapters that haven't been recorded yet.
 *
 * Results are memoised per-process; a fresh app launch will re-probe.
 */
const existenceMemo = new Map<string, boolean>();
export async function hasAudio(
  lang: string,
  bookSlug: string,
  chapter: number,
): Promise<boolean> {
  const key = `${lang}|${bookSlug}|${chapter}`;
  if (existenceMemo.has(key)) return existenceMemo.get(key)!;
  try {
    const res = await fetch(bibleAudioUrl(lang, bookSlug, chapter), { method: 'HEAD' });
    const ok = res.ok;
    existenceMemo.set(key, ok);
    return ok;
  } catch {
    existenceMemo.set(key, false);
    return false;
  }
}

/** Binary-search the active verse from a sorted timestamps array. */
export function verseAtTime(ts: ChapterTimestamps | null, seconds: number): number | null {
  if (!ts?.verses?.length) return null;
  let lo = 0, hi = ts.verses.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = ts.verses[mid];
    if (seconds < v.start) hi = mid - 1;
    else if (seconds > v.end) lo = mid + 1;
    else return v.verse;
  }
  // Past the last verse → return the last one (audio still playing the tail).
  return seconds > ts.verses[ts.verses.length - 1].end
    ? ts.verses[ts.verses.length - 1].verse
    : null;
}

// Re-export the URL builders for convenience so consumers only need this
// service file.
export { bibleAudioUrl, bibleAudioTimestampsUrl } from '../constants/bibleAudioCdn';
