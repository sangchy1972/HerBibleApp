// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// 65ff590 (2026-06-07) — Claude-rewritten explanations replacing the Tyndale
//   set in the commentary tree (pushed by the user; verified live on jsDelivr,
//   same JSON schema). Bumping this pin both points the Explore card at the
//   new content AND invalidates every device's cached chapters.
// 8055c8f — added the full `commentary/en/` tree (Tyndale Open Study Notes
//   for 30,836 verses + Claude-filled devotionals for the 266 gap verses).
export const CORPUS_COMMIT = '65ff5906f6ce92557f3c298b904128043c5f2c28';

// Root of the corpus tree (no `/bibles` suffix). Use this when reading
// non-Bible payloads like commentary or any future cross-bible asset. The
// existing `CORPUS_CDN_BASE` below appends `/bibles` for backward compat
// with every fetchTranslation/fetchChapter call site.
export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE =
  `${CORPUS_CDN_ROOT}/bibles`;
