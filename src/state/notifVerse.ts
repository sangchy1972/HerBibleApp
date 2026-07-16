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

/** A DIFFERENT verse per banner slot.
 *
 *  todayVerseForNotif returns the day's card verse — there are only two per day
 *  (morning + evening segments). Using it for a recurring banner meant the same
 *  sentence was pushed over and over: the tray filled up with seven identical
 *  copies of John 10:10, which is what a user actually saw and reported. A
 *  reminder that repeats verbatim all day is noise, not scripture.
 *
 *  So the banners walk the whole verse library instead. `slot` is the banner's
 *  index within the day (0, 1, 2 …); the stride below is deliberately coprime
 *  with typical library sizes so consecutive slots land far apart in the list
 *  rather than on neighbouring days' verses.
 *
 *  Deterministic: derived from the install-anchored day index + slot, no state
 *  and no randomness, so a re-sync (settings change, foreground, language
 *  switch) re-schedules the SAME verse for the SAME slot instead of shuffling
 *  what's already in the tray.
 *
 *  Holidays still win — on a holiday every banner shows the holiday verse for
 *  its segment, matching the card. That repetition is intentional and lasts a day.
 */
export async function bannerVerseForSlot(lang: string, slot: number, segment: VerseSegment): Promise<NotifVerse | null> {
  try {
    const todayYmd = ymd(new Date());

    // Holiday override — same rule as the card.
    const holidayId = holidayIdForYmd(todayYmd);
    if (holidayId) {
      const holidays = await getCachedHolidayVerses(lang as never);
      const h = holidays?.find(v => (v as { holidayId?: string }).holidayId === holidayId && (v as { segment?: string }).segment === segment);
      const hv = toVerse(h as never);
      if (hv) return hv;
    }

    const verses = (await getCachedDailyVerses(lang as never)) ?? getBundledDailyVerses(lang as never);
    if (!verses || !verses.length) return null;

    // Pull from the segment's own pool so a morning banner keeps a morning-toned
    // verse; fall back to the whole library if the data has no segments.
    const pool = verses.filter(v => (v as { segment?: string }).segment === segment);
    const list = pool.length ? pool : verses;

    const stored = await AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY);
    const firstLaunch = stored || todayYmd;
    const elapsed = daysBetween(firstLaunch, todayYmd);

    // 7 is coprime with 365/366 and with every plausible pool size that isn't a
    // multiple of 7, so slots spread across the library instead of clustering.
    const idx = (elapsed + slot * 7) % list.length;
    return toVerse(list[idx] as never);
  } catch {
    return null;
  }
}
