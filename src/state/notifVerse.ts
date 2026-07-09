// Resolves TODAY's daily verse (reference + text) for the notifications, fully
// offline. Mirrors DailyVersesContext's install-anchored day cycle so the verse
// shown in a banner matches the verse card in the app.
//
// Source order: the language's CACHED CDN verses (60-day coverage) → the BUNDLED
// verses (always present, 3-day coverage) as the offline baseline. Holiday
// overrides are intentionally skipped here — a banner showing the ordinary daily
// verse on a holiday is fine and keeps this dependency-light + crash-proof.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedDailyVerses, getBundledDailyVerses } from '../services/dailyVersesService';

// Must match DailyVersesContext.FIRST_LAUNCH_DATE_KEY.
const FIRST_LAUNCH_DATE_KEY = 'daily-verses:first-launch-date';

export interface NotifVerse {
  reference: string;   // e.g. "Philippians 4:6-7" (already localized per-language file)
  text: string;        // the verse text (modern translation)
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Byte-identical to DailyVersesContext.daysBetween (local-midnight diff, floored
// at 0) so the notification lands on the SAME day index as the in-app card.
function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + 'T00:00:00');
  const b = new Date(toYmd + 'T00:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/** Today's verse for the given UI language, or null if nothing is available. */
export async function todayVerseForNotif(lang: string): Promise<NotifVerse | null> {
  try {
    const verses = (await getCachedDailyVerses(lang as never)) ?? getBundledDailyVerses(lang as never);
    if (!verses || !verses.length) return null;

    const stored = await AsyncStorage.getItem(FIRST_LAUNCH_DATE_KEY);
    const firstLaunch = stored || ymd(new Date());
    // Coverage = the highest `day` present (bundled=3, CDN=60), matching
    // DailyVersesContext.coverageDays. Cycle the install-elapsed day into range.
    const coverage = verses.reduce((mx, v) => Math.max(mx, v.day), 0) || verses.length;
    const elapsed = daysBetween(firstLaunch, ymd(new Date()));
    const todayDay = (elapsed % coverage) + 1;

    const v = verses.find(x => x.day === todayDay) ?? verses[0];
    const text = (v?.modernText || '').trim();
    if (!text) return null;
    return { reference: v?.reference?.full_reference || '', text };
  } catch {
    return null;
  }
}
