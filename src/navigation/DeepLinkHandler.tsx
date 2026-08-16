import { useEffect } from 'react';
import { Linking, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { EventType } from '@notifee/react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import { useAuth } from '../state/AuthContext';
import { logEvent } from '../services/firebase';

// `herbible://finishSignIn?<query>` (bounced from everlandapps.com/finishSignIn
// .html, the email magic-link redirect page) → the original https sign-in link
// the Firebase SDK expects, preserving the oobCode/mode query so
// signInWithEmailLink can complete the passwordless sign-in.
function emailLinkFromDeepLink(url: string): string | null {
  const path = url.replace(/^herbible:\/\//, '').split(/[?#]/)[0];
  if (path !== 'finishSignIn') return null;
  const q = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  if (!/oobCode=/.test(q)) return null;
  return `https://everlandapps.com/finishSignIn.html${q}`;
}

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
    if (path === 'quiz') {
      // The overlay quiz card (expo-overlay-cards). The tapped option rides in
      // `?opt=N` for analytics only — the native side already queued the event;
      // the screen runs the real set from its own state.
      return { screen: 'Quiz' };
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

// One-shot guard so the Notifee cold-start replay (getInitialNotification +
// pending route) routes at most once per process, even across remounts.
let notifeeColdStartHandled = false;
const PENDING_ROUTE_KEY = 'notif:pendingRoute';

function notifResponseKey(response: Notifications.NotificationResponse): string {
  const req = response.notification.request;
  // `notification.date` is the delivery timestamp; distinguishes repeat
  // deliveries of the same stable scheduled identifier across days.
  const date = (response.notification as { date?: number }).date ?? '';
  return `${req.identifier}:${date}`;
}

// Route to a destination SAFELY from any state. A warm notification or
// deep-link tap can arrive while a fullScreenModal (PrayerFlow, GospelPsalm,
// PlanDayDone, RemoveAds, AddWidget) is presented; `navigate` across that
// boundary presents the target as a sheet ON TOP of the modal instead of
// dismissing it — the same artifact PlanDayDone had to fix. `reset` rebuilds
// the stack, so the destination is always the only thing on screen, and a
// PrayerFlow target always remounts (so its `kind` param is re-read).
function resetTo(
  navigation: NavigationProp<RootStackParamList>,
  screen: keyof RootStackParamList,
  params?: object,
): void {
  const routes = screen === 'Tabs'
    ? [{ name: 'Tabs' as const, params }]
    : [{ name: 'Tabs' as const }, { name: screen, params }];
  (navigation.reset as any)({ index: routes.length - 1, routes });
}

export default function DeepLinkHandler() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { completeEmailLink } = useAuth();

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
      // notification_tap — normalize 'night' → 'evening' so it joins cleanly
      // with prayer_complete/gospel_psalm_complete in BigQuery.
      logEvent('notification_tap', { slot: slot === 'night' ? 'evening' : String(slot ?? 'unknown') });
      const dest = routeForSlot(slot);
      if (dest) resetTo(navigation, dest.screen, dest.params);
    };

    // Cold start — replay the last notification tap that opened the app (once).
    Notifications.getLastNotificationResponseAsync()
      .then((response) => { if (mounted) handle(response); })
      .catch(() => { /* no-op; first launch with no prior notification */ });

    // Warm path — every subsequent tap while the app is alive.
    const sub = Notifications.addNotificationResponseReceivedListener(handle);

    return () => { mounted = false; sub.remove(); };
  }, [navigation]);

  // Handle taps on the RICH Notifee morning/evening reminders (their own event
  // system, separate from expo's above). Covers three arrival paths:
  //   • warm tap (app alive)              → onForegroundEvent
  //   • cold-start body tap (app killed)  → getInitialNotification
  //   • PRAY action from killed/bg state  → pending route persisted by the
  //     index.ts background handler, drained here
  useEffect(() => {
    let mounted = true;

    const routeSlot = (slot: unknown, src: string) => {
      if (!mounted) return;
      const dest = routeForSlot(slot);
      if (!dest) return;
      logEvent('notification_tap', { slot: slot === 'night' ? 'evening' : String(slot ?? 'unknown'), src });
      resetTo(navigation, dest.screen, dest.params);
    };

    const drainPending = async (src: string) => {
      try {
        const pending = await AsyncStorage.getItem(PENDING_ROUTE_KEY);
        if (!pending) return false;
        await AsyncStorage.removeItem(PENDING_ROUTE_KEY);   // clear BEFORE routing → no double
        const { slot } = JSON.parse(pending);
        routeSlot(slot, src);
        return true;
      } catch { return false; }
    };

    // Cold start (once per process): a persisted PRAY-action route wins; else the
    // Notifee notification that launched the app (body tap).
    if (!notifeeColdStartHandled) {
      notifeeColdStartHandled = true;
      (async () => {
        if (await drainPending('bg_action')) return;
        try {
          const initial = await notifee.getInitialNotification();
          const slot = initial?.notification?.data?.slot;
          if (slot) routeSlot(slot, 'cold');
        } catch { /* no launching notification */ }
      })();
    }

    // Warm taps (body or PRAY action) while the app is alive.
    const unsubFg = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
        const slot = detail.notification?.data?.slot;
        if (slot) routeSlot(slot, 'fg');
      }
    });

    // PRAY action pressed while backgrounded-but-not-killed → the background
    // handler wrote a pending route; drain it when we return to the foreground.
    const appSub = AppState.addEventListener('change', s => {
      if (s === 'active') drainPending('bg_resume');
    });

    return () => { mounted = false; unsubFg(); appSub.remove(); };
  }, [navigation]);

  // Handle deep-link URLs: email magic-link completion, widget taps, etc.
  // Same warm/cold split as notifications.
  useEffect(() => {
    let mounted = true;

    const handleUrl = (url: string | null) => {
      if (!mounted || !url) return;
      // Email magic-link → complete passwordless sign-in (onAuthChanged then
      // flips the app to signed-in). Swallows errors so a stale/expired link
      // can't crash the launch.
      const emailLink = emailLinkFromDeepLink(url);
      if (emailLink) { completeEmailLink(emailLink).catch(() => {}); return; }
      const dest = routeForUrl(url);
      if (dest) resetTo(navigation, dest.screen, dest.params);
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => { mounted = false; sub.remove(); };
  }, [navigation, completeEmailLink]);

  return null;
}
