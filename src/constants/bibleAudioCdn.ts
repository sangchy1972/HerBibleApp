// Bible-narration audio served from the `herbible-audio-7languages` R2 bucket.
//
// LOCALIZED HUMAN-READ SET (2026-07): every supported language now points at the
// same unified layout the user uploads per-language:
//   bible_audio_7languages/<FOLDER>/<NN>_<Name>/<Name>_<CCC>.mp3
//   bible_audio_7languages/<FOLDER>/<NN>_<Name>/<Name>_<CCC>.timestamps.json
// where
//   <FOLDER> = the uppercase language code (EN, ES, PT, …),
//   <NN>     = the 2-digit canonical Protestant ordinal (01_… 66_…),
//   <Name>   = that language's book name with accents stripped and spaces → '_'
//              (ES 'Éxodo' → 'Exodo', PT 'Cânticos' → 'Canticos',
//               EN '1 Samuel' → '1_Samuel', 'Song of Solomon' → 'Song_of_Solomon'),
//   <CCC>    = the 3-digit zero-padded chapter.
// Every edge case above was verified 200 against the live bucket. The sidecar
// `.timestamps.json` carries { audio_file, audio_duration_sec, verses:[{verse,
// start,end}] }, so the karaoke verse-highlighting works unchanged.
//
// CONFIGURED languages are listed in SEVEN_LANG_FOLDER. en/es/pt are live;
// zh-Hans has a folder in the bucket but it is still EMPTY, so it is left OUT
// here and falls through to the legacy TTS path until its files are uploaded
// (adding it early would 404 the play button). Any language not listed also
// falls back to the legacy `audio/<lang>/<book-slug>/<chapter>.mp3` layout.
//
// Custom domain on the bucket: `audio.everlandapps.com`, R2-fronted, with
// 1-year immutable cache headers on every object.
import { CANONICAL_BOOK_SLUGS, localizeBookName, englishBookName } from './bibleBookNames';

export const BIBLE_AUDIO_BASE = 'https://audio.everlandapps.com';

const SEVEN_LANG_PREFIX = 'bible_audio_7languages';

// Languages CONFIRMED uploaded to the new unified layout → uppercase folder.
// Add 'zh-Hans': 'zh-Hans' (and any others) once their files land in the bucket.
const SEVEN_LANG_FOLDER: Record<string, string> = { en: 'EN', es: 'ES', pt: 'PT' };

// Strip diacritics + turn runs of whitespace into single underscores, matching
// how the bucket names its folders/files (e.g. 'Éxodo' → 'Exodo', '1 Samuel' →
// '1_Samuel', 'Song of Solomon' → 'Song_of_Solomon').
function asciiUnderscore(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
}

// That language's display name for the book. English has no override map in
// localizeBookName, so read the canonical English names directly.
function localBookName(lang: string, bookSlug: string): string {
  return lang === 'en' ? englishBookName(bookSlug) : localizeBookName(lang, bookSlug, '');
}

// { folder, dir: '<NN>_<Name>', stem: '<Name>' } for the localized set, or null
// when the language isn't configured / the slug is unknown (caller then falls
// back to the legacy TTS path).
function sevenLangParts(lang: string, bookSlug: string): { folder: string; dir: string; stem: string } | null {
  const folder = SEVEN_LANG_FOLDER[lang];
  if (!folder) return null;
  const idx = CANONICAL_BOOK_SLUGS.indexOf(bookSlug);
  if (idx < 0) return null;
  const local = localBookName(lang, bookSlug);
  if (!local) return null;
  const stem = asciiUnderscore(local);
  return { folder, dir: `${String(idx + 1).padStart(2, '0')}_${stem}`, stem };
}

const pad3 = (n: number): string => String(n).padStart(3, '0');

/** URL to the MP3 narration for a single chapter. */
export function bibleAudioUrl(lang: string, bookSlug: string, chapter: number): string {
  const sl = sevenLangParts(lang, bookSlug);
  if (sl) return `${BIBLE_AUDIO_BASE}/${SEVEN_LANG_PREFIX}/${sl.folder}/${sl.dir}/${sl.stem}_${pad3(chapter)}.mp3`;
  return `${BIBLE_AUDIO_BASE}/audio/${lang}/${bookSlug}/${chapter}.mp3`;
}

/** URL to the per-verse timestamps JSON (used for karaoke-style highlighting). */
export function bibleAudioTimestampsUrl(lang: string, bookSlug: string, chapter: number): string {
  const sl = sevenLangParts(lang, bookSlug);
  if (sl) return `${BIBLE_AUDIO_BASE}/${SEVEN_LANG_PREFIX}/${sl.folder}/${sl.dir}/${sl.stem}_${pad3(chapter)}.timestamps.json`;
  return `${BIBLE_AUDIO_BASE}/audio/${lang}/${bookSlug}/${chapter}.timestamps.json`;
}

// Languages we expect to have narration for. en/es/pt = new human-read set
// (verified); zh-Hans = legacy TTS set (full) until its 7languages files land.
// The rest fall back to a HEAD probe in `bibleAudioService.hasNarration(lang)`
// and degrade gracefully if absent.
export const NARRATION_LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'] as const;
export type NarrationLang = typeof NARRATION_LANGS[number];
