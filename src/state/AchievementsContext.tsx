import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACHIEVEMENTS, type Achievement } from '../constants/achievements';
import { evaluateAchievements } from '../services/achievementsEvaluator';
import { logEvent } from '../services/firebase';
import { usePrayer } from './PrayerContext';
import { useNotes } from './NotesContext';
import { useHighlights } from './HighlightsContext';
import { useReadChapters } from './ReadChaptersContext';
import { useShare } from './ShareContext';
import { usePlanCompletion } from './PlanCompletionContext';
import { useFeaturedPlans } from './FeaturedPlansContext';
import { useActivity } from './ActivityContext';

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
const SCHEMA_KEY = 'achievements:schema';                          // bumped each time we expand the badge set
const CURRENT_SCHEMA = '2.3';                                      // matches `her_bible_logic_v2_3.html`
// Window during which the migration silently absorbs currently-passing
// badges into `earned` (no popups). Long enough to absorb every context's
// async hydration (Prayer / Notes / Highlights / ReadChapters / etc.) plus
// a small safety margin. Without this, an existing v1 user who upgrades
// to v2.3 would see ~26 popups in a row for badges they retroactively
// "earned" (e.g. note.count15 fires for any user with ≥15 notes), with
// the unlock modal blocking all sheet-tile taps until they've manually
// dismissed every one.
const MIGRATION_WINDOW_MS = 3000;

interface AchievementsState {
  earned: EarnedMap;
  earnedCount: number;
  /** Whole days since the user's first launch (0 on day one). Drives day-N nudges. */
  daysSinceFirstLaunch: number;
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
  const { completedPlans, completedPlanFinishedDates, hasRepeatedPlan, records: planRecords } = usePlanCompletion();
  const { summary: planSummary } = useFeaturedPlans();
  // For milestone.fullYear (v2.3): app age ≥ 365 days AND ≥ 300 distinct
  // active days. ActivityContext.dates already tracks the latter.
  const { dates: activityDates } = useActivity();

  const [earned, setEarned] = useState<EarnedMap>({});
  const [awardQueue, setAwardQueue] = useState<Achievement[]>([]);
  const prevPassingRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef(false);
  // True only when (a) the user has prior earned data AND (b) the saved
  // schema version is older than the current one. While true, recompute
  // silently absorbs newly-passing badges into `earned` without queuing
  // popups — prevents the v1 → v2.3 upgrade from spamming ~26 modal
  // popups in a row. Auto-clears after MIGRATION_WINDOW_MS so context
  // hydration has time to complete; new users (who have no prior data)
  // never enter this mode and continue to see their First Light popup.
  const migrationModeRef = useRef(false);
  const [firstLaunchDate, setFirstLaunchDate] = useState<string | null>(null);

  // Hydrate persisted state on mount.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(PREV_PASSING_KEY),
      AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY),
      AsyncStorage.getItem(SCHEMA_KEY),
    ]).then(([rawEarned, rawPrev, rawFirst, rawSchema]) => {
      let parsedEarned: EarnedMap = {};
      if (rawEarned) {
        try { parsedEarned = JSON.parse(rawEarned) as EarnedMap; setEarned(parsedEarned); } catch {}
      }
      if (rawPrev) {
        try { prevPassingRef.current = new Set(JSON.parse(rawPrev) as string[]); } catch {}
      }
      if (rawFirst) setFirstLaunchDate(rawFirst);
      // Migration trigger: existing user data + schema mismatch. New users
      // (empty `earned`) skip migration so first-action popups still fire.
      const hasPriorData = Object.keys(parsedEarned).length > 0;
      const isOldSchema = rawSchema !== CURRENT_SCHEMA;
      migrationModeRef.current = hasPriorData && isOldSchema;
      loadedRef.current = true;
    });

    // Auto-expire migration mode. Even if recompute is somehow not called
    // (no context state changes during the window), we eventually flip
    // the schema to current so the next session enters normal flow.
    const timer = setTimeout(() => {
      if (migrationModeRef.current) {
        migrationModeRef.current = false;
        AsyncStorage.setItem(SCHEMA_KEY, CURRENT_SCHEMA).catch(() => {});
      }
    }, MIGRATION_WINDOW_MS);
    return () => clearTimeout(timer);
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
  // v2.3 broadens the third leg to "note OR highlight" — a user who only
  // highlights today (no notes) still qualifies.
  const today = ymd(new Date());
  const noteAddedToday = useMemo(() => {
    return notes.some(n => {
      const d = new Date(n.savedAt);
      return ymd(d) === today;
    });
  }, [notes, today]);
  const highlightAddedToday = useMemo(() => {
    return Object.values(highlights).some(h => {
      try { return ymd(new Date(h.savedAt)) === today; } catch { return false; }
    });
  }, [highlights, today]);
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
      // True the moment any prayer is recorded (m OR e). Drives First
      // Light, which must fire on the first Amen — not on the first
      // fully-complete day. Reads PrayerContext.everPrayed directly.
      prayerEver: prayer.everPrayed,
      prayerDoneToday,
      // Wired through PrayerContext.earlyBirdStreak — consecutive days
      // (with grace) where the earliest prayer of the day landed before
      // 21:00 local. Drives milestone.dawn7 (badge condition reads this
      // field directly via the evaluator's `earlyBirdStreak` case).
      earlyBirdStreak: prayer.earlyBirdStreak,
      chaptersRead,
      readPercent,
      readingStreak,
      bookCompletedToday,
      noteAddedToday,
      highlightAddedToday,
      notesCount: notes.length,
      highlightsCount,
      distinctHighlightedBooks,
      booksRead: booksTouched,
      planCount: completedPlans.length,
      planRecentDates: completedPlanFinishedDates,
      hasRepeatedPlan: hasRepeatedPlan(
        Object.fromEntries(planSummary.map(p => [p.slug, p.duration])),
      ),
      shareCount,
      daysSinceFirstLaunch,
      activeDaysTotal: activityDates.size,
      isAnniversaryToday,
      earnedIds: Object.keys(earned),
    };
    const { earnedIds } = evaluateAchievements(snapshot);
    const passingNow = new Set(earnedIds);
    const wasPassing = prevPassingRef.current;

    // Migration mode (one-shot v1 → v2.3 absorb): silently ingest any
    // currently-passing badges that aren't yet in `earned`, then update
    // prevPassing and bail. No popups, no awardQueue churn. This is what
    // prevents the unlock modal from blocking the rest of the screen for
    // 20+ taps after the schema bump — see MIGRATION_WINDOW_MS comment.
    if (migrationModeRef.current) {
      let mig: EarnedMap | null = null;
      const now = Date.now();
      for (const id of earnedIds) {
        if (!earned[id]) {
          mig = mig || { ...earned };
          mig[id] = { count: 1, firstAwardedAt: now, lastAwardedAt: now };
        }
      }
      if (mig) persistEarned(mig);
      if (passingNow.size !== wasPassing.size || [...passingNow].some(x => !wasPassing.has(x))) {
        prevPassingRef.current = passingNow;
        AsyncStorage.setItem(PREV_PASSING_KEY, JSON.stringify([...passingNow])).catch(() => {});
      }
      return;
    }

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

    if (newAwards.length > 0) {
      // unlock_achievement (Firebase Recommended). Only here in the NORMAL award
      // branch — migration mode returned earlier, so a v1→v2 schema bump never
      // fires phantom unlocks for already-earned badges.
      newAwards.forEach(def => logEvent('unlock_achievement', { achievement_id: def.id, rarity: def.rarity, category: def.category }));
      setAwardQueue(prev => [...prev, ...newAwards]);
    }
  }, [
    prayer.currentStreak, prayer.totalComplete, prayer.earlyBirdStreak, prayer.everPrayed, prayerDoneToday,
    chaptersRead, readPercent, readingStreak, bookCompletedToday,
    noteAddedToday, highlightAddedToday,
    notes.length, highlightsCount, distinctHighlightedBooks, booksTouched,
    shareCount, daysSinceFirstLaunch, activityDates.size, isAnniversaryToday, earned,
    completedPlans, completedPlanFinishedDates, planRecords, planSummary,
    hasRepeatedPlan,
  ]);

  // Auto-evaluate whenever any counter that feeds the rules changes.
  useEffect(() => { recompute(); }, [recompute]);

  const dismissAward = useCallback(() => {
    setAwardQueue(prev => prev.slice(1));
  }, []);

  const earnedCount = useMemo(() => Object.keys(earned).length, [earned]);

  const value = useMemo<AchievementsState>(() => ({
    earned, earnedCount, daysSinceFirstLaunch, awardQueue, dismissAward, recompute,
  }), [earned, earnedCount, daysSinceFirstLaunch, awardQueue, dismissAward, recompute]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAchievements() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAchievements must be used inside AchievementsProvider');
  return ctx;
}
