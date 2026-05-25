import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'react-native';
import { loadSummary, PlanSummary, SummaryFile, loadFullPlan, FullPlan } from '../services/plansService';
import { PLAN_COVER_CDN_BASE, PLAN_SECTIONS, PlanSectionId } from '../constants/plansApi';
// Plans are fetched in the UI language, NOT the Bible-reading language.
// (User can read the UI in Português while studying the KJV Bible — the plans
// catalog still arrives in Portuguese to match the surrounding chrome.)
// `TranslationsContext` is intentionally NOT consulted here.
import { useUILanguage } from './UILanguageContext';
import { featuredForWeek } from '../utils/featuredForWeek';
import { usePlanProfile } from './PlanProfileContext';

interface PlansState {
  loading: boolean;
  error: string | null;
  summary: SummaryFile | null;
  // Convenience views
  plansBySection: Record<PlanSectionId, PlanSummary[]>;
  featured: PlanSummary[];
  getPlanBySlug: (slug: string) => PlanSummary | null;
  // Reload the summary from network (e.g. pull-to-refresh, lang change).
  refresh: () => Promise<void>;
  // Lazy: fetch a full plan (with days[]) when the user enters a detail page.
  loadFull: (slug: string) => Promise<FullPlan>;
}

const PlansContext = createContext<PlansState | null>(null);

const EMPTY_SECTIONS: Record<PlanSectionId, PlanSummary[]> = {
  'emotions': [],
  'walking-with-god': [],
  'personal-growth': [],
  'roles-identity': [],
  'life-seasons': [],
};

export function PlansProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useUILanguage();
  const { profile, signals } = usePlanProfile();

  const [summary, setSummary] = useState<SummaryFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid re-entrant loads for the same lang. If the user spam-switches
  // languages, we only honour the latest one's response.
  const seqRef = useRef(0);

  const load = useCallback(async (l: string, opts: { force?: boolean } = {}) => {
    const mySeq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await loadSummary(l, {
        ...opts,
        // Stale-while-revalidate hook: if the background refresh fetched
        // a newer summary (different `generated_at`), swap it into state
        // as long as the user hasn't since switched language. Without
        // this, republished content wouldn't surface until cold restart.
        onBackgroundRefresh: (fresh) => {
          if (seqRef.current !== mySeq) return;
          setSummary(fresh);
        },
      });
      if (seqRef.current !== mySeq) return;
      setSummary(data);
    } catch (e: any) {
      if (seqRef.current !== mySeq) return;
      setError(String(e?.message || e));
    } finally {
      if (seqRef.current === mySeq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(lang);
  }, [lang, load]);

  const plansBySection = useMemo<Record<PlanSectionId, PlanSummary[]>>(() => {
    if (!summary?.plans) return EMPTY_SECTIONS;
    const out: Record<PlanSectionId, PlanSummary[]> = { ...EMPTY_SECTIONS };
    for (const s of PLAN_SECTIONS) out[s] = [];
    for (const p of summary.plans) {
      if (out[p.section]) out[p.section].push(p);
    }
    return out;
  }, [summary]);

  const featured = useMemo<PlanSummary[]>(() => {
    if (!summary?.plans?.length) return [];
    return featuredForWeek(summary.plans, undefined, profile, signals);
  }, [summary, profile, signals]);

  const bySlug = useMemo(() => {
    const m = new Map<string, PlanSummary>();
    if (summary?.plans) for (const p of summary.plans) m.set(p.slug, p);
    return m;
  }, [summary]);

  // Warm the native Image cache for every cover the user is likely to see
  // on first paint of the Plan tab: the 5 featured carousel cards + the
  // first 4 cards of each section (≈ above-the-fold of each row before
  // horizontal scroll). Without this prefetch, `<Image source={{ uri }}>`
  // inside `PlanCover` only starts the HTTP request on layout — so the
  // moment the user lands on the Plan tab, 20+ requests compete in parallel
  // and the placeholders (gradient + book icon) stay visible for several
  // seconds. Prefetching here, gated on `summary` (the source of slugs),
  // means the requests fly in the background while the user is still on
  // PrayerScreen / PrayerFlow. `Image.prefetch` is fire-and-forget and
  // de-duplicates against the native HTTP cache, so re-running on a
  // summary refresh is harmless.
  useEffect(() => {
    if (!summary?.plans?.length) return;
    const slugs = new Set<string>();
    for (const p of featured) slugs.add(p.slug);
    for (const s of PLAN_SECTIONS) {
      const rows = plansBySection[s];
      for (let i = 0; i < Math.min(4, rows.length); i++) slugs.add(rows[i].slug);
    }
    for (const slug of slugs) {
      Image.prefetch(`${PLAN_COVER_CDN_BASE}/${slug}.webp`).catch(() => {});
    }
  }, [summary, featured, plansBySection]);

  const value = useMemo<PlansState>(() => ({
    loading,
    error,
    summary,
    plansBySection,
    featured,
    getPlanBySlug: (slug) => bySlug.get(slug) || null,
    refresh: () => load(lang, { force: true }),
    loadFull: (slug) => loadFullPlan(lang, slug),
  }), [loading, error, summary, plansBySection, featured, bySlug, lang, load]);

  return <PlansContext.Provider value={value}>{children}</PlansContext.Provider>;
}

export function usePlans() {
  const ctx = useContext(PlansContext);
  if (!ctx) throw new Error('usePlans must be used inside PlansProvider');
  return ctx;
}
