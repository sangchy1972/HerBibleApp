import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAndCacheDailyVerses,
  getBundledDailyVerses,
  getCachedDailyVerses,
  fetchAndCacheHolidayVerses,
  getCachedHolidayVerses,
  type FullDailyVerse,
  type HolidayVerse,
} from '../services/dailyVersesService';
import { BUNDLED_COVERAGE_DAYS } from '../constants/dailyVersesBundled';
import { holidayIdForYmd } from '../constants/holidayCalendar';
import { type LanguageCode } from './TranslationsContext';
import { useUILanguage } from './UILanguageContext';
import { useCurrentDayYmd } from '../hooks/useCurrentDayYmd';

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
  // Daily verses follow the UI LANGUAGE (= device language on first launch
  // via UILanguageContext.detectSystemLanguage), NOT the active Bible
  // translation. Previously this read `useTranslation().current.code`,
  // which conflated the two — a zh-Hans user whose Bible was still on KJV
  // (en) saw the entire Prayer flow (verse text, meditation, action step,
  // closing prayer) in English while the rest of the app was Chinese. The
  // per-language CDN files carry the verse translation AND all devotional
  // content keyed by the same lang code, so a single UI-language switch
  // localizes the whole prayer experience in one go — exactly the
  // "detect the device language, pull that language's verses + content"
  // behavior the product calls for.
  const { lang: uiLang } = useUILanguage();
  const lang = uiLang as LanguageCode;

  // Bundled is the synchronous baseline — always available, no network. The
  // cached/CDN payload replaces it once it loads. Both share the same shape.
  const [verses, setVerses] = useState<FullDailyVerse[]>(() => getBundledDailyVerses(lang));
  const loadedLangRef = useRef<LanguageCode | null>(null);

  // Holiday override set (CDN-only, no bundled fallback — an ordinary day
  // never needs it). Empty until loaded; on a holiday with no entry loaded
  // (offline / first run) we just fall through to the normal daily verse.
  const [holidayVerses, setHolidayVerses] = useState<HolidayVerse[]>([]);

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

  // `todayYmd` ticks when the calendar day rolls over (AppState resume +
  // midnight setTimeout in useCurrentDayYmd). Without it, `todayDay` would
  // memoize on the day the user first launched the app and never update on
  // subsequent days — verses, prayer-bg images, and audio would all stick
  // on yesterday's pick.
  const todayYmd = useCurrentDayYmd();
  const todayDay = useMemo(() => {
    if (!firstLaunch || coverageDays === 0) return 1;
    const elapsed = daysBetween(firstLaunch, todayYmd);
    return (elapsed % coverageDays) + 1;
  }, [firstLaunch, coverageDays, todayYmd]);

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
      } catch (e) {
        // Bundled fallback stays in place — surface the failure so a
        // wrong DAILY_VERSES_VERSION / R2 path or a corrupt cache shows
        // up in `npx expo start` logs instead of silently shipping the
        // 3-day bundled cycle to every device.
        if (__DEV__) console.warn(`[DailyVerses] cache read failed for "${lang}":`, e);
      }
      try {
        const fresh = await fetchAndCacheDailyVerses(lang);
        if (!cancelled && fresh.length > 0) setVerses(fresh);
      } catch (e) {
        // Same as above — most likely cause is the R2 files not being
        // uploaded yet under the current DAILY_VERSES_VERSION path (the
        // CDN URL builds with the version, so a missing /vN/ → 404).
        if (__DEV__) console.warn(`[DailyVerses] CDN fetch failed for "${lang}":`, e);
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);

  // Holiday overrides — same load shape (cache → CDN), per language. Reset on
  // language switch so a stale-language holiday verse never leaks through.
  useEffect(() => {
    let cancelled = false;
    setHolidayVerses([]);
    (async () => {
      try {
        const cached = await getCachedHolidayVerses(lang);
        if (!cancelled && cached && cached.length > 0) setHolidayVerses(cached);
      } catch (e) {
        if (__DEV__) console.warn(`[HolidayVerses] cache read failed for "${lang}":`, e);
      }
      try {
        const fresh = await fetchAndCacheHolidayVerses(lang);
        if (!cancelled && fresh.length > 0) setHolidayVerses(fresh);
      } catch (e) {
        if (__DEV__) console.warn(`[HolidayVerses] CDN fetch failed for "${lang}":`, e);
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);

  // holiday_id for today (null on ordinary days). Drives the override below.
  const todayHolidayId = useMemo(() => holidayIdForYmd(todayYmd), [todayYmd]);

  const getVerse = useCallback(
    (day: number, segment: 'morning' | 'evening'): FullDailyVerse | null => {
      // Holiday override: ONLY for today's reading, and only when the matching
      // holiday verse for this segment is loaded. Replaces the normal cycle
      // verse + its meditation/action/prayer entirely.
      if (day === todayDay && todayHolidayId) {
        const h = holidayVerses.find(v => v.holidayId === todayHolidayId && v.segment === segment);
        if (h) return h;
      }
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
    [verses, coverageDays, holidayVerses, todayHolidayId, todayDay],
  );

  const value = useMemo<DailyVersesState>(() => ({ getVerse, todayDay }), [getVerse, todayDay]);
  return <DailyVersesContext.Provider value={value}>{children}</DailyVersesContext.Provider>;
}

export function useDailyVerses() {
  const ctx = useContext(DailyVersesContext);
  if (!ctx) throw new Error('useDailyVerses must be used inside DailyVersesProvider');
  return ctx;
}
