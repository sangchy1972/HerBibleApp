import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { VerseOfDayWidget } from './VerseOfDayWidget';

// Storage key for today's verse payload. Written by DailyVersesContext (and
// AddWidgetScreen on pin) whenever today's verse resolves, and re-read here
// every time Android tells our handler to render. AsyncStorage is the simplest
// cross-process channel — the headless widget process can read it without a
// custom native bridge.
export const WIDGET_VERSE_KEY = 'verse-of-day-widget';

interface SegmentVerse { verse: string; reference: string }

// New payload carries BOTH segments + a localized Amen label so the widget can
// switch morning⇄evening by clock without the app re-running, and render in the
// user's language. Legacy single-verse payloads still parse via the fallback.
export interface WidgetVerseCache {
  morning?: SegmentVerse | null;
  evening?: SegmentVerse | null;
  amenLabel?: string | null;
  // legacy shape (pre-redesign) — single verse, no segment.
  verse?: string | null;
  reference?: string | null;
}

// Time-of-day → segment. Per product: after 6 pm show the evening verse; after
// 4 am show the daytime verse. So 04:00–17:59 = morning; 18:00–03:59 = evening
// (the post-midnight hours stay on the evening reading).
export function segmentForHour(hour: number): 'morning' | 'evening' {
  return hour >= 18 || hour < 4 ? 'evening' : 'morning';
}

async function readCache(): Promise<WidgetVerseCache> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_VERSE_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as WidgetVerseCache) || {};
  } catch {
    return {};
  }
}

// Builds the widget element for the current clock segment from a cache payload.
// Shared by the OS task handler AND the app-side requestWidgetUpdate so both
// paths render identically.
export function buildVerseWidgetElement(
  cache: WidgetVerseCache,
  info: { width: number; height: number },
  now: Date = new Date(),
): React.ReactElement {
  const segment = segmentForHour(now.getHours());
  const seg: SegmentVerse | null =
    cache[segment] ??
    cache[segment === 'evening' ? 'morning' : 'evening'] ??     // other segment if this one's missing
    (cache.verse ? { verse: cache.verse, reference: cache.reference ?? '' } : null);   // legacy

  return React.createElement(VerseOfDayWidget, {
    verse: seg?.verse ?? null,
    reference: seg?.reference ?? null,
    segment,
    amenLabel: cache.amenLabel ?? null,
    width: info.width,
    height: info.height,
  });
}

// react-native-android-widget hands us a `renderWidget(jsx)` callback —
// whatever we pass becomes the home-screen layout for that widget instance.
// The native side calls us back on the OS lifecycle events (added, periodic
// update, click, resize, deleted) declared in AndroidManifest.xml's
// intent-filter + widgetprovider_verseofday.xml.
export const widgetTaskHandler = async (props: WidgetTaskHandlerProps): Promise<void> => {
  const { widgetInfo, widgetAction, renderWidget } = props;
  if (widgetInfo.widgetName !== 'verseOfDay') return;
  if (widgetAction === 'WIDGET_DELETED') return;

  const cache = await readCache();
  renderWidget(buildVerseWidgetElement(cache, { width: widgetInfo.width, height: widgetInfo.height }));
};
