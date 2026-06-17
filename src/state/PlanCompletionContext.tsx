import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '../services/firebase';

const STORAGE_KEY = 'plan-completion:v1';

interface PlanRecord {
  completedDays: number[];      // 1-indexed days that have been Mark-Day-Complete'd
  firstStartedAt: number;       // ms timestamp of the first time any day was completed
  finishedAt?: number;          // ms timestamp once completedDays.length === total
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
      .then(raw => { if (raw) { try { setRecords(JSON.parse(raw)); } catch {} } })
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
      const next: PlanRecord = {
        ...current,
        completedDays,
        firstStartedAt: current.firstStartedAt || Date.now(),
        finishedAt: completedDays.length >= total ? Date.now() : current.finishedAt,
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanCompletion() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanCompletion must be used inside PlanCompletionProvider');
  return ctx;
}
