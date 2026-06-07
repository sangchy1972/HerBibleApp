// Bible-narration audio served from the `herbible-audio-7languages` R2 bucket.
//
// ENGLISH (2026-06): switched from the TTS set to HUMAN-READ narration the
// user recorded and uploaded. Bucket key layout (verified by probing the
// CDN + the user's Cloudflare dashboard screenshot):
//   bible_audio_human_reading/<NN>_<book-slug>/<book-slug>_<CCC>.mp3
//   bible_audio_human_reading/<NN>_<book-slug>/<book-slug>_<CCC>.json
// where <NN> is the 2-digit canonical book ordinal (01_genesis …
// 66_revelation-of-john) and <CCC> the 3-digit zero-padded chapter.
// Example (probed 200): `bible_audio_human_reading/09_i-samuel/i-samuel_001.mp3`
// The sidecar `.json` carries the SAME shape as the old `.timestamps.json`
// ({ audio_file, audio_duration_sec, verses:[{verse,start,end}] }), so the
// karaoke verse-highlighting works unchanged.
//
// OTHER LANGUAGES still point at the original TTS layout — the human
// recording is English-only, and zh-Hans has a full TTS set there:
//   audio/<lang>/<book-slug>/<chapter>.mp3 (+ .timestamps.json)
//
// `<book-slug>` everywhere matches the canonical lowercase slugs in
// constants/bibleBookNames.ts (`acts`, `genesis`, `i-samuel`, etc.).
//
// Custom domain on the bucket: `audio.everlandapps.com`, R2-fronted, with
// 1-year immutable cache headers on every object.
import { CANONICAL_BOOK_SLUGS } from './bibleBookNames';

export const BIBLE_AUDIO_BASE = 'https://audio.everlandapps.com';

const HUMAN_READING_PREFIX = 'bible_audio_human_reading';

// `01_genesis` … `66_revelation-of-john`, or null for an unknown slug (the
// caller then falls back to the legacy TTS path, which 404s harmlessly —
// useAudioPlayer swallows it and the play button stays silent).
function humanReadingDir(bookSlug: string): string | null {
  const idx = CANONICAL_BOOK_SLUGS.indexOf(bookSlug);
  if (idx < 0) return null;
  return `${String(idx + 1).padStart(2, '0')}_${bookSlug}`;
}

function humanReadingFile(bookSlug: string, chapter: number): string {
  return `${bookSlug}_${String(chapter).padStart(3, '0')}`;
}

/** URL to the MP3 narration for a single chapter. */
export function bibleAudioUrl(lang: string, bookSlug: string, chapter: number): string {
  if (lang === 'en') {
    const dir = humanReadingDir(bookSlug);
    if (dir) return `${BIBLE_AUDIO_BASE}/${HUMAN_READING_PREFIX}/${dir}/${humanReadingFile(bookSlug, chapter)}.mp3`;
  }
  return `${BIBLE_AUDIO_BASE}/audio/${lang}/${bookSlug}/${chapter}.mp3`;
}

/** URL to the per-verse timestamps JSON (used for karaoke-style highlighting). */
export function bibleAudioTimestampsUrl(lang: string, bookSlug: string, chapter: number): string {
  if (lang === 'en') {
    const dir = humanReadingDir(bookSlug);
    // NOTE: human-reading sidecar is `<file>.json`, not `.timestamps.json`.
    if (dir) return `${BIBLE_AUDIO_BASE}/${HUMAN_READING_PREFIX}/${dir}/${humanReadingFile(bookSlug, chapter)}.json`;
  }
  return `${BIBLE_AUDIO_BASE}/audio/${lang}/${bookSlug}/${chapter}.timestamps.json`;
}

// Languages we expect to have narration for. en = human reading (full, probed);
// zh-Hans = TTS set (full). The rest fall back to a HEAD probe in
// `bibleAudioService.hasNarration(lang)` and degrade gracefully if absent.
export const NARRATION_LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'] as const;
export type NarrationLang = typeof NARRATION_LANGS[number];
