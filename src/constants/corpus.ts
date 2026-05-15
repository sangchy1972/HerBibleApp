// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// f3fc4ca — FR truly 100% complete (translated 266 Claude-en supplement);
//           PT 77.54% (small bump from gap-fill); ES 69.61%.
// 0dc43d8 — FR 100% Tyndale-coverable (added 28 final gap translations).
// 29670f4 — add fr/pt/es commentary trees from BurritoTruck Tyndale TSN.
// 89e0579 — add English commentary tree (Tyndale CC BY-SA 4.0 + 266 original).
// 4cd531e — strip word-segmentation spaces from zh-Hant / zh-Hans verse text.
export const CORPUS_COMMIT = 'f3fc4ca432453d0c15192a96359e861d563e5279';

export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE = `${CORPUS_CDN_ROOT}/bibles`;
