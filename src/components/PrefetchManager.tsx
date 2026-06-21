import React, { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useUILanguage } from '../state/UILanguageContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { runStartupPrefetch } from '../services/startupPrefetch';

// Quietly warms the content the user is bound to reach soon (prayer-flow
// narration + timestamps, plan covers + detail bodies) so slow-network users
// don't land on blank cards / a greyed-out Listen button. Null render — pure
// side-effect, mounted once inside the provider tree.
//
// Scheduling is deliberately conservative so it can NEVER cause an ANR / crash
// on a low-end device:
//   • Gated on `appReady` (navigator finished its first render) AND
//     PrayerBackgrounds being hydrated — i.e. phases 1-2 (verse-card image +
//     prayer music, owned by PrayerBackgroundsContext) are already underway,
//     so we layer phases 3-4 on top in order rather than all at once.
//   • Then handed to InteractionManager.runAfterInteractions + a short delay,
//     so it starts only after the launch animations settle and after the
//     Firebase / AdMob init in App's effect has had room to run.
//   • runStartupPrefetch itself is sequential native I/O, fire-and-forget.

// How many Explore "Featured" plans to pre-warm (covers + detail bodies).
// Mirrors PlanScreen's `summary.slice(0, 5)` carousel, +1 of headroom. Kept
// small on purpose — pulling all ~113 covers at launch would be wasteful.
const FEATURED_COUNT = 6;

// Delay after interactions settle before the first network call. Gives the
// launch frame + nav transition + SDK init a clear runway.
const DEFER_MS = 1200;

export default function PrefetchManager({ appReady }: { appReady: boolean }) {
  const { lang } = useUILanguage();
  const { todayDay } = useDailyVerses();
  const { summary, loadPlan } = useFeaturedPlans();
  const { loaded: backgroundsLoaded } = usePrayerBackgrounds();

  // Run once per language per cold start (idempotent anyway — every download
  // is cache-checked — but this avoids re-scheduling on unrelated re-renders).
  const doneLangs = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!appReady || !backgroundsLoaded) return;   // wait for first frame + phases 1-2 underway
    if (summary.length === 0) return;              // bundled summary not ready
    if (doneLangs.current.has(lang)) return;
    doneLangs.current.add(lang);

    let cancelled = false;
    const featuredSlugs = summary.slice(0, FEATURED_COUNT).map((p) => p.slug);

    const handle = InteractionManager.runAfterInteractions(() => {
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        // Fire-and-forget; runStartupPrefetch never throws.
        void runStartupPrefetch({ todayDay, uiLang: lang, featuredSlugs, loadPlan });
      }, DEFER_MS);
    });

    return () => {
      cancelled = true;
      handle.cancel?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [appReady, backgroundsLoaded, summary, lang, todayDay, loadPlan]);

  return null;
}
