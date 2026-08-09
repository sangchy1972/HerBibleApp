// Bible quiz — types + CDN location. The APK ships NO questions.
//
// The bank is 650 questions in 7 languages (~95 KB each). Bundling all seven
// would put ~665 KB of dead weight in every binary; bundling only English would
// mean a Spanish user downloads a bank she can't read. So the client fetches
// exactly the one language it needs, once, and caches it — the same shape as
// the badge art and the plan corpus.
//
// The tradeoff, chosen deliberately: a device that has NEVER been online since
// install has no bank, and the home card is HIDDEN rather than shown broken.
// See services/quizBank.ts.
//
// Hosted on its OWN public R2 bucket (`herbible-quiz`, custom domain
// quiz.everlandapps.com) — deliberately not the covers bucket that serves plan
// art and badges, so a quiz re-cut can never disturb image caching and the two
// can be purged independently.
//
// The `/v1/` segment is a cache-bust handle, not decoration: a custom domain
// puts Cloudflare's cache in front of these files, so re-editing questions
// under the SAME key can keep serving the old bank for a long time. Re-translate
// or edit questions → bump the segment (v1 → v2) and re-upload, which
// invalidates every language at once. Project rule: path-version, never
// per-file SHAs.

export interface QuizQuestion {
  /** Stable id from the source export. Identical across all 7 languages. */
  id: number;
  question: string;
  /**
   * 2 or 4 entries — the bank is NOT uniformly 4-option (59 items are
   * two-option, True/False or Yes/No; the other 268 have four). Renderers must map over this, never assume a length.
   */
  options: readonly string[];
  /** The ONLY source of truth for correctness. Indexes into `options`. */
  answerIndex: number;
}

/**
 * Bumped on ANY change to the question set.
 *
 * v2 dropped two questions whose ANSWER changed under translation:
 *   id 171 — "Amos is the first OT book alphabetically" is true in English but
 *            false in pt/es/fr (Ageu / Abdías / Abdias sort first).
 *   id 103 — the question text literally said "called this in English".
 * Both were removed from EVERY language, not just the broken ones: setIndex
 * addresses questions by position, so a language with a different question set
 * would silently serve a different quiz, and switching language mid-ladder
 * would scramble a user's progress.
 *
 * v3 (2026-08-08) is a re-cut, not an edit: 327 -> 650. Published by REPLACING
 * the /v1/ objects rather than bumping the path (owner's call, small user base).
 *
 * 🔴 That makes the Cloudflare purge load-bearing, and the failure is not
 * "she sees old questions". parseBankFile REJECTS any file whose bankVersion is
 * not this constant (quizBank.ts), so a stale v2 body served from the edge to a
 * v3 client parses to null and the quiz card DISAPPEARS. Safe, but broken, for
 * as long as the cache lives. Purge every one of the seven URLs after upload.
 *   - 115 of the original 327 were DROPPED. A pastor audit found the legacy set
 *     had been seeded partly from a generic Jewish/Israel trivia file: modern
 *     Israel, Jewish-American history, Scientology, Catholic canonisation, an
 *     English-idiom quiz, and eight questions whose quotation had gone missing
 *     so they were literally unanswerable.
 *   - 47 more were fixed (typos reached the CORRECT answer three times:
 *     "Kindgom", "Rehab" for Rahab, "Ninevah" for Nineveh).
 *   - 438 new questions were written to a 5:2 New/Old Testament brief and
 *     reviewed question-by-question. All 66 books now have coverage.
 *   - Every locale is aligned to ITS OWN Bible rather than translated from the
 *     KJV: RVR1909 / LSG1910 / Luther 1912 / Almeida / 和合本. Three questions
 *     were replaced at the SOURCE because they were KJV-only readings that
 *     three or four languages independently flagged (Mars' hill, Habakkuk's
 *     "tower", Zephaniah's "singing") — fixing the English removes the problem
 *     from every language at once, and from every language added later.
 */
export const QUIZ_BANK_VERSION = 3;

/**
 * How many questions the CDN bank currently holds.
 *
 * PLANNING FIGURE ONLY. Nothing at runtime reads it — every code path uses
 * `bank.length` from the file it actually downloaded, because this number is a
 * fact about a bucket and can be wrong. It exists so the content budget in
 * __tests__/quizLifecycle.test.ts is checked against something, since the bank
 * is not bundled and a test cannot count it.
 *
 * ⚠️ Update this whenever the bank is re-cut. If it drifts, the only thing that
 * breaks is the budget arithmetic — which is exactly the thing that must not
 * drift quietly, hence the test.
 *
 * At 650 the collections are exactly reachable: 130 sets unlock 33 paintings
 * (33 exist) and 43 cards (43 exist), with the last of each landing on set 130.
 * The old 327 stranded them at 16/24 and 22/40 — a ceiling a daily player hit
 * in about three weeks. There is now no slack in either direction.
 */
export const QUIZ_BANK_SIZE = 650;

export const QUIZ_CDN_BASE = 'https://quiz.everlandapps.com/v1';

/**
 * Languages with a published bank.
 *
 * quizBankUrl serves quiz-en.json for anything unlisted, but parseBankFile then
 * REJECTS it (`file.lang !== lang`), so an unlisted language downloads ~60 KB
 * and shows no quiz at all. That is deliberate — a Japanese user reading
 * English questions is worse than no card — but it is not a fallback, and
 * calling it one has confused this twice. Add the language here only when its
 * bank is actually published.
 */
export const QUIZ_LANGS = ['en', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es', 'pt'] as const;
export type QuizLang = typeof QUIZ_LANGS[number];

export function quizBankUrl(lang: string): string {
  const safe = (QUIZ_LANGS as readonly string[]).includes(lang) ? lang : 'en';
  return `${QUIZ_CDN_BASE}/quiz-${safe}.json`;
}

/** Shape of a published bank file. */
export interface QuizBankFile {
  v: number;
  lang: string;
  bankVersion: number;
  count: number;
  questions: QuizQuestion[];
}
