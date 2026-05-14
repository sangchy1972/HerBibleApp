// Cross-translation verse-numbering adjustments.
//
// References that travel through the app (daily verses, share links, saved
// references, deep-links) are stored in **canonical (KJV-style) numbering**.
// Most translations match that numbering, but a few don't — Lutherbibel and
// Louis Segond keep the Hebrew Masoretic numbering for some passages, and
// the Vulgate-derived chapter splits diverge in Joel and Malachi.
//
// `adjustFocus(code, focus)` translates a canonical reference into the
// position it ACTUALLY occupies in the named translation's chapter files,
// so the BibleScreen highlights the correct content. Translations not
// listed here pass through unchanged.
//
// Verified by `scripts/verify_alignment.mjs` against the live corpus.

import type { BibleFocus } from '../navigation/types';

// Psalm offsets per translation, derived from actual corpus chapter lengths
// by `scripts/derive_psalm_offsets.mjs` (do not hand-edit). Each set lists
// chapters where the named translation has +N more verses than KJV — i.e.
// where KJV verse X is stored as verse X+N in that translation. Re-run the
// derive script if you bump CORPUS_COMMIT.

const LUTH_PLUS_1 = new Set<number>([
  3, 4, 5, 6, 7, 8, 9, 12, 13, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39, 40,
  41, 42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65,
  68, 69, 70, 75, 76, 77, 80, 81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142,
]);
const LUTH_PLUS_2 = new Set<number>([51, 52, 54, 60]);

const LSG_PLUS_1 = new Set<number>([
  3, 4, 5, 6, 7, 8, 9, 12, 18, 19, 20, 21, 22, 30, 31, 34, 36, 38, 39, 40, 41,
  42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 68,
  69, 70, 75, 76, 77, 80, 81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142,
]);
const LSG_PLUS_2 = new Set<number>([51, 52, 54, 60]);

function shiftPsalm(focus: BibleFocus, offset: number): BibleFocus {
  return {
    ...focus,
    verseStart: focus.verseStart + offset,
    verseEnd: focus.verseEnd + offset,
  };
}

// Lutherbibel 1912 — German numbering, follows MT for Psalms and Joel/Malachi.
function adjustLuther(focus: BibleFocus): BibleFocus {
  const { bookSlug, chapter } = focus;

  if (bookSlug === 'psalms') {
    if (LUTH_PLUS_2.has(chapter)) return shiftPsalm(focus, 2);
    if (LUTH_PLUS_1.has(chapter)) return shiftPsalm(focus, 1);
    return focus;
  }

  // Joel 2:28-32 (KJV) → Joel 3:1-5 (Luther, MT-aligned).
  if (bookSlug === 'joel' && chapter === 2 && focus.verseStart >= 28) {
    return {
      ...focus,
      chapter: 3,
      verseStart: focus.verseStart - 27,
      verseEnd: focus.verseEnd - 27,
    };
  }
  // Joel 3 (KJV, 21 vv) → Joel 4 (Luther, 21 vv) — verse numbers unchanged.
  if (bookSlug === 'joel' && chapter === 3) {
    return { ...focus, chapter: 4 };
  }

  // Malachi 4 (KJV, 6 vv) → Malachi 3:19-24 (Luther, no chapter 4 exists).
  if (bookSlug === 'malachi' && chapter === 4) {
    return {
      ...focus,
      chapter: 3,
      verseStart: focus.verseStart + 18,
      verseEnd: focus.verseEnd + 18,
    };
  }

  return focus;
}

// Louis Segond 1910 — French; follows MT for Psalms only (Joel/Malachi
// match KJV).
function adjustLouisSegond(focus: BibleFocus): BibleFocus {
  if (focus.bookSlug === 'psalms') {
    if (LSG_PLUS_2.has(focus.chapter)) return shiftPsalm(focus, 2);
    if (LSG_PLUS_1.has(focus.chapter)) return shiftPsalm(focus, 1);
  }
  return focus;
}

/** Translate a canonical (KJV-numbered) focus into the active translation's
 *  actual storage numbering. Returns the input unchanged for translations
 *  that don't deviate. */
export function adjustFocus(code: string, focus: BibleFocus): BibleFocus {
  switch (code) {
    case 'de': return adjustLuther(focus);
    case 'fr': return adjustLouisSegond(focus);
    default:   return focus;
  }
}
