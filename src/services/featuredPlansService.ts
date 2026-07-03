import AsyncStorage from '@react-native-async-storage/async-storage';
import { PLANS_API_BASE, PLANS_SUMMARY_VERSION } from '../constants/plansApi';
import { cfAccessHeaders } from '../constants/cfAccess';
import { getSessionToken, invalidateSessionToken } from './attestService';
import type { LanguageCode } from '../state/TranslationsContext';

// Cache keys are scoped by the Worker's summary-schema version so a
// schema bump on the server side auto-invalidates every device's cache.
// (The legacy jsdelivr corpus is no longer used — its slug naming
// didn't line up with the bundled summary and every fetch 404'd.)
const cacheKey = (lang: LanguageCode, slug: string) =>
  `featured-plans:${PLANS_SUMMARY_VERSION}:${lang}:${slug}`;

// Slim TS types matching what PlanDayWalk reads.
// Anything unused (audience, tags, version, etc.) is dropped at parse time.
export interface PlanVerseRef {
  display: string;       // "Philippians 4:6-8"
  bookCode: string;      // "PHP"
  chapter: number;       // 4
  verses: string;        // "6-8" or "1"
  translation: string;   // "KJV"
  text: string;
}

export type PlanSection =
  | { type: 'scripture_focus'; heading: string; verse: PlanVerseRef }
  | { type: 'teaching';        heading: string; paragraphs: string[] }
  | { type: 'prayer';          heading: string; body: string }
  | { type: 'verse_wall';      heading: string; verses: PlanVerseRef[] };

interface PlanDay {
  day: number;
  title: string;
  estimatedMinutes: number;
  sections: PlanSection[];
}

export interface FullPlan {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  goal: string;
  duration: number;
  minutes: number;
  colorPrimary: string;
  colorSecondary: string;
  primary: string;
  primaryLabel: string;
  secondary: string;
  secondaryLabel: string;
  days: PlanDay[];
}

function slimVerse(v: any): PlanVerseRef {
  return {
    display: v.display,
    bookCode: v.book_code,
    chapter: v.chapter,
    verses: String(v.verses),
    translation: v.translation || 'KJV',
    text: v.text || '',
  };
}

function slimPlan(raw: any, fileSlug: string): FullPlan {
  const p = raw.plan;
  return {
    id: p.id,
    // Use the filename slug we fetched with — `plan.slug` inside the JSON
    // is just the topic id and doesn't match the file on CDN.
    slug: fileSlug,
    title: p.title,
    subtitle: p.subtitle || '',
    goal: p.goal || '',
    duration: p.duration_days,
    minutes: p.estimated_minutes_per_day,
    colorPrimary: p.cover?.color_primary || '#E63F69',
    colorSecondary: p.cover?.color_secondary || '#9D7FE0',
    primary: p.category.primary,
    primaryLabel: p.category.primary_label,
    secondary: p.category.secondary,
    secondaryLabel: p.category.secondary_label,
    days: (raw.days || []).map((d: any) => ({
      day: d.day,
      title: d.title,
      estimatedMinutes: d.estimated_minutes,
      sections: (d.sections || []).map((s: any) => {
        switch (s.type) {
          case 'scripture_focus':
            return { type: 'scripture_focus' as const, heading: s.heading, verse: slimVerse(s.verse) };
          case 'teaching':
            return { type: 'teaching' as const, heading: s.heading, paragraphs: s.paragraphs || [] };
          case 'prayer':
            return { type: 'prayer' as const, heading: s.heading, body: s.body || '' };
          case 'verse_wall':
            return { type: 'verse_wall' as const, heading: s.heading, verses: (s.verses || []).map(slimVerse) };
          default:
            return null;
        }
      }).filter(Boolean),
    })),
  };
}

export async function getCachedPlan(lang: LanguageCode, slug: string): Promise<FullPlan | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(lang, slug));
    if (!raw) return null;
    return JSON.parse(raw) as FullPlan;
  } catch {
    return null;
  }
}

// Hard ceiling on any single network leg (token mint OR plan GET). Without
// this, a stalled connection — common on flaky / high-latency networks
// reaching the CDN/Worker — leaves the detail screen's spinner turning forever
// and the Start button permanently disabled. With it, the promise rejects in
// bounded time so the caller can show a ret(r)yable error state instead.
const PLAN_NET_TIMEOUT_MS = 12_000;

// Reject a promise if it hasn't settled within `ms`. Used for the session-token
// mint, which has no AbortController of its own.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout: ${label} after ${ms}ms`)), ms);
    p.then(
      v => { clearTimeout(id); resolve(v); },
      e => { clearTimeout(id); reject(e); },
    );
  });
}

// fetch() with an AbortController-backed timeout so a stalled socket aborts
// instead of hanging indefinitely.
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(id);
  }
}

// Wraps a Worker GET with the session Bearer token, refreshing once on 401
// (Worker rotated its signing secret since the cached token was minted). Every
// leg is time-bounded (token mint + GET) so the whole call can't hang.
async function authedFetch(path: string): Promise<Response> {
  const token = await withTimeout(getSessionToken(), PLAN_NET_TIMEOUT_MS, 'session token');
  const res = await fetchWithTimeout(`${PLANS_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...cfAccessHeaders() },
  }, PLAN_NET_TIMEOUT_MS);
  if (res.status !== 401) return res;
  await invalidateSessionToken();
  const fresh = await withTimeout(getSessionToken(), PLAN_NET_TIMEOUT_MS, 'session token refresh');
  return fetchWithTimeout(`${PLANS_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${fresh}`, ...cfAccessHeaders() },
  }, PLAN_NET_TIMEOUT_MS);
}

async function fetchAndCachePlan(lang: LanguageCode, slug: string): Promise<FullPlan> {
  const path = `/v1/plans/${lang}/${slug}.json`;
  const res = await authedFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  // Worker's `serveDecrypted` returns the source JSON as a JSON-encoded
  // string inside another JSON envelope, so the first parse can land us
  // on a string. Try both shapes so future protocol tweaks don't break us.
  const txt = await res.text();
  let json: any;
  try {
    const first = JSON.parse(txt);
    json = typeof first === 'string' ? JSON.parse(first) : first;
  } catch {
    throw new Error(`plan ${lang}/${slug}: parse failed`);
  }
  const slim = slimPlan(json, slug);
  await AsyncStorage.setItem(cacheKey(lang, slug), JSON.stringify(slim)).catch(() => {});
  return slim;
}

// Cache-first: returns cached if present, else fetches + caches. Throws on
// network/parse error so the caller can fall back gracefully.
export async function getPlan(lang: LanguageCode, slug: string): Promise<FullPlan> {
  const cached = await getCachedPlan(lang, slug);
  if (cached) return cached;
  return fetchAndCachePlan(lang, slug);
}
