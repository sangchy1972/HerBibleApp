import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';
import { setUserProps } from '../services/firebase';

type PrayerKind = 'morning' | 'evening';

// `mAt` / `eAt` — ISO timestamps recorded the moment the user marks each
// prayer done. Optional because pre-existing AsyncStorage records (from
// before the schema bump) don't have them; consumers that need the
// timestamp (e.g. earlyBirdStreak) treat missing as "doesn't qualify".
interface DayRecord { m: boolean; e: boolean; mAt?: string; eAt?: string }
type DayRecords = Record<string, DayRecord>;

interface PrayerState {
  morning: boolean;              // currently-selected tab
  mDone: boolean;                // today's morning completed
  eDone: boolean;                // today's evening completed
  totalComplete: number;         // total days where BOTH prayers were done
  currentStreak: number;         // consecutive complete days ending today (or yesterday with grace)
  maxStreak: number;             // longest run of consecutive complete days
  // Consecutive days ending today (with 1-day grace) where the EARLIEST
  // prayer of that day was completed before 21:00 local. Drives the
  // milestone.dawn7 achievement. Days with records but no timestamps
  // (legacy data) don't qualify and break the streak.
  earlyBirdStreak: number;
  firstCompleteDate: string | null;   // earliest 'YYYY-MM-DD' with both done
  firstPrayedDate: string | null;     // earliest 'YYYY-MM-DD' with ANY prayer (m OR e) — the "streak started" date per user
  everPrayed: boolean;                // any record has m or e set — used to detect first-prayer onboarding moment
  everMorning: boolean;               // any record has m set — a MORNING prayer has been completed at least once
  wasCompleteOn: (dateKey: string) => boolean;
  recordOn: (dateKey: string) => DayRecord;
  setMorning: (v: boolean) => void;
  markDone: (kind: PrayerKind) => void;
}

const PrayerContext = createContext<PrayerState | null>(null);
const STORAGE_KEY = 'prayer:records:v1';

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

// Active streak ending today, with a one-day grace if today isn't yet complete
// (so the streak doesn't break until a full day is missed). Mirrors the same
// grace policy as ActivityContext.computeStreak.
function activeStreak(dateSet: Set<string>): number {
  if (dateSet.size === 0) return 0;
  const cur = new Date();
  const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!dateSet.has(k(cur))) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (dateSet.has(k(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

// Consecutive days ending today (1-day grace, mirroring `activeStreak`)
// where the EARLIEST prayer of that day was completed before 21:00 local.
// Drives milestone.dawn7 — the user's chosen threshold. Treats records
// missing both timestamps (legacy data, schema-bump backfill) as
// non-qualifying so they break the streak.
const EARLY_BIRD_HOUR = 21;             // 9 PM local cutoff
function earlyBirdStreakOf(records: DayRecords): number {
  const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const qualifies = (rec: DayRecord | undefined) => {
    if (!rec) return false;
    const stamps = [rec.mAt, rec.eAt].filter(Boolean) as string[];
    if (stamps.length === 0) return false;
    // Earliest completion of the day. Local-time comparison via Date — the
    // ISO string parses to a Date, getHours() returns local hour.
    const earliestHour = Math.min(...stamps.map(s => new Date(s).getHours()));
    return earliestHour < EARLY_BIRD_HOUR;
  };
  const cur = new Date();
  // Today doesn't count yet → start from yesterday with grace, same as activeStreak.
  if (!qualifies(records[k(cur)])) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (qualifies(records[k(cur)])) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function PrayerProvider({ children }: { children: React.ReactNode }) {
  const hr = new Date().getHours();
  // Initial tab follows the CALENDAR DAY, not the prayer-start window. The day
  // rolls at midnight, so from 00:00 the user is in the new day's MORNING
  // context (this matches the "Good Morning" greeting and the verse-of-the-day).
  // Evening only takes over at 18:00. The 00:00–06:00 dead zone (morning prayer
  // not yet startable → "see past verses") is handled separately by the start
  // gating in PrayerScreen, so the tab can safely show morning there.
  // Previously `hr >= 6 && hr < 18`, which wrongly showed Evening from 00:00–06:00.
  const [morning, setMorning] = useState(hr < 18);
  const [records, setRecords] = useState<DayRecords>({});
  // Local calendar day; ticks at midnight (foreground resume + midnight timer)
  // so mDone/eDone/markDone all key off the SAME day even when the app is left
  // open across midnight (without this, the value memo froze on yesterday).
  const todayYmd = useCurrentDayYmd();

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
    const today = todayYmd;
    const todayRec = records[today] || { m: false, e: false };

    const completeDates = Object.entries(records)
      .filter(([, r]) => r.m && r.e)
      .map(([d]) => d)
      .sort();

    // Earliest day the user prayed AT ALL (morning OR evening). Per user, the
    // "streak started" date is their very first prayer — they don't have to
    // complete both halves of a day for the journey to have begun.
    const prayedDates = Object.entries(records)
      .filter(([, r]) => r.m || r.e)
      .map(([d]) => d)
      .sort();

    return {
      morning,
      mDone: todayRec.m,
      eDone: todayRec.e,
      totalComplete: completeDates.length,
      currentStreak: activeStreak(new Set(completeDates)),
      maxStreak: longestStreak(completeDates),
      earlyBirdStreak: earlyBirdStreakOf(records),
      firstCompleteDate: completeDates[0] ?? null,
      firstPrayedDate: prayedDates[0] ?? null,
      everPrayed: prayedDates.length > 0,
      everMorning: Object.values(records).some(r => !!r?.m),
      wasCompleteOn: (dateKey) => {
        const r = records[dateKey];
        return !!(r && r.m && r.e);
      },
      recordOn: (dateKey) => records[dateKey] || { m: false, e: false },
      setMorning,
      markDone: (kind) => {
        const cur = records[today] || { m: false, e: false };
        // Stamp the completion time so earlyBirdStreakOf can read it later.
        // Idempotent: if the boolean is already true we don't overwrite the
        // earlier timestamp (preserves the actual moment the prayer landed).
        const nowIso = new Date().toISOString();
        const next: DayRecord = kind === 'morning'
          ? { ...cur, m: true, mAt: cur.m ? cur.mAt : nowIso }
          : { ...cur, e: true, eAt: cur.e ? cur.eAt : nowIso };
        if (next.m === cur.m && next.e === cur.e) return;
        persist({ ...records, [today]: next });
      },
    };
  }, [morning, records, todayYmd]);

  // Durable analytics dimensions — the headline retention-driver cohorts:
  // does the user do BOTH slots, and what streak bucket are they in.
  useEffect(() => {
    const s = value.currentStreak;
    const bucket = s >= 30 ? '30+' : s >= 7 ? '7-29' : s >= 3 ? '3-6' : s >= 1 ? '1-2' : '0';
    setUserProps({ does_both_slots: value.totalComplete > 0 ? 'yes' : 'no', prayer_streak_bucket: bucket });
  }, [value.totalComplete, value.currentStreak]);

  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer() {
  const ctx = useContext(PrayerContext);
  if (!ctx) throw new Error('usePrayer must be used inside PrayerProvider');
  return ctx;
}
