import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { WIDGET_VERSE_KEY, VERSE_WIDGET_NAMES, buildVerseWidgetElement, type WidgetVerseCache } from './widget-task-handler';

// Persists today's verse payload and refreshes any pinned widget instance so
// it reflects the latest content immediately (rather than waiting for the OS's
// 6-hour periodic tick). Android-only and fully swallowed — widget sync must
// never surface an error into the app. No-ops on iOS.
//
// We push the same payload to every registered size variant
// (verseOfDay / verseOfDayWide / verseOfDaySmall) — requestWidgetUpdate is a
// no-op if no instance of that size is pinned, so this is safe to call for
// all three on every refresh.
export async function syncVerseWidget(cache: WidgetVerseCache): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await AsyncStorage.setItem(WIDGET_VERSE_KEY, JSON.stringify(cache));
  } catch {}
  await Promise.all(
    VERSE_WIDGET_NAMES.map(async (widgetName) => {
      try {
        await requestWidgetUpdate({
          widgetName,
          renderWidget: (info) => buildVerseWidgetElement(cache, { width: info.width, height: info.height }),
        });
      } catch {}
    }),
  );
}
