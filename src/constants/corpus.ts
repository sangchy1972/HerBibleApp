// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// 89e0579 — add English commentary tree (Tyndale CC BY-SA 4.0 + 266 original).
// 4cd531e — strip word-segmentation spaces from zh-Hant / zh-Hans verse text.
export const CORPUS_COMMIT = '89e05798e00a9095795c5adc100482bd55adf74c';

export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE = `${CORPUS_CDN_ROOT}/bibles`;
