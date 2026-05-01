import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUNDLED_DAILY_VERSES, type DailyVerse } from '../constants/dailyVersesBundled';
import { DAILY_VERSES_COMMIT, dailyVersesUrl } from '../constants/dailyVersesCdn';
import type { LanguageCode } from '../state/TranslationsContext';

// Cache keys are scoped by the pinned commit so a content republish
// (bumping DAILY_VERSES_COMMIT) auto-invalidates every device's cache.
const CACHE_TAG = DAILY_VERSES_COMMIT.slice(0, 8);
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

// One-shot fetch: pulls the per-language file, slims it, caches it. Throws
// on network or parse error so the caller can decide whether to retry. The
// bundled fallback covers the offline case, so failures here are non-fatal.
export async function fetchAndCacheDailyVerses(lang: LanguageCode): Promise<FullDailyVerse[]> {
  const url = dailyVersesUrl(lang);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  const parsed = parseUpstream(text, lang);
  await AsyncStorage.setItem(cacheKey(lang), JSON.stringify(parsed)).catch(() => {});
  return parsed;
}

export function getBundledDailyVerses(lang: LanguageCode): FullDailyVerse[] {
  return BUNDLED_DAILY_VERSES[lang] || BUNDLED_DAILY_VERSES.en;
}
