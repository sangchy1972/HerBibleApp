import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { planProfileKey, planBehaviorKey } from '../constants/plansApi';
import type { PlanProfile, BehavioralSignal } from '../utils/featuredForWeek';

// 3 questions the user answers on first visit to the Plan tab. All optional.
// Feeds the v1.5 personalised featured algorithm.

export const LIFE_STAGE_OPTIONS = [
  { id: 'single',        label: 'Single' },
  { id: 'dating',        label: 'Dating' },
  { id: 'married',       label: 'Married' },
  { id: 'mother',        label: 'Mother' },
  { id: 'empty-nester',  label: 'Empty Nester' },
] as const;

export const SPIRITUAL_STAGE_OPTIONS = [
  { id: 'exploring',    label: 'Just exploring' },
  { id: 'new-believer', label: 'New believer' },
  { id: 'growing',      label: 'Growing' },
  { id: 'mature',       label: 'Mature' },
] as const;

export const EMOTIONAL_STATE_OPTIONS = [
  { id: 'anxious',    label: 'Anxious' },
  { id: 'joyful',     label: 'Joyful' },
  { id: 'lonely',     label: 'Lonely' },
  { id: 'grateful',   label: 'Grateful' },
  { id: 'grieving',   label: 'Grieving' },
  { id: 'hopeful',    label: 'Hopeful' },
  { id: 'tired',      label: 'Tired' },
] as const;

interface PlanProfileState {
  ready: boolean;            // false while we're reading AsyncStorage
  profile: PlanProfile | null;
  hasProfile: boolean;       // user has either filled or explicitly skipped
  saveProfile: (p: PlanProfile) => Promise<void>;
  skip: () => Promise<void>;
  // Behavioral tracking (feeds v1.5 recommendation).
  signals: BehavioralSignal;
  trackTap: (slug: string) => void;
  trackStart: (slug: string) => void;
  trackComplete: (slug: string) => void;
}

const Ctx = createContext<PlanProfileState | null>(null);

const EMPTY_SIGNALS: BehavioralSignal = { taps: {}, starts: {}, completes: {} };

// Stored shape: profile + skipped flag in one record so we can distinguish
// "never answered" from "deliberately skipped".
interface StoredProfile {
  profile: PlanProfile | null;
  skipped: boolean;
}

export function PlanProfileProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<StoredProfile>({ profile: null, skipped: false });
  const [signals, setSignals] = useState<BehavioralSignal>(EMPTY_SIGNALS);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          AsyncStorage.getItem(planProfileKey()),
          AsyncStorage.getItem(planBehaviorKey()),
        ]);
        if (p) {
          try {
            const parsed = JSON.parse(p) as StoredProfile;
            setStored({ profile: parsed.profile || null, skipped: !!parsed.skipped });
          } catch {}
        }
        if (s) {
          try { setSignals({ ...EMPTY_SIGNALS, ...JSON.parse(s) }); } catch {}
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persistProfile = useCallback(async (next: StoredProfile) => {
    setStored(next);
    try { await AsyncStorage.setItem(planProfileKey(), JSON.stringify(next)); } catch {}
  }, []);

  const saveProfile = useCallback(async (p: PlanProfile) => {
    await persistProfile({ profile: p, skipped: false });
  }, [persistProfile]);

  const skip = useCallback(async () => {
    await persistProfile({ profile: null, skipped: true });
  }, [persistProfile]);

  const bumpSignal = useCallback((kind: 'taps' | 'starts' | 'completes', slug: string) => {
    setSignals(prev => {
      const next: BehavioralSignal = {
        taps: { ...(prev.taps || {}) },
        starts: { ...(prev.starts || {}) },
        completes: { ...(prev.completes || {}) },
      };
      const bucket = next[kind]!;
      bucket[slug] = (bucket[slug] || 0) + 1;
      AsyncStorage.setItem(planBehaviorKey(), JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<PlanProfileState>(() => ({
    ready,
    profile: stored.profile,
    hasProfile: !!stored.profile || stored.skipped,
    saveProfile,
    skip,
    signals,
    trackTap: (slug) => bumpSignal('taps', slug),
    trackStart: (slug) => bumpSignal('starts', slug),
    trackComplete: (slug) => bumpSignal('completes', slug),
  }), [ready, stored, saveProfile, skip, signals, bumpSignal]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanProfile() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanProfile must be used inside PlanProfileProvider');
  return ctx;
}
