// MUST be the very first import — patches Hermes's incomplete Intl impl
// with full CLDR locale data for all 7 UI languages before any module
// has a chance to call `toLocaleDateString` or `new Intl.DateTimeFormat`.
// See src/i18n/intlPolyfill.ts for the why.
import './src/i18n/intlPolyfill';

import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import App from './App';
import { widgetTaskHandler } from './widgets/widget-task-handler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);

// Register the Android home-screen widget handler. Android invokes our
// task handler in a headless process when the widget is added, updated
// (every 6 hours per widgetprovider_verseofday.xml), resized, or clicked.
// The handler reads the cached verse from AsyncStorage and renders the
// VerseOfDayWidget JSX into RemoteViews. iOS has no equivalent — widget
// support there would require a separate WidgetKit extension target.
if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}

// Notifee background event handler — runs in a HEADLESS JS context when the user
// taps a rich prayer reminder (or its "PRAY" action) while the app is killed or
// backgrounded. There's no React/navigation tree here, so we persist a pending
// route that DeepLinkHandler drains on the next foreground, then dismiss the
// notification. MUST be registered at the entry (not inside a component) so it
// survives a cold start. The whole body is guarded — a throw here crashes the
// headless task.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  try {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      const slot = detail.notification?.data?.slot;
      if (slot === 'morning' || slot === 'night') {
        await AsyncStorage.setItem('notif:pendingRoute', JSON.stringify({ slot }));
      }
      const id = detail.notification?.id;
      if (id) await notifee.cancelNotification(id).catch(() => {});
    }
  } catch {
    /* headless task must never throw */
  }
});
