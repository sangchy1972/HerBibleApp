import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ActivityState {
  dates: Set<string>;        // 'YYYY-MM-DD'
  streak: number;            // consecutive days ending today (or yesterday if today not yet marked)
  markToday: () => void;
  markDate: (date: string) => void;
}

const ActivityContext = createContext<ActivityState | null>(null);
const STORAGE_KEY = 'activity:dates';

const dateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayString = () => dateKey(new Date());

const computeStreak = (dates: Set<string>): number => {
  if (dates.size === 0) return 0;
  const cur = new Date();
  // Allow grace: if today not yet marked, start counting from yesterday so the streak doesn't "break" until a full day is missed.
  if (!dates.has(dateKey(cur))) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (dates.has(dateKey(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
};

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [dates, setDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setDates(new Set(JSON.parse(raw) as string[])); } catch {}
      }
    });
  }, []);

  const persist = (next: Set<string>) => {
    setDates(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
  };

  const value = useMemo<ActivityState>(() => ({
    dates,
    streak: computeStreak(dates),
    markToday: () => {
      const d = todayString();
      if (dates.has(d)) return;
      const next = new Set(dates);
      next.add(d);
      persist(next);
    },
    markDate: (d) => {
      if (dates.has(d)) return;
      const next = new Set(dates);
      next.add(d);
      persist(next);
    },
  }), [dates]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used inside ActivityProvider');
  return ctx;
}
