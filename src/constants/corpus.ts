// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// b3651357 (2026-06-18) — fix en-mh book slugs to match the Bible index
//   (i-corinthians, ii-kings, iii-john, revelation-of-john, song-of-solomon).
//   19 books had 404'd on the client and silently fallen back to Tyndale;
//   now all 66 tight en-mh books actually serve. No content change.
// ab3d1151 (2026-06-18) — tight rewrite of the 6 remaining bloated OT books:
//   Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges (these still
//   carried the old scripture-retelling + "Guidance:" labels + blocks up to
//   ~496 words). Now every one of the 66 books is in the tight Genesis-style
//   format. Full-corpus audit: 1189 chapters / 31,102 verses, 0 non-compliant
//   blocks (all <=70 words, no Guidance labels). Verified live on jsDelivr.
// 5b07dd32 (2026-06-18) — en-mh bespoke commentary now covers the COMPLETE
//   Bible: all 66 books, Genesis→Revelation, in the tight Genesis-style format
//   (pure commentary, no scripture/no "Guidance:" label, ≤70 words & ≤5 verses
//   per block). This phase rewrote the over-long OT books (Ruth→2 Chronicles)
//   and wrote every NT book fresh (Gospels, Acts, all epistles, Revelation).
//   Verified live on jsDelivr (HTTP 200, verse counts match bibles/en source).
//   Same JSON schema; en-mh is now self-sufficient for the whole canon.
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
export const CORPUS_COMMIT = 'b3651357c9521d3ea7f6ea2cc610c8cf799d22f0';

// Root of the corpus tree (no `/bibles` suffix). Use this when reading
// non-Bible payloads like commentary or any future cross-bible asset. The
// existing `CORPUS_CDN_BASE` below appends `/bibles` for backward compat
// with every fetchTranslation/fetchChapter call site.
export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE =
  `${CORPUS_CDN_ROOT}/bibles`;
