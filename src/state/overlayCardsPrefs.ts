import AsyncStorage from '@react-native-async-storage/async-storage';

// The user-facing master switch for the daily overlay cards (Profile sheet).
// A module-level store rather than a context: exactly two consumers
// (OverlayCardsSync re-syncs on flips, the Profile sheet renders the switch),
// and neither sits near the other in the tree.
//
// Default is ON — the switch exists so she can turn the feature OFF; the real
// opt-in is the "Appear on top" permission itself (owner 2026-08-16: the row's
// primary job is reminding users who never turned it on).
const KEY = 'overlayCards:enabled:v1';

let value: boolean | null = null;                 // null until hydrated
const subs = new Set<() => void>();

/** True once the persisted value has been read (or a set() decided it).
 *  OverlayCardsSync gates configure on this: acting on the optimistic ON
 *  default flashed the foreground-service notification for switched-off
 *  users on every cold start (swarm v1.5.0 review). */
export function isOverlayCardsHydrated(): boolean { return value !== null; }

export function getOverlayCardsEnabled(): boolean {
  return value !== false;                          // null (loading) reads as ON
}

export async function hydrateOverlayCardsEnabled(): Promise<void> {
  if (value !== null) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (value !== null) return;                    // a set() won the race — keep it
    value = raw !== '0';
  } catch { value = true; }
  subs.forEach(f => f());
}

export function setOverlayCardsEnabled(v: boolean): void {
  value = v;
  AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
  subs.forEach(f => f());
}

export function subscribeOverlayCardsEnabled(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
