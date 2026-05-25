// User survey state (life stage / spiritual stage / emotional state) +
// passive behavior signals (taps, starts, completes). Consumed by
// `featuredForWeek()` to bias the featured carousel toward plans that
// match the user's stated situation and away from plans they've already
// completed.
//
// Storage keys are pinned in constants/plansApi.ts so a schema bump
// auto-invalidates every device's cache. Nothing here is sensitive —
// the survey answers stay on-device; only the resulting featured slate
// shape is observable.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { planProfileKey, planBehaviorKey } from '../constants/plansApi';
import type { PlanProfile, BehavioralSignal } from '../utils/featuredForWeek';

interface PlanProfileState {
  profile: PlanProfile;
  signals: BehavioralSignal;
  // Survey actions
  setLifeStage: (id: string | null) => void;
  setSpiritualStage: (id: string | null) => void;
  setEmotionalState: (ids: string[]) => void;
  // Telemetry
  trackTap: (slug: string) => void;
  trackStart: (slug: string) => void;
  trackComplete: (slug: string) => void;
  // Lifecycle
  ready: boolean;          // true once both keys have been hydrated from storage
}

const EMPTY_PROFILE: PlanProfile = {
  life_stage: null,
  spiritual_stage: null,
  emotional_state: [],
};
const EMPTY_SIGNALS: BehavioralSignal = { taps: {}, starts: {}, completes: {} };

const Ctx = createContext<PlanProfileState | null>(null);

export function PlanProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<PlanProfile>(EMPTY_PROFILE);
  const [signals, setSignals] = useState<BehavioralSignal>(EMPTY_SIGNALS);
  const [ready, setReady] = useState(false);

  // Hydrate once on mount. Both records are tiny (< 1 KB), so we keep them
  // as a single JSON blob each rather than fanning out per field.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, s] = await Promise.all([
          AsyncStorage.getItem(planProfileKey()),
          AsyncStorage.getItem(planBehaviorKey()),
        ]);
        if (!alive) return;
        if (p) {
          try { setProfile({ ...EMPTY_PROFILE, ...(JSON.parse(p) as PlanProfile) }); } catch {}
        }
        if (s) {
          try { setSignals({ ...EMPTY_SIGNALS, ...(JSON.parse(s) as BehavioralSignal) }); } catch {}
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Persistence — write-through on every change. `ready` gate avoids
  // overwriting good on-disk data with the EMPTY_* defaults during the
  // brief window before hydration.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(planProfileKey(), JSON.stringify(profile)).catch(() => {});
  }, [ready, profile]);
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(planBehaviorKey(), JSON.stringify(signals)).catch(() => {});
  }, [ready, signals]);

  const setLifeStage = useCallback((id: string | null) => {
    setProfile(p => ({ ...p, life_stage: id }));
  }, []);
  const setSpiritualStage = useCallback((id: string | null) => {
    setProfile(p => ({ ...p, spiritual_stage: id }));
  }, []);
  const setEmotionalState = useCallback((ids: string[]) => {
    setProfile(p => ({ ...p, emotional_state: ids }));
  }, []);

  const bump = useCallback((field: 'taps' | 'starts' | 'completes', slug: string) => {
    setSignals(s => {
      const m = { ...(s[field] || {}) };
      // `completes` is a 0/1 flag (don't double-count if user replays a plan);
      // `taps` and `starts` are real counters used by the soft-scoring math.
      m[slug] = field === 'completes' ? 1 : ((m[slug] || 0) + 1);
      return { ...s, [field]: m };
    });
  }, []);

  const trackTap = useCallback((slug: string) => bump('taps', slug), [bump]);
  const trackStart = useCallback((slug: string) => bump('starts', slug), [bump]);
  const trackComplete = useCallback((slug: string) => bump('completes', slug), [bump]);

  const value = useMemo<PlanProfileState>(() => ({
    profile,
    signals,
    setLifeStage,
    setSpiritualStage,
    setEmotionalState,
    trackTap,
    trackStart,
    trackComplete,
    ready,
  }), [profile, signals, setLifeStage, setSpiritualStage, setEmotionalState, trackTap, trackStart, trackComplete, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanProfile() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanProfile must be used inside PlanProfileProvider');
  return ctx;
}

// Life-stage options exposed so the survey screen doesn't fork the
// vocabulary. Keys match the LIFE_STAGE_MAP in featuredForWeek.ts.
export const LIFE_STAGE_OPTIONS: { id: string; labelKey: string }[] = [
  { id: 'single',       labelKey: 'planProfile.lifeStage.single' },
  { id: 'dating',       labelKey: 'planProfile.lifeStage.dating' },
  { id: 'married',      labelKey: 'planProfile.lifeStage.married' },
  { id: 'mother',       labelKey: 'planProfile.lifeStage.mother' },
  { id: 'empty-nester', labelKey: 'planProfile.lifeStage.emptyNester' },
];

export const SPIRITUAL_STAGE_OPTIONS: { id: string; labelKey: string }[] = [
  { id: 'exploring',    labelKey: 'planProfile.spiritualStage.exploring' },
  { id: 'new-believer', labelKey: 'planProfile.spiritualStage.newBeliever' },
  { id: 'growing',      labelKey: 'planProfile.spiritualStage.growing' },
  { id: 'mature',       labelKey: 'planProfile.spiritualStage.mature' },
];

export const EMOTIONAL_STATE_OPTIONS: { id: string; labelKey: string }[] = [
  { id: 'anxious',  labelKey: 'planProfile.emotion.anxious' },
  { id: 'joyful',   labelKey: 'planProfile.emotion.joyful' },
  { id: 'lonely',   labelKey: 'planProfile.emotion.lonely' },
  { id: 'grateful', labelKey: 'planProfile.emotion.grateful' },
  { id: 'grieving', labelKey: 'planProfile.emotion.grieving' },
  { id: 'hopeful',  labelKey: 'planProfile.emotion.hopeful' },
  { id: 'tired',    labelKey: 'planProfile.emotion.tired' },
];
