// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// 8055c8f — adds full `commentary/en/` tree (Tyndale Open Study Notes for
//   30,836 verses + Claude-filled devotionals for the 266 gap verses). This
//   is the SHA the Explore card on BibleScreen reads from.
export const CORPUS_COMMIT = '8055c8f65dcc4bbaec5fe68e5fcfc7ee45f6ee23';

// Root of the corpus tree (no `/bibles` suffix). Use this when reading
// non-Bible payloads like commentary or any future cross-bible asset. The
// existing `CORPUS_CDN_BASE` below appends `/bibles` for backward compat
// with every fetchTranslation/fetchChapter call site.
export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE =
  `${CORPUS_CDN_ROOT}/bibles`;
