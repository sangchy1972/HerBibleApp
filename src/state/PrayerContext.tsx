import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PrayerKind = 'morning' | 'evening';

interface DayRecord { m: boolean; e: boolean }
type DayRecords = Record<string, DayRecord>;

interface PrayerState {
  morning: boolean;              // currently-selected tab
  mDone: boolean;                // today's morning completed
  eDone: boolean;                // today's evening completed
  totalComplete: number;         // total days where BOTH prayers were done
  maxStreak: number;             // longest run of consecutive complete days
  firstCompleteDate: string | null;   // earliest 'YYYY-MM-DD' with both done
  wasCompleteOn: (dateKey: string) => boolean;
  setMorning: (v: boolean) => void;
  markDone: (kind: PrayerKind) => void;
}

const PrayerContext = createContext<PrayerState | null>(null);
const STORAGE_KEY = 'prayer:records:v1';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Longest consecutive run within a sorted ascending list of YYYY-MM-DD strings.
function longestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  let max = 1;
  let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curr = new Date(dates[i] + 'T00:00:00');
    prev.setDate(prev.getDate() + 1);
    if (prev.getTime() === curr.getTime()) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 1;
    }
  }
  return max;
}

export function PrayerProvider({ children }: { children: React.ReactNode }) {
  const hr = new Date().getHours();
  const [morning, setMorning] = useState(hr >= 5 && hr < 17);
  const [records, setRecords] = useState<DayRecords>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setRecords(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const persist = (next: DayRecords) => {
    setRecords(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<PrayerState>(() => {
    const today = todayKey();
    const todayRec = records[today] || { m: false, e: false };

    const completeDates = Object.entries(records)
      .filter(([, r]) => r.m && r.e)
      .map(([d]) => d)
      .sort();

    return {
      morning,
      mDone: todayRec.m,
      eDone: todayRec.e,
      totalComplete: completeDates.length,
      maxStreak: longestStreak(completeDates),
      firstCompleteDate: completeDates[0] ?? null,
      wasCompleteOn: (dateKey) => {
        const r = records[dateKey];
        return !!(r && r.m && r.e);
      },
      setMorning,
      markDone: (kind) => {
        const cur = records[today] || { m: false, e: false };
        const next = kind === 'morning' ? { ...cur, m: true } : { ...cur, e: true };
        if (next.m === cur.m && next.e === cur.e) return;
        persist({ ...records, [today]: next });
      },
    };
  }, [morning, records]);

  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer() {
  const ctx = useContext(PrayerContext);
  if (!ctx) throw new Error('usePrayer must be used inside PrayerProvider');
  return ctx;
}
