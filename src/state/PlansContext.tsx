import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadSummary, PlanSummary, SummaryFile, loadFullPlan, FullPlan } from '../services/plansService';
import { PLAN_SECTIONS, PlanSectionId } from '../constants/plansApi';
import { useTranslation } from './TranslationsContext';
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
  const { current } = useTranslation();
  const lang = current.code;
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
      const data = await loadSummary(l, opts);
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
