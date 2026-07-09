// Resolves TODAY's daily verse (reference + text) for the notifications, fully
// offline, MATCHING what DailyVersesContext shows in the app:
//   • install-anchored day cycle (same firstLaunch anchor + coverage),
//   • morning/evening SEGMENT (the card shows a different verse per segment),
//   • HOLIDAY override (on a holiday the app replaces the normal verse — so the
//     banner must too, or the notification and the card would disagree).
//
// Source order per dataset: cached CDN verses → bundled verses (offline
// baseline). Everything is guarded so a missing cache never throws.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCachedDailyVerses,
  getBundledDailyVerses,
  getCachedHolidayVerses,
} from '../services/dailyVersesService';
import { holidayIdForYmd } from '../constants/holidayCalendar';

// Must match DailyVersesContext.FIRST_LAUNCH_DATE_KEY.
const FIRST_LAUNCH_DATE_KEY = 'daily-verses:first-launch-date';

export type VerseSegment = 'morning' | 'evening';

export interface NotifVerse {
  reference: string;   // already localized per-language file
  text: string;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Byte-identical to DailyVersesContext.daysBetween so the banner lands on the
// SAME day index as the in-app card.
function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + 'T00:00:00');
  const b = new Date(toYmd + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function toVerse(v: { reference?: { full_reference?: string }; modernText?: string } | null | undefined): NotifVerse | null {
  const text = (v?.modernText || '').trim();
  if (!text) return null;
  return { reference: v?.reference?.full_reference || '', text };
}

/** Today's verse for the given UI language + segment, applying the holiday
 *  override exactly like the app. Returns null if nothing is available. */
export async function todayVerseForNotif(lang: string, segment: VerseSegment = 'morning'): Promise<NotifVerse | null> {
  try {
    const todayYmd = ymd(new Date());

    // 1) Holiday override — calendar-anchored (SAME for every user on that date),
    //    matching DailyVersesContext.getVerse. Only when the holiday verse for
    //    this segment is cached; otherwise fall through to the ordinary cycle.
    const holidayId = holidayIdForYmd(todayYmd);
    if (holidayId) {
      const holidays = await getCachedHolidayVerses(lang as never);
      const h = holidays?.find(v => (v as { holidayId?: string }).holidayId === holidayId && (v as { segment?: string }).segment === segment);
      const hv = toVerse(h as never);
      if (hv) return hv;
    }

    // 2) Ordinary install-anchored daily verse.
    const verses = (await getCachedDailyVerses(lang as never)) ?? getBundledDailyVerses(lang as never);
    if (!verses || !verses.length) return null;
    const stored = await AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY);
    const firstLaunch = stored || todayYmd;
    const coverage = verses.reduce((mx, v) => Math.max(mx, v.day), 0) || verses.length;
    const elapsed = daysBetween(firstLaunch, todayYmd);
    const todayDay = (elapsed % coverage) + 1;

    const bySeg = verses.find(v => v.day === todayDay && (v as { segment?: string }).segment === segment);
    const byDay = verses.find(v => v.day === todayDay);
    return toVerse((bySeg ?? byDay ?? verses[0]) as never);
  } catch {
    return null;
  }
}
