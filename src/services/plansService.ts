import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PLANS_API_BASE,
  plansSummaryKey,
  plansFullKey,
  PlanSectionId,
} from '../constants/plansApi';
import { getSessionToken, invalidateSessionToken } from './attestService';

// ---------- Shape of the remote data ----------

export interface KeyVerse {
  display: string;
  book_code?: string;
  chapter?: number;
  verses?: string | number | number[];
}

export interface DayOutline {
  day: number;
  title: string;
  subtitle?: string | null;
  estimated_minutes?: number | null;
  scripture_ref?: string | null;
  scripture_refs?: string[];   // SUMMARY_VERSION 1.1.0+ — multi-ref days
}

export interface PlanCover {
  color_primary: string;
  color_secondary: string;
  icon?: string | null;
  image_key?: string | null;
  image_url?: string | null;
}

export interface PlanSummary {
  id: string;
  slug: string;
  section: PlanSectionId;
  section_label: string;
  secondary: string | null;
  secondary_label: string | null;
  title: string;
  subtitle?: string;
  duration_days: number;
  estimated_minutes_per_day?: number;
  tags: string[];
  audience: {
    life_stage: string[];
    emotional_state: string[];
    spiritual_stage: string[];
  };
  goal?: string;
  cover: PlanCover;
  key_verses: KeyVerse[];
  day_outlines: DayOutline[];
  version: string;
  last_updated?: string | null;
}

export interface SummaryFile {
  schema_version: string;
  summary_version: string;
  generated_at: string;
  lang: string;
  plan_count: number;
  plans: PlanSummary[];
}

// Full plan = summary + days. We don't tightly type `days[]` here because
// the inner sections vary by flow_template and the renderer handles each
// `type` lookalike (`scripture_focus`, `teaching`, `reflection`, …).
export interface FullPlan extends PlanSummary {
  days: any[];
  hook?: { heading?: string; paragraphs?: string[] };
  flow_template?: string;
  scripture_translation?: string;
}

export interface LoadSummaryOpts {
  force?: boolean;
  // Stale-while-revalidate hook. When set, `loadSummary` returns cached
  // immediately and fires the background refresh; the callback receives
  // the fresh data once the network returns. The caller is responsible
  // for ignoring stale callbacks (e.g. via a seq counter).
  onBackgroundRefresh?: (fresh: SummaryFile) => void;
}

// ---------- Helpers ----------

async function authedFetch(path: string): Promise<Response> {
  const token = await getSessionToken();
  const res = await fetch(`${PLANS_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // 401 → token may be stale (worker rotated secret, etc.). Refresh once.
  if (res.status === 401) {
    await invalidateSessionToken();
    const fresh = await getSessionToken();
    return fetch(`${PLANS_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${fresh}` },
    });
  }
  return res;
}

// ---------- Summary (small, all 113 cards for the lang) ----------

export async function loadSummary(lang: string, opts: LoadSummaryOpts = {}): Promise<SummaryFile> {
  const key = plansSummaryKey(lang);
  if (!opts.force) {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as SummaryFile;
        // Kick off a non-blocking refresh in the background so the next
        // open is fresh; if a hook is registered, also notify the caller.
        refreshSummary(lang)
          .then(fresh => {
            if (opts.onBackgroundRefresh && fresh.generated_at !== parsed.generated_at) {
              opts.onBackgroundRefresh(fresh);
            }
          })
          .catch(() => {});
        return parsed;
      } catch {
        // fall through to network
      }
    }
  }
  return refreshSummary(lang);
}

async function refreshSummary(lang: string): Promise<SummaryFile> {
  const res = await authedFetch(`/v1/summaries/${lang}.json`);
  if (!res.ok) throw new Error(`summary ${lang}: HTTP ${res.status}`);
  // Worker wraps decrypted content as a JSON string inside another JSON envelope.
  // The Worker's `serveDecrypted` does `jsonResponse(plaintext)` where plaintext
  // is the JSON string of the summary file — so res.json() returns a string we
  // need to parse a second time. We try both shapes for forward compat.
  const raw = await res.text();
  let parsed: SummaryFile;
  try {
    const first = JSON.parse(raw);
    parsed = (typeof first === 'string' ? JSON.parse(first) : first) as SummaryFile;
  } catch {
    throw new Error(`summary ${lang}: parse failed`);
  }
  try { await AsyncStorage.setItem(plansSummaryKey(lang), JSON.stringify(parsed)); } catch {}
  return parsed;
}

// ---------- Full plan (lazy, fetched on demand when the user opens a plan) ----------

export async function loadFullPlan(lang: string, slug: string): Promise<FullPlan> {
  const key = plansFullKey(lang, slug);
  const cached = await AsyncStorage.getItem(key);
  if (cached) {
    try { return JSON.parse(cached) as FullPlan; } catch {}
  }
  const res = await authedFetch(`/v1/plans/${lang}/${slug}.json`);
  if (!res.ok) throw new Error(`plan ${lang}/${slug}: HTTP ${res.status}`);
  const raw = await res.text();
  let parsed: any;
  try {
    const first = JSON.parse(raw);
    parsed = typeof first === 'string' ? JSON.parse(first) : first;
  } catch {
    throw new Error(`plan ${lang}/${slug}: parse failed`);
  }
  // Server returns the unmodified source file: { plan: {…}, days: […] }.
  // Flatten plan.* up to the top level for the renderer.
  const full: FullPlan = { ...(parsed.plan || {}), days: parsed.days || [] };
  try { await AsyncStorage.setItem(key, JSON.stringify(full)); } catch {}
  return full;
}
