import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { FEATURED_PLANS_SUMMARY, type PlanSummary } from '../constants/featuredPlansSummary';
import { getPlan as getFullPlan, getCachedPlan, type FullPlan } from '../services/featuredPlansService';
import { useTranslation } from './TranslationsContext';

interface State {
  // Bundled summary of all 54 plans for the active language. Synchronous —
  // PlanScreen and FeaturedPlanDetail can read it without any await.
  summary: PlanSummary[];
  // Plans whose full body has been fetched + cached this session, keyed by
  // slug. Lets PlanDayWalk / PlanDayVerses consume them synchronously after
  // the first await on tap.
  loadedPlans: Record<string, FullPlan>;
  // Async lazy-fetch of a full plan's body. Cache-first.
  loadPlan: (slug: string) => Promise<FullPlan>;
  // Sync read of the summary entry (instant, never throws).
  getSummary: (slug: string) => PlanSummary | null;
}

const Ctx = createContext<State | null>(null);

export function FeaturedPlansProvider({ children }: { children: React.ReactNode }) {
  const { current: translation } = useTranslation();
  const lang = translation.code;
  const [loaded, setLoaded] = useState<Record<string, FullPlan>>({});

  const summary = useMemo<PlanSummary[]>(
    () => (FEATURED_PLANS_SUMMARY[lang] as PlanSummary[]) || (FEATURED_PLANS_SUMMARY.en as PlanSummary[]) || [],
    [lang],
  );

  const loadPlan = useCallback(async (slug: string): Promise<FullPlan> => {
    if (loaded[slug]) return loaded[slug];
    // Try the on-disk cache before hitting the network — useful even on
    // first session if a previous session cached this plan.
    const cached = await getCachedPlan(lang, slug);
    if (cached) {
      setLoaded(s => ({ ...s, [slug]: cached }));
      return cached;
    }
    const fresh = await getFullPlan(lang, slug);
    setLoaded(s => ({ ...s, [slug]: fresh }));
    return fresh;
  }, [lang, loaded]);

  const getSummary = useCallback(
    (slug: string) => summary.find(s => s.slug === slug) || null,
    [summary],
  );

  // Reset session-cached full plans when the active language changes — the
  // user expects content to switch language immediately.
  React.useEffect(() => { setLoaded({}); }, [lang]);

  const value = useMemo<State>(() => ({
    summary, loadedPlans: loaded, loadPlan, getSummary,
  }), [summary, loaded, loadPlan, getSummary]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeaturedPlans() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFeaturedPlans must be used inside FeaturedPlansProvider');
  return ctx;
}
