import AsyncStorage from '@react-native-async-storage/async-storage';

// The notification tap stashed by index.ts's notifee background handler (body
// tap or PRAY action while the app is killed/backgrounded) and drained by
// DeepLinkHandler on the next foreground. Only prayer-bound slots are ever
// stashed, so "a stash exists" means "this resume is routing into the prayer
// flow". Lives here — not in DeepLinkHandler — because the ad layer must ask
// that question without importing a navigation component.
export const PENDING_ROUTE_KEY = 'notif:pendingRoute';

/** The raw stashed payload, or null. Never throws. */
export async function peekPendingRoute(): Promise<string | null> {
  try { return await AsyncStorage.getItem(PENDING_ROUTE_KEY); } catch { return null; }
}
