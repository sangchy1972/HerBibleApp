// USFM-style 3-letter book codes → our internal slugs.
//
// The Featured Plans corpus stores Bible references like { book_code: "PHP",
// chapter: 4, verses: "6-8" }. Our Bible reader keys chapters by slug
// (`philippians`), so verse jumps need a mapping. All 66 Protestant books
// are listed; only ~46 are actually referenced by the current plan corpus
// (verified by `scripts/verify_plans.mjs`), but covering everything keeps
// future content additions zero-touch.

export const BOOK_CODE_TO_SLUG: Record<string, string> = {
  // ── Old Testament ─────────────────────────────────────────────────────
  GEN: 'genesis',     EXO: 'exodus',         LEV: 'leviticus',     NUM: 'numbers',
  DEU: 'deuteronomy', JOS: 'joshua',          JDG: 'judges',        RUT: 'ruth',
  '1SA': 'i-samuel',  '2SA': 'ii-samuel',
  '1KI': 'i-kings',   '2KI': 'ii-kings',
  '1CH': 'i-chronicles', '2CH': 'ii-chronicles',
  EZR: 'ezra',        NEH: 'nehemiah',        EST: 'esther',
  JOB: 'job',         PSA: 'psalms',          PRO: 'proverbs',      ECC: 'ecclesiastes',
  SNG: 'song-of-solomon',
  ISA: 'isaiah',      JER: 'jeremiah',        LAM: 'lamentations',
  EZK: 'ezekiel',     DAN: 'daniel',
  HOS: 'hosea',       JOL: 'joel',            AMO: 'amos',          OBA: 'obadiah',
  JON: 'jonah',       MIC: 'micah',           NAM: 'nahum',         HAB: 'habakkuk',
  ZEP: 'zephaniah',   HAG: 'haggai',          ZEC: 'zechariah',     MAL: 'malachi',

  // ── New Testament ─────────────────────────────────────────────────────
  MAT: 'matthew',     MRK: 'mark',            LUK: 'luke',          JHN: 'john',
  ACT: 'acts',        ROM: 'romans',
  '1CO': 'i-corinthians', '2CO': 'ii-corinthians',
  GAL: 'galatians',   EPH: 'ephesians',       PHP: 'philippians',   COL: 'colossians',
  '1TH': 'i-thessalonians', '2TH': 'ii-thessalonians',
  '1TI': 'i-timothy', '2TI': 'ii-timothy',    TIT: 'titus',         PHM: 'philemon',
  HEB: 'hebrews',     JAS: 'james',
  '1PE': 'i-peter',   '2PE': 'ii-peter',
  '1JN': 'i-john',    '2JN': 'ii-john',       '3JN': 'iii-john',
  JUD: 'jude',        REV: 'revelation-of-john',
};

export function bookCodeToSlug(code: string): string | null {
  return BOOK_CODE_TO_SLUG[code.toUpperCase()] || null;
}

// Parses the verses string from plan data ("6", "6-8", "1") into start/end.
export function parseVerseRange(verses: string | number): { start: number; end: number } {
  const s = String(verses);
  const m = s.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return { start: 1, end: 1 };
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  return { start, end };
}
