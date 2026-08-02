import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from './firebase';
import {
  QUIZ_BANK_VERSION, quizBankUrl, type QuizBankFile, type QuizQuestion,
} from '../constants/bibleQuiz';

// Fetch + cache the question bank for one language.
//
// The bank is the sole source of truth for what "correct" means, so this module
// is deliberately strict: a payload that doesn't fully validate is REJECTED
// rather than partially used. A quiz that marks a right answer wrong is worse
// than a quiz that isn't there — and "isn't there" has a defined behaviour
// (the home card hides itself).
//
// Cached under a key scoped by BOTH language and bank version, so bumping the
// version orphans the old copy instead of overwriting it — which means a
// downgrade or a rollback still finds its own cache intact.

const cacheKey = (lang: string) => `quiz:bank:v${QUIZ_BANK_VERSION}:${lang}`;
const FETCH_TIMEOUT_MS = 15_000;
/** Any real bank is ~60 KB / 327 items; this only catches absurd payloads. */
const MAX_QUESTIONS = 5000;

/** One question survives only if every field it needs is present and coherent. */
function sanitizeQuestion(raw: any): QuizQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, question, options, answerIndex } = raw;
  if (!Number.isInteger(id)) return null;
  if (typeof question !== 'string' || !question.trim()) return null;
  if (!Array.isArray(options) || options.length < 2) return null;
  if (!options.every((o: unknown) => typeof o === 'string' && o.trim())) return null;
  // The whole point of the module: an out-of-range index would silently make
  // every answer wrong on that question.
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null;
  return { id, question: question.trim(), options: options.map((o: string) => o.trim()), answerIndex };
}

/**
 * Validate a fetched/cached payload. Returns null — never a partial bank —
 * because set composition indexes by POSITION: silently dropping a bad question
 * would shift every set boundary and hand different users different quizzes.
 */
export function parseBankFile(raw: unknown, lang: string): QuizQuestion[] | null {
  const file = raw as QuizBankFile;
  if (!file || typeof file !== 'object') return null;
  if (!Array.isArray(file.questions) || file.questions.length === 0) return null;
  if (file.questions.length > MAX_QUESTIONS) return null;
  if (Number.isInteger(file.bankVersion) && file.bankVersion !== QUIZ_BANK_VERSION) return null;
  if (typeof file.lang === 'string' && file.lang !== lang) return null;

  const out: QuizQuestion[] = [];
  const seen = new Set<number>();
  for (const q of file.questions) {
    const clean = sanitizeQuestion(q);
    if (!clean || seen.has(clean.id)) return null;   // all-or-nothing
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/** Cached copy, or null. Cheap enough to call on mount. */
export async function cachedBank(lang: string): Promise<QuizQuestion[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(lang));
    if (!raw) return null;
    return parseBankFile(JSON.parse(raw), lang);
  } catch {
    return null;
  }
}

/**
 * Download the bank for a language and cache it. Returns the questions, or null
 * on any failure — offline, 404, malformed, wrong version. Never throws.
 *
 * Callers treat null as "no quiz yet" and retry on a later launch; there is no
 * partial or degraded mode.
 */
export async function fetchBank(lang: string): Promise<QuizQuestion[] | null> {
  const url = quizBankUrl(lang);
  try {
    // Bounded: a hung request must not keep the promise alive for the session.
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(kill);
    }
    if (!res.ok) {
      logEvent('quiz_bank_fetch', { ok: 0, lang, reason: `http_${res.status}` });
      return null;
    }
    const json = await res.json();
    const questions = parseBankFile(json, lang);
    if (!questions) {
      logEvent('quiz_bank_fetch', { ok: 0, lang, reason: 'bad_payload' });
      return null;
    }
    // Cache the RAW payload, not our parsed form: re-validating on every read
    // keeps a single validation path, so a future stricter rule applies to
    // already-cached copies too.
    try { await AsyncStorage.setItem(cacheKey(lang), JSON.stringify(json)); } catch {}
    logEvent('quiz_bank_fetch', { ok: 1, lang, count: questions.length });
    return questions;
  } catch (e: any) {
    logEvent('quiz_bank_fetch', { ok: 0, lang, reason: String(e?.name || 'error') });
    return null;
  }
}

/**
 * Cache-first, then network. English is NOT a fallback for a missing
 * translation: serving English questions to a user who picked Spanish is a
 * worse failure than showing no card, and the card already handles absence.
 */
export async function loadBank(lang: string): Promise<QuizQuestion[] | null> {
  const hit = await cachedBank(lang);
  if (hit) {
    // Refresh in the background so an edited bank lands by the next launch,
    // without making the user wait on the network for a bank we already have.
    void fetchBank(lang).catch(() => {});
    return hit;
  }
  return fetchBank(lang);
}

/** Test seam. */
export async function __clearBankCacheForTest(lang: string): Promise<void> {
  try { await AsyncStorage.removeItem(cacheKey(lang)); } catch {}
}
