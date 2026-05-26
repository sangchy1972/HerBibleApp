import { useEffect } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// Configures foreground-notification behaviour + handles taps on:
//   • Local notifications scheduled by NotificationsContext
//     (morning/evening prayer reminders, plan reminders).
//   • Deep-link URLs from the home-screen widget
//     (herbible://verse-of-day etc.).
//
// Mounted INSIDE <NavigationContainer> so we can call `navigate()` from
// either handler. Returns null — it's a side-effect-only component.

// Show notifications as banners even when the app is in the foreground.
// Without this, foreground notifications are silently dropped (Expo
// defaults to "show: false"). The user explicitly opted into reminders;
// they should see them regardless of app state.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

// Map a notification's `data.slot` (set in buildScheduleRequest) to the
// right destination screen. Morning/night both go to PrayerFlow because
// that's the screen the reminder is about; plan reminders go to the Plan
// tab. Unknown slots fall through to the home tabs (safer than crashing).
function routeForSlot(slot: unknown): { screen: keyof RootStackParamList; params?: object } | null {
  if (slot === 'morning' || slot === 'night') {
    return { screen: 'PrayerFlow' };
  }
  if (slot === 'plan') {
    return { screen: 'Tabs' };
  }
  return null;
}

// Map a deep-link URL path to a destination. Currently widget taps emit
// `herbible://verse-of-day`. Future widgets can add more paths here
// without touching the navigator config.
function routeForUrl(url: string): { screen: keyof RootStackParamList; params?: object } | null {
  try {
    // Parse manually — URL constructor doesn't accept custom schemes on RN.
    const path = url.replace(/^herbible:\/\//, '').split(/[?#]/)[0];
    if (path === 'verse-of-day' || path === '') {
      return { screen: 'Tabs' };
    }
    if (path === 'prayer') {
      return { screen: 'PrayerFlow' };
    }
    if (path.startsWith('plan')) {
      return { screen: 'Tabs' };
    }
  } catch {
    return null;
  }
  return null;
}

export default function DeepLinkHandler() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // Handle notification taps — both the warm path (app already running)
  // and the cold path (app was killed; tap launches it). Expo exposes
  // both via the same listener: a tap fires the listener immediately if
  // the app launched, and the *last* response is replayed via
  // getLastNotificationResponseAsync on cold start so we never miss it.
  useEffect(() => {
    let mounted = true;

    // Cold start — replay the last notification tap that opened the app.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!mounted || !response) return;
      const slot = response.notification.request.content.data?.slot;
      const dest = routeForSlot(slot);
      if (dest) (navigation.navigate as any)(dest.screen, dest.params);
    }).catch(() => { /* no-op; first launch with no prior notification */ });

    // Warm path — every subsequent tap while the app is alive.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const slot = response.notification.request.content.data?.slot;
      const dest = routeForSlot(slot);
      if (dest) (navigation.navigate as any)(dest.screen, dest.params);
    });

    return () => { mounted = false; sub.remove(); };
  }, [navigation]);

  // Handle deep-link URLs (widget taps, share-back-to-app links, etc.).
  // Same warm/cold split as notifications.
  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL().then((url) => {
      if (!mounted || !url) return;
      const dest = routeForUrl(url);
      if (dest) (navigation.navigate as any)(dest.screen, dest.params);
    }).catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => {
      const dest = routeForUrl(url);
      if (dest) (navigation.navigate as any)(dest.screen, dest.params);
    });

    return () => { mounted = false; sub.remove(); };
  }, [navigation]);

  return null;
}
