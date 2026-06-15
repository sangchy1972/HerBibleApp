// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// 72bb70b2 (2026-06-15) — en-mh bespoke commentary extended to Numbers 15-36,
//   Deuteronomy, Joshua, Judges, Ruth, 1-2 Samuel, 1 Kings, and 2 Kings 1-9
//   (191 chapters; 322 en-mh total). Recovered from session transcript after
//   the /tmp staging dir was wiped, then committed + pushed; verified live on
//   jsDelivr (HTTP 200, correct verse counts). Same JSON schema. Everything
//   outside en-mh still falls back to the Tyndale `commentary/en/` tree.
// 65ff590 (2026-06-07) — Claude-rewritten explanations replacing the Tyndale
//   set in the commentary tree (pushed by the user; verified live on jsDelivr,
//   same JSON schema). Bumping this pin both points the Explore card at the
//   new content AND invalidates every device's cached chapters.
// 8055c8f — added the full `commentary/en/` tree (Tyndale Open Study Notes
//   for 30,836 verses + Claude-filled devotionals for the 266 gap verses).
export const CORPUS_COMMIT = '72bb70b2538fac91169815db9cf75bec4f8556d6';

// Root of the corpus tree (no `/bibles` suffix). Use this when reading
// non-Bible payloads like commentary or any future cross-bible asset. The
// existing `CORPUS_CDN_BASE` below appends `/bibles` for backward compat
// with every fetchTranslation/fetchChapter call site.
export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE =
  `${CORPUS_CDN_ROOT}/bibles`;
