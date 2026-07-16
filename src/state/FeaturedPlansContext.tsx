import React, { createContext, useContext, useMemo, useState, useCallback, useRef } from 'react';
import { FEATURED_PLANS_SUMMARY, type PlanSummary } from '../constants/featuredPlansSummary';
import { getPlan as getFullPlan, getCachedPlan, type FullPlan } from '../services/featuredPlansService';
import { useUILanguage } from './UILanguageContext';
import type { LanguageCode } from './TranslationsContext';

interface State {
  // Bundled summary of all 54 plans for the active language. Synchronous —
  // PlanScreen and FeaturedPlanDetail can read it without any await.
  summary: PlanSummary[];
  // Plans whose full body has been fetched + cached this session, keyed by
  // slug. Lets PlanDayWalk consume them synchronously after the first
  // await on tap.
  loadedPlans: Record<string, FullPlan>;
  // Async lazy-fetch of a full plan's body. Cache-first.
  loadPlan: (slug: string) => Promise<FullPlan>;
  // Sync read of the summary entry (instant, never throws).
  getSummary: (slug: string) => PlanSummary | null;
}

const Ctx = createContext<State | null>(null);

export function FeaturedPlansProvider({ children }: { children: React.ReactNode }) {
  // Plans follow the UI LANGUAGE, not the active Bible translation. Earlier
  // this was wired to `useTranslation().current.code` which conflated the
  // two — a user with UI in zh-Hans but Bible set to KJV (en) saw English
  // plan titles + descriptions while the rest of the chrome was in Chinese.
  // The CDN serves all 7 languages of plan content at
  // `/v1/plans/<lang>/<slug>.json`, and the bundled summary keys are
  // language codes, so swapping to UILanguageContext fixes both the
  // summary lookup AND the CDN fetch path in one go.
  const { lang } = useUILanguage();
  const langKey = lang as LanguageCode;
  const [loaded, setLoaded] = useState<Record<string, FullPlan>>({});

  const summary = useMemo<PlanSummary[]>(
    () => (FEATURED_PLANS_SUMMARY[langKey] as PlanSummary[]) || (FEATURED_PLANS_SUMMARY.en as PlanSummary[]) || [],
    [langKey],
  );

  // `loaded` is read through a ref, NOT listed as a dep. With it in the deps,
  // every successful load minted a new loadPlan identity → new context value →
  // every consumer re-rendered and every effect listing loadPlan re-ran
  // (FeaturedPlanDetail, PlanDayWalk, PrefetchManager). Today they're saved only
  // by their own `if (plan) return` early-outs and PlanScreen's prefetchedRef —
  // i.e. it doesn't loop by luck, not by design. Keeping the identity stable
  // removes the loaded gun.
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  const loadPlan = useCallback(async (slug: string): Promise<FullPlan> => {
    const already = loadedRef.current[slug];
    if (already) return already;
    // Try the on-disk cache before hitting the network — useful even on
    // first session if a previous session cached this plan.
    const cached = await getCachedPlan(langKey, slug);
    if (cached) {
      setLoaded(s => ({ ...s, [slug]: cached }));
      return cached;
    }
    const fresh = await getFullPlan(langKey, slug);
    setLoaded(s => ({ ...s, [slug]: fresh }));
    return fresh;
  }, [langKey]);

  const getSummary = useCallback(
    (slug: string) => summary.find(s => s.slug === slug) || null,
    [summary],
  );

  // Reset session-cached full plans when the active language changes — the
  // user expects content to switch language immediately.
  React.useEffect(() => { setLoaded({}); }, [langKey]);

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
