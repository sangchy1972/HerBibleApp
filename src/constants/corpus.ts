// Pinned commit of https://github.com/sangchy1972/pd-text-corpus that the app
// reads via jsDelivr. Bumping this invalidates AsyncStorage caches across all
// translations, so users on the previous corpus pull fresh chapters next time.
//
// e9df0306 (2026-06-25) — complete original SIMPLIFIED (zh-Hans) AND
//   TRADITIONAL (zh-Hant) CHINESE commentary for all 66 books (Genesis→
//   Revelation). Pure exegesis, no scripture-retelling/no labels; length by
//   CJK chars (60-80/block, cap 120), 2-3 verses/block; in-block scripture
//   quoted from 和合本/CUV (圣经和合本 1919) to match bibles/zh-Hans &
//   bibles/zh-Hant. zh-Hans hand-written; zh-Hant auto-converted via opencc
//   s2tw + targeted fix maps (系→繫/儘性→盡性/迴→回/複興→復興/覆活→復活/
//   云→雲/睏→困/舍→捨). Verse boundaries verified against bibles/zh-Hans;
//   per-edition versification offsets traced & remapped (3 John KJV14/CUV15,
//   Revelation 12 KJV17/CUV18). Per-book python text-value audits clean
//   (coverage==bibles/zh-Hans, all blocks <=120 CJK, no residual English/
//   artifacts). Chinese readers selecting the 简体中文 / 繁體中文 Bible
//   translation now get zh-Hans/zh-Hant via the client's lang->en-mh->en
//   commentary fetch order; every other locale is unaffected. No client logic
//   change needed.
// fc875e33 (2026-06-22) — complete tight original GERMAN (de) AND FRENCH (fr)
//   commentary for all 66 books, in the same tight Genesis-style format (pure
//   commentary, no scripture/no labels, <=70 words & 2-3 verses per block,
//   varied openings). Rendered from en-mh and exegeted afresh; in-block
//   scripture wording quoted from Lutherbibel 1912 (de) and Louis Segond 1910
//   (fr) to match bibles/de and bibles/fr. The old bloated Tyndale-translation
//   commentary/fr NT was overwritten; commentary/de is new. Verse boundaries
//   verified against bibles/<lang> — per-edition versification offsets traced
//   and remapped (2 Corinthians 13, 3 John, Revelation 12, et al.). Per-book
//   full audits clean (coverage==bibles/<lang>, all blocks <=70 words). German
//   and French readers now get de/fr via the client's lang->en-mh->en fetch
//   order; every other locale is unaffected. No client logic change needed.
// bd7ea258 (2026-06-19) — complete tight original PORTUGUESE (pt) commentary
//   for all 66 books, replacing the old bloated Tyndale-translation commentary/pt
//   (scripture-retelling + labels + over-long blocks). Pure commentary, no
//   scripture, no labels, <=70 words & 2-3 verses per block, varied openings;
//   rendered from en-mh and exegeted afresh. Verse boundaries verified against
//   bibles/pt — four edition-specific versification offsets traced and remapped
//   (Ezekiel 20, Luke 9, 2 Corinthians 13, 3 John, Revelation 12). Per-book
//   full audits clean (coverage==bibles/pt, all blocks <=70 words). Verified
//   live on jsDelivr (HTTP 200, offset verse counts correct). Portuguese
//   readers now get pt via the client's lang->en-mh->en fetch order; English
//   and every other locale are unaffected. No client code change needed.
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
export const CORPUS_COMMIT = 'e9df0306d76c8b1bf66aae71fc6e93ed8622c8cc';

// Root of the corpus tree (no `/bibles` suffix). Use this when reading
// non-Bible payloads like commentary or any future cross-bible asset. The
// existing `CORPUS_CDN_BASE` below appends `/bibles` for backward compat
// with every fetchTranslation/fetchChapter call site.
export const CORPUS_CDN_ROOT =
  `https://cdn.jsdelivr.net/gh/sangchy1972/pd-text-corpus@${CORPUS_COMMIT}`;

export const CORPUS_CDN_BASE =
  `${CORPUS_CDN_ROOT}/bibles`;
