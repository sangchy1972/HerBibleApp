import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUNDLED_DAILY_VERSES, type DailyVerse } from '../constants/dailyVersesBundled';
import { DAILY_VERSES_VERSION, dailyVersesUrl, holidayVersesUrl } from '../constants/dailyVersesCdn';
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
  /** fr/de only: local numbering where Segond/Luther count long psalm titles
   *  as verse 1 (5 entries per batch 2 delivery). */
  verse_local?: string;
  translations: Record<string, {
    traditional?: { version: string; text: string };
    modern?: { version: string; text: string };
  }>;
  exegesis?: { context_note?: string };
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
  const trs = v.translations?.[lang];
  const dev = v.devotional?.[lang];
  const prayer = v.prayer?.[lang];
  if (!trs || !dev || !prayer) return null;
  // Batch 2+: the modern edition (NIV/CCB/…) is in copyright and ships with
  // an EMPTY text until a licensed source backfills it. Prefer modern when it
  // actually has text; otherwise fall back to the public-domain traditional
  // (KJV / 和合本 1919 / Luther 1912 / …) — byte-identical to what she reads
  // when she opens the full chapter. Backfill is per-entry: the moment a
  // licensed modern text lands in the CDN file, this picks it up with no
  // client change. An entry with NO usable text drops entirely (the old code
  // accepted an empty modern and rendered a blank verse page — swarm-free
  // catch during batch-2 integration, 2026-08-30).
  const chosen = trs.modern?.text?.trim() ? trs.modern : trs.traditional;
  if (!chosen?.text?.trim()) return null;
  return {
    day: v.day,
    segment: v.segment,
    reference: {
      book: v.reference.book,
      chapter: v.reference.chapter,
      verse: String(v.reference.verse),
      full_reference: v.reference.full_reference,
    },
    ...(v.verse_local ? { verseLocal: v.verse_local } : {}),
    modernVersion: chosen.version,
    modernText: chosen.text,
    ...(v.exegesis?.context_note ? { contextNote: v.exegesis.context_note } : {}),
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

// The ONE reference string to show and navigate with for this verse under
// the active Bible translation. Segond 1910 / Luther 1912 count long psalm
// titles as verse 1, so five psalm entries carry a shifted local number in
// `verseLocal` — and every surface (home hero, prayer flow, the saved-verses
// key, the read-full-chapter jump, the past-verses list) must derive from
// THIS same string, or hearts desync across screens and jumps land one verse
// off (swarm F2, 2026-08-30). English book name + local numbering — feed it
// to localizeReference for display and parseReference for navigation.
export function displayRefFor(
  v: Pick<FullDailyVerse, 'verseLocal' | 'reference'>,
  translationCode: string,
): string {
  return v.verseLocal && (translationCode === 'fr' || translationCode === 'de')
    ? v.verseLocal
    : v.reference.full_reference;
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

// One-shot fetch: pulls the per-language file (public, R2-direct), slims it,
// caches it. Throws on network/parse error so the caller can decide whether to
// retry. The bundled fallback covers the offline case, so failures are
// non-fatal. No attestation: verses moved to the public covers path (same as
// holiday verses) because the attested Worker had no /v1/verses/ route.
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

// ── Holiday daily-verse overrides ──────────────────────────────────────────
// Same per-verse shape as the regular file (so `slim` is reused) plus a
// special_occasion.holiday_id that keys the lookup. Served public + R2-direct
// (no attestation) — see dailyVersesCdn.holidayVersesUrl.

export interface HolidayVerse extends FullDailyVerse {
  holidayId: string;
}

const holidayCacheKey = (lang: LanguageCode) => `holiday-verses:${CACHE_TAG}:${lang}`;

function slimHoliday(v: UpstreamVerse & { special_occasion?: { holiday_id?: string } }, lang: LanguageCode): HolidayVerse | null {
  const base = slim(v, lang);
  const holidayId = v.special_occasion?.holiday_id;
  if (!base || !holidayId) return null;
  return { ...base, holidayId };
}

export async function getCachedHolidayVerses(lang: LanguageCode): Promise<HolidayVerse[] | null> {
  try {
    const raw = await AsyncStorage.getItem(holidayCacheKey(lang));
    if (!raw) return null;
    return JSON.parse(raw) as HolidayVerse[];
  } catch {
    return null;
  }
}

// Plain public fetch (no authedFetch) — holiday files live on the public
// covers domain, not behind the attested verses Worker. Throws on
// network/parse error; the caller treats failure as "no holiday override".
export async function fetchAndCacheHolidayVerses(lang: LanguageCode): Promise<HolidayVerse[]> {
  const url = holidayVersesUrl(lang);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = JSON.parse(await res.text()) as { verses?: (UpstreamVerse & { special_occasion?: { holiday_id?: string } })[] };
  const out: HolidayVerse[] = [];
  for (const v of data.verses || []) {
    const s = slimHoliday(v, lang);
    if (s) out.push(s);
  }
  await AsyncStorage.setItem(holidayCacheKey(lang), JSON.stringify(out)).catch(() => {});
  return out;
}
