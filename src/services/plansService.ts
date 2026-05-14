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
  // 1.1.0: list of every verse reference for the day, in section order,
  // de-duped. The legacy scalar `scripture_ref` is the first entry of
  // `scripture_refs` and stays populated for older clients reading newer
  // summaries (and vice versa).
  scripture_refs?: string[];
  scripture_ref?: string | null;
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

interface LoadSummaryOpts {
  force?: boolean;
  // Called when the background revalidation completes with newer content
  // than what we returned from cache. Lets PlansContext update React state
  // mid-session instead of forcing a cold restart for the user to see a
  // republished summary.
  onBackgroundRefresh?: (fresh: SummaryFile) => void;
}

export async function loadSummary(lang: string, opts: LoadSummaryOpts = {}): Promise<SummaryFile> {
  const key = plansSummaryKey(lang);
  if (!opts.force) {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as SummaryFile;
        // Stale-while-revalidate: hand the cached copy back immediately,
        // refresh in the background, and only notify the caller if the
        // refreshed copy is actually newer (different `generated_at`).
        // `summary_version` mismatch already invalidates the AsyncStorage
        // key via PLANS_SUMMARY_VERSION, so we don't need to compare it.
        refreshSummary(lang)
          .then((fresh) => {
            if (fresh.generated_at !== parsed.generated_at) opts.onBackgroundRefresh?.(fresh);
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
  } catch (e) {
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
