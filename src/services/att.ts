// App Tracking Transparency — requested ON ITS OWN, early, and independently of
// the ad stack.
//
// Why this exists as a separate module. ATT used to live inside initAds(), after
// an AsyncStorage read, the UMP consent flow, and a `if (adsRemoved) return`
// short-circuit — and initAds itself is fired lazily off runAfterInteractions.
// App Review (Guideline 5.1.2(i), 2026-07-17) never saw the prompt: the privacy
// label declares tracking (IDFA + advertising data), but the request was buried
// so deep it could be delayed indefinitely or skipped entirely. Apple requires
// the prompt to appear BEFORE tracking; burying it behind the consent flow is a
// rejection.
//
// So the request is now hoisted to app root and fired as soon as the UI is
// interactive, gated on nothing but the platform and one-shot-ness. AdMob still
// reads the resolved status afterwards (initAds awaits ensureAttRequested), so
// personalized vs non-personalized serving is unchanged — we've only moved WHEN
// the human is asked, not what happens with the answer.
//
// Android has no ATT; this is a no-op there.

import { Platform } from 'react-native';

// Guarded require (matches services/ads.ts): a dev client built before the
// module was added must not crash at import.
let requestPermission: null | (() => Promise<{ status: string }>) = null;
let getPermission: null | (() => Promise<{ status: string }>) = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const att = require('expo-tracking-transparency');
  requestPermission = att.requestTrackingPermissionsAsync;
  getPermission = att.getTrackingPermissionsAsync;
} catch {
  /* module absent in this build → treated as "not determinable", never blocks */
}

// The system prompt can only ever be shown once per install; asking again just
// returns the existing status. We still latch so we never even call twice.
let requested = false;
let inFlight: Promise<string> | null = null;

/** Fire the ATT prompt if it hasn't been shown yet. Resolves to the status
 *  string ('authorized' | 'denied' | 'restricted' | 'undetermined' | 'unavailable').
 *  Idempotent and safe to await from several call sites — concurrent callers
 *  share the one in-flight request. Never throws. */
export async function ensureAttRequested(): Promise<string> {
  if (Platform.OS !== 'ios' || !requestPermission) return 'unavailable';
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // If iOS already has a decision (re-install with a system that remembered,
      // or a prior launch), don't re-show — just read it.
      if (getPermission) {
        const cur = await getPermission();
        if (cur?.status && cur.status !== 'undetermined') { requested = true; return cur.status; }
      }
      const res = await requestPermission();
      requested = true;
      return res?.status ?? 'undetermined';
    } catch {
      return 'undetermined';
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function attAlreadyRequested(): boolean {
  return requested;
}
