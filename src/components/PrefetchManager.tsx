import React, { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useUILanguage } from '../state/UILanguageContext';
import { useDailyVerses } from '../state/DailyVersesContext';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { runAudioPrefetch, runSecondaryPrefetch } from '../services/startupPrefetch';

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

// WAVE A (audio) — short delay so narration starts DURING the splash screen, but
// still lets the critical first fetches (daily-verse data + backgrounds manifest)
// grab the radio first. Deliberately NOT behind runAfterInteractions (that would
// wait until the launch animation settles, i.e. past the splash).
const AUDIO_DEFER_MS = 400;
// WAVE B (secondary) — well past first render, so plan covers/details never
// compete with the launch frame, SDK init, or the audio warm-up.
const SECONDARY_DEFER_MS = 1200;

export default function PrefetchManager({ appReady }: { appReady: boolean }) {
  const { lang } = useUILanguage();
  const { todayDay } = useDailyVerses();
  const { summary, loadPlan } = useFeaturedPlans();
  const { loaded: backgroundsLoaded } = usePrayerBackgrounds();

  // ── WAVE A: today's prayer narration — as early as the splash screen ───────
  // Gated ONLY on today's verse + language (available very early), NOT on
  // appReady / backgroundsLoaded, so the audio the user is most likely to tap
  // first is already downloading behind the loading overlay. Downloads are
  // native + sequential (one clip at a time), so this never janks launch.
  const audioDone = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!todayDay || !lang) return;
    const key = `${lang}:${todayDay}`;
    if (audioDone.current.has(key)) return;
    audioDone.current.add(key);

    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) void runAudioPrefetch({ todayDay, uiLang: lang });
    }, AUDIO_DEFER_MS);

    return () => { cancelled = true; clearTimeout(t); };
  }, [todayDay, lang]);

  // ── WAVE B: plan covers + detail bodies — deferred past first render ────────
  const secondaryDone = useRef<Set<string>>(new Set());
  const secondaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!appReady || !backgroundsLoaded) return;   // wait for first frame + phases 1-2 underway
    if (summary.length === 0) return;              // bundled summary not ready
    if (secondaryDone.current.has(lang)) return;
    secondaryDone.current.add(lang);

    let cancelled = false;
    const featuredSlugs = summary.slice(0, FEATURED_COUNT).map((p) => p.slug);

    const handle = InteractionManager.runAfterInteractions(() => {
      secondaryTimer.current = setTimeout(() => {
        if (cancelled) return;
        void runSecondaryPrefetch({ featuredSlugs, loadPlan });
      }, SECONDARY_DEFER_MS);
    });

    return () => {
      cancelled = true;
      handle.cancel?.();
      if (secondaryTimer.current) clearTimeout(secondaryTimer.current);
    };
  }, [appReady, backgroundsLoaded, summary, lang, loadPlan]);

  return null;
}
