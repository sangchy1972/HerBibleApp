import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent, setUserProps } from '../services/firebase';

const STORAGE_KEY = 'plan-completion:v1';

interface PlanRecord {
  completedDays: number[];      // 1-indexed days that have been Mark-Day-Complete'd
  firstStartedAt: number;       // ms timestamp of the first time any day was completed
  finishedAt?: number;          // ms timestamp once completedDays.length === total
  lastDayYmd?: string;          // local YYYY-MM-DD of the most recent day completion
                                // (absent on pre-existing records — treat as "not today")
  // Local YYYY-MM-DD each day was ACTUALLY completed, keyed by day number.
  // lastDayYmd only ever held the latest, so a user who read two days in one
  // sitting had no way to show both on the same date — and the schedule strip
  // had to fake dates as start+(N-1). Absent for days completed before this
  // field existed; callers fall back to the projection.
  dayDates?: Record<number, string>;
}

type PlanRecords = Record<string, PlanRecord>;   // slug → record

interface State {
  records: PlanRecords;
  // True if `day` has been marked complete on `slug`.
  isDayComplete: (slug: string, day: number) => boolean;
  // Idempotent — calling twice for the same (slug, day) is a no-op. The
  // caller passes `total` (the plan's duration) so we can mark `finishedAt`
  // when the last day lands.
  markDayComplete: (slug: string, day: number, total: number) => void;
  // Mid-flight progress for a single plan.
  planProgress: (slug: string, total: number) => { completed: number; total: number; complete: boolean };
  // Slugs of plans whose every day has been completed. Used by the
  // achievements evaluator's planCount / planRecentDates / hasRepeatedPlan.
  completedPlans: string[];
  // Same as above but with the finished-at timestamps for the
  // planRecentDates achievement window.
  completedPlanFinishedDates: string[];   // ISO YYYY-MM-DD list, may include duplicates
  // True if any plan has been re-walked beyond its duration (deepRoots badge).
  hasRepeatedPlan: (totals: Record<string, number>) => boolean;
  // Total day-of-plan completions across all plans this lifetime.
  totalDayCompletions: number;
}

const Ctx = createContext<State | null>(null);

export function PlanCompletionProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<PlanRecords>({});

  // Hydrate.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      // Sanitised, not trusted. The reduce in `value` reads
      // `r.completedDays.length` inside a PROVIDER-level useMemo, so a single
      // record missing that array throws during render and white-screens the
      // entire app — not one screen. The parse is not the only way in either:
      // mergePlanRecords copies a remote-only slug verbatim, so a record
      // written by another version of the app arrives here unnormalised.
      .then(raw => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as PlanRecords;
          const clean: PlanRecords = {};
          for (const [slug, r] of Object.entries(parsed ?? {})) {
            if (!r || typeof r !== 'object') continue;
            clean[slug] = { ...r, completedDays: Array.isArray(r.completedDays) ? r.completedDays : [] };
          }
          setRecords(clean);
        } catch { /* unparseable → start empty rather than crash */ }
      })
      .catch(() => {});
  }, []);

  const persist = (next: PlanRecords) => {
    setRecords(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<State>(() => ({
    records,
    isDayComplete: (slug, day) => !!records[slug]?.completedDays.includes(day),
    markDayComplete: (slug, day, total) => {
      const current = records[slug] || { completedDays: [], firstStartedAt: Date.now() };
      if (current.completedDays.includes(day)) return;
      const completedDays = [...current.completedDays, day].sort((a, b) => a - b);
      const justFinished = completedDays.length >= total && !current.finishedAt;
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const next: PlanRecord = {
        ...current,
        dayDates: { ...(current.dayDates ?? {}), [day]: ymd },
        completedDays,
        firstStartedAt: current.firstStartedAt || Date.now(),
        finishedAt: completedDays.length >= total ? Date.now() : current.finishedAt,
        lastDayYmd: ymd,
      };
      persist({ ...records, [slug]: next });
      logEvent('plan_day_complete', { slug, day });
      if (justFinished) logEvent('plan_complete', { slug, total });
    },
    planProgress: (slug, total) => {
      const r = records[slug];
      const completed = r?.completedDays.length || 0;
      return { completed, total, complete: completed >= total };
    },
    completedPlans: Object.entries(records)
      .filter(([, r]) => !!r.finishedAt)
      .map(([slug]) => slug),
    completedPlanFinishedDates: Object.values(records)
      .filter(r => !!r.finishedAt)
      .map(r => new Date(r.finishedAt!).toISOString().slice(0, 10)),
    hasRepeatedPlan: (totals) =>
      Object.entries(records).some(([slug, r]) => {
        const t = totals[slug];
        return t != null && r.completedDays.length > t;
      }),
    totalDayCompletions: Object.values(records).reduce((sum, r) => sum + r.completedDays.length, 0),
  }), [records]);

  // Durable analytics dimension — has the user engaged any plan (retention Q).
  useEffect(() => {
    setUserProps({ has_started_plan: Object.keys(records).length > 0 ? 'yes' : 'no' });
  }, [records]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanCompletion() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanCompletion must be used inside PlanCompletionProvider');
  return ctx;
}
