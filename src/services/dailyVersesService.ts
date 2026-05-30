import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUNDLED_DAILY_VERSES, type DailyVerse } from '../constants/dailyVersesBundled';
import { DAILY_VERSES_VERSION, dailyVersesUrl } from '../constants/dailyVersesCdn';
import { getSessionToken, invalidateSessionToken } from './attestService';
import type { LanguageCode } from '../state/TranslationsContext';

// Cache keys are scoped by the content version so a republish (bumping
// DAILY_VERSES_VERSION → a new /vN/ R2 path) auto-invalidates every
// device's local cache.
const CACHE_TAG = DAILY_VERSES_VERSION;
const cacheKey = (lang: LanguageCode) => `daily-verses:${CACHE_TAG}:${lang}`;

// Same shape we hand the rest of the app — slimmed down from the upstream JSON
// at parse time. The bundled fallback already follows this shape, so callers
// don't need to know whether the data came from APK or CDN.
export interface FullDailyVerse extends DailyVerse {}

interface UpstreamVerse {
  day: number;
  segment: 'morning' | 'evening';
  reference: { book: string; chapter: number; verse: string | number; full_reference: string };
  translations: Record<string, { modern?: { version: string; text: string } }>;
  devotional: Record<string, { meditation: string; action_step: string }>;
  prayer: Record<string, string>;
}

interface UpstreamFile {
  meta?: unknown;
  verses: UpstreamVerse[];
}

// Slim the upstream verse down to just what the prayer flow renders.
// Skips entries missing the language-specific fields (defensive — should
// never happen with the canonical files, but keeps a corrupt entry from
// crashing the whole pull).
function slim(v: UpstreamVerse, lang: LanguageCode): FullDailyVerse | null {
  const tr = v.translations?.[lang]?.modern;
  const dev = v.devotional?.[lang];
  const prayer = v.prayer?.[lang];
  if (!tr || !dev || !prayer) return null;
  return {
    day: v.day,
    segment: v.segment,
    reference: {
      book: v.reference.book,
      chapter: v.reference.chapter,
      verse: String(v.reference.verse),
      full_reference: v.reference.full_reference,
    },
    modernVersion: tr.version,
    modernText: tr.text,
    meditation: dev.meditation,
    actionStep: dev.action_step,
    prayer,
  };
}

function parseUpstream(raw: string, lang: LanguageCode): FullDailyVerse[] {
  const data = JSON.parse(raw) as UpstreamFile;
  const out: FullDailyVerse[] = [];
  for (const v of data.verses || []) {
    const slim_ = slim(v, lang);
    if (slim_) out.push(slim_);
  }
  // Stable order: day asc, morning before evening. Lookups by (day, segment)
  // never need to scan more than ~120 entries even at 60-day coverage, so a
  // linear find is fine — no need for a Map.
  out.sort((a, b) => a.day - b.day || (a.segment === 'morning' ? -1 : 1));
  return out;
}

export async function getCachedDailyVerses(lang: LanguageCode): Promise<FullDailyVerse[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(lang));
    if (!raw) return null;
    return JSON.parse(raw) as FullDailyVerse[];
  } catch {
    return null;
  }
}

// Attested GET against the Worker, refreshing the session token once on a
// 401 (the Worker rotated its signing secret, or the cached token aged
// out). Mirrors featuredPlansService.authedFetch — daily verses now live
// behind the same device-attestation gate as plans.
async function authedFetch(url: string): Promise<Response> {
  const token = await getSessionToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 401) return res;
  await invalidateSessionToken();
  const fresh = await getSessionToken();
  return fetch(url, { headers: { Authorization: `Bearer ${fresh}` } });
}

// One-shot fetch: pulls the per-language file (attested), slims it, caches
// it. Throws on network/auth/parse error so the caller can decide whether
// to retry. The bundled fallback covers the offline + not-yet-attested
// cases, so failures here are non-fatal.
export async function fetchAndCacheDailyVerses(lang: LanguageCode): Promise<FullDailyVerse[]> {
  const url = dailyVersesUrl(lang);
  const res = await authedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  const parsed = parseUpstream(text, lang);
  await AsyncStorage.setItem(cacheKey(lang), JSON.stringify(parsed)).catch(() => {});
  return parsed;
}

export function getBundledDailyVerses(lang: LanguageCode): FullDailyVerse[] {
  return BUNDLED_DAILY_VERSES[lang] || BUNDLED_DAILY_VERSES.en;
}
