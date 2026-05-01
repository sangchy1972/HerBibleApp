import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAndCacheDailyVerses,
  getBundledDailyVerses,
  getCachedDailyVerses,
  type FullDailyVerse,
} from '../services/dailyVersesService';
import { BUNDLED_COVERAGE_DAYS } from '../constants/dailyVersesBundled';
import { useTranslation, type LanguageCode } from './TranslationsContext';

interface DailyVersesState {
  // The verse to render for (day, segment). Falls back to day 1 if the
  // requested day isn't in the loaded set yet (e.g. offline + bundled-only).
  getVerse: (day: number, segment: 'morning' | 'evening') => FullDailyVerse | null;
  // 1-based day-of-cycle for "today", anchored to the user's first launch.
  // Cycles through the loaded coverage so users past day N never see a blank.
  todayDay: number;
}

const DailyVersesContext = createContext<DailyVersesState | null>(null);

const FIRST_LAUNCH_DATE_KEY = 'daily-verses:first-launch-date';

// "YYYY-MM-DD" in the device's local timezone. Day boundaries are local —
// the user's morning prayer should roll forward when their clock crosses
// midnight, regardless of whether UTC has.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + 'T00:00:00');
  const b = new Date(toYmd + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function DailyVersesProvider({ children }: { children: React.ReactNode }) {
  const { current: translation } = useTranslation();
  const lang = translation.code as LanguageCode;

  // Bundled is the synchronous baseline — always available, no network. The
  // cached/CDN payload replaces it once it loads. Both share the same shape.
  const [verses, setVerses] = useState<FullDailyVerse[]>(() => getBundledDailyVerses(lang));
  const loadedLangRef = useRef<LanguageCode | null>(null);

  // Coverage is whatever's currently loaded. Bundled covers 3 days; the full
  // CDN file covers 60. Cycling by `coverageDays` keeps the UI working past
  // that horizon without ever showing a blank card.
  const coverageDays = useMemo(() => {
    const max = verses.reduce((m, v) => Math.max(m, v.day), 0);
    return Math.max(BUNDLED_COVERAGE_DAYS, max);
  }, [verses]);

  // First-launch date is sticky in storage so the day cycle anchors to install
  // rather than calendar — every user gets day 1 on their first morning.
  const [firstLaunch, setFirstLaunch] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY).then(stored => {
      if (cancelled) return;
      if (stored) {
        setFirstLaunch(stored);
      } else {
        const today = ymd(new Date());
        AsyncStorage.setItem(FIRST_LAUNCH_DATE_KEY, today).catch(() => {});
        setFirstLaunch(today);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const todayDay = useMemo(() => {
    if (!firstLaunch || coverageDays === 0) return 1;
    const elapsed = daysBetween(firstLaunch, ymd(new Date()));
    return (elapsed % coverageDays) + 1;
  }, [firstLaunch, coverageDays]);

  // On language change: hand back the bundled set immediately so the prayer
  // screen never blanks, then try cache, then network. Each later step only
  // wins if it returns a richer dataset (more verses) than what we already
  // have — the bundled fallback shouldn't overwrite a freshly fetched file.
  useEffect(() => {
    let cancelled = false;
    if (loadedLangRef.current !== lang) {
      setVerses(getBundledDailyVerses(lang));
      loadedLangRef.current = lang;
    }
    (async () => {
      try {
        const cached = await getCachedDailyVerses(lang);
        if (!cancelled && cached && cached.length > 0) setVerses(cached);
      } catch {
        // ignore — bundled stays in place
      }
      try {
        const fresh = await fetchAndCacheDailyVerses(lang);
        if (!cancelled && fresh.length > 0) setVerses(fresh);
      } catch {
        // ignore — cached or bundled stays in place
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);

  const getVerse = useCallback(
    (day: number, segment: 'morning' | 'evening'): FullDailyVerse | null => {
      if (verses.length === 0) return null;
      // Cycle within whatever's loaded so any day number resolves.
      const cycleDay = ((day - 1) % coverageDays + coverageDays) % coverageDays + 1;
      return (
        verses.find(v => v.day === cycleDay && v.segment === segment)
        // Last-ditch: same day, opposite segment, then the very first entry.
        || verses.find(v => v.day === cycleDay)
        || verses[0]
      );
    },
    [verses, coverageDays],
  );

  const value = useMemo<DailyVersesState>(() => ({ getVerse, todayDay }), [getVerse, todayDay]);
  return <DailyVersesContext.Provider value={value}>{children}</DailyVersesContext.Provider>;
}

export function useDailyVerses() {
  const ctx = useContext(DailyVersesContext);
  if (!ctx) throw new Error('useDailyVerses must be used inside DailyVersesProvider');
  return ctx;
}
