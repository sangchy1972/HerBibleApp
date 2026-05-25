// Bible-narration audio served from the `herbible-audio-7languages` R2 bucket.
//
// Bucket key layout (verified by the user's Cloudflare dashboard):
//   audio/<lang>/<book-slug>/<chapter>.mp3
//   audio/<lang>/<book-slug>/<chapter>.timestamps.json
//
// Example: `audio/en/acts/1.mp3` + `audio/en/acts/1.timestamps.json`
//
// `<book-slug>` matches the canonical lowercase slugs in
// constants/bibleBookNames.ts (`acts`, `genesis`, `i-samuel`, etc.) so the
// Bible reader can address chapters without a lookup table.
//
// Custom domain on the bucket: `audio.everlandapps.com`, R2-fronted, with
// 1-year immutable cache headers on every object (verified via HEAD).
//
// Language coverage at time of writing (probed live):
//   • en       — full (KJV narration, every book probed returned 200)
//   • zh-Hans  — full (和合本简体, verified through Rev 22)
//   • zh-Hant, de, fr, es, pt — not yet uploaded (404)
//
// The 5 missing languages aren't a code problem — `useAudioPlayer` swallows
// 404s and the play button stays silent. Upload narration to the bucket at
// `audio/<lang>/<book>/<chapter>.mp3` and audio appears with no client
// release (1-year cache TTL is moot for previously-404'd keys; CF revalidates
// on miss).
export const BIBLE_AUDIO_BASE = 'https://audio.everlandapps.com';

/** URL to the MP3 narration for a single chapter. */
export function bibleAudioUrl(lang: string, bookSlug: string, chapter: number): string {
  return `${BIBLE_AUDIO_BASE}/audio/${lang}/${bookSlug}/${chapter}.mp3`;
}

/** URL to the per-verse timestamps JSON (used for karaoke-style highlighting). */
export function bibleAudioTimestampsUrl(lang: string, bookSlug: string, chapter: number): string {
  return `${BIBLE_AUDIO_BASE}/audio/${lang}/${bookSlug}/${chapter}.timestamps.json`;
}

// Languages we expect to have narration for. The 7-language bucket name is
// aspirational — at the time of writing only English is confirmed populated.
// `bibleAudioService.hasNarration(lang)` falls back to a HEAD probe so we
// degrade gracefully when a language's files aren't uploaded yet.
export const NARRATION_LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'] as const;
export type NarrationLang = typeof NARRATION_LANGS[number];
