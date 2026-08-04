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
// Whether a verse widget is currently ON her home screen. Android exposes no
// API an app can poll for this, but the widget host DOES deliver lifecycle
// actions to this handler — so we record them and let the in-app nudge read the
// flag. WIDGET_ADDED/UPDATE prove one exists; WIDGET_DELETED only tells us THAT
// instance went away, and she may still have another, so a delete leaves the
// flag alone rather than claiming she has none (re-nagging someone who kept a
// widget is worse than staying quiet).
export const WIDGET_PRESENT_KEY = 'widget:present:v1';

interface SegmentVerse { verse: string; reference: string; bg?: string | null }

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
    bgUri: seg?.bg ?? null,
    segment,
    amenLabel: cache.amenLabel ?? null,
    width: info.width,
    height: info.height,
  });
}

// Names of every verse-of-day widget variant registered in app.json. All three
// share the same render path; the per-size layout decisions happen inside
// VerseOfDayWidget based on the widthDp passed via widgetInfo.
export const VERSE_WIDGET_NAMES = ['verseOfDay', 'verseOfDayWide', 'verseOfDaySmall'] as const;

// react-native-android-widget hands us a `renderWidget(jsx)` callback —
// whatever we pass becomes the home-screen layout for that widget instance.
// The native side calls us back on the OS lifecycle events (added, periodic
// update, click, resize, deleted) declared in AndroidManifest.xml's
// intent-filter + widgetprovider_verseofday.xml.
export const widgetTaskHandler = async (props: WidgetTaskHandlerProps): Promise<void> => {
  const { widgetInfo, widgetAction, renderWidget } = props;
  if (!(VERSE_WIDGET_NAMES as readonly string[]).includes(widgetInfo.widgetName)) return;
  if (widgetAction === 'WIDGET_DELETED') return;
  // Any action other than DELETE means a widget instance exists and is being
  // rendered — that is our "she has one" signal.
  try { await AsyncStorage.setItem(WIDGET_PRESENT_KEY, '1'); } catch {}

  const cache = await readCache();
  renderWidget(buildVerseWidgetElement(cache, { width: widgetInfo.width, height: widgetInfo.height }));
};
