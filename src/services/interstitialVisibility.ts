// Cross-cutting "is a fullscreen interstitial on screen right now?" flag.
//
// Both interstitial systems (ads.ts simple/onboarding path and the US
// waterfall in usInterstitial.ts) report into this module. In-app celebration
// surfaces (the badge unlock popup) read it so their entrance animation plays
// AFTER the user closes the ad — instead of having silently finished
// underneath the native ad overlay.

let visible = false;
const subs = new Set<(v: boolean) => void>();

export function setInterstitialVisible(v: boolean): void {
  if (v === visible) return;
  visible = v;
  subs.forEach(fn => { try { fn(v); } catch { /* listener errors never propagate */ } });
}

export function isInterstitialVisible(): boolean {
  return visible;
}

/** Subscribe to visibility flips. Returns the unsubscribe function. */
export function onInterstitialVisibility(fn: (v: boolean) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
