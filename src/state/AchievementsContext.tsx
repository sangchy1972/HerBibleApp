import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACHIEVEMENTS, type Achievement } from '../constants/achievements';
import { evaluateAchievements } from '../services/achievementsEvaluator';
import { usePrayer } from './PrayerContext';
import { useNotes } from './NotesContext';
import { useHighlights } from './HighlightsContext';
import { useReadChapters } from './ReadChaptersContext';
import { useShare } from './ShareContext';

// Per-badge record. `count` lets repeatable badges (streak resets, triple-day)
// stack — the awarded gallery shows ×N alongside the badge for count > 1.
interface EarnedRecord {
  count: number;            // times earned (≥1)
  firstAwardedAt: number;   // ms timestamp
  lastAwardedAt: number;
}

type EarnedMap = Record<string, EarnedRecord>;

const STORAGE_KEY = 'achievements:v1';
const FIRST_LAUNCH_DATE_KEY = 'daily-verses:first-launch-date';   // shared with DailyVersesContext
const PREV_PASSING_KEY = 'achievements:prev-passing-set:v1';      // for repeatable badges, tracks which were passing last eval

interface AchievementsState {
  earned: EarnedMap;
  earnedCount: number;
  awardQueue: Achievement[];
  dismissAward: () => void;
  // Useful for screen-driven manual refresh; the context already auto-evaluates
  // on relevant counter changes, but a manual nudge is cheap and harmless.
  recompute: () => void;
}

const Ctx = createContext<AchievementsState | null>(null);

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AchievementsProvider({ children }: { children: React.ReactNode }) {
  const prayer = usePrayer();
  const { notes } = useNotes();
  const { count: highlightsCount, highlights } = useHighlights();
  const {
    chaptersRead, percent: readPercent,
    readToday, readingStreak, booksTouched,
  } = useReadChapters();
  const { shareCount } = useShare();

  const [earned, setEarned] = useState<EarnedMap>({});
  const [awardQueue, setAwardQueue] = useState<Achievement[]>([]);
  const prevPassingRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef(false);
  const [firstLaunchDate, setFirstLaunchDate] = useState<string | null>(null);

  // Hydrate persisted state on mount.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(PREV_PASSING_KEY),
      AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY),
    ]).then(([rawEarned, rawPrev, rawFirst]) => {
      if (rawEarned) {
        try { setEarned(JSON.parse(rawEarned) as EarnedMap); } catch {}
      }
      if (rawPrev) {
        try { prevPassingRef.current = new Set(JSON.parse(rawPrev) as string[]); } catch {}
      }
      if (rawFirst) setFirstLaunchDate(rawFirst);
      loadedRef.current = true;
    });
  }, []);

  const persistEarned = (next: EarnedMap) => {
    setEarned(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Distinct books with at least one highlight — derive from the highlight map keys.
  const distinctHighlightedBooks = useMemo(() => {
    const set = new Set<string>();
    for (const h of Object.values(highlights)) set.add(h.bookSlug);
    return set.size;
  }, [highlights]);

  // Today's "did anything count today" flags for the triple-combo badge.
  const today = ymd(new Date());
  const noteAddedToday = useMemo(() => {
    return notes.some(n => {
      const d = new Date(n.savedAt);
      return ymd(d) === today;
    });
  }, [notes, today]);
  const bookCompletedToday = readToday;
  const prayerDoneToday = prayer.mDone || prayer.eDone;

  // Days since first launch + anniversary check (month/day match, year ago or more).
  const { daysSinceFirstLaunch, isAnniversaryToday } = useMemo(() => {
    if (!firstLaunchDate) return { daysSinceFirstLaunch: 0, isAnniversaryToday: false };
    const first = new Date(firstLaunchDate + 'T00:00:00');
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - first.getTime()) / 86_400_000);
    const isAnniv = daysSince >= 365
      && now.getMonth() === first.getMonth()
      && now.getDate() === first.getDate();
    return { daysSinceFirstLaunch: daysSince, isAnniversaryToday: isAnniv };
  }, [firstLaunchDate]);

  const recompute = useCallback(() => {
    if (!loadedRef.current) return;
    const snapshot = {
      currentPrayerStreak: prayer.currentStreak,
      totalPrayerCompleteDays: prayer.totalComplete,
      prayerDoneToday,
      // Early-bird isn't tracked yet (prayer records don't carry timestamps).
      // The badge stays unearnable until that lands; spec is in place.
      earlyBirdStreak: 0,
      chaptersRead,
      readPercent,
      readingStreak,
      bookCompletedToday,
      noteAddedToday,
      notesCount: notes.length,
      highlightsCount,
      distinctHighlightedBooks,
      booksRead: booksTouched,
      planCount: 0,                  // TODO: wire when PlanCompletionContext lands
      planRecentDates: [] as string[],
      hasRepeatedPlan: false,
      shareCount,
      daysSinceFirstLaunch,
      isAnniversaryToday,
      earnedIds: Object.keys(earned),
    };
    const { earnedIds } = evaluateAchievements(snapshot);
    const passingNow = new Set(earnedIds);
    const wasPassing = prevPassingRef.current;

    // Award new earns:
    //  - non-repeatable: award once if not already in earned
    //  - repeatable:    award again on every fresh leading edge (was failing -> now passing)
    const newAwards: Achievement[] = [];
    let next: EarnedMap | null = null;
    for (const id of earnedIds) {
      const def = ACHIEVEMENTS.find(a => a.id === id);
      if (!def) continue;
      const had = earned[id];
      if (!had) {
        // First-ever award.
        next = next || { ...earned };
        next[id] = { count: 1, firstAwardedAt: Date.now(), lastAwardedAt: Date.now() };
        newAwards.push(def);
      } else if (def.repeatable && !wasPassing.has(id)) {
        // Repeatable, leading edge — but cap at once per calendar day. The
        // contexts hydrate independently from AsyncStorage, so a cold start
        // can briefly evaluate "passing → not passing → passing" as data
        // arrives; without this guard the badge re-fires every app open.
        const lastDay = ymd(new Date(had.lastAwardedAt));
        if (lastDay === today) continue;
        next = next || { ...earned };
        next[id] = { ...had, count: had.count + 1, lastAwardedAt: Date.now() };
        newAwards.push(def);
      }
    }
    if (next) persistEarned(next);

    // Persist passing-set so the next session can detect leading edges.
    if (passingNow.size !== wasPassing.size || [...passingNow].some(x => !wasPassing.has(x))) {
      prevPassingRef.current = passingNow;
      AsyncStorage.setItem(PREV_PASSING_KEY, JSON.stringify([...passingNow])).catch(() => {});
    }

    if (newAwards.length > 0) setAwardQueue(prev => [...prev, ...newAwards]);
  }, [
    prayer.currentStreak, prayer.totalComplete, prayerDoneToday,
    chaptersRead, readPercent, readingStreak, bookCompletedToday, noteAddedToday,
    notes.length, highlightsCount, distinctHighlightedBooks, booksTouched,
    shareCount, daysSinceFirstLaunch, isAnniversaryToday, earned,
  ]);

  // Auto-evaluate whenever any counter that feeds the rules changes.
  useEffect(() => { recompute(); }, [recompute]);

  const dismissAward = useCallback(() => {
    setAwardQueue(prev => prev.slice(1));
  }, []);

  const earnedCount = useMemo(() => Object.keys(earned).length, [earned]);

  const value = useMemo<AchievementsState>(() => ({
    earned, earnedCount, awardQueue, dismissAward, recompute,
  }), [earned, earnedCount, awardQueue, dismissAward, recompute]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAchievements() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAchievements must be used inside AchievementsProvider');
  return ctx;
}
