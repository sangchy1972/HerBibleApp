// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// 0dc43d8 — FR 100% Tyndale-coverable (added 28 final gap translations).
// 29670f4 — add fr/pt/es commentary trees from BurritoTruck Tyndale TSN
//           (CC BY-SA 4.0). FR 98.85% / PT 76.58% / ES 69.6% verse coverage.
//           Chapters with partial coverage inline-fall-back to en text.
// 89e0579 — add English commentary tree (Tyndale CC BY-SA 4.0 + 266 original).
// 4cd531e — strip word-segmentation spaces from zh-Hant / zh-Hans verse text.
export const CORPUS_COMMIT = '0dc43d8d41c991fbd68883b82388d93e68ec377e';

export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE = `${CORPUS_CDN_ROOT}/bibles`;
