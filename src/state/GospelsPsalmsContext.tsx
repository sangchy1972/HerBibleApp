import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOSPELS_PSALMS_PLAN, GOSPELS_PSALMS_TOTAL_DAYS, type GPlanDay } from '../constants/gospelsPsalmsPlan';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';

// Progress for the 89-day Gospels & Psalms plan.
//
// Pacing (per product): a "day" = morning + evening. The user can do both in
// the morning if they like; each completes independently (two green checks).
// The NEXT day unlocks only after BOTH are done AND the calendar has rolled
// over — so finishing day 1 entirely on Monday unlocks day 2 on Tuesday, not
// Monday night. Missing days never penalize; the pointer just waits. So the
// 89-day plan can stretch to 100+ real days. (Confirmed with user.)
//
// Persisted shape (v1):
//   { day, mDone, eDone, completedYmd }
//   • day          1..89, the currently-unlocked day
//   • mDone/eDone  morning / evening done for THAT day
//   • completedYmd the YMD on which day became fully complete (both true);
//                  null until then. Advancement waits for today > completedYmd.
const STORAGE_KEY = 'gospels-psalms:progress:v1';

interface Persisted {
  day: number;
  mDone: boolean;
  eDone: boolean;
  completedYmd: string | null;
}

const INITIAL: Persisted = { day: 1, mDone: false, eDone: false, completedYmd: null };

export type Slot = 'morning' | 'evening';

interface GPState {
  ready: boolean;
  /** Currently-unlocked plan day (1..89). */
  day: number;
  total: number;
  /** The reference data for the current day. */
  today: GPlanDay;
  morningDone: boolean;
  eveningDone: boolean;
  /** Whole plan finished (day 89 fully complete). */
  planComplete: boolean;
  /** Mark a slot read. Idempotent; persists immediately. */
  markDone: (slot: Slot) => void;
}

const Ctx = createContext<GPState | null>(null);

export function GospelsPsalmsProvider({ children }: { children: React.ReactNode }) {
  const todayYmd = useCurrentDayYmd();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<Persisted>(INITIAL);

  // Hydrate once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const p = JSON.parse(raw) as Partial<Persisted>;
            setState({
              day: Math.min(GOSPELS_PSALMS_TOTAL_DAYS, Math.max(1, p.day ?? 1)),
              mDone: !!p.mDone,
              eDone: !!p.eDone,
              completedYmd: p.completedYmd ?? null,
            });
          } catch { /* keep INITIAL */ }
        }
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: Persisted) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Day-rollover advancement. When the current day is fully complete and we've
  // crossed into a later calendar day than the completion date, advance to the
  // next day (unless already on the final day). Runs on mount + each day tick.
  useEffect(() => {
    if (!ready) return;
    if (
      state.mDone && state.eDone &&
      state.completedYmd && todayYmd > state.completedYmd &&
      state.day < GOSPELS_PSALMS_TOTAL_DAYS
    ) {
      persist({ day: state.day + 1, mDone: false, eDone: false, completedYmd: null });
    }
  }, [ready, todayYmd, state, persist]);

  const markDone = useCallback((slot: Slot) => {
    setState(prev => {
      const next: Persisted = {
        ...prev,
        mDone: slot === 'morning' ? true : prev.mDone,
        eDone: slot === 'evening' ? true : prev.eDone,
      };
      // Stamp the completion date the moment both halves are done (and not
      // already stamped) so the rollover effect can gate the next unlock.
      if (next.mDone && next.eDone && !next.completedYmd) next.completedYmd = todayYmd;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [todayYmd]);

  const value = useMemo<GPState>(() => {
    const idx = Math.min(GOSPELS_PSALMS_TOTAL_DAYS, Math.max(1, state.day)) - 1;
    const today = GOSPELS_PSALMS_PLAN[idx];
    const planComplete =
      state.day >= GOSPELS_PSALMS_TOTAL_DAYS && state.mDone && state.eDone;
    return {
      ready,
      day: state.day,
      total: GOSPELS_PSALMS_TOTAL_DAYS,
      today,
      morningDone: state.mDone,
      eveningDone: state.eDone,
      planComplete,
      markDone,
    };
  }, [ready, state, markDone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGospelsPsalms(): GPState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGospelsPsalms must be used inside GospelsPsalmsProvider');
  return ctx;
}
