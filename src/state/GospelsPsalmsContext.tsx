import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOSPELS_PSALMS_PLAN, GOSPELS_PSALMS_TOTAL_DAYS, type GPlanDay } from '../constants/gospelsPsalmsPlan';
import { useCurrentDayYmd, todayYmd } from '../hooks/useCurrentDayYmd';

// Progress for the 89-day Gospels & Psalms plan — v2: PER-SLOT independent
// progress (per user, 2026-07-04).
//
// Morning and evening each carry their OWN day pointer (1..89) and advance
// independently: a user who only ever reads evenings sees the evening pointer
// move daily while morning waits at its day. Cadence per slot is unchanged
// from v1 — one reading per calendar day (a slot advances the day AFTER it
// was completed), and missed days never penalize.
//
// When one slot finishes all 89 first it holds a permanent "complete" state
// (still re-readable) while the other catches up; when BOTH are complete the
// user is congratulated and the NEXT calendar day starts the next round
// (round+1, both slots back to day 1) — the same day-gating rule as ordinary
// advancement, so there is no same-evening restart leak.
//
// Persisted shape (v2):
//   { v: 2, round, morning: {day, completedYmd}, evening: {day, completedYmd} }
//   • day           1..89 — the plan day assigned to that slot. NEVER exceeds 89.
//   • completedYmd  local YMD when that day's reading was Amen'd; null = unread.
//                   On a COMPLETE slot (day 89 read) it stays as the finish date.
//
// There are NO stored booleans: "done today" is DERIVED (completedYmd ===
// today), so a new calendar day renders unchecked even if no write ever runs.
// This kills the v1 stuck-state class (stored mDone/eDone stayed true when the
// rollover effect missed — the reported "day 2 but checks still on" bug).
const STORAGE_KEY_V2 = 'gospels-psalms:progress:v2';
const STORAGE_KEY_V1 = 'gospels-psalms:progress:v1';

export type Slot = 'morning' | 'evening';

interface SlotProgress {
  day: number;
  completedYmd: string | null;
}

interface PersistedV2 {
  v: 2;
  round: number;
  morning: SlotProgress;
  evening: SlotProgress;
}

interface PersistedV1 {
  day: number;
  mDone: boolean;
  eDone: boolean;
  completedYmd: string | null;
}

const INITIAL: PersistedV2 = {
  v: 2,
  round: 1,
  morning: { day: 1, completedYmd: null },
  evening: { day: 1, completedYmd: null },
};

const clampDay = (d: unknown): number =>
  Math.min(GOSPELS_PSALMS_TOTAL_DAYS, Math.max(1, typeof d === 'number' ? d : 1));

// v1 → v2: keep each slot at the v1 shared day. A done flag maps to
// completedYmd (v1 only stamped it when BOTH were done, so a lone done flag
// gets credited "today" — worst case that slot waits one extra day, which is
// the right trade vs. back-dating and letting two same-slot readings happen
// on one calendar day). The v1 stuck record (both done, completedYmd null)
// self-heals: credited today, advances tomorrow.
export function migrateV1(v1: Partial<PersistedV1>, migYmd: string): PersistedV2 {
  const day = clampDay(v1.day);
  const slot = (done: boolean): SlotProgress =>
    done ? { day, completedYmd: v1.completedYmd ?? migYmd } : { day, completedYmd: null };
  return { v: 2, round: 1, morning: slot(!!v1.mDone), evening: slot(!!v1.eDone) };
}

// Pure per-slot view. Zero-padded YMD strings compare correctly as strings.
// • complete: terminal — day 89 read (completedYmd kept as the finish date).
// • advancement is part of the VIEW (day+1 when today > completedYmd), so the
//   UI is correct even before the reconciliation effect persists it.
// • a completedYmd in the FUTURE (clock set back) → not doneToday AND not
//   advanceable — no double-advance; self-corrects when the clock catches up.
export function slotView(p: SlotProgress, today: string): { day: number; doneToday: boolean; complete: boolean } {
  const complete = p.day >= GOSPELS_PSALMS_TOTAL_DAYS && p.completedYmd != null;
  if (!complete && p.completedYmd != null && today > p.completedYmd) {
    return { day: p.day + 1, doneToday: false, complete: false };
  }
  return { day: p.day, doneToday: p.completedYmd === today, complete };
}

export interface GPSlotView {
  /** Effective plan day for this slot (1..89). */
  day: number;
  doneToday: boolean;
  /** This slot has finished all 89 readings (terminal until the round resets). */
  complete: boolean;
  /** Reference data for this slot's current day. */
  today: GPlanDay;
}

interface GPState {
  ready: boolean;
  total: number;
  /** 1-based reading round; bumps when both slots finish and the day rolls. */
  round: number;
  morning: GPSlotView;
  evening: GPSlotView;
  /** BOTH slots complete — celebration state, awaiting next-day round reset. */
  planComplete: boolean;
  /** Mark a slot's current day read. Idempotent; persists immediately. */
  markDone: (slot: Slot) => void;
  todayFor: (slot: Slot) => GPSlotView;
}

const Ctx = createContext<GPState | null>(null);

export function GospelsPsalmsProvider({ children }: { children: React.ReactNode }) {
  const currentYmd = useCurrentDayYmd();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<PersistedV2>(INITIAL);

  // Hydrate once — v2 if present, else migrate v1 (then drop the v1 key).
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_V2, STORAGE_KEY_V1])
      .then(([[, rawV2], [, rawV1]]) => {
        if (rawV2) {
          try {
            const p = JSON.parse(rawV2) as Partial<PersistedV2>;
            setState({
              v: 2,
              round: Math.max(1, p.round ?? 1),
              morning: { day: clampDay(p.morning?.day), completedYmd: p.morning?.completedYmd ?? null },
              evening: { day: clampDay(p.evening?.day), completedYmd: p.evening?.completedYmd ?? null },
            });
            return;
          } catch { /* fall through to v1 / INITIAL */ }
        }
        if (rawV1) {
          try {
            const migrated = migrateV1(JSON.parse(rawV1) as Partial<PersistedV1>, todayYmd());
            setState(migrated);
            AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated)).catch(() => {});
            AsyncStorage.removeItem(STORAGE_KEY_V1).catch(() => {});
          } catch { /* keep INITIAL */ }
        }
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: PersistedV2) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next)).catch(() => {});
  }, []);

  // Reconciliation: persist any day advancement the view has already derived,
  // and handle the round rollover (both complete + day rolled past the LATER
  // finish date → round+1, both slots to day 1). Pure catch-up writes — the
  // UI never depends on this having run.
  useEffect(() => {
    if (!ready) return;
    const m = slotView(state.morning, currentYmd);
    const e = slotView(state.evening, currentYmd);
    if (m.complete && e.complete) {
      const lastFinish = [state.morning.completedYmd, state.evening.completedYmd]
        .filter((x): x is string => x != null)
        .sort()
        .pop()!;
      if (currentYmd > lastFinish) {
        persist({
          v: 2,
          round: state.round + 1,
          morning: { day: 1, completedYmd: null },
          evening: { day: 1, completedYmd: null },
        });
      }
      return;
    }
    if (m.day !== state.morning.day || e.day !== state.evening.day) {
      persist({
        ...state,
        morning: m.day !== state.morning.day ? { day: m.day, completedYmd: null } : state.morning,
        evening: e.day !== state.evening.day ? { day: e.day, completedYmd: null } : state.evening,
      });
    }
  }, [ready, currentYmd, state, persist]);

  // Amen for a slot. Fresh todayYmd() at CALL time (a stale hook closure here
  // is how v1 stamped wrong dates). Folds any pending view-advancement into
  // the same write. No-op when the slot is complete or already read today.
  const markDone = useCallback((slot: Slot) => {
    setState(prev => {
      const ymd = todayYmd();
      const sv = slotView(prev[slot], ymd);
      if (sv.complete || sv.doneToday) return prev;
      const next: PersistedV2 = { ...prev, [slot]: { day: sv.day, completedYmd: ymd } };
      AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<GPState>(() => {
    const toView = (p: SlotProgress): GPSlotView => {
      const sv = slotView(p, currentYmd);
      return { ...sv, today: GOSPELS_PSALMS_PLAN[clampDay(sv.day) - 1] };
    };
    const morning = toView(state.morning);
    const evening = toView(state.evening);
    return {
      ready,
      total: GOSPELS_PSALMS_TOTAL_DAYS,
      round: state.round,
      morning,
      evening,
      planComplete: morning.complete && evening.complete,
      markDone,
      todayFor: (slot) => (slot === 'morning' ? morning : evening),
    };
  }, [ready, state, currentYmd, markDone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGospelsPsalms(): GPState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGospelsPsalms must be used inside GospelsPsalmsProvider');
  return ctx;
}
