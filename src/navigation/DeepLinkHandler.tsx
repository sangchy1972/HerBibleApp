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
//
// IMPORTANT: PrayerFlow REQUIRES a `kind` param ({ kind: 'morning' |
// 'evening' }) — it destructures `route.params.kind` on mount, so
// navigating without params throws and the tap *crashes the app* instead
// of opening the prayer. The notification slot vocabulary is
// 'morning' | 'night', so 'night' must be translated to PrayerFlow's
// 'evening'.
function routeForSlot(slot: unknown): { screen: keyof RootStackParamList; params?: object } | null {
  if (slot === 'morning') {
    return { screen: 'PrayerFlow', params: { kind: 'morning' } };
  }
  if (slot === 'night') {
    return { screen: 'PrayerFlow', params: { kind: 'evening' } };
  }
  if (slot === 'plan') {
    return { screen: 'Tabs' };
  }
  return null;
}

// Time-of-day fallback for entry points with no explicit slot (e.g. the
// home-screen widget's `herbible://prayer` link). Mirrors PrayerContext's
// initial-tab rule: 06:00–17:59 → morning, else evening.
function kindByTime(): 'morning' | 'evening' {
  const hr = new Date().getHours();
  return hr >= 6 && hr < 18 ? 'morning' : 'evening';
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
      // No slot in the URL → pick by time of day (PrayerFlow needs a kind).
      return { screen: 'PrayerFlow', params: { kind: kindByTime() } };
    }
    if (path.startsWith('plan')) {
      return { screen: 'Tabs' };
    }
  } catch {
    return null;
  }
  return null;
}

// Dedup guard for notification-tap routing. `getLastNotificationResponseAsync`
// replays the SAME response for the entire process lifetime, and the response
// listener can also fire for the launching tap — so without a guard a single
// tap could navigate twice, or re-navigate to a stale target on a later
// foreground / component remount. Keyed by the notification identifier + its
// delivery date, so a genuine NEW tap (e.g. the next day's reminder → a
// different delivery date) still routes. Module-scoped so it survives remounts
// within the same app process.
let lastHandledNotifKey: string | null = null;

function notifResponseKey(response: Notifications.NotificationResponse): string {
  const req = response.notification.request;
  // `notification.date` is the delivery timestamp; distinguishes repeat
  // deliveries of the same stable scheduled identifier across days.
  const date = (response.notification as { date?: number }).date ?? '';
  return `${req.identifier}:${date}`;
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

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const key = notifResponseKey(response);
      if (key === lastHandledNotifKey) return; // already routed this exact tap
      lastHandledNotifKey = key;
      const slot = response.notification.request.content.data?.slot;
      const dest = routeForSlot(slot);
      if (dest) (navigation.navigate as any)(dest.screen, dest.params);
    };

    // Cold start — replay the last notification tap that opened the app (once).
    Notifications.getLastNotificationResponseAsync()
      .then((response) => { if (mounted) handle(response); })
      .catch(() => { /* no-op; first launch with no prior notification */ });

    // Warm path — every subsequent tap while the app is alive.
    const sub = Notifications.addNotificationResponseReceivedListener(handle);

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
