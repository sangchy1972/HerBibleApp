import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { VerseOfDayWidget } from './VerseOfDayWidget';

// Storage key for the most-recently-known daily verse + reference. Written
// by AddWidgetScreen.onInstall every time the user opens the "Add widget"
// flow, and re-read here every time Android tells our handler to render.
// Keeping a string payload in AsyncStorage is the simplest cross-process
// channel we have — the widget process can read it without needing a
// custom native bridge.
export const WIDGET_VERSE_KEY = 'verse-of-day-widget';

interface CachedVerse { verse?: string | null; reference?: string | null }

async function readCachedVerse(): Promise<CachedVerse> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_VERSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CachedVerse;
    return {
      verse: parsed?.verse ?? null,
      reference: parsed?.reference ?? null,
    };
  } catch {
    return {};
  }
}

// react-native-android-widget hands us a `renderWidget(jsx)` callback —
// whatever we pass becomes the home-screen layout for that widget
// instance. The native side calls us back in response to the OS lifecycle
// events (added, periodic update, click, resize, deleted) declared in
// AndroidManifest.xml's intent-filter + widgetprovider_verseofday.xml.
//
// `cellWidth` / `cellHeight` derive from `widgetInfo.width` / `.height`,
// which arrive in dp. The standard Android grid cell is ~70 dp; we round
// to give the widget JSX a "# of cells" hint so the layout adapts
// (2×2 vs 4×2 vs 5×2) without us having to declare three components.
export const widgetTaskHandler = async (props: WidgetTaskHandlerProps): Promise<void> => {
  const { widgetInfo, widgetAction, renderWidget } = props;
  const widgetName = widgetInfo.widgetName;
  if (widgetName !== 'verseOfDay') return;

  // For every action except DELETED we want to render something — the
  // OS asks us for the layout each time. WIDGET_CLICK is also rendered
  // (it triggers the OPEN_APP intent on the FlexWidget root; we don't
  // need to re-render here but it's harmless and matches the package's
  // recommended pattern).
  if (widgetAction === 'WIDGET_DELETED') return;

  const cached = await readCachedVerse();
  const cellWidth  = Math.max(2, Math.round(widgetInfo.width  / 70));
  const cellHeight = Math.max(1, Math.round(widgetInfo.height / 70));

  renderWidget(
    React.createElement(VerseOfDayWidget, {
      verse:     cached.verse     ?? null,
      reference: cached.reference ?? null,
      cellWidth,
      cellHeight,
    }),
  );
};
