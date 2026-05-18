// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// 226bb1b — fix(en): replaced 6,619 inherited-Tyndale notes with verse-specific
//           PD content (JFB → Adam Clarke → John Gill). Root cause: the
//           original Phase B used fall-through assignment that incorrectly
//           extended a Tyndale block's coverage to every verse up to the next
//           block; Tyndale notes are sparse, so gaps had been silently filled
//           with the wrong verse's note. Canonical fix: 1 Peter 5:7 now reads
//           "Casting—once for all..." instead of "5:5 You who are younger...".
//           Still ~420 verses uncovered (Chronicles/Numbers ritual-law);
//           those keep their old text until round-2 MH+K-D fallback ships.
// 8055c8f — PT now 100% native (matching FR); 240 final Claude-en supplement
//           verses translated. All 1189 chapters fully PT.
// 0df4079 — PT 99.23% (proverbs + jeremiah + psalms complete, ~2.4k new fills);
//           FR maintained at 100%; ES held at 69.61%.
// f3fc4ca — FR truly 100% complete (translated 266 Claude-en supplement);
//           PT 77.54% (small bump from gap-fill); ES 69.61%.
// 0dc43d8 — FR 100% Tyndale-coverable (added 28 final gap translations).
// 29670f4 — add fr/pt/es commentary trees from BurritoTruck Tyndale TSN.
// 89e0579 — add English commentary tree (Tyndale CC BY-SA 4.0 + 266 original).
// 4cd531e — strip word-segmentation spaces from zh-Hant / zh-Hans verse text.
export const CORPUS_COMMIT = '8055c8f65dcc4bbaec5fe68e5fcfc7ee45f6ee23';

export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE = `${CORPUS_CDN_ROOT}/bibles`;
